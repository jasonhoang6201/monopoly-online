/**
 * Chơi với máy: một người thật ngồi ghế 0, ghế 1 bot Khó, ghế 2 bot Dễ.
 *
 * Kiểm:
 *   1. Hộp bày bàn có nút ghế xoay vòng Người → Dễ → Vừa → Khó, ghế máy đổi
 *      tên mặc định, controller nhận đúng cấp từng ghế.
 *   2. Lượt của bot tự chạy hết — không ai bấm hộ hộp thoại nào của nó.
 *   3. Người thật học kỹ năng được **trong lượt bot** bằng nút cây kỹ năng ở
 *      hàng tiện ích, và hộp cây ấy không bị bot đóng hộ.
 *   4. Không có màn "Chuyền máy" (bàn chỉ một người thật).
 *   5. Bot Khó dùng thẻ cưỡng chế mua trong túi để gom đủ bộ.
 *   6. Bàn hai người thật + một bot: màn chuyền máy giữa lượt bot không bị
 *      bot đóng hộ, chuyền sang ghế máy thì bỏ qua, nút cây kỹ năng hỏi ai học.
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
const kind = (i) => page.locator(`.seat-kind[data-b="${i}"]`);
await kind(1).click();
ok((await kind(1).textContent()).includes('Dễ'), 'bấm một lần: 🤖 Dễ');
await kind(1).click();
ok((await kind(1).textContent()).includes('Vừa'), 'bấm hai lần: 🤖 Vừa');
await kind(1).click();
ok((await kind(1).textContent()).includes('Khó'), 'bấm ba lần: 🤖 Khó');
await kind(2).click();
for (let k = 0; k < 4; k++) await kind(0).click();
ok((await kind(0).textContent()).includes('Người'), 'bấm bốn lần: quay về 🙂 Người');
ok(await page.locator('.seat-kind.on').count() === 2, 'hai ghế giao cho máy');
ok(await page.locator('#name-list input').nth(1).inputValue() === 'Máy 2', 'ghế máy đổi tên mặc định thành "Máy 2"');
await page.locator('#name-list input').nth(0).fill('Tôi');
await page.getByRole('button', { name: 'Khai cuộc' }).click();
await page.waitForFunction(() => window.__monopoly?.controller?.state);
ok(await page.evaluate(() => {
  const b = window.__monopoly.controller.bot;
  return !b.is(0) && b.lv(1).key === 'hard' && b.lv(2).key === 'easy';
}), 'controller nhận đúng cấp: ghế 1 Khó, ghế 2 Dễ');

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


/**
 * Chơi tiếp cho tới khi `stop()` đúng hoặc hết `ms`. Ghế trong `humans` là
 * người thật: tới lượt thì bấm hộ; hộp nào nằm quá 9 giây (hộp hỏi người giữa
 * lượt bot) cũng bấm hộ. Lượt bot thì để bot tự đi.
 */
async function drive(ms, stop, humans = [0]) {
  const t = Date.now();
  const since = new Map();
  while (Date.now() - t < ms) {
    if (await stop()) return true;
    const s = await S();
    if (s?.over) return false;
    const titles = await page.locator('#modal-root .scrim.show .modal-title').allTextContents();
    const now = Date.now();
    for (const x of titles) if (!since.has(x)) since.set(x, now);
    for (const [x, at] of since) if (!titles.includes(x)) since.delete(x);
    const human = !s?.order || humans.includes(s.turn);
    if (titles.length && (human || [...since.values()].some((at) => now - at > 9000))) {
      await answerTop();
      since.clear();
      await page.waitForTimeout(400);
      continue;
    }
    if (human && s?.order && !s.busy) {
      await page.locator('#actions button', { hasText: /Lắc xí ngầu|Kết thúc lượt/ }).first().click({ timeout: 500 }).catch(() => {});
    }
    await page.waitForTimeout(400);
  }
  return false;
}

