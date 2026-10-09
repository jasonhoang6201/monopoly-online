/**
 * Cây kỹ năng trong ván thật (bản một máy). Kiểm:
 *   - qua ô Bắt Đầu +1 điểm, lương tính Tăng Ca / Thâm Niên / Về Nhà;
 *   - nút Kỹ năng mở cây, học được, điểm trừ đúng giá;
 *   - hệ số thuê của chủ đất (Cơn Sốt Đất, Đất Nhiều Màu) và người trả (Vé Tháng);
 *   - Mái Ấm, Sổ Hồng (nhà không bị dỡ, tiền giữ nhà), Chung Cư Mini, Thầu Vật Liệu;
 *   - kỹ năng bấm để dùng: Xí Ngầu Gian, Cược Chẵn Lẻ, Thâu Tóm, hồi lại sau khi qua ô Bắt Đầu;
 *   - Phố Cổ xây căn miễn phí, Liên Đoàn Lao Động thu quỹ;
 *   - ảnh chụp online mang đủ dữ liệu kỹ năng;
 *   - lên level phải đạt điều kiện (dùng đủ lần / kiếm đủ tiền) ngoài 1 điểm;
 *   - 10 kỹ năng từng là thành tựu: học ngay khi có ô cha, chạy đúng tác dụng;
 *   - thẻ chi tiết hiện số liệu lúc này (Liên Đoàn: số lần qua, vào tù, tiền thu).
 * Cần dev server ở cổng 5178.
 */
import { launchChrome } from './launch.mjs';
import { playRollOff } from './rolloff.mjs';
import { markedTiles, clickDie, dicePickable } from './pick.mjs';

