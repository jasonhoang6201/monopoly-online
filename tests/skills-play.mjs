/**
 * Cây kỹ năng dưới tải: 4 người, mỗi người một lối build, tự chơi nhiều lượt
 * với thẻ Thời Cuộc bật — để bắt lỗi khi các kỹ năng **đụng nhau** chứ không
 * chỉ từng kỹ năng đứng riêng (tests/skills.mjs lo phần đó).
 *
 *   Ghế 0 · thuần Công Nhân Ưu Tú, mọi ô level 3 (Liên Đoàn thu % tiền mặt)
 *   Ghế 1 · thuần Nhà Du Hành, level ngẫu nhiên (Tàu Tốc Hành level 3 chọn ga,
 *           Quay Đầu nhiều lần mỗi vòng, Xuyên Việt)
 *   Ghế 2 · Đỏ Đen trọn nhánh + Mái Ấm, mọi ô level 1 (số tiền rút ngẫu nhiên
 *           trong khoảng — Cược, Xí Ngầu Gian, Tất Tay lấy tiền cả bàn)
 *   Ghế 3 · Đầu Cơ trọn nhánh + An Cư trọn nhánh, level ngẫu nhiên (Thâu Tóm,
 *           Thầu Vật Liệu, Sổ Hồng, Phố Cổ)
 * Ba ghế có tối thượng hai nhánh trở lên nên hào quang và bóng mờ nhiều màu
 * chạy suốt ván.
 *
 * Hộp hỏi kỹ năng được trả lời **ngẫu nhiên** (có seed, in ra để chạy lại
 * đúng ván ấy), nút kỹ năng trước khi lắc cũng bấm ngẫu nhiên, và giữa ván có
 * mở cây kỹ năng để học thêm bằng điểm vừa nhận.
 *
 * Sau mỗi lượt kiểm các điều không bao giờ được sai:
 *   - tiền là số nguyên hữu hạn, người còn chơi không âm tiền;
 *   - nhà + kho = 32, khách sạn + kho = 12, không ô nào quá 5 cấp;
 *   - biển Di Sản chỉ nằm trên ô đang có khách sạn;
 *   - chủ đất là ghế còn chơi; điểm kỹ năng không âm; kỹ năng đã học đủ điều kiện;
 *   - bộ đếm hồi chiêu là số nguyên dương; level là 2 hoặc 3 và chỉ ghi cho ô
 *     đã học; số lần đã dùng trong vòng nhỏ hơn số lần cho phép của level;
 * và một chốt canh: ván phải sang lượt mới trong vòng 90 giây, không thì coi
 * như bị kẹt và in ra đang đứng ở hộp thoại / nút nào.
 *
 * `node tests/skills-play.mjs [số lượt] [seed] [b]` — mặc định 48 lượt. Thêm
 * `b` thì mọi ghế học tối thượng thứ hai của nhánh (Bảo Hiểm Xã Hội, Trạm Thu
 * Phí BOT, Xổ Số Kiến Thiết, Siết Nợ, Mặt Tiền) thay cho tối thượng thứ nhất.
 * Cần dev server ở cổng 5178.
 */
import { launchChrome } from './launch.mjs';
import { playRollOff } from './rolloff.mjs';
import { pickOnBoard, picking } from './pick.mjs';

const TURNS = Number(process.argv[2] ?? 48);
let seed = Number(process.argv[3] ?? Date.now() % 100000);
const ULT_B = process.argv[4] === 'b';
console.log(`seed ${seed} — chạy lại đúng ván này: node tests/skills-play.mjs ${TURNS} ${seed}${ULT_B ? ' b' : ''}`);
const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

const errors = [];
const fails = [];
const stats = {};
const count = (k) => { stats[k] = (stats[k] ?? 0) + 1; };

const browser = await launchChrome();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));

