/**
 * Cây kỹ năng trong ván thật (bản một máy). Kiểm:
 *   - qua ô Bắt Đầu +1 điểm, lương tính Tăng Ca / Thâm Niên / Về Nhà;
 *   - nút Kỹ năng mở cây, học được, điểm trừ đúng giá;
 *   - hệ số thuê của chủ đất (Cơn Sốt Đất, Đất Nhiều Màu) và người trả (Vé Tháng);
 *   - Mái Ấm, Sổ Hồng (xây với 2/3 bộ, nhà không bị dỡ), Thầu Vật Liệu;
 *   - kỹ năng bấm để dùng: Xí Ngầu Gian, Cược Chẵn Lẻ, Thâu Tóm, hồi lại sau khi qua ô Bắt Đầu;
 *   - Phố Cổ xây căn miễn phí, Liên Đoàn Lao Động thu quỹ;
 *   - ảnh chụp online mang đủ dữ liệu kỹ năng;
 *   - lên level phải đạt điều kiện (dùng đủ lần / kiếm đủ tiền) ngoài 1 điểm;
 *   - 10 kỹ năng thành tựu: khoá tới khi có ô đứng trước và đủ bộ đếm, rồi chạy đúng tác dụng.
 * Cần dev server ở cổng 5178.
 */
import { launchChrome } from './launch.mjs';
import { playRollOff } from './rolloff.mjs';
import { markedTiles } from './pick.mjs';

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
    p.skillLv = {}; p.lapUses = {}; p.jails = 0; p.skillUse = {}; p.feats = {};
    p.pos = 5; p.inJail = false; p.bankrupt = false;
  }
  s.owner.clear(); s.houses.clear(); s.mortgaged.clear(); s.heritage.clear();
  s.bankHouses = 32; s.bankHotels = 12; s.mods = []; s.pot = 0;
  c.hud.refresh(); c.scene.refresh(s);
`);

/** Bấm nút trong hộp thoại đang mở trên cùng. */
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
check(l1.every((n) => n >= 220 && n <= 280 && n % 5 === 0) && new Set(l1).size > 1,
  `Tăng Ca level 1: lương 220–280$, bước 5$, không phải một số cố định (${[...new Set(l1)].sort().join(',')})`);
check(await run(`const p = s.current; p.skills = ['cn1','cn2a']; p.skillLv = { cn2a: 2 }; return s.salary(false, p);`) === 260, 'Tăng Ca level 2: $260');
check(await run(`const p = s.current; p.skills = ['cn1','cn2a','cn3']; p.skillLv = { cn2a: 2, cn3: 2 }; p.laps = 8; return s.salary(false, p);`) === 420,
  'Tăng Ca + Thâm Niên level 2, lần thứ 8: 200 + 60 + 160 = $420');
check(await run(`const p = s.current; p.skills = ['cn1','cn2a','cn3']; p.skillLv = { cn3: 3 }; p.laps = 20; p.skillLv.cn2a = 3; return s.salary(false, p);`) === 590,
  'Thâm Niên level 3 chạm trần +300$: 200 + 90 + 300 = $590');
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
  K.credit(p, 'cn1', 100);
  const still = K.canLearn(p, 'cn1');          // 100/150$: vẫn thiếu
  K.credit(p, 'cn1', 50);
  const b = K.learnSkill(p, 'cn1');            // đủ 150$: lên 2, 1 điểm
  const blocked3 = K.canLearn(p, 'cn1');       // level 3 cần 400$ cộng dồn
  K.credit(p, 'cn1', 250);
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
check(lv.blocked === false && lv.why.includes('150$') && lv.still === false,
  `lên level bị chặn tới khi kỹ năng kiếm đủ 150$ (${lv.why})`);
check(lv.blocked3 === false && lv.use.n === 3 && lv.use.gain === 400, `level 3 cần cộng dồn 400$, bộ đếm ghi đủ lần và tiền (${JSON.stringify(lv.use)})`);
check(lv.keptUse === 400, 'tẩy điểm giữ tiến độ lên level');
check(lv.a === 1 && lv.b === 2 && lv.c === 3 && lv.d === false, `lên level 1 → 2 → 3, level 4 bị chặn (${JSON.stringify(lv)})`);
check(lv.spent === 3 && lv.pts === 3, 'mỗi level tốn 1 điểm, tổng 3 điểm cho ô cấp 1 lên level 3');
check(lv.refund === 3 && lv.after === 6 && lv.money === 850 && lv.lvAfter === 0, 'tẩy điểm hoàn đủ cả điểm level, phí 50$/điểm');
check(lv.line === '35% khả năng nhặt 10–40$', `chữ level 1 hiện khoảng "10–40$" (${lv.line})`);

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
check(rent.fever === 100, `Cơn Sốt Đất ×2 → $100 (được ${rent.fever})`);
check(rent.payer === 60, `Vé Tháng level 1 trả 60% → $60 (được ${rent.payer})`);
check(rent.payer3 === 20, `Vé Tháng level 3 trả 20% → $20 (được ${rent.payer3})`);
check(rent.fever3 === 125, `Cơn Sốt Đất level 3 ×2.5 → $125 (được ${rent.fever3})`);
check(rent.colors === 54, `Đất Nhiều Màu level 1, 2 màu +8% → $54 (được ${rent.colors})`);

await reset();
const build = await run(`
  const me = s.turn, other = (s.turn + 1) % 3;
  for (const id of [21, 23]) s.owner.set(id, me);           // 2/3 bộ đỏ
  s.owner.set(24, other);
  const before = s.canBuild(me, 21).ok;
  s.players[me].skills = ['ac1','ac2a','ac3'];
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
  return { before, cost, after, ok: res.ok, contractor, gone, houses: s.housesOn(21), refund1, refund3 };
