/**
 * Trạng thái ván cờ + toàn bộ luật chơi.
 * Module này thuần dữ liệu — không đụng tới Phaser hay DOM.
 */
import {
  BOARD, GROUPS, GROUP_TILES, STATION_RENT, UTILITY_MULT,
  START_MONEY, TOTAL_HOUSES, TOTAL_HOTELS, JAIL_TILE, MAX_JAIL_TURNS,
  GO_SALARY,
} from '../data/board.js';
import { CHANCE, CHEST, Deck } from '../data/cards.js';
import { DEFAULT_EVENT_LEVEL } from '../data/events.js';

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
    /**
     * Túi thẻ: những lá giữ lại dùng sau (vé ra tù, lệnh dỡ nhà, cưỡng chiếm…).
     * Mỗi tấm chỉ ghi nó thuộc bộ nào, lá thứ mấy (`{kind, index}`) — nội dung
     * thẻ là hằng số, máy nào cũng có sẵn, mà nhờ vậy lúc xài còn trả đúng lá
     * ấy về đúng bộ.
     * @type {Array<{kind:string,index:number}>}
     */
    this.cards = [];
  }
}

export class GameState {
  /**
   * @param {string[]} names
   * @param {number[]|null} [tokenIndexes] màu quân của từng người. Bản online
   *   chỉ định màu ngay lúc vào phòng chờ, mà ghế có thể trống ở giữa (người ta
   *   ra vào), nên thứ tự người chơi không còn trùng với thứ tự màu. Bỏ trống
   *   thì mỗi người lấy màu theo đúng chỗ ngồi như bản một máy.
   * @param {{events?:string}} [settings] luật tuỳ chọn của ván — hiện chỉ có
   *   nấc thẻ Thời Cuộc, do chủ phòng chốt trước khi khai cuộc.
   */
  constructor(names, tokenIndexes = null, settings = null) {
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
    /**
     * Số thứ tự ảnh chụp, tăng một nấc mỗi lần người cầm lái phát đi.
     *
     * Bản online cần nó vì đường truyền **không giữ đúng thứ tự**: một phiên
     * đấu giá phát bảy tám ảnh chụp trong vài giây, hai ảnh cuối cách nhau chưa
     * tới một mili giây, và máy bên kia có lúc nhận ảnh sau trước ảnh trước.
     * Không có con số này thì ảnh cũ đè lên ảnh mới, ván lùi lại một nước —
     * xem `Game.onSync`.
     */
    this.rev = 0;
    /**
     * Thứ tự đi, ghi bằng số ghế — kết quả của màn lắc giành quyền đi trước.
     * `null` nghĩa là chưa bốc thăm; lúc ấy tạm hiểu là đi theo thứ tự ghế.
     */
    this.order = null;

    /* ------------------------------------------------------ thẻ Thời Cuộc */

    /** Luật tuỳ chọn — chốt lúc khai cuộc, cả ván không đổi nữa. */
    this.settings = { events: DEFAULT_EVENT_LEVEL, ...(settings ?? {}) };
    /** Thanh áp lực: đầy tới ngưỡng thì nổ một sự kiện. */
    this.pressure = 0;
    /** Đã nổ mấy lần — ngưỡng hạ dần theo con số này, và Kỳ 2 mở theo nó. */
    this.eventsFired = 0;
    /** Tổng số lần cả bàn đi ngang ô Bắt Đầu. */
    this.laps = 0;
    /** Quỹ Công: tiền sưu thuế nằm giữa bàn, ai ghé Bến Đậu thì ẵm trọn. */
    this.pot = 0;
    /**
     * Lượt đang chơi chưa có đồng nào đổi chủ.
     *
     * Đây chính là triệu chứng của thế bí cuối ván — đất bán hết, không ai
     * chịu đổi chác, mỗi lượt chỉ lắc xí ngầu đi vòng vòng. Lượt "khô" như vậy
     * đẩy thanh áp lực nhanh hơn lượt có tiền chảy.
     */
    this.dryTurn = true;
    /**
     * Hiệu ứng đang có hiệu lực, mỗi cái đếm ngược bằng **số lượt** (`turns`),
     * `-1` là vĩnh viễn. @type {Array<object>}
     */
    this.mods = [];
    /** Chồng thẻ Thời Cuộc đã xáo, tách theo kỳ. */
    this.eventPiles = { 1: [], 2: [] };
  }

  // ------------------------------------------------- hiệu ứng đang hiệu lực

