/**
 * Cây kỹ năng trên hai máy (bản online).
 *
 * Ván gốc nằm ở máy cầm lái; máy kia chỉ dựng lại từ ảnh chụp. Bài kiểm này
 * soi đúng chỗ đó:
 *   - máy ngồi xem **không** có nút Kỹ năng / nút kỹ năng bấm để dùng;
 *   - học kỹ năng ở máy cầm lái thì máy kia thấy đúng kỹ năng, đúng số điểm còn;
 *   - cược rồi lắc: tiền hai máy khớp nhau sau khi chốt cược;
 *   - sang lượt người kia thì nút Kỹ năng hiện ở máy **của họ**, học được, và
 *     máy đầu thấy lại;
 *   - cuối bài: mọi trường kỹ năng trong ảnh chụp của hai máy giống hệt nhau.
 *
 * Cần dev server riêng ở cổng 5179.
 */
import { launchChrome } from './launch.mjs';
import { playRollOff } from './rolloff.mjs';

const BASE = 'http://localhost:5179/';
const errors = [];
const fails = [];

const browser = await launchChrome();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });

function watch(page, tag) {
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${tag}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${tag}] ${e.message}`));
  return page;
}
const ok = (cond, label, extra = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${label}${extra ? ` — ${extra}` : ''}`);
  if (!cond) fails.push(label);
};
async function until(fn, ms = 15000, step = 200) {
  const t0 = Date.now();
  for (;;) {
    if (await fn().catch(() => false)) return true;
    if (Date.now() - t0 > ms) return false;
    await new Promise((r) => setTimeout(r, step));
  }
}
async function bootToLobby(page, ms = 90000) {
  await page.bringToFront();
  const mode = page.locator('.scrim.show button.btn', { hasText: 'Mở phòng online' });
  await until(async () => (await mode.count()) > 0 || (await page.locator('#lobby-link').count()) > 0, ms);
  if (await mode.count()) await mode.click();
  await page.locator('#lobby-link').waitFor({ timeout: 30000 });
}

/** Phần kỹ năng trong ảnh chụp của một máy — để so hai máy với nhau. */
const skillView = (page) => page.evaluate(() => {
  const s = window.__monopoly.controller.state;
  return JSON.stringify({
    players: s.players.map((p) => ({ money: p.money, pts: p.skillPoints, skills: p.skills, off: p.skillOff, lv: p.skillLv, laps: p.laps,
      cd: p.cooldowns, uses: p.lapUses, jails: p.jails })),
    heritage: [...s.heritage], turnNo: s.turnNo, pot: s.pot,
  });
});

/** Trả lời mọi hộp thoại trên máy cầm lái cho tới khi sạch (mua đất thì bỏ qua, thẻ thì đóng). */
async function drain(page, ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const top = page.locator('#modal-root .scrim.show').last();
    if (!(await page.locator('#modal-root .scrim.show').count())) {
      await page.waitForTimeout(400);
      if (!(await page.locator('#modal-root .scrim.show').count())) return;
      continue;
    }
    let clicked = false;
    for (const label of ['Đi tới', 'Bỏ qua', 'Đành chịu', 'Nhận tiền', 'Tiếp tục', 'Lên đường', 'Cất vào túi', 'Đóng', 'Đã rõ', 'Thôi', 'Không cược', 'Chưa đạp']) {
      const b = top.locator('.modal-foot button.btn:not([disabled])', { hasText: label }).first();
      if (await b.count()) { await b.click().catch(() => {}); clicked = true; break; }
    }
    if (!clicked) await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }
}

/* ============================================================ phòng */

console.log('\n▸ 1. Mở phòng hai máy');
const A = watch(await ctx.newPage(), 'A');
await A.goto(BASE, { waitUntil: 'domcontentloaded' });
await bootToLobby(A);
const link = await A.locator('#lobby-link').inputValue();
await A.locator('.lobby-seat.is-me input.lobby-name').fill('Bảy Viễn');
await A.locator('.rule-btn[data-lv="off"]').click();
await A.locator('.lobby-seat.is-me .lobby-ready').click();

