/**
 * Luật: con nợ vỡ nợ thì **chủ nợ vẫn nhận đủ** — ngân hàng trả thay.
 *
 * Mọi khoản người-trả-người đều đi qua `controller.payPlayer`, nên bộ này lần
 * lượt gọi đúng từng đường dẫn tới đó và soi túi tiền chủ nợ sau khi con nợ đã
 * phá sản:
 *   1. Tiền thuê, con nợ hết sạch tài sản → vỡ nợ ép buộc.
 *   2. Tiền thuê, con nợ còn đất nhưng tự bấm "Tuyên bố phá sản".
 *   3. Thẻ tiền mừng: một người góp vỡ nợ, người rút vẫn phải đủ phần của họ.
 *   4. Cưỡng chiếm: người dùng thẻ vỡ nợ lúc đền tiền — chủ đất nhận đủ tiền
 *      đền và **giữ nguyên đất**.
 *   5. Đấu giá bán lại cho chủ cũ: người thắng vỡ nợ, chủ cũ vẫn nhận tiền.
 *   6. Chủ nợ đã phá sản từ trước → không trả cho ai (đừng in tiền vô chủ).
 */
import { launchChrome } from './launch.mjs';
import { playRollOff } from './rolloff.mjs';

const SHOT = process.env.SHOT_DIR || '';
const errors = [];
const fails = [];
const log = (...a) => console.log(...a);
const check = (ok, msg) => { log(`  ${ok ? '✔' : '✘'} ${msg}`); if (!ok) fails.push(msg); };

const browser = await launchChrome();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

/** Đóng hết modal đang mở (bấm nút đầu tiên còn bấm được). */
async function drain(maxMs = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const b = page.locator('.scrim.show button.btn:not([disabled])').first();
    if (await b.count() === 0) {
      await page.waitForTimeout(350);
      if (await page.locator('.scrim.show').count() === 0) return true;
      continue;
    }
    await b.click().catch(() => {});
    await page.waitForTimeout(600);
  }
  return false;
}

/** Chờ chuỗi hiệu ứng của controller chạy xong. */
async function idle(maxMs = 40000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    await drain(6000);
    const busy = await page.evaluate(() => window.__monopoly.controller.busy);
    if (!busy && await page.locator('.scrim.show').count() === 0) {
      await page.waitForTimeout(450);
      if (!await page.evaluate(() => window.__monopoly.controller.busy)) return true;
    }
    await page.waitForTimeout(350);
  }
  return false;
}

/**
 * Chờ tới khi túi tiền của một người bằng đúng `want`.
 *
 * Chuỗi vỡ nợ chạy mất gần chục giây (bảng thông báo, pháo hoa, rồi mới tới
 * lượt ngân hàng trả thay), mà mấy kịch bản ở đây gọi thẳng `payPlayer` chứ
 * không qua `guard` nên `controller.busy` luôn là false — `idle()` về ngay chứ
 * không chờ hộ. Đọc số dư đúng lúc nó vừa đổi thì phải hỏi lại từng nhịp.
 */
async function untilMoney(seat, want, maxMs = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const m = await page.evaluate(
      (i) => window.__monopoly.controller.state.players[i].money, seat).catch(() => null);
    if (m === want) return true;
    await page.waitForTimeout(300);
  }
  return false;
}

/** Bấm nút đỏ (cửa phá sản) nếu đang có hộp thoại nào bày ra. */
async function clickDanger(maxMs = 12000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const b = page.locator('.scrim.show button.btn-danger').first();
    if (await b.count() && await b.isEnabled()) { await b.click().catch(() => {}); return true; }
    await page.waitForTimeout(250);
  }
  return false;
}

const st = () => page.evaluate(() => {
  const s = window.__monopoly.controller.state;
  return {
    turn: s.turn, over: s.over,
    p: s.players.map((x) => ({ m: x.money, bk: x.bankrupt })),
    owner: [...s.owner.entries()],
  };
});

/** Dọn bàn: ai cũng sống lại, sạch đất, tiền đặt theo kịch bản. */
const reset = (money) => page.evaluate((ms) => {
  const c = window.__monopoly.controller;
  const s = c.state;
  s.over = false;
  s.owner.clear();
  s.houses.clear();
  s.mortgaged.clear();
  s.players.forEach((p, i) => { p.bankrupt = false; p.money = ms[i]; p.inJail = false; });
  c.hud.refresh(); c.scene.refresh(s); c.scene.placeTokens();
}, money);

