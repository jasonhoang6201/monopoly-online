/**
 * Bộ thẻ THỜI CUỘC — sự kiện toàn bàn, khác hẳn Cơ Hội / Khí Vận.
 *
 * Cơ Hội và Khí Vận là chuyện riêng của người vừa đáp xuống ô, và chỉ có cộng
 * trừ tiền. Thời Cuộc thì nổ ra cho **cả bàn** cùng chịu, và được sinh ra để
 * chữa đúng một cái bệnh: chơi ít người, đất bán hết, không ai chịu đổi chác —
 * từ đó mỗi lượt chỉ còn lắc xí ngầu đi vòng vòng, tiền đứng yên, ván không có
 * đường kết thúc.
 *
 * Vì thế thẻ ở đây chia làm hai kỳ:
 *   · Kỳ 1 — chỉ đụng tới tiền mặt và luật tạm thời. Rung nhẹ cho dòng tiền
 *     chảy lại, chưa ai mất đất.
 *   · Kỳ 2 — đụng tới nhà cửa và quyền sở hữu: động đất, hoả hoạn, trưng thu,
 *     đấu giá bắt buộc. Đây mới là chỗ ép đất đổi chủ mà **không cần đối
 *     phương đồng ý**.
 *
 * ── Hai phần chữ trên một mặt thẻ ──────────────────────────────────────────
 * `text` là lời văn: chuyện gì đang xảy ra ngoài phố, đọc cho có không khí.
 * `effect` là luật: thẻ này lát nữa làm gì với tiền, nhà, đất của ai. Tách đôi
 * vì trộn chung thì lời văn nuốt mất con số — người chơi đọc xong vẫn không
 * biết mình sắp mất bao nhiêu, mà đó mới là thứ họ cần để quyết định.
 *
 * `effect` viết thành hàm nhận chính thẻ ấy, nên mấy con số cân bằng
 * (`perHouse`, `braceRate`, `rounds`…) chỉ khai một chỗ: sửa số thì dòng chữ
 * đổi theo, không có đường lệch nhau.
 *
 * Biểu tượng (`sigil`) cố ý chỉ dùng ký tự **đơn sắc** — mấy hình như 🔥 hay ⛩
 * bị trình duyệt vẽ thành emoji màu, nhỏ xíu và lạc hẳn khỏi mặt thẻ giấy dó.
 * Ba quẻ ☳ (chấn — động), ☲ (ly — lửa), ☵ (khảm — nước) vừa đơn sắc vừa đúng
 * chất Á Đông của bộ bài.
 *
 * Luật thực thi nằm ở `core/events.js` (phần thuần dữ liệu) và
 * `game/eventRunner.js` (phần diễn).
 */
import { money } from './board.js';

/** "Còn bấy nhiêu vòng nữa" — mọi thẻ có `rounds` đều đóng bằng dòng này. */
const lasts = (c) => `Kéo dài ${c.rounds} vòng, hết thì luật trả về như cũ`;

/** Phần trăm gọn gàng: 1.25 → "+25%", 0.5 → "−50%". */
const pct = (mult) => `${mult >= 1 ? '+' : '−'}${Math.round(Math.abs(mult - 1) * 100)}%`;

