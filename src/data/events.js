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
 * ── Thẻ đẩy tiền ra thì vĩnh viễn, thẻ siết tiền vào thì có hạn ───────────
 * Thẻ **tăng tiền thuê** (lạm phát, mở đường) dời hẳn mặt bằng giá của ván:
 * thuê cao hơn thì người ta vỡ nợ sớm hơn, ván ngắn lại. Thẻ **siết dòng tiền
 * vào** (mất mùa cắt lương, bão giá đội giá xây) thì có hạn: để vĩnh viễn thì
 * cả bàn ít tiền, ít xây, tiền thuê không lớn lên được, ván kéo dài chứ không
 * ngắn lại. Thẻ **chặn một việc** (giới nghiêm cấm xây, mất giấy tờ treo một
 * ô) cũng có hạn vì cùng lý do.
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
 * ── Cuối ván: thẻ tài chính ra dày hơn ─────────────────────────────────────
 * Mấy lần nổ đầu cả chồng ra ngang nhau. Từ lần nổ thứ `LATE_AFTER` trở đi,
 * thẻ mang `late: 'main'` (thuế, giá cả, thiên tai, đổi đất) vẫn ra như cũ,
 * còn thẻ không mang cờ ấy mỗi lần bị rút lên chỉ được giữ với xác suất
 * `LATE_RARE`. Chồng bài xáo lại liên tục nên thẻ bị gạt còn được thử lại:
 * `tests/events.mjs` đo ra chúng xuất hiện chừng 1/3 số lần của thẻ tài chính.
 * Thêm vào đó, sáu thẻ trong `LATE_PRIORITY` (Mở Đường Lớn, Đại Hạ Giá, Hoả
 * Hoạn, Giá Gạo Leo Thang, hai thẻ thuế) được thử trước cả chồng với xác
 * suất tăng dần theo số lần nổ, và hai thẻ thuế mỗi lần ra lại thì thu nặng
 * hơn lần trước.
 * `late: 'off'` là không bao giờ ra nữa: Giới Nghiêm chặn đường xây nhà, mà
 * cuối ván xây nhà là cách duy nhất để ván kết thúc.
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
 * ── Thẻ riêng của một chủ đề ───────────────────────────────────────────────
 * Thẻ mang `theme` (Bão Tuyết, Đường Đóng Băng — `theme: 'christmas'`; Xác
 * Sống, Phù Thuỷ, Trăng Máu — `theme: 'halloween'`) chỉ vào chồng khi ván chơi
 * đúng chủ đề ấy (`cardInTheme` trong `data/themes.js`).
 * Ván chủ đề mặc định giữ nguyên bộ thẻ cũ, không lệch tỉ lệ ra.
 *
 * Luật thực thi nằm ở `core/events.js` (phần thuần dữ liệu) và
 * `game/eventRunner.js` (phần diễn).
 */
import { money } from './board.js';

/** "Còn bấy nhiêu vòng nữa" — mọi thẻ có `rounds` đều đóng bằng dòng này. */
const lasts = (c) => `Kéo dài ${c.rounds} vòng, hết thì luật trả về như cũ`;

/**
 * Dòng đóng của mấy thẻ **tăng tiền thuê vĩnh viễn**.
 *
 * Tăng thuê mà hết hạn sau hai vòng thì cả bàn chỉ việc ngồi im chờ nó qua —
 * đúng cái thế bí mà bộ thẻ này sinh ra để phá. Tăng vĩnh viễn thì mặt bằng
 * giá của ván dịch hẳn đi, ai cũng phải tính lại từ nước kế tiếp.
 *
 * Mất Mùa và Bão Giá thì ngược lại, có hạn: chúng siết tiền **vào** túi người
 * chơi. Để vĩnh viễn thì lương mãi một nửa, giá xây mãi gấp rưỡi, cả bàn ít
 * tiền nên ít mua ít xây, tiền thuê không lớn lên và ván kéo dài thêm.
 *
 * `addMod` gộp theo `id` nên rút lại lá cũ không nhân đôi hệ số; `usable` bên
 * `core/events.js` cũng bỏ qua lá nào đã nằm sẵn trên bàn.
 */
const forever = 'Hiệu lực vĩnh viễn, tới hết ván';

/** Phần trăm gọn gàng: 1.25 → "+25%", 0.5 → "−50%". */
const pct = (mult) => `${mult >= 1 ? '+' : '−'}${Math.round(Math.abs(mult - 1) * 100)}%`;