const errors = [];
let fails = 0;
const log = (...a) => console.log(...a);
const check = (ok, msg) => { log(`  ${ok ? '✓' : '✗'} ${msg}`); if (!ok) fails++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await launchChrome();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto('http://localhost:5178/', { waitUntil: 'networkidle' });
const solo = page.locator('.scrim.show button.btn', { hasText: 'Chơi trên một máy' });
await solo.waitFor({ timeout: 30000 });
await solo.click();
await page.waitForTimeout(2200);
await page.locator('.count-btn[data-n="3"]').click();
const names = ['Ba Tư', 'Cô Hai', 'Chú Sáu'];
for (let i = 0; i < 3; i++) await page.locator('#name-list input').nth(i).fill(names[i]);
await page.getByRole('button', { name: 'Khai cuộc' }).click();
await page.waitForTimeout(3200);
await playRollOff(page);
await page.waitForTimeout(600);

/** Chạy một đoạn trong trang với `c` = controller, `s` = state, `K` = core/skills.js. */
const run = (fn, arg) => page.evaluate(async ([src, a]) => {
  const c = window.__monopoly.controller;
  const K = await import('/src/core/skills.js');
  const S = await import('/src/core/serialize.js');
  // eslint-disable-next-line no-new-func
  return new Function('c', 's', 'K', 'S', 'a', `return (async () => { ${src} })()`)(c, c.state, K, S, a);
}, [fn, arg]);

/** Đưa bàn về trạng thái sạch cho từng phần kiểm. */
const reset = () => run(`
  for (const p of s.players) {
    p.money = 1500; p.skills = []; p.skillPoints = 0; p.laps = 0; p.cooldowns = {}; p.usedTurn = {};
    p.skillLv = {}; p.skillOff = []; p.betSet = null; p.lapUses = {}; p.jails = 0; p.skillUse = {};
    p.pos = 5; p.inJail = false; p.bankrupt = false;
  }
  s.owner.clear(); s.houses.clear(); s.mortgaged.clear(); s.heritage.clear();
  s.bankHouses = 32; s.bankHotels = 12; s.mods = []; s.pot = 0;
  c.hud.refresh(); c.scene.refresh(s);
`);

/** Bấm nút trong hộp thoại đang mở trên cùng. */
/** Kho "Dùng kỹ năng": ô của kỹ năng tên `name`, ô xám (tắt) hay không, mở kho, nút ở chân hộp trên cùng. */
const item = (name) => page.locator('.kit-item', { hasText: name });
const isGray = (name) => item(name).evaluate((e) => e.classList.contains('is-off'));
const openKit = async () => { await page.locator('#actions button[data-key="u"]').click(); await item('').first().waitFor({ timeout: 5000 }); };
/** Nút chân hộp: có bảng chọn đang mở thì là hộp ấy, không thì là hộp kho. */
const topBtn = (text) => page.locator('#modal-root .scrim.show:not(.stashed):not(.hide)').last().locator('.modal-foot button', { hasText: text });
/** Bấm nút trong bảng chọn đang mở (Chẵn, Lẻ, 100$, Không…). */
const pickIn = (text) => page.locator('.sk-bet button', { hasText: text }).first().click();

async function clickModal(text) {
  const btn = page.locator('#modal-root .scrim.show').last().locator('button', { hasText: text }).first();
  await btn.waitFor({ timeout: 8000 });
  await btn.click();
}

const turn = await run('return s.turn;');
log('người đang đi:', turn);

/* ------------------------------------------------ 1. luật số */
log('\n=== 1. LUẬT SỐ ===');
await reset();
check(await run(`const p = s.current; return s.salary(false, p);`) === 200, 'lương gốc $200');
// Level 1 rút ngẫu nhiên trong khoảng, bước 5$: rút 40 lần, số nào cũng phải nằm trong khoảng
const l1 = await run(`const p = s.current; p.skills = ['cn1','cn2a'];
  return Array.from({ length: 40 }, () => s.salary(false, p));`);
check(l1.every((n) => n >= 220 && n <= 250 && n % 5 === 0) && new Set(l1).size > 1,
  `Tăng Ca level 1: lương 220–250$, bước 5$, không phải một số cố định (${[...new Set(l1)].sort().join(',')})`);
check(await run(`const p = s.current; p.skills = ['cn1','cn2a']; p.skillLv = { cn2a: 2 }; return s.salary(false, p);`) === 240, 'Tăng Ca level 2: $240');
check(await run(`const p = s.current; p.skills = ['cn1','cn2a','cn3']; p.skillLv = { cn2a: 2, cn3: 2 }; p.laps = 8; return s.salary(false, p);`) === 360,
  'Tăng Ca + Thâm Niên level 2, lần thứ 8: 200 + 40 + 120 (trần) = $360');
check(await run(`const p = s.current; p.skills = ['cn1','cn2a','cn3']; p.skillLv = { cn3: 3 }; p.laps = 20; p.skillLv.cn2a = 3; return s.salary(false, p);`) === 410,
  'Thâm Niên level 3 chạm trần +150$: 200 + 60 + 150 = $410');
check(await run(`const p = s.current; p.skills = ['dh1','dh2b']; return s.salary(true, p);`) === 400,
  'Về Nhà: dừng đúng ô Bắt Đầu ×2 = $400');
check(await run(`const p = s.current; p.skills = ['dh1','dh2b']; p.skillLv = { dh2b: 3 }; return s.salary(true, p);`) === 500,
  'Về Nhà level 3: ×2.5 = $500');

// Học / lên level / tẩy điểm ở tầng luật
const lv = await run(`
  const K = await import('/src/core/skills.js');
  const p = { skills: [], skillLv: {}, skillPoints: 6, money: 1000 };
  const a = K.learnSkill(p, 'cn1');            // mở: 1 điểm
  const blocked = K.learnSkill(p, 'cn1');      // chưa kiếm được đồng nào từ kỹ năng: chưa lên được
  K.credit(p, 'cn1', 60);
  const still = K.canLearn(p, 'cn1');          // 60/100$: vẫn thiếu
  K.credit(p, 'cn1', 40);
  const b = K.learnSkill(p, 'cn1');            // đủ 100$: lên 2, 1 điểm
  const blocked3 = K.canLearn(p, 'cn1');       // level 3 cần 250$ cộng dồn
  K.credit(p, 'cn1', 150);
  const c2 = K.learnSkill(p, 'cn1');           // lên 3: 1 điểm
  const d = K.learnSkill(p, 'cn1');            // quá 3: không được
  const spent = K.spentTotal(p);
  const pts = p.skillPoints;
  const r = K.respec(p);
  return { a: a.level, blocked: blocked.ok, why: blocked.reason, still: still.ok, blocked3: blocked3.ok,
           use: p.skillUse.cn1, b: b.level, c: c2.level, d: d.ok, spent, pts, refund: r.refund, after: p.skillPoints,
           money: p.money, lvAfter: K.levelOf(p, 'cn1'), line: K.levelLine(K.skillById('cn1'), 1),
           keptUse: p.skillUse.cn1?.gain };
`);
check(lv.blocked === false && lv.why.includes('100$') && lv.still === false,
  `lên level bị chặn tới khi kỹ năng kiếm đủ 100$ (${lv.why})`);
check(lv.blocked3 === false && lv.use.n === 3 && lv.use.gain === 250, `level 3 cần cộng dồn 250$, bộ đếm ghi đủ lần và tiền (${JSON.stringify(lv.use)})`);
check(lv.keptUse === 250, 'tẩy điểm giữ tiến độ lên level');
check(lv.a === 1 && lv.b === 2 && lv.c === 3 && lv.d === false, `lên level 1 → 2 → 3, level 4 bị chặn (${JSON.stringify(lv)})`);
check(lv.spent === 3 && lv.pts === 3, 'mỗi level tốn 1 điểm, tổng 3 điểm cho ô cấp 1 lên level 3');
check(lv.refund === 3 && lv.after === 6 && lv.money === 850 && lv.lvAfter === 0, 'tẩy điểm hoàn đủ cả điểm level, phí 50$/điểm');
check(lv.line === '35% khả năng nhặt 10–30$', `chữ level 1 hiện khoảng "10–30$" (${lv.line})`);

// Điều kiện lên level theo tài sản đang có: Mái Ấm đếm số ô, Đất Nhiều Màu đếm màu, Công Đoàn tính tổng tài sản
await reset();
const est = await run(`
  const p = s.current; p.skills = ['ac1','ac2b','cn1','cn2b']; p.skillPoints = 9;
  const own = (ids) => { s.owner.clear(); for (const id of ids) s.owner.set(id, p.id); };
  own([1, 3, 5]);                            // 3 ô: 1 màu (nâu) + 1 bến
  const noSt = K.canLearn(p, 'ac1');         // thiếu bàn cờ: coi như chưa đạt
  const four = K.canLearn(p, 'ac1', s);
  const colors3 = K.canLearn(p, 'ac2b', s);
  own([1, 3, 5, 6]);                         // 4 ô
  const five = K.learnSkill(p, 'ac1', s);
  own([1, 6, 11, 16, 21]);                   // 5 ô, 5 màu
  const colors4 = K.learnSkill(p, 'ac2b', s);
  p.money = 500;                            // 500$ + 700$ đất = 1200$
  const poor = K.canLearn(p, 'cn2b', s);
  p.money = 3000;
  const rich = K.learnSkill(p, 'cn2b', s);
  return { noSt: noSt.ok, four: four.ok, why: four.reason, colors3: colors3.ok, five: five.level, colors4: colors4.level,
    poor: poor.reason, rich: rich.level,
    tip: K.growText(K.skillById('ac1'), 2) + ' · ' + K.growProgress(p, K.skillById('ac1'), 3, s) };
`);
check(est.noSt === false && est.four === false && est.why.includes('3/4 ô'), `Mái Ấm cần 4 ô mới lên level 2 (${est.why})`);
check(est.five === 2, 'đủ 4 ô: Mái Ấm lên level 2');
check(est.colors3 === false && est.colors4 === 2, 'Đất Nhiều Màu cần đất ở 3 màu');
check(est.poor.includes('1.500$') || est.poor.includes('1500$'), `Công Đoàn cần tổng tài sản 1500$ (${est.poor})`);
check(est.rich === 2, 'tổng tài sản đủ: Công Đoàn lên level 2');
check(est.tip.startsWith('Sở hữu 4 ô') && est.tip.includes('5/6 ô'), `chữ điều kiện và tiến độ (${est.tip})`);

await reset();
const rent = await run(`
  const me = s.turn, other = (s.turn + 1) % 3;
  for (const id of [5, 15]) s.owner.set(id, other);       // 2 bến ga → vé $50
  const base = s.rentFor(5, 7);
  s.players[other].skills = ['dc1','dc2a','dc3','dcU'];
  const fever = s.rentFor(5, 7);
  s.players[me].skills = ['dh1'];
  const payer = c.skills.rent(s.players[me], 5, { sum: 7 });
  s.players[me].skillLv = { dh1: 3 };
  const payer3 = Math.round(s.rentFor(5, 7) * 0.2) === c.skills.rent(s.players[me], 5, { sum: 7 }) ? c.skills.rent(s.players[me], 5, { sum: 7 }) : -1;
  s.players[other].skillLv = { dcU: 3 };
  const fever3 = s.rentFor(5, 7);
  s.players[other].skillLv = {};
  s.owner.set(1, other); s.owner.set(6, other);            // thêm 2 màu: nâu, xanh nhạt
  s.players[other].skills = ['ac1','ac2b'];
  const colors = s.rentFor(5, 7);
  return { base, fever, payer, payer3, fever3, colors };
`);
check(rent.base === 50, `vé 2 bến ga gốc $50 (được ${rent.base})`);
check(rent.fever === 150, `Cơn Sốt Đất ×3 → $150 (được ${rent.fever})`);
check(rent.payer === 90, `Vé Tháng level 1 trả 60% của $150 → $90 (được ${rent.payer})`);
check(rent.payer3 === 30, `Vé Tháng level 3 trả 20% của $150 → $30 (được ${rent.payer3})`);
check(rent.fever3 === 225, `Cơn Sốt Đất level 3 ×4.5 → $225 (được ${rent.fever3})`);
check(rent.colors === 53, `Đất Nhiều Màu level 1, 2 màu +6% → $53 (được ${rent.colors})`);

await reset();
const build = await run(`
  const me = s.turn, other = (s.turn + 1) % 3;
  for (const id of [21, 23]) s.owner.set(id, me);           // 2/3 bộ đỏ
  s.owner.set(24, other);
  s.players[me].skills = ['ac1','ac2a','ac3'];
  const before = s.canBuild(me, 21).ok;                     // Sổ Hồng không còn cho xây 2/3 bộ
  s.players[me].skills = ['ac1','ac2a','ac3','ac2b','acS1'];
  const cost = s.buildCost(21);
  const after = s.canBuild(me, 21).ok;
  s.players[other].skills = ['dc1','dc2b'];
  s.players[other].skillLv = { dc2b: 2 };
  const m0 = s.players[other].money;
  const res = s.build(me, 21);
  const contractor = s.players[other].money - m0;
  const gone = s.demolish(21);
  const refund1 = s.canSellHouse(me, 21).refund;
  s.players[me].skillLv = { ac3: 3 };
  const refund3 = s.canSellHouse(me, 21).refund;
  // Chung Cư Mini: mỗi ô đất lẻ tối đa 1 / 2 / 2 căn theo level
  const caps = [[1, 1], [2, 2], [3, 2]].map(([lv, cap]) => {
    s.players[me].skillLv = { ac3: 3, acS1: lv };
    s.houses.set(21, cap - 1); const under = s.canBuild(me, 21).ok;
    s.houses.set(21, cap); const over = s.canBuild(me, 21).ok;
    return under && !over;
  });
  // …và cộng mọi ô đất lẻ lại không quá 3 căn ở level 1: ô 21, 23 đã 3 căn thì ô 23 hết chỗ
  s.players[me].skillLv = { ac3: 3 };
  s.owner.set(26, me); s.owner.set(6, me);                  // thêm ô lẻ vàng, xanh nhạt
  s.houses.set(21, 1); s.houses.set(23, 0); s.houses.set(26, 1);
  const room1 = s.canBuild(me, 23).ok;                      // 2 căn trên đất lẻ: còn chỗ
  s.houses.set(23, 1);
  const total = s.canBuild(me, 6);                          // đã đủ 3 căn: ô thứ tư hết chỗ
  for (const id of [26, 6]) { s.owner.delete(id); s.houses.delete(id); }
  // Sổ Hồng level 3: 12$ mỗi căn khi qua ô Bắt Đầu, khách sạn tính 5
  s.houses.set(21, 2); s.houses.set(23, 5);
  const deed = s.payslip(false, s.players[me]);
  return { before, cost, after, ok: res.ok, contractor, gone, houses: 1, refund1, refund3, caps, room1, total: total.ok, why: total.reason, deed: deed.parts.ac3, pay: deed.total };
`);
check(!build.before, 'Sổ Hồng không còn cho xây với 2/3 bộ');
check(build.cost === 120, `Mái Ấm level 1 giảm 20%: căn $150 còn $120 (được ${build.cost})`);
check(build.after && build.ok, 'Chung Cư Mini: đất lẻ xây được');
check(build.caps.every(Boolean), `Chung Cư Mini level 1/2/3: mỗi ô đất lẻ tối đa 1/2/2 căn (${build.caps})`);
check(build.room1 && !build.total && /3 căn/.test(build.why), `Chung Cư Mini level 1: cả bàn đất lẻ tối đa 3 căn (${build.why})`);
check(build.deed === 84 && build.pay === 284, `Sổ Hồng level 3: 7 căn × 12$ = 84$ cộng vào lương (${build.deed}, ${build.pay})`);
check(build.contractor === 18, `Thầu Vật Liệu level 2: người khác xây → +$18 (được ${build.contractor})`);
check(build.gone === 0 && build.houses === 1, 'Sổ Hồng: nhà không bị dỡ');
check(build.refund1 === 75 && build.refund3 === 150, `Sổ Hồng: bán nhà level 1 lấy 50%, level 3 lấy 100% (${build.refund1}/${build.refund3})`);

await reset();
const snap = await run(`
  const p = s.players[1];
  p.skills = ['dd1','dd2a']; p.skillPoints = 3; p.laps = 4; p.cooldowns = { ddU: 2 };
  p.skillLv = { dd1: 3 }; p.lapUses = { dd3: 1 }; p.jails = 2;
  s.heritage.add(16);
  const snap = JSON.parse(JSON.stringify(S.snapshot(s)));
  const t = S.fromSnapshot(snap);
  const q = t.players[1];
  return { skills: q.skills, pts: q.skillPoints, laps: q.laps, cd: q.cooldowns, lv: q.skillLv,
           uses: q.lapUses, jails: q.jails, her: [...t.heritage] };
`);
check(JSON.stringify(snap) === JSON.stringify({ skills: ['dd1', 'dd2a'], pts: 3, laps: 4, cd: { ddU: 2 },
  lv: { dd1: 3 }, uses: { dd3: 1 }, jails: 2, her: [16] }),
  `ảnh chụp online mang đủ kỹ năng, level, điểm, số lần qua, hồi chiêu, số lần đã dùng, số lần vào tù, Di Sản (${JSON.stringify(snap)})`);

/* ------------------------------------------------ 2. qua ô Bắt Đầu */
log('\n=== 2. QUA Ô BẮT ĐẦU ===');
await reset();
await run(`
  const p = s.current; p.pos = 36; p.skills = ['dd1','dd2a','dd3']; p.cooldowns = { dd3: 1 };
  window.__lap = c.advance(p, 4, { a: 2, b: 2, sum: 4, isDouble: false });
`);
await run('await window.__lap;');
const lap = await run('const p = s.current; return { pts: p.skillPoints, laps: p.laps, money: p.money, cd: p.cooldowns };');
check(lap.pts === 1 && lap.laps === 1, `+1 điểm, +1 lần qua (điểm ${lap.pts}, lần ${lap.laps})`);
check(lap.money === 1800, `dừng đúng ô Bắt Đầu nhận $300 (tiền ${lap.money})`);
check(!lap.cd.dd3, 'Xí Ngầu Gian hồi lại sau khi qua ô Bắt Đầu');

/* ------------------------------------------------ 3. học qua giao diện */
log('\n=== 3. HỌC KỸ NĂNG ===');
await reset();
await run(`s.current.skillPoints = 3; c.restoreActions();`);
const kbtn = page.locator('#actions button[data-key="k"]');
check(await kbtn.count() === 1, 'thanh nút có nút Kỹ năng');
check((await kbtn.textContent()).includes('3 điểm chưa dùng'), 'nút ghi số điểm chưa dùng');
await kbtn.click();
await page.locator('.st-node[data-id="cn1"]').waitFor({ timeout: 5000 });
await page.locator('.st-node[data-id="cn1"]').click();
await page.locator('[data-act="learn"]').click();
await page.waitForTimeout(400);
await page.locator('.st-node[data-id="cn2a"]').click();
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
const learned = await run('return { skills: s.current.skills, pts: s.current.skillPoints };');
check(JSON.stringify(learned.skills) === '["cn1","cn2a"]' && learned.pts === 1, `học Nhặt Tiền Rơi + Tăng Ca, còn 1 điểm (${JSON.stringify(learned)})`);
check(await run(`return K.has(s.current, 'cn1') && !s.current.skillOff.length;`), 'kỹ năng tự động học xong là có tác dụng, không nằm tắt');
check(await page.locator('.st-node[data-id="cn1"].off').count() === 0, 'ô tự động không tô xám');
check(await page.locator('.st-node[data-id="cn1"].can-up').count() === 0, 'còn điểm mà chưa đạt điều kiện thì chưa có dấu lên level');
await page.locator('.st-node[data-id="cn1"]').click();
check(await page.locator('[data-act="learn"]:disabled').count() === 1, 'nút Lên level mờ khi chưa đạt điều kiện');
check((await page.locator('.sd-conds').textContent()).includes('Kiếm được 100$ từ kỹ năng này (0/100$)'),
  'thẻ chi tiết ghi điều kiện lên level kèm tiến độ 0/100$');
check((await page.locator('.sd-lvs').textContent()).includes('cần: Kiếm được 250$'), 'dòng level 3 ghi điều kiện');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
// Kỹ năng đã nhặt được 150$ trong ván: đủ điều kiện lên level 2
await run(`K.credit(s.current, 'cn1', 150);`);
await page.locator('.st-node[data-id="cn1"]').click();
check(await page.locator('[data-act="learn"]', { hasText: 'Lên level 2' }).count() === 1, 'thẻ chi tiết ô đã học có nút "Lên level 2"');
check(await page.locator('.sd-lvs li').count() === 3, 'thẻ chi tiết liệt kê 3 level');
await page.locator('[data-act="learn"]').click();
await page.waitForTimeout(400);
const up = await run('return { lv: s.current.skillLv.cn1, pts: s.current.skillPoints };');
check(up.lv === 2 && up.pts === 0, `Nhặt Tiền Rơi lên level 2, hết điểm (${JSON.stringify(up)})`);
check(await page.locator('.st-node[data-id="cn1"] .st-lv i.on').count() === 2, 'ô hiện 2 chấm level sáng');
await page.keyboard.press('Escape');
await page.waitForTimeout(3200);
check(await page.locator('.st').count() === 0, 'Esc đóng cây kỹ năng');
check(await page.locator('#actions button', { hasText: 'Lắc xí ngầu' }).count() === 1, 'thanh nút bày lại sau khi đóng');

/* ------------------------------------------------ 3b. công tắc kỹ năng bấm để dùng */
log('\n=== 3b. BẬT / TẮT ===');
await reset();
await run(`const p = s.current; p.skills = ['dd1']; p.skillPoints = 2; c.restoreActions();`);
await page.locator('#actions button[data-key="k"]').click();
await page.locator('.st-node[data-id="dd2a"]').click();
await page.locator('[data-act="learn"]').click();
await page.waitForTimeout(400);
check(await run(`return s.current.skills.includes('dd2a') && !K.has(s.current, 'dd2a');`), 'kỹ năng bấm để dùng học xong nằm tắt');
check(await page.locator('.st-node[data-id="dd2a"].off').count() === 1, 'ô đang tắt tô xám');
await page.locator('.st-node[data-id="dd2a"]').click();
// Bật / tắt chỉ trong kho Dùng kỹ năng: cây chỉ báo trạng thái
check(await page.locator('[data-act="toggle"]').count() === 0
  && await page.locator('.sd-wait', { hasText: 'kho Dùng kỹ năng' }).count() === 1,
  'thẻ chi tiết không có nút bật / tắt, chỉ chỉ sang kho');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
// Tất Tay làm một lần: không công tắc, học xong là có tác dụng (ghi được tiến độ lên level)
await run(`const p = s.current; p.skills = ['dd1','dd2b','dd3']; p.skillOff = []; p.skillPoints = 2;`);
await page.locator('.st-node[data-id="ddU"]').click();
await page.locator('[data-act="learn"]').click();
await page.waitForTimeout(400);
check(await run(`return K.has(s.current, 'ddU') && !s.current.skillOff.includes('ddU');`),
  'Tất Tay học xong có tác dụng ngay, không nằm tắt');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await page.keyboard.press('Escape');
await page.waitForTimeout(3200);
// Kho kỹ năng: ô có màu là bật, xám là tắt; mọi thao tác là bản nháp, Chốt mới áp dụng
await reset();
// dd3 trong skillOff: ảnh chụp cũ, lúc kỹ năng tự hỏi còn công tắc
await run(`const p = s.current; p.skills = ['dd1','dd2a','dd2b','dd3','ddS2','dh1','dh2b','dhS1']; p.skillOff = ['dd2a','dd3','ddS2','dhS1']; c.restoreActions();`);
await openKit();
check(await page.locator('.kit-sw').count() === 0, 'kho kỹ năng không còn công tắc');
check(await item('Xí Ngầu Gian').count() === 0 && await run(`return K.has(s.current, 'dd3')`),
  'kỹ năng tự hỏi (Xí Ngầu Gian) không nằm trong kho, luôn chạy dù ảnh chụp cũ ghi tắt');
check(await isGray('Cược Chẵn Lẻ') && await isGray('Xe Đạp'), 'kỹ năng đang tắt: ô xám');
// Cược: bấm ô mở bảng chọn có "Không"; chọn xong về lại kho
await item('Cược Chẵn Lẻ').click();
await page.locator('.sk-bet').waitFor({ timeout: 3000 });
check(await page.locator('.sk-bet [data-v="none"]', { hasText: 'Không' }).count() === 1, 'bảng cược có lựa chọn Không');
await pickIn('Lẻ');
await pickIn('100$');
await topBtn('Xong').click();
await page.waitForTimeout(400);
check(await page.locator('.sk-bet').count() === 0 && await item('Cược Chẵn Lẻ').isVisible(), 'chọn xong thì về lại kho');
check(!(await isGray('Cược Chẵn Lẻ')) && (await item('Cược Chẵn Lẻ').textContent()).includes('Lẻ 100$'), 'ô Cược có màu, ghi cửa và tiền vừa chọn');
await item('Xe Đạp').click();
check(!(await isGray('Xe Đạp')), 'bấm ô bật / tắt: ô có màu ngay');
check(await run(`return !K.has(s.current, 'dd2a') && !K.has(s.current, 'dhS1') && !s.current.betSet;`), 'chưa Chốt: trên ván chưa đổi gì');
await topBtn('Huỷ').click();
await page.waitForTimeout(500);
check(await run(`return !K.has(s.current, 'dd2a') && !K.has(s.current, 'dhS1') && !s.current.betSet;`), 'Huỷ: đóng kho, không đổi gì');
await openKit();
check(await isGray('Cược Chẵn Lẻ') && await isGray('Xe Đạp'), 'mở lại sau Huỷ: ô về như cũ');
await item('Cược Chẵn Lẻ').click();
await page.locator('.sk-bet').waitFor({ timeout: 3000 });
await pickIn('Lẻ');
await pickIn('100$');
await topBtn('Xong').click();
await page.waitForTimeout(300);
await item('Xe Đạp').click();
await item('Cò Quay').click();
await item('Cò Quay').click(); // bấm hai lần: coi như không đổi
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
check(await run(`const p = s.current; return K.has(p, 'dd2a') && K.has(p, 'dhS1') && !K.has(p, 'ddS2') && p.betSet?.pick === 'odd' && p.betSet?.amount === 100;`),
  'Enter: áp dụng cả hai ô trong một lần, lưu cửa Lẻ 100$');
const note = await page.locator('.bcast').last().textContent().catch(() => '');
check(note.includes('Cược Chẵn Lẻ') && note.includes('Xe Đạp') && note.includes('Lẻ 100$') && !note.includes('Cò Quay'),
  `loan tin một lần (${note.replace(/\s+/g, ' ').trim().slice(0, 100)})`);
await page.waitForTimeout(2400);
// Tự cược mỗi lượt, lúc bấm Lắc; đổ đôi lắc lại không cược thêm
const auto = await run(`const p = s.current; await c.skills.beforeRoll(p); const b1 = { ...c.skills.bet };
  c.skills.bet = null; await c.skills.beforeRoll(p); return { b1, again: c.skills.bet };`);
check(auto.b1.pick === 'odd' && auto.b1.amount === 100 && !auto.again, `lúc lắc tự cược Lẻ 100$, mỗi lượt một lần (${JSON.stringify(auto)})`);
const nextTurn = await run(`const p = s.current; s.turnNo += 1; c.skills.bet = null; await c.skills.beforeRoll(p); return c.skills.bet;`);
check(nextTurn?.pick === 'odd' && nextTurn?.amount === 100, 'lượt sau tự cược lại như cũ');
const poor = await run(`const p = s.current; s.turnNo += 1; c.skills.bet = null; p.money = 60; await c.skills.beforeRoll(p); const r = { bet: c.skills.bet, on: K.has(p, 'dd2a') }; p.money = 1500; return r;`);
check(!poor.bet && poor.on, 'không đủ tiền thì bỏ lượt ấy, kỹ năng vẫn bật');
await run('c.skills.bet = null; c.restoreActions();');
await page.waitForTimeout(2000);
// Chọn Không rồi Chốt: tắt
await openKit();
await item('Cược Chẵn Lẻ').click();
await page.locator('.sk-bet').waitFor({ timeout: 3000 });
await pickIn('Không');
await topBtn('Xong').click();
await page.waitForTimeout(300);
check(await isGray('Cược Chẵn Lẻ'), 'chọn Không: ô xám lại');
await topBtn('Chốt').click();
await page.waitForTimeout(2600);
check(await run(`return !K.has(s.current, 'dd2a');`), 'chọn Không rồi Chốt: Cược tắt');

// Cò Quay: kỹ năng bật là lương được quay
check(await run(`return c.skills.spinPay(s.current, 200).pay === 200;`), 'Cò Quay tắt: lương giữ nguyên');
await run(`s.current.skillOff = []; c.restoreActions();`);
check(await run(`return [100, 400].includes(c.skills.spinPay(s.current, 200).pay);`), 'Cò Quay bật: lương được quay (gấp đôi hoặc một nửa)');

// Xe Đạp: công tắc vĩnh viễn — bật rồi thì mọi lần lắc đi theo viên nhỏ, không hết lượt, không tự tắt
await reset();
await run(`const p = s.current; p.skills = ['dh1','dh2b','dhS1']; p.skillOff = ['dhS1']; c.restoreActions();`);
await openKit();
await item('Xe Đạp').click();
await topBtn('Chốt').click();
await page.waitForTimeout(2400);
const bike = await run(`const p = s.current;
  const d1 = c.skills.shape(p, { a: 5, b: 2, sum: 7, isDouble: false });
  const d2 = c.skills.shape(p, { a: 6, b: 4, sum: 10, isDouble: false });
  const dbl1 = c.skills.shape(p, { a: 3, b: 3, sum: 6, isDouble: true });
  p.skillLv = { dhS1: 2 };
  const dbl2 = c.skills.shape(p, { a: 3, b: 3, sum: 6, isDouble: true });
  const off = K.offSpent(p);
  p.skillLv = { dhS1: 3 }; const m0 = p.money; c.skills.pedal(p, d1); await c.skills.flushSlip(p, d1);
  return { s1: d1.sum, s2: d2.sum, dbl1: dbl1.isDouble, dbl2: dbl2.isDouble && dbl2.sum === 3, off, on: K.has(p, 'dhS1'), gas: p.money - m0 };`);
check(bike.s1 === 2 && bike.s2 === 4, `Xe Đạp bật: lần lắc nào cũng đi theo viên nhỏ (${JSON.stringify(bike)})`);
check(!bike.dbl1 && bike.dbl2, 'Xe Đạp level 1 ra đôi không tính đôi, level 2 tính đôi');
check(!bike.off.length && bike.on, 'Xe Đạp không hết lượt, cuối lượt vẫn bật');
check(bike.gas === 20, `Xe Đạp level 3: mỗi lần đạp +20$ (${bike.gas})`);
await run('c.restoreActions();');
await openKit();
await item('Xe Đạp').click();
await topBtn('Chốt').click();
await page.waitForTimeout(2400);
check(await run(`return !K.has(s.current, 'dhS1') && c.skills.shape(s.current, { a: 5, b: 2, sum: 7, isDouble: false }).sum === 7;`),
  'tắt Xe Đạp trong kho: đi đủ tổng hai viên');

/* ------------------------------------------------ 4. kỹ năng bấm để dùng */
log('\n=== 4. BẤM ĐỂ DÙNG ===');
await reset();
await run(`
  const p = s.current; p.pos = 10; p.skills = ['dd1','dd2a','dd3'];
  await c.scene.rollDiceAnim(3, 4);
  window.__ar = c.skills.afterRoll(p, { a: 3, b: 4, sum: 7, isDouble: false });
`);
await page.locator('.tile-pick[data-quick]:not(.out)').waitFor({ timeout: 5000 });
const xg = { lit: await markedTiles(page), dice: await dicePickable(page),
  acts: await page.locator('.tile-pick:not(.out) .tp-acts button').count(),
  modal: await page.locator('#modal-root .scrim.show').count() };
check(JSON.stringify(xg.lit) === '[17]' && xg.dice && xg.acts === 0 && xg.modal === 0,
  `Xí Ngầu Gian: sáng ô sẽ tới 17 + hai viên xí ngầu, không hộp thoại, không nút phụ (${JSON.stringify(xg)})`);
await clickDie(page, 1);
const ar = await run('const r = await window.__ar; return { sum: r.d.sum, a: r.d.a, cd: s.current.cooldowns.dd3 };');
check(ar.a === 3 && ar.sum >= 4 && ar.sum <= 9, `Xí Ngầu Gian: giữ viên 3, lắc lại viên kia (tổng ${ar.sum})`);
check(ar.cd === 4, `Xí Ngầu Gian level 1: dùng xong chờ 4 lần qua ô Bắt Đầu (${ar.cd})`);

// Level 2: vẫn 1 lần, chờ ngắn hơn (3 lần qua)
await run(`
  const p = s.current; p.cooldowns = {}; p.lapUses = {}; p.skillLv = { dd3: 2 };
  window.__ar = c.skills.afterRoll(p, { a: 3, b: 4, sum: 7, isDouble: false });
`);
await page.locator('.tile-pick[data-quick]:not(.out)').waitFor({ timeout: 5000 });
await page.evaluate(() => { window.__monopoly.scene.onTileClick(17); });
const arGo = await run('const r = await window.__ar; return { sum: r.d.sum, cd: s.current.cooldowns.dd3 ?? 0 };');
check(arGo.cd === 0, `bấm ô sáng là đi luôn, không tốn lượt Xí Ngầu Gian (${JSON.stringify(arGo)})`);
await run(`window.__ar = c.skills.afterRoll(s.current, { a: 3, b: 4, sum: 7, isDouble: false });`);
await page.locator('.tile-pick[data-quick]:not(.out)').waitFor({ timeout: 5000 });
await clickDie(page, 1);
const ar2 = await run('await window.__ar; return { cd: s.current.cooldowns.dd3 ?? 0, used: s.current.lapUses.dd3 ?? 0 };');
check(ar2.cd === 3 && ar2.used === 0, `Xí Ngầu Gian level 2: dùng xong chờ 3 lần qua ô Bắt Đầu (${JSON.stringify(ar2)})`);
await run('const p = s.current; p.cooldowns = { dd3: 1 }; p.skillLv = {};');

// Quay Đầu: ô đi tới và ô đi lùi cùng sáng trên bàn cờ, bấm ô nào đi ô ấy
await reset();
await run(`
  const p = s.current; p.pos = 10; p.skills = ['dh1','dh2a','dh3','dd1','dd2a','dd3'];
  window.__ar = c.skills.afterRoll(p, { a: 3, b: 4, sum: 7, isDouble: false });
`);
await page.locator('.tile-pick[data-quick]:not(.out)').waitFor({ timeout: 5000 });
const qd = { lit: (await markedTiles(page)).sort((a, b) => a - b),
  dice: await dicePickable(page),
  extra: await page.locator('.tile-pick .tp-extra').count(),
  cancel: await page.locator('.tile-pick .tp-cancel').textContent() };
check(JSON.stringify(qd.lit) === '[3,17]', `Quay Đầu: sáng ô đi tới 17 và ô đi lùi 3 (${qd.lit})`);
check(qd.dice && qd.extra === 0 && qd.cancel === 'Đi tới như thường',
  `hai viên xí ngầu bấm được, còn nút đi như thường (${JSON.stringify(qd)})`);
check(await page.locator('#modal-root .scrim.show').count() === 0, 'không mở hộp thoại nào che bàn cờ');
await page.evaluate(() => { window.__monopoly.scene.onTileClick(3); });
const qd1 = await run('const r = await window.__ar; return { back: r.back, used: s.current.cooldowns.dh3 ?? 0 };');
check(qd1.back === true && qd1.used === 3, `bấm ô 3 là đi lùi luôn, không hỏi lại; Quay Đầu level 1 chờ 3 lần qua (${JSON.stringify(qd1)})`);
check(await page.locator('.tile-pick:not(.out)').count() === 0, 'chọn xong thì bảng chọn đóng');
await run(`const p = s.current; p.cooldowns = {};
  window.__ar = c.skills.afterRoll(p, { a: 3, b: 4, sum: 7, isDouble: false });`);
await page.locator('.tile-pick:not(.out) .tp-cancel').click();
const qd2 = await run('const r = await window.__ar; return { back: r.back, cd: s.current.cooldowns.dh3 ?? 0 };');
check(qd2.back === false && qd2.cd === 0, `"Đi tới như thường": đi tới, không tốn lượt Quay Đầu (${JSON.stringify(qd2)})`);
await run(`const p = s.current; p.cooldowns = {};
  window.__ar = c.skills.afterRoll(p, { a: 3, b: 4, sum: 7, isDouble: false });`);
await page.locator('.tile-pick[data-quick]:not(.out)').waitFor({ timeout: 5000 });
await clickDie(page, 1);
// Lắc lại xong thì hỏi lần nữa với tổng mới — lúc này chỉ còn Quay Đầu, chọn đi tới
await page.waitForTimeout(2600);
await page.locator('.tile-pick:not(.out) .tp-cancel').click({ timeout: 8000 });
const qd3 = await run('const r = await window.__ar; return { a: r.d.a, back: r.back, dd3: s.current.cooldowns.dd3 ?? 0 };');
check(qd3.a === 3 && !qd3.back && qd3.dd3 === 4, `bấm viên phải chạy Xí Ngầu Gian rồi hỏi lại (${JSON.stringify(qd3)})`);

await run('c.restoreActions();');
await openKit();
await item('Cược Chẵn Lẻ').click();
await page.locator('.sk-bet').waitFor({ timeout: 3000 });
await pickIn('Lẻ');
await pickIn('100$');
await topBtn('Xong').click();
await topBtn('Chốt').click();
await page.waitForTimeout(2800);
await run('await c.skills.beforeRoll(s.current);');
const b1 = await run('return c.skills.bet;');
check(b1 && b1.pick === 'odd' && b1.amount === 100, `đã cược Lẻ $100 (${JSON.stringify(b1)})`);
await run('c.restoreActions();');
await openKit();
check((await item('Cược Chẵn Lẻ').textContent()).includes('Lượt này đã cược Lẻ'), 'ô trong kho ghi "Lượt này đã cược Lẻ"');
await topBtn('Huỷ').click();
await page.waitForTimeout(400);
const settle = await run(`
  const p = s.current; p.skills = ['dd2a']; const m0 = p.money;
  await c.skills.settleBets(p, { a: 2, b: 5, sum: 7, isDouble: false }); await c.skills.flushSlip(p, { a: 2, b: 5, sum: 7, isDouble: false });
  return p.money - m0;
`);
check(settle >= 60 && settle <= 140, `đoán đúng Lẻ ở level 1: +60–140$ (được ${settle})`);
const settle2 = await run(`
  const p = s.current; p.skillLv = { dd2a: 2 }; const m0 = p.money;
  c.skills.bet = { turnNo: s.turnNo, seat: p.id, pick: 'even', amount: 100 };
  await c.skills.settleBets(p, { a: 3, b: 5, sum: 8, isDouble: false }); await c.skills.flushSlip(p, { a: 3, b: 5, sum: 8, isDouble: false });
  return p.money - m0;
`);
check(settle2 === 105, `đoán đúng ở level 2: +105% tiền cược = $105 (được ${settle2})`);

await reset();
await run(`
  const me = s.current, other = s.players[(s.turn + 1) % 3];
  s.owner.set(21, other.id);
  me.skills = ['dc1','dc2a','dc3'];
  me.skillLv = { dc3: 2 };
  const { BOARD } = await import('/src/data/board.js');
  window.__seize = c.resolveOwnable(me, BOARD[21], { sum: 7 });
`);
await clickModal('Thâu Tóm');
await run('await window.__seize;');
const seized = await run(`const me = s.current; return { owner: s.owner.get(21), me: me.id, money: me.money, cd: me.cooldowns.dc3 };`);
check(seized.owner === seized.me, 'Thâu Tóm: lô 21 sang tên');
check(seized.money === 1500 - 242, `Thâu Tóm level 2: trả 110% giá gốc $242 (còn ${seized.money})`);
check(seized.cd === 1, 'Thâu Tóm level 2: chờ 1 lần qua ô Bắt Đầu');

/* ------------------------------------------------ 4b. ăn tiền từ việc người khác làm */
log('\n=== 4b. MÔI GIỚI · CÒ ĐẤT ===');
await reset();
const fees = await run(`
  const [a, b, broker] = [s.players[s.turn], s.players[(s.turn + 1) % 3], s.players[(s.turn + 2) % 3]];
  broker.skills = ['dc1', 'dc2a'];
  broker.skillLv = { dc1: 2, dc2a: 2 };
  s.owner.set(1, a.id); s.owner.set(3, b.id);                // hai lô nâu 60$
  const m0 = broker.money;
  await c.skills.brokerFees(a.id, 39);                         // a mua Dinh Toàn Quyền 400$
  const broke = broker.money - m0;
  const m1 = broker.money;
  await c.executeTrade({ give: [1], get: [3], giveMoney: 0, getMoney: 0 }, a, b);
  return { broke, cut: broker.money - m1, swapped: s.owner.get(1) === b.id && s.owner.get(3) === a.id };
`);
check(fees.broke === 72, `Môi Giới level 2: người khác mua lô 400$ → +18% = 72$ (được ${fees.broke})`);
check(fees.swapped && fees.cut === 42, `Cò Đất level 2: hai người khác đổi 2 lô 60$ → +35% = 42$ (được ${fees.cut})`);

/* ------------------------------------------------ 4c. Chuyến Tàu Xuyên Việt */
log('\n=== 4c. XUYÊN VIỆT ===');
await reset();
await run(`const p = s.current; p.pos = 5; p.skills = ['dh1','dh2a','dh3','dhU']; c.restoreActions();`);
await openKit();
await item('Chuyến Tàu Xuyên Việt').click();
await page.locator('.tile-pick').waitFor({ timeout: 5000 });
const tp = await page.locator('.tile-pick').textContent();
check(!/undefined/.test(tp) && tp.includes('Đi tới ô nào'), 'bảng chọn ô có tiêu đề, không chữ "undefined"');
check(await page.locator('.tp-cancel', { hasText: 'Không' }).count() === 1, 'bảng chọn ô có nút Không');
await page.locator('.tp-cancel').click();
await page.waitForTimeout(600);
check(await isGray('Chuyến Tàu Xuyên Việt'), 'chọn Không: về lại kho, ô xám');
await topBtn('Chốt').click();
await page.waitForTimeout(600);
check(await run('return !s.current.cooldowns.dhU && s.current.pos === 5;'), 'Chốt khi ô xám: chưa đi, chưa tốn lượt dùng');
await openKit();
await item('Chuyến Tàu Xuyên Việt').click();
await page.locator('.tile-pick').waitFor({ timeout: 5000 });
await page.evaluate(() => { window.__monopoly.scene.onTileClick(20); });
await page.waitForTimeout(400);
await page.locator('#modal-root .scrim.show:not(.stashed)').last().locator('.modal-foot button.btn').first().click();
await page.waitForTimeout(600);
check((await item('Chuyến Tàu Xuyên Việt').textContent()).includes('khi Chốt'), 'chọn ô xong về lại kho, ô ghi "Đi tới … khi Chốt"');
await topBtn('Chốt').click();
for (let i = 0; i < 20 && !(await run('return s.current.pos === 20 && !c.busy;')); i++) await wait(500);
const tele = await run('return { pos: s.current.pos, cd: s.current.cooldowns.dhU };');
check(tele.pos === 20 && tele.cd === 5, `đi thẳng tới Bến Đậu, level 1 chờ 5 lần qua ô Bắt Đầu (${JSON.stringify(tele)})`);
check(await page.locator('#actions button', { hasText: 'Kết thúc lượt' }).count() === 1, 'xong thì chỉ còn nút Kết thúc lượt');

/* ------------------------------------------------ 5. kỹ năng tự chạy mỗi lần qua ô Bắt Đầu */
log('\n=== 5. TỰ CHẠY MỖI VÒNG ===');
await reset();
const lapEnd = await run(`
  const me = s.current;
  for (const id of [16, 18, 19]) s.owner.set(id, me.id);
  me.skills = ['ac1','ac2a','ac3','acU','cn1','cn2a','cn3','cnU'];
  // tỉ lệ = 2% + 1% × 5 lần qua − 3% × 1 lần vào tù = 4% của 1000$ = 40$, trần 6$ × 5 lần = 30$ mỗi người
  me.money = 1000; me.laps = 5; me.jails = 1;
  const others = s.players.filter((q) => q.id !== me.id);
  others[0].money = 20;                         // không đủ 30$ thì nộp hết số đang có
  const before = others.map((q) => q.money);
  await c.skills.lapEnd(me);
  return {
    houses: [16, 18, 19].map((id) => s.housesOn(id)),
    got: me.money - 1000,
    paid: others.map((q, i) => before[i] - q.money),
    left0: others[0].money,
  };
`);
check(lapEnd.houses.reduce((a, b) => a + b, 0) === 3, `Phố Cổ level 1: xây 3 căn miễn phí (${lapEnd.houses})`);
check(JSON.stringify(lapEnd.paid) === '[20,30]' && lapEnd.got === 50 && lapEnd.left0 === 0,
  `Liên Đoàn 4%, trần 30$: người đủ tiền nộp 30$, người chỉ có 20$ nộp hết 20$, không âm (${JSON.stringify(lapEnd)})`);

const rates = await run(`
  const K = await import('/src/core/skills.js');
  const p = { skills: ['cnU'], skillLv: {}, laps: 40, jails: 0 };
  const cap1 = K.levyRate(p);
  p.skillLv = { cnU: 3 };
  const cap3 = K.levyRate(p);
  p.laps = 2; p.jails = 5;
  const floor = K.levyRate(p);
  return { cap1, cap3, floor };
`);
const each = await run(`
  const K = await import('/src/core/skills.js');
  const p = { skills: ['cnU'], skillLv: {}, laps: 5, jails: 1, money: 10000 };
  const l1 = K.levyEach(p);                 // 4% của 10000$ = 400$, trần 6$ × 5 = 30$
  p.skillLv = { cnU: 3 };
  const l3 = K.levyEach(p);                 // trần 8$ × 5 = 40$
  p.money = 400;
  const low = K.levyEach(p);                // 4% của 400$ = 16$, dưới trần
  return { l1, l3, low };
`);
check(each.l1 === 30 && each.l3 === 40 && each.low === 16,
  `Liên Đoàn: mỗi người nộp không quá 6$/8$ × số lần qua (level 1/3), tiền ít thì theo % (${JSON.stringify(each)})`);
check(rates.cap1 === 0.07 && rates.cap3 === 0.1 && rates.floor === 0,
  `Liên Đoàn: trần 7% ở level 1, 10% ở level 3, vào tù nhiều thì về 0% chứ không âm (${JSON.stringify(rates)})`);

// Phố Cổ level 3: 4 căn miễn phí mỗi lần
await reset();
const two = await run(`
  const me = s.current;
  for (const id of [16, 18, 19]) s.owner.set(id, me.id);
  me.skills = ['ac1','ac2a','ac3','acU']; me.skillLv = { acU: 3 };
  await c.skills.lapEnd(me);
  return [16, 18, 19].map((id) => s.housesOn(id));
`);
check(two.reduce((a, b) => a + b, 0) === 4 && Math.max(...two) === 2 && Math.min(...two) === 1, `Phố Cổ level 3: 4 căn miễn phí, xây đều tay (${two})`);

// Vào tù thì đếm thêm một lần — Liên Đoàn trừ tỉ lệ theo số này
await reset();
const jailed = await run(`const p = s.current; const j0 = p.jails; s.sendToJail(p); return p.jails - j0;`);
check(jailed === 1, 'vào tù: đếm jails +1');

/* ------------------------------------------------ 6. Tàu Tốc Hành level 3 */
log('\n=== 6. TÀU TỐC HÀNH LEVEL 3 ===');
await reset();
await run(`
  const p = s.current; p.pos = 5; p.skills = ['dh1','dh2a']; p.skillLv = { dh2a: 3 };
  window.__ex = c.skills.express(p, { a: 2, b: 3, sum: 5, isDouble: false });
`);
await page.locator('.tile-pick[data-quick]:not(.out)').waitFor({ timeout: 5000 });
const exLit = (await markedTiles(page)).sort((a, b) => a - b);
check(JSON.stringify(exLit) === '[15,25,35]', `level 3: 3 bến/ga còn lại sáng trên bàn cờ (${exLit})`);
check(await page.locator('.tile-pick .tp-cancel').textContent() === 'Ở lại', 'bảng chọn có nút "Ở lại"');
check(await page.locator('#modal-root .scrim.show').count() === 0, 'không mở hộp thoại nào che bàn cờ');
await page.evaluate(() => { window.__monopoly.scene.onTileClick(35); });
for (let i = 0; i < 40; i++) {
  if (await run('return Promise.race([window.__ex.then(() => true), new Promise((r) => setTimeout(() => r(false), 300))]);')) break;
  // Tới ga đích có thể hiện hộp mua đất: bỏ qua cho xong
  const skip = page.locator('#modal-root .scrim.show .modal-foot button', { hasText: /Bỏ qua|Đóng|Tiếp tục/ }).first();
  if (await skip.count()) await skip.click().catch(() => {});
}
const ex = await run('return { pos: s.current.pos, money: s.current.money };');
check(ex.pos === 35 && ex.money === 1575, `đi thẳng tới ga cuối (ô 35), nhận thêm 75$ lên tàu (${JSON.stringify(ex)})`);

await reset();
await run(`
  const p = s.current; p.pos = 5; p.skills = ['dh1','dh2a'];
  window.__ex = c.skills.express(p, { a: 2, b: 3, sum: 5, isDouble: false });
`);
await page.locator('.tile-pick[data-quick]:not(.out)').waitFor({ timeout: 5000 });
const ex1 = (await markedTiles(page)).join();
await page.locator('.tile-pick:not(.out) .tp-cancel').click();
await run('await window.__ex;');
check(ex1 === '15' && (await run('return s.current.pos;')) === 5, `level 1: chỉ ga kế (ô 15) sáng; "Ở lại" thì đứng yên (${ex1})`);

/* ------------------------------------------------ 7. hào quang tối thượng */
log('\n=== 7. HÀO QUANG · BÓNG MỜ ===');
await reset();
const aura = await run(`
  const [a, b] = [s.players[0], s.players[1]];
  a.skills = ['cn1','cn2a','cn3','cnU'];
  b.skills = ['cn1','cn2a','cn3','cnU','dh1','dh2a','dh3','dhU'];
  c.scene.refresh(s);
  const sc = c.scene;
  const one = sc.auras[0]?.key, two = sc.auras[1]?.key, none = sc.auras[2];
  await new Promise((r) => setTimeout(r, 300));
  const vis = sc.auras[0].img.visible && sc.auras[0].img.alpha > 0.2;
  // Bóng mờ: trong lúc đi, lớp hào quang có thêm bóng; tới nơi thì bóng tắt dần hết
  const before = sc.auraLayer.length;
  const move = sc.moveToken(1, b.pos, 3);
  await new Promise((r) => setTimeout(r, 250));
  const during = sc.auraLayer.length;
  // 10 bóng đúng hình quân: bóng sát quân rõ nhất, càng về sau càng nhạt
  const ghosts = sc.auraLayer.list.filter((g) => g.texture.key.startsWith('ghost-') && g.visible);
  const alphas = ghosts.map((g) => g.alpha);
  window.__ghost = { n: sc.auraLayer.list.filter((g) => g.texture.key.startsWith('ghost-')).length,
    fading: alphas.every((x, i) => i === 0 || x < alphas[i - 1]), first: alphas[0], last: alphas.at(-1),
    tex: ghosts[0]?.texture.key };
  await move;
  await new Promise((r) => setTimeout(r, 700));
  const after = sc.auraLayer.length;
  // Người không có tối thượng thì đi không để bóng
  const m2 = sc.moveToken(2, s.players[2].pos, 2);
  await new Promise((r) => setTimeout(r, 200));
  const plain = sc.auraLayer.length;
  await m2;
  b.bankrupt = true; c.scene.refresh(s);
  const gone = sc.auras[1];
  b.bankrupt = false; c.scene.refresh(s);
  return { one, two, none, vis, before, during, after, plain, gone, ghost: window.__ghost };
`);
check(aura.one === '#E2743A', `một tối thượng: hào quang một màu nhánh (${aura.one})`);
check(aura.two === '#E2743A,#3C8FE0', `hai tối thượng: dựng lại theo cả hai nhánh (${aura.two})`);
const mix = await run(`
  const K = await import('/src/core/skills.js');
  const { SKILLS, BRANCHES } = await import('/src/data/skills.js');
  const ults = BRANCHES.map((b) => SKILLS.find((x) => x.branch === b.key && x.tier === 4).id);
  // Mọi tổ hợp 2–3 nhánh: màu riêng, không trùng nhau, không trùng màu một nhánh
  const combos = [];
  for (let m = 1; m < 32; m++) {
    const ids = ults.filter((_, i) => m & (1 << i));
    combos.push({ n: ids.length, c: K.ultColor({ skills: ids }) });
  }
  const mid = combos.filter((x) => x.n === 2 || x.n === 3).map((x) => x.c);
  const singles = combos.filter((x) => x.n === 1).map((x) => x.c);
  return {
    pair: c.scene.auraColor[1], mid: mid.length, uniq: new Set(mid).size,
    clash: mid.filter((x) => singles.includes(x)).length, valid: mid.every((x) => /^#[0-9A-F]{6}$/.test(x)),
    four: [...new Set(combos.filter((x) => x.n === 4).map((x) => x.c))], five: combos.find((x) => x.n === 5).c,
    none: K.ultColor({ skills: ['cn1'] }),
  };
`);
check(mix.pair === '#FA29BB', `Công Nhân + Du Hành: pha thành một màu riêng (${mix.pair})`);
check(mix.mid === 20 && mix.uniq === 20 && mix.clash === 0 && mix.valid,
  `20 tổ hợp 2–3 tối thượng: 20 màu khác nhau, không trùng màu nhánh (${JSON.stringify(mix)})`);
check(mix.four.join() === '#141414' && mix.five === '#FFFFFF' && mix.none === null, '4 tối thượng: đen · đủ 5: trắng');
check(aura.none == null, 'chưa có tối thượng: không có hào quang');
check(aura.vis, 'hào quang hiện và bám theo quân');
const shape = await run(`
  const sc = c.scene, a = sc.auras[0], spr = sc.tokens[0];
  // Hào quang bo theo dáng quân: cùng điểm neo, cùng góc, lớn hơn quân một chút
  return { dx: Math.abs(a.img.x - spr.x), dy: Math.abs(a.img.y - spr.y), angle: a.img.angle === spr.angle,
    wider: a.img.displayWidth / spr.displayWidth, tex: a.img.texture.key };
`);
check(shape.dx < 0.5 && shape.dy < 0.5 && shape.angle && shape.wider > 1.15 && shape.wider < 1.4 && shape.tex.startsWith('aura-tok-'),
  `hào quang lấy dáng từ texture quân, trùng điểm neo (${JSON.stringify(shape)})`);
check(aura.during > aura.before && aura.after === aura.before,
  `bóng mờ khi đi rồi tắt hết khi tới nơi (${aura.before} → ${aura.during} → ${aura.after})`);
check(aura.plain === aura.before, 'quân không có tối thượng đi không để bóng');
check(aura.ghost.n === 7 && aura.ghost.fading && aura.ghost.first > 0.4 && aura.ghost.last < aura.ghost.first
  && aura.ghost.tex.includes('#FA29BB'),
  `bóng mờ: 7 bóng hình quân màu hào quang, đè lên nhau, gần rõ xa nhạt (${JSON.stringify(aura.ghost)})`);
check(aura.gone == null, 'phá sản thì tắt hào quang');
await page.screenshot({ path: 'test-result/skills-aura.png' });

/* ------------------------------------------------ 8. tab cây kỹ năng trong bảng tài sản */
log('\n=== 8. TAB CÂY KỸ NĂNG TRONG HỒ SƠ ===');
await run(`
  const q = s.players[1];
  q.skills = ['dd1','dd2a','dd3','ddU']; q.skillLv = { dd1: 3, dd3: 2 }; q.skillPoints = 4;
  const M = await import('/src/ui/modals.js');
  window.__pm = M.playerModal(s, 1);
`);
await page.locator('.ptab[data-tab="skills"]').waitFor({ timeout: 5000 });
check(await page.locator('.ppane-skills .st-node').count() === 0, 'cây chưa dựng khi chưa mở tab');
await page.locator('.ptab[data-tab="skills"]').click();
await page.waitForTimeout(300);
check(await page.locator('.ppane-skills .st-node').count() === 50, 'mở tab: đủ 50 ô (5 nhánh × 10)');
check(await page.locator('.ppane-skills .st-node.is-learned').count() === 4, '4 ô đã học sáng lên');
check(await page.locator('.ppane-skills .st-node[data-id="dd1"] .st-lv i.on').count() === 3, 'Chẵn Lẻ hiện 3 chấm level');
check(await page.locator('.ppane-skills .st-node.is-ready, .ppane-skills .st-node.can-up').count() === 0,
  'bản chỉ xem: không ô nào "học được ngay" dù người đó còn điểm');
check(await page.locator('.ppane-skills .st-respec').count() === 0, 'bản chỉ xem: không có nút Tẩy điểm');
check(await page.locator('.ppane[data-pane="assets"]').isHidden(), 'tab tài sản ẩn đi');
await page.screenshot({ path: 'test-result/skills-profile-tab.png' });
await page.locator('.ppane-skills .st-node[data-id="dd3"]').click();
await page.waitForTimeout(300);
check(await page.locator('.ppane-skills [data-act="learn"]').count() === 0, 'thẻ chi tiết bản chỉ xem không có nút học');
check((await page.locator('.ppane-skills .sd-lvs li.have').count()) === 2, 'thẻ chi tiết tô sáng 2 level đã có');
await page.screenshot({ path: 'test-result/skills-profile-detail.png' });
await page.locator('.ppane-skills [data-act="cancel"]').click();
await page.waitForTimeout(300);
const pts1 = await run('return { pts: s.players[1].skillPoints, lv: s.players[1].skillLv };');
check(pts1.pts === 4 && pts1.lv.dd3 === 2, 'xem hồ sơ không làm đổi điểm hay level');
await page.locator('.ptab[data-tab="assets"]').click();
check(await page.locator('.ppane[data-pane="assets"]').isVisible(), 'quay lại tab tài sản');
await page.keyboard.press('Escape');
await run('await window.__pm;');

/* ------------------------------------------------ 9. kỹ năng từng là thành tựu */
log('\n=== 9. Ô TỪNG LÀ THÀNH TỰU ===');
await reset();
const lock = await run(`
  const p = s.current; p.skillPoints = 5;
  const noRoot = K.canLearn(p, 'dhX1');
  p.skills = ['dh1', 'dh2b'];
  const state1 = K.skillState(p, 'dhX1');
  const ok = K.learnSkill(p, 'dhX1');
  return { noRoot: noRoot.reason, state1, ok: ok.ok, pts: p.skillPoints, cost: K.skillCost(K.skillById('dhX1')) };
`);
check(lock.noRoot.includes('Cần học') && lock.noRoot.includes('Về Nhà'), `chưa học ô cha thì khoá (${lock.noRoot})`);
check(lock.state1 === 'ready' && lock.ok && lock.pts === 4 && lock.cost === 1, 'có ô cha là học được ngay, không cần dừng chung ô lần nào');

// Hình cây: mỗi nhánh 1 → 3 → 4 (2 ô dẫn lên + 2 nhánh phụ) → 2 tối thượng, mỗi ô một cha
const treeShape = await run(`
  const { SKILLS, BRANCHES } = await import('/src/data/skills.js');
  return BRANCHES.map((b) => {
    const mine = SKILLS.filter((x) => x.branch === b.key);
    const row = (t) => mine.filter((x) => x.tier === t);
    return { rows: [1, 2, 3, 4].map((t) => row(t).length).join(''),
             feats: mine.filter((x) => x.feat).length,
             orphan: mine.filter((x) => x.tier > 1 && !x.requires?.length).length,
             ult: row(4).map((x) => x.requires.length).join('') };
  });
`);
check(treeShape.every((b) => b.rows === '1342' && !b.feats && !b.orphan && b.ult === '11'),
  `5 nhánh đều 1 → 3 → 4 → 2 tối thượng, không ô nào đòi mở khoá, mỗi tối thượng một ô cha (${JSON.stringify(treeShape)})`);

// Dừng chung ô: Hai Ngón móc túi người giàu nhất trên ô
await reset();
const pick = await run(`
  const me = s.current, a = s.players[(s.turn + 1) % 3], b = s.players[(s.turn + 2) % 3];
  me.pos = 12; a.pos = 12; b.pos = 12; a.money = 1000; b.money = 1500;
  const r0 = Math.random; Math.random = () => 0;          // trúng 60%, rút đáy khoảng 10%
  me.skills = ['dhX1'];
  const m0 = me.money, b0 = b.money;
  await c.skills.landed(me);
  Math.random = r0;
  return { got: me.money - m0, lost: b0 - b.money, use: me.skillUse.dhX1 };
`);
check(pick.got === 150 && pick.lost === 150 && pick.use.gain === 150,
  `Hai Ngón level 1: lấy 10% (đáy khoảng 10–18%) của người giàu nhất (1500$ → 150$), ghi vào tiến độ (${JSON.stringify(pick)})`);

await reset();
const alone = await run(`
  const me = s.current; me.skills = ['dhX1']; me.pos = 13;
  s.players.forEach((q) => { if (q !== me) q.pos = 30; });
  const m0 = me.money; await c.skills.landed(me);
  return { got: me.money - m0 };
`);
check(alone.got === 0, 'đứng một mình thì không móc túi');

// Phượt Thủ: lắc 10–12 có thưởng
await reset();
const trip = await run(`
  const me = s.current;
  me.skills = ['dhX2']; me.skillLv = { dhX2: 2 };
  const m0 = me.money;
  await c.skills.rollPerks(me, { a: 5, b: 6, sum: 11, isDouble: false });
  const big = me.money - m0;
  const m1 = me.money;
  await c.skills.rollPerks(me, { a: 4, b: 5, sum: 9, isDouble: false });
  return { big, small: me.money - m1 };
`);
check(trip.big === 35 && trip.small === 0, `Phượt Thủ level 2: lắc 11 +35$, lắc 9 không có (${JSON.stringify(trip)})`);

// Tài Xỉu, Hoàn Lương
await reset();
const bets = await run(`
  const me = s.current; me.skills = ['dd2a', 'ddX1', 'ddX2']; me.skillLv = { ddX1: 3, ddX2: 3 };
  const put = (pick, amount) => { c.skills.bet = { turnNo: s.turnNo, seat: me.id, pick, amount }; };
  put('big', 100); let m0 = me.money;
  await c.skills.settleBets(me, { a: 4, b: 5, sum: 9, isDouble: false }); await c.skills.flushSlip(me, { a: 4, b: 5, sum: 9, isDouble: false });
  const big = me.money - m0;
  put('small', 100); m0 = me.money;
  await c.skills.settleBets(me, { a: 3, b: 4, sum: 7, isDouble: false }); await c.skills.flushSlip(me, { a: 3, b: 4, sum: 7, isDouble: false });
  const seven = me.money - m0;
  return { big, seven, pot: s.pot, use: me.skillUse };
`);
check(bets.big === 200, `Tài trúng ở level 3: +200% tiền cược = 200$ (được ${bets.big})`);
check(bets.seven === -70 && bets.pot === 100, `ra 7 thì Xỉu thua; Hoàn Lương level 3 trả lại 30% (${bets.seven}, quỹ ${bets.pot})`);
check(bets.use.dd2a.n === 2 && bets.use.ddX1.gain === 200 && bets.use.ddX2.gain === 30, `mỗi lần cược ghi tiến độ đúng kỹ năng (${JSON.stringify(bets.use)})`);

await reset();
await run(`const p = s.current; p.skills = ['dd2a', 'ddX1']; c.lastRolled = false; c.restoreActions();`);
await openKit();
await item('Cược Chẵn Lẻ').click();
await page.locator('.sk-bet').waitFor({ timeout: 5000 });
check(await page.locator('.sk-bet [data-v="big"]').count() === 1 && await page.locator('.sk-bet [data-v="small"]').count() === 1,
  'hộp cược có thêm cửa Tài và Xỉu');
await page.locator('.sk-bet [data-v="small"]').click();
await topBtn('Xong').click();
await topBtn('Chốt').click();
await page.waitForTimeout(2600);
await run('await c.skills.beforeRoll(s.current);');
check(await run(`return c.skills.bet?.pick === 'small';`), 'đặt cửa Xỉu: lúc lắc tự cược cửa Xỉu');
await run('c.skills.bet = null;');

// Khách Quen Nhà Đá: bồi thường khi vào tù, ra tù miễn phí
await reset();
const jail = await run(`
  const me = s.current; me.jails = 0; me.skills = ['cn1']; me.skillPoints = 1;
  const locked = K.skillState(me, 'cnX2'), jails = 0;
  me.skills = ['cnX2']; me.skillLv = { cnX2: 2 };
  s.releaseFromJail(me); me.pos = 5;
  const m0 = me.money;
  await c.goToJail(me);
  const comp = me.money - m0;
  c.restoreActions();
  return { jails, locked, comp };
`);
check(jail.locked === 'ready', `đã học Nhặt Tiền Rơi, chưa vào tù lần nào vẫn học được Khách Quen Nhà Đá (${JSON.stringify(jail)})`);
check(jail.comp === 70, `Khách Quen level 2: vào tù nhận 70$ (được ${jail.comp})`);
const bailBtn = page.locator('#actions button', { hasText: 'Ra tù miễn phí' });
check(await bailBtn.count() === 1, 'nút nộp phạt đổi thành "Ra tù miễn phí"');
const bail = await run(`
  // Ra tù xong controller lắc luôn — thay tạm để lượt không chạy tiếp
  const tr = c.takeRoll; c.takeRoll = async () => {};
  const m0 = s.current.money;
  await c.payOutOfJail();
  c.takeRoll = tr;
  return { paid: m0 - s.current.money, jail: s.current.inJail, gain: s.current.skillUse.cnX2.gain };
`);
check(!bail.jail && bail.paid === 0 && bail.gain === 120, `ra tù không mất 50$, tiến độ cộng 70 + 50 (${JSON.stringify(bail)})`);

// Chủ Nợ (phạt người đang có ô thế chấp), Sống Sót, tiến độ kỹ năng thuê của chủ đất
await reset();
const rentx = await run(`
  const me = s.current, owner = s.players[(s.turn + 1) % 3];
  s.owner.set(39, owner.id);                                  // Dinh Toàn Quyền, thuê gốc 50$
  s.owner.set(1, me.id); s.mortgaged.add(1);                  // người trả đang nợ ngân hàng
  owner.skills = ['dcX1', 'dcU']; me.money = 40;
  const late = c.skills.rentBill(me, 39, null);
  me.skills = ['acX1'];
  const both = c.skills.rentBill(me, 39, null);
  me.money = 1000; s.mortgaged.delete(1);
  const rich = c.skills.rentBill(me, 39, null);
  c.skills.rentPaid(owner, rich);
  return { late: late.total, lateFee: late.late, both: both.total, bothLate: both.late, rich: rich.total, richLate: rich.late,
           note: c.skills.rentNote(me, 39, both), dcU: owner.skillUse.dcU };
`);
check(rentx.late === 225 && rentx.lateFee === 75, `Chủ Nợ: thuê 150$ (Cơn Sốt ×3), người trả có ô thế chấp → +50% = 225$ (${rentx.late})`);
check(rentx.both === 90 && rentx.bothLate === 30, `Sống Sót dưới 250$ trả 40% = 60$, Chủ Nợ phạt 50% phần còn lại = 90$ (${rentx.both})`);
check(rentx.rich === 150 && rentx.richLate === 0, 'không còn ô thế chấp, đủ tiền thì không phạt, không giảm');
check(rentx.note.includes('Sống Sót') && rentx.note.includes('Chủ Nợ'), 'dòng loan tin ghi cả giảm và tiền thêm của Chủ Nợ');
check(rentx.dcU.gain === 100, `Cơn Sốt Đất ghi 100$ tiền thuê thu thêm (${JSON.stringify(rentx)})`);

// Lão Làng: đếm lần qua từ lúc học, tặng điểm theo nhịp
await reset();
const vet = await run(`
  const me = s.current; me.laps = 6; me.skills = ['cnX1']; me.skillLv = { cnX1: 3 };   // mỗi 2 lần
  const got = [K.onLap(me), K.onLap(me), K.onLap(me), K.onLap(me)];
  return { got, pts: me.skillPoints, use: me.skillUse.cnX1 };
`);
check(JSON.stringify(vet.got) === '[1,2,1,2]' && vet.pts === 6, `Lão Làng level 3: cứ 2 lần qua được thêm 1 điểm, tính từ lúc học (${JSON.stringify(vet)})`);
check(vet.use.n === 2, 'Lão Làng: mỗi lần tặng điểm là một lần chạy');

// Khách Sộp: mua ô trống thì ngân hàng hoàn tiền
await reset();
const buy = await run(`
  const { BOARD } = await import('/src/data/board.js');
  const me = s.current;
  const locked = K.skillState({ ...me, skills: ['dcS1'] }, 'dcX2');
  me.pos = 39;
  window.__buyGo = c.resolveOwnable(me, BOARD[39], { a: 1, b: 2, sum: 3 });
  return { locked };
`);
await clickModal('Mua');
const buy2 = await run(`
  await window.__buyGo;
  const { BOARD } = await import('/src/data/board.js');
  const me = s.current;
  me.skills = ['dc1', 'dcX2']; me.skillLv = { dcX2: 2 };
  const m0 = me.money;
  await c.skills.bought(me, 39);
  return { back: me.money - m0, price: BOARD[39].price, use: me.skillUse.dcX2,
           owner: s.owner.get(39) === me.id };
`);
check(buy.locked !== 'locked' && buy2.owner, `Khách Sộp học được ngay sau Nhặt Hàng Thừa; mua ô trống qua hộp Mua (${JSON.stringify(buy2)})`);
check(buy2.back === Math.round(buy2.price * 0.35) && buy2.use.gain === buy2.back,
  `Khách Sộp level 2: hoàn 35% giá mua, ghi vào tiến độ (${buy2.back})`);

// Chủ Nhà: dừng trên đất của mình
await reset();
const home = await run(`
  const { BOARD } = await import('/src/data/board.js');
  const me = s.current; s.owner.set(39, me.id); me.pos = 39;
  await c.resolveOwnable(me, BOARD[39], { a: 1, b: 2, sum: 3 });
  const m1 = me.money;
  me.skills = ['ac1', 'acX2']; me.skillLv = { acX2: 3 };
  await c.resolveOwnable(me, BOARD[39], { a: 1, b: 2, sum: 3 });
  return { gotFirst: m1 - 1500, got: me.money - m1, use: me.skillUse.acX2 };
`);
check(home.gotFirst === 0, `dừng trên đất mình chưa học Chủ Nhà thì không có tiền (${JSON.stringify(home)})`);
check(home.got === 40 && home.use.gain === 40, 'Chủ Nhà level 3: +40$, ghi vào tiến độ');

// Ảnh chụp mang tiến độ
const snapUse = await run(`
  const me = s.current; me.skillUse = { cn1: { n: 2, gain: 70 } };
  const q = S.fromSnapshot(JSON.parse(JSON.stringify(S.snapshot(s)))).players[me.id];
  me.skillUse.cn1.n = 99;
  return { use: q.skillUse };
`);
check(snapUse.use.cn1.n === 2 && snapUse.use.cn1.gain === 70, 'ảnh chụp mang skillUse, chép riêng không dùng chung object');

// Giao diện: hình cây, thẻ chi tiết hiện số liệu lúc này
await reset();
await run(`const me = s.current; me.skillPoints = 2; me.skills = ['dh1', 'dh2b', 'cn1', 'cn2a', 'cn3', 'cnU']; me.laps = 6; me.jails = 1; me.money = 1000;
  s.players.forEach((q) => { if (q !== me) q.money = 30; });
  me.skillUse = { cnU: { n: 3, gain: 420 } }; c.restoreActions();`);
await page.locator('#actions button[data-key="k"]').click();
await page.locator('.st-node[data-id="dhX1"]').waitFor({ timeout: 5000 });
check(await page.locator('.st-edge[data-to="dhX1"]').count() === 1, 'Hai Ngón có đúng 1 đường nối, từ Về Nhà');
check(await page.locator('.st-edge[data-to="dhU"]').count() === 1, 'mỗi tối thượng nối từ đúng 1 ô cấp 3');
/* Không ô nào đè lên ô khác: so hình chữ nhật của mọi cặp ô trong cùng cột */
const overlap = await page.evaluate(() => {
  const r = [...document.querySelectorAll('.st .st-node')].map((n) => [n.dataset.id, n.getBoundingClientRect()]);
  const bad = [];
  for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) {
    const [ia, a] = r[i], [ib, b] = r[j];
    if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) bad.push(ia + '/' + ib);
  }
  return bad;
});
check(!overlap.length, `không có ô nào đè lên nhau (${overlap.join(', ') || 'không'})`);
check(await page.locator('.st-node[data-id="dhX1"].is-ready').count() === 1, 'Hai Ngón học được ngay khi có Về Nhà');
/* Liên Đoàn lần qua tới (lần 7): 2% + 7% − 3% = 6% của 1000 + 200 = 72$, trần 6 × 7 = 42$;
   hai đối thủ chỉ còn 30$ nên thu về 60$ */
