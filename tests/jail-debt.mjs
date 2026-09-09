/**
 * Ba luật bổ sung:
 *   1. Đáp xuống ô "Vào Tù" là hết lượt ngay, kể cả vừa đổ đôi.
 *   2. Ở tù mỗi lượt chỉ được cầu đôi một lần; hụt lần thứ 3 thì nộp 50$.
 *   3. Phải trả tiền mà bán sạch nhà + thế chấp hết đất vẫn không đủ → vỡ nợ ngay.
 */
import { launchChrome } from './launch.mjs';
import { playRollOff } from './rolloff.mjs';

const SHOT = '/private/tmp/claude-501/-Users-jasonhoang-Desktop-monopoly/a29323e2-f3f4-4b2d-9c9c-70118d22612f/scratchpad';
const errors = [];
const fails = [];
const log = (...a) => console.log(...a);
const check = (ok, msg) => { log(`  ${ok ? '✔' : '✘'} ${msg}`); if (!ok) fails.push(msg); };

const browser = await launchChrome();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

/** Đóng hết modal đang mở. */
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

/** Chờ controller chạy xong chuỗi hiệu ứng. */
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

const st = () => page.evaluate(() => {
  const s = window.__monopoly.controller.state;
  return {
    turn: s.turn, over: s.over,
    p: s.players.map((x) => ({ m: x.money, pos: x.pos, jail: x.inJail, jt: x.jailTurns, bk: x.bankrupt })),
  };
});

async function forceTurn(i) {
  await idle();
  await page.evaluate((n) => {
    const c = window.__monopoly.controller;
    c.state.turn = n;
    c.beginTurn();
  }, i);
  await page.waitForTimeout(600);
}

/**
 * Ép đúng hai con xí ngầu kế tiếp rồi tự trả Math.random về như cũ —
 * hai lần gọi Math.random đầu tiên sau khi gài luôn là của rollDice().
 */
async function forceDice(a, b) {
  await page.evaluate(([x, y]) => {
    const orig = Math.__orig || (Math.__orig = Math.random);
    const seq = [(x - 1) / 6 + 0.01, (y - 1) / 6 + 0.01];
    let i = 0;
    Math.random = () => (i < 2 ? seq[i++] : orig());
  }, [a, b]);
}

async function action(rx, maxMs = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    await drain(4000);
    const b = page.locator('#actions button.btn', { hasText: rx }).first();
    if (await b.count() && await b.isEnabled()) { await b.click(); return true; }
    await page.waitForTimeout(350);
  }
  return false;
}

await page.goto('http://localhost:5178/', { waitUntil: 'networkidle' });
/* Bản online hỏi "Chơi kiểu nào?" trước khi bày bàn. Bộ này kiểm phần chơi trên
   một máy, nên bấm luôn cửa ấy rồi mới vào màn hình bày bàn cờ quen thuộc. */
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

// Mở màn là vòng lắc giành quyền đi trước — bấm hộ rồi trả thứ tự về theo ghế
await playRollOff(page);


/* ============= 0. ĐẠP TRÚNG Ô BẮT ĐẦU → LƯƠNG ×1.5 ============= */
log('=== 0. DỪNG ĐÚNG Ô BẮT ĐẦU ===');
await idle();
await page.evaluate(() => {
  const c = window.__monopoly.controller;
  c.state.turn = 0;
  c.state.players[0].pos = 37;
  c.state.players[0].money = 1000;
  c.hud.refresh();
  c.beginTurn();
});
await page.waitForTimeout(500);
await forceDice(1, 2);                       // 3 ô: 37 → 0, dừng đúng ô Bắt Đầu
await action(/Lắc xí ngầu/);
await page.waitForTimeout(2500);
await drain(8000);
await idle();
const s0 = await st();
log(`  p0: pos=${s0.p[0].pos} tiền=${s0.p[0].m}$ (1000 + lương)`);
check(s0.p[0].pos === 0, 'dừng đúng ô Bắt Đầu');
check(s0.p[0].m === 1300, 'đạp trúng ô Bắt Đầu thì lãnh 300$ chứ không phải 200$');
await page.screenshot({ path: `${SHOT}/49-go-landing.png` });

