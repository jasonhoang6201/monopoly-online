/**
 * Trạng thái ván cờ + toàn bộ luật chơi.
 * Module này thuần dữ liệu — không đụng tới Phaser hay DOM.
 */
import {
  BOARD, GROUPS, GROUP_TILES, STATION_RENT, UTILITY_MULT,
  START_MONEY, TOTAL_HOUSES, TOTAL_HOTELS, JAIL_TILE, MAX_JAIL_TURNS,
} from '../data/board.js';
import { CHANCE, CHEST, Deck } from '../data/cards.js';

/**
 * Sáu quân cờ — chỉ phân biệt bằng MÀU, không mang biểu tượng riêng.
 * Sắc lấy từ hộp sơn mài: son, thếp vàng, ngọc, chàm, tím Huế và men lam.
 *
 * Sáu sắc rải đều vòng sắc độ (5° · 38° · 152° · 186° · 224° · 285°) nên không
 * hai quân nào lẫn nhau, kể cả khi màu ấy bị pha loãng thành nước phủ trên ô.
 * Chỗ thứ sáu trước là *mun đen* — sắc gần trung tính ấy phủ lên mặt ô chỉ ra
 * một vệt xám bẩn, khó nói là đất của ai; men lam sáng thì phủ tới đâu rõ tới đó.
 */
export const TOKENS = [
  { key: 'son',   name: 'Son đỏ',    color: 0xC0392B, css: '#C0392B' },
  { key: 'kim',   name: 'Hoàng kim', color: 0xD4A24C, css: '#D4A24C' },
  { key: 'bich',  name: 'Ngọc bích', color: 0x2E9E70, css: '#2E9E70' },
  { key: 'lam',   name: 'Chàm lam',  color: 0x4A6FC4, css: '#4A6FC4' },
  { key: 'tia',   name: 'Tím Huế',   color: 0x8B5AA8, css: '#8B5AA8' },
  { key: 'men',   name: 'Men lam',   color: 0x2FB8C6, css: '#2FB8C6' },
];

/** Số người chơi tối đa — bằng số quân cờ và số chỗ đứng trên một ô. */
export const MAX_PLAYERS = TOKENS.length;

export class Player {
  constructor(id, name, tokenIndex) {
    this.id = id;
    this.name = name;
    this.token = TOKENS[tokenIndex];
    this.money = START_MONEY;
    this.pos = 0;
    this.inJail = false;
    this.jailTurns = 0;
    this.bankrupt = false;
    /** Số lần đổ đôi liên tiếp trong lượt hiện tại. */
    this.doubles = 0;
  }
}

export class GameState {
  /**
   * @param {string[]} names
   * @param {number[]|null} [tokenIndexes] màu quân của từng người. Bản online
   *   chỉ định màu ngay lúc vào phòng chờ, mà ghế có thể trống ở giữa (người ta
   *   ra vào), nên thứ tự người chơi không còn trùng với thứ tự màu. Bỏ trống
   *   thì mỗi người lấy màu theo đúng chỗ ngồi như bản một máy.
   */
  constructor(names, tokenIndexes = null) {
    this.players = names.map((n, i) => new Player(i, n, tokenIndexes ? tokenIndexes[i] : i));
    this.turn = 0;
    /** tileId → playerId */
    this.owner = new Map();
    /** tileId → 0..4 nhà, 5 = khách sạn */
    this.houses = new Map();
    /** tileId đang thế chấp */
    this.mortgaged = new Set();
    /** Kho nhà của ngân hàng — cả bàn chỉ có 32 căn. */
    this.bankHouses = TOTAL_HOUSES;
    this.bankHotels = TOTAL_HOTELS;
    this.decks = {
      chance: new Deck(CHANCE, 'chance'),
      chest: new Deck(CHEST, 'chest'),
    };
    /** Đặt true khi ván đã kết thúc. */
    this.over = false;
  }

  // ---------------------------------------------------------- truy vấn