`);
check(!build.before, 'không có Sổ Hồng: 2/3 bộ không xây được');
check(build.cost === 135, `Mái Ấm level 1: căn $150 còn $135 (được ${build.cost})`);
check(build.after && build.ok, 'Sổ Hồng: xây được với 2/3 bộ');
check(build.contractor === 25, `Thầu Vật Liệu level 2: người khác xây → +$25 (được ${build.contractor})`);
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
const kbtn = page.locator('#actions button', { hasText: 'Kỹ năng' });
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
check(await page.locator('.st-node[data-id="cn1"].can-up').count() === 0, 'còn điểm mà chưa đạt điều kiện thì chưa có dấu lên level');
await page.locator('.st-node[data-id="cn1"]').click();
check(await page.locator('[data-act="learn"]:disabled').count() === 1, 'nút Lên level mờ khi chưa đạt điều kiện');
check((await page.locator('.sd-conds').textContent()).includes('Kiếm được 150$ từ kỹ năng này (0/150$)'),
  'thẻ chi tiết ghi điều kiện lên level kèm tiến độ 0/150$');
check((await page.locator('.sd-lvs').textContent()).includes('cần: Kiếm được 400$'), 'dòng level 3 ghi điều kiện');
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

/* ------------------------------------------------ 4. kỹ năng bấm để dùng */
log('\n=== 4. BẤM ĐỂ DÙNG ===');
await reset();
await run(`
  const p = s.current; p.skills = ['dd1','dd2a','dd3'];
  window.__ar = c.skills.afterRoll(p, { a: 3, b: 4, sum: 7, isDouble: false });
`);
await clickModal('Lắc lại viên 4');
const ar = await run('const r = await window.__ar; return { sum: r.d.sum, a: r.d.a, cd: s.current.cooldowns.dd3 };');
check(ar.a === 3 && ar.sum >= 4 && ar.sum <= 9, `Xí Ngầu Gian: giữ viên 3, lắc lại viên kia (tổng ${ar.sum})`);
check(ar.cd === 1, 'Xí Ngầu Gian: chờ 1 lần qua ô Bắt Đầu');

// Level 2: dùng được 2 lần giữa hai lần qua ô Bắt Đầu
await run(`
  const p = s.current; p.cooldowns = {}; p.lapUses = {}; p.skillLv = { dd3: 2 };
  window.__ar = c.skills.afterRoll(p, { a: 3, b: 4, sum: 7, isDouble: false });
`);
await clickModal('Lắc lại viên 4');
const ar2 = await run('await window.__ar; return { cd: s.current.cooldowns.dd3 ?? 0, used: s.current.lapUses.dd3 ?? 0 };');
check(ar2.cd === 0 && ar2.used === 1, `Xí Ngầu Gian level 2: dùng 1 lần chưa phải chờ (${JSON.stringify(ar2)})`);
await run(`window.__ar = c.skills.afterRoll(s.current, { a: 3, b: 4, sum: 7, isDouble: false });`);
await clickModal('Lắc lại viên');
const ar3 = await run('await window.__ar; return { cd: s.current.cooldowns.dd3 ?? 0, used: s.current.lapUses.dd3 ?? 0 };');
check(ar3.cd === 1 && ar3.used === 0, `Xí Ngầu Gian level 2: lần thứ 2 thì chờ tới lần qua ô Bắt Đầu (${JSON.stringify(ar3)})`);
await run('const p = s.current; p.cooldowns = { dd3: 1 }; p.skillLv = {};');

// Quay Đầu: ô đi tới và ô đi lùi cùng sáng trên bàn cờ, bấm ô nào đi ô ấy
await reset();
await run(`
  const p = s.current; p.pos = 10; p.skills = ['dh1','dh2a','dh3','dd1','dd2a','dd3'];
  window.__ar = c.skills.afterRoll(p, { a: 3, b: 4, sum: 7, isDouble: false });
