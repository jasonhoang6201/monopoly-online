/**
 * Cây kỹ năng — dữ liệu thuần. Luật tính số nằm ở core/skills.js, phần hỏi
 * người chơi ở game/skillPlay.js.
 *
 * Mỗi lần đi ngang ô Bắt Đầu người chơi được +1 điểm. Khung giá cố định cho cả
 * năm nhánh để so được sức mạnh giữa các nhánh bằng cùng một thước:
 *
 *   cấp 1 ─ 1 điểm
 *   cấp 2 ─ rẽ ba, mỗi ô 1 điểm; ô thứ ba là kỹ năng thành tựu
 *   cấp 3 ─ rẽ đôi, mỗi ô 2 điểm; mỗi ô mọc từ hai ô cấp 2 kề nó, ô thứ hai
 *           là kỹ năng thành tựu
 *   tối thượng ─ 3 điểm, cần một trong hai ô cấp 3 của **chính nhánh đó**
 *
 * Đi thẳng một nhánh thì tốn 7 điểm là chạm tối thượng, 11 điểm là học trọn
 * ở level 1; mỗi ô lên được level 3 (xem `LEVEL_COST`).
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
export const TIER_COST = { 1: 1, 2: 1, 3: 2, 4: 3 };

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

/**
 * Bộ đếm thành tựu — mỗi người một bộ, đếm suốt ván kể cả trước khi học
 * nhánh nào. `laps`, `jails` đọc thẳng từ trường sẵn có của Player; còn lại
 * nằm ở `Player.feats`. `money: true` thì hiện thành tiền.
 */
export const FEATS = {
  share:   { text: 'Dừng chung ô với người khác', unit: 'lần' },
  steps:   { text: 'Đi tổng cộng', unit: 'ô' },
  laps:    { text: 'Qua ô Bắt Đầu', unit: 'lần' },
  jails:   { text: 'Vào tù', unit: 'lần' },
  betWin:  { text: 'Thắng cược', money: true },
  betLose: { text: 'Thua cược', money: true },
  rentIn:  { text: 'Thu tiền thuê', money: true },
  buys:    { text: 'Dừng chân rồi mua ô chưa có chủ', unit: 'ô' },
  home:    { text: 'Dừng trên đất của chính mình', unit: 'lần' },
  broke:   { text: 'Tiền mặt tụt dưới 100$ mà chưa phá sản', unit: 'lần' },
};

/** Ngưỡng tiền mặt của Sống Sót và bộ đếm `broke`. */
export const BROKE_LINE = 100;

export const BRANCHES = [
  { key: 'congnhan', name: 'Công Nhân Ưu Tú',  color: '#E2743A' },
  { key: 'duhanh',   name: 'Nhà Du Hành',      color: '#3C8FE0' },
  { key: 'doden',    name: 'Tay Chơi Đỏ Đen',  color: '#D2463A' },
  { key: 'dauco',    name: 'Nhà Đầu Cơ',       color: '#D4A24C' },
  { key: 'ancu',     name: 'Thường Dân An Cư', color: '#2E9E70' },
];

/**
 * `requires`: học **một** trong các ô này là đủ điều kiện. Cấp 1 để trống —
 * mọc thẳng từ gốc. Chỉ cần đã học (level 1), không đòi level cao.
 * `slot`: vị trí trong hàng, trái sang phải — cấp 2 có 'a'/'b'/'c', cấp 3 có
 * 'a'/'b'. Ô cấp 3 'a' mọc từ cấp 2 'a' + 'b', ô 'b' mọc từ 'b' + 'c', nên ô
 * cấp 2 đứng giữa là ô dẫn được tới cả hai ô cấp 3.
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
 * `grow`: điều kiện lên level 2 và 3, ngoài 1 điểm. `by: 'gain'` — tổng số
 * tiền kỹ năng này đã mang về (nhận thêm, hoặc được bớt khi phải trả);
 * `by: 'uses'` — số lần kỹ năng đã chạy, `say` là câu điều kiện hiện cho
 * người chơi ({n} là ngưỡng). `at` là ngưỡng cộng dồn từ lúc học
 * tới level 2 và level 3. Kỹ năng đổi đường đi hay bấm để dùng tính theo số
 * lần vì lợi ích của chúng không đo ra tiền được; còn lại tính theo tiền.
 * Tiến độ ghi ở `Player.skillUse` (xem `credit` trong core/skills.js).
 *
 * `feat`: kỹ năng thành tựu — ngoài `requires` còn phải làm đủ một việc
 * trong ván mới mở khoá (`key` là bộ đếm trong `FEATS`, `n` là ngưỡng). Đạt
 * rồi vẫn trả điểm theo giá tầng như ô thường. Mỗi nhánh có hai ô: ô 'c' ở
 * cấp 2 và ô 'b' ở cấp 3.
 *
 * Kỹ năng tự động ghi thời hạn ở `span`:
 *   'forever' — vĩnh viễn
 *   'lap'     — phần thưởng reset và chạy lại mỗi lần qua ô Bắt Đầu
 * Kỹ năng bấm để dùng ghi `uses` (dùng được mấy lần) và `when` (nút hiện ra
 * lúc nào). `cooldown` (trong levels) = số lần qua ô Bắt Đầu phải chờ sau mỗi
 * lần dùng; `charges` = dùng được mấy lần trước khi phải chờ.
 */