await page.locator('.st-node[data-id="cnU"]').click();
const nowTxt = await page.locator('.sd-now').textContent();
check(nowTxt.includes('6 lần') && nowTxt.includes('1 lần') && nowTxt.includes('6%') && nowTxt.includes('42$') && nowTxt.includes('60$'),
  `Liên Đoàn: thẻ ghi số lần qua, vào tù, tỉ lệ, mỗi người nộp, tổng thu (${nowTxt})`);
check(nowTxt.includes('Tổng số lần đã chạy') && nowTxt.includes('420$'), 'thẻ ghi tổng số lần đã chạy và tổng tiền đã mang về');
await page.screenshot({ path: 'test-result/skills-now.png' });
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await page.keyboard.press('Escape');
await page.waitForTimeout(3200);

/* ------------------------------------------------ 8. luật cân bằng (tests/gamesim.mjs) */
log('\n=== 8. LUẬT CÂN BẰNG ===');
await reset();
const bal = await run(`
  const me = s.current, a = s.players[(s.turn + 1) % 3], b = s.players[(s.turn + 2) % 3];
  const n = s.alive().length;

  // Nhặt Hàng Thừa: đầu ván không nhặt ô làm đủ bộ (người khác đang đứng ở ô 39)
  me.skills = ['dcS1'];
  const pos0 = a.pos; a.pos = 39;
  s.owner.set(37, me.id); me.laps = 2;
  const earlySet = K.leftoverOffers(s, me).some((x) => x.id === 39);
  me.laps = 3;
  const lateSet = K.leftoverOffers(s, me).some((x) => x.id === 39);
  s.owner.delete(37); me.laps = 2;
  const lone = K.leftoverOffers(s, me).some((x) => x.id === 39);
  a.pos = pos0; me.laps = 0;

  // Thâu Tóm: bộ đủ màu chưa xây vẫn lấy được, ô lẻ và bến/ga cũng được, bộ có nhà thì không
  me.skills = ['dcS1', 'dc2a', 'dc3'];
  for (const id of [1, 3]) s.owner.set(id, a.id);            // bộ nâu đủ màu
  s.owner.set(6, a.id); s.owner.set(5, a.id);
  const seize = { full: K.canSeize(s, me, 1), lone: K.canSeize(s, me, 6), station: K.canSeize(s, me, 5) };
  s.houses.set(3, 1);
  seize.built = K.canSeize(s, me, 1);
  s.houses.delete(3);

  // Xuyên Việt: không đáp xuống đất chưa có chủ
  me.skills = ['dh1', 'dh2a', 'dh3', 'dhU'];
  const tp = K.teleportTargets(s, me);
  const tele = { unowned: tp.includes(39), owned: tp.includes(1), go: tp.includes(0), jail: tp.includes(30) };

  // Thuê An Cư cộng dồn: Đất Nhiều Màu +6% (2 màu) và Hàng Xóm +25% → ×1.31, không phải ×1.06 × 1.25
  for (const id of [1, 3, 5, 6]) s.owner.delete(id);
  for (const id of [1, 6, 8, 9]) s.owner.set(id, me.id);     // xanh nhạt đủ bộ + 1 ô nâu
  s.houses.set(9, 4);
  me.skills = ['acX2', 'ac2b', 'ac1', 'acS2'];
  const rent3 = s.rentFor(9, 7);                               // 565$ × 1.31 = 740$ (nhân chồng ra 749$)
  const gains = Object.fromEntries(K.rentGains(s, 9, rent3).map(([id, g]) => [id, Math.round(g)]));
  s.houses.delete(9);

  // Siết Nợ: nhắm cả ô chưa thế chấp của người cạn tiền
  for (const id of [1, 6, 8, 9]) s.owner.delete(id);
  me.skills = ['dcS1', 'dc2b', 'dcX1', 'dcV'];
  s.owner.set(21, a.id); s.owner.set(26, b.id);
  a.money = 100; b.money = 1500;
  const poor = K.forecloseOffers(s, me).map((x) => [x.id, x.bank, x.owner]);
  s.mortgaged.add(26);
  const lien = K.forecloseOffers(s, me).find((x) => x.id === 26);
  s.mortgaged.delete(26); s.owner.delete(21); s.owner.delete(26);

  // Chung Cư Mini level 1 (3 căn trên đất lẻ): nhà tặng của Phố Cổ cũng không vượt trần
  me.skills = ['ac1', 'ac2b', 'acS1', 'acU'];
  for (const id of [1, 6, 11, 16]) s.owner.set(id, me.id);
  for (const id of [1, 6, 11]) { s.houses.set(id, 1); s.bankHouses -= 1; }
  const miniFree = s.canBuild(me.id, 16, { free: true }).ok;
  for (const id of [1, 6, 11]) { s.houses.delete(id); s.bankHouses += 1; }
  for (const id of [1, 6, 11, 16]) s.owner.delete(id);

  // Xuyên Việt: lần qua ô Bắt Đầu trong chính lượt bay không trừ thời gian chờ, dấu lượt cũ thì bỏ
  const laps0 = me.laps, pts0 = me.skillPoints;
  me.cooldowns = { dhU: 1 }; me.cdHold = { dhU: s.turnNo };
  K.onLap(me, s.turnNo);
  const heldCd = me.cooldowns.dhU ?? 0;
  K.onLap(me, s.turnNo + 1);
  const staleCd = me.cooldowns.dhU ?? 0;
  me.cooldowns = {}; me.cdHold = {}; me.laps = laps0; me.skillPoints = pts0;
  return { earlySet, lateSet, lone, seize, tele, rent3, gains, poor, lien, miniFree, heldCd, staleCd };
`);
check(!bal.earlySet && bal.lateSet && bal.lone, `Nhặt Hàng Thừa: chưa qua ô Bắt Đầu 3 lần thì không nhặt ô làm đủ bộ; ô không làm đủ bộ vẫn nhặt (${JSON.stringify(bal)})`);
check(bal.seize.full && bal.seize.lone && bal.seize.station && !bal.seize.built, `Thâu Tóm: bộ đủ màu chưa xây, ô lẻ, bến/ga lấy được; bộ có nhà thì không (${JSON.stringify(bal.seize)})`);
check(!bal.tele.unowned && bal.tele.owned && bal.tele.go && !bal.tele.jail, `Xuyên Việt: không tới đất chưa có chủ, ô Vào Tù (${JSON.stringify(bal.tele)})`);
check(bal.rent3 === 740 && bal.gains.ac2b === 34 && bal.gains.acS2 === 141,
  `thuê An Cư cộng dồn: 565$ × (1 + 6% + 25%) = 740$, mỗi kỹ năng ghi phần của mình (${bal.rent3}, ${JSON.stringify(bal.gains)})`);
