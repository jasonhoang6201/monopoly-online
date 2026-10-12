/**
 * Video Hội Đồng Hồn Ma cho Jason xem — không phải bài kiểm thử.
 *
 * Ván một máy, bốn người, hai người đã phá sản. Mỗi chủ đề quay một đoạn:
 *   1. thanh Thời Cuộc qua 70% → hộp bầu hiện, hai hồn ma lần lượt bầu
 *   2. để thanh thời gian chạy hết, hộp tự đóng
 *   3. ép nổ → thẻ được bầu ra, mặt thẻ ghi "Hội Đồng Hồn Ma bầu thẻ này",
 *      và phiên họp cho lần nổ sau mở ngay sau đó
 * Đoạn quay có nâng `perVote` lên thật cao để thẻ được bầu chắc chắn ra; luật
 * thật thì một phiếu chỉ cho 60%.
 *
 *   BASE=http://localhost:5188 node tests/demo-ghost.mjs   → test-result/ghost/
 *
 * Cần dev server và ffmpeg trong PATH.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, readdirSync } from 'node:fs';
import { launchChrome } from './launch.mjs';
import { playRollOff } from './rolloff.mjs';

const BASE = process.env.BASE ?? 'http://localhost:5178';
const OUT = 'test-result/ghost';
const RAW = `${OUT}/raw`;
rmSync(OUT, { recursive: true, force: true });
mkdirSync(RAW, { recursive: true });

const browser = await launchChrome();
const errors = [];
const VIEW = { width: 1280, height: 760 };

/** Thẻ dễ diễn trong video: không mở hộp hỏi ai. */
const EASY = ['hoi-cho', 'quy-cong-phat-chan', 'lam-phat', 'mo-duong', 'mat-mua', 'bao-gia', 'trang-mau', 'thue-dien-tho', 'thue-khu'];

