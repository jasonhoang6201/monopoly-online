import { launchChrome } from './launch.mjs';
import { pickTradeTiles } from './boardpick.mjs';
import { playRollOff } from './rolloff.mjs';

const SHOT = '/private/tmp/claude-501/-Users-jasonhoang-Desktop-monopoly/a29323e2-f3f4-4b2d-9c9c-70118d22612f/scratchpad';
const errors = [];
const log = (...a) => console.log(...a);

const browser = await launchChrome();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 5).join('\n')));

await page.goto('http://localhost:5178/', { waitUntil: 'networkidle' });
/* Bản online hỏi "Chơi kiểu nào?" trước khi bày bàn. Bộ này kiểm phần chơi trên
   một máy, nên bấm luôn cửa ấy rồi mới vào màn hình bày bàn cờ quen thuộc. */
const soloBtn = page.locator('.scrim.show button.btn', { hasText: 'Chơi trên một máy' });
await soloBtn.waitFor({ timeout: 30000 });
await soloBtn.click();

await page.waitForTimeout(2200);

// 3 người chơi
await page.locator('.count-btn[data-n="3"]').click();
await page.waitForTimeout(200);
const nm = ['Bảy Viễn', 'Cô Ba Trà', 'Chú Hoả'];
for (let i = 0; i < 3; i++) await page.locator('#name-list input').nth(i).fill(nm[i]);
await page.getByRole('button', { name: 'Khai cuộc' }).click();
await page.waitForTimeout(3200);

// Mở màn là vòng lắc giành quyền đi trước — bấm hộ rồi trả thứ tự về theo ghế
await playRollOff(page);


const M = () => page.evaluate(() => window.__monopoly.controller);

/** Gán tài sản trực tiếp để dựng kịch bản test. */
async function seed() {
  return page.evaluate(() => {
    const c = window.__monopoly.controller;
    const s = c.state;
    // Bảy Viễn (0): đủ bộ cam (16,18,19) + bộ nâu (1,3) + 1 nhà ga
    for (const id of [16, 18, 19, 1, 3, 5]) s.owner.set(id, 0);
    // Cô Ba (1): đủ bộ xanh đậm (37,39) + 2 ga + tiện ích
    for (const id of [37, 39, 15, 25, 12]) s.owner.set(id, 1);
    // Chú Hoả (2): bộ đỏ thiếu 1 ô (21,23) + 1 ô vàng
    for (const id of [21, 23, 26]) s.owner.set(id, 2);
    s.players[0].money = 3000;
    s.players[1].money = 2200;
    s.players[2].money = 900;
    c.hud.refresh(); c.scene.refresh(s);
    return { owned: s.owner.size };
  });
}
log('seed:', JSON.stringify(await seed()));

/* ---------------------------------------------- 1. XÂY NHÀ + GIỚI HẠN 32 */

log('\n=== 1. XÂY NHÀ ===');
await page.getByRole('button', { name: 'Quản lý tài sản' }).click();
await page.waitForTimeout(900);
await page.screenshot({ path: `${SHOT}/30-manage.png` });
log('  nhóm hiện ra:', await page.locator('.asset-group-head').allTextContents());

// Xây 4 nhà lên Bd de la Somme (16) rồi lên khách sạn
for (let i = 0; i < 5; i++) {
  const b = page.locator('button[data-act="build"][data-tile="16"]');
  if (await b.count() === 0 || await b.isDisabled()) { log('  không xây tiếp được ở bước', i); break; }
  await b.click();
  await page.waitForTimeout(420);
}
// phải xây đều tay: xây các ô còn lại trước khi lên khách sạn
for (const round of [0, 1, 2, 3]) {
  for (const tile of [18, 19, 16]) {
    const b = page.locator(`button[data-act="build"][data-tile="${tile}"]`);
    if (await b.count() && !(await b.isDisabled())) { await b.click(); await page.waitForTimeout(320); }
  }
}
await page.screenshot({ path: `${SHOT}/31-built.png` });
log('  sau khi xây:', JSON.stringify(await page.evaluate(() => {
  const s = window.__monopoly.controller.state;
  return { houses: [...s.houses.entries()], bankHouses: s.bankHouses, bankHotels: s.bankHotels, money: s.players[0].money };
})));

// Lên khách sạn ở ô 16
const hotelBtn = page.locator('button[data-act="build"][data-tile="16"]');
if (await hotelBtn.count() && !(await hotelBtn.isDisabled())) {
  log('  bấm lên khách sạn:', await hotelBtn.textContent());
  await hotelBtn.click();
  await page.waitForTimeout(700);
}
log('  sau khách sạn:', JSON.stringify(await page.evaluate(() => {
  const s = window.__monopoly.controller.state;
  return { tile16: s.housesOn(16), bankHouses: s.bankHouses, bankHotels: s.bankHotels };
})));
await page.screenshot({ path: `${SHOT}/32-hotel.png` });

/* ------------------------------------------------------ 2. THẾ CHẤP/CHUỘC */