await page.goto('http://localhost:5178/', { waitUntil: 'networkidle' });
const solo = page.locator('.scrim.show button.btn', { hasText: 'Chơi trên một máy' });
await solo.waitFor({ timeout: 30000 });
await solo.click();
await page.waitForTimeout(2200);
await page.locator('.count-btn[data-n="4"]').click();
const names = ['Công Nhân', 'Du Hành', 'Đỏ Đen', 'Đầu Cơ'];
for (let i = 0; i < 4; i++) await page.locator('#name-list input').nth(i).fill(names[i]);
await page.getByRole('button', { name: 'Khai cuộc' }).click();
await page.waitForTimeout(3200);
await playRollOff(page);

/* ---- chia build và dựng thế cờ có đủ chỗ cho kỹ năng đụng nhau ---- */
const lvRolls = Array.from({ length: 40 }, () => 1 + Math.floor(rand() * 3));
await page.evaluate(([lvRolls, ultB]) => {
  const c = window.__monopoly.controller;
  const s = c.state;
  const builds = [
    // Mỗi ghế kèm vài kỹ năng thành tựu, để luồng lượt chạy qua cả chúng
    ['cn1', 'cn2a', 'cn2b', 'cn3', 'cnU', 'cnX1', 'cnX2'],
    ['dh1', 'dh2a', 'dh2b', 'dh3', 'dhU', 'dhX1', 'dhX2'],
    ['dd1', 'dd2a', 'dd2b', 'dd3', 'ddU', 'ac1', 'ddX1', 'ddX2', 'acX2'],
    ['dc1', 'dc2a', 'dc2b', 'dc3', 'dcU', 'acX2', 'ac1', 'ac2a', 'ac2b', 'ac3', 'acU', 'dcX1', 'dcX2', 'acX1'],
  ];
  // Tối thượng thứ hai: đổi mọi id 'xxU' thành 'xxV'
  if (ultB) builds.forEach((b) => b.forEach((id, j) => { if (/U$/.test(id)) b[j] = id.replace(/U$/, 'V'); }));
  s.players.forEach((p, i) => { p.skills = builds[i]; p.money = 2000; p.skillPoints = 2; });
  // Level: ghế 0 toàn level 3, ghế 2 toàn level 1, ghế 1 và 3 rút theo seed
  let k = 0;
  s.players.forEach((p, i) => {
    p.skillLv = {};
    for (const id of p.skills) {
      const lv = i === 0 ? 3 : i === 2 ? 1 : lvRolls[k++];
      if (lv > 1) p.skillLv[id] = lv;
    }
  });
  /* Đếm tiền Liên Đoàn thu được mỗi lần qua ô Bắt Đầu — để so với lương và
     với tiền các nhánh khác kiếm được (cân bằng tối thượng Công Nhân). */
  window.__levy = [];
  const lapEnd = c.skills.lapEnd.bind(c.skills);
  c.skills.lapEnd = async (p) => {
    const m0 = p.money;
    const rate = p.skills.includes('cnU') ? (await import('/src/core/skills.js')).levyRate(p) : null;
    await lapEnd(p);
    if (rate !== null) window.__levy.push({ laps: p.laps, jails: p.jails, rate, got: p.money - m0 });
  };
  // Công Nhân: đủ bộ cam, đã có nhà — mục tiêu cho thẻ dỡ nhà, động đất
  for (const id of [16, 18, 19]) { s.owner.set(id, 0); s.houses.set(id, 2); s.bankHouses -= 2; }
  // Du Hành: 3 bến/ga
  for (const id of [5, 15, 25]) s.owner.set(id, 1);
  // Đỏ Đen: bộ nâu, chưa xây — mồi cho Thâu Tóm
  for (const id of [1, 3]) s.owner.set(id, 2);
  // Đầu Cơ: 2/3 bộ đỏ (Chung Cư Mini xây được) + đất lẻ nhiều màu
  for (const id of [21, 23, 6, 11, 26, 31, 37]) s.owner.set(id, 3);
  // Ô thứ ba của bộ đỏ trong tay Công Nhân — không ai đủ bộ đỏ
  s.owner.set(24, 0);
  c.hud.refresh(); c.scene.refresh(s); c.restoreActions();
}, [lvRolls, ULT_B]);

