/**
 * Bộ thẻ CƠ HỘI và KHÍ VẬN.
 *
 * Trước đây mỗi thẻ chỉ biết cộng hoặc trừ tiền với ngân hàng. Chơi ít người
 * thì mấy thẻ ấy chỉ bơm tiền từ ngân hàng ra chứ không đụng gì tới thế cờ:
 * ai đang dẫn vẫn dẫn, đất vẫn nằm nguyên chỗ cũ. Nay mỗi thẻ mang một `type`
 * nói rõ nó làm gì:
 *
 *   · `bank`      — cộng/trừ tiền với ngân hàng (mặc định khi chỉ có `amount`).
 *   · `collect`   — tiền mừng: **chia đều thu từ những người chơi khác**, chứ
 *                   không phải ngân hàng bao. Quà mừng thì phải có người mừng.
 *   · `repair`    — thuế nhà cửa: tính trên từng căn nhà, từng khách sạn mình
 *                   đang có (`perHouse` / `perHotel`).
 *   · `jail-free` — vé ra tù.
 *   · `force-sell`— ép chủ một ô của người khác bán sạch nhà trên ô đó, họ chỉ
 *                   nhận lại nửa giá xây.
 *   · `demolish`  — dỡ `levels` cấp nhà của người khác, không đền một đồng.
 *   · `seize`     — cưỡng chiếm một lô đất trống của người khác, đền bằng đúng
 *                   giá thế chấp.
 *   · `resume`    — giải toả: chọn một lô đất trống đang có chủ (kể cả của
 *                   mình), đền thiệt hại **giá gốc +20%**, rồi lô ấy đem
 *                   **đấu giá kín** cho cả bàn tranh nhau.
 *   · `resume-random` — cũng giải toả, nhưng lô đất do **bốc thăm** giữa mọi lô
 *                   trống trên bàn: bàn cờ sáng chạy qua từng ô rồi chậm dần,
 *                   dừng ở đâu là lô ấy.
 *
 * ── Thẻ giữ trong túi ──────────────────────────────────────────────────────
 * Sáu loại kể trên (`KEEPABLE`) **không nổ ngay lúc rút**: rút được thì cất
 * vào túi, khi nào thấy đúng lúc mới lôi ra dùng. Đây mới là chỗ đáng chơi của
 * chúng — dỡ nhà đúng lúc đối phương vừa cất khách sạn, cưỡng chiếm đúng lô
 * còn thiếu để đủ bộ. Thẻ đang nằm trong túi ai thì **rời khỏi bộ bài**
 * (`Deck.gone`), xài xong mới trả về.
 *
 * Luật chọn mục tiêu nằm ở `core/cards.js`, phần diễn ở `game/controller.js`.
 *
 * Lời thoại lấy bối cảnh Sài Gòn – Gia Định xưa.
 */

