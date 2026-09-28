/**
 * Quay video hai máy đặt cạnh nhau cho tính năng học kỹ năng ngoài lượt và
 * công tắc bật / tắt trong kho kỹ năng — để xem UX, không phải bài kiểm thử.
 *
 *   node tests/demo-offturn.mjs   → test-result/videos-offturn/offturn.mp4
 *
 * Trái là máy của Bảy Viễn (đi trước), phải là máy của Cô Ba. Mỗi trang quay
 * một file riêng; ffmpeg cắt phần khai cuộc cho hai file cùng mốc rồi ghép
 * ngang thành một video.
 *
 * Cần dev server ở cổng 5179 và ffmpeg trong PATH.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { launchChrome } from './launch.mjs';
import { playRollOff } from './rolloff.mjs';

const BASE = 'http://localhost:5179/';
const OUT = 'test-result/videos-offturn';
const RAW = `${OUT}/raw`;
const VIEW = { width: 1040, height: 660 };
rmSync(OUT, { recursive: true, force: true });
mkdirSync(RAW, { recursive: true });

const errors = [];
const browser = await launchChrome();
const ctx = await browser.newContext({ viewport: VIEW, recordVideo: { dir: RAW, size: VIEW } });

async function openPage(tag) {
  const t0 = Date.now();
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${tag}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${tag}] ${e.message}`));
  return { page, t0 };
}

async function until(fn, ms = 20000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    if (await fn().catch(() => false)) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

async function toLobby(page) {
  const mode = page.locator('.scrim.show button.btn', { hasText: 'Mở phòng online' });
  await until(async () => (await mode.count()) > 0 || (await page.locator('#lobby-link').count()) > 0, 90000);
  if (await mode.count()) await mode.click();
  await page.locator('#lobby-link').waitFor({ timeout: 30000 });
}

/** Dòng chú thích ở chân màn hình của một máy. */
const cap = (page, text) => page.evaluate((t) => {
  let el = document.getElementById('demo-cap');
  if (!el) {
    el = document.createElement('div');
    el.id = 'demo-cap';
    el.style.cssText = 'position:fixed;bottom:10px;left:50%;transform:translateX(-50%);z-index:999999;'
      + 'pointer-events:none;background:rgba(10,10,10,.85);color:#fff;font:600 17px/1.35 system-ui;'
      + 'padding:7px 14px;border-radius:8px;max-width:92vw;text-align:center';
    document.body.appendChild(el);
  }
  el.textContent = t;
  el.style.display = t ? '' : 'none';
}, text);

/** Ép hai con xí ngầu kế tiếp trên máy đang cầm lái. */
const forceDice = (page, a, b) => page.evaluate(([x, y]) => {
  const orig = Math.__orig || (Math.__orig = Math.random);
  const seq = [(x - 1) / 6 + 0.01, (y - 1) / 6 + 0.01];
  let i = 0;
  Math.random = () => (i < 2 ? seq[i++] : orig());
}, [a, b]);

const btn = (page, key) => page.locator(`#actions button[data-key="${key}"]`);
const pause = (page, ms) => page.waitForTimeout(ms);

/** Bấm qua hộp mua đất / thẻ cho tới khi hết. */
async function drain(page, ms = 5000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    const b = page.locator('#modal-root .scrim.show .modal-foot button',
      { hasText: /Bỏ qua|Không mua|Đóng|Tiếp tục|Đành chịu|Nhận tiền|Lên đường|Cất vào túi/ }).first();
    if (await b.count()) { await pause(page, 900); await b.click().catch(() => {}); }
    await pause(page, 300);
  }
}

/* ------------------------------------------------ mở phòng hai máy */
const A = await openPage('A');
await A.page.goto(BASE, { waitUntil: 'domcontentloaded' });
await toLobby(A.page);
const link = await A.page.locator('#lobby-link').inputValue();
await A.page.locator('.lobby-seat.is-me input.lobby-name').fill('Bảy Viễn');
await A.page.locator('.rule-btn[data-lv="off"]').click();
await A.page.locator('.lobby-seat.is-me .lobby-ready').click();