const B = watch(await ctx.newPage(), 'B');
await B.goto(link, { waitUntil: 'domcontentloaded' });
await bootToLobby(B);
await B.locator('.lobby-seat.is-me input.lobby-name').fill('Cô Ba');
await B.locator('.lobby-seat.is-me .lobby-ready').click();

await A.bringToFront();
await until(async () => !(await A.locator('#lobby-start').isDisabled()));
await A.locator('#lobby-start').click();
for (const p of [A, B]) {
  await p.bringToFront();
  await until(async () => p.evaluate(() => !!window.__monopoly?.controller?.state), 60000);
}
await playRollOff([A, B]);
await A.bringToFront();
ok(await until(async () => A.evaluate(() => !!window.__monopoly.controller.state.order)), 'ván đã khai cuộc');

const driver = async () => ((await A.evaluate(() => window.__monopoly.controller.isDriver())) ? A : B);
let D = await driver();
let O = D === A ? B : A;

/* ============================================================ học ở máy cầm lái */

console.log('\n▸ 2. Người đang đi học kỹ năng, máy kia thấy theo');
await D.bringToFront();
await D.evaluate(() => {
  const c = window.__monopoly.controller;
  c.state.current.skillPoints = 3;
  c.hud.refresh(); c.sync(); c.restoreActions();
});
await O.bringToFront();
ok(await until(async () => (await O.evaluate(() => window.__monopoly.controller.state.current.skillPoints)) === 3),
  'máy kia nhận 3 điểm kỹ năng của người đang đi');
ok((await O.locator('#actions button[data-key="k"]').count()) === 0, 'máy ngồi xem không có nút Kỹ năng');

await D.bringToFront();
await D.locator('#actions button[data-key="k"]').click();
await D.locator('.st-node[data-id="dd1"]').waitFor({ timeout: 8000 });
for (const id of ['dd1', 'dd2a']) {
  await D.locator(`.st-node[data-id="${id}"]`).click();
  await D.locator('[data-act="learn"]').click();
  await D.waitForTimeout(400);
}
await D.locator('.st-close').click();
await D.waitForTimeout(600);
const seat = await D.evaluate(() => window.__monopoly.controller.state.turn);
await O.bringToFront();
ok(await until(async () => O.evaluate((seat) => {
  const p = window.__monopoly.controller.state.players[seat];
  return p.skills.join() === 'dd1,dd2a' && p.skillPoints === 1;
}, seat)), 'máy kia có đúng 2 kỹ năng vừa học, còn 1 điểm');

/* ============================================================ học ngoài lượt */

console.log('\n▸ 2b. Người ngồi xem học kỹ năng ngoài lượt');
const oSeat = await O.evaluate(() => window.__monopoly.controller.mySeat);
await D.evaluate((s) => {
  const c = window.__monopoly.controller;
  c.state.players[s].skillPoints = 3;
  c.hud.refresh(); c.sync();
}, oSeat);
await O.bringToFront();
ok(await until(async () => O.evaluate((s) => window.__monopoly.controller.state.players[s].skillPoints === 3, oSeat)),
  'máy ngồi xem nhận 3 điểm');
ok((await O.locator('#actions button').count()) === 0, 'máy ngồi xem không còn bảng "Tới lượt …" giữa bàn');
ok(await O.locator('#skill-btn:not([hidden]) .skill-btn-n', { hasText: '3' }).count() === 1, 'nút cây kỹ năng ở hàng tiện ích ghi 3 điểm');
await O.locator('#skill-btn').click();
await O.locator('.st-node[data-id="dh1"]').waitFor({ timeout: 8000 });
ok(await O.locator('.st-respec').count() === 0, 'cây mở ngoài lượt không có nút Tẩy điểm');
for (const id of ['dh1', 'dh2a']) {
  await O.locator(`.st-node[data-id="${id}"]`).click();
  await O.locator('[data-act="learn"]').click();
  await O.waitForTimeout(500);
}
await O.locator('.st-node[data-id="dh2a"]').click();
ok(await O.locator('[data-act="toggle"]').count() === 0 && await O.locator('.sd-wait').count() === 0,
  'Tàu Tốc Hành tự hỏi đúng lúc: thẻ chi tiết không có công tắc');
