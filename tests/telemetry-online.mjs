/**
 * Số liệu cân bằng kỹ năng trên hai máy: chỉ **máy cầm lái** ghi.
 *
 * Người ngồi xem học ngoài lượt thì máy họ cũng chạy `learnSkill` trên bản
 * sao rồi nhắn máy cầm lái học thật — bài này đếm sự kiện `learn` ở cả hai
 * máy và đòi đúng **một**, nằm ở máy cầm lái. Cần dev server ở cổng 5179.
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
/** Ép bật analytics với fetch giả: máy kiểm thử không có khoá Supabase và là Chrome của Playwright. */
const arm = (page) => page.evaluate(() => {
  const a = window.__monopoly.controller.analytics;
  window.__sent = [];
  a.enabled = true; a.url = 'https://fake.local'; a.key = 'k';
  a.fetch = async (url, init) => { window.__sent.push({ url, rows: JSON.parse(init.body) }); return { ok: true, status: 201 }; };
});
/** Mọi sự kiện kỹ năng máy này đã thấy: còn trong buffer, trong hàng đợi, hay đã "gửi". */
const seen = (page) => page.evaluate(() => {
  const a = window.__monopoly.controller.analytics;
  const sent = window.__sent.filter((x) => x.url.endsWith('/skill_events')).flatMap((x) => x.rows);
  const queued = a.queue.filter((b) => b.table === 'skill_events').flatMap((b) => b.rows);
  return [...sent, ...queued, ...a.buffer.map((e) => ({ kind: e.kind, skill_id: e.id, seat: e.seat }))];
});

console.log('\n▸ 1. Mở phòng hai máy');
const A = watch(await ctx.newPage(), 'A');
await A.goto(BASE, { waitUntil: 'domcontentloaded' });
await bootToLobby(A);
await arm(A);
const link = await A.locator('#lobby-link').inputValue();
await A.locator('.lobby-seat.is-me input.lobby-name').fill('Bảy Viễn');
await A.locator('.rule-btn[data-lv="off"]').click();
await A.locator('.lobby-seat.is-me .lobby-ready').click();

const B = watch(await ctx.newPage(), 'B');
await B.goto(link, { waitUntil: 'domcontentloaded' });
await bootToLobby(B);
await arm(B);
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
const starts = await A.evaluate(() => window.__sent.filter((x) => x.url.endsWith('/games')).flatMap((x) => x.rows));
ok(starts.length === 1 && starts[0].phase === 'start' && starts[0].mode === 'local' && starts[0].players === 2,
  'chủ phòng gửi games phase=start (mode local vì không có khoá)', JSON.stringify(starts));
ok((await B.evaluate(() => window.__sent.length)) === 0, 'máy vào phòng không gửi games start');
ok(await until(async () => (await A.evaluate(() => window.__monopoly.controller.state.gameId)) === (await B.evaluate(() => window.__monopoly.controller.state.gameId))),
  'hai máy cùng gameId');

const driver = async () => ((await A.evaluate(() => window.__monopoly.controller.isDriver())) ? A : B);
const D = await driver();
const O = D === A ? B : A;

console.log('\n▸ 2. Người ngồi xem học ngoài lượt');
const oSeat = await O.evaluate(() => window.__monopoly.controller.mySeat);
await D.bringToFront();
await D.evaluate((s) => {
  const c = window.__monopoly.controller;
  c.state.players[s].skillPoints = 3;
  c.hud.refresh(); c.sync();
}, oSeat);
await O.bringToFront();
ok(await until(async () => O.evaluate((s) => window.__monopoly.controller.state.players[s].skillPoints === 3, oSeat)), 'máy ngồi xem nhận 3 điểm');
await O.locator('#skill-btn').click();
await O.locator('.st-node[data-id="dh1"]').waitFor({ timeout: 8000 });
await O.locator('.st-node[data-id="dh1"]').click();
await O.locator('[data-act="learn"]').click();
await O.waitForTimeout(500);
await O.locator('.st-close').click();
await D.bringToFront();
ok(await until(async () => D.evaluate((s) => window.__monopoly.controller.state.players[s].skills.includes('dh1'), oSeat)), 'máy cầm lái đã học thật');
await D.waitForTimeout(1500);
const atD = (await seen(D)).filter((e) => e.kind === 'learn');
const atO = (await seen(O)).filter((e) => e.kind === 'learn');
ok(atD.length === 1 && atD[0].skill_id === 'dh1' && atD[0].seat === oSeat, 'máy cầm lái ghi đúng 1 learn dh1 cho ghế người học', JSON.stringify(atD));
ok(atO.length === 0, 'máy ngồi xem (học trên bản sao) không ghi gì', JSON.stringify(atO));

console.log('\n▸ 3. Người đang đi học trong lượt');
await D.evaluate(() => { const c = window.__monopoly.controller; c.state.current.skillPoints = 2; c.hud.refresh(); c.sync(); c.restoreActions(); });
await D.locator('#actions button[data-key="k"]').click();
await D.locator('.st-node[data-id="cn1"]').waitFor({ timeout: 8000 });
await D.locator('.st-node[data-id="cn1"]').click();
await D.locator('[data-act="learn"]').click();
await D.waitForTimeout(400);
await D.locator('.st-close').click();
await D.waitForTimeout(800);
const atD2 = (await seen(D)).filter((e) => e.kind === 'learn');
ok(atD2.length === 2 && atD2.some((e) => e.skill_id === 'cn1'), 'máy cầm lái ghi thêm learn cn1 (tổng 2)', JSON.stringify(atD2));
ok(((await seen(O)).filter((e) => e.kind === 'learn')).length === 0, 'máy ngồi xem vẫn không ghi');

await browser.close();
if (errors.length) { console.log('\nLỗi trang:'); for (const e of errors) console.log('  ' + e); }
console.log(fails.length || errors.length ? `\n✗ ${fails.length} kiểm thất bại, ${errors.length} lỗi trang` : '\n✓ telemetry-online đạt');
process.exit(fails.length || errors.length ? 1 : 0);