export const SKILLS = [
  /* ============================================ Công Nhân Ưu Tú */
  {
    id: 'cn1', branch: 'congnhan', tier: 1, kind: 'passive', span: 'forever', icon: 'pickup',
    name: 'Nhặt Tiền Rơi',
    levels: [
      { chance: 0.35, amount: [10, 40] },
      { chance: 0.35, amount: 30 },
      { chance: 0.45, amount: 40 },
    ],
    grow: { by: 'gain', at: [150, 400] },
    short: 'Đi đường có lúc nhặt được tiền.',
    effect: 'Mỗi lần bạn di chuyển có {%chance} khả năng nhặt được {$amount}.',
    lvText: '{%chance} khả năng nhặt {$amount}',
  },
  {
    id: 'cn2a', branch: 'congnhan', tier: 2, slot: 'a', kind: 'passive', span: 'forever', icon: 'overtime',
    requires: ['cn1'],
    name: 'Tăng Ca',
    levels: [{ bonus: [20, 80] }, { bonus: 60 }, { bonus: 90 }],
    grow: { by: 'gain', at: [150, 400] },
    short: 'Lương qua ô Bắt Đầu cao hơn.',
    effect: 'Mỗi lần qua ô Bắt Đầu nhận thêm {$bonus} ngoài lương 200$.',
    lvText: 'Lương +{$bonus}',
  },
  {
    id: 'cn2b', branch: 'congnhan', tier: 2, slot: 'b', kind: 'passive', span: 'forever', icon: 'union',
    requires: ['cn1'],
    name: 'Công Đoàn',
    levels: [{ pay: [0.4, 0.7] }, { pay: 0.5 }, { pay: 0.3 }],
    grow: { by: 'gain', at: [120, 300] },
    short: 'Thuế và tiền phạt giảm mạnh.',
    effect: 'Ô Thuế Thu Nhập, Thuế Xa Xỉ và mọi khoản phạt từ thẻ Cơ Hội / Khí Vận chỉ thu {%pay} số tiền.',
    lvText: 'Chỉ trả {%pay} thuế và phạt',
  },
  {
    id: 'cn3', branch: 'congnhan', tier: 3, slot: 'a', kind: 'passive', span: 'forever', icon: 'seniority',
    requires: ['cn2a', 'cn2b'],
    name: 'Thâm Niên',
    levels: [
      { perLap: [5, 25], cap: 150 },
      { perLap: 20, cap: 200 },
      { perLap: 25, cap: 300 },
    ],
    grow: { by: 'gain', at: [200, 500] },
    short: 'Qua ô Bắt Đầu càng nhiều, lương càng cao.',
    effect: 'Mỗi lần bạn đã qua ô Bắt Đầu cộng thêm {$perLap} vào lương, tối đa +{$cap}.',
    lvText: '+{$perLap} mỗi lần đã qua, tối đa +{$cap}',
  },
  {
    id: 'cnU', branch: 'congnhan', tier: 4, kind: 'passive', span: 'lap', icon: 'strike',
    requires: ['cn3', 'cnX1'],
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
    grow: { by: 'gain', at: [500, 1500] },
    short: 'Mỗi lần qua ô Bắt Đầu, mọi người khác nộp quỹ theo % tiền mặt của bạn.',
    effect: 'Mỗi lần bạn qua ô Bắt Đầu, mỗi người chơi khác nộp cho bạn X% tiền mặt bạn đang có. X = {%base} + {%perLap} cho mỗi lần bạn đã qua ô Bắt Đầu − {%jail} cho mỗi lần bạn vào tù, tối đa {%cap}. Mỗi người nộp không quá {$each} × số lần bạn đã qua ô Bắt Đầu; ai không đủ thì nộp hết số đang có.',
    lvText: 'Tối đa {%cap}, mỗi người không quá {$each} × số lần qua',
  },

  {
    id: 'cnX1', branch: 'congnhan', tier: 3, slot: 'b', kind: 'passive', span: 'forever', icon: 'veteran',
    requires: ['cn2b', 'cnX2'],
    feat: { key: 'laps', n: 6 },
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
    feat: { key: 'jails', n: 3 },
    name: 'Khách Quen Nhà Đá',
    levels: [{ comp: [30, 70] }, { comp: 60 }, { comp: 100 }],
    grow: { by: 'gain', at: [100, 250] },
    short: 'Vào tù được bồi thường, ra tù không mất tiền.',
    effect: 'Mỗi lần vào tù nhận {$comp} bồi thường. Ra tù không phải nộp 50$ — kể cả khi hết hạn 3 lượt.',
    lvText: 'Vào tù +{$comp}, ra tù miễn phí',
  },

  /* ============================================ Nhà Du Hành */
  {
    id: 'dh1', branch: 'duhanh', tier: 1, kind: 'passive', span: 'forever', icon: 'ticket',
    name: 'Vé Tháng',
    levels: [{ pay: 0.6 }, { pay: 0.4 }, { pay: 0.2 }],
    grow: { by: 'gain', at: [100, 300] },
    short: 'Đi bến xe, nhà ga của người khác trả ít tiền vé hơn.',
    effect: 'Dừng ở bến xe / nhà ga của người khác chỉ trả {%pay} tiền vé.',
    lvText: 'Trả {%pay} tiền vé',
  },
  {
    id: 'dh2a', branch: 'duhanh', tier: 2, slot: 'a', kind: 'active', icon: 'express',
    requires: ['dh1'],
    name: 'Tàu Tốc Hành',
    uses: 'Mỗi lần dừng ở bến/ga',
    when: 'khi bạn dừng ở bến xe / nhà ga',
    levels: [{ bonus: 0, any: false }, { bonus: 50, any: false }, { bonus: 100, any: true }],
    grow: { by: 'uses', at: [2, 5], say: 'Đi Tàu Tốc Hành {n} lần' },
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
    grow: { by: 'gain', at: [150, 400] },
    short: 'Dừng đúng ô Bắt Đầu lương cao hơn, Bến Đậu có thưởng.',
    effect: 'Dừng đúng ô Bắt Đầu nhận lương ×{goMult} (thay vì ×1.5). Dừng ở Bến Đậu nhận thêm {$parking}.',
    lvText: 'Lương ×{goMult}, Bến Đậu +{$parking}',
  },
  {
    id: 'dh3', branch: 'duhanh', tier: 3, slot: 'a', kind: 'active', icon: 'fork',
    requires: ['dh2a', 'dh2b'],
    name: 'Quay Đầu',
    uses: 'Reset mỗi khi qua ô Bắt Đầu',
    when: 'sau khi lắc, trước khi quân đi',
    levels: [{ charges: 1, cooldown: 1 }, { charges: 2, cooldown: 1 }, { charges: 3, cooldown: 1 }],
    grow: { by: 'uses', at: [2, 5], say: 'Quay đầu {n} lần' },
    short: 'Lắc xong được chọn đi lùi.',
    effect: 'Sau khi lắc, được chọn đi lùi đúng số bước thay vì đi tới — để né ô đắt tiền phía trước.',
    lvText: 'Dùng {charges} lần giữa hai lần qua ô Bắt Đầu',
  },
  {
    id: 'dhU', branch: 'duhanh', tier: 4, kind: 'active', icon: 'teleport',
    requires: ['dh3', 'dhX1'],
    name: 'Chuyến Tàu Xuyên Việt',
    uses: '1 lần, rồi chờ vài lần qua ô Bắt Đầu',
    when: 'đầu lượt, thay cho nút lắc',
    levels: [{ cooldown: 4 }, { cooldown: 3 }, { cooldown: 2 }],
    grow: { by: 'uses', at: [1, 3], say: 'Đi Xuyên Việt {n} lần' },
    short: 'Không lắc, đi thẳng tới ô bất kỳ.',
    effect: 'Thay cho việc lắc: đi thẳng tới bất kỳ ô nào trên bàn (trừ ô Vào Tù). Đi ngang ô Bắt Đầu vẫn nhận lương. Dùng xong phải qua ô Bắt Đầu {cooldown} lần mới dùng lại được.',
    lvText: 'Dùng lại sau {cooldown} lần qua ô Bắt Đầu',
  },

  {
    id: 'dhX1', branch: 'duhanh', tier: 3, slot: 'b', kind: 'passive', span: 'forever', icon: 'twofinger',
    requires: ['dh2b', 'dhX2'],
    feat: { key: 'share', n: 5 },
    name: 'Hai Ngón',
    /* Lấy của người giàu nhất trên ô: đứng chung với hai người thì móc túi
       người đáng móc. `cap` chặn khi đối thủ ôm vài nghìn tiền mặt. */
    levels: [
      { chance: 0.3, pct: [0.05, 0.1], cap: 150 },
      { chance: 0.4, pct: 0.08, cap: 250 },
      { chance: 0.5, pct: 0.12, cap: 400 },
    ],
    grow: { by: 'gain', at: [150, 400] },
    short: 'Dừng chung ô với người khác thì có lúc móc được tiền của họ.',
    effect: 'Mỗi lần bạn dừng ở ô đang có người khác đứng: {%chance} khả năng lấy {%pct} tiền mặt của người giàu nhất ở đó, tối đa {$cap}.',
    lvText: '{%chance} khả năng lấy {%pct}, tối đa {$cap}',
  },
  {
    id: 'dhX2', branch: 'duhanh', tier: 2, slot: 'c', kind: 'passive', span: 'forever', icon: 'backpack',
    requires: ['dh1'],
    feat: { key: 'steps', n: 250 },
    name: 'Phượt Thủ',
    levels: [{ bonus: [20, 40] }, { bonus: 35 }, { bonus: 50 }],
    grow: { by: 'gain', at: [100, 250] },
    short: 'Lắc ra số lớn thì có thưởng.',
    effect: 'Mỗi lần lắc ra tổng 10, 11 hoặc 12 nhận {$bonus}.',
    lvText: 'Lắc 10–12 +{$bonus}',
  },

  /* ============================================ Tay Chơi Đỏ Đen */
  {
    id: 'dd1', branch: 'doden', tier: 1, kind: 'passive', span: 'forever', icon: 'parity',
    name: 'Chẵn Lẻ',
    levels: [{ even: [10, 50], odd: [0, 30] }, { even: 40, odd: 10 }, { even: 60, odd: 5 }],
    grow: { by: 'gain', at: [150, 400] },
    short: 'Lắc ra chẵn được tiền, lắc ra lẻ mất ít tiền.',
    effect: 'Mỗi lần lắc: tổng chẵn nhận {$even}, tổng lẻ mất {$odd}.',
    lvText: 'Chẵn +{$even}, lẻ −{$odd}',
  },
  {
    id: 'dd2a', branch: 'doden', tier: 2, slot: 'b', kind: 'active', icon: 'chip',
    requires: ['dd1'],
    name: 'Cược Chẵn Lẻ',
    uses: 'Mỗi lượt 1 lần',
    when: 'trước khi lắc',
    levels: [{ payout: [0.6, 1.4], max: 200 }, { payout: 1.2, max: 200 }, { payout: 1.5, max: 300 }],
    grow: { by: 'uses', at: [4, 10], say: 'Đặt cược {n} lần' },
    short: 'Đoán tổng xí ngầu chẵn hay lẻ, đúng thì ăn tiền cược.',
    effect: 'Trước khi lắc, đoán tổng hai viên xí ngầu ra chẵn hay lẻ, rồi cược tối đa {$max}. Đoán đúng: được thêm {%payout} số tiền cược. Đoán sai: mất tiền cược, số tiền này vào Quỹ Công.',
    lvText: 'Đúng ăn {%payout} tiền cược, cược tối đa {$max}',
  },
  {
    id: 'dd2b', branch: 'doden', tier: 2, slot: 'a', kind: 'passive', span: 'forever', icon: 'clover',
    requires: ['dd1'],
    name: 'Đôi Hên',
    levels: [
      { double: [20, 80], jackpot: [200, 400] },
      { double: 60, jackpot: 350 },
      { double: 100, jackpot: 500 },
    ],
    grow: { by: 'gain', at: [150, 400] },
    short: 'Lắc ra đôi có thưởng; đôi lần ba không vào tù mà trúng lớn.',
    effect: 'Mỗi lần lắc ra đôi nhận {$double}. Lắc ra đôi 3 lần liên tiếp: không vào tù, nhận {$jackpot} và hết lượt.',
    lvText: 'Đôi +{$double}, đôi lần ba +{$jackpot}',
  },
  {
    id: 'dd3', branch: 'doden', tier: 3, slot: 'a', kind: 'active', icon: 'reroll',
    requires: ['dd2a', 'dd2b'],
    name: 'Xí Ngầu Gian',
    uses: 'Reset mỗi khi qua ô Bắt Đầu',
    when: 'ngay sau khi lắc, trước khi quân đi',
    levels: [{ charges: 1, cooldown: 1 }, { charges: 2, cooldown: 1 }, { charges: 3, cooldown: 1 }],
    grow: { by: 'uses', at: [2, 5], say: 'Lắc lại {n} lần' },
    short: 'Lắc lại một viên xí ngầu tuỳ chọn.',
    effect: 'Sau khi lắc, được lắc lại 1 viên (bạn chọn viên nào). Kết quả mới là kết quả cuối, kể cả khi xấu hơn.',
    lvText: 'Dùng {charges} lần giữa hai lần qua ô Bắt Đầu',
  },
  {
    id: 'ddU', branch: 'doden', tier: 4, kind: 'active', icon: 'allin',
    requires: ['dd3', 'ddX1'],
    name: 'Tất Tay',
    uses: '1 lần, rồi chờ vài lần qua ô Bắt Đầu',
    when: 'trước khi lắc',
    levels: [
      { win: [0.1, 0.3], lose: 0.1, cooldown: 3 },
      { win: 0.25, lose: 0.1, cooldown: 3 },
      { win: 0.3, lose: 0.05, cooldown: 2 },
    ],
    grow: { by: 'uses', at: [1, 3], say: 'Tất tay {n} lần' },
    short: 'Đoán chẵn/lẻ với cả bàn: đúng thì mỗi người trả bạn một phần tiền mặt.',
    effect: 'Trước khi lắc, đoán tổng hai viên xí ngầu ra chẵn hay lẻ. Đoán đúng: mỗi người chơi khác trả bạn {%win} tiền mặt họ đang có. Đoán sai: bạn trả mỗi người {%lose} tiền mặt của bạn. Dùng xong phải qua ô Bắt Đầu {cooldown} lần mới dùng lại được.',
    lvText: 'Thắng lấy {%win}, thua trả {%lose}, chờ {cooldown} lần',
  },

  {
    id: 'ddX1', branch: 'doden', tier: 3, slot: 'b', kind: 'passive', span: 'forever', icon: 'bigsmall',
    requires: ['dd2a', 'ddX2'],
    feat: { key: 'betWin', n: 400 },
    name: 'Thần Tài Xỉu',
    /* Tài 15/36, Xỉu 15/36, ra 7 thì cả hai cửa thua: ăn ×2 ở level 3 thì kỳ
       vọng +25% mỗi lần cược, level 1 trung bình ×1.5 thì ≈ +4%. */
    levels: [{ payout: [1.2, 1.8] }, { payout: 1.6 }, { payout: 2 }],
    grow: { by: 'gain', at: [150, 400] },
    short: 'Cược Chẵn Lẻ có thêm cửa Tài / Xỉu, trúng ăn đậm hơn.',
    effect: 'Cược Chẵn Lẻ có thêm hai cửa: Tài (tổng 8–12) và Xỉu (tổng 2–6); ra 7 thì cả hai cửa thua. Trúng được thêm {%payout} số tiền cược.',
    lvText: 'Tài/Xỉu trúng ăn {%payout} tiền cược',
  },
  {
    id: 'ddX2', branch: 'doden', tier: 2, slot: 'c', kind: 'passive', span: 'forever', icon: 'refund',
    requires: ['dd1'],
    feat: { key: 'betLose', n: 400 },
    name: 'Con Bạc Hoàn Lương',
    levels: [{ back: [0.2, 0.4] }, { back: 0.4 }, { back: 0.5 }],
    grow: { by: 'gain', at: [100, 250] },
    short: 'Cược thua được hoàn một phần tiền cược.',
    effect: 'Mỗi lần Cược Chẵn Lẻ thua, ngân hàng hoàn lại {%back} số tiền cược.',
    lvText: 'Thua được hoàn {%back}',
  },

  /* ============================================ Nhà Đầu Cơ */
  {
    id: 'dc1', branch: 'dauco', tier: 1, kind: 'passive', span: 'forever', icon: 'broker',
    name: 'Môi Giới',
    levels: [{ rate: [0.05, 0.15] }, { rate: 0.12 }, { rate: 0.18 }],
    grow: { by: 'gain', at: [150, 400] },
    short: 'Người khác mua đất thì bạn nhận hoa hồng.',
    effect: 'Mỗi khi người chơi khác mua đất, bến/ga hay công ty từ ngân hàng (kể cả qua đấu giá), bạn nhận hoa hồng {%rate} giá gốc. Ngân hàng trả, người mua không mất thêm.',
    lvText: 'Hoa hồng {%rate} giá đất',
  },
  {
    id: 'dc2a', branch: 'dauco', tier: 2, slot: 'a', kind: 'passive', span: 'forever', icon: 'swap',
    requires: ['dc1'],
    name: 'Cò Đất',
    levels: [{ rate: [0.05, 0.15], cap: 100 }, { rate: 0.12, cap: 150 }, { rate: 0.15, cap: 250 }],
    grow: { by: 'gain', at: [100, 300] },
    short: 'Ai giao dịch đất cũng phải chia bạn tiền cò.',
    effect: 'Mỗi giao dịch trên bàn có đất đổi chủ — kể cả giữa hai người khác — bạn nhận {%rate} giá gốc số đất đó, tối đa {$cap} mỗi giao dịch. Ngân hàng trả.',
    lvText: '{%rate} giá đất, tối đa {$cap}',
  },
  {
    id: 'dc2b', branch: 'dauco', tier: 2, slot: 'b', kind: 'passive', span: 'forever', icon: 'bricks',
    requires: ['dc1'],
    name: 'Thầu Vật Liệu',
    levels: [{ build: [10, 30], sell: [5, 15] }, { build: 25, sell: 15 }, { build: 40, sell: 20 }],
    grow: { by: 'gain', at: [100, 300] },
    short: 'Người khác xây nhà hay bán nhà, bạn cũng có phần.',
    effect: 'Mỗi căn nhà (hoặc khách sạn) người khác xây, bạn nhận {$build}. Mỗi căn người khác bán lại hoặc bị dỡ, bạn nhận {$sell}. Ngân hàng trả.',
    lvText: 'Xây +{$build}, bán/dỡ +{$sell}',
  },
  {
    id: 'dc3', branch: 'dauco', tier: 3, slot: 'a', kind: 'active', icon: 'magnet',
    requires: ['dc2a', 'dc2b'],
    name: 'Thâu Tóm',
    uses: '1 lần, rồi chờ vài lần qua ô Bắt Đầu',
    when: 'khi bạn dừng trên đất chưa có nhà của người khác',
    levels: [
      { premium: [1.3, 1.8], cooldown: 2 },
      { premium: 1.4, cooldown: 2 },
      { premium: 1.25, cooldown: 1 },
    ],
    grow: { by: 'uses', at: [1, 3], say: 'Thâu tóm {n} lần' },
    short: 'Ép mua đất chưa xây nhà của người khác.',
    effect: 'Dừng trên đất chưa có nhà của người khác: mua lại với giá {%premium} giá gốc, chủ đất nhận tiền và không được từ chối. Không dùng được nếu bộ màu đó đã có nhà. Dùng xong phải qua ô Bắt Đầu {cooldown} lần mới dùng lại được.',
    lvText: 'Giá {%premium}, chờ {cooldown} lần',
  },
  {
    id: 'dcU', branch: 'dauco', tier: 4, kind: 'passive', span: 'forever', icon: 'boom',
    requires: ['dc3', 'dcX1'],
    name: 'Cơn Sốt Đất',
    levels: [{ mult: 2 }, { mult: 2.25 }, { mult: 2.5 }],
    grow: { by: 'gain', at: [300, 800] },
    short: 'Đất chưa xây, bến/ga, công ty của bạn thu thuê gấp nhiều lần.',
    effect: 'Mọi ô chưa có nhà của bạn (đất trống, bến/ga, công ty) thu tiền thuê ×{mult}. Ô đã xây nhà thì tính giá thuê nhà như thường.',
    lvText: 'Thuê ô chưa xây ×{mult}',
  },

  {
    id: 'dcX1', branch: 'dauco', tier: 3, slot: 'b', kind: 'passive', span: 'forever', icon: 'ledger',
    requires: ['dc2b', 'dcX2'],
    feat: { key: 'rentIn', n: 1500 },
    name: 'Chủ Nợ',
    levels: [{ late: 0.1 }, { late: 0.15 }, { late: 0.2 }],
    grow: { by: 'gain', at: [60, 150] },
    short: 'Ai không đủ tiền mặt trả thuê cho bạn thì bị phạt chậm.',
    effect: 'Người dừng trên đất của bạn mà tiền mặt ít hơn tiền thuê thì phải trả thêm {%late} phạt chậm.',
    lvText: 'Phạt chậm +{%late}',
  },
  {
    id: 'dcX2', branch: 'dauco', tier: 2, slot: 'c', kind: 'passive', span: 'forever', icon: 'receipt',
    requires: ['dc1'],
    feat: { key: 'buys', n: 4 },
    name: 'Khách Sộp',
    levels: [{ back: [0.05, 0.15] }, { back: 0.12 }, { back: 0.18 }],
    grow: { by: 'gain', at: [60, 150] },
    short: 'Mua đất của ngân hàng được hoàn lại một phần.',
    effect: 'Mỗi lần bạn dừng chân rồi mua ô chưa có chủ (đất, bến/ga, công ty), ngân hàng hoàn lại {%back} giá mua. Mua qua đấu giá không tính.',
    lvText: 'Hoàn {%back} giá mua',
  },

  /* ============================================ Thường Dân An Cư */
  {
    id: 'ac1', branch: 'ancu', tier: 1, kind: 'passive', span: 'forever', icon: 'hearth',
    name: 'Mái Ấm',
    levels: [{ cut: 0.1 }, { cut: 0.15 }, { cut: 0.25 }],
    grow: { by: 'gain', at: [100, 300] },
    short: 'Xây nhà rẻ hơn.',
    effect: 'Giá xây mỗi căn nhà và khách sạn giảm {%cut}.',
    lvText: 'Xây rẻ hơn {%cut}',
  },
  {
    id: 'ac2a', branch: 'ancu', tier: 2, slot: 'a', kind: 'passive', span: 'forever', icon: 'hourglass',
    requires: ['ac1'],
    name: 'Nhà Lâu Năm',
    levels: [{ perLap: 0.03, cap: 0.3 }, { perLap: 0.04, cap: 0.4 }, { perLap: 0.05, cap: 0.6 }],
    grow: { by: 'gain', at: [150, 400] },
    short: 'Nhà của bạn càng về cuối ván càng thu thuê cao.',
    effect: 'Mỗi lần bạn đã qua ô Bắt Đầu, tiền thuê các ô có nhà của bạn tăng thêm {%perLap}, tối đa +{%cap}.',
    lvText: '+{%perLap} mỗi lần đã qua, tối đa +{%cap}',
  },
  {
    id: 'ac2b', branch: 'ancu', tier: 2, slot: 'b', kind: 'passive', span: 'forever', icon: 'palette',
    requires: ['ac1'],
    name: 'Đất Nhiều Màu',
    levels: [{ perColor: 0.04 }, { perColor: 0.05 }, { perColor: 0.07 }],
    grow: { by: 'gain', at: [150, 400] },
    short: 'Có đất ở càng nhiều màu, mọi tiền thuê càng cao.',
    effect: 'Mỗi màu đất khác nhau bạn đang có ít nhất 1 ô: mọi tiền thuê của bạn +{%perColor}.',
    lvText: '+{%perColor} mỗi màu đất',
  },
  {
    id: 'ac3', branch: 'ancu', tier: 3, slot: 'a', kind: 'passive', span: 'forever', icon: 'heirloom',
    requires: ['ac2a', 'ac2b'],
    name: 'Sổ Hồng',
    levels: [{ refund: 0.5 }, { refund: 0.75 }, { refund: 1 }],
    grow: { by: 'uses', at: [3, 8], say: 'Xây {n} căn trên bộ màu chưa đủ' },
    short: 'Xây nhà khi có 2/3 bộ màu; nhà không bị phá.',
    effect: 'Bộ màu 3 ô chỉ cần có 2 ô là xây được trên 2 ô đó (bộ 2 ô vẫn cần đủ). Nhà của bạn không bị thẻ hay sự kiện Thời Cuộc dỡ. Bán lại nhà được {%refund} giá xây.',
    lvText: 'Bán nhà lấy lại {%refund} giá xây',
  },
  {
    id: 'acU', branch: 'ancu', tier: 4, kind: 'passive', span: 'lap', icon: 'pagoda',
    requires: ['ac3', 'acX1'],
    name: 'Phố Cổ',
    levels: [{ houses: 1, mult: 1.5 }, { houses: 1, mult: 1.75 }, { houses: 2, mult: 2 }],
    grow: { by: 'uses', at: [2, 5], say: 'Được xây {n} căn miễn phí' },
    short: 'Mỗi lần qua ô Bắt Đầu được xây thêm nhà miễn phí.',
    effect: 'Mỗi lần bạn qua ô Bắt Đầu: ô ít nhà nhất trong các bộ bạn đang xây được thêm {houses} căn miễn phí. Ô lên khách sạn theo cách này thành Di Sản: thuê ×{mult}, không ai dỡ hay ép mua được.',
    lvText: '{houses} căn miễn phí, Di Sản thuê ×{mult}',
  },
  {
    id: 'acX1', branch: 'ancu', tier: 3, slot: 'b', kind: 'passive', span: 'forever', icon: 'lifebuoy',
    requires: ['ac2b', 'acX2'],
    feat: { key: 'broke', n: 3 },
    name: 'Sống Sót',
    levels: [{ pay: 0.5 }, { pay: 0.4 }, { pay: 0.3 }],
    grow: { by: 'gain', at: [100, 250] },
    short: 'Đang cạn tiền thì trả thuê ít hơn.',
    effect: 'Khi tiền mặt của bạn dưới 100$, tiền thuê bạn phải trả chỉ còn {%pay}.',
    lvText: 'Dưới 100$ chỉ trả {%pay} tiền thuê',
  },
  {
    id: 'acX2', branch: 'ancu', tier: 2, slot: 'c', kind: 'passive', span: 'forever', icon: 'doorstep',
    requires: ['ac1'],
    feat: { key: 'home', n: 4 },
    name: 'Chủ Nhà',
    levels: [{ bonus: [15, 35] }, { bonus: 30 }, { bonus: 45 }],
    grow: { by: 'gain', at: [60, 150] },
    short: 'Dừng trên đất của mình thì được tiền.',
    effect: 'Mỗi lần bạn dừng trên đất, bến/ga hay công ty của chính mình, ngân hàng trả {$bonus}.',
    lvText: 'Về đất nhà +{$bonus}',
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
    skills: ['dc1', 'dc2a', 'dc3', 'ac1', 'ac2b'],
    note: 'Môi Giới và Cò Đất kiếm tiền từ người khác, đủ vốn Thâu Tóm ô còn thiếu của bộ màu rồi xây ngay với Mái Ấm.',
  },
  {
    name: 'Cò Mồi Sài Thành',
    skills: ['dc1', 'dc2a', 'dc2b', 'dc3', 'dcU'],
    note: 'Học hết nhánh Đầu Cơ: người khác mua đất, đổi đất, xây nhà đều ra tiền cho bạn; gom càng nhiều đất lẻ thì Cơn Sốt Đất càng lời.',
  },
  {
    name: 'Thợ Cả Tích Cóp',
    skills: ['cn1', 'cn2a', 'cn3', 'ac1', 'ac2a'],
    note: 'Không đánh ai, chỉ đi đều nhận lương cao rồi đổ tiền vào nhà; nhà càng để lâu thuê càng đắt.',
  },
  {
    name: 'Phố Cổ Bất Khả Xâm',
    skills: ['ac1', 'ac2a', 'ac3', 'acU', 'cn1'],
    note: 'Sổ Hồng cho xây sớm với 2/3 bộ và chặn mọi thẻ dỡ nhà; Phố Cổ mỗi lần qua ô Bắt Đầu tự xây thêm một căn.',
  },
];
