/**
 * Đấu giá kín trên **bản một máy**: chuyền máy cho từng người ghi giá, không có
 * đồng hồ (cả bàn ngồi quanh một máy, không ai treo được ai), rồi bảng giá chốt
 * phiên — kể cả phiên ế.
 *
 * Bản online có `auction-online.mjs` lo phần hết giờ và tab nằm nền.
 *
 * Cần dev server đang chạy ở cổng 5178.
 */
import { launchChrome } from './launch.mjs';
import { playRollOff } from './rolloff.mjs';

const errors = [];
const fails = [];
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? '✓' : '✗'} ${name}${extra ? ` — ${extra}` : ''}`);
  if (!cond) fails.push(name);
};

const browser = await launchChrome();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto('http://localhost:5178/', { waitUntil: 'networkidle' });
const solo = page.locator('.scrim.show button.btn', { hasText: 'Chơi trên một máy' });
await solo.waitFor({ timeout: 30000 });
await solo.click();
await page.waitForTimeout(1800);
await page.locator('.count-btn[data-n="3"]').click();
await page.getByRole('button', { name: 'Khai cuộc' }).click();
await page.waitForTimeout(2600);
await playRollOff(page);

const top = () => page.locator('#modal-root .scrim.show').last();

/**
 * Mở một phiên rồi trả lời hộ từng người theo `bids` (ghế → giá, hoặc
 * `{ over: true }` để thử ô vượt túi). Trả về bảng giá và số hộp ghi giá đã gặp.
 */
async function runAuction(tile, bids, setup = '') {
  await page.evaluate(({ tile, setup }) => {
    const c = window.__monopoly.controller;
    if (setup) (new Function('st', setup))(c.state);
    c.guard(() => c.events.auction(tile, { seller: null, reason: 'Bài kiểm thử.' }));
  }, { tile, setup });

  const seen = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    const t = top();
    if (await t.locator('.bid-table').count()) break;
    if (await t.locator('button.btn', { hasText: 'Tiếp tục' }).count()) {
      await t.locator('button.btn', { hasText: 'Tiếp tục' }).click();
    } else if (await t.locator('#bid-input').count()) {
      // Một máy hỏi lần lượt theo số ghế, nên hộp thứ k là của người thứ k
      const k = seen.length;
      const v = bids[k];
      seen.push({ timer: await t.locator('.trade-timer').count() });
      if (v && v.over) {
        await t.locator('#bid-input').fill('999999');
        seen[k].disabled = await t.locator('button.btn', { hasText: 'Chốt giá' }).isDisabled();
        await t.locator('#bid-input').fill('0');
      } else {
        await t.locator('#bid-input').fill(String(v ?? 0));
      }
      await t.locator('button.btn', { hasText: 'Chốt giá' }).click();
    }
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(300);
  const table = await page.evaluate(() => {
    const scrim = [...document.querySelectorAll('#modal-root .scrim:not(.hide)')]
      .find((s) => s.querySelector('.bid-table'));
    if (!scrim) return null;
    const rows = [...scrim.querySelectorAll('.bid-row')];
    return {
      eyebrow: scrim.querySelector('.modal-eyebrow').textContent,
      names: rows.map((r) => r.querySelector('.arow-name').textContent),
      bids: rows.map((r) => +r.querySelector('.bid-money').textContent.replace(/\D/g, '') || 0),
      winAt: rows.findIndex((r) => r.classList.contains('win')),
    };
  });
  // Chờ mạch đấu giá chạy xong hẳn rồi dọn bảng
  await page.waitForFunction(() => !window.__monopoly.controller.busy, null, { timeout: 20000 }).catch(() => {});
  await page.evaluate(() => {
    for (const s of document.querySelectorAll('#modal-root .scrim:not(.hide)')) s._close?.(true);
  });
  return { table, seen };
}

const names = await page.evaluate(() => window.__monopoly.controller.state.players.map((p) => p.name));
const state = () => page.evaluate(() => {
  const st = window.__monopoly.controller.state;
  return { owner: Object.fromEntries(st.owner), money: st.players.map((p) => p.money) };
});

/* ---------------------------------------------------------------- 1 · hoà giá */
{
  const before = await state();
  const { table, seen } = await runAuction(1, [100, 100, 50]);
  ok('ba người, ba hộp ghi giá chuyền tay', seen.length === 3, String(seen.length));
  ok('bản một máy không có đồng hồ trong hộp ghi giá', seen.every((s) => s.timer === 0));
  ok('bảng giá mở sau phiên', !!table, JSON.stringify(table));
  ok('hoà giá thì người chốt trước (ghế 0, được chuyền máy đầu tiên) thắng', table?.names[table.winAt] === names[0]);
  const after = await state();
  ok('ghế 0 lấy đất, trả 100', after.owner[1] === 0 && after.money[0] === before.money[0] - 100);
  ok('người thua giữ nguyên tiền', after.money[1] === before.money[1] && after.money[2] === before.money[2]);
}

/* ---------------------------------------------------------------- 2 · phiên ế */
{
  const before = await state();
  const { table, seen } = await runAuction(3, [0, 0, { over: true }]);
  ok('ô vượt túi khoá nút chốt', seen[2]?.disabled === true);
  ok('phiên ế vẫn mở bảng giá', table?.eyebrow === 'PHIÊN ĐẤU GIÁ Ế' && table.winAt === -1, JSON.stringify(table));
  const after = await state();
  ok('đất nằm lại ngân hàng, không ai mất tiền',
    after.owner[3] === undefined && JSON.stringify(after.money) === JSON.stringify(before.money));
}

/* ------------------------------------------------- 3 · người đã vỡ nợ đứng ngoài */
{
  const { table, seen } = await runAuction(6, [40, 90], 'st.players[2].bankrupt = true;');
  ok('người vỡ nợ không được hỏi', seen.length === 2, String(seen.length));
  ok('bảng chỉ có hai người', table?.names.length === 2 && !table.names.includes(names[2]));
  ok('ghế 1 trả 90 thắng', table?.names[table.winAt] === names[1]);
  await page.evaluate(() => { window.__monopoly.controller.state.players[2].bankrupt = false; });
}

/* ------------------------------------------------- 4 · ván chạy tiếp sau phiên */
{
  const acts = await page.evaluate(() => {
    const c = window.__monopoly.controller;
    c.beginTurn();
    return document.querySelectorAll('#actions button').length;
  });
  ok('thanh nút bày lại sau phiên đấu giá', acts > 0, String(acts));
}

console.log(errors.length ? `\nLỖI TRANG:\n${errors.join('\n')}` : '\nKhông có lỗi trang.');
await browser.close();
if (fails.length || errors.length) {
  console.log(`\nHỎNG: ${fails.join(', ')}`);
  process.exit(1);
}
console.log('\n✓ Tất cả kiểm tra đều đạt');