console.log('▸ 5. Bot Khó lôi thẻ cưỡng chế mua trong túi ra dùng');
if (end.over || end.players[1].bankrupt) {
  console.log('  · ván đã hết hoặc bot Khó đã vỡ nợ, bỏ qua');
} else {
  /* Bày một khu màu chưa ai xây: bot Khó giữ mọi ô trừ một, ô còn lại của
     người thật. Cưỡng chế ô ấy là bot đủ bộ, đúng chỗ `cardPlay` nhắm. */
  const target = await page.evaluate(async () => {
    const { GROUP_TILES } = await import('/src/data/board.js');
    const { DECKS } = await import('/src/data/cards.js');
    const st = window.__monopoly.controller.state;
    const ids = Object.values(GROUP_TILES).find((g) => g.length >= 2
      && g.every((id) => st.housesOn(id) === 0 && !st.isMortgaged(id)));
    if (!ids) return null;
    ids.forEach((id, i) => st.owner.set(id, i === 0 ? 0 : 1));
    st.players[1].money = Math.max(st.players[1].money, 3000);
    st.takeCard(1, 'chance', DECKS.chance.findIndex((c) => c.type === 'seize'));
    window.__monopoly.controller.hud.refresh();
    return ids[0];
  });
  ok(target != null, `bày được khu màu để thử (ô ${target})`);
  const owner = () => page.evaluate((id) => window.__monopoly.controller.state.owner.get(id), target);
  const took = await drive(3 * 60000, async () => (await owner()) === 1);
  ok(took, `bot Khó cưỡng chế ô ${target} cho đủ bộ`);
  ok(await page.evaluate(() => !window.__monopoly.controller.state.players[1].cards
    .some((r) => r.kind === 'chance')), 'thẻ cưỡng chế đã rời túi bot');
}

console.log('▸ 6. Bàn hai người thật + một bot');
await page.goto('http://localhost:5178/', { waitUntil: 'networkidle' });
await solo.waitFor({ timeout: 30000 });
await solo.click();
await page.locator('.count-btn[data-n="3"]').click();
await kind(2).click();
await page.locator('#name-list input').nth(0).fill('An');
await page.locator('#name-list input').nth(1).fill('Bình');
await page.getByRole('button', { name: 'Khai cuộc' }).click();
// `order` chỉ có sau màn bốc thăm, mà màn ấy do `drive` bấm hộ
await page.waitForFunction(() => window.__monopoly?.controller?.state);
const inBotTurn = await drive(2 * 60000, async () => (await S())?.turn === 2, [0, 1]);
ok(inBotTurn, 'tới được lượt bot');
if (inBotTurn) {
  // Màn chuyền máy cho người thật hiện giữa lượt bot thì bot không được đóng hộ
  await page.evaluate(async () => {
    const { handoff } = await import('/src/ui/modal.js');
    window.__handoff = handoff('An', '#fff', 'thử');
  });
  await page.waitForTimeout(2500);
  ok(await page.locator('.scrim.show .handoff').count() === 1, 'màn chuyền máy cho người thật nằm yên giữa lượt bot');
  await page.locator('.scrim.show button.btn', { hasText: 'Tiếp tục' }).click();
  ok(await page.evaluate(async () => {
    const { handoff } = await import('/src/ui/modal.js');
    return Promise.race([handoff('Máy 3', '#fff'), new Promise((r) => setTimeout(() => r('mở'), 300))]);
  }) === true, 'chuyền máy sang ghế máy thì bỏ qua');

  // Nút cây kỹ năng giữa lượt bot: hỏi người nào học
  await page.locator('#skill-btn:not([hidden])').click();
  const ask = page.locator('.scrim.show .modal-title', { hasText: 'Ai học kỹ năng?' });
  await ask.waitFor({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(2000);
  ok(await ask.count() === 1, 'lượt bot ở bàn hai người thật: hỏi ai học kỹ năng, bot không đóng hộ');
  await page.locator('.scrim.show button.btn', { hasText: 'Bình' }).click().catch(() => {});
  ok(await page.locator('.st-title-dot').count() === 1
    && (await page.locator('.scrim.show .modal-title').last().textContent()).includes('Bình'),
    'chọn Bình thì mở cây kỹ năng của Bình');
  await page.keyboard.press('Escape');
  await page.locator('.st-close').click().catch(() => {});
}

ok(errors.length === 0, `không lỗi trang${errors.length ? ':\n' + errors.join('\n') : ''}`);

await browser.close();
console.log(fails ? `\n✗ ${fails} kiểm tra hỏng` : '\n✓ tất cả đạt');
process.exit(fails ? 1 : 0);