/* ================================================================ lái tự động */

const shown = () => page.locator('#modal-root .scrim.show');
const topScrim = () => shown().last();

/**
 * Vừa gặp hộp "Còn thiếu …": lần mở bảng quản lý kế tiếp phải bán / thế chấp
 * thật một món rồi mới đóng. Đóng tay không thì nợ còn nguyên, hộp thiếu tiền
 * hiện lại, và vòng đó lặp mãi. Mỗi lần chỉ gỡ một món: còn thiếu thì hộp hiện
 * lại và bật cờ này lần nữa.
 */
let inDebt = false;

/** Trả lời hộp thoại trên cùng. Hộp kỹ năng chọn ngẫu nhiên; hộp khác chọn như play-through. */
async function answerModal() {
  const top = topScrim();
  const eyebrow = (await top.locator('.modal-eyebrow').first().textContent().catch(() => '')) || '';
  const btns = top.locator('.modal-foot button.btn:not([disabled])');
  const n = await btns.count();

  if (/THIẾU TIỀN/i.test(eyebrow)) inDebt = true;
  if (inDebt) {
    const raise = top.locator('button[data-act="sell"]:not([disabled]), button[data-act="mortgage"]:not([disabled])');
    if (await raise.count()) {
      await raise.first().click();
      inDebt = false;
      count('xoay tiền trả nợ');
      return 'xoay tiền';
    }
  }

  // Cây kỹ năng: học ô mới hoặc lên level một ô đang sáng nếu có, rồi đóng
  if (await top.locator('.st').count()) {
    const ready = top.locator('.st-node.is-ready, .st-node.can-up');
    if (await ready.count()) {
      await ready.nth(Math.floor(rand() * await ready.count())).click();
      await page.waitForTimeout(250);
      await top.locator('[data-act="learn"]').click();
      await page.waitForTimeout(400);
      count('học kỹ năng giữa ván');
    }
    await top.locator('.st-close').click();
    return 'cây kỹ năng';
  }

  // Xổ Số: chọn một tổng ngẫu nhiên. Đứng trước hộp cược vì cũng nằm trong `.sk-bet`
  if (await top.locator('.sk-lotto').count()) {
    const nums = top.locator('.sk-lotto button');
    await nums.nth(Math.floor(rand() * await nums.count())).click();
    await top.locator('.modal-foot button', { hasText: 'Chọn số này' }).click();
    count('chọn số Xổ Số');
    return 'xổ số';
  }

  // Hộp cược: chọn cửa + số tiền ngẫu nhiên
  if (await top.locator('.sk-bet').count()) {
    await top.locator('[data-row="pick"] button').nth(Math.floor(rand() * 2)).click();
    const amts = top.locator('[data-row="amount"] button:not([disabled])');
    if (await amts.count()) await amts.nth(Math.floor(rand() * await amts.count())).click();
    // Nút đầu ở chân hộp: "Cược" của hộp hỏi lúc Lắc, "Xong" của bảng chọn Tất Tay
    await top.locator('.modal-foot button').first().click();
    count('cược chẵn lẻ');
    return 'cược';
  }

  if (/Kỹ năng/i.test(eyebrow) && n) {
    const i = Math.floor(rand() * n);
    const label = (await btns.nth(i).textContent()).replace(/[⏎]|Esc/g, '').trim();
    count(`${eyebrow.replace(/Kỹ năng · /i, '').trim()} → ${label.split('·')[0].trim()}`);
    await btns.nth(i).click();
    return eyebrow;
  }

  // Hộp thường của game: ưu tiên như play-through, tránh tự phá sản khi còn đường khác
  /* "Chốt giá" là nút duy nhất ở chân hộp đấu giá. Thiếu nó thì lượt dò
     dưới cùng bấm trúng nút giá nhanh (chỉ điền số, không đóng hộp) và
     bấm mãi tới khi chốt canh 90 giây báo kẹt. */
  const order = ['Mua ', 'Nhận tiền', 'Đành chịu', 'Tiếp tục', 'Chấp nhận', 'Lên đường', 'Cất vào túi',
    'Chốt giá', 'Xong', 'Đóng', 'Đã rõ', 'Bỏ qua', 'Để sau', 'Chơi tiếp', 'Bán nhà', 'Thôi', 'Không cược', 'Chưa đạp', 'Huỷ'];
  // Đấu giá: thỉnh thoảng ghi giá thật để phiên có người thắng — Môi Giới ăn hoa hồng cả lúc này
  if (await top.locator('#bid-input').count() && rand() < 0.5) {
    const q = top.locator('.bid-q:not([disabled])');
    if (await q.count()) { await q.nth(Math.floor(rand() * await q.count())).click(); count('ghi giá đấu giá'); }
  }
  for (const label of order) {
    const b = top.locator('.modal-foot button.btn:not([disabled])', { hasText: label }).first();
    if (await b.count()) { await b.click(); return eyebrow || label; }
  }
  // Hộp nhập giá đấu giá, chống đỡ… — nút đầu tiên còn bấm được
  const any = top.locator('button.btn:not([disabled])').first();
  if (await any.count()) { await any.click(); return eyebrow || 'khác'; }
  // Hộp chỉ để xem (không nút): Esc
  await page.keyboard.press('Escape');
  return 'esc';
}