/* ================== 1. ĐÁP XUỐNG Ô "VÀO TÙ" → HẾT LƯỢT ================== */
log('=== 1. ĐỔ ĐÔI RỒI ĐÁP XUỐNG Ô VÀO TÙ ===');
await idle();
await page.evaluate(() => {
  const c = window.__monopoly.controller;
  c.state.turn = 0;
  c.state.players[0].pos = 26;
  c.beginTurn();
});
await page.waitForTimeout(500);
await forceDice(2, 2);                       // đôi 2 → đi 4 ô → ô 30 "Vào Tù"
await action(/Lắc xí ngầu/);
await page.waitForTimeout(2500);
await idle();
let s = await st();
log(`  p0: pos=${s.p[0].pos} jail=${s.p[0].jail} | lượt hiện tại = ${s.turn}`);
check(s.p[0].jail === true, 'đổ đôi vào ô 30 thì bị giải vào tù');
check(s.p[0].pos === 10, 'quân cờ nằm ở Khám Lớn (ô 10)');
check(s.turn !== 0, 'hết lượt ngay dù vừa đổ đôi — đã chuyền lượt cho người khác');
await page.screenshot({ path: `${SHOT}/50-gotojail-endturn.png` });

/* ============ 2. Ở TÙ: MỖI LƯỢT CHỈ CẦU ĐÔI MỘT LẦN ============ */
log('\n=== 2. Ở TÙ — CẦU ĐÔI TỪNG LƯỢT ===');
for (const [i, [a, b]] of [[1, 6], [3, 5]].entries()) {
  await forceTurn(0);
  await forceDice(a, b);
  await action(/Lắc xí ngầu \(cầu đôi\)/);
  await page.waitForTimeout(2200);
  await idle();
  s = await st();
  log(`  lần ${i + 1} (${a}-${b}): jailTurns=${s.p[0].jt} jail=${s.p[0].jail} lượt=${s.turn}`);
  check(s.p[0].jt === i + 1, `cầu đôi hụt lần ${i + 1} → jailTurns = ${i + 1}`);
  check(s.p[0].jail === true, `vẫn còn ngồi tù sau lần ${i + 1}`);
  check(s.turn !== 0, `hết lượt sau lần cầu đôi thứ ${i + 1} (không lắc liên tục)`);
}

// Lần thứ ba hụt → buộc nộp 50$ rồi đi 10 ô (4-6) tới Bãi Đậu Xe (ô 20)
await forceTurn(0);
const before = (await st()).p[0].m;
await forceDice(4, 6);
await action(/Lắc xí ngầu \(cầu đôi\)/);
await page.waitForTimeout(2600);
await idle();
s = await st();
log(`  lần 3 (4-6): tiền ${before}$ → ${s.p[0].m}$, jail=${s.p[0].jail}, pos=${s.p[0].pos}`);
check(s.p[0].m === before - 50, 'hụt lần thứ 3 thì phải nộp phạt 50$');
check(s.p[0].jail === false, 'nộp phạt xong được ra tù');
check(s.p[0].pos === 20, 'đi tiếp 10 ô theo số vừa lắc, tới Bãi Đậu Xe');
await page.screenshot({ path: `${SHOT}/51-jail-third-roll.png` });

/* ============ 3. TỔNG TÀI SẢN KHÔNG ĐỦ → VỠ NỢ NGAY ============ */
log('\n=== 3. KHÔNG ĐỦ TỔNG TÀI SẢN → VỠ NỢ NGAY ===');
await idle();

// 3a. Còn xoay được đủ tiền → vẫn được mời bán nhà / thế chấp
await page.evaluate(() => {
  const c = window.__monopoly.controller;
  const s = c.state;
  for (const id of [37, 39]) s.owner.set(id, 1);   // xoay được 175 + 200 = 375
  s.players[1].money = 20;
  c.hud.refresh(); c.scene.refresh(s);
  c.payBank(1, 300);                                // 20 + 375 = 395 ≥ 300 → được xoay
});
await page.waitForTimeout(1200);
let title = await page.locator('.scrim.show .modal-eyebrow, .scrim.show .modal-title').allTextContents();
let btns = await page.locator('.scrim.show button.btn').allTextContents();
log(`  thiếu 280$ / xoay được 395$ → ${JSON.stringify(title)} ${JSON.stringify(btns)}`);
check(btns.some((t) => /Bán nhà|Thế chấp/.test(t)), 'còn khả năng chi trả thì vẫn được mời xoay tiền');
await page.screenshot({ path: `${SHOT}/52-can-raise.png` });
// Chọn phá sản để dọn dẹp tình huống
await page.locator('.scrim.show button.btn-danger').click();
await page.waitForTimeout(700);
await drain(8000);
await idle();