  addMod(mod) {
    // Cùng một hiệu ứng chồng lên nhau thì gia hạn, không nhân đôi sức mạnh
    const old = this.mods.findIndex((m) => m.id === mod.id);
    if (old >= 0) this.mods[old] = { ...mod, turns: Math.max(this.mods[old].turns, mod.turns) };
    else this.mods.push({ ...mod });
  }

  hasMod(type) { return this.mods.some((m) => m.type === type); }

  /** Tích các hệ số cùng loại — hai thẻ tăng giá thuê thì nhân dồn. */
  modMult(type, match = null) {
    return this.mods.reduce((k, m) => (
      m.type === type && (!match || match(m)) ? k * (m.mult ?? 1) : k), 1);
  }

  /** Hệ số tiền thuê đang áp lên một ô: lạm phát toàn bàn × đường mới mở. */
  rentMult(tileId) {
    const group = BOARD[tileId].color_group;
    return this.modMult('rent') * this.modMult('group-rent', (m) => m.group === group);
  }

  /** Ô đang bị treo giấy tờ — chủ vẫn giữ đất nhưng không thu được tiền thuê. */
  isFrozen(tileId) {
    return this.mods.some((m) => m.type === 'frozen' && m.tiles.includes(tileId));
  }

  /** Giá xây một căn ở ô này, đã tính bão giá vật liệu. */
  buildCost(tileId) {
    return Math.ceil(BOARD[tileId].house_cost * this.modMult('build'));
  }

  /** Lương lãnh khi qua ô Bắt Đầu, đã tính mất mùa. */
  salary() { return Math.round(GO_SALARY * this.modMult('salary')); }

  /** Đếm ngược mọi hiệu ứng một lượt, bỏ những cái đã hết hạn. */
  tickMods() {
    this.mods = this.mods
      .map((m) => (m.turns < 0 ? m : { ...m, turns: m.turns - 1 }))
      .filter((m) => m.turns !== 0);
  }

  // ---------------------------------------------------------- truy vấn

  get current() { return this.players[this.turn]; }

  alive() { return this.players.filter((p) => !p.bankrupt); }

  /** Thứ tự đi thật sự — chưa bốc thăm thì cứ theo thứ tự ghế. */
  get playOrder() { return this.order ?? this.players.map((_, i) => i); }

  /** Chốt thứ tự đi sau màn lắc giành quyền, và trao lượt cho người đầu bảng. */
  setOrder(seats) {
    this.order = [...seats];
    this.turn = this.order[0];
  }

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
    // Giấy tờ thất lạc thì chủ đất chưa đòi tiền ai được, y như đang thế chấp.
    if (ownerId === undefined || this.isMortgaged(tileId) || this.isFrozen(tileId)) return 0;

    const k = this.rentMult(tileId);
    if (t.type === 'station') {
      return Math.round(STATION_RENT[this.stationCount(ownerId)] * k);
    }
    if (t.type === 'utility') {
      return Math.round(diceSum * UTILITY_MULT[this.utilityCount(ownerId)] * k);
    }
    if (t.type === 'property') {
      const h = this.housesOn(tileId);
      // Đủ bộ màu mà chưa xây nhà → giá thuê gấp đôi.
      const base = h > 0
        ? t.rents[h]
        : (this.hasFullGroup(ownerId, t.color_group) ? t.rents[0] * 2 : t.rents[0]);
      return Math.round(base * k);
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
    if (this.hasMod('freeze-build')) return { ok: false, reason: 'Đang giới nghiêm — thợ thuyền nghỉ hết.' };
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

    const cost = this.buildCost(tileId);
    if (this.players[playerId].money < cost) return { ok: false, reason: 'Không đủ tiền.' };

    return { ok: true, isHotel, cost };
  }

