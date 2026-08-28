/**
 * Ảnh chụp màn hình cho hai thay đổi giao diện:
 *   1. Bảng "Quản lý tài sản" dựng thành thẻ hai cột theo màu ô.
 *   2. Bàn cờ không còn dựng nóc nhà lên mặt ô — mép trong ô sáng lên theo
 *      màu chủ đất, rê chuột vào thì bảng nhà trồi lên.
 *
 * Chạy:  node tests/visual.mjs          (cần dev server ở PORT, mặc định 5178)
 * Kết quả: test-result/*.png + test-result/video/*.webm
 */
import { chromium } from 'playwright';
import { mkdirSync, rmSync, readdirSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'test-result');
const VIDEO = join(OUT, 'video');
const URL = process.env.URL ?? 'http://localhost:5178/';

rmSync(OUT, { recursive: true, force: true });
mkdirSync(VIDEO, { recursive: true });

const errors = [];
const log = (...a) => console.log(...a);
let step = 0;
const shot = async (page, name, opts) => {
  const file = `${String(++step).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: join(OUT, file), ...opts });
  log('  📸', file);
};

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 2,
  recordVideo: { dir: VIDEO, size: { width: 1600, height: 1000 } },
});
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}\n  ${(e.stack || '').split('\n')[1]}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`); });

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

/* ------------------------------------------------------------ bày bàn */
await page.locator('.count-btn[data-n="4"]').click();
await page.waitForTimeout(200);
for (const [i, n] of ['Bảy Viễn', 'Cô Ba Trà', 'Chú Hoả', 'Bà Từ'].entries()) {
  await page.locator('#name-list input').nth(i).fill(n);
}
await page.getByRole('button', { name: 'Khai cuộc' }).click();
await page.waitForTimeout(3200);

/* Dựng sẵn một thế cờ có đủ: nhà 1→4 căn, khách sạn, ô thế chấp, và có ô
   ở cả bốn cạnh bàn cờ để soi hướng trồi lên của bảng nhà. */
await page.evaluate(() => {
  const c = window.__monopoly.controller, s = c.state;
  const own = {
    0: [1, 3, 5, 6, 8, 9],
    1: [11, 13, 14, 15, 25],
    2: [21, 23, 24, 12],
    3: [31, 32, 34, 37, 39, 26],
  };
  for (const [pid, ids] of Object.entries(own)) for (const id of ids) s.owner.set(id, +pid);
  const houses = {
    6: 4, 8: 3, 9: 5,
    11: 1, 13: 2, 14: 3,
    21: 2, 23: 4, 24: 5,
    31: 3, 32: 1, 37: 2,
  };
  for (const [id, n] of Object.entries(houses)) s.houses.set(+id, n);
  /* Đang thế chấp: một ô đất và một bến tàu của người tới lượt (để bảng quản lý
     bày ra nút chuộc), thêm một ô của người khác để soi trên mặt bàn cờ.
     Bến Nghé (1 · 3) cố ý để trống nhà — có nhà thì luật không cho thế chấp. */
  for (const id of [3, 5, 26]) s.mortgaged.add(id);
  s.bankHouses = 32 - 25;
  s.bankHotels = 12 - 2;
  s.players[0].money = 1860;
  s.players[1].money = 740;
  s.players[2].money = 1120;
  s.players[3].money = 430;
  c.hud.refresh();
  c.scene.refresh(s);
});
await page.waitForTimeout(900);

/* Tâm một ô, quy về điểm ảnh CSS — dò ngược bằng chính scene.tileAt() nên
   không phải chép lại công thức hình học của bàn cờ vào đây. */
const tilePoint = (id) => page.evaluate((tid) => {
  const s = window.__monopoly.scene, D = window.__monopoly.DPR;
  let sx = 0, sy = 0, n = 0;
  for (let y = s.originY; y < s.originY + s.size; y += 3) {
    for (let x = s.originX; x < s.originX + s.size; x += 3) {
      if (s.tileAt(x, y) === tid) { sx += x; sy += y; n++; }
    }
  }
  return n ? { x: sx / n / D, y: sy / n / D } : null;
}, id);

log('\n=== BÀN CỜ ===');
await shot(page, 'ban-co-den-mau-chu-dat');