/** Dọn hộp thoại và phiên chọn ô cho tới khi sạch. */
async function drain(maxMs = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    if (await picking(page)) {
      // Có nút bỏ ngang thì thỉnh thoảng bỏ ngang, còn lại chọn một ô
      const cancel = page.locator('.tp-cancel');
      if (await cancel.count() && rand() < 0.3) await cancel.click();
      else await pickOnBoard(page).catch(() => {});
      count('chọn ô trên bàn');
      await page.waitForTimeout(500);
      continue;
    }
    if (await shown().count() === 0) {
      await page.waitForTimeout(350);
      if (await shown().count() === 0 && !(await picking(page))) return;
      continue;
    }
    await answerModal().catch(() => {});
    await page.waitForTimeout(450);
  }
}

/** Bấm một nút trên thanh hành động theo phím tắt, nếu có và bấm được. */
async function press(key) {
  const b = page.locator(`#actions button[data-key="${key}"]:not([disabled])`).first();
  if (!(await b.count())) return false;
  await b.click();
  return true;
}

/* ================================================================ kiểm bất biến */

const invariants = () => page.evaluate(async () => {
  const s = window.__monopoly.controller.state;
  const { skillById } = await import('/src/core/skills.js');
  const bad = [];
  let houses = 0, hotels = 0;
  for (const [id, h] of s.houses) {
    if (!Number.isInteger(h) || h < 0 || h > 5) bad.push(`ô ${id} có ${h} cấp nhà`);
    if (h === 5) hotels += 1; else houses += h;
  }
  if (houses + s.bankHouses !== 32) bad.push(`nhà ${houses} + kho ${s.bankHouses} ≠ 32`);
  if (hotels + s.bankHotels !== 12) bad.push(`khách sạn ${hotels} + kho ${s.bankHotels} ≠ 12`);
  for (const id of s.heritage) if (s.housesOn(id) !== 5) bad.push(`Di Sản ở ô ${id} mà không có khách sạn`);
  for (const [id, seat] of s.owner) {
    if (!s.players[seat] || s.players[seat].bankrupt) bad.push(`ô ${id} thuộc ghế ${seat} đã phá sản / không tồn tại`);
  }
  for (const p of s.players) {
    if (!Number.isFinite(p.money) || !Number.isInteger(p.money)) bad.push(`${p.name} tiền = ${p.money}`);
    if (!p.bankrupt && p.money < 0) bad.push(`${p.name} âm tiền ${p.money}`);
    if (!(p.skillPoints >= 0)) bad.push(`${p.name} điểm kỹ năng ${p.skillPoints}`);
    if (new Set(p.skills).size !== p.skills.length) bad.push(`${p.name} học trùng kỹ năng`);
    for (const id of p.skills) {
      const sk = skillById(id);
      if (!sk) bad.push(`${p.name} có kỹ năng lạ ${id}`);
      else if (sk.requires?.length && !sk.requires.some((r) => p.skills.includes(r))) bad.push(`${p.name} học ${id} mà thiếu điều kiện`);
    }
    for (const [id, u] of Object.entries(p.skillUse ?? {})) {
      for (const k of ['n', 'gain']) {
        const v = u[k] ?? 0;
        if (!Number.isInteger(v) || v < 0) bad.push(`${p.name} tiến độ ${id}.${k} = ${v}`);
      }
    }
    for (const [id, n] of Object.entries(p.cooldowns ?? {})) {
      if (!Number.isInteger(n) || n <= 0) bad.push(`${p.name} hồi chiêu ${id} = ${n}`);
    }
    for (const [id, lv] of Object.entries(p.skillLv ?? {})) {
      if (!p.skills.includes(id)) bad.push(`${p.name} có level ${lv} cho ${id} mà chưa học`);
      if (lv !== 2 && lv !== 3) bad.push(`${p.name} level ${id} = ${lv}`);
    }
    for (const [id, n] of Object.entries(p.lapUses ?? {})) {
      const lv = p.skillLv?.[id] ?? 1;
      const charges = skillById(id)?.levels[lv - 1].charges ?? 1;
      if (!Number.isInteger(n) || n <= 0 || n >= charges) bad.push(`${p.name} đã dùng ${id} ${n}/${charges} lần mà chưa chờ`);
    }
    if (!Number.isInteger(p.jails) || p.jails < 0) bad.push(`${p.name} số lần vào tù = ${p.jails}`);
  }
  return { bad, turnNo: s.turnNo, over: s.over, alive: s.alive().length };
});