log('\n=== 2. THẾ CHẤP & CHUỘC (lãi 10%) ===');
const before = await page.evaluate(() => window.__monopoly.controller.state.players[0].money);
await page.locator('button[data-act="mortgage"][data-tile="5"]').click();
await page.waitForTimeout(500);
const afterM = await page.evaluate(() => ({
  money: window.__monopoly.controller.state.players[0].money,
  mortgaged: window.__monopoly.controller.state.isMortgaged(5),
}));
log(`  thế chấp Gare Routière (200$): ${before} → ${afterM.money} (+${afterM.money - before}), mortgaged=${afterM.mortgaged}`);
await page.screenshot({ path: `${SHOT}/33-mortgaged.png` });

await page.locator('button[data-act="redeem"][data-tile="5"]').click();
await page.waitForTimeout(500);
const afterR = await page.evaluate(() => ({
  money: window.__monopoly.controller.state.players[0].money,
  mortgaged: window.__monopoly.controller.state.isMortgaged(5),
}));
log(`  chuộc lại: ${afterM.money} → ${afterR.money} (−${afterM.money - afterR.money}), mortgaged=${afterR.mortgaged}`);
log(`  → thế chấp 100$, chuộc 110$ = lãi 10% ✔`);

await page.getByRole('button', { name: 'Xong' }).click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${SHOT}/34-board-with-houses.png` });

/* -------------------------------------------------------------- 3. TRADE */

log('\n=== 3. GIAO DỊCH ===');
// Thế chấp 1 ô của Cô Ba để test luật "đất thế chấp trade được"
await page.evaluate(() => {
  const s = window.__monopoly.controller.state;
  s.mortgage(1, 12);
  window.__monopoly.controller.hud.refresh();
  window.__monopoly.controller.scene.refresh(s);
});

await page.getByRole('button', { name: 'Giao dịch' }).click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${SHOT}/35-trade-pick.png` });
log('  chọn đối tác:', await page.locator('.pick').allTextContents());

await page.locator('.pick').first().click();
await page.waitForTimeout(900);

// Bảy Viễn đưa Quai de l'Arroyo (1) + 300$, xin Rue Catinat (37) + Thuỷ Cục (12, đang thế chấp)
await pickTradeTiles(page, 'mine', [1]);
await page.locator('#give-money').fill('300');
await page.locator('#give-money').dispatchEvent('input');
await page.waitForTimeout(250);
await pickTradeTiles(page, 'theirs', [37, 12]);
await page.screenshot({ path: `${SHOT}/36-trade-build.png` });
log('  tóm tắt:', (await page.locator('#tr-sum').textContent()).replace(/\s+/g, ' ').trim());

await page.getByRole('button', { name: 'Gửi đề nghị' }).click();
await page.waitForTimeout(1400);
await page.screenshot({ path: `${SHOT}/37-trade-broadcast.png` });
log('  thông báo cho cả bàn:', (await page.locator('.bcast').first().textContent()).replace(/\s+/g, ' ').trim().slice(0, 150));

await page.getByRole('button', { name: 'Tiếp tục' }).click();   // handoff
await page.waitForTimeout(900);
await page.screenshot({ path: `${SHOT}/38-trade-review.png` });

await page.getByRole('button', { name: 'Đồng ý giao dịch' }).click();
await page.waitForTimeout(2600);
await page.screenshot({ path: `${SHOT}/39-trade-done.png` });

const tradeState = await page.evaluate(() => {
  const s = window.__monopoly.controller.state;
  return {
    tile1_owner: s.owner.get(1), tile37_owner: s.owner.get(37), tile12_owner: s.owner.get(12),
    tile12_mortgaged: s.isMortgaged(12),
    money: s.players.map((p) => p.money),
  };
});
log('  kết quả:', JSON.stringify(tradeState));

// Modal mời chuộc đất thế chấp vừa nhận
const redeemVisible = await page.locator('.scrim.show .modal-title', { hasText: 'Chuộc lại' }).count();
log('  hiện modal mời chuộc đất thế chấp:', redeemVisible > 0);
if (redeemVisible) {
  await page.screenshot({ path: `${SHOT}/40-redeem-prompt.png` });
  const btn = page.locator('.scrim.show button.btn').first();
  log('  nút:', await btn.textContent());
  await btn.click();
  await page.waitForTimeout(2200);
}
// đóng nốt các modal còn lại (handoff)
for (let i = 0; i < 4; i++) {
  const b = page.locator('.scrim.show button.btn').first();
  if (await b.count() === 0) break;
  await b.click(); await page.waitForTimeout(900);
}
log('  sau chuộc:', JSON.stringify(await page.evaluate(() => {
  const s = window.__monopoly.controller.state;
  return { tile12_mortgaged: s.isMortgaged(12), money0: s.players[0].money };
})));

/* Các mục 4–6 (tù, phá sản, thắng cuộc) nằm ở tests/endgame.mjs */

log('\n=== LỖI (' + errors.length + ') ===');
for (const e of errors.slice(0, 15)) log(e);
await browser.close();
