/**
 * Hội Đồng Hồn Ma (bản một máy): luật mở phiên, ghi phiếu, rút theo phiếu,
 * và hộp bầu chạy thật trên bàn cờ.
 *
 * Chạy: cần dev server ở cổng 5178
 *   node tests/ghost-vote.mjs
 */
import { launchChrome } from './launch.mjs';
import { playRollOff } from './rolloff.mjs';

const BASE = 'http://localhost:5178/';
const errors = [];
const fails = [];
const ok = (cond, label, extra = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${label}${extra ? ` — ${extra}` : ''}`);
  if (!cond) fails.push(label);
};

const browser = await launchChrome();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(BASE, { waitUntil: 'networkidle' });

/* ============================================================ 1 · luật thuần */

console.log('\n▸ 1. Luật: mở phiên, ghi phiếu, rút theo phiếu');
const pure = await page.evaluate(async () => {
  const { GameState } = await import('/src/core/state.js');
  const E = await import('/src/core/events.js');
  const { GHOST_VOTE, EVENT_BY_ID } = await import('/src/data/events.js');
  const { snapshot, applySnapshot } = await import('/src/core/serialize.js');
  const out = {};
  const st = new GameState(['A', 'B', 'C', 'D'], null, { events: 'chuan' });
  st.laps = 99;
  st.pressure = 10;                       // 10/13 ≈ 77%
  out.noGhost = E.ghostVoteDue(st);
  st.bankrupt(2); st.bankrupt(3);
  out.due = E.ghostVoteDue(st);
  st.pressure = 5;                        // 38%
  out.lowPressure = E.ghostVoteDue(st);
  out.lowButFired = E.ghostVoteDue(st, true);
  st.pressure = 10;

  const gv = E.openGhostVote(st);
  out.cards = gv.cards;
  out.cardsUsable = gv.cards.every((id) => E.usable(st, EVENT_BY_ID[id]));
  out.cardsDistinct = new Set(gv.cards).size === gv.cards.length;
  out.dueAgain = E.ghostVoteDue(st, true);

  const [c0, c1] = gv.cards;
  out.aliveVote = E.castGhostVote(st, { n: gv.n, seat: 0, id: c0 });
  out.foreignCard = E.castGhostVote(st, { n: gv.n, seat: 2, id: 'khong-co' });
  out.staleVote = E.castGhostVote(st, { n: gv.n + 1, seat: 2, id: c0 });
  out.vote = E.castGhostVote(st, { n: gv.n, seat: 2, id: c0 });
  out.revote = E.castGhostVote(st, { n: gv.n, seat: 2, id: c1 });
  out.tallyRevote = E.ghostTally(st.ghostVote);

  // Ảnh chụp mang phiếu sang máy khác
  const back = applySnapshot(new GameState(['A', 'B', 'C', 'D'], null, { events: 'chuan' }),
    JSON.parse(JSON.stringify(snapshot(st))));
  out.snap = JSON.stringify(back.ghostVote) === JSON.stringify(st.ghostVote);

  // Tỉ lệ ra: thẻ "hội chợ" luôn dùng được, đặt thẳng vào phiếu
  const rate = (votes) => {
    let hit = 0;
    const N = 6000;
    for (let i = 0; i < N; i++) {
      st.ghostVote = { n: st.eventsFired, cards: ['hoi-cho', 'quy-cong-phat-chan'], votes: { ...votes } };
      st.eventPile = ['hoi-cho', 'quy-cong-phat-chan'];
      if (E.ghostPick(st)?.id === 'hoi-cho') hit += 1;
    }
    return hit / N;
  };
  out.rate1 = rate({ 2: 'hoi-cho' });
  out.rate2 = rate({ 2: 'hoi-cho', 3: 'hoi-cho' });
  out.rate0 = rate({});
  out.perVote = GHOST_VOTE.perVote;

  // Trúng thì rút khỏi chồng bài
  const saved = GHOST_VOTE.perVote;
  GHOST_VOTE.perVote = 1e9;
  st.ghostVote = { n: st.eventsFired, cards: ['hoi-cho', 'quy-cong-phat-chan'], votes: { 2: 'hoi-cho' } };
  st.eventPile = ['an-xa', 'hoi-cho', 'lam-phat'];
  out.pick = E.ghostPick(st)?.id;
  out.pileAfter = st.eventPile;
  // Phiếu của chu kỳ trước không tính
  st.ghostVote = { n: st.eventsFired - 1, cards: ['hoi-cho', 'an-xa'], votes: { 2: 'hoi-cho' } };
  out.oldCycle = E.ghostPick(st);
  // Thẻ được bầu mà hết dùng được (Ân Xá khi không ai ngồi tù) thì bỏ phiếu ấy
  st.ghostVote = { n: st.eventsFired, cards: ['an-xa', 'hoi-cho'], votes: { 2: 'an-xa' } };
  out.unusable = E.ghostPick(st);
  GHOST_VOTE.perVote = saved;

  // Tắt sự kiện thì không họp
  const off = new GameState(['A', 'B', 'C'], null, { events: 'off' });
  off.laps = 99; off.bankrupt(2);
  out.off = E.ghostVoteDue(off, true);
  return out;
});
ok(pure.noGhost === false, 'chưa ai phá sản thì không họp');
ok(pure.due === true, 'có hồn ma, thanh ≥ 70% thì họp');
ok(pure.lowPressure === false, 'thanh dưới 70% thì chưa họp');
ok(pure.lowButFired === true, 'vừa nổ thẻ thì họp ngay dù thanh còn thấp');
ok(pure.cards.length === 3 && pure.cardsDistinct && pure.cardsUsable, 'bốc 3 thẻ khác nhau, thẻ nào cũng dùng được',
  pure.cards.join(','));
ok(pure.dueAgain === false, 'mỗi chu kỳ họp một lần');
ok(pure.aliveVote === false, 'người còn sống không bầu được');
ok(pure.foreignCard === false, 'không bầu được thẻ ngoài ba thẻ');
ok(pure.staleVote === false, 'phiếu sai phiên bị bỏ');
ok(pure.vote === true && pure.revote === true
  && JSON.stringify(pure.tallyRevote) === JSON.stringify({ [pure.cards[1]]: 1 }),
'bầu lại thì phiếu sau đè phiếu trước', JSON.stringify(pure.tallyRevote));
ok(pure.snap, 'ảnh chụp mang theo phiên họp và phiếu');
const p1 = 1.5 / 2.5, p2 = 3 / 4;
ok(Math.abs(pure.rate1 - p1) < 0.03, `một phiếu ra ≈ ${Math.round(p1 * 100)}%`, pure.rate1.toFixed(3));
ok(Math.abs(pure.rate2 - p2) < 0.03, `hai phiếu dồn một thẻ ra ≈ ${p2 * 100}%`, pure.rate2.toFixed(3));
ok(pure.rate0 === 0, 'không ai bầu thì không rút theo phiếu');
ok(pure.pick === 'hoi-cho' && !pure.pileAfter.includes('hoi-cho') && pure.pileAfter.length === 2,
  'thẻ trúng phiếu được rút khỏi chồng bài', JSON.stringify(pure.pileAfter));
ok(pure.oldCycle === null, 'phiếu của chu kỳ trước không tính');
ok(pure.unusable === null, 'thẻ được bầu mà hết dùng được thì bỏ qua');
ok(pure.off === false, 'tắt Thời Cuộc thì không họp');

/* ===================================================== 2 · hộp bầu trên bàn */

console.log('\n▸ 2. Hộp bầu trên bàn cờ một máy');
await page.locator('.scrim.show button.btn', { hasText: 'Chơi trên một máy' }).click();
await page.waitForTimeout(1500);
await page.locator('.count-btn[data-n="4"]').click();
await page.getByRole('button', { name: 'Khai cuộc' }).click();
await page.waitForTimeout(2600);
await playRollOff(page);
await page.waitForTimeout(600);

// Chưa ai phá sản: hết lượt ở 77% không mở hộp
await page.evaluate(() => {
  const c = window.__monopoly.controller;
  const s = c.state;
  c.ghosts.ms = 4000;
  s.laps = 99; s.pressure = 10; s.dryTurn = false;
  c.guard(() => c.endTurn());
});
await page.waitForTimeout(1500);
ok(await page.locator('#ghost-council').count() === 0, 'không có hồn ma thì không mở hộp');

const seats = await page.evaluate(() => {
  const c = window.__monopoly.controller;
  const s = c.state;
  const ghosts = s.players.filter((p) => p.id !== s.turn).slice(0, 2).map((p) => p.id);
  for (const g of ghosts) s.bankrupt(g);
  s.ghostVote = null;
  s.pressure = 10; s.dryTurn = false;
  c.hud.refresh();
  c.guard(() => c.endTurn());
  return ghosts;
});
ok(await page.locator('.gc-layer.show').waitFor({ timeout: 8000 }).then(() => true).catch(() => false),
  'có hồn ma, thanh ≥ 70%: hộp bầu hiện');
ok(await page.locator('.gc-card').count() === 3, 'hộp có 3 thẻ');
ok(await page.locator('.gc-seat').count() === 2, 'bản một máy có hàng chọn hai hồn ma');
ok(await page.locator('.gc-bar i').count() === 1, 'có thanh thời gian ngang');
const notBlocked = await page.evaluate(() => {
  const s = window.__monopoly.controller.state;
  return !s.players[s.turn].bankrupt;
});
ok(notBlocked, 'lượt đã trao cho người còn sống trong lúc hộp còn mở');

const first = await page.locator('.gc-card').nth(0).getAttribute('data-id');
const second = await page.locator('.gc-card').nth(1).getAttribute('data-id');
await page.locator('.gc-card').nth(0).click();
await page.waitForTimeout(250);
await page.locator('.gc-card').nth(1).click();
await page.waitForTimeout(250);
const votes = await page.evaluate(() => window.__monopoly.controller.state.ghostVote?.votes);
ok(votes?.[seats[0]] === first && votes?.[seats[1]] === second,
  'bầu xong hồn ma đầu thì tự chuyển sang hồn ma kế', JSON.stringify(votes));
ok(await page.locator('.gc-card.mine').count() === 1 && await page.locator('.gc-card.voted').count() === 2,
  'thẻ được bầu sáng lên, dấu "ĐÃ BẦU" ở thẻ của hồn ma đang chọn');
ok(await page.locator('.gc-seat.done').count() === 2, 'hai hồn ma đã bầu được đánh dấu');

ok(await page.locator('#ghost-council').waitFor({ state: 'detached', timeout: 8000 }).then(() => true).catch(() => false),
  'hết giờ thì hộp tự đóng');

/* ============================================== 3 · thẻ ra theo phiếu bầu */

console.log('\n▸ 3. Ép nổ: thẻ ra theo phiếu, phiên kế mở ngay');
await page.waitForFunction(() => !window.__monopoly.controller.busy, null, { timeout: 15000 });
await page.evaluate(async (id) => {
  const c = window.__monopoly.controller;
  const s = c.state;
  const { GHOST_VOTE } = await import('/src/data/events.js');
  GHOST_VOTE.perVote = 1e9;
  // Dồn cả hai phiếu vào thẻ không mở hộp hỏi ai
  s.ghostVote.cards[0] = id;
  for (const k of Object.keys(s.ghostVote.votes)) s.ghostVote.votes[k] = id;
  s.pressure = 999;
  c.guard(() => c.endTurn());
}, 'hoi-cho');
ok(await page.locator('.event-card .ev-ghost').waitFor({ timeout: 15000 }).then(() => true).catch(() => false),
  'mặt thẻ ghi "Hội Đồng Hồn Ma bầu thẻ này"');
ok((await page.locator('.event-card .event-title').innerText()) === 'HỘI CHỢ ĐẤU XẢO', 'thẻ ra đúng thẻ được bầu');
ok(await page.locator('.gc-layer.show').waitFor({ timeout: 15000 }).then(() => true).catch(() => false),
  'nổ xong thì phiên họp cho lần sau mở ngay');
const after = await page.evaluate(() => {
  const s = window.__monopoly.controller.state;
  return { n: s.ghostVote?.n, fired: s.eventsFired, votes: Object.keys(s.ghostVote?.votes ?? {}).length };
});
ok(after.n === after.fired && after.votes === 0, 'phiên mới mang số chu kỳ mới, chưa có phiếu', JSON.stringify(after));
await page.evaluate(async () => { (await import('/src/data/events.js')).GHOST_VOTE.perVote = 1.5; });

/* ====================================================== 4 · màn ngang điện thoại */

console.log('\n▸ 4. Màn ngang điện thoại');
await page.setViewportSize({ width: 844, height: 390 });
await page.waitForTimeout(600);
const fit = await page.evaluate(() => {
  const r = document.querySelector('.gc-panel')?.getBoundingClientRect();
  return r && r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth;
});
ok(fit, 'hộp bầu nằm gọn trong màn 844×390');

await browser.close();
console.log(`\nLỗi console: ${errors.length ? errors.join('\n') : 'không có'}`);
if (errors.length) fails.push('lỗi console');
console.log(fails.length ? `\n✗ ${fails.length} mục hỏng: ${fails.join('; ')}` : '\n✓ Hội Đồng Hồn Ma: tất cả đều ổn');
process.exit(fails.length ? 1 : 0);