const diagnose = () => page.evaluate(() => ({
  actions: [...document.querySelectorAll('#actions button')].map((b) => `${b.textContent.trim()}${b.disabled ? ' (tắt)' : ''}`),
  modal: [...document.querySelectorAll('#modal-root .scrim.show .modal-title')].map((e) => e.textContent),
  // Mọi hộp đang có trong DOM (kể cả đang ẩn để nhìn bàn cờ): eyebrow, lớp, nút và nút nào tắt
  scrims: [...document.querySelectorAll('#modal-root .scrim')].map((sc) => ({
    cls: sc.className,
    eyebrow: sc.querySelector('.modal-eyebrow')?.textContent.trim(),
    title: sc.querySelector('.modal-title')?.textContent.trim(),
    buttons: [...sc.querySelectorAll('button')].map((b) => `${b.className.split(' ').filter((c) => c.startsWith('btn') || c.includes('peek')).join('.')}:${b.textContent.trim().slice(0, 30)}${b.disabled ? ' (tắt)' : ''}`),
  })),
  turn: window.__monopoly.controller.state.turn,
  pos: window.__monopoly.controller.state.current?.pos,
  money: window.__monopoly.controller.state.current?.money,
  picking: !!document.querySelector('.tile-pick'),
  busy: window.__monopoly.controller.busy,
}));

/* ================================================================ chơi */

let lastTurnNo = -1;
let lastMove = Date.now();
let played = 0;