`);
await page.locator('.tile-pick[data-quick]:not(.out)').waitFor({ timeout: 5000 });
const qd = { lit: (await markedTiles(page)).sort((a, b) => a - b),
  extra: await page.locator('.tile-pick .tp-extra').allTextContents(),
  cancel: await page.locator('.tile-pick .tp-cancel').textContent() };
check(JSON.stringify(qd.lit) === '[3,17]', `Quay Đầu: sáng ô đi tới 17 và ô đi lùi 3 (${qd.lit})`);
check(qd.extra.join('|') === 'Lắc lại viên 3|Lắc lại viên 4' && qd.cancel === 'Đi tới như thường',
  `bảng chọn có nút lắc lại từng viên và nút đi như thường (${JSON.stringify(qd)})`);
check(await page.locator('#modal-root .scrim.show').count() === 0, 'không mở hộp thoại nào che bàn cờ');
await page.evaluate(() => { window.__monopoly.scene.onTileClick(3); });
const qd1 = await run('const r = await window.__ar; return { back: r.back, used: s.current.cooldowns.dh3 ?? 0 };');
check(qd1.back === true && qd1.used === 1, `bấm ô 3 là đi lùi luôn, không hỏi lại (${JSON.stringify(qd1)})`);
check(await page.locator('.tile-pick:not(.out)').count() === 0, 'chọn xong thì bảng chọn đóng');
await run(`const p = s.current; p.cooldowns = {};
  window.__ar = c.skills.afterRoll(p, { a: 3, b: 4, sum: 7, isDouble: false });`);
await page.locator('.tile-pick:not(.out) .tp-cancel').click();
const qd2 = await run('const r = await window.__ar; return { back: r.back, cd: s.current.cooldowns.dh3 ?? 0 };');
check(qd2.back === false && qd2.cd === 0, `"Đi tới như thường": đi tới, không tốn lượt Quay Đầu (${JSON.stringify(qd2)})`);
await run(`const p = s.current; p.cooldowns = {};
  window.__ar = c.skills.afterRoll(p, { a: 3, b: 4, sum: 7, isDouble: false });`);
await page.locator('.tile-pick:not(.out) .tp-extra', { hasText: 'Lắc lại viên 4' }).click();
// Lắc lại xong thì hỏi lần nữa với tổng mới — lúc này chỉ còn Quay Đầu, chọn đi tới
await page.waitForTimeout(2600);
await page.locator('.tile-pick:not(.out) .tp-cancel').click({ timeout: 8000 });
const qd3 = await run('const r = await window.__ar; return { a: r.d.a, back: r.back, dd3: s.current.cooldowns.dd3 ?? 0 };');
check(qd3.a === 3 && !qd3.back && qd3.dd3 === 1, `nút phụ "Lắc lại viên 4" chạy Xí Ngầu Gian rồi hỏi lại (${JSON.stringify(qd3)})`);

await run('c.restoreActions();');
const bet = page.locator('#actions button', { hasText: 'Cược Chẵn Lẻ' });
check(await bet.count() === 1, 'nút Cược Chẵn Lẻ hiện trước khi lắc');
await bet.click();
await clickModal('Lẻ');
await clickModal('100$');
await clickModal('Đặt cược');
await page.waitForTimeout(2800);
const b1 = await run('return c.skills.bet;');
check(b1 && b1.pick === 'odd' && b1.amount === 100, `đã cược Lẻ $100 (${JSON.stringify(b1)})`);
check(await page.locator('#actions button', { hasText: 'Đã cược Lẻ' }).count() === 1, 'nút đổi thành "Đã cược Lẻ"');
const settle = await run(`
  const p = s.current; p.skills = ['dd2a']; const m0 = p.money;
  await c.skills.settleBets(p, { a: 2, b: 5, sum: 7, isDouble: false });
  return p.money - m0;
`);
check(settle >= 60 && settle <= 140, `đoán đúng Lẻ ở level 1: +60–140$ (được ${settle})`);
const settle2 = await run(`
  const p = s.current; p.skillLv = { dd2a: 2 }; const m0 = p.money;
  c.skills.bet = { turnNo: s.turnNo, seat: p.id, pick: 'even', amount: 100 };
  await c.skills.settleBets(p, { a: 3, b: 5, sum: 8, isDouble: false });
  return p.money - m0;
