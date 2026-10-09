/**
 * Trạng thái ván cờ + toàn bộ luật chơi.
 * Module này thuần dữ liệu — không đụng tới Phaser hay DOM.
 */
import {
  BOARD, GROUPS, GROUP_TILES, STATION_RENT, UTILITY_MULT,
  START_MONEY, TOTAL_HOUSES, TOTAL_HOTELS, JAIL_TILE, MAX_JAIL_TURNS,
  GO_SALARY,
  GO_LANDING_MULT,
} from '../data/board.js';
import { CHANCE, CHEST, Deck } from '../data/cards.js';
import { DEFAULT_EVENT_LEVEL } from '../data/events.js';
import { DEFAULT_THEME, themeKey } from '../data/themes.js';
import { has, param, roll, ownerRentMult, ownerRentFlat, houseImmune, credit, miniRoom, levelOf } from './skills.js';
import { uuid, track } from './telemetry.js';

/**
 * Bảng màu quân — quân cờ chỉ phân biệt bằng MÀU, không mang biểu tượng riêng.
 *
 * Mỗi sắc một vùng riêng trên vòng màu, không có cặp đậm/nhạt của cùng một
 * sắc: bảng cũ 18 màu có lam/thanh thiên/tím sim, ngọc bích/cổ vịt/men lam,
 * son/rượu mận… đứng cạnh nhau trên bàn thì không ai phân biệt được quân của ai.
 *
 * Sáu sắc đầu là màu phát tự động (`#freeToken()` lấy chỉ số nhỏ nhất còn
 * trống): đỏ, vàng, lục, lam, tím, cam — bàn sáu người vẫn ra sáu sắc cách xa
 * nhau. `key` đi vào ảnh chụp ván (serialize.js dò lại màu theo key); key đã
 * bỏ thì ảnh chụp cũ rơi về màu đầu bảng.
 *
 * Không sắc nào rơi vào vùng trung tính: màu quân còn bị pha loãng thành nước
 * phủ trên ô đất, mà xám thì phủ tới đâu cũng chỉ ra một vệt bẩn. Trắng ngà
 * đứng được vì nó sáng hơn hẳn mặt ô, không phải vì nó có sắc.
 *
 * Chủ đề có bàn tối (Halloween) ghi đè `color`/`css` bằng bản sáng hơn — xem
 * `TOKEN_COLORS` trong theme/theme.js. `key` và thứ tự không đổi theo chủ đề.
 */
export const TOKENS = [
  { key: 'son',  name: 'Đỏ son',     color: 0xD23A2E, css: '#D23A2E' },
  { key: 'kim',  name: 'Vàng',       color: 0xE8C12E, css: '#E8C12E' },
  { key: 'bich', name: 'Xanh lá',    color: 0x3FA34D, css: '#3FA34D' },
  { key: 'lam',  name: 'Xanh lam',   color: 0x3D6AD6, css: '#3D6AD6' },
  { key: 'tia',  name: 'Tím',        color: 0x8A4FC9, css: '#8A4FC9' },
  { key: 'cam',  name: 'Cam',        color: 0xEE7F2A, css: '#EE7F2A' },
  { key: 'men',  name: 'Ngọc lam',   color: 0x23B5C4, css: '#23B5C4' },
  { key: 'sen',  name: 'Hồng',       color: 0xE35A9C, css: '#E35A9C' },
  { key: 'nga',  name: 'Trắng ngà',  color: 0xECE2CA, css: '#ECE2CA' },
];

/**
 * Số người chơi tối đa — do số chỗ đứng trên một ô quyết định, **không** phải
 * số màu: bảng màu dài ra là để có cái mà chọn, chứ thêm người thứ bảy thì
 * quân chồng lên nhau ở góc ô và ô Vào Tù không đủ chỗ xếp.
 */
export const MAX_PLAYERS = 6;