  get current() { return this.players[this.turn]; }

  alive() { return this.players.filter((p) => !p.bankrupt); }

  ownerOf(tileId) {
    const id = this.owner.get(tileId);
    return id === undefined ? null : this.players[id];
  }

  housesOn(tileId) { return this.houses.get(tileId) ?? 0; }
  isMortgaged(tileId) { return this.mortgaged.has(tileId); }

  /** Danh sách tileId mà người chơi đang sở hữu. */
  propertiesOf(playerId) {
    const out = [];
    for (const [tileId, owner] of this.owner) if (owner === playerId) out.push(tileId);
    return out.sort((a, b) => a - b);
  }

  /** Người chơi có đủ cả nhóm màu không (điều kiện xây nhà). */
  hasFullGroup(playerId, group) {
    const ids = GROUP_TILES[group];
    return ids.length > 0 && ids.every((id) => this.owner.get(id) === playerId);
  }

  /** Số nhà ga người chơi đang sở hữu. */
  stationCount(playerId) {
    return BOARD.filter((t) => t.type === 'station' && this.owner.get(t.id) === playerId).length;
  }

  utilityCount(playerId) {
    return BOARD.filter((t) => t.type === 'utility' && this.owner.get(t.id) === playerId).length;
  }

  /** Tổng giá trị tài sản — dùng để xếp hạng khi kết thúc ván. */
  netWorth(playerId) {
    let total = this.players[playerId].money;
    for (const id of this.propertiesOf(playerId)) {
      const t = BOARD[id];
      total += this.isMortgaged(id) ? t.mortgage : t.price;
      // Bến/nhà ga và ô công ích không có `house_cost`; nhân vào sẽ ra NaN.
      if (t.type !== 'property') continue;
      const h = this.housesOn(id);
      total += t.house_cost * (h === 5 ? 5 : h);
    }
    return total;
  }

  /**
   * Số tiền tối đa người chơi có thể xoay được: tiền mặt + bán hết nhà
   * (nửa giá xây) + thế chấp toàn bộ đất chưa cầm cố.
   * Dùng để biết một khoản phải trả có nằm ngoài khả năng chi trả không.
   */
  liquidValue(playerId) {
    let total = this.players[playerId].money;
    for (const id of this.propertiesOf(playerId)) {
      const t = BOARD[id];
      if (t.type === 'property') {
        const h = this.housesOn(id);
        total += Math.floor(t.house_cost / 2) * (h === 5 ? 5 : h);
      }
      if (!this.isMortgaged(id)) total += t.mortgage;
    }
    return total;
  }

  // ---------------------------------------------------------- tiền thuê

  /**
   * Tiền thuê phải trả khi dừng ở `tileId`.
   * Đất đang thế chấp thì không thu tiền thuê.
   */
  rentFor(tileId, diceSum) {
    const t = BOARD[tileId];
    const ownerId = this.owner.get(tileId);
    if (ownerId === undefined || this.isMortgaged(tileId)) return 0;

    if (t.type === 'station') {
      return STATION_RENT[this.stationCount(ownerId)];
    }
    if (t.type === 'utility') {
      return diceSum * UTILITY_MULT[this.utilityCount(ownerId)];
    }
    if (t.type === 'property') {
      const h = this.housesOn(tileId);
      if (h > 0) return t.rents[h];
      // Đủ bộ màu mà chưa xây nhà → giá thuê gấp đôi.
      return this.hasFullGroup(ownerId, t.color_group) ? t.rents[0] * 2 : t.rents[0];
    }
    return 0;
  }

  // ---------------------------------------------------------- xây nhà