for (let step = 0; played < TURNS; step++) {
  await drain(15000);

  const inv = await invariants();
  if (inv.bad.length) {
    fails.push(`lượt ${inv.turnNo}: ${inv.bad.join('; ')}`);
    console.log(`  ✗ lượt ${inv.turnNo}:`, inv.bad);
    break;
  }
  if (inv.over || inv.alive < 2) { console.log(`  ván kết thúc ở lượt ${inv.turnNo}`); break; }
  if (inv.turnNo !== lastTurnNo) {
    lastTurnNo = inv.turnNo; lastMove = Date.now(); played += 1;
    if (played % 8 === 0) console.log(`  … ${played} lượt, còn ${inv.alive} người`);
  } else if (Date.now() - lastMove > 90000) {
    fails.push(`kẹt ở lượt ${inv.turnNo}`);
    console.log('  ✗ ván đứng yên 90 giây:', JSON.stringify(await diagnose()));
    await page.screenshot({ path: 'test-result/skills-play-stuck.png' }).catch(() => {});
    break;
  }

  // Trước khi lắc: thử các nút kỹ năng một cách ngẫu nhiên
  if (rand() < 0.25 && await press('k')) { count('mở cây kỹ năng'); await drain(8000); }
  if (rand() < 0.5 && await press('c')) { await drain(8000); }
  if (rand() < 0.35 && await press('a')) { await drain(8000); }
  if (rand() < 0.3 && await press('x')) { count('bấm Xuyên Việt'); await drain(15000); }

  if (await press('r') || await press('n') || await press('e')) {
    await page.waitForTimeout(600);
    continue;
  }
  await page.waitForTimeout(500);
}

/* ================================================================ tổng kết */

const end = await page.evaluate(() => {
  const s = window.__monopoly.controller.state;
  return {
    players: s.players.map((p) => ({
      name: p.name, money: p.money, worth: p.bankrupt ? 0 : s.netWorth(p.id), bankrupt: p.bankrupt,
      laps: p.laps, jails: p.jails, pts: p.skillPoints, skills: p.skills.length,
      lv: Object.values(p.skillLv ?? {}).reduce((n, x) => n + x - 1, 0), cd: p.cooldowns,
    })),
    levy: window.__levy,
  };
});
console.log('\nKết cục:');
for (const p of end.players) {
  console.log(`  ${p.name}: ${p.bankrupt ? 'phá sản' : `${p.money}$ (tài sản ${p.worth}$)`} · qua Bắt Đầu ${p.laps} lần · vào tù ${p.jails} lần`
    + ` · ${p.skills} kỹ năng, +${p.lv} level · còn ${p.pts} điểm · hồi ${JSON.stringify(p.cd)}`);
}
const laps = end.players.reduce((n, p) => n + p.laps, 0);
const jails = end.players.reduce((n, p) => n + p.jails, 0);
console.log(`\nTỉ lệ vào tù: ${jails} lần / ${laps} lần qua ô Bắt Đầu = ${laps ? (jails / laps).toFixed(2) : '—'} lần tù mỗi vòng`);
if (end.levy.length) {
  console.log('Liên Đoàn Lao Động từng lần qua ô Bắt Đầu (lần qua · tù · tỉ lệ · thu được):');
  for (const l of end.levy) console.log(`  lần ${l.laps} · tù ${l.jails} · ${Math.round(l.rate * 100)}% · +${l.got}$`);
}
console.log('\nKỹ năng đã kích hoạt / lựa chọn đã bấm:');
for (const [k, v] of Object.entries(stats).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)} × ${k}`);

// Dòng thông báo kỹ năng đã hiện trên bàn — đếm qua lịch sử dải thông báo nếu có
console.log(`\nĐã chơi ${played} lượt.`);
// Tiến độ lên level và bộ đếm thành tựu cuối ván — để thấy ngưỡng `grow` có với tới được không
const prog = await page.evaluate(() => window.__monopoly.controller.state.players.map((p) => ({
  name: p.name, laps: p.laps, jails: p.jails,
  use: Object.fromEntries(Object.entries(p.skillUse ?? {}).map(([id, u]) => [id, `${u.n} lần/${u.gain}$`])),
})));
console.log('\nTiến độ kỹ năng cuối ván:');
for (const x of prog) console.log(`  ${x.name} · qua ${x.laps} · tù ${x.jails}\n    ${JSON.stringify(x.use)}`);
if (errors.length) { console.log('\nLỗi console:'); for (const e of errors.slice(0, 15)) console.log('  ' + e); fails.push('lỗi console'); }
console.log(fails.length ? `\n✗ ${fails.length} chỗ hỏng:\n  ${fails.join('\n  ')}` : '\n✓ Không có chỗ nào hỏng.');
await browser.close();
process.exit(fails.length ? 1 : 0);