/** Cửa thắng sớm — xem `GameState.winCheck`. */
export const WIN_WORTH = 11111;
export const WIN_SETS = 3;
export const WIN_HOTEL_SETS = 2;

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
    /**
     * Thứ tự phá sản: 1 là người vỡ nợ đầu tiên, 0 là còn trụ. Bảng hạ màn
     * xếp hạng người phá sản theo số này — họ không còn đồng nào để so tiền.
     */
    this.outRank = 0;
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

    /* ---- cây kỹ năng (xem data/skills.js) ---- */
    /** Điểm chưa tiêu — +1 mỗi lần qua ô Bắt Đầu. */
    this.skillPoints = 0;
    /** Id các kỹ năng đã học. Mảng chứ không Set để đi thẳng vào ảnh chụp. */
    this.skills = [];
    /** Id các kỹ năng đã học mà đang tắt — học xong nằm ở đây, bật trong lượt mình. */
    this.skillOff = [];
    /** Số lần đã qua ô Bắt Đầu — Thâm Niên và Nhà Lâu Năm tính theo nó. */
    this.laps = 0;
    /** id kỹ năng → số lần qua ô Bắt Đầu còn phải chờ trước khi dùng lại. */
    this.cooldowns = {};
    /**
     * id kỹ năng → `turnNo` mà lần qua ô Bắt Đầu trong lượt đó không trừ thời
     * gian chờ của nó (Chuyến Tàu Xuyên Việt: chuyến tàu đi ngang ô Bắt Đầu).
     */
    this.cdHold = {};
    /** id kỹ năng → số lượt (`GameState.turnNo`) lần cuối đã dùng — cho giới hạn "mỗi lượt 1 lần". */
    this.usedTurn = {};
    /** id kỹ năng → level, chỉ ghi ô từ level 2 trở lên (xem `levelOf`). */
    this.skillLv = {};
    /** id kỹ năng → số lần đã dùng từ lần qua ô Bắt Đầu gần nhất — cho kỹ năng có `charges`. */
    this.lapUses = {};
    /** Số lần đã vào tù — Liên Đoàn Lao Động trừ tỉ lệ theo số này. */
    this.jails = 0;
    /**
     * id kỹ năng → `{n, gain}`: số lần kỹ năng đã chạy và số tiền nó mang về
     * từ lúc học — điều kiện lên level (xem `credit` trong core/skills.js).
     */
    this.skillUse = {};
    /** Số lần đã học / lên level trong ván — không về 0 khi tẩy (số liệu cân bằng). */
    this.learnCount = 0;
    /** Tổng xí ngầu đã chọn cho Xổ Số Kiến Thiết; `null` là chưa chọn. */
    this.lotto = null;
    /** Cửa và tiền Cược Chẵn Lẻ tự đặt mỗi lượt; `null` là chưa chọn. @type {?{pick:string, amount:number}} */
    this.betSet = null;
    /** Ghế người mình đang góp vốn (Góp Vốn); `null` là chưa góp ai. */
    this.stake = null;
    /** Số lượt đã ngồi yên trong lần vào tù này (Ở Tù Cho Lành). */
    this.jailSits = 0;
    /**
     * Ô đang đứng và vòng chơi lúc phá sản; `null` khi còn trụ. Chủ đề
     * Halloween dựng bia mộ khắc tên ngay ô ấy, nên phải ghi lại: quân đã ẩn,
     * mà `pos` còn đổi được nếu ván sau dọn ghế.
     */
    this.outPos = null;
    this.outRound = null;
  }
}