  /**
   * Có được xây thêm 1 nhà (hoặc lên khách sạn) trên ô này không?
   * Trả về { ok, reason, isHotel, cost }.
   */
  canBuild(playerId, tileId) {
    const t = BOARD[tileId];
    if (t.type !== 'property') return { ok: false, reason: 'Chỉ đất mới xây được nhà.' };
    if (this.owner.get(tileId) !== playerId) return { ok: false, reason: 'Không phải đất của bạn.' };
    if (!this.hasFullGroup(playerId, t.color_group)) {
      return { ok: false, reason: `Cần đủ bộ ${GROUPS[t.color_group].name}.` };
    }
    // Không xây được trên nhóm có ô đang thế chấp.
    if (GROUP_TILES[t.color_group].some((id) => this.isMortgaged(id))) {
      return { ok: false, reason: 'Trong bộ còn ô đang thế chấp.' };
    }

    const cur = this.housesOn(tileId);
    if (cur >= 5) return { ok: false, reason: 'Đã có khách sạn.' };

    // Xây đều tay: không ô nào được hơn ô khác cùng bộ quá 1 căn.
    const min = Math.min(...GROUP_TILES[t.color_group].map((id) => this.housesOn(id)));
    if (cur > min) return { ok: false, reason: 'Phải xây đều các ô trong bộ.' };

    const isHotel = cur === 4;
    if (isHotel) {
      if (this.bankHotels <= 0) return { ok: false, reason: 'Ngân hàng hết khách sạn.' };
    } else if (this.bankHouses <= 0) {
      return { ok: false, reason: 'Ngân hàng đã hết nhà (32 căn).' };
    }

    const cost = t.house_cost;
    if (this.players[playerId].money < cost) return { ok: false, reason: 'Không đủ tiền.' };

    return { ok: true, isHotel, cost };
  }

  /** Xây 1 nhà, hoặc lên khách sạn (trả lại 4 căn nhà cho ngân hàng). */
  build(playerId, tileId) {
    const check = this.canBuild(playerId, tileId);
    if (!check.ok) return check;
    const t = BOARD[tileId];
    this.players[playerId].money -= t.house_cost;
    if (check.isHotel) {
      this.houses.set(tileId, 5);
      this.bankHouses += 4;   // trả 4 căn nhà về kho
      this.bankHotels -= 1;
    } else {
      this.houses.set(tileId, this.housesOn(tileId) + 1);
      this.bankHouses -= 1;
    }
    return check;
  }

  /** Có bán lại được 1 cấp nhà không? */
  canSellHouse(playerId, tileId) {
    if (this.owner.get(tileId) !== playerId) return { ok: false, reason: 'Không phải đất của bạn.' };
    const cur = this.housesOn(tileId);
    if (cur === 0) return { ok: false, reason: 'Chưa có nhà để bán.' };
    const t = BOARD[tileId];
    // Hạ khách sạn cần đủ 4 căn nhà trong kho để đổi lại.
    if (cur === 5 && this.bankHouses < 4) {
      return { ok: false, reason: 'Ngân hàng không đủ 4 căn nhà để đổi.' };
    }
    // Phá đều tay.
    const max = Math.max(...GROUP_TILES[t.color_group].map((id) => this.housesOn(id)));
    if (cur < max) return { ok: false, reason: 'Phải bán đều các ô trong bộ.' };
    return { ok: true, refund: Math.floor(t.house_cost / 2) };
  }

  /** Bán 1 cấp nhà lại cho ngân hàng, lấy về nửa giá xây. */
  sellHouse(playerId, tileId) {
    const check = this.canSellHouse(playerId, tileId);
    if (!check.ok) return check;
    const cur = this.housesOn(tileId);
    if (cur === 5) {
      this.houses.set(tileId, 4);
      this.bankHouses -= 4;
      this.bankHotels += 1;
    } else {
      this.houses.set(tileId, cur - 1);
      this.bankHouses += 1;
    }
    this.players[playerId].money += check.refund;
    return check;
  }

  // ---------------------------------------------------------- thế chấp