export const CHANCE = [
  { text: 'Trúng thầu xây cầu Bình Lợi, công trình nghiệm thu sớm.', amount: 150 },
  { text: 'Bán lô cao su Hớn Quản đúng lúc giá lên đỉnh.', amount: 200 },
  { text: 'Tàu buôn từ Hương Cảng cập bến Nhà Rồng, hàng về đúng vụ.', amount: 120 },
  { text: 'Thắng độ ở trường đua Phú Thọ, con ngựa ô về nhất.', amount: 100 },
  { text: 'Hùn vốn hãng xe đò Lục Tỉnh, cuối năm chia lãi.', amount: 90 },
  { text: 'Cứu hoả kịp thời ở chợ Bến Thành, được Toà Đô Chánh khen thưởng.', amount: 75 },
  { text: 'Mở tiệm vàng trên đường Catinat, khách ra vào nườm nượp.', amount: 250 },
  { text: 'Bán bản quyền bài vọng cổ cho hãng dĩa hát.', amount: 130 },
  { text: 'Giá lúa Gò Công tăng vọt, ghe chài đầy khoang.', amount: 180 },
  { text: 'Toà Đô Chánh buộc sửa mặt tiền nhà cho đúng lệ phố.', amount: -100 },
  { text: 'Thuế môn bài quý này tăng, phải đóng bù.', amount: -80 },
  { text: 'Xe kéo gãy càng giữa đường Bonard, phải đền cho phu xe.', amount: -45 },
  { text: 'Đãi tiệc cưới ở nhà hàng Continental, thực đơn Tây.', amount: -160 },
  { text: 'Mưa lớn bất chợt, kho lúa Chợ Lớn bị ẩm phải phơi lại.', amount: -120 },
  { text: 'Góp tiền trùng tu Lăng Ông Bà Chiểu.', amount: -70 },
  { text: 'Bị phạt vì đậu xe trước Nhà Hát Tây giờ cấm.', amount: -50 },
  {
    text: 'Mừng thọ ông nội, cả phố kéo tới chúc, ai cũng có phong bao.',
    type: 'collect', amount: 180,
  },
  {
    text: 'Sở Lục Lộ tổng kiểm tra nhà phố: nhà nào cũng phải sửa mái, quét vôi lại.',
    type: 'repair', perHouse: 25, perHotel: 100,
  },
  {
    text: 'Quen lớn với ông Cò bót Catinat, xin sẵn một tờ giấy bãi nại phòng thân.',
    type: 'jail-free',
  },
  {
    text: 'Trạng sư quen biết soạn sẵn cho một lá đơn xin tại ngoại, ký tên đóng dấu đủ cả.',
    type: 'jail-free',
  },
  {
    text: `Toà xử vụ kiện lấn không gian: nhà bên phải hạ xuống hai tầng cho đúng
           lộ giới, dỡ tới đâu chịu tới đó.`,
    type: 'demolish', levels: 2,
  },
  {
    text: 'Kiện ra toà chuyện lấn ranh, toà xử người ta phải phát mãi nhà cửa trên lô đất tranh chấp.',
    type: 'force-sell',
  },
  {
    text: 'Lục lại văn khế cũ trong hộc tủ, thì ra một lô đất người ta đang giữ vốn có chủ khác.',
    type: 'seize',
  },
  {
    text: `Sở Công Chánh cắm mốc giải toả một lô đất: chủ cũ lãnh tiền đền thiệt hại,
           còn lô đất thì đem bán đấu giá ngay tại Toà Đô Chánh.`,
    type: 'resume', rate: 1.2,
  },
];

export const CHEST = [
  { text: 'Hội Ái Hữu Gia Định trao học bổng cho con.', amount: 80 },
  { text: 'Được hoàn lại thuế điền thổ nộp dư năm ngoái.', amount: 110 },
  { text: 'Trúng lô an ủi xổ số kiến thiết.', amount: 200 },
  { text: 'Tiền lời sổ tiết kiệm ở Ngân Hàng Đông Dương.', amount: 60 },
  { text: 'Thừa kế mảnh vườn sầu riêng ở Thủ Đức, bán được giá.', amount: 150 },
  { text: 'Bán chiếc ghe tam bản cũ cho lái buôn miệt vườn.', amount: 55 },
  { text: 'Tiền công vẽ tranh sơn mài cho Dinh Thượng Thơ.', amount: 140 },
  { text: 'Nằm nhà thương Grall một tuần, viện phí tính theo ngày.', amount: -130 },
  { text: 'Đóng học phí trường Pétrus Ký cho con niên khoá mới.', amount: -100 },
  { text: 'Cúng dường trai tăng ở chùa Giác Lâm.', amount: -60 },
  { text: 'Mùa dịch, cả nhà tốn tiền thuốc thang.', amount: -90 },
  { text: 'Mái ngói nhà rường bị dột, phải gọi thợ lợp lại.', amount: -75 },
  { text: 'Tới ngày giỗ họ, đãi cả xóm một bữa tươm tất.', amount: -110 },
  { text: 'May áo dài gấm cho cả nhà ăn Tết.', amount: -85 },
  { text: 'Bà con lối xóm góp tiền mừng tân gia.', type: 'collect', amount: 120 },
  { text: 'Bạn hàng Chợ Lớn biếu quà Tết, mỗi nhà một phong bao.', type: 'collect', amount: 90 },
  { text: 'Tới ngày sinh nhật, cả bàn góp tiền mừng tuổi.', type: 'collect', amount: 150 },
  {
    text: 'Toà Đô Chánh đánh thuế thổ trạch: cứ mỗi nóc nhà, mỗi khách sạn đều phải nộp.',
    type: 'repair', perHouse: 40, perHotel: 115,
  },
  {
    text: 'Có người thân làm thơ ký trong Khám Lớn, dặn sẵn khi hữu sự thì đưa giấy này ra.',
    type: 'jail-free',
  },
  {
    text: 'Ông Hương Cả trong làng đứng ra bảo lãnh, giấy tờ để sẵn đó phòng khi cần.',
    type: 'jail-free',
  },
  {
    text: 'Đội lục lộ đo lại lộ giới, phán một căn nhà của người ta cất lấn ra đường — phải dỡ.',
    type: 'demolish', levels: 1,
  },
  {
    text: `Toà Đô Chánh bốc thăm chọn lô đất mở đường: rút trúng lô nào thì lô ấy
           giải toả, chủ lãnh tiền đền rồi đất đem bán đấu giá.`,
    type: 'resume-random', rate: 1.2,
  },
];