export class GameState {
  /**
   * @param {string[]} names
   * @param {number[]|null} [tokenIndexes] màu quân của từng người. Bản online
   *   chỉ định màu ngay lúc vào phòng chờ, mà ghế có thể trống ở giữa (người ta
   *   ra vào), nên thứ tự người chơi không còn trùng với thứ tự màu. Bỏ trống
   *   thì mỗi người lấy màu theo đúng chỗ ngồi như bản một máy.
   * @param {{events?:string, theme?:string}} [settings] luật tuỳ chọn của
   *   ván: nấc thẻ Thời Cuộc và chủ đề, do chủ phòng chốt trước khi khai cuộc.
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
     * Khoản người-trả-người đang dở dang: `{ from, to, amount }`, `null` là
     * không nợ ai.
     *
     * Nằm trong trạng thái (nên đi theo ảnh chụp) vì máy con nợ có thể tắt
     * ngang giữa lúc đang hỏi họ xoay tiền hay tuyên bố phá sản. Máy khác đọc
     * ảnh chụp mới biết còn ai chưa trả cho ai mà trả thay hoặc đòi tiếp —
     * xem `Game.coverDebt`.
     */
    this.debt = null;
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
    this.settings = { events: DEFAULT_EVENT_LEVEL, theme: DEFAULT_THEME, ...(settings ?? {}) };
    /* Chủ đề quyết định bộ thẻ được rút (Bão Tuyết chỉ có ở Giáng Sinh), nên
       tên lạ phải quy về mặc định ngay ở đây chứ không đợi tới lúc vẽ. */
    this.settings.theme = themeKey(this.settings.theme);
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
    /** Chồng thẻ Thời Cuộc đã xáo — một chồng cho cả bộ. @type {string[]} */
    this.eventPile = [];
    /**
     * Mỗi thẻ Thời Cuộc đã nổ mấy lần: id → số lần. Hai thẻ thuế dồn mức thu
     * theo con số này. @type {Record<string, number>}
     */
    this.eventTally = {};

    /**
     * Ô mang biển Di Sản (kỹ năng Phố Cổ): thuê ×1.5, không bị dỡ hay ép mua.
     * Biển gỡ khi khách sạn trên ô bị hạ. @type {Set<number>}
     */
    this.heritage = new Set();
    /**
     * Đếm lượt từ đầu ván, tăng ở `nextTurn`. Kỹ năng "mỗi lượt 1 lần" đánh dấu
     * bằng con số này thay vì một cờ bật/tắt: `beginTurn` chạy lại nhiều lần
     * trong cùng một lượt (ảnh chụp về, sổ ghế đổi), xoá cờ ở đó là cho dùng lại.
     */
    this.turnNo = 0;
    /**
     * Vòng chơi, bắt đầu từ 1: tăng mỗi khi lượt quay lại người đầu bảng thứ
     * tự đi. Bia mộ chủ đề Halloween khắc số này ("phá sản vòng 14").
     */
    this.round = 1;
    /**
     * Người đang đi đã lắc xong nước chính của lượt, chỉ còn chờ kết thúc lượt.
     *
     * Phải nằm trong trạng thái chứ không ở controller: `beginTurn` chạy lại mỗi
     * lần sổ ghế nhúc nhích hay ảnh chụp về, mà nó bày nút theo cờ này. Cờ chỉ
     * nằm ở controller thì presence chập chờn một nhịp là nút "Lắc xí ngầu" hiện
     * lại cho người đã lắc xong, và họ đi được hai nước trong một lượt.
     */
    this.rolled = false;
    /**
     * Mốc giờ khai cuộc và hạ màn (ms, đồng hồ máy dựng ván). Đi theo ảnh chụp
     * nên người vào lại giữa ván vẫn thấy đúng thời gian đã chơi, không đếm
     * lại từ 0. `endedAt` còn `null` là ván đang chạy.
     */
    this.startedAt = Date.now();
    this.endedAt = null;
    /**
     * Mã ván cho số liệu cân bằng. Sinh ở máy dựng ván rồi đi theo ảnh chụp,
     * để mọi máy từng cầm lái trong ván ghi về cùng một mã.
     */
    this.gameId = uuid();
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

  /** Ô đang bị xác sống chiếm (sự kiện Xác Sống Tràn Phố, chủ đề Halloween). */
  isZombied(tileId) {
    return this.mods.some((m) => m.type === 'zombie' && m.tiles.includes(tileId));
  }

  /** Người này đang bị nguyền (thẻ Bị Nguyền): không thu được tiền thuê của ai. */
  isCursed(seat) {
    return this.mods.some((m) => m.type === 'curse' && m.seat === seat);
  }

  /**
   * Lý do ô này lúc này không thu được tiền thuê, theo ba luật riêng của chủ
   * đề Halloween; `null` là thu như thường. Controller đọc để báo đúng lý do
   * thay vì một dòng "trả 0$".
   * @returns {?'zombie'|'curse'|'blood-moon'}
   */
  rentBlock(tileId) {
    const ownerId = this.owner.get(tileId);
    if (ownerId === undefined) return null;
    if (this.isZombied(tileId)) return 'zombie';
    if (this.isCursed(ownerId)) return 'curse';
    if (this.hasMod('blood-moon') && BOARD[tileId].type === 'property' && this.housesOn(tileId) === 0) {
      return 'blood-moon';
    }
    return null;
  }

