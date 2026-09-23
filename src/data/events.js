/**
 * Bộ thẻ THỜI CUỘC — sự kiện toàn bàn, khác hẳn Cơ Hội / Khí Vận.
 *
 * Cơ Hội và Khí Vận là chuyện riêng của người vừa đáp xuống ô. Thời Cuộc thì
 * nổ ra cho **cả bàn** cùng chịu, và được sinh ra để chữa đúng một cái bệnh:
 * chơi ít người, đất bán hết, không ai chịu đổi chác — từ đó mỗi lượt chỉ còn
 * lắc xí ngầu đi vòng vòng, tiền đứng yên, ván không có đường kết thúc.
 *
 * ── Một chồng bài duy nhất ─────────────────────────────────────────────────
 * Trước đây bộ thẻ chia làm hai kỳ: kỳ 1 chỉ đụng tiền mặt, kỳ 2 mới đụng nhà
 * đất và chỉ mở sau vài lần nổ đầu. Cách chia ấy làm mấy lần nổ đầu ván gần
 * như vô hại — đúng lúc bàn cần bị xáo thì lại toàn thẻ cộng trừ tiền lẻ. Nay
 * cả bộ nằm chung một chồng, **tỉ lệ ra ngang nhau**: động đất có thể tới ngay
 * lần nổ đầu tiên. Thẻ nào lúc ấy vô nghĩa (ân xá khi không ai ngồi tù) thì
 * `core/events.js` bỏ qua và bốc lá kế tiếp, nên không cần chia kỳ để chặn.
 *
 * ── Đổi giá thì vĩnh viễn, cấm đoán thì có hạn ─────────────────────────────
 * Thẻ đụng tới **giá cả** (tiền thuê, lương, giá xây) không còn đếm ngược:
 * chúng dời hẳn mặt bằng giá của ván. Thẻ **chặn một việc** (giới nghiêm cấm
 * xây, mất giấy tờ treo một ô) thì vẫn có hạn — cấm xây vĩnh viễn là khoá luôn
 * đường duy nhất làm tiền thuê lớn lên, ván sẽ đứng im chứ không ngắn lại.
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
 * `heavy` đánh dấu thẻ đụng tới nhà cửa hoặc quyền sở hữu — băng chuyền bóc
 * thẻ (`ui/caseOpen.js`) xếp mấy lá ấy vào hạng Hiếm. Trước đây nó xét theo
 * kỳ; kỳ bỏ rồi nên cờ này khai thẳng trên thẻ.
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

/**
 * Dòng đóng của mấy thẻ **đổi giá vĩnh viễn**.
 *
 * Thẻ đổi giá mà hết hạn sau hai vòng thì cả bàn chỉ việc ngồi im chờ nó qua:
 * không xây, không đổi chác, đợi luật trả về như cũ rồi chơi tiếp — đúng cái
 * thế bí mà bộ thẻ này sinh ra để phá. Đổi giá vĩnh viễn thì mặt bằng giá của
 * ván dịch hẳn đi, ai cũng phải tính lại từ nước kế tiếp.
 *
 * `addMod` gộp theo `id` nên rút lại lá cũ không nhân đôi hệ số; `usable` bên
 * `core/events.js` cũng bỏ qua lá nào đã nằm sẵn trên bàn.
 */
const forever = 'Hiệu lực vĩnh viễn — từ giờ tới hết ván';

/** Phần trăm gọn gàng: 1.25 → "+25%", 0.5 → "−50%". */
const pct = (mult) => `${mult >= 1 ? '+' : '−'}${Math.round(Math.abs(mult - 1) * 100)}%`;