/**
 * Bộ bài rút không lặp lại cho tới khi hết, rồi xáo lại.
 *
 * `gone` là mấy lá đang nằm trong tay người chơi (vé ra tù). Chúng không được
 * xáo trở lại chồng, nếu không thì cả bàn ai cũng thủ một tấm — trong khi
 * cả bộ chỉ có đúng một tấm.
 */
export class Deck {
  constructor(cards, kind) {
    this.cards = cards;
    this.kind = kind; // 'chance' | 'chest'
    this.pile = [];
    /** Chỉ số những lá đang bị giữ ngoài bộ. @type {Set<number>} */
    this.gone = new Set();
    this.shuffle();
  }

  shuffle() {
    this.pile = this.cards.map((_, i) => i).filter((i) => !this.gone.has(i));
    for (let i = this.pile.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.pile[i], this.pile[j]] = [this.pile[j], this.pile[i]];
    }
  }

  /**
   * Rút một lá dùng được lúc này.
   *
   * Thẻ "cướp đất" rút trúng lúc cả bàn chưa ai có đất thì bày ra chỉ tổ hụt
   * hẫng — nên lá nào không dùng được thì để riêng, bốc tiếp, xong trả cả nắm
   * ấy về chồng: lát nữa bàn đổi thế, lá ấy lại có nghĩa.
   *
   * @param {?(card:object)=>boolean} usable
   * @returns {?{index:number, card:object}}
   */
  draw(usable = null) {
    if (this.pile.length === 0) this.shuffle();
    const skipped = [];
    let out = null;

    while (this.pile.length > 0) {
      const i = this.pile.pop();
      if (!usable || usable(this.cards[i])) { out = { index: i, card: this.cards[i] }; break; }
      skipped.push(i);
    }
    // Xáo mấy lá bỏ qua lẫn vào phần còn lại, chứ không đặt lại đúng chỗ cũ
    this.pile = shuffled([...this.pile, ...skipped]);
    return out;
  }

  /** Lá này ra khỏi bộ — có người đang cầm nó trong tay. */
  take(index) {
    this.gone.add(index);
    this.pile = this.pile.filter((i) => i !== index);
  }

  /** Trả lá đã cầm về bộ, chen vào một chỗ ngẫu nhiên trong chồng. */
  give(index) {
    if (!this.gone.delete(index)) return;
    this.pile.splice(Math.floor(Math.random() * (this.pile.length + 1)), 0, index);
  }
}

function shuffled(a) {
  const out = [...a];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Những loại thẻ **giữ được trong túi**, dùng sau chứ không nổ ngay lúc rút.
 */
export const KEEPABLE = new Set([
  'jail-free', 'force-sell', 'demolish', 'seize', 'resume', 'resume-random',
]);

/** Hai bộ tra theo tên — thẻ trong túi chỉ ghi `{kind, index}` cho gọn ảnh chụp. */
export const DECKS = { chance: CHANCE, chest: CHEST };

/** Lá bài mà một tấm thẻ trong túi đang trỏ tới. */
export function cardOf(ref) { return DECKS[ref?.kind]?.[ref?.index] ?? null; }

/**
 * Tên gọi và biểu tượng của từng loại thẻ giữ được — bảng túi thẻ in theo đây.
 * Ký tự cố ý **đơn sắc**: mấy hình như 🔨 bị trình duyệt vẽ thành emoji màu,
 * lạc hẳn khỏi mặt thẻ giấy dó.
 */
export const CARD_KINDS = {
  'jail-free':     { name: 'Vé ra tù',            sigil: '⚿' },
  'force-sell':    { name: 'Lệnh phát mãi',       sigil: '⚖' },
  demolish:        { name: 'Lệnh dỡ nhà',         sigil: '⚒' },
  seize:           { name: 'Cưỡng chiếm địa giới', sigil: '⚑' },
  resume:          { name: 'Lệnh giải toả',       sigil: '⌁' },
  'resume-random': { name: 'Giải toả bốc thăm',   sigil: '⟳' },
};

export const DECK_META = {
  chance: { title: 'CƠ HỘI', sigil: '✦', accent: '#C8A048' },
  chest:  { title: 'KHÍ VẬN', sigil: '⚱', accent: '#2E6B52' },
};