await O.keyboard.press('Escape');
await O.waitForTimeout(300);
await O.locator('.st-close').click();
await D.bringToFront();
ok(await until(async () => D.evaluate((s) => {
  const p = window.__monopoly.controller.state.players[s];
  return p.skills.join() === 'dh1,dh2a' && p.skillPoints === 1 && !p.skillOff.length;
}, oSeat)), 'máy cầm lái ghi đúng 2 kỹ năng học ngoài lượt, còn 1 điểm, Tàu Tốc Hành không nằm tắt');
ok(await D.evaluate((s) => {
  const p = window.__monopoly.controller.state.players[s];
  return !p.skillOff.includes('dh1');
}, oSeat), 'kỹ năng tự động (Vé Tháng) học xong là bật');
ok(await until(async () => (await skillView(A)) === (await skillView(B)), 15000), 'hai máy khớp nhau sau khi học ngoài lượt');

/* ============================================================ cược + lắc */

console.log('\n▸ 3. Cược rồi lắc — tiền hai máy khớp nhau');
await D.bringToFront();
// Cược Chẵn Lẻ không có công tắc: bấm Lắc thì hộp hỏi cược hiện trên máy người đi
ok((await O.locator('#actions button[data-key="u"]').count()) === 0, 'máy ngồi xem không có nút Dùng kỹ năng');
await until(async () => (await D.locator('#actions button[data-key="r"]').count()) === 1, 8000);
await D.locator('#actions button[data-key="r"]').click();
await D.locator('.sk-bet').waitFor({ timeout: 5000 });
ok((await O.locator('.sk-bet').count()) === 0, 'hộp hỏi cược chỉ hiện trên máy người đi');
const topD = D.locator('#modal-root .scrim.show:not(.stashed)').last();
await topD.locator('[data-row="amount"] button', { hasText: '100$' }).click();
await D.keyboard.press('Enter');
ok(await until(async () => O.evaluate((s) => {
  const p = window.__monopoly.controller.state.players[s];
  return p.betSet?.pick === 'even' && p.betSet?.amount === 100;
}, seat)), 'Enter: máy kia thấy lần cược Chẵn 100$');
await D.waitForTimeout(2500);
await drain(D, 25000);
await until(async () => !(await D.evaluate(() => window.__monopoly.controller.busy)), 20000);
ok(await until(async () => (await skillView(A)) === (await skillView(B)), 15000),
  'sau khi chốt cược, tiền và kỹ năng hai máy khớp nhau');
ok(await D.evaluate(() => window.__monopoly.controller.skills.bet === null), 'cược đã chốt, không còn treo');
ok(await D.evaluate((s) => window.__monopoly.controller.state.players[s].usedTurn?.dd2a != null, seat), 'bấm Lắc thì đã hỏi cược');

/* ============================================================ sang lượt người kia */