`);
check(settle2 === 120, `đoán đúng ở level 2: +120% tiền cược = $120 (được ${settle2})`);

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
check(seized.money === 1500 - 308, `Thâu Tóm level 2: trả 140% giá gốc $308 (còn ${seized.money})`);
check(seized.cd === 2, 'Thâu Tóm: chờ 2 lần qua ô Bắt Đầu');

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
check(fees.broke === 48, `Môi Giới level 2: người khác mua lô 400$ → +12% = 48$ (được ${fees.broke})`);
check(fees.swapped && fees.cut === 14, `Cò Đất level 2: hai người khác đổi 2 lô 60$ → +12% = 14$ (được ${fees.cut})`);

/* ------------------------------------------------ 4c. Chuyến Tàu Xuyên Việt */
log('\n=== 4c. XUYÊN VIỆT ===');
await reset();
await run(`const p = s.current; p.pos = 5; p.skills = ['dh1','dh2a','dh3','dhU']; c.restoreActions();`);
await page.locator('#actions button[data-key="x"]').click();
await page.locator('.tile-pick').waitFor({ timeout: 5000 });
const tp = await page.locator('.tile-pick').textContent();
check(!/undefined/.test(tp) && tp.includes('Đi tới ô nào'), 'bảng chọn ô có tiêu đề, không chữ "undefined"');
check(await page.locator('.tp-cancel').count() === 1, 'bảng chọn ô có nút bỏ ngang');
await page.locator('.tp-cancel').click();
await page.waitForTimeout(600);
check(await run('return !s.current.cooldowns.dhU;'), 'bỏ ngang thì chưa tốn lượt dùng');
await page.locator('#actions button[data-key="x"]').click();
await page.locator('.tile-pick').waitFor({ timeout: 5000 });
await page.evaluate(() => { window.__monopoly.scene.onTileClick(20); });
await page.waitForTimeout(400);
await page.locator('.scrim.show .modal-foot button.btn').first().click();
for (let i = 0; i < 20 && !(await run('return s.current.pos === 20 && !c.busy;')); i++) await wait(500);
const tele = await run('return { pos: s.current.pos, cd: s.current.cooldowns.dhU };');
check(tele.pos === 20 && tele.cd === 4, `đi thẳng tới Bến Đậu, chờ 4 lần qua ô Bắt Đầu (${JSON.stringify(tele)})`);
check(await page.locator('#actions button', { hasText: 'Kết thúc lượt' }).count() === 1, 'xong thì chỉ còn nút Kết thúc lượt');

/* ------------------------------------------------ 5. kỹ năng tự chạy mỗi lần qua ô Bắt Đầu */
log('\n=== 5. TỰ CHẠY MỖI VÒNG ===');
await reset();
const lapEnd = await run(`
  const me = s.current;
  for (const id of [16, 18, 19]) s.owner.set(id, me.id);
  me.skills = ['ac1','ac2a','ac3','acU','cn1','cn2a','cn3','cnU'];
  // tỉ lệ = 3% + 1% × 5 lần qua − 3% × 1 lần vào tù = 5% của 1000$ = 50$ mỗi người
  me.money = 1000; me.laps = 5; me.jails = 1;
  const others = s.players.filter((q) => q.id !== me.id);
  others[0].money = 20;                         // không đủ 50$ thì nộp hết số đang có
  const before = others.map((q) => q.money);
  await c.skills.lapEnd(me);
  return {
    houses: [16, 18, 19].map((id) => s.housesOn(id)),
    got: me.money - 1000,
    paid: others.map((q, i) => before[i] - q.money),
    left0: others[0].money,
  };
`);
check(lapEnd.houses.reduce((a, b) => a + b, 0) === 1, `Phố Cổ: xây 1 căn miễn phí (${lapEnd.houses})`);
check(JSON.stringify(lapEnd.paid) === '[20,50]' && lapEnd.got === 70 && lapEnd.left0 === 0,
  `Liên Đoàn 5%: người đủ tiền nộp 50$, người chỉ có 20$ nộp hết 20$, không âm (${JSON.stringify(lapEnd)})`);

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
  const l1 = K.levyEach(p);                 // 5% của 10000$ = 500$, trần 12$ × 5 = 60$
  p.skillLv = { cnU: 3 };
  const l3 = K.levyEach(p);                 // trần 18$ × 5 = 90$
  p.money = 400;
  const low = K.levyEach(p);                // 5% của 400$ = 20$, dưới trần
  return { l1, l3, low };
`);
check(each.l1 === 60 && each.l3 === 90 && each.low === 20,
  `Liên Đoàn: mỗi người nộp không quá 12$/18$ × số lần qua (level 1/3), tiền ít thì theo % (${JSON.stringify(each)})`);
