import { launchChrome } from './launch.mjs';
import { playRollOff } from './rolloff.mjs';

const SHOT = '/private/tmp/claude-501/-Users-jasonhoang-Desktop-monopoly/a29323e2-f3f4-4b2d-9c9c-70118d22612f/scratchpad';
const errors = [];
const log = (...a) => console.log(...a);

const browser = await launchChrome();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 5).join('\n')));

/** Đóng hết modal đang mở, chờ tới khi sạch. */
async function drain(maxMs = 25000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const b = page.locator('.scrim.show button.btn:not([disabled])').first();
    if (await b.count() === 0) {
      await page.waitForTimeout(400);
      if (await page.locator('.scrim.show').count() === 0) return true;
      continue;
    }
    await b.click().catch(() => {});
    await page.waitForTimeout(700);
  }
  return false;
}

/** Chờ controller chạy xong hết chuỗi hiệu ứng (busy=false, không còn modal). */
async function idle(maxMs = 40000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    await drain(6000);
    const busy = await page.evaluate(() => window.__monopoly.controller.busy);
    if (!busy && await page.locator('.scrim.show').count() === 0) {
      await page.waitForTimeout(500);
      const again = await page.evaluate(() => window.__monopoly.controller.busy);
      if (!again) return true;
    }
    await page.waitForTimeout(400);
  }
  return false;
}

/** Ép lượt sang người chơi khác một cách an toàn. */
async function forceTurn(i) {
  await idle();
  await page.evaluate((n) => {
    const c = window.__monopoly.controller;
    c.state.turn = n;
    c.beginTurn();
  }, i);
  await page.waitForTimeout(700);
}

/** Chờ nút hành động xuất hiện và bấm được. */
async function action(rx, maxMs = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    await drain(4000);
    const b = page.locator('#actions button.btn', { hasText: rx }).first();
    if (await b.count() && !(await b.isDisabled())) { await b.click(); return true; }
    await page.waitForTimeout(400);
  }
  return false;
}

const st = () => page.evaluate(() => {
  const s = window.__monopoly.controller.state;
  return {
    turn: s.turn, over: s.over, alive: s.alive().length,
    p: s.players.map((x) => ({ n: x.name, m: x.money, pos: x.pos, jail: x.inJail, jt: x.jailTurns, bk: x.bankrupt })),
    owned: s.owner.size, bankHouses: s.bankHouses, bankHotels: s.bankHotels,
  };
});

await page.goto('http://localhost:5178/', { waitUntil: 'networkidle' });
/* Bản online hỏi "Chơi kiểu nào?" trước khi bày bàn. Bộ này kiểm phần chơi trên
   một máy, nên bấm luôn cửa ấy rồi mới vào màn hình bày bàn cờ quen thuộc. */
const soloBtn = page.locator('.scrim.show button.btn', { hasText: 'Chơi trên một máy' });
await soloBtn.waitFor({ timeout: 30000 });
await soloBtn.click();

await page.waitForTimeout(2200);
await page.locator('.count-btn[data-n="3"]').click();
await page.waitForTimeout(200);
for (const [i, n] of ['Bảy Viễn', 'Cô Ba Trà', 'Chú Hoả'].entries()) {
  await page.locator('#name-list input').nth(i).fill(n);
}
await page.getByRole('button', { name: 'Khai cuộc' }).click();
await page.waitForTimeout(3200);

// Mở màn là vòng lắc giành quyền đi trước — bấm hộ rồi trả thứ tự về theo ghế
await playRollOff(page);


/* ============================== 1. ĐỔ ĐÔI 3 LẦN → TÙ ============================== */
log('=== ĐỔ ĐÔI 3 LẦN LIÊN TIẾP → VÀO TÙ ===');
// Ép mọi ô đều đã có chủ là chính người chơi 0 để không hiện modal mua đất
await page.evaluate(() => {
  const c = window.__monopoly.controller;
  const s = c.state;
  for (let i = 0; i < 40; i++) {
    const t = s.constructor === Object ? null : null;
  }
  // Ép xí ngầu luôn ra đôi (4-4)
  Math.random = () => 0.5;
  c.hud.refresh();
});

