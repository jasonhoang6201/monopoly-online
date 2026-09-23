/**
 * Hoạt cảnh ô đất (`render/tileFx.js`): xây nhà, thế chấp, chuộc lại tự chạy
 * khi `refresh` thấy trạng thái đổi; động đất và hoả hoạn chạy khi controller
 * gọi `tileFx`. Kiểm:
 *   - lần `refresh` đầu (vào ván) không diễn gì;
 *   - mỗi thay đổi đúng một hoạt cảnh, trên đúng ô;
 *   - đổi chủ (giao dịch) thì không diễn;
 *   - xong hoạt cảnh thì texture tạm bị gỡ, vệt đèn và lớp thế chấp về độ hiện 1;
 *   - ô ở cả bốn cạnh chạy được, không lỗi console.
 *
 * `node tests/tile-fx.mjs --video` quay thêm mỗi hoạt cảnh thành một video mp4
 * riêng (cắt quanh ô, cần `ffmpeg`), lưu ở `test-result/tile-fx/`.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, readdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { launchChrome } from './launch.mjs';
import { playRollOff } from './rolloff.mjs';

const VIDEO = process.argv.includes('--video');
const OUT = join(import.meta.dirname, '..', 'test-result', 'tile-fx');
const RAW = join(OUT, 'raw');
const errors = [];
let fails = 0;
const log = (...a) => console.log(...a);
const check = (ok, msg) => { log(`  ${ok ? '✓' : '✗'} ${msg}`); if (!ok) fails++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

rmSync(OUT, { recursive: true, force: true });
mkdirSync(VIDEO ? RAW : OUT, { recursive: true });

const browser = await launchChrome();
const W = 1600, H = 1000;
const context = await browser.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: 1,
  ...(VIDEO ? { recordVideo: { dir: RAW, size: { width: W, height: H } } } : {}),
});
const t0 = Date.now();
const page = await context.newPage();
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto('http://localhost:5178/', { waitUntil: 'networkidle' });
const soloBtn = page.locator('.scrim.show button.btn', { hasText: 'Chơi trên một máy' });
await soloBtn.waitFor({ timeout: 30000 });
await soloBtn.click();
await page.waitForTimeout(2200);
await page.locator('.count-btn[data-n="3"]').click();
await page.getByRole('button', { name: 'Khai cuộc' }).click();
await page.waitForTimeout(3200);
await playRollOff(page);
await page.waitForTimeout(600);

/** Số hoạt cảnh đang chạy và loại của chúng. */
const runs = () => page.evaluate(() => {
  const sc = window.__monopoly.controller.scene;
  return [...sc.fxRuns.values()].map((r) => r.id);
});
const leftovers = () => page.evaluate(() => {
  const sc = window.__monopoly.controller.scene;
  return {
    runs: sc.fxRuns.size,
    textures: sc.textures.getTextureKeys().filter((k) => k.startsWith('tilefx-')).length,
    glow: sc.glowVis.size,
    mort: sc.mortVis.size,
  };
});

/** Khung cắt video quanh ô, theo điểm ảnh CSS, lệch về phía lòng bàn cờ. */
const cropFor = (id) => page.evaluate((tid) => {
  const sc = window.__monopoly.controller.scene;
  const rect = sc.game.canvas.getBoundingClientRect();
  const k = rect.width / sc.game.canvas.width;
  const q = sc.tileQuad(tid);
  const xs = q.map((p) => rect.left + p.x * k), ys = q.map((p) => rect.top + p.y * k);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}, id);

const clips = [];
/**
 * Chạy một bước dựng hoạt cảnh, chờ nó hết, ghi lại mốc thời gian để cắt video.
 * @param {string} name tên file video
 * @param {number} id ô cần quay
 * @param {Function} act hàm chạy trong trang
 * @param {number} dur độ dài hoạt cảnh (giây)
 */
async function scene(name, id, act, dur) {
  const start = (Date.now() - t0) / 1000;
  await page.evaluate(act, id);
  const live = await runs();
  await wait(dur * 1000 + 700);
  clips.push({ name, id, start, dur, box: await cropFor(id) });
  return live;
}

const seed = () => page.evaluate(() => {
  const c = window.__monopoly.controller;
  const s = c.state;
  // Dãy dưới: đọc xuôi chữ, nên quay video ở đây
  for (const id of [1, 3]) s.owner.set(id, 0);
  for (const id of [6, 8, 9]) s.owner.set(id, 1);
  for (const id of [16, 18, 19]) s.owner.set(id, 2);
  for (const id of [26, 27, 29]) s.owner.set(id, 0);
  s.houses.set(6, 3); s.houses.set(8, 3); s.houses.set(9, 2);
  s.mortgaged.add(1);
  c.hud.refresh(); c.scene.refresh(s);
});

log('\n=== Mốc: vào ván không diễn gì ===');
await page.evaluate(() => {
  const c = window.__monopoly.controller;
  // Làm như vừa vào lại phòng: đối tượng trạng thái mới, mọi ô "mới xuất hiện"
  c.scene.fxState = null;
});
await seed();
check((await runs()).length === 0, 'refresh đầu tiên sau khi nạp ván không chạy hoạt cảnh');
await wait(400);

log('\n=== Xây nhà ===');
let live = await scene('1-xay-nha', 9, (id) => {
  const c = window.__monopoly.controller;
  c.state.houses.set(id, c.state.housesOn(id) + 1);
  c.scene.refresh(c.state);
}, 1.35);
check(live.length === 1 && live[0] === 9, `một hoạt cảnh trên ô 9 (thấy: ${JSON.stringify(live)})`);

