import { launchChrome } from './launch.mjs';
import { playRollOff } from './rolloff.mjs';
import { pickOnBoard, picking } from './pick.mjs';

const SHOT = '/private/tmp/claude-501/-Users-jasonhoang-Desktop-monopoly/a29323e2-f3f4-4b2d-9c9c-70118d22612f/scratchpad';
const errors = [];

const browser = await launchChrome();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });

page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));

await page.goto('http://localhost:5178/', { waitUntil: 'networkidle' });
/* Bản online hỏi "Chơi kiểu nào?" trước khi bày bàn. Bộ này kiểm phần chơi trên
   một máy, nên bấm luôn cửa ấy rồi mới vào màn hình bày bàn cờ quen thuộc. */
const soloBtn = page.locator('.scrim.show button.btn', { hasText: 'Chơi trên một máy' });
await soloBtn.waitFor({ timeout: 30000 });
await soloBtn.click();

await page.waitForTimeout(2500);

await page.screenshot({ path: `${SHOT}/01-setup.png` });
console.log('--- setup modal visible:', await page.locator('.modal-title').first().textContent());

// 4 người chơi
await page.locator('.count-btn[data-n="4"]').click();
await page.waitForTimeout(300);
const inputs = page.locator('#name-list input');
const vnNames = ['Bảy Viễn', 'Cô Ba', 'Chú Hoả', 'Bà Từ'];
for (let i = 0; i < 4; i++) { await inputs.nth(i).fill(vnNames[i]); }
await page.screenshot({ path: `${SHOT}/02-setup-4p.png` });

await page.getByRole('button', { name: 'Khai cuộc' }).click();
await page.waitForTimeout(3500);

// Mở màn là vòng lắc giành quyền đi trước — bấm hộ rồi trả thứ tự về theo ghế
await playRollOff(page);

await page.screenshot({ path: `${SHOT}/03-board.png` });

console.log('--- players rendered:', await page.locator('.pcard').count());
console.log('--- thẻ đang tới lượt:', (await page.locator('.pcard.is-active').textContent()).replace(/\s+/g, ' ').trim());
console.log('--- bank:', await page.locator('#bank-houses').textContent());

/**
 * Đóng mọi hộp thoại đang mở, lặp cho tới khi sạch.
 * Game chờ người chơi trả lời popup nên test phải chủ động trả lời,
 * không được dựa vào việc chờ đủ lâu.
 */
async function drain(maxMs = 20000) {
  const t0 = Date.now();
  const order = ['Mua ', 'Nhận tiền', 'Đành chịu', 'Tiếp tục', 'Chấp nhận',
                 'Xong', 'Đóng', 'Bỏ qua', 'Để sau', 'Chơi tiếp', 'Thôi', 'Huỷ'];
  while (Date.now() - t0 < maxMs) {
    // Bảng chọn ô trên bàn cờ không có nền tối; không bấm thì ván đứng ở đó
    if (await picking(page)) { await pickOnBoard(page).catch(() => {}); continue; }
    if (await page.locator('#modal-root .scrim.show').count() === 0) {
      await page.waitForTimeout(300);
      if (await page.locator('#modal-root .scrim.show').count() === 0) return;
      continue;
    }
    const title = await page.locator('.scrim.show .modal-title').first()
      .textContent().catch(() => '');
    let clicked = false;
    for (const label of order) {
      const b = page.locator('.scrim.show button.btn', { hasText: label }).first();
      if (await b.count() && !(await b.isDisabled())) { await b.click(); clicked = true; break; }
    }
    if (!clicked) {
      const any = page.locator('.scrim.show button.btn:not([disabled])').first();
      if (await any.count()) await any.click(); else return;
    }
    console.log('    · trả lời:', (title || '').slice(0, 44));
    await page.waitForTimeout(700);
  }
}

/** Chờ tới khi một nút hành động sẵn sàng rồi bấm; vừa chờ vừa dọn popup. */
async function action(rx, maxMs = 25000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    await drain(6000);
    const b = page.locator('#actions button.btn', { hasText: rx }).first();
    if (await b.count() && !(await b.isDisabled())) { await b.click(); return true; }
    await page.waitForTimeout(300);
  }
  return false;
}

// Chơi tự động 22 lượt
let shots = 0;
for (let turn = 1; turn <= 22; turn++) {
  const ok = (await action(/Lắc xí ngầu/, 12000))
    || (await action(/Nộp .* ra tù/, 6000))
    || (await action(/Kết thúc lượt/, 6000));
  if (!ok) {
    console.log('  !! không bấm được nút nào ở lượt', turn);
    console.log('     chẩn đoán:', JSON.stringify(await page.evaluate(() => ({
      actions: [...document.querySelectorAll('#actions button')].map((b) => b.textContent),
      modalTitle: document.querySelector('#modal-root .modal-title')?.textContent ?? null,
      busy: window.__monopoly.controller.busy,
    }))));
    break;
  }
  await page.waitForTimeout(1800);
  await drain(15000);

  if (turn === 3 || turn === 12) {
    await page.screenshot({ path: `${SHOT}/1${shots++}-turn${turn}.png` });
  }
  await action(/Kết thúc lượt/, 4000);
  await page.waitForTimeout(400);
}

await page.screenshot({ path: `${SHOT}/20-after-turns.png` });

// Bảng tài sản
console.log('\n--- trạng thái sau 22 lượt ---');
for (const el of await page.locator('.pcard').all()) {
  console.log('   ', (await el.textContent()).replace(/\s+/g, ' ').trim());
}

const st = await page.evaluate(() => {
  const s = window.__monopoly.controller.state;
  return {
    owned: s.owner.size,
    houses: [...s.houses.entries()],
    bankHouses: s.bankHouses,
    turn: s.turn,
    money: s.players.map((p) => `${p.name}:${p.money}${p.inJail ? '(tù)' : ''}${p.bankrupt ? '(phá sản)' : ''}`),
  };
});
console.log('--- state:', JSON.stringify(st));

console.log('\n=== LỖI (' + errors.length + ') ===');
for (const e of errors.slice(0, 20)) console.log(e);

await browser.close();