  /** Giá xây một căn ở ô này, đã tính bão giá vật liệu và kỹ năng Mái Ấm của chủ đất. */
  buildCost(tileId) {
    const owner = this.ownerOf(tileId);
    const cut = has(owner, 'ac1') ? 1 - param(owner, 'ac1').cut : 1;
    return Math.ceil(BOARD[tileId].house_cost * this.modMult('build') * cut);
  }

  /**
   * Lương lãnh khi qua ô Bắt Đầu, đã tính mất mùa và kỹ năng của người lãnh.
   * @param {boolean} [landed] dừng đúng ô 0 chứ không chỉ đi ngang — ×1.5
   *   (×2 nếu có Về Nhà).
   * @param {?Player} [p] người lãnh; bỏ trống là lương gốc.
   */
  salary(landed = false, p = null) {
    return this.payslip(landed, p).total;
  }

  /**
   * Lương kèm phần mỗi kỹ năng góp vào — controller ghi phần ấy vào tiến độ
   * lên level của từng kỹ năng. Phần của Tăng Ca, Thâm Niên đã nhân mất mùa
   * và hệ số đạp ô; phần của Về Nhà là khoản vượt hệ số đạp ô thường (×1.5).
   * @returns {{total:number, parts:Object<string,number>}}
   */
  payslip(landed = false, p = null) {
    const mod = this.modMult('salary');
    const parts = {};
    let base = GO_SALARY;
    // Level 1 có khoảng ngẫu nhiên: mỗi lần lãnh lương rút lại một lần
    if (has(p, 'cn2a')) base += (parts.cn2a = roll(param(p, 'cn2a').bonus));
    if (has(p, 'cn3')) {
      const { cap, perLap } = param(p, 'cn3');
      base += (parts.cn3 = Math.min(cap, roll(perLap) * (p.laps ?? 0)));
    }
    const land = landed ? (has(p, 'dh2b') ? param(p, 'dh2b').goMult : GO_LANDING_MULT) : 1;
    for (const id of Object.keys(parts)) parts[id] *= mod * land;
    if (landed && has(p, 'dh2b')) parts.dh2b = base * mod * (land - GO_LANDING_MULT);
    /* Sổ Hồng cộng sau mọi hệ số: tiền giữ nhà không phải lương, mất mùa hay
       đạp trúng ô Bắt Đầu không đổi số nhà đang có. */
    const deed = has(p, 'ac3') ? (parts.ac3 = this.houseCount(p.id) * param(p, 'ac3').perHouse) : 0;
    if (!parts.ac3) delete parts.ac3;
    return { total: Math.round(base * mod * land) + deed, parts };
  }

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
    this.rolled = false;
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

  /** Tổng số căn nhà người chơi đang có, khách sạn tính 5 căn. */
  houseCount(playerId) {
    return this.propertiesOf(playerId).reduce((n, id) => n + this.housesOn(id), 0);
  }

  /** Người chơi có đủ cả nhóm màu không (điều kiện xây nhà). */
  hasFullGroup(playerId, group) {
    const ids = GROUP_TILES[group];
    return ids.length > 0 && ids.every((id) => this.owner.get(id) === playerId);
  }

  /**
   * Những ô trong bộ màu mà người chơi được xây: cả bộ khi đủ bộ, rỗng là
   * chưa được xây. Đất lẻ có Chung Cư Mini thì `canBuild` tự cho ô ấy đứng
   * riêng một mình.
   */
  buildGroup(playerId, group) {
    return this.hasFullGroup(playerId, group) ? GROUP_TILES[group] : [];
  }