const board = await page.evaluate(() => {
  const s = window.__monopoly.scene, D = window.__monopoly.DPR;
  return {
    x: s.originX / D, y: s.originY / D, w: s.size / D, h: s.size / D,
  };
});
// Cận cảnh hàng dưới: thấy rõ vệt đèn nằm ở mép trong của ô
await shot(page, 'ban-co-can-canh-hang-duoi', {
  clip: { x: board.x, y: board.y + board.h * 0.62, width: board.w, height: board.h * 0.38 },
});

log('\n=== RÊ CHUỘT: BẢNG NHÀ TRỒI LÊN (đủ 4 cạnh bàn cờ) ===');
const hovers = [
  [9, 'hang-duoi-khach-san'],
  [14, 'cot-trai-3-nha'],
  [23, 'hang-tren-4-nha'],
  [37, 'cot-phai-2-nha'],
];
for (const [id, name] of hovers) {
  const p = await tilePoint(id);
  await page.mouse.move(p.x, p.y, { steps: 12 });
  await page.waitForTimeout(650);          // chờ bảng trồi hết đà
  await shot(page, `re-chuot-o${id}-${name}`);
}

// Cận cảnh: ô hàng ngang thì khoang nhà nằm ngang, ô cột dọc thì nằm dọc
const p23 = await tilePoint(23);
await page.mouse.move(p23.x, p23.y, { steps: 8 });
await page.waitForTimeout(650);
await shot(page, 'khoang-nha-hang-ngang-can-canh', {
  clip: { x: board.x, y: board.y, width: board.w, height: board.h * 0.34 },
});
await shot(page, 'xem-nhanh-cot-trai', { clip: { x: 0, y: 0, width: 300, height: 1000 } });

const p14 = await tilePoint(14);
await page.mouse.move(p14.x, p14.y, { steps: 8 });
await page.waitForTimeout(650);
await shot(page, 'khoang-nha-cot-doc-can-canh', {
  clip: { x: board.x, y: board.y + board.h * 0.2, width: board.w * 0.36, height: board.h * 0.6 },
});

// Ô đang thế chấp thì không có nhà, nên rê vào cũng không có khoang nào
const p3 = await tilePoint(3);
await page.mouse.move(p3.x, p3.y, { steps: 8 });
await page.waitForTimeout(600);
log('  ô 3 đang thế chấp — có khoang nhà?',
  await page.evaluate(() => !!window.__monopoly.scene.plaque));
await shot(page, 're-chuot-o-dang-the-chap');

// Rời bàn cờ: bảng phải tự thu lại
await page.mouse.move(150, 500, { steps: 8 });
await page.waitForTimeout(450);
await shot(page, 'roi-chuot-bang-thu-lai');

log('\n=== QUẢN LÝ TÀI SẢN ===');
await page.getByRole('button', { name: /Quản lý tài sản/ }).click();
await page.waitForTimeout(800);
await shot(page, 'quan-ly-tai-san');

const mg = await page.evaluate(() => {
  const g = document.querySelector('.mg-grid');
  if (!g) return null;
  const cards = [...g.querySelectorAll('.mg-card')];
  const cols = new Set(cards.map((c) => Math.round(c.getBoundingClientRect().left)));
  return {
    soThe: cards.length,
    soCot: cols.size,
    coTieuDeNhom: g.querySelectorAll('.asset-group-head').length,
    coHinhNha: g.querySelectorAll('.gi-house').length,
    coHinhKhachSan: g.querySelectorAll('.gi-hotel').length,
    mauThe: cards.slice(0, 4).map((c) => c.style.getPropertyValue('--tile')),
  };
});
log('  ', JSON.stringify(mg));

log('\n=== ĐẤT ĐANG THẾ CHẤP: THẺ MỜ ĐI, NÚT ĐỔI THÀNH CHUỘC ===');
const readMortgaged = () => page.evaluate(() => {
  const cards = [...document.querySelectorAll('.mg-card')];
  const m = cards.filter((c) => c.classList.contains('is-mortgaged'));
  const btn = (c, act) => {
    const b = c.querySelector(`[data-act="${act}"]`);
    return b ? { chuThich: b.title, khoa: b.disabled } : null;
  };
  return {
    dangTheChap: m.map((c) => c.querySelector('.mg-name').textContent.trim()),
    nhan: m.map((c) => c.querySelector('.mg-flag')?.textContent.trim() ?? null),
    tienChuoc: m.map((c) => [...c.querySelectorAll('.mg-fig')]
      .map((f) => f.textContent.trim()).find((t) => t.startsWith('Tiền chuộc')) ?? null),
    nutChuoc: m.map((c) => btn(c, 'redeem')),
    // Ô đang cầm thì không được cầm tiếp — nút thế chấp phải biến mất hẳn
    conNutTheChap: m.filter((c) => c.querySelector('[data-act="mortgage"]')).length,
    // Ô chưa cầm thì ngược lại: có nút thế chấp, không có nút chuộc
    binhThuongConNutTheChap: cards.filter((c) => !c.classList.contains('is-mortgaged')
      && c.querySelector('[data-act="mortgage"]')).length,
  };
});
log('  ', JSON.stringify(await readMortgaged(), null, 1));