export const EVENTS = [
  /* -------------------------------------------- Tiền mặt và luật tạm thời */
  {
    id: 'thue-dien-tho', kind: 'bad', sigil: '⚖', late: 'main',
    title: 'SƯU CAO THUẾ NẶNG',
    text: `Toà Đô Chánh ra lệnh trưng thu sưu thuế điền thổ toàn hạt Gia Định.
           Nhà nào cửa nấy đều bị gọi tên, không ai khất được.`,
    /* Thuế này rút tiền của chủ nhà về Quỹ Công, nên ở mức 60/250 người xây
       dày bị trừ nặng mà ván không ngắn đi. Ván kết thúc nhờ tiền thuê (xem
       RENT_TABLE trong data/board.js); thuế chỉ giữ mức nhắc chủ nhà để dành
       tiền mặt. */
    perHouse: 30, perHotel: 120,
    /* Mỗi lần thẻ đã ra trước đó cộng thêm 1/4 đơn giá gốc: lần hai 38/150,
       lần ba 45/180. */
    stack: 0.25,
    effect: (c) => [
      `Mỗi căn nhà nộp ${money(c.perHouse)}, mỗi khách sạn ${money(c.perHotel)}`,
      `Mỗi lần thẻ này ra lại, đơn giá cộng thêm ${Math.round(c.stack * 100)}% mức gốc`,
      'Tiền dồn hết vào Quỹ Công, thiếu tiền mặt thì ngân hàng tự thế chấp và hạ nhà để thu',
    ],
  },
  {
    id: 'thue-khu', kind: 'bad', sigil: '⚖', late: 'main',
    title: 'THUẾ THỔ TRẠCH',
    text: `Sở Địa Chính đo lại từng lô trong một khu phố, tính thuế theo giá
           đất và số nóc nhà đang đứng trên đó.`,
    /* Tính trên giá gốc của đất cộng giá xây đã đổ vào, nên khu đắt và khu
       xây dày nộp nhiều hơn; khu mới mua đất trống chỉ nộp phần nhỏ. */
    rate: 0.08,
    /* Mỗi lần thẻ đã ra trước đó (khu nào cũng tính) cộng thêm `rateStep` vào
       thuế suất, chặn ở `rateCap`: 8%, 11%, 14%… tới 20%. Mức cũ 15% → 40%
       đánh chủ đất nặng hơn cả tiền thuê họ thu được. */
    rateStep: 0.03, rateCap: 0.2,
    effect: (c) => [
      'Bốc thăm một khu màu đã có chủ',
      `Chủ đất trong khu nộp ${Math.round(c.rate * 100)}% giá đất cộng giá nhà đã xây ở khu ấy`,
      `Mỗi lần thẻ này ra lại, thuế suất cộng thêm ${Math.round(c.rateStep * 100)}%, tối đa ${Math.round(c.rateCap * 100)}%`,
    ],
  },
  {
    id: 'lam-phat', kind: 'chaos', sigil: '↑', late: 'main',
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
    id: 'mat-mua', kind: 'bad', sigil: '☵', late: 'main',
    title: 'MẤT MÙA',
    text: `Nước lũ về sớm, ruộng miền Tây ngập trắng. Thóc không về tới vựa,
           đồng lương cũng hụt theo.`,
    mult: 0.5, rounds: 2,
    effect: (c) => [
      `Lương lãnh khi qua ô Bắt Đầu ${pct(c.mult)}`,
      lasts(c),
    ],
  },
  {
    id: 'bao-gia', kind: 'bad', sigil: '⚒', late: 'main',
    title: 'BÃO GIÁ VẬT LIỆU',
    text: `Xi măng với gỗ lim đội giá gấp rưỡi. Nhà thầu nào cũng lắc đầu
           hẹn lại sang năm.`,
    mult: 1.5, rounds: 2,
    effect: (c) => [
      `Giá xây mỗi căn nhà ${pct(c.mult)}`,
      'Nhà đã xây rồi thì không phải bù thêm',
      lasts(c),
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
    id: 'gioi-nghiem', kind: 'chaos', sigil: '⊘', late: 'off',
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
    id: 'dong-dat', kind: 'bad', sigil: '☳', heavy: true, late: 'main',
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
      'Bốc thăm một khu màu. Cả khu cùng rung, ô chưa có nhà thì vô sự',
      `Chủ đất được hỏi: trả ${Math.round(c.braceRate * 100)}% giá xây mỗi ô có nhà để giữ nguyên`,
      'Không trả thì mỗi ô ấy sập một cấp nhà, không đền một đồng',
    ],
  },
  {
    id: 'hoa-hoan', kind: 'bad', sigil: '☲', heavy: true, late: 'main',
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
      'Bốc thăm một khu màu. Cả khu cùng cháy, ô chưa có nhà thì vô sự',
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
    id: 'sang-nhuong', kind: 'chaos', sigil: '⇥', heavy: true, late: 'main',
    title: 'SANG NHƯỢNG BẮT BUỘC',
    text: `Toà án tuyên phát mãi một lô đất theo lệnh cưỡng chế, dán giấy
           ngay trước cổng.`,
    effect: () => [
      'Bốc thăm một lô đất chưa xây nhà trên bàn',
      'Đem đấu giá kín, chủ cũ không được mua lại',
      'Bán được bao nhiêu chủ cũ nhận trọn bấy nhiêu',
    ],
  },
  {
    id: 'hoan-doi-dia-ba', kind: 'chaos', sigil: '⇄', heavy: true, late: 'main',
    title: 'HOÁN ĐỔI ĐỊA BẠ',
    text: `Sổ địa bạ bị chép lộn cả loạt, tên chủ này nằm trên đất chủ kia.`,
    effect: () => [
      'Mỗi người tự chọn một lô chưa xây nhà, giao cho người kế tiếp trong vòng đi',
      'Đổi thành một vòng khép kín: ai cho một lô thì cũng nhận một lô',
      'Nhà cửa không sang tên theo, nên chỉ chọn được ô chưa xây',
    ],
  },
  {
    id: 'mo-duong', kind: 'good', sigil: '⌁', heavy: true, late: 'main',
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
  /* ------------------------------------------- Riêng chủ đề Giáng Sinh */
  {
    id: 'bao-tuyet', kind: 'bad', sigil: '❆', heavy: true, late: 'main', theme: 'christmas',
    title: 'BÃO TUYẾT',
    text: `Đêm Giáng Sinh, một trận tuyết hiếm thấy đổ xuống Sài Gòn. Mái ngói
           không chịu nổi sức nặng, cả một dãy phố sụp mái.`,
    /**
     * Cùng khuôn với động đất và hoả hoạn: bốc thăm một khu, chủ đất chọn bỏ
     * tiền hay chịu mất nhà. Tiền thuê phu xúc tuyết = 90% giá xây phần sắp
     * sập, nằm giữa động đất (100%) và hoả hoạn (80%). Chỗ khác là khách sạn:
     * mái rộng hứng nhiều tuyết nên sập hai cấp — người xây cao nhất chịu nặng
     * nhất, đúng lúc cần kéo người dẫn đầu xuống.
     */
    clearRate: 0.9,
    effect: (c) => [
      'Bốc thăm một khu màu. Cả khu cùng hứng tuyết, ô chưa có nhà thì vô sự',
      `Chủ đất được hỏi: trả ${Math.round(c.clearRate * 100)}% giá xây phần sắp sập để thuê phu xúc tuyết`,
      'Không trả thì mỗi ô sập một cấp nhà, khách sạn mái rộng sập hai cấp, không đền bù',
    ],
  },
  {
    id: 'duong-dong-bang', kind: 'chaos', sigil: '❅', theme: 'christmas',
    title: 'ĐƯỜNG ĐÓNG BĂNG',
    text: `Mặt đường Catinat đóng một lớp băng mỏng. Xe kéo, xe ngựa, người đi
           bộ đều trượt quá chỗ định dừng.`,
    /* Đẩy quân tới những ô người ta không định tới: tiền thuê có đường chảy
       mới, đúng cái bệnh bàn bí mà bộ thẻ sinh ra để chữa. Có hạn vì trượt
       mãi thì xí ngầu không còn nghĩa lý gì. */
    rounds: 2,
    effect: (c) => [
      'Mỗi lần lắc xí ngầu đi, quân trượt thêm 1 hoặc 2 ô',
      'Trượt qua ô Bắt Đầu vẫn lãnh lương',
      lasts(c),
    ],
  },
  /* ---------------------------------------------- Riêng chủ đề Halloween */
  {
    id: 'xac-song', kind: 'bad', sigil: '☠', heavy: true, late: 'main', theme: 'halloween',
    title: 'XÁC SỐNG TRÀN PHỐ',
    text: `Nửa đêm, mộ ở nghĩa địa Massiges bật nắp. Một đám xác sống lê bước ra
           phố, chiếm nhà người ta mà ở.`,
    /**
     * Không phá nhà như động đất: xác sống chặn **dòng tiền thuê** của cả khu.
     * Chủ đất trả một khoản nhỏ (60% giá xây một căn cho mỗi ô của mình trong
     * khu) thì giữ được, không trả thì ai đáp vào khu ấy cũng khỏi trả tiền
     * thuê suốt `rounds` vòng. Có hạn vì cùng lý do với Mất Giấy Tờ: chặn
     * mãi thì người bị chiếm không còn đường thắng.
     */
    exorciseRate: 0.6, rounds: 2,
    effect: (c) => [
      'Bốc thăm một khu màu đang có nhà. Cả khu bị xác sống kéo tới',
      `Chủ đất được hỏi: trả ${Math.round(c.exorciseRate * 100)}% giá xây một căn cho mỗi ô của mình để mời thầy pháp`,
      `Không trả thì ô ấy bị chiếm ${c.rounds} vòng: ai đáp vào cũng khỏi trả tiền thuê`,
    ],
  },
  {
    id: 'phu-thuy', kind: 'chaos', sigil: '☾', heavy: true, theme: 'halloween',
    title: 'PHÙ THUỶ CƯỠI CHỔI',
    text: `Mụ phù thuỷ bay ngang thành phố, lẩm bẩm câu chú, rồi hai tờ bằng
           khoán tự bay sang nhà nhau.`,
    /* Hai lô chênh giá không quá `priceGap` để không ai bị đổi một lô Catinat
       lấy cái ao cá. Ép đất đổi chủ mà không cần ai gật đầu: đúng thứ bộ thẻ
       sinh ra để phá thế bí. */
    priceGap: 0.2,
    effect: (c) => [
      'Bốc thăm hai ô đất chưa có nhà của hai chủ khác nhau',
      `Giá mua hai ô chênh nhau không quá ${Math.round(c.priceGap * 100)}%`,
      'Hai ô đổi chủ cho nhau, không ai trả tiền. Ô đang thế chấp vẫn thế chấp',
    ],
  },
  {
    id: 'trang-mau', kind: 'chaos', sigil: '●', theme: 'halloween',
    title: 'ĐÊM TRĂNG MÁU',
    text: `Trăng đỏ như máu. Nhà nào thắp đèn thì khách kéo tới đông, đất trống
           không ai dám bén mảng.`,
    mult: 1.5, rounds: 2,
    effect: (c) => [
      `Tiền thuê ô đất có nhà ${pct(c.mult)}`,
      'Ô đất chưa có nhà không thu tiền thuê',
      lasts(c),
    ],
  },
  {
    id: 'dai-ha-gia', kind: 'good', sigil: '⚑', heavy: true, late: 'main',
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
    desc: 'Chơi luật cổ điển, không có thẻ Thời Cuộc.',
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

/** Nổ đủ bấy nhiêu lần thì vào pha cuối ván — xem ghi chú đầu tệp. */
export const LATE_AFTER = 4;
/** Pha cuối ván, thẻ không mang `late: 'main'` chỉ còn tỉ lệ ra này. */
export const LATE_RARE = 0.1;

/**
 * Pha cuối ván, mấy thẻ này được ưu tiên **ngoài chồng bài**: mỗi lần nổ, trước
 * khi rút chồng, từng thẻ được thử với xác suất `base + step × (số lần nổ đã
 * qua mốc LATE_AFTER)`, chặn ở `cap`. Trúng thì ra luôn, kể cả khi vừa ra lần
 * trước, nên hai thẻ thuế ra được nhiều lần liền và mức thu dồn lên.
 *
 * Vì sao là mấy thẻ này: đất còn ế cuối ván là đất không ai chịu đi tới để
 * mua, đem đấu giá thì nó có chủ và bắt đầu thu thuê. Mở Đường Lớn và Giá Gạo
 * Leo Thang nâng tiền thuê, Hoả Hoạn bắt chủ nhà trả tiền chữa hoặc mất nhà;
 * cả ba làm người chơi cạn tiền qua tiền thuê nên ván ngắn lại. Ba thẻ ấy được
 * trần cao hơn hai thẻ thuế nhà: thuế đánh theo số nóc nhà thì người chơi
 * ngại xây, mà cuối ván xây nhà là đường chính để có người thắng.
 *
 * Giá Gạo Leo Thang chỉ ra một lần mỗi ván (`usable` chặn khi đang có hiệu
 * lực), Hoả Hoạn chỉ ra khi bàn đã có nhà, nên thử trúng mà không dùng được
 * thì lượt thử ấy bỏ qua.
 *
 * Trần cộng lại vừa phải: sáu lần thử độc lập, ở trần thì chừng một nửa số
 * lần nổ rơi vào nhóm này, phần còn lại vẫn rút chồng nên động đất, sang
 * nhượng, hoán đổi địa bạ vẫn ra.
 */
export const LATE_PRIORITY = {
  'mo-duong':      { base: 0.08, step: 0.03, cap: 0.15 },
  'dai-ha-gia':    { base: 0.08, step: 0.03, cap: 0.15 },
  'hoa-hoan':      { base: 0.06, step: 0.02, cap: 0.12 },
  'lam-phat':      { base: 0.06, step: 0.02, cap: 0.12 },
  'thue-khu':      { base: 0.05, step: 0.02, cap: 0.1 },
  'thue-dien-tho': { base: 0.03, step: 0.01, cap: 0.06 },
};

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