const B = await openPage('B');
await B.page.goto(link, { waitUntil: 'domcontentloaded' });
await toLobby(B.page);
await B.page.locator('.lobby-seat.is-me input.lobby-name').fill('Cô Ba');
await B.page.locator('.lobby-seat.is-me .lobby-ready').click();

await until(async () => !(await A.page.locator('#lobby-start').isDisabled()));
await A.page.locator('#lobby-start').click();
for (const p of [A.page, B.page]) await until(() => p.evaluate(() => !!window.__monopoly?.controller?.state), 60000);
await playRollOff([A.page, B.page]);
await pause(A.page, 1500);

const a = A.page;
const b = B.page;
// Bảy Viễn (ghế 0) đi trước; Cô Ba có 4 điểm để học ngoài lượt
await a.evaluate(() => {
  const c = window.__monopoly.controller;
  c.state.players[1].skillPoints = 4;
  c.hud.refresh(); c.sync(); c.restoreActions();
});
await pause(a, 1200);
const tStart = Date.now();

/* ------------------------------------------------ 1. máy ngồi xem không còn bảng giữa bàn */
await cap(a, 'Lượt của Bảy Viễn');
await cap(b, 'Chưa tới lượt Cô Ba: giữa bàn không còn bảng "Tới lượt …"');
await pause(a, 2500);
await forceDice(a, 4, 6);
await btn(a, 'r').click();
await cap(b, 'Thông báo của người đang đi hiện rõ, không bị che');
await pause(a, 3500);
await drain(a, 2500);

/* ------------------------------------------------ 2. học ngoài lượt */
await cap(b, 'Nút cây kỹ năng ở hàng tiện ích (góc dưới cột phải), số 4 = điểm chưa dùng');
await b.locator('#skill-btn').hover();
await pause(b, 2800);
await b.locator('#skill-btn').click();
await b.locator('.st-node[data-id="dh1"]').waitFor();
await cap(b, 'Mở cây ngoài lượt: chỉ học và lên level, không có Tẩy điểm');
await pause(b, 2800);

await cap(b, 'Vé Tháng là kỹ năng tự động: học xong có tác dụng ngay');
await b.locator('.st-node[data-id="dh1"]').click();
await pause(b, 2600);
await b.locator('[data-act="learn"]').click();
await pause(b, 1500);
await cap(a, 'Máy Bảy Viễn thấy thông báo Cô Ba vừa học');
await pause(b, 1500);

await cap(b, 'Tàu Tốc Hành là kỹ năng bấm để dùng: học xong nằm tắt');
await b.locator('.st-node[data-id="dh2a"]').click();
await pause(b, 3200);
await b.locator('[data-act="learn"]').click();
await pause(b, 1500);
await b.locator('.st-node[data-id="dh2a"]').click();
await cap(b, 'Ô đang tắt tô xám; ngoài lượt ghi "Bật / tắt trong lượt của bạn"');
await pause(b, 3800);
await b.keyboard.press('Escape');
await pause(b, 600);

await cap(b, 'Học thêm Chẵn Lẻ và Cược Chẵn Lẻ (Cược cũng nằm tắt)');
for (const id of ['dd1', 'dd2a']) {
  await b.locator(`.st-node[data-id="${id}"]`).click();
  await pause(b, 1400);
  await b.locator('[data-act="learn"]').click();
  await pause(b, 1400);
}
await pause(b, 1200);
await b.locator('.st-close').click();
await cap(a, '');
await pause(b, 1500);

/* ------------------------------------------------ 3. trao lượt */
await cap(a, 'Bảy Viễn kết thúc lượt');
await until(async () => (await btn(a, 'e').count()) === 1, 10000);
await btn(a, 'e').click();
await until(() => b.evaluate(() => window.__monopoly.controller.isDriver()), 15000);
await cap(a, 'Máy Bảy Viễn giờ ngồi xem: giữa bàn trống');
await pause(b, 1500);