  /** Xây 1 nhà, hoặc lên khách sạn (trả lại 4 căn nhà cho ngân hàng). */
  build(playerId, tileId) {
    const check = this.canBuild(playerId, tileId);
    if (!check.ok) return check;
    this.players[playerId].money -= check.cost;
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

  /**
   * Hạ một cấp nhà **không đền bù** — thiên tai, cưỡng chế dỡ nhà.
   *
   * Vật liệu trả hết về kho ngân hàng. Khách sạn hạ xuống bốn căn nhà; kho
   * không đủ bốn căn thì mất trắng — nhà đã dỡ rồi thì không mượn đâu ra được.
   *
   * Cố ý **không** giữ luật xây đều tay: bộ màu bị dỡ lệch một ô là chuyện
   * thường sau tai hoạ, và luật xây (`canBuild` lấy theo ô thấp nhất) tự lo
   * việc san bằng lại khi chủ đất muốn cất lên.
   */
  demolish(tileId) {
    const cur = this.housesOn(tileId);
    if (cur === 0) return 0;
    if (cur === 5) {
      this.bankHotels += 1;
      if (this.bankHouses >= 4) { this.houses.set(tileId, 4); this.bankHouses -= 4; }
      else this.houses.delete(tileId);
      return 1;
    }
    this.bankHouses += 1;
    if (cur === 1) this.houses.delete(tileId);
    else this.houses.set(tileId, cur - 1);
    return 1;
  }

  /** Dỡ sạch nhà cửa trên một ô, trả về số **cấp** đã dỡ (khách sạn tính 5). */
  clearHouses(tileId) {
    const levels = this.housesOn(tileId) === 5 ? 5 : this.housesOn(tileId);
    while (this.housesOn(tileId) > 0) this.demolish(tileId);
    return levels;
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

  // ------------------------------------------------------------- túi thẻ

  /** Cất một lá vào túi: lá ấy ra khỏi bộ cho tới khi có người xài. */
  takeCard(playerId, kind, index) {
    this.decks[kind].take(index);
    this.players[playerId].cards.push({ kind, index });
  }

  /**
   * Rút một tấm khỏi túi (xài, hoặc trả lại khi vỡ nợ) — lá bài về lại bộ,
   * chen vào một chỗ ngẫu nhiên trong chồng.
   *
   * @param {number} playerId
   * @param {number} [at] vị trí trong túi, bỏ trống thì lấy tấm cuối
   * @returns {?{kind:string,index:number}} tấm vừa rời tay
   */
  dropCard(playerId, at = -1) {
    const bag = this.players[playerId].cards;
    const i = at < 0 ? bag.length - 1 : at;
    const [ref] = bag.splice(i, 1);
    if (!ref) return null;
    this.decks[ref.kind]?.give(ref.index);
    return ref;
  }

  /** Vị trí tấm vé ra tù đầu tiên trong túi, `-1` nếu không có tấm nào. */
  jailCardAt(playerId) {
    return this.players[playerId].cards
      .findIndex((ref) => this.decks[ref.kind]?.cards[ref.index]?.type === 'jail-free');
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
    // Thẻ còn trong túi người vỡ nợ thì trả về bộ, đừng chôn theo họ
    while (p.cards.length) this.dropCard(playerId);
    p.money = 0;
    p.bankrupt = true;
    p.inJail = false;
  }

  /**
   * Chuyển lượt cho người chơi còn sống kế tiếp **theo thứ tự đã bốc thăm**,
   * chứ không theo số ghế: ghế là chỗ ngồi, thứ tự đi là kết quả lắc xí ngầu
   * lúc khai cuộc.
   */
  nextTurn() {
    this.tickMods();
    // Lượt mới bắt đầu ở thế "chưa có đồng nào đổi chủ"
    this.dryTurn = true;
    const ord = this.playOrder;
    const at = Math.max(0, ord.indexOf(this.turn));
    for (let i = 1; i <= ord.length; i++) {
      const idx = ord[(at + i) % ord.length];
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

/**
 * Xếp thứ tự đi từ kết quả lắc giành quyền: cao nhất đi đầu.
 *
 * Hoà nhau thì bốc thăm **giữa đúng những người hoà** — mỗi người mang sẵn một
 * số ngẫu nhiên làm khoá phụ, nên chỉ các nhóm cùng điểm mới bị xáo, còn thứ
 * bậc giữa các mức điểm khác nhau vẫn nguyên.
 *
 * @param {Array<{seat:number,sum:number}>} rolls
 * @returns {number[]} danh sách số ghế theo thứ tự đi
 */
export function orderFromRolls(rolls) {
  return rolls
    .map((r) => ({ seat: r.seat, sum: r.sum, tie: Math.random() }))
    .sort((a, b) => b.sum - a.sum || a.tie - b.tie)
    .map((r) => r.seat);
}

/** Lắc 2 xí ngầu. */
export function rollDice() {
  const a = 1 + Math.floor(Math.random() * 6);
  const b = 1 + Math.floor(Math.random() * 6);
  return { a, b, sum: a + b, isDouble: a === b };
}