await page.goto('http://localhost:5178/', { waitUntil: 'networkidle' });
const soloBtn = page.locator('.scrim.show button.btn', { hasText: 'Chơi trên một máy' });
await soloBtn.waitFor({ timeout: 30000 });
await soloBtn.click();
await page.waitForTimeout(2000);
await page.locator('.count-btn[data-n="3"]').click();
await page.waitForTimeout(200);
for (const [i, n] of ['Bảy Viễn', 'Cô Ba Trà', 'Chú Hoả'].entries()) {
  await page.locator('#name-list input').nth(i).fill(n);
}
await page.getByRole('button', { name: 'Khai cuộc' }).click();
await page.waitForTimeout(3200);
await playRollOff(page);
await idle();

/* ============ 1. TIỀN THUÊ — CON NỢ CẠN SẠCH TÀI SẢN ============ */
log('\n=== 1. TIỀN THUÊ: con nợ không còn gì để xoay ===');
await reset([1000, 20, 1000]);
await page.evaluate(() => {
  const c = window.__monopoly.controller;
  c.payPlayer(1, 0, 400);              // Cô Ba trả tiền thuê cho Bảy Viễn
});
await page.waitForTimeout(1200);
await clickDanger();
await page.waitForTimeout(5000);
await drain(12000);
await idle();
let s = await st();
log(`  Cô Ba bk=${s.p[1].bk} · Bảy Viễn 1000$ → ${s.p[0].m}$`);
check(s.p[1].bk === true, 'con nợ vỡ nợ');
check(s.p[0].m === 1400, 'chủ đất nhận đủ 400$');

/* ====== 2. TIỀN THUÊ — CON NỢ CÒN ĐẤT NHƯNG TỰ CHỌN PHÁ SẢN ====== */
log('\n=== 2. TIỀN THUÊ: con nợ tự bấm "Tuyên bố phá sản" ===');
await reset([1000, 100, 1000]);
await page.evaluate(() => {
  const c = window.__monopoly.controller;
  const s = c.state;
  s.owner.set(37, 1); s.owner.set(39, 1);   // còn xoay được, nên hộp THIẾU TIỀN mở
  c.hud.refresh(); c.scene.refresh(s);
  c.payPlayer(1, 0, 400);
});
await page.waitForTimeout(1400);
/* Con nợ không phải người đang đi mà vẫn xoay được → chuyền máy cho họ đã,
   rồi mới tới hộp "THIẾU TIỀN". Xem `Game.ensureFunds`. */
let eyes = await page.locator('.scrim.show .modal-eyebrow').allTextContents();
check(eyes.includes('CHUYỀN MÁY'), 'chuyền máy cho con nợ trước khi hỏi xoay tiền');
await page.locator('.scrim.show button.btn', { hasText: 'Tiếp tục' }).first().click();
await page.waitForTimeout(900);
let btns = await page.locator('.scrim.show button.btn').allTextContents();
log(`  hộp thoại: ${JSON.stringify(btns)}`);
await clickDanger();                    // "Tuyên bố phá sản"
await page.waitForTimeout(900);
await clickDanger();                    // xác nhận "Phá sản"
await page.waitForTimeout(900);
await drain(12000);                     // chuyền máy lại cho người đang đi
await untilMoney(0, 1400);
await idle();
s = await st();
log(`  Cô Ba bk=${s.p[1].bk} · Bảy Viễn 1000$ → ${s.p[0].m}$`);
check(s.p[1].bk === true, 'tự chọn phá sản thì vẫn vỡ nợ');
check(s.p[0].m === 1400, 'chủ đất nhận đủ 400$ dù con nợ tự bỏ cuộc');

/* ============ 3. THẺ TIỀN MỪNG — MỘT NGƯỜI GÓP VỠ NỢ ============ */
log('\n=== 3. THẺ TIỀN MỪNG: một người góp vỡ nợ ===');
await reset([1000, 20, 1000]);
await page.evaluate(() => {
  const c = window.__monopoly.controller;
  const s = c.state;
  // Bảy Viễn rút thẻ tiền mừng 240$: mỗi người còn lại góp 120$.
  // Cô Ba (20$, không đất) chắc chắn vỡ nợ, Chú Hoả trả bình thường.
  c.cardCollect(s.players[0], 'chance', { text: 'Tiệc mừng', amount: 240 }, 'CƠ HỘI');
});
await page.waitForTimeout(1500);
await drain(6000);                      // đóng mặt thẻ
await page.waitForTimeout(1200);
await clickDanger();                    // Cô Ba chấp nhận vỡ nợ
await page.waitForTimeout(5000);
await drain(14000);
await idle();
s = await st();
log(`  Cô Ba bk=${s.p[1].bk} · Bảy Viễn 1000$ → ${s.p[0].m}$ · Chú Hoả 1000$ → ${s.p[2].m}$`);
check(s.p[1].bk === true, 'người góp không nổi thì vỡ nợ');
check(s.p[2].m === 880, 'người góp còn tiền trả đủ 120$');
check(s.p[0].m === 1240, 'người rút thẻ nhận đủ cả hai phần góp (240$)');