check(rates.cap1 === 0.12 && rates.cap3 === 0.2 && rates.floor === 0,
  `Liên Đoàn: trần 12% ở level 1, 20% ở level 3, vào tù nhiều thì về 0% chứ không âm (${JSON.stringify(rates)})`);

// Phố Cổ level 3: 2 căn miễn phí mỗi lần
await reset();
const two = await run(`
  const me = s.current;
  for (const id of [16, 18, 19]) s.owner.set(id, me.id);
  me.skills = ['ac1','ac2a','ac3','acU']; me.skillLv = { acU: 3 };
  await c.skills.lapEnd(me);
  return [16, 18, 19].map((id) => s.housesOn(id));
`);
check(two.reduce((a, b) => a + b, 0) === 2 && Math.max(...two) === 1, `Phố Cổ level 3: 2 căn miễn phí, xây đều tay (${two})`);

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
check(ex.pos === 35 && ex.money >= 1600, `đi thẳng tới ga cuối (ô 35), nhận thêm 100$ lên tàu (${JSON.stringify(ex)})`);

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
check(await page.locator('.ppane-skills .st-node').count() === 35, 'mở tab: đủ 35 ô (5 nhánh × 7)');
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

/* ------------------------------------------------ 9. kỹ năng thành tựu */
log('\n=== 9. KỸ NĂNG THÀNH TỰU ===');
await reset();
const lock = await run(`
  const p = s.current; p.skillPoints = 5; p.feats = { share: 5 };
  const noRoot = K.canLearn(p, 'dhX1');
  p.skills = ['dh1', 'dh2b']; p.feats = {};
  const before = K.canLearn(p, 'dhX1');
  const state0 = K.skillState(p, 'dhX1');
  p.feats = { share: 5 };
  const state1 = K.skillState(p, 'dhX1');
  const ok = K.learnSkill(p, 'dhX1');
  return { noRoot: noRoot.reason, before: before.ok, why: before.reason, state0, state1, ok: ok.ok, pts: p.skillPoints,
           cost: K.skillCost(K.skillById('dhX1')) };
`);
check(lock.noRoot.includes('Cần học') && lock.noRoot.includes('Phượt Thủ'),
  `đủ bộ đếm mà chưa học ô cấp 2 đứng trước thì vẫn khoá (${lock.noRoot})`);
check(!lock.before && lock.why.includes('Dừng chung ô với người khác: 0/5 lần') && lock.state0 === 'locked',
  `có ô đứng trước, Hai Ngón vẫn khoá tới khi dừng chung ô 5 lần (${lock.why})`);
check(lock.state1 === 'ready' && lock.ok && lock.pts === 3 && lock.cost === 2, 'đủ 5 lần thì học được, tốn 2 điểm như ô cấp 3');

// Hình cây: mỗi nhánh 1 → 3 → 2 → tối thượng, ô thành tựu nằm trong đó
const treeShape = await run(`
  const { SKILLS, BRANCHES } = await import('/src/data/skills.js');
  return BRANCHES.map((b) => {
    const mine = SKILLS.filter((x) => x.branch === b.key);
    const row = (t) => mine.filter((x) => x.tier === t);
    return { rows: [1, 2, 3, 4].map((t) => row(t).length).join(''),
             feats: mine.filter((x) => x.feat).map((x) => x.tier + (x.slot ?? '')).join(','),
             orphan: mine.filter((x) => x.tier > 1 && !x.requires?.length).length,
             ult: row(4)[0].requires.length };
  });
`);
check(treeShape.every((b) => b.rows === '1321' && b.feats.split(',').sort().join(',') === '2c,3b' && !b.orphan && b.ult === 2),
  `5 nhánh đều 1 → 3 → 2 → tối thượng, thành tựu ở 2c và 3b, không ô nào đứng riêng (${JSON.stringify(treeShape)})`);