export const EVENTS = [
  /* ------------------------------------------------------------ Kỳ 1 */
  {
    id: 'thue-dien-tho', era: 1, kind: 'bad', sigil: '⚖',
    title: 'SƯU CAO THUẾ NẶNG',
    text: `Toà Đô Chánh ra lệnh trưng thu sưu thuế điền thổ toàn hạt Gia Định.
           Nhà nào cửa nấy đều bị gọi tên, không ai khất được.`,
    perHouse: 25, perHotel: 100,
    effect: (c) => [
      `Mỗi căn nhà nộp ${money(c.perHouse)}, mỗi khách sạn ${money(c.perHotel)}`,
      'Cả bàn cùng nộp, tiền dồn hết vào Quỹ Công',
      'Thiếu tiền mặt thì ngân hàng tự thế chấp và hạ nhà để thu',
    ],
  },
  {
    id: 'lam-phat', era: 1, kind: 'chaos', sigil: '↑',
    title: 'GIÁ GẠO LEO THANG',
    text: `Gạo Chợ Lớn khan hàng, cái gì cũng lên giá theo. Chủ nhà nhân dịp
           hét thêm, người thuê đành cắn răng chịu.`,
    mult: 1.25, rounds: 2,
    effect: (c) => [
      `Tiền thuê khắp bàn ${pct(c.mult)}`,
      lasts(c),
    ],
  },
  {
    id: 'mat-mua', era: 1, kind: 'bad', sigil: '☵',
    title: 'MẤT MÙA',
    text: `Nước lũ về sớm, ruộng miền Tây ngập trắng. Thóc không về tới vựa,
           đồng lương cũng hụt theo.`,
    mult: 0.5, rounds: 3,
    effect: (c) => [
      `Lương lãnh khi qua ô Bắt Đầu ${pct(c.mult)}`,
      lasts(c),
    ],
  },
  {
    id: 'bao-gia', era: 1, kind: 'bad', sigil: '⚒',
    title: 'BÃO GIÁ VẬT LIỆU',
    text: `Xi măng với gỗ lim đội giá gấp rưỡi. Nhà thầu nào cũng lắc đầu
           hẹn lại sang năm.`,
    mult: 1.5, rounds: 3,
    effect: (c) => [
      `Giá xây mỗi căn nhà ${pct(c.mult)}`,
      'Nhà đã xây rồi thì không phải bù thêm',
      lasts(c),
    ],
  },
  {
    id: 'siet-tin-dung', era: 1, kind: 'bad', sigil: '✎',
    title: 'NGÂN HÀNG SIẾT TÍN DỤNG',
    text: `Ngân Hàng Đông Dương rà lại sổ nợ, gọi từng người đang cắm đất
           lên đối chiếu.`,
    rate: 0.10,
    effect: (c) => [
      `Ai đang thế chấp phải đóng lãi ${Math.round(c.rate * 100)}% tổng giá thế chấp`,
      'Đóng ngay một lần, không khất và không chuộc đất thay được',
    ],
  },
  {
    id: 'gioi-nghiem', era: 1, kind: 'chaos', sigil: '⊘',
    title: 'GIỚI NGHIÊM',
    text: `Lệnh giới nghiêm ban ra, thợ thuyền không ai được ra đường.
           Giàn giáo bỏ không giữa phố.`,
    rounds: 2,
    effect: (c) => [
      'Cấm xây nhà trên toàn bàn',
      'Bán nhà, thế chấp và chuộc đất thì vẫn làm được',
      lasts(c),
    ],
  },
  {
    id: 'hoi-cho', era: 1, kind: 'good', sigil: '✦',
    title: 'HỘI CHỢ ĐẤU XẢO',
    text: `Hội chợ Đấu Xảo mở ở vườn Ông Thượng. Người khố rách nhất bàn
           gánh hàng ra bán, một phen trúng đậm.`,
    amount: 200,
    effect: (c) => [
      `Người nghèo nhất bàn nhận ${money(c.amount)} từ ngân hàng`,
      'Xét theo tổng tài sản (tiền, đất, nhà), không riêng tiền mặt',
    ],
  },
  {
    id: 'an-xa', era: 1, kind: 'good', sigil: '✧',
    title: 'ÂN XÁ',
    text: `Nhân lễ lớn, Khám Lớn mở cửa tha cho hết những người đang bị giam.`,
    effect: () => [
      'Mọi người đang ngồi Khám Lớn được thả ngay',
      'Không mất tiền chuộc, không tốn vé ra tù',
    ],
  },
  {
    id: 'quy-cong-phat-chan', era: 1, kind: 'good', sigil: '❖',
    title: 'QUỸ CÔNG PHÁT CHẨN',
    text: `Quỹ Công đem tiền ra phát chẩn ngay tại Bến Đậu, dân kéo tới
           chật cả bến.`,
    bonus: 150,
    effect: (c) => [
      `Ngân hàng bỏ thêm ${money(c.bonus)} vào Quỹ Công`,
      'Ai ghé ô Bến Đậu trước tiên thì ẵm trọn cả quỹ',
    ],
  },

  /* ------------------------------------------------------------ Kỳ 2 */
  {
    id: 'dong-dat', era: 2, kind: 'bad', sigil: '☳',
    title: 'ĐỘNG ĐẤT',
    text: `Đất rung một trận, cả khu nứt tường sập mái. Người ta đổ ra đường
           đứng nhìn nhà mình.`,
    /** Phí chống đỡ mỗi ô = nửa giá xây một căn. */
    braceRate: 0.5,
    effect: (c) => [
      'Bốc thăm một khu màu đang có nhà — cả khu cùng chịu',
      `Chủ đất được hỏi: trả ${Math.round(c.braceRate * 100)}% giá xây mỗi ô để giữ nguyên nhà`,
      'Không trả thì mỗi ô sập một cấp nhà, không đền một đồng',
    ],
  },
  {
    id: 'hoa-hoan', era: 2, kind: 'bad', sigil: '☲',
    title: 'HOẢ HOẠN',
    text: `Lửa bén từ một tiệm dầu, cháy lan cả dãy phố. Phu chữa cháy đứng
           chờ tiền công mới chịu kéo vòi.`,
    /** Tiền thuê phu chữa cháy = 40% giá xây của phần nhà sắp cháy. */
    saveRate: 0.4,
    effect: (c) => [
      'Bốc thăm một khu màu đang có nhà — cả khu cùng cháy',
      `Chủ đất được hỏi: trả ${Math.round(c.saveRate * 100)}% giá xây phần sắp cháy thì nhà còn nguyên`,
      'Không trả thì mỗi ô mất nửa số nhà, làm tròn xuống',
    ],
  },
  {
    id: 'mat-giay-to', era: 2, kind: 'chaos', sigil: '☗',
    title: 'MẤT GIẤY TỜ',
    text: `Kho địa bạ cháy sổ, giấy tờ nhà đất thất lạc cả loạt. Muốn đòi
           tiền thuê cũng chẳng biết chìa ra cái gì.`,
    rounds: 2,
    effect: (c) => [
      'Mỗi người tự chọn một ô đất của mình',
      'Ô ấy ngưng thu tiền thuê, nhà cửa trên đó vẫn còn',
      lasts(c),
    ],
  },
  {
    id: 'trung-thu', era: 2, kind: 'chaos', sigil: '⚑',
    title: 'TRƯNG THU QUY HOẠCH',
    text: `Nhà nước mở đại lộ, cắm mốc ngay giữa đất của người giàu nhất bàn.`,
    effect: () => [
      'Lấy lô đắt nhất chưa xây nhà của người giàu nhất bàn',
      'Chủ cũ được đền đúng bằng giá thế chấp',
      'Lô ấy đem đấu giá kín, cả bàn tranh nhau kể cả chủ cũ',
    ],
  },
  {
    id: 'sang-nhuong', era: 2, kind: 'chaos', sigil: '⇥',
    title: 'SANG NHƯỢNG BẮT BUỘC',
    text: `Toà án tuyên phát mãi một lô đất theo lệnh cưỡng chế, dán giấy
           ngay trước cổng.`,
    effect: () => [
      'Bốc thăm một lô đất chưa xây nhà trên bàn',
      'Đem đấu giá kín — chủ cũ đứng ngoài, không được mua lại',
      'Bán được bao nhiêu chủ cũ nhận trọn bấy nhiêu',
    ],
  },
  {
    id: 'hoan-doi-dia-ba', era: 2, kind: 'chaos', sigil: '⇄',
    title: 'HOÁN ĐỔI ĐỊA BẠ',
    text: `Sổ địa bạ bị chép lộn cả loạt, tên chủ này nằm trên đất chủ kia.`,
    effect: () => [
      'Mỗi người tự chọn một lô chưa xây nhà, giao cho người kế tiếp trong vòng đi',
      'Đổi thành một vòng khép kín: ai cho một lô thì cũng nhận một lô',
      'Nhà cửa không sang tên theo, nên chỉ chọn được ô chưa xây',
    ],
  },
  {
    id: 'mo-duong', era: 2, kind: 'good', sigil: '⌁',
    title: 'MỞ ĐƯỜNG LỚN',
    text: `Đại lộ mới xẻ ngang một khu, xe cộ chạy suốt ngày đêm, đất hai bên
           đường lên giá thấy rõ.`,
    mult: 1.5,
    effect: (c) => [
      'Bốc thăm một khu màu đã có chủ',
      `Tiền thuê cả khu ấy ${pct(c.mult)}`,
      'Hiệu lực vĩnh viễn — từ giờ tới hết ván',
    ],
  },
  {
    id: 'dai-ha-gia', era: 2, kind: 'good', sigil: '⚑',
    title: 'ĐẠI HẠ GIÁ',
    text: `Ngân hàng dọn kho, đem mấy lô đất còn ế ra rao bán giữa chợ.`,
    effect: () => [
      'Bốc thăm một lô đất chưa ai mua',
      'Đem đấu giá kín, khỏi chờ ai đáp trúng ô ấy',
      'Ai trả cao nhất thì lấy đất, tiền về ngân hàng',
    ],
  },
];