check(JSON.stringify(bal.poor) === '[[21,0,121]]' && bal.lien && bal.lien.bank === 65 && bal.lien.owner === 13,
  `Siết Nợ: ô của người dưới 200$ trả chủ 55% giá; ô thế chấp trả ngân hàng 50% + chủ 10% (${JSON.stringify(bal)})`);
check(!bal.miniFree, 'Chung Cư Mini: nhà tặng của Phố Cổ không xây quá trần đất lẻ');
check(bal.heldCd === 1 && bal.staleCd === 0, `Xuyên Việt: lượt bay giữ thời gian chờ, dấu lượt cũ không giữ (${bal.heldCd}, ${bal.staleCd})`);

// Cò Đất: người đứng ra giao dịch không ăn tiền cò
await reset();
const selfCut = await run(`
  const [a, b] = [s.players[s.turn], s.players[(s.turn + 1) % 3]];
  a.skills = ['dcS1', 'dc2a']; a.skillLv = { dc2a: 2 };
  s.owner.set(39, a.id);
  const m0 = a.money;
  await c.executeTrade({ give: [39], get: [], giveMoney: 0, getMoney: 400 }, a, b);
  return a.money - m0;
`);
check(selfCut === 400, `Cò Đất: tự bán đất không được tiền cò, chỉ nhận đúng 400$ (${selfCut})`);