async function clickFoot(page, ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const b = page.locator('#modal-root .scrim.show .modal-foot button.btn:not([disabled])').first();
    if (await b.count()) { await b.click({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(500); continue; }
    const busy = await page.evaluate(() => window.__monopoly.controller.busy);
    if (!busy) return;
    await page.waitForTimeout(300);
  }
}

async function scene(theme) {
  const dir = `${RAW}/${theme}`;
  const ctx = await browser.newContext({ viewport: VIEW, recordVideo: { dir, size: VIEW } });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${theme}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${theme}] ${e.message}`));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const solo = page.locator('.scrim.show button.btn', { hasText: 'Chơi trên một máy' });
  await solo.waitFor({ timeout: 30000 });
  await solo.click();
  await page.waitForTimeout(1800);
  await page.locator('.count-btn[data-n="4"]').click();
  const names = ['Ba Tư', 'Cô Hai', 'Chú Sáu', 'Dì Bảy'];
  for (let i = 0; i < 4; i++) await page.locator('#name-list input').nth(i).fill(names[i]);
  if (theme !== 'default') await page.selectOption('[data-theme-pick]', theme);
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Khai cuộc' }).click();
  await page.waitForTimeout(2600);
  await playRollOff(page);
  await page.waitForTimeout(600);

  // Thế cờ: hai người phá sản, bàn đã có chủ đất và nhà, thanh Thời Cuộc 77%
  await page.evaluate(async () => {
    const c = window.__monopoly.controller;
    const s = c.state;
    const { GHOST_VOTE } = await import('/src/data/events.js');
    GHOST_VOTE.perVote = 1000;
    const [a, b, g1, g2] = s.players;
    for (const id of [1, 3, 6, 8, 9]) s.owner.set(id, a.id);
    for (const id of [16, 18, 19, 21, 23]) s.owner.set(id, b.id);
    s.houses.set(6, 2); s.houses.set(8, 2); s.houses.set(9, 2);
    s.houses.set(16, 1); s.houses.set(18, 1); s.houses.set(19, 1);
    s.bankHouses -= 9;
    s.bankrupt(g1.id); s.bankrupt(g2.id);
    s.turn = a.id;
    s.laps = 6;
    s.pressure = 10;
    s.dryTurn = false;   // lượt khô cộng thêm điểm, đẩy thẳng qua ngưỡng nổ
    c.hud.refresh(); c.scene.refresh(s); c.scene.placeTokens(); c.restoreActions?.();
  });
  await page.waitForTimeout(1500);

  // Hết lượt → hộp bầu hiện
  await page.evaluate(() => { const c = window.__monopoly.controller; c.guard(() => c.endTurn()); });
  await page.locator('.gc-layer.show').waitFor({ timeout: 10000 });
  await page.waitForTimeout(2000);
  const ids = await page.locator('.gc-card').evaluateAll((els) => els.map((e) => e.dataset.id));
  const pickIdx = Math.max(0, ids.findIndex((id) => ['hoi-cho', 'quy-cong-phat-chan', 'lam-phat', 'mo-duong'].includes(id)));
  const easyIdx = ids.findIndex((id) => EASY.includes(id));
  const target = easyIdx >= 0 ? easyIdx : pickIdx;
  const other = (target + 1) % ids.length;
  // Hồn ma thứ nhất bầu một thẻ, hồn ma thứ hai bầu cùng thẻ ấy, rồi đổi ý một lần cho thấy bầu lại được
  await page.locator('.gc-card').nth(other).hover();
  await page.waitForTimeout(700);
  await page.locator('.gc-card').nth(target).click();
  await page.waitForTimeout(1600);
  await page.locator('.gc-card').nth(other).click();
  await page.waitForTimeout(1500);
  await page.locator('.gc-seat').nth(1).click();
  await page.waitForTimeout(500);
  await page.locator('.gc-card').nth(target).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/hop-bau-${theme}.png` });
  // Để đồng hồ chạy hết: hộp tự đóng
  await page.locator('#ghost-council').waitFor({ state: 'detached', timeout: 15000 });
  await page.waitForTimeout(1200);
  await clickFoot(page, 5000);

  // Ép nổ: thẻ được bầu ra
  await page.evaluate(() => {
    const c = window.__monopoly.controller;
    const s = c.state;
    if (s.players[s.turn].bankrupt) s.turn = 0;
    s.pressure = 999;
    c.guard(() => c.endTurn());
  });
  await page.locator('.ev-ghost').waitFor({ timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${OUT}/the-ra-${theme}.png` });
  // Phiên họp cho lần nổ sau mở ngay sau khi thẻ thi hành xong
  await page.locator('.gc-layer.show').waitFor({ timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(3500);
  await page.locator('#ghost-council').waitFor({ state: 'detached', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(800);

  const video = page.video();
  await ctx.close();
  return video.path();
}

const clips = [];
for (const theme of ['default', 'halloween', 'christmas']) {
  console.log('quay', theme);
  clips.push(await scene(theme));
}

// Ảnh màn ngang điện thoại
{
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.locator('.scrim.show button.btn', { hasText: 'Chơi trên một máy' }).click();
  await page.waitForTimeout(1800);
  await page.locator('.count-btn[data-n="3"]').click();
  await page.getByRole('button', { name: 'Khai cuộc' }).click();
  await page.waitForTimeout(2600);
  await playRollOff(page);
  await page.evaluate(async () => {
    const c = window.__monopoly.controller;
    const s = c.state;
    s.bankrupt(2);
    s.laps = 6;
    c.ghosts.onCall({ n: 0, cards: ['dong-dat', 'hoi-cho', 'lam-phat'], ms: 10000 });
  });
  await page.waitForTimeout(1500);
  await page.locator('.gc-card').nth(1).click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/hop-bau-dien-thoai.png` });
  await ctx.close();
}

await browser.close();

// Ghép ba đoạn, cắt phần vào ván ở đầu mỗi đoạn
const parts = [];
for (const [i, src] of clips.entries()) {
  const out = `${RAW}/p${i}.mp4`;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '9', '-i', src,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-r', '30', out]);
  parts.push(out);
}
const list = `${RAW}/list.txt`;
execFileSync('sh', ['-c', `printf "file '%s'\\n" ${parts.map((p) => `'${p.split('/').pop()}'`).join(' ')} > ${list}`]);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list,
  '-c', 'copy', '-movflags', '+faststart', `${OUT}/hoi-dong-hon-ma.mp4`]);
console.log('  ✓', `${OUT}/hoi-dong-hon-ma.mp4`, readdirSync(OUT));
console.log('Lỗi console:', errors.length ? errors : 'không có');