/**
 * Mấy dòng "áp dụng" in ở nửa dưới mặt thẻ.
 *
 * Thẻ cũ trong ảnh chụp cũ có thể chưa có `effect` — trả mảng rỗng thay vì nổ.
 */
export function effectLines(card) {
  return typeof card?.effect === 'function' ? card.effect(card) : [];
}

/** Tra thẻ theo id — luật thực thi bên `core/events.js` gọi tới. */
export const EVENT_BY_ID = Object.fromEntries(EVENTS.map((e) => [e.id, e]));

/** Bốn nấc do chủ phòng chọn trước khi khai cuộc. */
export const EVENT_LEVELS = {
  off: {
    key: 'off', name: 'Tắt', short: 'Không có sự kiện',
    desc: 'Chơi đúng luật cổ điển — không có thẻ Thời Cuộc nào.',
  },
  nhe: {
    key: 'nhe', name: 'Nhẹ', short: 'Thưa và êm',
    desc: 'Sự kiện thưa, phần lớn chỉ đụng tiền mặt. Đất chỉ đổi chủ ở cuối ván.',
    // Ngưỡng đầu tiên, mỗi lần nổ lại hạ bớt `step`, không thấp hơn `floor`.
    base: 26, step: 3, floor: 14,
    /** Từ lần nổ thứ mấy thì mở bộ thẻ Kỳ 2 (đụng tới nhà đất). */
    era2From: 4,
    /** Bàn phải bán được bấy nhiêu phần đất mới bắt đầu tính áp lực. */
    saturation: 0.85,
  },
  chuan: {
    key: 'chuan', name: 'Chuẩn', short: 'Nhịp vừa phải',
    desc: 'Vài vòng lại có biến. Kỳ 2 mở sớm để đất chịu đổi chủ khi bàn bí.',
    base: 20, step: 3, floor: 9, era2From: 3, saturation: 0.8,
  },
  'hon-loan': {
    key: 'hon-loan', name: 'Hỗn loạn', short: 'Liên miên',
    desc: 'Sự kiện dồn dập, động đất và cưỡng chế từ rất sớm. Ván ngắn, khó lường.',
    base: 14, step: 2, floor: 7, era2From: 1, saturation: 0.6,
  },
};

export const DEFAULT_EVENT_LEVEL = 'chuan';

/** Đủ vòng này thì mở khoá dù đất chưa bán hết — đề phòng bàn ế đất mãi. */
export const UNLOCK_LAPS = 8;

/** Điểm áp lực cộng vào thanh Thời Cuộc, theo từng việc xảy ra trên bàn. */
export const PRESSURE = {
  /** Một người qua ô Bắt Đầu. */
  lap: 1,
  /** Hết một lượt mà **không đồng nào đổi chủ** — đúng triệu chứng bàn bí. */
  dryTurn: 2,
  /** Một đề nghị giao dịch bị từ chối. */
  tradeRefused: 1,
  /** Có người phải cắm đất lấy tiền mặt — dấu hiệu bàn đang cạn. */
  mortgage: 3,
};