export const EVENTS = [
  /* -------------------------------------------- Tiền mặt và luật tạm thời */
  {
    id: 'thue-dien-tho', kind: 'bad', sigil: '⚖',
    title: 'SƯU CAO THUẾ NẶNG',
    text: `Toà Đô Chánh ra lệnh trưng thu sưu thuế điền thổ toàn hạt Gia Định.
           Nhà nào cửa nấy đều bị gọi tên, không ai khất được.`,
    /* Đơn giá cũ (25/100) thu của một bộ ba ô đủ nhà chưa tới 300$ — bằng một
       lần tiền thuê, không đủ bắt ai phải bán bớt. Nay mỗi nóc nhà nộp hơn nửa
       giá xây, tức xây dày thì thuế mới thành khoản phải tính trước. */
    perHouse: 60, perHotel: 250,
    effect: (c) => [
      `Mỗi căn nhà nộp ${money(c.perHouse)}, mỗi khách sạn ${money(c.perHotel)}`,
      'Cả bàn cùng nộp, tiền dồn hết vào Quỹ Công',
      'Thiếu tiền mặt thì ngân hàng tự thế chấp và hạ nhà để thu',
    ],
  },
  {
    id: 'lam-phat', kind: 'chaos', sigil: '↑',
    title: 'GIÁ GẠO LEO THANG',
    text: `Gạo Chợ Lớn khan hàng, cái gì cũng lên giá theo. Chủ nhà nhân dịp
           hét thêm, người thuê đành cắn răng chịu.`,
    mult: 1.25,
    effect: (c) => [
      `Tiền thuê khắp bàn ${pct(c.mult)}`,
      forever,
    ],
  },
  {
    id: 'mat-mua', kind: 'bad', sigil: '☵',
    title: 'MẤT MÙA',
    text: `Nước lũ về sớm, ruộng miền Tây ngập trắng. Thóc không về tới vựa,
           đồng lương cũng hụt theo.`,
    mult: 0.5,
    effect: (c) => [
      `Lương lãnh khi qua ô Bắt Đầu ${pct(c.mult)}`,
      forever,
    ],
  },
  {
    id: 'bao-gia', kind: 'bad', sigil: '⚒',
    title: 'BÃO GIÁ VẬT LIỆU',
    text: `Xi măng với gỗ lim đội giá gấp rưỡi. Nhà thầu nào cũng lắc đầu
           hẹn lại sang năm.`,
    mult: 1.5,
    effect: (c) => [
      `Giá xây mỗi căn nhà ${pct(c.mult)}`,
      'Nhà đã xây rồi thì không phải bù thêm',
      forever,
    ],
  },
  {
    id: 'siet-tin-dung', kind: 'bad', sigil: '✎',
    title: 'NGÂN HÀNG SIẾT TÍN DỤNG',
    text: `Ngân Hàng Đông Dương rà lại sổ nợ, gọi từng người đang cắm đất
           lên đối chiếu.`,
    /* Lãi 10% của giá thế chấp là 5% giá gốc — cắm ba lô rẻ chỉ mất vài chục,
       ai cũng cắm bừa. 25% mới đủ để thế chấp là nước đi có giá, và mới rút
       được tiền ra khỏi bàn. */
    rate: 0.25,
    effect: (c) => [
      `Ai đang thế chấp phải đóng lãi ${Math.round(c.rate * 100)}% tổng giá thế chấp`,
      'Đóng ngay một lần, không khất và không chuộc đất thay được',
    ],
  },
  {
    id: 'gioi-nghiem', kind: 'chaos', sigil: '⊘',
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
    id: 'hoi-cho', kind: 'good', sigil: '✦',
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
    id: 'an-xa', kind: 'good', sigil: '✧',
    title: 'ÂN XÁ',
    text: `Nhân lễ lớn, Khám Lớn mở cửa tha cho hết những người đang bị giam.`,
    effect: () => [
      'Mọi người đang ngồi Khám Lớn được thả ngay',
      'Không mất tiền chuộc, không tốn vé ra tù',
    ],
  },
  {
    id: 'quy-cong-phat-chan', kind: 'good', sigil: '❖',
    title: 'QUỸ CÔNG PHÁT CHẨN',
    text: `Quỹ Công đem tiền ra phát chẩn ngay tại Bến Đậu, dân kéo tới
           chật cả bến.`,
    bonus: 150,
    effect: (c) => [
      `Ngân hàng bỏ thêm ${money(c.bonus)} vào Quỹ Công`,
      'Ai ghé ô Bến Đậu trước tiên thì ẵm trọn cả quỹ',
    ],
  },

  /* ------------------------------------- Nhà cửa và quyền sở hữu (`heavy`) */
  {
    id: 'dong-dat', kind: 'bad', sigil: '☳', heavy: true,
    title: 'ĐỘNG ĐẤT',
    text: `Đất rung một trận, cả khu nứt tường sập mái. Người ta đổ ra đường
           đứng nhìn nhà mình.`,
    /**
     * Phí chống đỡ mỗi ô có nhà = **đúng giá xây một căn** ở ô ấy.
     *
     * Trước đây chỉ lấy nửa giá xây, nên chống đỡ luôn là nước đi hiển nhiên:
     * trả 50$ để khỏi mất một cấp nhà đáng 100$ thì ai cũng trả, thẻ chỉ còn
     * là một khoản phí nhỏ. Lấy đúng giá xây thì hai đường thiệt hại ngang
     * nhau — mất tiền mặt hay mất nhà đều đau, người chơi phải thật sự chọn.
     */
    braceRate: 1,
    effect: (c) => [
      'Bốc thăm một khu màu — cả khu cùng rung, ô chưa cất nhà thì vô sự',
      `Chủ đất được hỏi: trả ${Math.round(c.braceRate * 100)}% giá xây mỗi ô có nhà để giữ nguyên`,
      'Không trả thì mỗi ô ấy sập một cấp nhà, không đền một đồng',
    ],
  },
  {
    id: 'hoa-hoan', kind: 'bad', sigil: '☲', heavy: true,
    title: 'HOẢ HOẠN',
    text: `Lửa bén từ một tiệm dầu, cháy lan cả dãy phố. Phu chữa cháy đứng
           chờ tiền công mới chịu kéo vòi.`,
    /**
     * Tiền thuê phu chữa cháy = 80% giá xây của phần nhà sắp cháy.
     *
     * 40% cũ rẻ tới mức không ai buồn cân nhắc. Giữ dưới 100% một chút là cố
     * ý: hoả hoạn lấy đi **nhiều cấp hơn** động đất, nên chữa vẫn phải là
     * đường có lời — nhưng lời ít, và phải có sẵn tiền mặt mới chữa được.
     */
    saveRate: 0.8,
    effect: (c) => [
      'Bốc thăm một khu màu — cả khu cùng cháy, ô chưa cất nhà thì vô sự',
      `Chủ đất được hỏi: trả ${Math.round(c.saveRate * 100)}% giá xây phần sắp cháy thì nhà còn nguyên`,
      'Không trả thì mỗi ô mất nửa số nhà, làm tròn lên',
    ],
  },
  {
    id: 'mat-giay-to', kind: 'chaos', sigil: '☗', heavy: true,
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
    id: 'trung-thu', kind: 'chaos', sigil: '⚑', heavy: true,
    title: 'TRƯNG THU QUY HOẠCH',
    text: `Nhà nước mở đại lộ, cắm mốc ngay giữa đất của người giàu nhất bàn.`,
    effect: () => [
      'Lấy lô đắt nhất chưa xây nhà của người giàu nhất bàn',
      'Chủ cũ được đền đúng bằng giá thế chấp',
      'Lô ấy đem đấu giá kín, cả bàn tranh nhau kể cả chủ cũ',
    ],
  },
  {
    id: 'sang-nhuong', kind: 'chaos', sigil: '⇥', heavy: true,
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
    id: 'hoan-doi-dia-ba', kind: 'chaos', sigil: '⇄', heavy: true,
    title: 'HOÁN ĐỔI ĐỊA BẠ',
    text: `Sổ địa bạ bị chép lộn cả loạt, tên chủ này nằm trên đất chủ kia.`,
    effect: () => [
      'Mỗi người tự chọn một lô chưa xây nhà, giao cho người kế tiếp trong vòng đi',
      'Đổi thành một vòng khép kín: ai cho một lô thì cũng nhận một lô',
      'Nhà cửa không sang tên theo, nên chỉ chọn được ô chưa xây',
    ],
  },
  {
    id: 'mo-duong', kind: 'good', sigil: '⌁', heavy: true,
    title: 'MỞ ĐƯỜNG LỚN',
    text: `Đại lộ mới xẻ ngang một khu, xe cộ chạy suốt ngày đêm, đất hai bên
           đường lên giá thấy rõ.`,
    mult: 1.5,
    effect: (c) => [
      'Bốc thăm một khu màu đã có chủ',
      `Tiền thuê cả khu ấy ${pct(c.mult)}`,
      forever,
    ],
  },
  {
    id: 'dai-ha-gia', kind: 'good', sigil: '⚑', heavy: true,
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

/**
 * Bốn nấc do chủ phòng chọn trước khi khai cuộc.
 *
 * Nấc chỉ điều chỉnh **tỉ lệ ra**, không đổi bộ thẻ: cùng một chồng bài, cùng
 * tỉ lệ giữa các lá, chỉ khác nhau ở chỗ thanh áp lực đầy nhanh cỡ nào.
 *
 * Mỗi nấc khai ba số: `base` là ngưỡng của lần nổ đầu, mỗi lần nổ lại hạ bớt
 * `step`, và không bao giờ xuống thấp hơn `floor`. Ba số của nấc Chuẩn đã chia
 * cho 1,5 so với bản trước (20/3/9 → 13/2/6), ba nấc còn lại chia theo cùng hệ
 * số ấy để giữ đúng khoảng cách giữa các nấc.
 *
 * Mốc so sánh: một lượt "bàn bí" cộng 2 điểm, một vòng qua Bắt Đầu cộng 1,
 * một lần cắm đất cộng 3 — xem `PRESSURE` ở cuối tệp.
 */
export const EVENT_LEVELS = {
  off: {
    key: 'off', name: 'Tắt', short: 'Không có sự kiện',
    desc: 'Chơi đúng luật cổ điển — không có thẻ Thời Cuộc nào.',
  },
  nhe: {
    key: 'nhe', name: 'Nhẹ', short: 'Thưa và êm',
    desc: 'Sự kiện thưa, dăm vòng mới có một lần. Bàn phải bán gần hết đất mới bắt đầu.',
    base: 17, step: 2, floor: 9,
    /** Bàn phải bán được bấy nhiêu phần đất mới bắt đầu tính áp lực. */
    saturation: 0.75,
  },
  chuan: {
    key: 'chuan', name: 'Chuẩn', short: 'Nhịp vừa phải',
    desc: 'Vài vòng lại có biến. Động đất, cưỡng chế có thể tới ngay lần nổ đầu.',
    base: 13, step: 2, floor: 6, saturation: 0.6,
  },
  'hon-loan': {
    key: 'hon-loan', name: 'Hỗn loạn', short: 'Nổ liên tục',
    desc: 'Gần như lượt nào cũng có biến, từ rất sớm. Ván ngắn, khó lường.',
    /* `floor: 2` bằng đúng điểm của một lượt bàn bí, tức từ lần nổ thứ ba trở
       đi hầu như lượt nào cũng ra một thẻ. `saturation` hạ xuống 0.3 để khỏi
       phải chờ bán hết đất mới thấy sự kiện đầu tiên. */
    base: 5, step: 1, floor: 2, saturation: 0.3,
  },
};

export const DEFAULT_EVENT_LEVEL = 'chuan';

/** Đủ vòng này thì mở khoá dù đất chưa bán hết — đề phòng bàn ế đất mãi. */
export const UNLOCK_LAPS = 6;

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
