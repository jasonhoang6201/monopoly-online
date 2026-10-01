/**
 * Cây kỹ năng — dữ liệu thuần. Luật tính số nằm ở core/skills.js, phần hỏi
 * người chơi ở game/skillPlay.js.
 *
 * Mỗi lần đi ngang ô Bắt Đầu người chơi được +1 điểm. Khung giá cố định cho cả
 * năm nhánh để so được sức mạnh giữa các nhánh bằng cùng một thước:
 *
 *   cấp 1 ─ 1 điểm
 *   cấp 2 ─ rẽ ba, mỗi ô 1 điểm
 *   cấp 3 ─ hai ô, mỗi ô 1 điểm
 *   cấp 3 nhánh phụ ─ hai ô 'c' / 'd', cũng 1 điểm, mọc từ cấp 2 nhưng
 *           **không** dẫn lên tối thượng: lựa chọn ngang theo thế cờ, đứng
 *           một hàng riêng giữa cấp 2 và cấp 3 trên cây
 *   tối thượng ─ hai ô, mỗi ô 2 điểm, mỗi ô mọc từ một ô cấp 3 của chính
 *           nhánh đó; học một ô thì ô kia khoá (xem `canLearn`)
 *
 * Đi thẳng một nhánh thì tốn 5 điểm là chạm tối thượng, 9 điểm là học trọn
 * ở level 1; mỗi ô lên được level 3 (xem `LEVEL_COST`). Giá cũ (cấp 3 là 2
 * điểm, tối thượng 3) cần 7 lần qua ô Bắt Đầu mới chạm tối thượng, mà một ván
 * mỗi người chỉ qua chừng 6–8 lần: phần lớn ván kết thúc trước khi ai học tới.
 *
 * Không kỹ năng nào có hiệu lực tạm "vài lượt rồi hết": hoặc vĩnh viễn, hoặc
 * reset mỗi lần qua ô Bắt Đầu, hoặc dùng được lại sau một số lần qua ô ấy.
 * Người chơi đã chọn một nhánh thì muốn thấy nhánh đó làm việc suốt ván.
 *
 * Chữ mô tả viết bằng chỗ trống `{…}` rồi mới điền số của level đang có (xem
 * `fillText` trong core/skills.js): chỉnh số cân bằng ở một chỗ là chữ hiện
 * cho người chơi đổi theo, không lệch nhau.
 *   {x}  → số trơn      {$x} → "20$"      {%x} → "35%"
 * Số dạng khoảng `[10, 40]` hiện thành "10–40$".
 */

/** Giá mở ô theo tầng — sửa ở đây là cả năm nhánh đổi theo. */
export const TIER_COST = { 1: 1, 2: 1, 3: 1, 4: 2 };

/**
 * Mỗi ô có 3 level. Học ô = level 1 (trả giá tầng ở trên); lên level 2, level
 * 3 mỗi lần thêm đúng chừng này điểm, ô nào cũng vậy. Giá lên level không nhân
 * theo tầng vì điểm hiếm — chạy thử một ván 48 lượt mỗi người chỉ qua ô Bắt
 * Đầu chừng 2 lần — nên nâng level phải là lựa chọn ngang giá với mở ô mới:
 * đào sâu vài ô hay trải rộng sang ô khác.
 *
 * Có điểm chưa đủ: phải đạt điều kiện `grow` của ô đó trước (xem `SKILLS`).
 */
export const LEVEL_COST = 1;
export const MAX_LEVEL = 3;

/**
 * Các kiểu điều kiện lên level (`grow.by` của từng ô):
 *   gain   — tổng tiền kỹ năng đã mang về từ lúc học (nhận thêm, hoặc được
 *            bớt khi phải trả), ghi ở `Player.skillUse` (xem `credit`)
 *   uses   — số lần kỹ năng đã chạy từ lúc học, cũng ở `Player.skillUse`
 *   lands  — số ô (đất, bến/ga, công ty) **đang** có, kể cả ô thế chấp
 *   worth  — tổng tài sản đang có, tính như bảng xếp hạng (`netWorth`)
 *   colors — số màu đất khác nhau đang có ít nhất 1 ô
 * Ba kiểu `estate` đo lúc bấm lên level: bán đất rồi thì phải gom lại, nhưng
 * level đã lên thì giữ.
 */
export const GROW_BY = {
  gain:   { money: true, say: 'Kiếm được {n} từ kỹ năng này' },
  uses:   { unit: 'lần', say: 'Kỹ năng chạy {n} lần' },
  lands:  { unit: 'ô', estate: true, say: 'Sở hữu {n} ô đất, bến/ga hoặc công ty' },
  worth:  { money: true, estate: true, say: 'Tổng tài sản đạt {n}' },
  colors: { unit: 'màu', estate: true, say: 'Sở hữu đất ở {n} màu khác nhau' },
};

export const KINDS = {
  passive: { name: 'Tự động' },
  active:  { name: 'Bấm để dùng' },
};

/**
 * Phí tẩy điểm: mỗi điểm hoàn lại tốn chừng này tiền mặt. Tẩy là tẩy cả cây —
 * gỡ lẻ một ô thì các ô mọc trên nó mất chỗ đứng, phải gỡ dây chuyền, rối hơn
 * nhiều mà không thêm lựa chọn nào đáng kể.
 */
export const RESPEC_FEE = 50;

/**
 * Màu hào quang khi học tối thượng ở **2–3 nhánh**: mỗi tổ hợp một màu riêng,
 * không tổ hợp nào trùng màu tổ hợp nào. Không pha đúng kiểu pha sơn — pha thật
 * thì xanh trời + đỏ cam ra nâu xám, hào quang trông đục.
 *
 * Cách ra bảng: lấy sắc độ ở giữa các màu nhánh trên bánh xe màu hội hoạ (đỏ +
 * xanh dương → tím, xanh dương + vàng → xanh lá), rồi ghép mỗi tổ hợp với một
 * trong 10 sắc độ cách đều nhau sao cho tổng độ lệch nhỏ nhất. 2 nhánh lấy tông
 * rực, 3 nhánh lấy tông sáng — cùng sắc độ thì vẫn phân biệt được bằng độ sáng.
 * Từ 4 nhánh trở lên thì không theo bảng này: xem `ULT_SPECIAL`.
 * Khoá là key các nhánh, xếp theo thứ tự trong `BRANCHES`.
 */
export const ULT_MIX = {
  'congnhan,duhanh': '#FA29BB',
  'congnhan,doden': '#FA2929',
  'congnhan,dauco': '#F9D006',
  'congnhan,ancu': '#C8F906',
  'duhanh,doden': '#9829FA',
  'duhanh,dauco': '#06F9BC',
  'duhanh,ancu': '#29D0FA',
  'doden,dauco': '#FA8A29',
  'doden,ancu': '#2968FA',
  'dauco,ancu': '#0EF906',
  'congnhan,duhanh,doden': '#C17AFF',
  'congnhan,duhanh,dauco': '#FFE252',
  'congnhan,duhanh,ancu': '#7AE4FF',
  'congnhan,doden,dauco': '#FFB87A',
  'congnhan,doden,ancu': '#FF7A7A',
  'congnhan,dauco,ancu': '#57FF52',
  'duhanh,doden,dauco': '#FF7AD7',
  'duhanh,doden,ancu': '#7AA2FF',
  'duhanh,dauco,ancu': '#52FFD4',
  'doden,dauco,ancu': '#DCFF52',
};

/**
 * 4 tối thượng: đen; đủ 5: trắng. Một ván hiếm khi đi được tới đó nên màu đặc
 * biệt đáng giá hơn màu pha — nhìn là biết ngay người này đã đi xa cỡ nào.
 */
export const ULT_SPECIAL = { 4: '#141414', 5: '#FFFFFF' };

/** Số cách hai viên xí ngầu ra tổng n (2..12): 1, 2, … 6, … 2, 1. */
export const WAYS = (n) => 6 - Math.abs(n - 7);

/**
 * Bộ số một level của Xổ Số Kiến Thiết: `ev` là kỳ vọng mỗi lần đối thủ lắc,
 * tiền thưởng của tổng n = ev × 36 / số cách ra n, làm tròn 5$. `p7`, `p6`,
 * `p2` chỉ để chữ mô tả điền số; lúc trả tiền tính lại bằng `lottoPrize`.
 */
