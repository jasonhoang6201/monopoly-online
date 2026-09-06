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
 * Biểu tượng (`sigil`) cố ý chỉ dùng ký tự **đơn sắc** — mấy hình như 🔥 hay ⛩
 * bị trình duyệt vẽ thành emoji màu, nhỏ xíu và lạc hẳn khỏi mặt thẻ giấy dó.
 * Ba quẻ ☳ (chấn — động), ☲ (ly — lửa), ☵ (khảm — nước) vừa đơn sắc vừa đúng
 * chất Á Đông của bộ bài.
 *
 * Mỗi thẻ chỉ mang lời văn và mấy con số cân bằng. Luật thực thi nằm ở
 * `core/events.js` (phần thuần dữ liệu) và `game/controller.js` (phần diễn).
 */

export const EVENTS = [
  /* ------------------------------------------------------------ Kỳ 1 */
  {
    id: 'thue-dien-tho', era: 1, kind: 'bad', sigil: '⚖',
    title: 'SƯU CAO THUẾ NẶNG',
    text: `Toà Đô Chánh ra lệnh trưng thu sưu thuế điền thổ toàn hạt Gia Định.
           Nhà nào cửa nấy đều phải nộp, tiền dồn hết vào Quỹ Công.`,
    perHouse: 25, perHotel: 100,
  },
  {
    id: 'lam-phat', era: 1, kind: 'chaos', sigil: '↑',
    title: 'GIÁ GẠO LEO THANG',
    text: `Gạo Chợ Lớn khan hàng, cái gì cũng lên giá theo. Chủ nhà nhân dịp
           tăng tiền thuê, người thuê đành cắn răng chịu.`,
    mult: 1.25, rounds: 2,
  },
  {
    id: 'mat-mua', era: 1, kind: 'bad', sigil: '☵',
    title: 'MẤT MÙA',
    text: `Nước lũ về sớm, ruộng miền Tây ngập trắng. Lương lãnh khi qua ô
           Bắt Đầu chỉ còn một nửa cho tới khi qua cơn ngặt.`,
    mult: 0.5, rounds: 3,
  },
  {
    id: 'bao-gia', era: 1, kind: 'bad', sigil: '⚒',
    title: 'BÃO GIÁ VẬT LIỆU',
    text: `Xi măng với gỗ lim đội giá gấp rưỡi. Ai đang tính xây cất thì
           nên chờ qua đợt này.`,
    mult: 1.5, rounds: 3,
  },
  {
    id: 'siet-tin-dung', era: 1, kind: 'bad', sigil: '✎',
    title: 'NGÂN HÀNG SIẾT TÍN DỤNG',
    text: `Ngân Hàng Đông Dương rà lại sổ nợ. Ai đang cắm đất phải đóng ngay
           một kỳ lãi, không khất được.`,
    rate: 0.10,
  },
  {
    id: 'gioi-nghiem', era: 1, kind: 'chaos', sigil: '⊘',
    title: 'GIỚI NGHIÊM',
    text: `Lệnh giới nghiêm ban ra, thợ thuyền không ai được ra đường.
           Mọi công trình đình lại.`,
    rounds: 2,
  },
  {
    id: 'hoi-cho', era: 1, kind: 'good', sigil: '✦',
    title: 'HỘI CHỢ ĐẤU XẢO',
    text: `Hội chợ Đấu Xảo mở ở vườn Ông Thượng. Người khố rách nhất bàn
           gánh hàng ra bán, một phen trúng đậm.`,
    amount: 200,
  },
  {
    id: 'an-xa', era: 1, kind: 'good', sigil: '✧',
    title: 'ÂN XÁ',
    text: `Nhân lễ lớn, Khám Lớn mở cửa tha cho hết những người đang bị giam.`,
  },
  {
    id: 'quy-cong-phat-chan', era: 1, kind: 'good', sigil: '❖',
    title: 'QUỸ CÔNG PHÁT CHẨN',
    text: `Quỹ Công đem tiền ra phát chẩn ngay tại Bến Đậu. Ai ghé qua đó
           trước tiên thì ẵm trọn.`,
    bonus: 150,
  },

  /* ------------------------------------------------------------ Kỳ 2 */
  {
    id: 'dong-dat', era: 2, kind: 'bad', sigil: '☳',
    title: 'ĐỘNG ĐẤT',
    text: `Đất rung một trận, cả khu nứt tường sập mái. Nhà cửa trong khu
           đổ mất một tầng, ai muốn chống đỡ thì phải bỏ tiền ngay.`,
    /** Phí chống đỡ mỗi ô = nửa giá xây một căn. */
    braceRate: 0.5,
  },
  {
    id: 'hoa-hoan', era: 2, kind: 'bad', sigil: '☲',
    title: 'HOẢ HOẠN',
    text: `Lửa bén từ một tiệm dầu, cháy lan cả dãy phố sầm uất nhất bàn cờ.
           Thuê phu chữa cháy thì cứu được một nửa.`,
    saveRate: 0.4,
  },
  {
    id: 'mat-giay-to', era: 2, kind: 'chaos', sigil: '☗',
    title: 'MẤT GIẤY TỜ',
    text: `Kho địa bạ cháy sổ, giấy tờ nhà đất thất lạc cả loạt. Ô nào chưa
           làm lại giấy thì không thu được đồng thuê nào.`,
    rounds: 2,
  },
  {
    id: 'trung-thu', era: 2, kind: 'chaos', sigil: '⚑',
    title: 'TRƯNG THU QUY HOẠCH',
    text: `Nhà nước mở đại lộ, trưng thu đất của người giàu nhất bàn, đền bù
           đúng bằng giá thế chấp. Lô đất ấy đem bán đấu giá lại.`,
  },
  {
    id: 'sang-nhuong', era: 2, kind: 'chaos', sigil: '⇥',
    title: 'SANG NHƯỢNG BẮT BUỘC',
    text: `Toà án phát mãi một lô đất theo lệnh cưỡng chế. Chủ cũ nhận đúng
           số tiền bán được, còn ai trả cao nhất thì lấy đất.`,
  },
  {
    id: 'hoan-doi-dia-ba', era: 2, kind: 'chaos', sigil: '⇄',
    title: 'HOÁN ĐỔI ĐỊA BẠ',
    text: `Sổ địa bạ bị chép lộn cả loạt. Mỗi người phải giao một lô đất
           của mình cho người kế tiếp trong vòng đi.`,
  },
  {
    id: 'mo-duong', era: 2, kind: 'good', sigil: '⌁',
    title: 'MỞ ĐƯỜNG LỚN',
    text: `Đại lộ mới xẻ ngang một khu, đất hai bên đường lên giá thấy rõ.
           Tiền thuê cả khu ấy tăng hẳn, và tăng vĩnh viễn.`,
    mult: 1.5,
  },
  {
    id: 'dai-ha-gia', era: 2, kind: 'good', sigil: '⚑',
    title: 'ĐẠI HẠ GIÁ',
    text: `Ngân hàng dọn kho, đem lô đất còn ế ra bán đấu giá — khỏi cần
           chờ ai đáp trúng ô ấy nữa.`,
  },
];

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