// Cận cảnh riêng thẻ đang thế chấp
const mortCard = page.locator('.mg-card.is-mortgaged').first();
const box = await mortCard.boundingBox();
await shot(page, 'the-dang-the-chap-can-canh', {
  clip: { x: box.x - 10, y: box.y - 10, width: box.width + 20, height: box.height + 20 },
});

// Bấm chuộc — thẻ phải sáng lại, nút đổi về thế chấp, tiền mặt trừ đi cả lãi
const tienTruoc = await page.locator('.modal-sub').first().textContent();
await page.locator('.mg-card.is-mortgaged [data-act="redeem"]:not([disabled])').first().click();
await page.waitForTimeout(800);
log('  trước khi chuộc:', tienTruoc.replace(/\s+/g, ' ').trim());
log('  sau khi chuộc:  ', (await page.locator('.modal-sub').first().textContent()).replace(/\s+/g, ' ').trim());
log('  ', JSON.stringify(await readMortgaged(), null, 1));
await shot(page, 'quan-ly-sau-khi-chuoc');

// Cuộn xuống hết bảng để thấy các nhóm còn lại
await page.locator('.scrim.show .modal-body').evaluate((el) => { el.scrollTop = el.scrollHeight; });
await page.waitForTimeout(500);
await shot(page, 'quan-ly-tai-san-cuoi-bang');

// Xây thêm một căn ngay trong bảng — thẻ phải đếm lại số nhà
const buildBtn = page.locator('.mg-card button[data-act="build"]:not([disabled])').first();
if (await buildBtn.count()) {
  await page.locator('.scrim.show .modal-body').evaluate((el) => { el.scrollTop = 0; });
  await page.waitForTimeout(300);
  await buildBtn.click();
  await page.waitForTimeout(800);
  await shot(page, 'quan-ly-sau-khi-xay-them');
}

await page.getByRole('button', { name: 'Xong' }).click();
await page.waitForTimeout(700);
await shot(page, 'ban-co-sau-khi-xay-them');

log('\n=== BẢNG TÀI SẢN NGƯỜI CHƠI (huy hiệu nhà trên thẻ đất) ===');
await page.locator('.pcard').first().click();
await page.waitForTimeout(900);
await shot(page, 'bang-tai-san-nguoi-choi');
await page.keyboard.press('Escape');
await page.waitForTimeout(600);

log('\n=== CHI TIẾT MỘT Ô (bảng giá thuê dùng cùng bộ hình) ===');
const p9 = await tilePoint(9);
await page.mouse.click(p9.x, p9.y);
await page.waitForTimeout(900);
await shot(page, 'chi-tiet-o-khach-san');
await page.keyboard.press('Escape');
await page.waitForTimeout(600);

log('\n=== CỬA SỔ NHỎ 1180×760 ===');
await page.setViewportSize({ width: 1180, height: 760 });
await page.waitForTimeout(800);
const pSmall = await tilePoint(23);
await page.mouse.move(pSmall.x, pSmall.y, { steps: 8 });
await page.waitForTimeout(700);
await shot(page, 'cua-so-nho-bang-nha');
await page.getByRole('button', { name: /Quản lý tài sản/ }).click();
await page.waitForTimeout(800);
await shot(page, 'cua-so-nho-quan-ly-tai-san');

log('\n=== LỖI JS ===');
log(errors.length ? errors.join('\n') : '  (không có)');

await ctx.close();
await browser.close();

// Đặt lại tên video cho dễ tìm
for (const f of readdirSync(VIDEO)) {
  if (f.endsWith('.webm')) renameSync(join(VIDEO, f), join(VIDEO, 'phien-test.webm'));
}
log(`\n✅ Ảnh & video nằm ở: ${OUT}`);
process.exit(errors.length ? 1 : 0);