// Dừng chung ô: đếm thành tựu, Hai Ngón móc túi người giàu nhất trên ô
await reset();
const pick = await run(`
  const me = s.current, a = s.players[(s.turn + 1) % 3], b = s.players[(s.turn + 2) % 3];
  me.pos = 12; a.pos = 12; b.pos = 12; a.money = 1000; b.money = 2000;
  const r0 = Math.random; Math.random = () => 0;          // trúng 30%, rút đáy khoảng 5%
  await c.skills.landed(me);
  const share1 = me.feats.share;
  me.skills = ['dhX1'];
  const m0 = me.money, b0 = b.money;
  await c.skills.landed(me);
  Math.random = r0;
  return { share1, share2: me.feats.share, got: me.money - m0, lost: b0 - b.money, use: me.skillUse.dhX1 };
`);
check(pick.share1 === 1 && pick.share2 === 2, 'dừng chung ô với người khác: bộ đếm +1 mỗi lần');
check(pick.got === 100 && pick.lost === 100 && pick.use.gain === 100,
  `Hai Ngón level 1: lấy 5% của người giàu nhất (2000$ → 100$), ghi vào tiến độ (${JSON.stringify(pick)})`);

await reset();
const alone = await run(`
  const me = s.current; me.skills = ['dhX1']; me.pos = 13;
  s.players.forEach((q) => { if (q !== me) q.pos = 30; });
  const m0 = me.money; await c.skills.landed(me);
  return { got: me.money - m0, share: me.feats.share ?? 0 };
`);
check(alone.got === 0 && alone.share === 0, 'đứng một mình thì không đếm, không móc túi');

// Phượt Thủ: đếm số ô đã đi; lắc 10–12 có thưởng
await reset();
const trip = await run(`
  const me = s.current; me.pos = 6;                        // 6 → 10: ghé thăm Khám Lớn, không hỏi gì
  await c.advance(me, 4, { a: 1, b: 3, sum: 4, isDouble: false });
  const steps = me.feats.steps;
  me.skills = ['dhX2']; me.skillLv = { dhX2: 2 };
  const m0 = me.money;
  await c.skills.rollPerks(me, { a: 5, b: 6, sum: 11, isDouble: false });
  const big = me.money - m0;
  const m1 = me.money;
  await c.skills.rollPerks(me, { a: 4, b: 5, sum: 9, isDouble: false });
  return { steps, big, small: me.money - m1 };
`);
check(trip.steps === 4, `đi 4 ô thì bộ đếm "Đi tổng cộng" = 4 (${trip.steps})`);
check(trip.big === 35 && trip.small === 0, `Phượt Thủ level 2: lắc 11 +35$, lắc 9 không có (${JSON.stringify(trip)})`);

// Tài Xỉu, Hoàn Lương, bộ đếm thắng/thua cược
await reset();
const bets = await run(`
  const me = s.current; me.skills = ['dd2a', 'ddX1', 'ddX2']; me.skillLv = { ddX1: 3, ddX2: 3 };
  const put = (pick, amount) => { c.skills.bet = { turnNo: s.turnNo, seat: me.id, pick, amount }; };
  put('big', 100); let m0 = me.money;
  await c.skills.settleBets(me, { a: 4, b: 5, sum: 9, isDouble: false });
  const big = me.money - m0;
  put('small', 100); m0 = me.money;
  await c.skills.settleBets(me, { a: 3, b: 4, sum: 7, isDouble: false });
  const seven = me.money - m0;
  return { big, seven, pot: s.pot, feats: me.feats, use: me.skillUse };
`);
check(bets.big === 200, `Tài trúng ở level 3: +200% tiền cược = 200$ (được ${bets.big})`);
check(bets.seven === -50 && bets.pot === 100, `ra 7 thì Xỉu thua; Hoàn Lương level 3 trả lại 50% (${bets.seven}, quỹ ${bets.pot})`);
check(bets.feats.betWin === 200 && bets.feats.betLose === 100, `bộ đếm thắng/thua cược (${JSON.stringify(bets.feats)})`);
check(bets.use.dd2a.n === 2 && bets.use.ddX1.gain === 200 && bets.use.ddX2.gain === 50, 'mỗi lần cược ghi tiến độ đúng kỹ năng');

await reset();
await run(`const p = s.current; p.skills = ['dd2a', 'ddX1']; c.lastRolled = false; c.restoreActions();`);
await page.locator('#actions button', { hasText: 'Cược Chẵn Lẻ' }).click();
await page.locator('.sk-bet').waitFor({ timeout: 5000 });
check(await page.locator('.sk-bet [data-v="big"]').count() === 1 && await page.locator('.sk-bet [data-v="small"]').count() === 1,
  'hộp cược có thêm cửa Tài và Xỉu');
await page.locator('.sk-bet [data-v="small"]').click();
await clickModal('Đặt cược');
await page.waitForTimeout(2600);
check(await page.locator('#actions button', { hasText: 'Đã cược Xỉu' }).count() === 1, 'đặt cửa Xỉu: nút đổi thành "Đã cược Xỉu"');
await run('c.skills.bet = null;');