  /**
   * Người chơi có căn nhà nào trên các ô **của mình** trong bộ màu này không.
   *
   * Chỉ xét ô của chính người ấy: với Chung Cư Mini và Sổ Hồng, một bộ màu có
   * thể chia cho hai chủ mà một bên đã xây. Xét cả bộ thì một căn nhà của bên
   * này khoá luôn việc thế chấp, ép mua ô của bên kia.
   */
  groupBuilt(playerId, group) {
    return GROUP_TILES[group].some((id) => this.owner.get(id) === playerId && this.housesOn(id) > 0);
  }

  /**
   * Chủ ô này đã xây căn nào trong khu màu chứa nó chưa — chỉ tính ô của chính
   * chủ ấy (xem `groupBuilt`). Ô không thuộc khu màu (ga tàu, dịch vụ) thì chỉ
   * xét chính nó, vì chúng không có bộ để mà phá. Thẻ Thâu Tóm và Siết Nợ
   * dùng chung luật này.
   */
  groupHasHouses(tileId) {
    const group = BOARD[tileId].color_group;
    if (!group) return this.housesOn(tileId) > 0;
    return this.groupBuilt(this.owner.get(tileId), group);
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
    const p = this.players[playerId];
    let total = p.money;
    /* Cùng tỉ lệ với `canSellHouse`: Sổ Hồng bán lại hơn nửa giá xây. Lấy cứng
       một nửa thì người có Sổ Hồng bị tuyên vỡ nợ ngay ở `runRaise` trong khi
       bán nhà ra là đủ trả. */
    const back = has(p, 'ac3') ? param(p, 'ac3').refund : 0.5;
    for (const id of this.propertiesOf(playerId)) {
      const t = BOARD[id];
      if (t.type === 'property') {
        const h = this.housesOn(id);
        total += Math.floor(t.house_cost * back) * (h === 5 ? 5 : h);
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
    const ownerId = this.owner.get(tileId);
    // Giấy tờ thất lạc thì chủ đất chưa đòi tiền ai được, y như đang thế chấp.
    if (ownerId === undefined || this.isMortgaged(tileId) || this.isFrozen(tileId)) return 0;
    if (this.rentBlock(tileId)) return 0;
    return this.rentAt(tileId, diceSum);
  }

  /**
   * Giá thuê niêm yết của ô ở một mức xây dựng, đã nhân sự kiện đang chạy và
   * kỹ năng của chủ đất. Không xét các luật chặn trọn ô (thế chấp, mất giấy
   * tờ, xác sống, bị nguyền) — `rentFor` xét trước khi gọi tới đây.
   *
   * `at` giả định một mức khác mức đang có, cho bảng giá trong hộp thoại chi
   * tiết ô: `houses` (0–5), `full` (đủ bộ màu), `count` (số bến / ô công ích
   * chủ đang giữ). Bỏ trống thì đọc theo bàn cờ lúc này.
   * @param {{houses?:number, full?:boolean, count?:number}} [at]
   */
  rentAt(tileId, diceSum, at = {}) {
    const t = BOARD[tileId];
    const ownerId = this.owner.get(tileId);
    const houses = at.houses ?? this.housesOn(tileId);
    const count = at.count
      ?? (ownerId === undefined ? 1
        : t.type === 'station' ? this.stationCount(ownerId) : this.utilityCount(ownerId));

    let moon = 1;
    if (this.hasMod('blood-moon') && t.type === 'property') {
      // Đêm Trăng Máu: đất trống không ai thu, ô có nhà thu thêm.
      if (houses === 0) return 0;
      moon = this.modMult('blood-moon');
    }
    const k = this.rentMult(tileId) * ownerRentMult(this, tileId, { houses }) * moon;
    // Vé Tháng, Mặt Tiền cộng sau hệ số nhân — xem `ownerRentFlat`
    const flat = Object.values(ownerRentFlat(this, tileId, { count })).reduce((n, x) => n + x, 0);
    let base = 0;
    if (t.type === 'station') base = STATION_RENT[count];
    else if (t.type === 'utility') base = diceSum * UTILITY_MULT[count];
    else if (t.type === 'property') {
      const full = at.full ?? (ownerId !== undefined && this.hasFullGroup(ownerId, t.color_group));
      // Đủ bộ màu mà chưa xây nhà → giá thuê gấp đôi.
      base = houses > 0 ? t.rents[houses] : (full ? t.rents[0] * 2 : t.rents[0]);
    } else return 0;
    return Math.round(base * k) + flat;
  }

  // ---------------------------------------------------------- xây nhà

  /**
   * Có được xây thêm 1 nhà (hoặc lên khách sạn) trên ô này không?
   * Trả về { ok, reason, isHotel, cost }.
   */
  /**
   * @param {{free?:boolean}} [o] `free`: căn nhà tặng của Phố Cổ — không xét
   *   tiền, không xét lệnh giới nghiêm (kỹ năng chứ không phải thợ thuê). Vẫn
   *   xét trần đất lẻ của Chung Cư Mini và kho 32 căn của ngân hàng.
   */
  canBuild(playerId, tileId, o = {}) {
    const t = BOARD[tileId];
    if (t.type !== 'property') return { ok: false, reason: 'Chỉ đất mới xây được nhà.' };
    if (!o.free && this.hasMod('freeze-build')) return { ok: false, reason: 'Đang giới nghiêm, thợ nghỉ hết.' };
    if (this.owner.get(tileId) !== playerId) return { ok: false, reason: 'Không phải đất của bạn.' };
    let group = this.buildGroup(playerId, t.color_group);
    /* Chung Cư Mini: chưa đủ bộ thì ô này đứng riêng một mình — luật xây đều
       tay chỉ xét chính nó, không đụng tới ô cùng màu trong tay người khác. */
    const p = this.players[playerId];
    const mini = !group.length && has(p, 'acS1');
    if (mini) {
      group = [tileId];
      if (this.housesOn(tileId) >= param(p, 'acS1').cap) {
        return { ok: false, reason: `Đất lẻ chỉ xây được ${param(p, 'acS1').cap} căn (Chung Cư Mini).` };
      }
      if (miniRoom(this, p) <= 0) {
        return { ok: false, reason: `Đã xây đủ ${param(p, 'acS1').total} căn trên đất lẻ (Chung Cư Mini).` };
      }
    }
    if (!group.length) {
      return { ok: false, reason: `Cần đủ bộ ${GROUPS[t.color_group].name}.` };
    }
    // Không xây được trên nhóm có ô đang thế chấp.
    if (group.some((id) => this.isMortgaged(id))) {
      return { ok: false, reason: 'Trong bộ còn ô đang thế chấp.' };
    }

    const cur = this.housesOn(tileId);
    if (cur >= 5) return { ok: false, reason: 'Đã có khách sạn.' };

    // Xây đều tay: không ô nào được hơn ô khác cùng bộ quá 1 căn.
    const min = Math.min(...group.map((id) => this.housesOn(id)));
    if (cur > min) return { ok: false, reason: 'Phải xây đều các ô trong bộ.' };

    const isHotel = cur === 4;
    if (isHotel) {
      if (this.bankHotels <= 0) return { ok: false, reason: 'Ngân hàng hết khách sạn.' };
    } else if (this.bankHouses <= 0) {
      return { ok: false, reason: 'Ngân hàng đã hết nhà (32 căn).' };
    }

    const cost = o.free ? 0 : Math.ceil(this.buildCost(tileId) * (mini ? param(p, 'acS1').mult : 1));
    if (p.money < cost) return { ok: false, reason: 'Không đủ tiền.' };

    return { ok: true, isHotel, cost, mini };
  }

  /** Xây 1 nhà, hoặc lên khách sạn (trả lại 4 căn nhà cho ngân hàng). */
  build(playerId, tileId, o = {}) {
    const check = this.canBuild(playerId, tileId, o);
    if (!check.ok) return check;
    const p = this.players[playerId];
    p.money -= check.cost;
    // Tiến độ lên level: Mái Ấm tính số tiền được bớt, Chung Cư Mini tính căn xây trên đất lẻ
    if (!o.free && has(p, 'ac1')) {
      credit(p, 'ac1', Math.ceil(BOARD[tileId].house_cost * this.modMult('build')) - check.cost);
    }
    if (check.mini) credit(p, 'acS1');
    if (check.isHotel) {
      this.houses.set(tileId, 5);
      this.bankHouses += 4;   // trả 4 căn nhà về kho
      this.bankHotels -= 1;
    } else {
      this.houses.set(tileId, this.housesOn(tileId) + 1);
      this.bankHouses -= 1;
    }
    check.payouts = this.payContractors(playerId, 'build');
    return check;
  }

  /**
   * Thầu Vật Liệu: mỗi căn người khác xây / bán / bị dỡ, ngân hàng trả cho
   * những ai học kỹ năng này (trừ chính chủ căn nhà).
   *
   * Cộng thẳng vào ví ở đây chứ không để controller làm: bảng quản lý tài sản
   * gọi `build` / `sellHouse` trực tiếp, và máy cầm lái còn làm lại chúng khi
   * con nợ ở máy khác xoay tiền (`applyRaiseActs`) — tiền thầu phải đi theo
   * đúng một đường với căn nhà, không thì có đường xây mà quên trả.
   *
   * Mỗi nhà thầu nhận theo level **của mình**, nên khoản tiền tính riêng từng
   * người chứ không truyền một con số chung vào.
   * @param {'build'|'sell'} kind
   * @returns {Array<{seat:number, amount:number}>}
   */
  payContractors(builderId, kind) {
    const out = [];
    for (const q of this.players) {
      if (q.id === builderId || !has(q, 'dc2b')) continue;
      const amount = roll(param(q, 'dc2b')[kind]);
      q.money += amount;
      credit(q, 'dc2b', amount);
      out.push({ seat: q.id, amount });
    }
    return out;
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
    // Phá đều tay — trong những ô mình được xây; nhà trên đất lẻ (Chung Cư Mini) đứng riêng
    const group = this.buildGroup(playerId, t.color_group);
    const max = Math.max(...(group.length ? group : [tileId]).map((id) => this.housesOn(id)));
    if (cur < max) return { ok: false, reason: 'Phải bán đều các ô trong bộ.' };
    // Sổ Hồng level 2–3 bán lại được hơn nửa giá xây
    const owner = this.players[playerId];
    const back = has(owner, 'ac3') ? param(owner, 'ac3').refund : 0.5;
    return { ok: true, refund: Math.floor(t.house_cost * back) };
  }

  /** Bán 1 cấp nhà lại cho ngân hàng, lấy về nửa giá xây. */
  sellHouse(playerId, tileId) {
    const check = this.canSellHouse(playerId, tileId);
    if (!check.ok) return check;
    const cur = this.housesOn(tileId);
    check.payouts = this.payContractors(playerId, 'sell');
    if (cur === 5) {
      this.heritage.delete(tileId);
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
    // Sổ Hồng và biển Di Sản: thẻ hay thiên tai đều không dỡ được
    if (houseImmune(this, tileId)) return 0;
    this.payContractors(this.owner.get(tileId), 'sell');
    if (cur === 5) {
      this.heritage.delete(tileId);
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
    // Ô miễn dỡ thì `demolish` trả 0 mà nhà vẫn còn — dừng, đừng quay mãi
    while (this.housesOn(tileId) > 0 && this.demolish(tileId)) { /* dỡ tiếp */ }
    return levels;
  }

  // ---------------------------------------------------------- thế chấp

  canMortgage(playerId, tileId) {
    if (this.owner.get(tileId) !== playerId) return { ok: false, reason: 'Không phải đất của bạn.' };
    if (this.isMortgaged(tileId)) return { ok: false, reason: 'Đã thế chấp rồi.' };
    const t = BOARD[tileId];
    if (t.type === 'property') {
      // Phải phá hết nhà trong cả bộ trước khi thế chấp.
      if (this.groupBuilt(playerId, t.color_group)) {
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

  /** Mua ô chưa có chủ với giá khác giá gốc (Nhặt Hàng Thừa). */
  buyAt(playerId, tileId, price) {
    const p = this.players[playerId];
    if (!BOARD[tileId].ownable || this.owner.has(tileId) || p.money < price) return false;
    p.money -= price;
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
    player.jails = (player.jails ?? 0) + 1;
    player.doubles = 0;
    player.jailSits = 0;
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
      this.heritage.delete(tileId);
    }
    // Thẻ còn trong túi người vỡ nợ thì trả về bộ, đừng chôn theo họ
    while (p.cards.length) this.dropCard(playerId);
    p.money = 0;
    if (!p.bankrupt) {
      p.outRank = this.players.filter((x) => x.bankrupt).length + 1;
      p.outPos = p.pos;
      p.outRound = this.round;
      track('bankrupt', {
        seat: playerId, round: this.round, turn_no: this.turnNo,
        skills: p.skills.map((id) => ({ id, lv: levelOf(p, id) })),
      });
    }
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
    this.turnNo += 1;
    // Lượt mới bắt đầu ở thế "chưa có đồng nào đổi chủ"
    this.dryTurn = true;
    this.rolled = false;
    const ord = this.playOrder;
    const at = Math.max(0, ord.indexOf(this.turn));
    for (let i = 1; i <= ord.length; i++) {
      const idx = ord[(at + i) % ord.length];
      if (!this.players[idx].bankrupt) {
        // Vòng qua cuối bảng thứ tự đi là sang vòng mới
        if (at + i >= ord.length) this.round += 1;
        this.turn = idx;
        // Đếm đổ đôi xoá ở đây, không ở `beginTurn` — xem `rolled`
        this.players[idx].doubles = 0;
        return this.players[idx];
      }
    }
    return null;
  }

  /** Người thắng, hoặc `null` khi ván chưa ngã ngũ. */
  winner() { return this.winCheck()?.player ?? null; }

  /**
   * Ván đã có người thắng chưa, và thắng theo cửa nào:
   *  - `last`   còn đúng một người chưa phá sản
   *  - `empire` giữ đủ `WIN_SETS` bộ màu, trong đó `WIN_HOTEL_SETS` bộ đã lên
   *             khách sạn ở mọi ô
   *  - `worth`  tổng tài sản (`netWorth`: tiền, đất, nhà) đạt `WIN_WORTH`
   *
   * Hai cửa sau có vì ván chờ tới lúc chỉ còn một người thường kéo cả tiếng:
   * người đã nắm chắc phần thắng vẫn phải đi tiếp chục vòng. Xét ở cuối mỗi
   * lượt; hai người cùng qua vạch trong một lượt thì ai nhiều tổng tài sản hơn
   * thắng.
   * @returns {?{player:Player, by:'last'|'empire'|'worth'}}
   */
  winCheck() {
    const alive = this.alive();
    if (alive.length === 1) return { player: alive[0], by: 'last' };
    const worth = (p) => this.netWorth(p.id);
    const richest = (list) => list.reduce((a, b) => (worth(b) > worth(a) ? b : a));
    const empire = alive.filter((p) => {
      const sets = Object.keys(GROUPS).filter((g) => this.hasFullGroup(p.id, g));
      const hotels = sets.filter((g) => GROUP_TILES[g].every((id) => this.housesOn(id) === 5));
      return sets.length >= WIN_SETS && hotels.length >= WIN_HOTEL_SETS;
    });
    if (empire.length) return { player: richest(empire), by: 'empire' };
    const rich = alive.filter((p) => worth(p) >= WIN_WORTH);
    if (rich.length) return { player: richest(rich), by: 'worth' };
    return null;
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

/**
 * Thứ hạng cuối ván: người thắng đứng đầu, kế đến những người còn trụ (so gia
 * sản), cuối cùng là người phá sản — ai vỡ nợ sau đứng trên ai vỡ nợ trước.
 *
 * Người phá sản đã trả hết tài sản về ngân hàng, gia sản ai cũng là 0$, nên
 * không đem tiền ra so được; thứ tự vỡ nợ (`outRank`) là thứ duy nhất phân
 * định họ. Ảnh chụp cũ chưa có `outRank` (0) thì xếp chót.
 */
export function finalRanking(state, winner) {
  const alive = state.players
    .filter((p) => !p.bankrupt && p.id !== winner.id)
    .sort((a, b) => state.netWorth(b.id) - state.netWorth(a.id));
  const out = state.players
    .filter((p) => p.bankrupt && p.id !== winner.id)
    .sort((a, b) => (b.outRank || 0) - (a.outRank || 0));
  return [winner, ...alive, ...out];
}

