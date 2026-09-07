/**
 * Quay lại hoạt cảnh **bốc thăm giải toả** để xem bằng mắt: bàn cờ sáng lần
 * lượt qua từng lô đất trống, chậm dần rồi dừng hẳn ở lô trúng.
 *
 * Không phải bài kiểm thử — chỉ dựng sẵn một bàn nhiều lô trống rồi bấm thẻ,
 * xuất ra một đoạn video và một loạt khung hình trong `tests/out/spin-demo/`.
 *
 * Cần dev server đang chạy ở cổng 5178.  Chạy: `npm run demo:spin`
 */
import fs from 'node:fs';
import { launchChrome } from './launch.mjs';
import { playRollOff } from './rolloff.mjs';

const OUT = new URL('./out/spin-demo/', import.meta.url).pathname;
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const browser = await launchChrome();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 820 },
  recordVideo: { dir: OUT, size: { width: 1280, height: 820 } },
});
const page = await ctx.newPage();

await page.goto('http://localhost:5178/', { waitUntil: 'networkidle' });
await page.locator('.scrim.show button.btn', { hasText: 'Chơi trên một máy' }).click();
await page.waitForTimeout(1600);
await page.locator('.count-btn[data-n="3"]').click();
await page.locator('.rule-btn[data-lv="off"]').click();
await page.getByRole('button', { name: 'Khai cuộc' }).click();
await page.waitForTimeout(2600);
await playRollOff(page);
await page.waitForFunction(() => !window.__monopoly.controller.busy, null, { timeout: 25000 });

// Dựng bàn: mười lô đất trống rải khắp bốn cạnh, để vòng quay chạy thấy rõ
const lots = await page.evaluate(() => {
  const c = window.__monopoly.controller;
  const st = c.state;
  const seat = st.turn;
  const other = st.players.find((p) => p.id !== seat && !p.bankrupt).id;
  st.houses.clear();
  st.owner.clear();
  st.mortgaged.clear();
  while (st.players[seat].cards.length) st.dropCard(seat);

  const ids = [1, 6, 8, 11, 14, 16, 19, 24, 27, 32, 35, 37];
  ids.forEach((id, i) => st.owner.set(id, i % 2 ? seat : other));
  st.players.forEach((p) => { p.money = 3000; });
  c.hud.refresh();
  c.scene.refresh(st);

  // Cất thẳng thẻ giải toả bốc thăm vào túi rồi mở túi ra dùng
  const i = st.decks.chest.cards.findIndex((x) => x.type === 'resume-random');
  st.takeCard(seat, 'chest', i);
  c.restoreActions();
  return ids;
});
console.log(`Bốc thăm giữa ${lots.length} lô: ${lots.join(', ')}`);

await page.locator('#actions button', { hasText: 'Túi thẻ' }).click();
await page.waitForTimeout(700);
await page.locator('.bag-use:not([disabled])').first().click();

// Ghi lại từng khung hình trong lúc quay
const spin = [];
await page.evaluate(() => {
  const sc = window.__monopoly.controller.scene;
  window.__spin = [];
  const orig = sc.coverTile.bind(sc);
  sc.coverTile = (rect, id) => {
    if (rect === sc.spinGfx) window.__spin.push(id);
    return orig(rect, id);
  };
});
for (let i = 0; i < 26; i++) {
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}frame-${String(i).padStart(2, '0')}.png` });
  spin.push(...(await page.evaluate(() => window.__spin.splice(0))));
}

console.log(`Vòng quay đi qua ${spin.length} nhịp, dừng ở ô ${spin.at(-1)}`);
await page.waitForTimeout(1200);
await ctx.close();
await browser.close();

// Playwright đặt tên video bằng chuỗi băm — đổi lại cho dễ tìm
const video = fs.readdirSync(OUT).find((f) => f.endsWith('.webm'));
if (video && video !== 'quay-so.webm') fs.renameSync(`${OUT}${video}`, `${OUT}quay-so.webm`);
console.log(`\nVideo:      ${OUT}quay-so.webm`);
console.log(`Khung hình: ${OUT}frame-*.png`);