// Khách Quen Nhà Đá: bồi thường khi vào tù, ra tù miễn phí
await reset();
const jail = await run(`
  const me = s.current; me.jails = 2; me.skills = ['cn1'];
  await c.goToJail(me);
  const jails = me.jails, locked = K.skillState(me, 'cnX2');
  me.skills = ['cnX2']; me.skillLv = { cnX2: 2 };
  s.releaseFromJail(me); me.pos = 5;
  const m0 = me.money;
  await c.goToJail(me);
  const comp = me.money - m0;
  c.restoreActions();
  return { jails, locked, comp };
`);
check(jail.jails === 3 && jail.locked === 'poor', `đã học Nhặt Tiền Rơi, vào tù lần 3 thì mở khoá Khách Quen Nhà Đá (${JSON.stringify(jail)})`);
check(jail.comp === 60, `Khách Quen level 2: vào tù nhận 60$ (được ${jail.comp})`);
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
check(!bail.jail && bail.paid === 0 && bail.gain === 110, `ra tù không mất 50$, tiến độ cộng 60 + 50 (${JSON.stringify(bail)})`);

// Chủ Nợ, Sống Sót, tiến độ kỹ năng thuê của chủ đất
await reset();
const rentx = await run(`
  const me = s.current, owner = s.players[(s.turn + 1) % 3];
  s.owner.set(39, owner.id);                                  // Dinh Toàn Quyền, thuê gốc 50$
  owner.skills = ['dcX1', 'dcU']; me.money = 40;
  const late = c.skills.rentBill(me, 39, null);
  me.skills = ['acX1'];
  const both = c.skills.rentBill(me, 39, null);
  me.money = 1000;
  const rich = c.skills.rentBill(me, 39, null);
  c.skills.rentPaid(owner, rich);
  return { late: late.total, lateFee: late.late, both: both.total, rich: rich.total,
           note: c.skills.rentNote(me, 39, both), dcU: owner.skillUse.dcU, rentIn: owner.feats.rentIn };
`);
check(rentx.late === 110 && rentx.lateFee === 10, `Chủ Nợ: thuê 100$ (Cơn Sốt ×2) mà chỉ có 40$ → +10% = 110$ (${rentx.late})`);
check(rentx.both === 55, `Sống Sót dưới 100$ trả 50% = 50$, Chủ Nợ phạt 10% phần còn lại = 55$ (${rentx.both})`);
check(rentx.rich === 100, 'đủ tiền thì không có phạt chậm, không giảm');
check(rentx.note.includes('Sống Sót') && rentx.note.includes('phạt chậm'), 'dòng loan tin ghi cả giảm và phạt chậm');
check(rentx.dcU.gain === 50 && rentx.rentIn === 100, `Cơn Sốt Đất ghi 50$ tiền thuê thu thêm; chủ đất đếm 100$ tiền thuê (${JSON.stringify(rentx)})`);

// Sống Sót: tiền mặt tụt dưới 100$ mới đếm; nằm lì dưới vạch không đếm thêm
await reset();
const broke = await run(`
  const me = s.current;
  await c.payBank(me.id, 1450);          // 1500 → 50
  await c.payBank(me.id, 10);            // vẫn dưới vạch
  const once = me.feats.broke;
  await c.receiveFromBank(me.id, 500);   // lên lại
  await c.payBank(me.id, 500);           // tụt lần 2
  return { once, twice: me.feats.broke };
`);
check(broke.once === 1 && broke.twice === 2, `bộ đếm "tụt dưới 100$" chỉ tính lúc tụt qua vạch (${JSON.stringify(broke)})`);

// Lão Làng: đếm lần qua từ lúc học, tặng điểm theo nhịp
await reset();
const vet = await run(`
  const me = s.current; me.laps = 6; me.skills = ['cnX1']; me.skillLv = { cnX1: 3 };   // mỗi 2 lần
  const got = [K.onLap(me), K.onLap(me), K.onLap(me), K.onLap(me)];
  return { got, pts: me.skillPoints, use: me.skillUse.cnX1 };
`);
check(JSON.stringify(vet.got) === '[1,2,1,2]' && vet.pts === 6, `Lão Làng level 3: cứ 2 lần qua được thêm 1 điểm (${JSON.stringify(vet)})`);
check(vet.use.n === 2, 'Lão Làng: mỗi lần tặng điểm là một lần chạy');