/* ====== 4. CƯỠNG CHIẾM — NGƯỜI DÙNG THẺ VỠ NỢ LÚC ĐỀN TIỀN ====== */
log('\n=== 4. CƯỠNG CHIẾM: người dùng thẻ vỡ nợ lúc đền tiền ===');
await reset([1000, 20, 1000]);
await page.evaluate(() => {
  const c = window.__monopoly.controller;
  const s = c.state;
  s.owner.set(39, 0);                   // đất của Bảy Viễn, giá thế chấp 200$
  c.hud.refresh(); c.scene.refresh(s);
  // Cô Ba cưỡng chiếm nhưng chỉ có 20$ và không tài sản → vỡ nợ ngay
  c.seizeTile(s.players[1], 39, 'CƯỠNG CHIẾM');
});
await page.waitForTimeout(2500);
await clickDanger();
await page.waitForTimeout(5000);
await drain(14000);
await idle();
s = await st();
const owner39 = Object.fromEntries(s.owner)[39];
log(`  Cô Ba bk=${s.p[1].bk} · Bảy Viễn 1000$ → ${s.p[0].m}$ · chủ ô 39 = ${owner39}`);
check(s.p[1].bk === true, 'người dùng thẻ vỡ nợ');
check(s.p[0].m === 1200, 'chủ đất nhận đủ 200$ tiền đền');
check(owner39 === 0, 'đất không sang tên khi người cưỡng chiếm vỡ nợ');

/* ====== 5. ĐẤU GIÁ BÁN LẠI — NGƯỜI THẮNG VỠ NỢ, CHỦ CŨ VẪN NHẬN ====== */
log('\n=== 5. ĐẤU GIÁ: người thắng vỡ nợ, chủ cũ vẫn nhận tiền ===');
await reset([1000, 20, 1000]);
await page.evaluate(() => {
  const c = window.__monopoly.controller;
  const s = c.state;
  s.owner.set(39, 0);
  c.hud.refresh(); c.scene.refresh(s);
  // Gọi thẳng cửa chốt phiên: Cô Ba thắng 300$ nhưng chỉ có 20$
  c.guard(() => c.payPlayer(1, 0, 300));
});
await page.waitForTimeout(1400);
await clickDanger();
await page.waitForTimeout(5000);
await drain(12000);
await idle();
s = await st();
log(`  Cô Ba bk=${s.p[1].bk} · Bảy Viễn 1000$ → ${s.p[0].m}$`);
check(s.p[0].m === 1300, 'chủ cũ nhận đủ tiền bán dù người thắng vỡ nợ');

/* ====== 6. CHỦ NỢ ĐÃ PHÁ SẢN TỪ TRƯỚC → KHÔNG TRẢ CHO AI ====== */
log('\n=== 6. CHỦ NỢ ĐÃ PHÁ SẢN → không ai được trả ===');
await reset([1000, 20, 1000]);
await page.evaluate(() => {
  const c = window.__monopoly.controller;
  const s = c.state;
  s.players[0].bankrupt = true; s.players[0].money = 0;
  c.hud.refresh();
  c.payPlayer(1, 0, 400);
});
await page.waitForTimeout(1400);
await clickDanger();
await page.waitForTimeout(4000);
await drain(12000);
await idle();
s = await st();
log(`  Bảy Viễn (đã phá sản) = ${s.p[0].m}$`);
check(s.p[0].m === 0, 'người đã phá sản không được cộng thêm đồng nào');

if (SHOT) await page.screenshot({ path: `${SHOT}/creditor-paid.png` });
log(`\n=== KẾT QUẢ: ${fails.length === 0 ? 'ĐẠT' : 'HỎNG ' + fails.length} ===`);
for (const f of fails) log('  ✘ ' + f);
log(`=== LỖI TRANG (${errors.length}) ===`);
for (const e of errors.slice(0, 10)) log(e);
await browser.close();
process.exit(fails.length === 0 && errors.length === 0 ? 0 : 1);