/* ------------------------------------------------ 4. tới lượt: bật / chọn trong kho, Huỷ rồi Chốt */
const item = (name) => b.locator('.kit-item', { hasText: name });
const topBtn = (text) => b.locator('#modal-root .scrim.show:not(.stashed)').last().locator('.modal-foot button', { hasText: text });
const openKit = async () => {
  await until(async () => (await btn(b, 'u').count()) === 1, 8000);
  await btn(b, 'u').click();
  await b.locator('.kit').waitFor();
};
await cap(b, 'Tới lượt Cô Ba: mở kho "Dùng kỹ năng"');
await pause(b, 2400);
await openKit();
await cap(b, 'Ô xám là đang tắt, ô có màu là đang bật');
await pause(b, 3000);
await item('Tàu Tốc Hành').click();
await cap(b, 'Bấm Tàu Tốc Hành: ô có màu (chỉ trong bản nháp, chưa áp dụng)');
await pause(b, 3000);
await item('Cược Chẵn Lẻ').click();
await b.locator('.sk-bet').waitFor();
await cap(b, 'Bấm Cược Chẵn Lẻ: bảng chọn có "Không", Chẵn / Lẻ và tiền cược');
await pause(b, 3000);
await b.locator('.sk-bet button', { hasText: 'Lẻ' }).first().click();
await pause(b, 700);
await b.locator('.sk-bet [data-row="amount"] button', { hasText: '100$' }).click();
await pause(b, 900);
await topBtn('Xong').click();
await cap(b, 'Chọn xong về lại kho: ô Cược có màu, ghi Lẻ 100$');
await pause(b, 3200);
await cap(b, 'Bấm Huỷ: đóng kho, không đổi gì');
await pause(b, 1800);
await topBtn('Huỷ').click();
await pause(b, 1400);
await openKit();
await cap(b, 'Mở lại: vẫn xám cả hai. Chọn lại rồi bấm Chốt (hoặc Enter)');
await pause(b, 2600);
await item('Tàu Tốc Hành').click();
await pause(b, 900);
await item('Cược Chẵn Lẻ').click();
await b.locator('.sk-bet').waitFor();
await pause(b, 900);
await b.locator('.sk-bet button', { hasText: 'Lẻ' }).first().click();
await pause(b, 600);
await b.locator('.sk-bet [data-row="amount"] button', { hasText: '100$' }).click();
await pause(b, 700);
await topBtn('Xong').click();
await pause(b, 1600);
await topBtn('Chốt').click();
await cap(a, 'Cả bàn được báo một lần: bật hai kỹ năng, cược Lẻ 100$ mỗi lượt');
await pause(b, 3200);
await cap(a, '');

/* ------------------------------------------------ 6. lắc: cược thắng, Tàu Tốc Hành hỏi */
await cap(b, 'Bấm Lắc: tự cược Lẻ 100$. Ra 2 + 3 = 5: trúng, dừng ở bến xe thì Tàu Tốc Hành hỏi đi tiếp');
await until(async () => (await btn(b, 'r').count()) === 1, 8000);
await forceDice(b, 2, 3);
await btn(b, 'r').click();
// Tàu Tốc Hành hỏi sau bước mua ga: bỏ qua mua trước
const skipBuy = b.locator('#modal-root .scrim.show .modal-foot button', { hasText: 'Bỏ qua' });
await skipBuy.waitFor({ timeout: 20000 }).catch(() => {});
await pause(b, 1800);
await skipBuy.click().catch(() => {});
await b.locator('.tile-pick[data-quick]:not(.out)').waitFor({ timeout: 20000 }).catch(() => {});
await pause(b, 3000);
if (await b.locator('.tile-pick[data-quick]:not(.out)').count()) {
  await b.evaluate(() => window.__monopoly.scene.onTileClick(15));
}
await pause(b, 4000);
await drain(b, 3000);
await cap(b, '');
await cap(a, '');
await pause(b, 2000);

/* ------------------------------------------------ ghép video */
const pa = A.page.video();
const pb = B.page.video();
await ctx.close();
await browser.close();
const [va, vb] = [await pa.path(), await pb.path()];
const ssA = ((tStart - A.t0) / 1000).toFixed(2);
const ssB = ((tStart - B.t0) / 1000).toFixed(2);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error',
  '-ss', ssA, '-i', va, '-ss', ssB, '-i', vb,
  '-filter_complex', '[0:v][1:v]hstack=inputs=2:shortest=1[v]', '-map', '[v]',
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', `${OUT}/offturn.mp4`]);
console.log('  ✓', `${OUT}/offturn.mp4`);
if (errors.length) { console.log('Lỗi console:'); for (const e of errors) console.log('  ' + e); }