function lotto(ev) {
  const at = (n) => Math.round((ev * 36) / WAYS(n) / 5) * 5;
  return { ev, p7: at(7), p6: at(6), p2: at(2) };
}

export const BRANCHES = [
  { key: 'congnhan', name: 'Công Nhân Ưu Tú',  color: '#E2743A' },
  { key: 'duhanh',   name: 'Nhà Du Hành',      color: '#3C8FE0' },
  { key: 'doden',    name: 'Tay Chơi Đỏ Đen',  color: '#D2463A' },
  { key: 'dauco',    name: 'Nhà Đầu Cơ',       color: '#D4A24C' },
  { key: 'ancu',     name: 'Thường Dân An Cư', color: '#2E9E70' },
];

/**
 * `requires`: **một** ô cha — học ô cha rồi mới học được ô này. Cấp 1 để
 * trống, mọc thẳng từ gốc. Chỉ cần ô cha level 1, không đòi level cao. Mỗi ô
 * một cha để đường đi trên cây là một lựa chọn rõ ràng: đi đường này thì
 * không đi đường kia với cùng số điểm.
 * `slot`: vị trí trong hàng, trái sang phải. Cách nối giống nhau ở cả năm nhánh:
 *   cấp 2 'a' → cấp 3 'a' → tối thượng 'a'
 *   cấp 2 'b' → cấp 3 'b' → tối thượng 'b';  cấp 2 'b' → nhánh phụ 'c'
 *   cấp 2 'c' → nhánh phụ 'd'
 *
 * `levels`: bộ số của level 1, 2, 3. Một số viết thành `[thấp, cao]` là
 * **ngẫu nhiên trong khoảng** — rút lại mỗi lần kỹ năng chạy (`roll` trong
 * core/skills.js). Chỉ level 1 có khoảng, và chỉ ở khoản tiền trao tay một
 * lần; level 2 chốt một số khá hơn trung bình khoảng đó, level 3 cao hơn nữa.
 * Hệ số nằm trong phép tính thuê hay giá xây thì không bao giờ là khoảng: số
 * đó còn hiện lên hộp hỏi và bảng giá, rút ngẫu nhiên thì mỗi lần mở ra một
 * giá khác.
 *
 * `lvText`: một dòng tóm tắt cho mỗi level, điền số của level đó. Là mảng khi
 * level cao mở thêm hành vi mới chứ không chỉ đổi số.
 *
 * `grow`: điều kiện lên level 2 và 3, ngoài 1 điểm. `by` là một khoá của
 * `GROW_BY`, `at` là ngưỡng tới level 2 và level 3, `say` (tuỳ chọn) thay câu
 * điều kiện mặc định ({n} là ngưỡng). Kỹ năng đổi đường đi hay bấm để dùng
 * tính theo số lần vì lợi ích của chúng không đo ra tiền được. Kỹ năng giảm
 * giá hay gắn với đất đai tính theo tài sản đang có: tiền chúng mang về phụ
 * thuộc vào việc người khác làm gì, còn gom đất là việc người chơi tự lo được.
 *
 * Không ô nào đòi làm một việc trong ván mới cho học (kiểu "vào tù 2 lần mới
 * mở khoá" của các ô thành tựu cũ): học chỉ cần ô cha và điểm, điều kiện chỉ
 * đặt ở bước lên level. Khoá cửa học thì người chơi nhìn thấy ô mà không thử
 * được, và người chưa từng vào tù không bao giờ biết Khách Quen Nhà Đá làm gì.
 *
 * Kỹ năng tự động ghi thời hạn ở `span`:
 *   'forever' — vĩnh viễn
 *   'lap'     — phần thưởng reset và chạy lại mỗi lần qua ô Bắt Đầu
 *   'cooldown'— tự chạy khi đủ điều kiện, rồi chờ `cooldown` lần qua ô Bắt
 *               Đầu; `uses` ghi câu tả nhịp ấy như kỹ năng bấm để dùng
 * Kỹ năng bấm để dùng ghi `uses` (dùng được mấy lần) và `when` (dùng được
 * lúc nào) — chúng nằm trong kho "Dùng kỹ năng". Không có `charges` lẫn
 * `cooldown` thì là công tắc vĩnh viễn (Xe Đạp, Cò Quay). `once: true` là kỹ năng làm
 * một việc ngay lúc chọn trong kho (Tất Tay, Xuyên Việt, Nhặt Hàng Thừa, Siết
 * Nợ): không có trạng thái bật / tắt để giữ. `auto: true` là kỹ năng tự
 * hỏi người đang đi đúng lúc (sau khi lắc, khi dừng ở ô nào đó), không mở từ kho. `cooldown` (trong levels) = số lần qua ô Bắt Đầu phải chờ sau mỗi
 * lần dùng; `charges` = dùng được mấy lần trước khi phải chờ.
 */