// Xuyên Việt về ô Bắt Đầu: chính chuyến ấy không trừ thời gian chờ
await reset();
const loop = await run(`
  const p = s.current; p.pos = 30 + 5; p.skills = ['dh1', 'dh2a', 'dh3', 'dhU']; p.skillLv = { dhU: 3 };
  await c.skills.doTeleport(p, 0);
  return { pos: p.pos, cd: p.cooldowns.dhU };
`);
check(loop.pos === 0 && loop.cd === 3, `Xuyên Việt level 3 về ô Bắt Đầu: vẫn chờ đủ 3 lần qua (${JSON.stringify(loop)})`);

// Cược và Tất Tay chốt theo cú lắc đầu: đoán chẵn, ra 3 + 4 = 7 là thua, Xí Ngầu Gian sau đó không cứu được
await reset();
const allInLost = await run(`
  const p = s.current; p.pos = 10; p.skills = ['dd1', 'dd2b', 'dd3', 'ddU'];
  c.skills.allIn = { turnNo: s.turnNo, seat: p.id, pick: 'even' };
  const m0 = p.money;
  await c.skills.settleBets(p, { a: 3, b: 4, sum: 7, isDouble: false });
  return { lost: m0 - p.money, left: c.skills.allIn };
`);
check(allInLost.lost > 0 && allInLost.left === null, `Tất Tay chốt ngay ở cú lắc đầu (lẻ) → thua (${JSON.stringify(allInLost)})`);
const order = await run(`
  const src = c.takeRoll.toString();
  return src.indexOf('settleBets(p, first)') > 0 && src.indexOf('settleBets(p, first)') < src.indexOf('afterRoll(p, first)');
`);
check(order, 'Game.takeRoll chốt cược trước hộp hỏi Xí Ngầu Gian / Quay Đầu');
await reset();

log('\nLỗi console:', errors.length ? errors : 'không có');
if (errors.length) fails += errors.length;
log(fails ? `\n✗ ${fails} lỗi` : '\n✓ tất cả đều qua');
await browser.close();
process.exit(fails ? 1 : 0);