// Khách Sộp: mua ô trống thì đếm, học rồi thì ngân hàng hoàn tiền
await reset();
const buy = await run(`
  const { BOARD } = await import('/src/data/board.js');
  const me = s.current;
  const locked = K.skillState({ ...me, skills: ['dc1'] }, 'dcX2');
  me.pos = 39;
  window.__buyGo = c.resolveOwnable(me, BOARD[39], { a: 1, b: 2, sum: 3 });
  return { locked };
`);
await clickModal('Mua');
const buy2 = await run(`
  await window.__buyGo;
  const { BOARD } = await import('/src/data/board.js');
  const me = s.current;
  const n1 = me.feats.buys;
  me.skills = ['dc1', 'dcX2']; me.skillLv = { dcX2: 2 };
  const m0 = me.money;
  await c.skills.bought(me, 39);
  return { n1, n2: me.feats.buys, back: me.money - m0, price: BOARD[39].price, use: me.skillUse.dcX2,
           owner: s.owner.get(39) === me.id };
`);
check(buy.locked === 'locked' && buy2.owner && buy2.n1 === 1, `mua ô trống qua hộp Mua: bộ đếm "buys" = 1 (${JSON.stringify(buy2)})`);
check(buy2.n2 === 2 && buy2.back === Math.round(buy2.price * 0.12) && buy2.use.gain === buy2.back,
  'Khách Sộp level 2: hoàn 12% giá mua, ghi vào tiến độ');

// Chủ Nhà: dừng trên đất của mình
await reset();
const home = await run(`
  const { BOARD } = await import('/src/data/board.js');
  const me = s.current; s.owner.set(39, me.id); me.pos = 39;
  await c.resolveOwnable(me, BOARD[39], { a: 1, b: 2, sum: 3 });
  const n1 = me.feats.home, m1 = me.money;
  me.skills = ['ac1', 'acX2']; me.skillLv = { acX2: 3 };
  await c.resolveOwnable(me, BOARD[39], { a: 1, b: 2, sum: 3 });
  return { n1, n2: me.feats.home, gotFirst: m1 - 1500, got: me.money - m1, use: me.skillUse.acX2 };
`);
check(home.n1 === 1 && home.gotFirst === 0 && home.n2 === 2, `dừng trên đất mình: đếm "home", chưa học thì không có tiền (${JSON.stringify(home)})`);
check(home.got === 45 && home.use.gain === 45, 'Chủ Nhà level 3: +45$, ghi vào tiến độ');

// Ảnh chụp mang tiến độ và bộ đếm thành tựu
const snapUse = await run(`
  const me = s.current; me.skillUse = { cn1: { n: 2, gain: 70 } }; me.feats = { share: 3, steps: 90 };
  const q = S.fromSnapshot(JSON.parse(JSON.stringify(S.snapshot(s)))).players[me.id];
  me.skillUse.cn1.n = 99;
  return { use: q.skillUse, feats: q.feats };
`);
check(snapUse.use.cn1.n === 2 && snapUse.use.cn1.gain === 70 && snapUse.feats.share === 3, 'ảnh chụp mang skillUse và feats, chép riêng không dùng chung object');

// Giao diện: ô thành tựu mọc từ ô cấp 2, khoá có tiến độ
await reset();
await run(`s.current.skillPoints = 2; s.current.skills = ['dh1', 'dh2b']; s.current.feats = { share: 3 }; c.restoreActions();`);
await page.locator('#actions button', { hasText: 'Kỹ năng' }).click();
await page.locator('.st-node[data-id="dhX1"]').waitFor({ timeout: 5000 });
check(await page.locator('.st-node.feat').count() === 10, 'cây có 10 ô thành tựu');
check(await page.locator('.st-edge[data-to="dhX1"]').count() === 2, 'Hai Ngón có 2 đường nối từ cấp 2');
check(await page.locator('.st-edge[data-to="dhU"]').count() === 2, 'tối thượng nối từ cả hai ô cấp 3');
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
check(await page.locator('.st-node[data-id="dhX1"].is-locked').count() === 1, 'Hai Ngón khoá khi mới dừng chung ô 3 lần');
await page.locator('.st-node[data-id="dhX1"]').click();
check((await page.locator('.sd-conds').textContent()).includes('3/5 lần'), 'thẻ chi tiết ghi tiến độ 3/5 lần');
check((await page.locator('.sd-eyebrow').textContent()).includes('Thành tựu'), 'thẻ chi tiết ghi "Thành tựu"');
await page.screenshot({ path: 'test-result/skills-feat.png' });
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await page.keyboard.press('Escape');
await page.waitForTimeout(3200);

log('\nLỗi console:', errors.length ? errors : 'không có');
if (errors.length) fails += errors.length;
log(fails ? `\n✗ ${fails} lỗi` : '\n✓ tất cả đều qua');
await browser.close();
process.exit(fails ? 1 : 0);