export const SKILLS = [
  /* ============================================ Công Nhân Ưu Tú */
  {
    id: 'cn1', branch: 'congnhan', tier: 1, kind: 'passive', span: 'forever', icon: 'pickup',
    name: 'Nhặt Tiền Rơi',
    levels: [
      { chance: 0.35, amount: [10, 30] },
      { chance: 0.35, amount: 25 },
      { chance: 0.45, amount: 35 },
    ],
    grow: { by: 'gain', at: [100, 250] },
    short: 'Đi đường có lúc nhặt được tiền.',
    effect: 'Mỗi lần bạn di chuyển có {%chance} khả năng nhặt được {$amount}.',
    lvText: '{%chance} khả năng nhặt {$amount}',
  },
  {
    id: 'cn2a', branch: 'congnhan', tier: 2, slot: 'a', kind: 'passive', span: 'forever', icon: 'overtime',
    requires: ['cn1'],
    name: 'Tăng Ca',
    levels: [{ bonus: [20, 80] }, { bonus: 60 }, { bonus: 90 }],
    grow: { by: 'gain', at: [100, 250] },
    short: 'Lương qua ô Bắt Đầu cao hơn.',
    effect: 'Mỗi lần qua ô Bắt Đầu nhận thêm {$bonus} ngoài lương 200$.',
    lvText: 'Lương +{$bonus}',
  },
  {
    id: 'cn2b', branch: 'congnhan', tier: 2, slot: 'b', kind: 'passive', span: 'forever', icon: 'union',
    requires: ['cn1'],
    name: 'Công Đoàn',
    levels: [{ pay: [0.4, 0.7] }, { pay: 0.5 }, { pay: 0.3 }],
    grow: { by: 'worth', at: [1500, 2500] },
    short: 'Thuế và tiền phạt giảm mạnh.',
    effect: 'Ô Thuế Thu Nhập, Thuế Xa Xỉ và mọi khoản phạt từ thẻ Cơ Hội / Khí Vận chỉ thu {%pay} số tiền.',
    lvText: 'Chỉ trả {%pay} thuế và phạt',
  },
  {
    id: 'cn3', branch: 'congnhan', tier: 3, slot: 'a', kind: 'passive', span: 'forever', icon: 'seniority',
    requires: ['cn2a'],
    name: 'Thâm Niên',
    levels: [
      { perLap: [5, 25], cap: 150 },
      { perLap: 20, cap: 200 },
      { perLap: 25, cap: 300 },
    ],
    grow: { by: 'gain', at: [120, 300] },
    short: 'Qua ô Bắt Đầu càng nhiều, lương càng cao.',
    effect: 'Mỗi lần bạn đã qua ô Bắt Đầu cộng thêm {$perLap} vào lương, tối đa +{$cap}.',
    lvText: '+{$perLap} mỗi lần đã qua, tối đa +{$cap}',
  },
  {
    id: 'cnU', branch: 'congnhan', tier: 4, slot: 'a', kind: 'passive', span: 'lap', icon: 'strike',
    requires: ['cn3'],
    name: 'Liên Đoàn Lao Động',
    /* Tỉ lệ = base + perLap × số lần đã qua ô Bắt Đầu − jail × số lần vào tù,
       chặn trong [0, cap]. Tính trên tiền mặt **của bạn**, thu của **mỗi**
       người khác — ai ít tiền hơn khoản đó thì nộp hết số đang có, hết tiền
       thì thôi, không đẩy ai vào nợ. Vào tù bị trừ nặng hơn qua ô Bắt Đầu vì
       vào tù hiếm hơn nhiều.
       `each` chặn số tiền một người nộp mỗi lần: `each` × số lần đã qua. Xem
       vì sao phải có trần này ở ghi chú `levyEach` trong core/skills.js. */
    levels: [
      { base: 0.03, perLap: 0.01, jail: 0.03, cap: 0.12, each: 12 },
      { base: 0.03, perLap: 0.01, jail: 0.03, cap: 0.16, each: 15 },
      { base: 0.03, perLap: 0.01, jail: 0.03, cap: 0.20, each: 18 },
    ],
    grow: { by: 'gain', at: [300, 800] },
    short: 'Mỗi lần qua ô Bắt Đầu, mọi người khác nộp quỹ theo % tiền mặt của bạn.',
    effect: 'Mỗi lần bạn qua ô Bắt Đầu, mỗi người chơi khác nộp cho bạn X% tiền mặt bạn đang có. X = {%base} + {%perLap} cho mỗi lần bạn đã qua ô Bắt Đầu − {%jail} cho mỗi lần bạn vào tù, tối đa {%cap}. Mỗi người nộp không quá {$each} × số lần bạn đã qua ô Bắt Đầu; ai không đủ thì nộp hết số đang có.',
    lvText: 'Tối đa {%cap}, mỗi người không quá {$each} × số lần qua',
  },

  {
    id: 'cnV', branch: 'congnhan', tier: 4, slot: 'b', kind: 'passive', span: 'cooldown', icon: 'insurance',
    requires: ['cnX1'],
    name: 'Bảo Hiểm Xã Hội',
    /* Tối thượng cho người đang thua: Liên Đoàn cần mình nhiều tiền mặt, ô này
       chạy đúng lúc mình không đủ tiền. Trả hộ trước khi hỏi bán nhà / thế
       chấp, nên cứu được cả dãy nhà chứ không chỉ cứu khỏi phá sản. */
    uses: 'Tự chạy khi thiếu tiền, rồi chờ vài lần qua ô Bắt Đầu',
    levels: [
      { cover: 400, cooldown: 3 },
      { cover: 550, cooldown: 3 },
      { cover: 700, cooldown: 3 },
    ],
    grow: { by: 'gain', at: [200, 500] },
    short: 'Thiếu tiền trả thì ngân hàng trả hộ phần thiếu.',
    effect: 'Khi bạn phải trả một khoản lớn hơn tiền mặt đang có, ngân hàng trả hộ phần còn thiếu, tối đa {$cover}, trước khi bạn phải bán nhà hay thế chấp. Chạy xong phải qua ô Bắt Đầu {cooldown} lần mới chạy lại.',
    lvText: 'Trả hộ tối đa {$cover}, chờ {cooldown} lần',
  },

  {
    id: 'cnX1', branch: 'congnhan', tier: 3, slot: 'b', kind: 'passive', span: 'forever', icon: 'veteran',
    requires: ['cn2b'],
    name: 'Lão Làng',
    /* Đếm từ lúc học chứ không từ đầu ván: tính theo tổng số lần qua thì học
       muộn là được bù ngay cả loạt điểm của những vòng trước. */
    levels: [{ every: 4 }, { every: 3 }, { every: 2 }],
    grow: { by: 'uses', at: [1, 2], say: 'Được tặng điểm {n} lần' },
    short: 'Cứ vài lần qua ô Bắt Đầu được thêm 1 điểm kỹ năng.',
    effect: 'Từ lúc học, cứ mỗi {every} lần qua ô Bắt Đầu bạn được thêm 1 điểm kỹ năng.',
    lvText: '+1 điểm mỗi {every} lần qua',
  },
  {
    id: 'cnX2', branch: 'congnhan', tier: 2, slot: 'c', kind: 'passive', span: 'forever', icon: 'jailbird',
    requires: ['cn1'],
    name: 'Khách Quen Nhà Đá',
    levels: [{ comp: [40, 80] }, { comp: 70 }, { comp: 110 }],
    grow: { by: 'gain', at: [60, 150] },
    short: 'Vào tù được bồi thường, ra tù không mất tiền.',
    effect: 'Mỗi lần vào tù nhận {$comp} bồi thường. Ra tù không phải nộp 50$, kể cả khi hết hạn 3 lượt.',
    lvText: 'Vào tù +{$comp}, ra tù miễn phí',
  },
  {
    id: 'cnS1', branch: 'congnhan', tier: 3, slot: 'c', kind: 'passive', span: 'forever', icon: 'helmet',
    requires: ['cn2b'],
    name: 'Bảo Hộ Lao Động',
    levels: [{ chance: 0.4, bonus: 0.3 }, { chance: 0.5, bonus: 0.5 }, { chance: 0.6, bonus: 0.75 }],
    grow: { by: 'uses', at: [1, 3], say: 'Bỏ qua {n} thẻ xấu' },
    short: 'Thẻ xấu có lúc được bỏ qua, thẻ nhận tiền nhận thêm.',
    effect: 'Rút phải thẻ Cơ Hội / Khí Vận bất lợi (phạt tiền, thuế nhà cửa, đi lùi, vào tù) thì có {%chance} khả năng bỏ qua thẻ đó. Thẻ ngân hàng trả tiền cho bạn thì nhận thêm {%bonus}.',
    lvText: '{%chance} bỏ qua thẻ xấu, thẻ nhận tiền +{%bonus}',
  },
  {
    id: 'cnS2', branch: 'congnhan', tier: 3, slot: 'd', kind: 'passive', span: 'forever', icon: 'cell',
    requires: ['cnX2'],
    name: 'Ở Tù Cho Lành',
    /* Cuối ván bàn đầy khách sạn thì bước ra khỏi tù là mất tiền; trong tù vẫn
       thu thuê như thường. `stay` chặn số lượt ngồi yên mỗi lần vào tù, không
       thì người dẫn đầu ngồi lì tới hết ván. Ngồi yên là một nút bấm, không
       phải hộp hỏi sau khi lắc — lắc rồi thì luật tù cũ chạy như thường. */
    levels: [{ pay: 50, stay: 2 }, { pay: 60, stay: 3 }, { pay: 80, stay: 3 }],
    grow: { by: 'gain', at: [60, 150] },
    short: 'Ở tù có lương; được chọn ngồi yên trong tù.',
    effect: 'Mỗi lượt bạn ở trong tù nhận {$pay}. Trong tù có thêm nút Ngồi Yên: hết lượt ngay, không tính vào hạn 3 lượt; mỗi lần vào tù ngồi yên được tối đa {stay} lượt.',
    lvText: 'Mỗi lượt trong tù +{$pay}, ngồi yên tối đa {stay} lượt',
  },

  /* ============================================ Nhà Du Hành */
  {
    id: 'dh1', branch: 'duhanh', tier: 1, kind: 'passive', span: 'forever', icon: 'ticket',
    name: 'Vé Tháng',
    /* Hai vế: vế trả vé cho người chưa có bến nào, vế thu thêm cho người vừa
       mua được bến — nên vừa có 2 bến ở vòng đầu là học ô này có lời ngay.
       `own` cộng thẳng vào tiền vé, không nhân: bến thu 25–200$ theo số bến,
       nhân thì người có 4 bến lời gấp tám người có 1 bến. */
    levels: [{ pay: 0.6, own: 10 }, { pay: 0.4, own: 15 }, { pay: 0.2, own: 20 }],
    grow: { by: 'gain', at: [60, 180] },
    short: 'Trả ít tiền vé ở bến của người khác; bến của mình thu thêm.',
    effect: 'Dừng ở bến xe / nhà ga của người khác chỉ trả {%pay} tiền vé. Bến/ga của bạn thu thêm {$own} cho mỗi bến/ga bạn đang có.',
    lvText: 'Trả {%pay} tiền vé; bến mình +{$own} mỗi bến',
  },
  {
    id: 'dh2a', branch: 'duhanh', tier: 2, slot: 'a', kind: 'active', auto: true, icon: 'express',
    requires: ['dh1'],
    name: 'Tàu Tốc Hành',
    uses: 'Mỗi lần dừng ở bến/ga',
    when: 'khi bạn dừng ở bến xe / nhà ga',
    levels: [{ bonus: 0, any: false }, { bonus: 40, any: false }, { bonus: 75, any: true }],
    grow: { by: 'uses', at: [1, 3], say: 'Đi Tàu Tốc Hành {n} lần' },
    short: 'Dừng ở bến/ga thì được đi tiếp tới bến/ga khác.',
    effect: 'Dừng ở bất kỳ bến xe / nhà ga nào thì được đi tiếp tới bến/ga kế tiếp. Đi ngang ô Bắt Đầu vẫn nhận lương.',
    lvText: [
      'Đi tiếp tới bến/ga kế tiếp',
      'Đi tiếp tới bến/ga kế tiếp, nhận thêm {$bonus}',
      'Chọn bến/ga bất kỳ để tới, nhận thêm {$bonus}',
    ],
  },
  {
    id: 'dh2b', branch: 'duhanh', tier: 2, slot: 'b', kind: 'passive', span: 'forever', icon: 'homecoming',
    requires: ['dh1'],
    name: 'Về Nhà',
    levels: [
      { goMult: 2, parking: [50, 150] },
      { goMult: 2, parking: 120 },
      { goMult: 2.5, parking: 200 },
    ],
    grow: { by: 'gain', at: [100, 250] },
    short: 'Dừng đúng ô Bắt Đầu lương cao hơn, Bến Đậu có thưởng.',
    effect: 'Dừng đúng ô Bắt Đầu nhận lương ×{goMult} (thay vì ×1.5). Dừng ở Bến Đậu nhận thêm {$parking}.',
    lvText: 'Lương ×{goMult}, Bến Đậu +{$parking}',
  },
  {
    id: 'dh3', branch: 'duhanh', tier: 3, slot: 'a', kind: 'active', auto: true, icon: 'fork',
    requires: ['dh2a'],
    name: 'Quay Đầu',
    uses: 'Reset mỗi khi qua ô Bắt Đầu',
    when: 'sau khi lắc, trước khi quân đi',
    levels: [{ charges: 1, cooldown: 1 }, { charges: 2, cooldown: 1 }, { charges: 3, cooldown: 1 }],
    grow: { by: 'uses', at: [1, 3], say: 'Quay đầu {n} lần' },
    short: 'Lắc xong được chọn đi lùi.',
    effect: 'Sau khi lắc, được chọn đi lùi đúng số bước thay vì đi tới, để né ô đắt tiền phía trước.',
    lvText: 'Dùng {charges} lần giữa hai lần qua ô Bắt Đầu',
  },
  {
    id: 'dhU', branch: 'duhanh', tier: 4, slot: 'a', kind: 'active', once: true, icon: 'teleport',
    requires: ['dh3'],
    name: 'Chuyến Tàu Xuyên Việt',
    uses: '1 lần, rồi chờ vài lần qua ô Bắt Đầu',
    when: 'đầu lượt, thay cho nút lắc',
    levels: [{ cooldown: 3 }, { cooldown: 2 }, { cooldown: 1 }],
    grow: { by: 'uses', at: [1, 2], say: 'Đi Xuyên Việt {n} lần' },
    short: 'Không lắc, đi thẳng tới ô bất kỳ.',
    effect: 'Thay cho việc lắc: đi thẳng tới bất kỳ ô nào trên bàn (trừ ô Vào Tù). Đi ngang ô Bắt Đầu vẫn nhận lương. Dùng xong phải qua ô Bắt Đầu {cooldown} lần mới dùng lại được.',
    lvText: 'Dùng lại sau {cooldown} lần qua ô Bắt Đầu',
  },

  {
    id: 'dhV', branch: 'duhanh', tier: 4, slot: 'b', kind: 'passive', span: 'forever', icon: 'tollgate',
    requires: ['dhX1'],
    name: 'Trạm Thu Phí BOT',
    /* Một ô bị đi ngang chừng 7 lần cho mỗi lần có người dừng hẳn (bước lắc
       trung bình 7). Có 2 bến + 1 công ty, level 1 (20$) thu ≈ 32$ mỗi lượt
       từ cả bàn 4 người — đã là tối thượng thu nhiều nhất ở thế cờ tham chiếu
       của tests/balance.mjs; 30$ thì thu gấp đôi các tối thượng khác. Không có
       bến thì chọn Xuyên Việt.
       Chỉ thu trong số tiền mặt người đi đang có: trạm thu phí thì hay gặp,
       đẩy người ta vào xoay tiền mỗi lần đi ngang là cả bàn đứng chờ. */
    levels: [{ toll: 20 }, { toll: 28 }, { toll: 35 }],
    grow: { by: 'gain', at: [200, 500] },
    short: 'Người khác đi ngang bến/ga, công ty của bạn phải nộp phí.',
    effect: 'Mỗi lần người khác đi ngang (không dừng) một bến/ga hoặc công ty của bạn, họ nộp cho bạn {$toll} mỗi trạm. Dừng hẳn trên đó thì trả thuê như thường. Ô đang thế chấp không thu phí; ai không đủ thì nộp hết tiền mặt đang có.',
    lvText: '{$toll} mỗi trạm đi ngang',
  },

  {
    id: 'dhX1', branch: 'duhanh', tier: 3, slot: 'b', kind: 'passive', span: 'forever', icon: 'twofinger',
    requires: ['dh2b'],
    name: 'Hai Ngón',
    /* Lấy của người giàu nhất trên ô: đứng chung với hai người thì móc túi
       người đáng móc. `cap` chặn khi đối thủ ôm vài nghìn tiền mặt. Tính cả
       lúc người khác dừng lên ô mình đang đứng: chỉ tính lúc mình dừng thì
       mỗi lượt chưa tới 0,1 lần đứng chung ô, ô cấp 3 này đáng chưa tới 1$
       mỗi lượt (tests/balance.mjs). */
    levels: [
      { chance: 0.4, pct: [0.06, 0.12], cap: 150 },
      { chance: 0.5, pct: 0.1, cap: 250 },
      { chance: 0.6, pct: 0.14, cap: 400 },
    ],
    grow: { by: 'gain', at: [100, 250] },
    short: 'Đứng chung ô với người khác thì có lúc móc được tiền của họ.',
    effect: 'Mỗi lần bạn dừng ở ô đang có người khác đứng, hoặc người khác dừng lên ô bạn đang đứng: {%chance} khả năng lấy {%pct} tiền mặt của người đó (bạn dừng thì lấy của người giàu nhất ở ô), tối đa {$cap}.',
    lvText: '{%chance} khả năng lấy {%pct}, tối đa {$cap}',
  },
  {
    id: 'dhX2', branch: 'duhanh', tier: 2, slot: 'c', kind: 'passive', span: 'forever', icon: 'backpack',
    requires: ['dh1'],
    name: 'Phượt Thủ',
    levels: [{ bonus: [20, 40] }, { bonus: 35 }, { bonus: 50 }],
    grow: { by: 'gain', at: [60, 150] },
    short: 'Lắc ra số lớn thì có thưởng.',
    effect: 'Mỗi lần lắc ra tổng 10, 11 hoặc 12 nhận {$bonus}.',
    lvText: 'Lắc 10–12 +{$bonus}',
  },
  {
    id: 'dhS1', branch: 'duhanh', tier: 3, slot: 'c', kind: 'active', icon: 'bicycle',
    requires: ['dh2b'],
    name: 'Xe Đạp',
    /* Đi theo viên nhỏ hơn chứ không lắc một viên: hai viên vẫn lăn như
       thường nên hoạt cảnh và các kỹ năng đọc xí ngầu không phải đổi gì. Viên
       nhỏ hơn ra 1–3 trong 75% số lần — đủ để đứng lại trước dãy khách sạn.
       Công tắc vĩnh viễn, không lượt dùng: đi chậm cũng là chịu thiệt (ít qua
       ô Bắt Đầu, ít điểm kỹ năng), nên giá của nó đã nằm sẵn trong chính nó.
       Ra đôi thì cả hai viên bằng nhau, đi đúng số ấy; level 1 không tính đôi
       để đạp xe không thành cách dò từng ô mà vẫn được lắc tiếp. */
    uses: 'Vĩnh viễn, bật / tắt trong lượt của bạn',
    when: 'mỗi lần lắc, khi đang bật',
    levels: [{ doubles: false, gas: 0 }, { doubles: true, gas: 0 }, { doubles: true, gas: 20 }],
    grow: { by: 'uses', at: [4, 10], say: 'Đạp xe {n} lần' },
    short: 'Đang bật thì quân chỉ đi theo viên xí ngầu nhỏ hơn.',
    effect: 'Đang bật thì mỗi lần lắc, quân chỉ đi theo viên xí ngầu nhỏ hơn (1–6 ô). Bật hay tắt trong kho Dùng kỹ năng, giữ tới khi bạn tắt.',
    lvText: [
      'Đi theo viên nhỏ hơn, ra đôi không tính đôi',
      'Ra đôi vẫn tính đôi, được lắc tiếp',
      'Ra đôi tính đôi, mỗi lần đạp xe +{$gas}',
    ],
  },
  {
    id: 'dhS2', branch: 'duhanh', tier: 3, slot: 'd', kind: 'passive', span: 'forever', icon: 'guide',
    requires: ['dhX2'],
    name: 'Dẫn Tour',
    levels: [{ fee: 15 }, { fee: 20 }, { fee: 30 }],
    grow: { by: 'gain', at: [60, 180] },
    short: 'Đi vượt qua người khác thì họ trả tiền.',
    effect: 'Mỗi người bạn đi vượt qua (đang đứng trên ô bạn đi ngang, không tính ô bạn dừng, không tính người trong tù) trả bạn {$fee}; ai không đủ thì trả hết tiền mặt đang có.',
    lvText: 'Mỗi người vượt qua +{$fee}',
  },

  /* ============================================ Tay Chơi Đỏ Đen */
  {
    id: 'dd1', branch: 'doden', tier: 1, kind: 'passive', span: 'forever', icon: 'parity',
    name: 'Chẵn Lẻ',
    levels: [{ even: [10, 50], odd: [0, 30] }, { even: 35, odd: 10 }, { even: 40, odd: 10 }],
    grow: { by: 'gain', at: [100, 250] },
    short: 'Lắc ra chẵn được tiền, lắc ra lẻ mất ít tiền.',
    effect: 'Mỗi lần lắc: tổng chẵn nhận {$even}, tổng lẻ mất {$odd}.',
    lvText: 'Chẵn +{$even}, lẻ −{$odd}',
  },
  {
    id: 'dd2a', branch: 'doden', tier: 2, slot: 'b', kind: 'active', icon: 'chip',
    requires: ['dd1'],
    name: 'Cược Chẵn Lẻ',
    uses: 'Mỗi lượt 1 lần',
    when: 'mỗi lượt, lúc bấm Lắc',
    levels: [{ payout: [0.7, 1.4], max: 200 }, { payout: 1.05, max: 200 }, { payout: 1.15, max: 250 }],
    grow: { by: 'uses', at: [3, 6], say: 'Đặt cược {n} lần' },
    short: 'Đoán tổng xí ngầu chẵn hay lẻ, đúng thì ăn tiền cược.',
    effect: 'Chọn cửa chẵn hay lẻ và số tiền cược (tối đa {$max}). Đang bật thì mỗi lượt, lúc bấm Lắc, tự cược đúng cửa và số tiền ấy cho tới khi bạn chọn Không. Đoán đúng: được thêm {%payout} số tiền cược. Đoán sai: mất tiền cược, số tiền này vào Quỹ Công.',
    lvText: 'Đúng ăn {%payout} tiền cược, cược tối đa {$max}',
  },
  {
    id: 'dd2b', branch: 'doden', tier: 2, slot: 'a', kind: 'passive', span: 'forever', icon: 'clover',
    requires: ['dd1'],
    name: 'Đôi Hên',
    levels: [
      { double: [20, 60], jackpot: [200, 400] },
      { double: 50, jackpot: 350 },
      { double: 80, jackpot: 500 },
    ],
    grow: { by: 'gain', at: [100, 250] },
    short: 'Lắc ra đôi có thưởng; đôi lần ba không vào tù mà trúng lớn.',
    effect: 'Mỗi lần lắc ra đôi nhận {$double}. Lắc ra đôi 3 lần liên tiếp: không vào tù, nhận {$jackpot} và hết lượt.',
    lvText: 'Đôi +{$double}, đôi lần ba +{$jackpot}',
  },
  {
    id: 'dd3', branch: 'doden', tier: 3, slot: 'a', kind: 'active', auto: true, icon: 'reroll',
    requires: ['dd2b'],
    name: 'Xí Ngầu Gian',
    uses: 'Reset mỗi khi qua ô Bắt Đầu',
    when: 'ngay sau khi lắc, trước khi quân đi',
    levels: [{ charges: 1, cooldown: 1 }, { charges: 2, cooldown: 1 }, { charges: 3, cooldown: 1 }],
    grow: { by: 'uses', at: [1, 3], say: 'Lắc lại {n} lần' },
    short: 'Lắc lại một viên xí ngầu tuỳ chọn.',
    effect: 'Sau khi lắc, được lắc lại 1 viên (bạn chọn viên nào). Kết quả mới là kết quả cuối, kể cả khi xấu hơn.',
    lvText: 'Dùng {charges} lần giữa hai lần qua ô Bắt Đầu',
  },
  {
    id: 'ddU', branch: 'doden', tier: 4, slot: 'a', kind: 'active', once: true, icon: 'allin',
    requires: ['dd3'],
    name: 'Tất Tay',
    uses: '1 lần, rồi chờ vài lần qua ô Bắt Đầu',
    when: 'trước khi lắc',
    levels: [
      { win: [0.2, 0.35], lose: 0.15, cooldown: 2 },
      { win: 0.3, lose: 0.12, cooldown: 1 },
      { win: 0.35, lose: 0.1, cooldown: 1 },
    ],
    grow: { by: 'uses', at: [1, 2], say: 'Tất tay {n} lần' },
    short: 'Đoán chẵn/lẻ với cả bàn: đúng thì mỗi người trả bạn một phần tiền mặt.',
    effect: 'Trước khi lắc, đoán tổng hai viên xí ngầu ra chẵn hay lẻ. Đoán đúng: mỗi người chơi khác trả bạn {%win} tiền mặt họ đang có. Đoán sai: bạn trả mỗi người {%lose} tiền mặt của bạn. Dùng xong phải qua ô Bắt Đầu {cooldown} lần mới dùng lại được.',
    lvText: 'Thắng lấy {%win}, thua trả {%lose}, chờ {cooldown} lần',
  },

  {
    id: 'ddV', branch: 'doden', tier: 4, slot: 'b', kind: 'active', icon: 'lottery',
    requires: ['ddX1'],
    name: 'Xổ Số Kiến Thiết',
    /* Trả theo nghịch đảo xác suất (xem `lottoPrize` trong core/skills.js):
       chọn số nào thì kỳ vọng cũng là `ev` mỗi lần đối thủ lắc — người chơi
       chỉ chọn độ rủi ro. 7 ra 6/36 nên trả 30$; 2 hay 12 ra 1/36 nên trả 180$.
       Bàn đông thì nhiều lượt lắc hơn giữa hai lần qua, nên hợp bàn 4–6 người.
       Số giữ nguyên qua các vòng; đổi bằng nút trước khi lắc, chứ không bật hộp
       hỏi giữa lúc quân đang đi ngang ô Bắt Đầu. */
    uses: 'Đổi số một lần giữa hai lần qua ô Bắt Đầu',
    when: 'trong lượt của bạn',
    levels: [lotto(5), lotto(7), lotto(9)],
    grow: { by: 'gain', at: [200, 500] },
    short: 'Chọn một con số; người khác lắc ra số đó thì trả bạn.',
    effect: 'Chọn một tổng từ 2 đến 12; đổi được một lần giữa hai lần qua ô Bắt Đầu. Mỗi lần người khác lắc ra đúng tổng đó thì họ trả bạn. Số càng khó ra trả càng nhiều: 7 → {$p7}, 6 hoặc 8 → {$p6}, 2 hoặc 12 → {$p2}. Ai không đủ thì trả hết tiền mặt đang có.',
    lvText: '7 → {$p7}, 2/12 → {$p2}',
  },

  {
    id: 'ddX1', branch: 'doden', tier: 3, slot: 'b', kind: 'passive', span: 'forever', icon: 'bigsmall',
    requires: ['dd2a'],
    name: 'Thần Tài Xỉu',
    /* Tài 15/36, Xỉu 15/36, ra 7 thì cả hai cửa thua: ăn ×2 ở level 3 thì kỳ
       vọng +25% mỗi lần cược, level 1 trung bình ×1.7 thì ≈ +12%. */
    levels: [{ payout: [1.4, 2.0] }, { payout: 1.8 }, { payout: 2.0 }],
    grow: { by: 'gain', at: [100, 250] },
    short: 'Cược Chẵn Lẻ có thêm cửa Tài / Xỉu, trúng ăn đậm hơn.',
    effect: 'Cược Chẵn Lẻ có thêm hai cửa: Tài (tổng 8–12) và Xỉu (tổng 2–6); ra 7 thì cả hai cửa thua. Trúng được thêm {%payout} số tiền cược.',
    lvText: 'Tài/Xỉu trúng ăn {%payout} tiền cược',
  },
  {
    id: 'ddX2', branch: 'doden', tier: 2, slot: 'c', kind: 'passive', span: 'forever', icon: 'refund',
    requires: ['dd1'],
    name: 'Con Bạc Hoàn Lương',
    levels: [{ back: [0.1, 0.2] }, { back: 0.2 }, { back: 0.3 }],
    grow: { by: 'gain', at: [60, 150] },
    short: 'Cược thua được hoàn một phần tiền cược.',
    effect: 'Mỗi lần Cược Chẵn Lẻ thua, ngân hàng hoàn lại {%back} số tiền cược.',
    lvText: 'Thua được hoàn {%back}',
  },
  {
    id: 'ddS1', branch: 'doden', tier: 3, slot: 'c', kind: 'passive', span: 'forever', icon: 'cards',
    requires: ['dd2a'],
    name: 'Bài Tẩy',
    levels: [{ draw: 2, chest: false }, { draw: 3, chest: false }, { draw: 3, chest: true }],
    grow: { by: 'uses', at: [2, 5], say: 'Chọn thẻ {n} lần' },
    short: 'Dừng ô thẻ thì rút nhiều lá, chọn một.',
    effect: 'Dừng ô Cơ Hội thì rút {draw} lá rồi chọn 1 lá để dùng; lá còn lại xáo về bộ. Level 3 dùng được cả ở ô Khí Vận.',
    lvText: [
      'Cơ Hội: rút 2 chọn 1',
      'Cơ Hội: rút 3 chọn 1',
      'Cơ Hội và Khí Vận: rút 3 chọn 1',
    ],
  },
  {
    id: 'ddS2', branch: 'doden', tier: 3, slot: 'd', kind: 'active', icon: 'wheel',
    requires: ['ddX2'],
    name: 'Cò Quay Lương',
    /* Bật / tắt bằng nút trước khi lắc, không hỏi lúc qua ô Bắt Đầu. Kỳ vọng
       level 1: 50% × 2 + 50% × 0.5 = 1.25 lần lương; level 3: 1.4 lần. */
    uses: 'Bật / tắt trong lượt của bạn, giữ tới khi tắt',
    when: 'trong lượt của bạn',
    levels: [{ win: 0.5 }, { win: 0.55 }, { win: 0.6 }],
    grow: { by: 'gain', at: [120, 300] },
    short: 'Lương qua ô Bắt Đầu được quay: gấp đôi hoặc một nửa.',
    effect: 'Đang bật Cò Quay thì mỗi lần qua ô Bắt Đầu, lương được quay: {%win} khả năng nhận gấp đôi, còn lại chỉ nhận một nửa. Tắt thì lãnh lương như thường.',
    lvText: '{%win} khả năng lương ×2',
  },

  /* ============================================ Nhà Đầu Cơ */
  {
    id: 'dc1', branch: 'dauco', tier: 1, kind: 'passive', span: 'forever', icon: 'broker',
    name: 'Môi Giới',
    levels: [{ rate: [0.05, 0.15] }, { rate: 0.12 }, { rate: 0.18 }],
    grow: { by: 'gain', at: [100, 250] },
    short: 'Người khác mua đất thì bạn nhận hoa hồng.',
    effect: 'Mỗi khi người chơi khác mua đất, bến/ga hay công ty từ ngân hàng (kể cả qua đấu giá), bạn nhận hoa hồng {%rate} giá gốc. Ngân hàng trả, người mua không mất thêm.',
    lvText: 'Hoa hồng {%rate} giá đất',
  },
  {
    id: 'dc2a', branch: 'dauco', tier: 2, slot: 'a', kind: 'passive', span: 'forever', icon: 'swap',
    requires: ['dc1'],
    name: 'Cò Đất',
    levels: [{ rate: [0.15, 0.25], cap: 150 }, { rate: 0.25, cap: 250 }, { rate: 0.3, cap: 400 }],
    grow: { by: 'gain', at: [60, 180] },
    short: 'Ai giao dịch đất cũng phải chia bạn tiền cò.',
    effect: 'Mỗi giao dịch trên bàn có đất đổi chủ, kể cả giữa hai người khác, bạn nhận {%rate} giá gốc số đất đó, tối đa {$cap} mỗi giao dịch. Ngân hàng trả.',
    lvText: '{%rate} giá đất, tối đa {$cap}',
  },
  {
    id: 'dc2b', branch: 'dauco', tier: 2, slot: 'b', kind: 'passive', span: 'forever', icon: 'bricks',
    requires: ['dc1'],
    name: 'Thầu Vật Liệu',
    levels: [{ build: [10, 30], sell: [5, 15] }, { build: 25, sell: 15 }, { build: 40, sell: 20 }],
    grow: { by: 'gain', at: [60, 180] },
    short: 'Người khác xây nhà hay bán nhà, bạn cũng có phần.',
    effect: 'Mỗi căn nhà (hoặc khách sạn) người khác xây, bạn nhận {$build}. Mỗi căn người khác bán lại hoặc bị dỡ, bạn nhận {$sell}. Ngân hàng trả.',
    lvText: 'Xây +{$build}, bán/dỡ +{$sell}',
  },
  {
    id: 'dc3', branch: 'dauco', tier: 3, slot: 'a', kind: 'active', auto: true, icon: 'magnet',
    requires: ['dc2a'],
    name: 'Thâu Tóm',
    uses: '1 lần, rồi chờ vài lần qua ô Bắt Đầu',
    when: 'khi bạn dừng trên đất chưa có nhà của người khác',
    levels: [
      { premium: [1.3, 1.8], cooldown: 2 },
      { premium: 1.4, cooldown: 2 },
      { premium: 1.25, cooldown: 1 },
    ],
    grow: { by: 'uses', at: [1, 2], say: 'Thâu tóm {n} lần' },
    short: 'Ép mua đất chưa xây nhà của người khác.',
    effect: 'Dừng trên đất chưa có nhà của người khác: mua lại với giá {%premium} giá gốc, chủ đất nhận tiền và không được từ chối. Không dùng được nếu chủ đất đã xây nhà trong bộ màu đó. Dùng xong phải qua ô Bắt Đầu {cooldown} lần mới dùng lại được.',
    lvText: 'Giá {%premium}, chờ {cooldown} lần',
  },
  {
    id: 'dcU', branch: 'dauco', tier: 4, slot: 'a', kind: 'passive', span: 'forever', icon: 'boom',
    requires: ['dc3'],
    name: 'Cơn Sốt Đất',
    levels: [{ mult: 2.5 }, { mult: 2.75 }, { mult: 3 }],
    grow: { by: 'worth', at: [2500, 3500] },
    short: 'Đất chưa xây, bến/ga, công ty của bạn thu thuê gấp nhiều lần.',
    effect: 'Mọi ô chưa có nhà của bạn (đất trống, bến/ga, công ty) thu tiền thuê ×{mult}. Ô đã xây nhà thì tính giá thuê nhà như thường.',
    lvText: 'Thuê ô chưa xây ×{mult}',
  },

  {
    id: 'dcV', branch: 'dauco', tier: 4, slot: 'b', kind: 'active', once: true, icon: 'foreclose',
    requires: ['dcX1'],
    name: 'Siết Nợ',
    /* Người mua trả ngân hàng đúng số thế chấp (không lãi 10%) và trả chủ cũ
       phần `premium` — tổng chỉ 55–65% giá gốc, đổi lại chỉ nhắm được đất
       người ta đã phải cầm cố. Cơn Sốt Đất hợp khi mình gom nhiều đất trống;
       ô này hợp khi cả bàn đang túng tiền. */
    uses: 'Reset mỗi khi qua ô Bắt Đầu',
    when: 'trong lượt của bạn, khi có đất đang thế chấp của người khác',
    levels: [
      { premium: 0.2, charges: 1, cooldown: 1 },
      { premium: 0.1, charges: 2, cooldown: 1 },
      { premium: 0, charges: 2, cooldown: 1 },
    ],
    grow: { by: 'uses', at: [1, 2], say: 'Siết nợ {n} ô' },
    short: 'Mua đứt đất đang thế chấp của người khác.',
    effect: 'Chọn một ô đang thế chấp của người khác: bạn trả ngân hàng số tiền thế chấp (không lãi) và trả chủ cũ thêm {%premium} số đó. Ô về tay bạn, hết thế chấp; chủ cũ không được từ chối.',
    lvText: 'Trả chủ cũ thêm {%premium}, dùng {charges} lần giữa hai lần qua',
  },

  {
    id: 'dcX1', branch: 'dauco', tier: 3, slot: 'b', kind: 'passive', span: 'forever', icon: 'ledger',
    requires: ['dc2b'],
    name: 'Chủ Nợ',
    levels: [{ late: 0.2 }, { late: 0.25 }, { late: 0.3 }],
    grow: { by: 'gain', at: [40, 100] },
    short: 'Người đang nợ ngân hàng trả thuê cho bạn đắt hơn.',
    effect: 'Người dừng trên đất của bạn mà đang có ô thế chấp ở ngân hàng thì trả thêm {%late} tiền thuê.',
    lvText: 'Người có ô thế chấp trả thêm {%late}',
  },
  {
    id: 'dcX2', branch: 'dauco', tier: 2, slot: 'c', kind: 'passive', span: 'forever', icon: 'receipt',
    requires: ['dc1'],
    name: 'Khách Sộp',
    levels: [{ back: [0.1, 0.2] }, { back: 0.18 }, { back: 0.25 }],
    grow: { by: 'lands', at: [5, 7] },
    short: 'Mua đất của ngân hàng được hoàn lại một phần.',
    effect: 'Mỗi lần bạn dừng chân rồi mua ô chưa có chủ (đất, bến/ga, công ty), ngân hàng hoàn lại {%back} giá mua. Mua qua đấu giá không tính.',
    lvText: 'Hoàn {%back} giá mua',
  },
  {
    id: 'dcS1', branch: 'dauco', tier: 3, slot: 'c', kind: 'active', once: true, icon: 'basket',
    requires: ['dc2b'],
    name: 'Nhặt Hàng Thừa',
    /* Bấm để dùng trong lượt của mình, không phải hộp hỏi chen vào lúc người
       khác vừa bỏ qua ô: không ai phải đứng chờ, và hai người cùng học kỹ năng
       này thì ai tới lượt trước người đó mua. */
    uses: 'Reset mỗi khi qua ô Bắt Đầu',
    when: 'trong lượt của bạn, khi có ô người khác dừng mà không mua',
    levels: [
      { price: 0.8, charges: 1, cooldown: 1 },
      { price: 0.75, charges: 1, cooldown: 1 },
      { price: 0.7, charges: 2, cooldown: 1 },
    ],
    grow: { by: 'uses', at: [1, 2], say: 'Nhặt {n} ô' },
    short: 'Mua ô người khác dừng mà không mua, ở đâu cũng được.',
    effect: 'Dùng Nhặt Hàng Thừa: những ô chưa có chủ mà người khác đã dừng chân nhưng không mua sẽ sáng trên bàn cờ; chọn một ô để mua với {%price} giá gốc, dù quân bạn đang ở đâu.',
    lvText: 'Mua {%price} giá, dùng {charges} lần giữa hai lần qua',
  },
  {
    id: 'dcS2', branch: 'dauco', tier: 3, slot: 'd', kind: 'active', icon: 'handshake',
    requires: ['dcX2'],
    name: 'Góp Vốn',
    uses: 'Đổi người một lần giữa hai lần qua ô Bắt Đầu',
    when: 'trong lượt của bạn',
    levels: [{ share: 0.15 }, { share: 0.2 }, { share: 0.25 }],
    grow: { by: 'gain', at: [100, 250] },
    short: 'Hưởng một phần tiền thuê của người bạn góp vốn.',
    effect: 'Chọn một người chơi khác để góp vốn. Mỗi lần người đó thu tiền thuê, ngân hàng trả bạn {%share} số tiền ấy; người đó không mất gì. Đổi người được một lần giữa hai lần qua ô Bắt Đầu.',
    lvText: 'Hưởng {%share} tiền thuê người đó thu',
  },

  /* ============================================ Thường Dân An Cư */
  {
    id: 'acX2', branch: 'ancu', tier: 1, kind: 'passive', span: 'forever', icon: 'doorstep',
    name: 'Chủ Nhà',
    /* Ô mở đầu nhánh phải có tác dụng ngay vòng đầu: đầu ván ai cũng mới có
       vài ô đất, chưa ai đủ bộ để xây nhà, nên Mái Ấm đứng ở đây thì nằm im
       cả chục lượt. Chủ Nhà chạy từ ô đất đầu tiên. Số tiền hạ xuống ngang
       Nhặt Tiền Rơi vì giờ không cần mở khoá thành tựu nữa. */
    levels: [{ bonus: [10, 25] }, { bonus: 20 }, { bonus: 30 }],
    grow: { by: 'gain', at: [50, 120] },
    short: 'Dừng trên đất của mình thì được tiền.',
    effect: 'Mỗi lần bạn dừng trên đất, bến/ga hay công ty của chính mình, ngân hàng trả {$bonus}.',
    lvText: 'Về đất nhà +{$bonus}',
  },
  {
    id: 'ac1', branch: 'ancu', tier: 2, slot: 'c', kind: 'passive', span: 'forever', icon: 'hearth',
    requires: ['acX2'],
    name: 'Mái Ấm',
    levels: [{ cut: 0.15 }, { cut: 0.2 }, { cut: 0.3 }],
    grow: { by: 'lands', at: [4, 6] },
    short: 'Xây nhà rẻ hơn.',
    effect: 'Giá xây mỗi căn nhà và khách sạn giảm {%cut}.',
    lvText: 'Xây rẻ hơn {%cut}',
  },
  {
    id: 'ac2a', branch: 'ancu', tier: 2, slot: 'a', kind: 'passive', span: 'forever', icon: 'hourglass',
    requires: ['acX2'],
    name: 'Nhà Lâu Năm',
    levels: [{ perLap: 0.03, cap: 0.3 }, { perLap: 0.04, cap: 0.4 }, { perLap: 0.05, cap: 0.6 }],
    grow: { by: 'gain', at: [100, 250] },
    short: 'Nhà của bạn càng về cuối ván càng thu thuê cao.',
    effect: 'Mỗi lần bạn đã qua ô Bắt Đầu, tiền thuê các ô có nhà của bạn tăng thêm {%perLap}, tối đa +{%cap}.',
    lvText: '+{%perLap} mỗi lần đã qua, tối đa +{%cap}',
  },
  {
    id: 'ac2b', branch: 'ancu', tier: 2, slot: 'b', kind: 'passive', span: 'forever', icon: 'palette',
    requires: ['acX2'],
    name: 'Đất Nhiều Màu',
    levels: [{ perColor: 0.04 }, { perColor: 0.05 }, { perColor: 0.07 }],
    grow: { by: 'colors', at: [3, 5] },
    short: 'Có đất ở càng nhiều màu, mọi tiền thuê càng cao.',
    effect: 'Mỗi màu đất khác nhau bạn đang có ít nhất 1 ô: mọi tiền thuê của bạn +{%perColor}.',
    lvText: '+{%perColor} mỗi màu đất',
  },
  {
    id: 'ac3', branch: 'ancu', tier: 3, slot: 'a', kind: 'passive', span: 'forever', icon: 'heirloom',
    requires: ['ac2a'],
    name: 'Sổ Hồng',
    /* Từng cho xây khi có 2/3 bộ màu — trùng việc với Chung Cư Mini (đất lẻ
       xây được nhà), nên phần ấy giao hẳn cho Chung Cư Mini. Thay bằng tiền
       giữ nhà mỗi lần qua ô Bắt Đầu: cùng đường với Nhà Lâu Năm và Phố Cổ là
       đổ tiền vào nhà rồi ăn dần. Khách sạn tính 5 căn như luật thuê. Cộng
       vào lương nên không thêm một thông báo nào trong lượt. */
    levels: [{ refund: 0.5, perHouse: 5 }, { refund: 0.75, perHouse: 8 }, { refund: 1, perHouse: 12 }],
    grow: { by: 'gain', at: [80, 200] },
    short: 'Nhà không bị phá; mỗi lần qua ô Bắt Đầu thu tiền theo số nhà.',
    effect: 'Mỗi lần qua ô Bắt Đầu nhận thêm {$perHouse} cho mỗi căn nhà bạn đang có (khách sạn tính 5 căn). Nhà của bạn không bị thẻ hay sự kiện Thời Cuộc dỡ. Bán lại nhà được {%refund} giá xây.',
    lvText: '+{$perHouse} mỗi căn nhà khi qua ô Bắt Đầu, bán nhà lấy lại {%refund}',
  },
  {
    id: 'acU', branch: 'ancu', tier: 4, slot: 'a', kind: 'passive', span: 'lap', icon: 'pagoda',
    requires: ['ac3'],
    name: 'Phố Cổ',
    levels: [{ houses: 1, mult: 1.5 }, { houses: 1, mult: 1.75 }, { houses: 2, mult: 2 }],
    grow: { by: 'uses', at: [1, 3], say: 'Được xây {n} căn miễn phí' },
    short: 'Mỗi lần qua ô Bắt Đầu được xây thêm nhà miễn phí.',
    effect: 'Mỗi lần bạn qua ô Bắt Đầu: ô ít nhà nhất trong các bộ bạn đang xây được thêm {houses} căn miễn phí. Ô lên khách sạn theo cách này thành Di Sản: thuê ×{mult}, không ai dỡ hay ép mua được.',
    lvText: '{houses} căn miễn phí, Di Sản thuê ×{mult}',
  },

  {
    id: 'acV', branch: 'ancu', tier: 4, slot: 'b', kind: 'passive', span: 'forever', icon: 'storefront',
    requires: ['acX1'],
    name: 'Mặt Tiền',
    /* Cho người có đất rải nhiều màu mà không gom đủ bộ nào — Phố Cổ thì cần
       bộ đủ để xây. Cộng thẳng chứ không nhân: đất rẻ thuê 2–20$ thì nhân mấy
       cũng không đáng kể. */
    levels: [{ per: 9 }, { per: 12 }, { per: 15 }],
    grow: { by: 'colors', at: [4, 6] },
    short: 'Mỗi ô của bạn thu thêm tiền theo số màu đất bạn có.',
    effect: 'Mọi ô của bạn, kể cả đất trống, bến/ga và công ty, thu thêm {$per} × số màu đất khác nhau bạn đang có ít nhất 1 ô. Cộng thẳng vào tiền thuê.',
    lvText: '+{$per} × số màu đất',
  },
  {
    id: 'acX1', branch: 'ancu', tier: 3, slot: 'b', kind: 'passive', span: 'forever', icon: 'lifebuoy',
    requires: ['ac2b'],
    name: 'Sống Sót',
    levels: [{ pay: 0.5, under: 200 }, { pay: 0.4, under: 200 }, { pay: 0.3, under: 250 }],
    grow: { by: 'gain', at: [60, 150] },
    short: 'Đang cạn tiền thì trả thuê ít hơn.',
    effect: 'Khi tiền mặt của bạn dưới {$under}, tiền thuê bạn phải trả chỉ còn {%pay}.',
    lvText: 'Dưới {$under} chỉ trả {%pay} tiền thuê',
  },
  {
    id: 'acS1', branch: 'ancu', tier: 3, slot: 'c', kind: 'passive', span: 'forever', icon: 'apartment',
    requires: ['ac2b'],
    name: 'Chung Cư Mini',
    levels: [{ cap: 1, mult: 1.25 }, { cap: 2, mult: 1 }, { cap: 3, mult: 1 }],
    grow: { by: 'uses', at: [1, 3], say: 'Xây {n} căn trên đất lẻ' },
    short: 'Đất chưa đủ bộ màu vẫn xây được nhà.',
    effect: 'Ô đất chưa đủ bộ màu vẫn xây được tối đa {cap} căn nhà, giá xây ×{mult}. Xây trong bảng Quản lý tài sản như thường.',
    lvText: 'Đất lẻ xây tối đa {cap} căn, giá ×{mult}',
  },
  {
    id: 'acS2', branch: 'ancu', tier: 3, slot: 'd', kind: 'passive', span: 'forever', icon: 'neighbors',
    requires: ['ac1'],
    name: 'Hàng Xóm Láng Giềng',
    levels: [{ bonus: 0.15 }, { bonus: 0.2 }, { bonus: 0.3 }],
    grow: { by: 'gain', at: [60, 180] },
    short: 'Ô nằm liền kề ô khác của mình thì thu thuê cao hơn.',
    effect: 'Ô của bạn có ô ngay trước hoặc ngay sau trên bàn cờ cũng của bạn thì thu thuê +{%bonus}.',
    lvText: 'Thuê +{%bonus} khi có hàng xóm',
  },
];