console.log('\n▸ 4. Sang lượt người kia — nút Kỹ năng hiện ở máy của họ');
await D.bringToFront();
// Ra đôi thì còn lắc tiếp. Vào tù hay ra đôi ba lần thì luật tự gọi endTurn,
// lượt đã sang người kia mà không cần bấm — nên dừng khi `turn` đổi.
const turn0 = await D.evaluate(() => window.__monopoly.controller.state.turn);
const turnMoved = () => D.evaluate((t) => window.__monopoly.controller.state.turn !== t, turn0);
for (let i = 0; i < 12 && !(await turnMoved()); i++) {
  if (await D.locator('#actions button[data-key="e"]').count()) {
    await D.locator('#actions button[data-key="e"]').click();
    await D.waitForTimeout(1500);
  } else if (await D.locator('#actions button[data-key="r"]').count()) {
    await D.locator('#actions button[data-key="r"]').click();
    await D.waitForTimeout(2500);
    await drain(D, 20000);
  } else {
    await drain(D, 3000);
    await D.waitForTimeout(800);
  }
}
if (!(await turnMoved())) {
  console.log('  lượt không sang — đang đứng ở:', await D.evaluate(() => ({
    busy: window.__monopoly.controller.busy,
    buttons: [...document.querySelectorAll('#actions button')].map((b) => b.dataset.key + ':' + b.textContent.trim()),
    modal: document.querySelector('#modal-root .scrim.show')?.textContent.trim().slice(0, 120) ?? null,
  })));
}
await D.waitForTimeout(1000);
D = await driver();
O = D === A ? B : A;
ok(D !== O, 'quyền cầm lái đã sang máy kia');
await D.bringToFront();
ok(await until(async () => (await D.locator('#actions button[data-key="k"]').count()) === 1), 'máy mới cầm lái có nút Kỹ năng');
await D.evaluate(() => {
  const c = window.__monopoly.controller;
  c.state.current.skillPoints = 2;
  // Lên level 2 cần Nhặt Tiền Rơi đã nhặt đủ 150$ — tiến độ phải đi theo ảnh chụp sang máy kia
  c.state.current.skillUse = { cn1: { n: 3, gain: 150 } };
  c.hud.refresh(); c.sync(); c.restoreActions();
});
await D.locator('#actions button[data-key="k"]').click();
await D.locator('.st-node[data-id="cn1"]').waitFor({ timeout: 8000 });
// Học rồi lên level 2 ngay trong một lần mở cây
for (let i = 0; i < 2; i++) {
  await D.locator('.st-node[data-id="cn1"]').click();
  await D.locator('[data-act="learn"]').click();
  await D.waitForTimeout(400);
}
await D.locator('.st-close').click();
const seat2 = await D.evaluate(() => window.__monopoly.controller.state.turn);
await O.bringToFront();
ok(await until(async () => O.evaluate((s) => {
  const p = window.__monopoly.controller.state.players[s];
  return p.skills.join() === 'dh1,dh2a,cn1' && p.skillLv?.cn1 === 2 && p.skillPoints === 0 && p.skillUse?.cn1?.gain === 150;
}, seat2)), 'máy đầu thấy người kia vừa học Nhặt Tiền Rơi, lên level 2, hết điểm');

console.log('\n▸ 5. Học tối thượng — máy ngồi xem cũng thấy hào quang');
await D.bringToFront();
await D.evaluate(() => {
  const c = window.__monopoly.controller;
  c.state.current.skills = ['cn1', 'cn2a', 'cn3', 'cnU', 'dh1', 'dh2a', 'dh3', 'dhU'];
  c.hud.refresh(); c.scene.refresh(c.state); c.sync();
});
await O.bringToFront();
ok(await until(async () => O.evaluate((s) => window.__monopoly.scene.auras[s]?.key === '#E2743A,#3C8FE0', seat2)),
  'máy ngồi xem dựng hào quang hai màu cho quân có hai tối thượng');
ok(await O.evaluate((s) => !window.__monopoly.scene.auras[s], seat), 'quân chưa có tối thượng không có hào quang');
ok(await O.evaluate((s) => window.__monopoly.controller.state.players[s].skills.join() === 'dd1,dd2a', seat),
  'kỹ năng của người cũ vẫn nguyên');

ok(await until(async () => (await skillView(A)) === (await skillView(B)), 15000), 'cuối bài: phần kỹ năng của hai máy giống hệt');

if (errors.length) { console.log('\nLỗi console:'); for (const e of errors) console.log('  ' + e); fails.push('lỗi console'); }
console.log(fails.length ? `\n✗ ${fails.length} chỗ hỏng: ${fails.join(' · ')}` : '\nKhông có chỗ nào hỏng.');
await browser.close();
process.exit(fails.length ? 1 : 0);