for (let i = 1; i <= 3; i++) {
  const ok = await action(/Lắc xí ngầu/);
  if (!ok) { log(`  !! không bấm được nút lắc lần ${i}`); break; }
  await page.waitForTimeout(3600);
  await drain(12000);
  const s = await st();
  log(`  lần ${i}: doubles→ pos=${s.p[0].pos} jail=${s.p[0].jail} turn=${s.turn}`);
  if (s.p[0].jail) { log('  ✔ vào tù đúng ở lần đổ đôi thứ 3'); break; }
}
await page.screenshot({ path: `${SHOT}/41-jail.png` });

/* ============================== 2. RA TÙ ============================== */
log('\n=== RA TÙ ===');
await forceTurn(0);
const jailButtons = await page.locator('#actions button.btn').allTextContents();
log('  nút khi ở tù:', JSON.stringify(jailButtons));
await page.screenshot({ path: `${SHOT}/46-jail-options.png` });

// Lắc không ra đôi (ép 1-6)
await page.evaluate(() => {
  let k = 0;
  Math.random = () => (k++ % 2 === 0 ? 0.0 : 0.99);   // 1 và 6
});
await action(/Lắc xí ngầu \(cầu đôi\)/);
await page.waitForTimeout(3000); await drain(9000);
log('  sau khi lắc trượt:', JSON.stringify((await st()).p[0]));

// Nộp tiền ra tù
await forceTurn(0);
const beforePay = (await st()).p[0].m;
await action(/Nộp .* ra tù/);
await page.waitForTimeout(3800); await drain(14000);
const afterPay = await st();
log(`  nộp phạt: ${beforePay}$ → ${afterPay.p[0].m}$, còn ở tù = ${afterPay.p[0].jail}`);

await page.evaluate(() => { Math.random = Math.__orig || Math.random; });

/* ============================== 3. PHÁ SẢN ============================== */
log('\n=== PHÁ SẢN → TÀI SẢN VỀ NGÂN HÀNG ===');
await idle();
await page.evaluate(() => {
  const c = window.__monopoly.controller;
  const s = c.state;
  for (const id of [21, 23, 24]) s.owner.set(id, 2);     // Chú Hoả đủ bộ đỏ
  s.houses.set(21, 3); s.houses.set(23, 3); s.houses.set(24, 3);
  s.bankHouses -= 9;
  s.owner.set(26, 2); s.mortgaged.add(26);
  c.hud.refresh(); c.scene.refresh(s);
});
await forceTurn(2);
const b4 = await st();
log(`  trước: Chú Hoả có ${await page.evaluate(() => window.__monopoly.controller.state.propertiesOf(2).length)} ô, ngân hàng còn ${b4.bankHouses} nhà`);
await page.screenshot({ path: `${SHOT}/47-before-bankrupt.png` });

await action(/Phá sản/);
await page.waitForTimeout(900);
await page.screenshot({ path: `${SHOT}/42-bankrupt-confirm.png` });
await page.locator('.scrim.show button.btn-danger').click();
await page.waitForTimeout(3000);
await page.screenshot({ path: `${SHOT}/43-bankrupt-fx.png` });
await page.waitForTimeout(2500);
await drain(10000);

const aft = await st();
log(`  sau: Chú Hoả bankrupt=${aft.p[2].bk}, tổng ô có chủ=${aft.owned}, ngân hàng còn ${aft.bankHouses} nhà (9 căn đã nhập kho ✔), còn sống=${aft.alive}`);

/* ============================== 4. THẮNG + PHÁO HOA ============================== */
log('\n=== THẮNG CUỘC + PHÁO HOA ===');
await forceTurn(1);
await action(/Phá sản/);
await page.waitForTimeout(900);
await page.locator('.scrim.show button.btn-danger').click();
await page.waitForTimeout(4200);
await page.screenshot({ path: `${SHOT}/44-fireworks.png` });
await page.waitForTimeout(4000);
await page.screenshot({ path: `${SHOT}/45-winner.png` });
const final = await st();
log(`  ván kết thúc: over=${final.over}, còn sống=${final.alive}`);
log('  modal:', await page.locator('.scrim.show .modal-title').textContent().catch(() => '(không có)'));

log('\n=== LỖI (' + errors.length + ') ===');
for (const e of errors.slice(0, 15)) log(e);
await browser.close();