/** Vài lối build mẫu — để thấy các nhánh ghép với nhau ra sao. */
export const BUILDS = [
  {
    name: 'Ông Trùm Bến Bãi',
    skills: ['dh1', 'dh2a', 'dh2b', 'dh3', 'dhU'],
    note: 'Học hết nhánh Du Hành: chuyền từ ga này sang ga kia, dịch chuyển về thẳng ô Bắt Đầu để nhận lương ×2.',
  },
  {
    name: 'Con Bạc Khát Nước',
    skills: ['dd1', 'dd2a', 'dd2b', 'dd3', 'ddU'],
    note: 'Cược Chẵn Lẻ một mình thì ăn thua 50/50; có Xí Ngầu Gian thì đoán sai còn lắc lại được một viên.',
  },
  {
    name: 'Địa Chủ Lấn Đất',
    skills: ['dc1', 'dc2a', 'dc3', 'acX2', 'ac1'],
    note: 'Môi Giới và Cò Đất kiếm tiền từ người khác, đủ vốn Thâu Tóm ô còn thiếu của bộ màu rồi xây ngay với Mái Ấm.',
  },
  {
    name: 'Cò Mồi Sài Thành',
    skills: ['dc1', 'dc2a', 'dc2b', 'dc3', 'dcU'],
    note: 'Học hết nhánh Đầu Cơ: người khác mua đất, đổi đất, xây nhà đều ra tiền cho bạn; gom càng nhiều đất lẻ thì Cơn Sốt Đất càng lời.',
  },
  {
    name: 'Thợ Cả Tích Cóp',
    skills: ['cn1', 'cn2a', 'cn3', 'acX2', 'ac2a'],
    note: 'Không đánh ai, chỉ đi đều nhận lương cao rồi đổ tiền vào nhà; nhà càng để lâu thuê càng đắt.',
  },
  {
    name: 'Phố Cổ Bất Khả Xâm',
    skills: ['acX2', 'ac2a', 'ac3', 'acU', 'ac1'],
    note: 'Sổ Hồng chặn mọi thẻ dỡ nhà và trả tiền theo số nhà; Phố Cổ mỗi lần qua ô Bắt Đầu tự xây thêm một căn.',
  },
];
