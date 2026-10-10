/**
 * Chơi với máy: một người thật ngồi ghế 0, hai ghế còn lại giao cho bot.
 *
 * Kiểm:
 *   1. Hộp bày bàn có nút 🙂 / 🤖 cho từng ghế, ghế máy đổi tên mặc định.
 *   2. Lượt của bot tự chạy hết — không ai bấm hộ hộp thoại nào của nó.
 *   3. Người thật học kỹ năng được **trong lượt bot** bằng nút cây kỹ năng ở
 *      hàng tiện ích, và hộp cây ấy không bị bot đóng hộ.
 *   4. Không có màn "Chuyền máy" (bàn chỉ một người thật).
 *
 *   node tests/bots.mjs        (cần dev server ở cổng 5178)
 */
import { launchChrome } from './launch.mjs';

const errors = [];
let fails = 0;
const ok = (cond, msg) => { console.log(`${cond ? '  ✓' : '  ✗'} ${msg}`); if (!cond) fails += 1; };

const browser = await launchChrome();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
page.on('pageerror', (e) => errors.push(e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

await page.goto('http://localhost:5178/', { waitUntil: 'networkidle' });
const solo = page.locator('.scrim.show button.btn', { hasText: 'Chơi trên một máy' });
await solo.waitFor({ timeout: 30000 });
await solo.click();
await page.locator('.count-btn[data-n="3"]').waitFor();

console.log('▸ 1. Bày bàn');
await page.locator('.count-btn[data-n="3"]').click();
await page.locator('.seat-kind[data-b="1"]').click();
await page.locator('.seat-kind[data-b="2"]').click();
ok(await page.locator('.seat-kind.on').count() === 2, 'hai ghế bật 🤖 Máy');
ok(await page.locator('#name-list input').nth(1).inputValue() === 'Máy 2', 'ghế máy đổi tên mặc định thành "Máy 2"');
await page.locator('#name-list input').nth(0).fill('Tôi');
await page.getByRole('button', { name: 'Khai cuộc' }).click();

const S = () => page.evaluate(() => {
  const c = window.__monopoly?.controller;
  const st = c?.state;
  if (!st) return null;
  return {
    order: st.order, turn: st.turn, turnNo: st.turnNo, over: st.over, rolled: st.rolled,
    busy: c.busy,
    players: st.players.map((p) => ({ name: p.name, money: p.money, pos: p.pos, bankrupt: p.bankrupt, skills: [...p.skills], pts: p.skillPoints })),
  };
});

/** Bấm nút mặc định của hộp trên cùng (chỉ dùng cho hộp của người thật). */
async function answerTop() {
  const title = (await page.locator('.scrim.show .modal-title').last().textContent().catch(() => '')) || '';
  const prefer = ['Lắc xí ngầu', 'Mua ', 'Nhận tiền', 'Đành chịu', 'Cất vào túi', 'Bán nhà', 'Tiếp tục', 'Chấp nhận', 'Xong', 'Đã rõ', 'Đóng', 'Bỏ qua', 'Thôi', 'Để'];
  for (const label of prefer) {
    const b = page.locator('.scrim.show:last-child button.btn', { hasText: label }).first();
    if (await b.count() && !(await b.isDisabled())) { await b.click().catch(() => {}); return title; }
  }
  const any = page.locator('.scrim.show:last-child .modal-foot button.btn:not([disabled])').first();
  if (await any.count()) { await any.click().catch(() => {}); return title; }
  await page.keyboard.press('Escape');
  return title;
}

console.log('▸ 2. Bốc thăm + chơi');
const t0 = Date.now();
let handoffs = 0;
let botStalls = [];
let humanTurns = 0;
let lastTurnKey = '';
let botTurnsSeen = new Set();
let learnedOffTurn = false;
let openSince = new Map();

while (Date.now() - t0 < 6 * 60000) {
  const s = await S();
  if (s?.over) break;
  const botTurn = s?.order && s.turn !== 0;

  if (await page.locator('.scrim.show .handoff').count()) handoffs += 1;

  // Lượt bot: không bấm gì, chỉ ghi lại hộp nào nằm quá lâu (bot kẹt)
  if (botTurn) {
    botTurnsSeen.add(`${s.turnNo}:${s.turn}`);
    // 3. Học kỹ năng ngoài lượt, ngay giữa lượt của bot
    if (!learnedOffTurn && botTurnsSeen.size >= 2) {
      await page.evaluate(() => {
        const c = window.__monopoly.controller;
        c.state.players[0].skillPoints += 2;
        c.refreshSkillBtn();
      });
      await page.locator('#skill-btn:not([hidden])').click();
      await page.locator('.st-node[data-id="cn1"]').waitFor({ timeout: 8000 });
      await page.locator('.st-node[data-id="cn1"]').click();
      await page.locator('[data-act="learn"]').click();
      // Ngồi trong cây lâu hơn nhịp đóng hộ của bot: cây vẫn phải còn đó
      await page.waitForTimeout(2500);
      ok(await page.locator('.st-node[data-id="cn1"]').count() === 1, 'cây kỹ năng mở trong lượt bot không bị bot đóng hộ');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
      await page.locator('.st-close').click().catch(() => {});
      const me = (await S()).players[0];
      ok(me.skills.includes('cn1'), `người thật học "cn1" trong lượt bot (kỹ năng: ${me.skills.join(',')})`);
      learnedOffTurn = true;
    }
    const titles = await page.locator('#modal-root .scrim.show .modal-title').allTextContents();
    const now = Date.now();
    for (const t of titles) if (!openSince.has(t)) openSince.set(t, now);
    for (const [t, at] of openSince) {
      if (!titles.includes(t)) { openSince.delete(t); continue; }
      if (now - at > 9000) {
        // Hộp dành cho người thật (đấu giá, chống đỡ…) giữa lượt bot là đúng — trả lời rồi đi tiếp
        botStalls.push(t);
        await answerTop();
        openSince.delete(t);
      }
    }
    await page.waitForTimeout(400);
    continue;
  }

  openSince.clear();
  // Lượt người (cả lúc bốc thăm): trả lời hộp thoại, rồi bấm nút hành động
  if (await page.locator('#modal-root .scrim.show').count()) {
    await answerTop();
    await page.waitForTimeout(500);
    continue;
  }
  if (!s?.order) { await page.waitForTimeout(300); continue; }
  const key = `${s.turnNo}:${s.rolled}`;
  const roll = page.locator('#actions button', { hasText: /Lắc xí ngầu|Kết thúc lượt/ }).first();
  if (await roll.count() && !s.busy) {
    if (key !== lastTurnKey) { humanTurns += 1; lastTurnKey = key; }
    await roll.click().catch(() => {});
  }
  await page.waitForTimeout(400);
  if (humanTurns >= 8 && botTurnsSeen.size >= 14) break;
}

const end = await S();
console.log('  ·', end.players.map((p) => `${p.name}: ${p.money}$ ô ${p.pos}${p.bankrupt ? ' (vỡ nợ)' : ''} [${p.skills.join(',')}]`).join(' | '));
ok(botTurnsSeen.size >= 10 || end.over, `bot đi được ${botTurnsSeen.size} lượt`);
ok(humanTurns >= 4 || end.over, `người thật đi được ${humanTurns} lượt`);
ok(learnedOffTurn, 'đã thử học kỹ năng ngoài lượt');
ok(handoffs === 0, `không có màn chuyền máy (${handoffs})`);
console.log('  · hộp phải bấm hộ trong lượt bot:', botStalls.length ? botStalls.join(' | ') : '(không có)');
ok(errors.length === 0, `không lỗi trang${errors.length ? ':\n' + errors.join('\n') : ''}`);

await browser.close();
console.log(fails ? `\n✗ ${fails} kiểm tra hỏng` : '\n✓ tất cả đạt');
process.exit(fails ? 1 : 0);
