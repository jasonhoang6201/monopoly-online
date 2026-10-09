/**
 * Phần vui nhộn ở bản nhiều máy: lời bình luận viên giống hệt nhau trên mọi
 * máy, hồn ma ở máy khác ám quẻ được và bỏ phiếu chọn lá Thời Cuộc cho máy
 * cầm lái.
 *
 * Chạy: cần dev server ở cổng 5179
 *   npx vite --port 5179 --strictPort &
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

console.log('\n▸ 1. Ba máy vào phòng');
const A = watch(await ctx.newPage(), 'A');
await A.goto(BASE, { waitUntil: 'domcontentloaded' });
await bootToLobby(A);
const link = await A.locator('#lobby-link').inputValue();
const pages = [A];
for (const [i, name] of [['B', 'Cô Ba'], ['C', 'Tư Lì']]) {
  const P = watch(await ctx.newPage(), i);
  await P.goto(link, { waitUntil: 'domcontentloaded' });
  await bootToLobby(P);
  await P.locator('.lobby-seat.is-me input.lobby-name').fill(name);
  await P.locator('.lobby-seat.is-me .lobby-ready').click();
  pages.push(P);
}
await A.bringToFront();
await A.locator('.lobby-seat.is-me input.lobby-name').fill('Bảy Viễn');
await A.locator('.lobby-seat.is-me .lobby-ready').click();
await until(async () => !(await A.locator('#lobby-start').isDisabled()), 30000);
await A.locator('#lobby-start').click();
for (const p of pages) {
  await p.bringToFront();
  await until(async () => p.evaluate(() => !!window.__monopoly?.controller?.state), 60000);
}
await playRollOff(pages);
ok(await until(async () => A.evaluate(() => !!window.__monopoly.controller.state.order)), 'ván ba máy đã lắc giành quyền xong');

/** Máy đang cầm lái và đã rảnh tay. */
async function driver() {
  for (let i = 0; i < 60; i++) {
    for (const p of pages) {
      if (await p.evaluate(() => {
        const c = window.__monopoly.controller;
        return c.isDriver() && !c.busy;
      })) return p;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}
const D = await driver();
ok(!!D, 'tìm được máy cầm lái');
const seatOf = (p) => p.evaluate(() => window.__monopoly.controller.net.mySeat);

console.log('\n▸ 2. Bình luận viên: cả bàn cùng một lời');
await D.evaluate(() => window.__monopoly.controller.moment('rentBig', { a: 0, b: 1, tile: 39, amount: 800 }));
const texts = [];
for (const p of pages) {
  await until(async () => p.evaluate(() => !!document.querySelector('#commentator.show')), 6000);
  texts.push(await p.evaluate(() => document.querySelector('#commentator .blv-text')?.textContent ?? ''));
}
ok(texts.every((t) => t && t === texts[0]), 'ba máy hiện đúng một câu bình luận', texts[0]);

console.log('\n▸ 3. Hồn ma ở máy khác');
const dSeat = await seatOf(D);
const G = (await Promise.all(pages.map(async (p) => [p, await seatOf(p)])))
  .find(([, s]) => s !== dSeat)[0];
const gSeat = await seatOf(G);
ok(!(await G.locator('#hex-btn').isVisible()), 'còn sống thì không có nút ám quẻ');
await D.evaluate((seat) => {
  const c = window.__monopoly.controller;
  c.state.bankrupt(seat);
  c.hud.refresh();
  c.sync();
}, gSeat);
await G.bringToFront();
ok(await until(async () => G.locator('#hex-btn').isVisible(), 8000), 'máy người phá sản hiện nút ám quẻ');
const target = dSeat;
await G.locator('#hex-btn').click();
await G.locator(`.hex-target[data-seat="${target}"]`).click();
await D.bringToFront();
ok(await until(async () => D.evaluate(() => !!document.querySelector('.hex-mark')), 6000), 'quẻ hiện sang máy người bị ám');

const vote = D.evaluate(async () => {
  const c = window.__monopoly.controller;
  c.state.eventsFired = 0;
  const card = await c.events.pickCard();
  return { id: card?.id, voted: c.events.voted };
});
await G.bringToFront();
const cardOk = await until(async () => (await G.locator('.scrim.show .ghost-card').count()) === 2, 15000);
ok(cardOk, 'hội đồng hồn ma hiện hai lá ở máy người phá sản');
const pickId = cardOk ? await G.locator('.scrim.show .ghost-card').nth(1).getAttribute('data-id') : null;
if (cardOk) await G.locator('.scrim.show .ghost-card').nth(1).click();
const res = await vote;
ok(res.voted && res.id === pickId, 'lá hồn ma bầu là lá máy cầm lái cho nổ', `${pickId} → ${res.id}`);

ok(errors.length === 0, 'không lỗi trang', errors.slice(0, 3).join(' | '));
await browser.close();
if (fails.length) {
  console.log(`\n${fails.length} lỗi`);
  process.exit(1);
}
console.log('\nVui nhộn nhiều máy: ổn.');