// 3b. Bán sạch nhà + thế chấp hết cũng không đủ → vỡ nợ, không hỏi han
await page.evaluate(() => {
  const c = window.__monopoly.controller;
  const s = c.state;
  s.owner.set(1, 2); s.owner.set(3, 2);            // hai ô rẻ nhất: thế chấp được 30 + 30
  s.houses.delete(1); s.houses.delete(3);
  s.players[2].money = 40;
  c.hud.refresh(); c.scene.refresh(s);
  c.payBank(2, 500);                                // 40 + 60 = 100 < 500 → vỡ nợ luôn
});
await page.waitForTimeout(1200);
title = await page.locator('.scrim.show .modal-eyebrow, .scrim.show .modal-title, .scrim.show .modal-sub').allTextContents();
btns = await page.locator('.scrim.show button.btn').allTextContents();
log(`  thiếu 460$ / xoay được 100$ → ${JSON.stringify(title)} ${JSON.stringify(btns)}`);
check(!btns.some((t) => /Bán nhà|Thế chấp/.test(t)), 'không mời xoay tiền nữa khi tổng tài sản không đủ');
check(btns.some((t) => /Chấp nhận/.test(t)), 'chỉ còn một nút: chấp nhận vỡ nợ');
await page.screenshot({ path: `${SHOT}/53-forced-bankrupt.png` });
await page.locator('.scrim.show button.btn-danger').click();
await page.waitForTimeout(3000);
await drain(10000);
s = await st();
log(`  Chú Hoả bankrupt=${s.p[2].bk}`);
check(s.p[2].bk === true, 'người chơi bị tuyên vỡ nợ ngay');

/* ====== 4. CON NỢ VỠ NỢ → NGÂN HÀNG TRẢ THAY CHO CHỦ ĐẤT ====== */
log('\n=== 4. VỠ NỢ GIỮA LÚC PHẢI TRẢ TIỀN THUÊ ===');
await page.evaluate(() => {
  const c = window.__monopoly.controller;
  const s = c.state;
  // Cô Ba Trà (1) sạch túi, không còn gì thế chấp: chắc chắn vỡ nợ
  for (const id of [...s.owner.keys()]) if (s.owner.get(id) === 1) s.owner.delete(id);
  s.players[1].money = 20;
  s.players[0].money = 1000;
  s.players[1].bankrupt = false;
  c.hud.refresh(); c.scene.refresh(s);
  c.payPlayer(1, 0, 400);          // trả tiền thuê cho Bảy Viễn
});
await page.waitForTimeout(1500);
btns = await page.locator('.scrim.show button.btn').allTextContents();
log(`  hộp thoại lúc vỡ nợ: ${JSON.stringify(btns)}`);
await page.locator('.scrim.show button.btn-danger').click();
await page.waitForTimeout(6000);
log(`  bảng thông báo: ${(await page.locator('#broadcast').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 120)}`);
await drain(12000);
await idle();
s = await st();
log(`  Cô Ba bankrupt=${s.p[1].bk} · Bảy Viễn ${1000}$ → ${s.p[0].m}$`);
check(s.p[1].bk === true, 'không xoay nổi thì vẫn vỡ nợ như cũ');
check(s.p[0].m === 1400, 'chủ đất vẫn nhận đủ 400$ — ngân hàng trả thay con nợ');
await page.screenshot({ path: `${SHOT}/54-bank-covers-rent.png` });

log(`\n=== KẾT QUẢ: ${fails.length === 0 ? 'ĐẠT' : 'HỎNG ' + fails.length} ===`);
for (const f of fails) log('  ✘ ' + f);
log(`=== LỖI TRANG (${errors.length}) ===`);
for (const e of errors.slice(0, 10)) log(e);
await browser.close();
process.exit(fails.length === 0 && errors.length === 0 ? 0 : 1);