log('\n=== Động đất ===');
live = await scene('2-dong-dat', 6, (id) => {
  const c = window.__monopoly.controller;
  c.state.demolish(id);
  c.scene.refresh(c.state);
  c.tileFx('quake', [id]);
}, 2.2);
check(live.length === 1 && live[0] === 6, `refresh sau khi dỡ nhà không tự diễn; tileFx diễn đúng ô 6 (thấy: ${JSON.stringify(live)})`);

log('\n=== Hoả hoạn ===');
live = await scene('3-hoa-hoan', 8, (id) => {
  const c = window.__monopoly.controller;
  c.state.demolish(id);
  c.scene.refresh(c.state);
  c.tileFx('fire', [id]);
}, 2.3);
check(live.length === 1 && live[0] === 8, `hoả hoạn chạy trên ô 8 (thấy: ${JSON.stringify(live)})`);

log('\n=== Thế chấp ===');
live = await scene('4-the-chap', 3, (id) => {
  const c = window.__monopoly.controller;
  c.state.mortgaged.add(id);
  c.scene.refresh(c.state);
}, 1.45);
check(live.length === 1 && live[0] === 3, `thế chấp chạy trên ô 3 (thấy: ${JSON.stringify(live)})`);
const tagShown = await page.evaluate(() => {
  const p = window.__monopoly.controller.scene.mortParts.get(3);
  return p ? { tag: p.tag.alpha, gray: p.gray.map((g) => g.alpha) } : null;
});
check(tagShown && tagShown.tag === 1 && tagShown.gray.every((a) => a === 1),
  `xong hoạt cảnh thì ô xám và nhãn đỏ hiện đủ (${JSON.stringify(tagShown)})`);

log('\n=== Chuộc lại ===');
live = await scene('5-chuoc-lai', 1, (id) => {
  const c = window.__monopoly.controller;
  c.state.mortgaged.delete(id);
  c.scene.refresh(c.state);
}, 1.3);
check(live.length === 1 && live[0] === 1, `chuộc lại chạy trên ô 1 (thấy: ${JSON.stringify(live)})`);

log('\n=== Đổi chủ không diễn ===');
await page.evaluate(() => {
  const c = window.__monopoly.controller;
  c.state.owner.set(9, 2);          // ô có nhà sang tay người khác
  c.state.owner.set(3, 1);          // ô thế chấp sang tay người khác
  c.scene.refresh(c.state);
});
check((await runs()).length === 0, 'giao dịch ô có nhà / ô thế chấp không chạy hoạt cảnh');

log('\n=== Bốn cạnh ===');
await page.evaluate(() => {
  const c = window.__monopoly.controller;
  const s = c.state;
  s.houses.set(16, 1); s.houses.set(18, 1); s.houses.set(19, 1);   // cạnh trái
  s.mortgaged.add(27);                                            // cạnh trên
  s.owner.set(37, 1); s.owner.set(39, 1);
  c.scene.refresh(s);
  s.mortgaged.add(37);                                            // cạnh phải
  c.scene.refresh(s);
});
await wait(700);
await page.screenshot({ path: join(OUT, 'bon-canh.png') }).catch(() => {});
check((await runs()).length === 5, `5 hoạt cảnh chạy cùng lúc ở ba cạnh còn lại (thấy: ${(await runs()).length})`);
await wait(1400);

log('\n=== Dọn dẹp ===');
const left = await leftovers();
check(left.runs === 0 && left.textures === 0 && left.glow === 0 && left.mort === 0,
  `không còn hoạt cảnh, texture tạm, độ hiện treo (${JSON.stringify(left)})`);

await context.close();
await browser.close();

if (VIDEO) {
  const raw = readdirSync(RAW).find((f) => f.endsWith('.webm'));
  const src = join(RAW, raw);
  for (const c of clips) {
    const tw = c.box.x1 - c.box.x0, th = c.box.y1 - c.box.y0;
    const unit = Math.min(tw, th);          // bề ngang ô, ô dãy dưới nằm dọc
    const w = Math.round(unit * 5.2 / 2) * 2, h = Math.round(unit * 4.6 / 2) * 2;
    const cx = (c.box.x0 + c.box.x1) / 2;
    // Hoạt cảnh tràn vào phía lòng bàn cờ (phía trên với dãy dưới)
    const x = Math.max(0, Math.round(cx - w / 2));
    const y = Math.max(0, Math.min(H - h, Math.round(c.box.y1 + unit * 0.5 - h)));
    const out = join(OUT, `${c.name}.mp4`);
    execFileSync('ffmpeg', [
      '-y', '-loglevel', 'error',
      '-ss', (c.start - 0.3).toFixed(2), '-t', (c.dur + 0.9).toFixed(2),
      '-i', src,
      '-vf', `crop=${w}:${h}:${x}:${y},scale=${w * 2}:${h * 2}:flags=lanczos,fps=30`,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', out,
    ]);
    log(`  video: ${out}`);
  }
  renameSync(src, join(OUT, 'toan-bo.webm'));
  rmSync(RAW, { recursive: true, force: true });
}

if (errors.length) { log('\nLỖI:\n' + errors.join('\n')); fails++; }
log(fails ? `\n✗ ${fails} mục hỏng` : '\n✓ Hoạt cảnh ô đất ổn');
process.exit(fails ? 1 : 0);