  canMortgage(playerId, tileId) {
    if (this.owner.get(tileId) !== playerId) return { ok: false, reason: 'Không phải đất của bạn.' };
    if (this.isMortgaged(tileId)) return { ok: false, reason: 'Đã thế chấp rồi.' };
    const t = BOARD[tileId];
    if (t.type === 'property') {
      // Phải phá hết nhà trong cả bộ trước khi thế chấp.
      if (GROUP_TILES[t.color_group].some((id) => this.housesOn(id) > 0)) {
        return { ok: false, reason: 'Phải bán hết nhà trong bộ trước.' };
      }
    }
    return { ok: true, amount: t.mortgage };
  }

  mortgage(playerId, tileId) {
    const check = this.canMortgage(playerId, tileId);
    if (!check.ok) return check;
    this.mortgaged.add(tileId);
    this.players[playerId].money += check.amount;
    return check;
  }

  /** Chuộc lại: trả tiền thế chấp + 10% lãi. */
  canRedeem(playerId, tileId) {
    if (this.owner.get(tileId) !== playerId) return { ok: false, reason: 'Không phải đất của bạn.' };
    if (!this.isMortgaged(tileId)) return { ok: false, reason: 'Đất không bị thế chấp.' };
    const cost = BOARD[tileId].redeem;
    if (this.players[playerId].money < cost) return { ok: false, reason: 'Không đủ tiền chuộc.' };
    return { ok: true, cost };
  }

  redeem(playerId, tileId) {
    const check = this.canRedeem(playerId, tileId);
    if (!check.ok) return check;
    this.mortgaged.delete(tileId);
    this.players[playerId].money -= check.cost;
    return check;
  }

  // ---------------------------------------------------------- mua bán

  buy(playerId, tileId) {
    const t = BOARD[tileId];
    const p = this.players[playerId];
    if (!t.ownable || this.owner.has(tileId) || p.money < t.price) return false;
    p.money -= t.price;
    this.owner.set(tileId, playerId);
    return true;
  }

  /** Chuyển quyền sở hữu (dùng cho trading). Nhà cửa không đi kèm — luật buộc bán hết trước. */
  transfer(tileId, toPlayerId) {
    this.owner.set(tileId, toPlayerId);
  }

  // ---------------------------------------------------------- tù

  sendToJail(player) {
    player.pos = JAIL_TILE;
    player.inJail = true;
    player.jailTurns = 0;
    player.doubles = 0;
  }

  releaseFromJail(player) {
    player.inJail = false;
    player.jailTurns = 0;
  }

  /** Đã ngồi đủ 3 lượt chưa. */
  jailExpired(player) { return player.jailTurns >= MAX_JAIL_TURNS; }

  // ---------------------------------------------------------- phá sản

  /**
   * Phá sản: mọi tài sản trả hết về ngân hàng (release resources),
   * nhà cửa nhập lại kho chung để người khác mua được.
   */
  bankrupt(playerId) {
    const p = this.players[playerId];
    for (const tileId of this.propertiesOf(playerId)) {
      const h = this.housesOn(tileId);
      if (h === 5) { this.bankHotels += 1; }
      else if (h > 0) { this.bankHouses += h; }
      this.houses.delete(tileId);
      this.owner.delete(tileId);
      this.mortgaged.delete(tileId);
    }
    p.money = 0;
    p.bankrupt = true;
    p.inJail = false;
  }

  /** Chuyển lượt cho người chơi còn sống kế tiếp. */
  nextTurn() {
    const n = this.players.length;
    for (let i = 1; i <= n; i++) {
      const idx = (this.turn + i) % n;
      if (!this.players[idx].bankrupt) { this.turn = idx; return this.players[idx]; }
    }
    return null;
  }

  /** Người thắng khi chỉ còn 1 người trụ lại. */
  winner() {
    const alive = this.alive();
    return alive.length === 1 ? alive[0] : null;
  }
}

/** Lắc 2 xí ngầu. */
export function rollDice() {
  const a = 1 + Math.floor(Math.random() * 6);
  const b = 1 + Math.floor(Math.random() * 6);
  return { a, b, sum: a + b, isDouble: a === b };
}
