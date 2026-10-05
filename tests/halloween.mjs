/**
 * Chủ đề Halloween: kiểm luật thuần (thẻ riêng chủ đề chỉ ra ở đúng chủ đề,
 * Bị Nguyền / Xác Sống / Trăng Máu chặn đúng tiền thuê, Phù Thuỷ chỉ đổi hai lô
 * hợp lệ, bia mộ nhớ đúng ô và vòng phá sản qua ảnh chụp) rồi kiểm luồng chạy
 * thật trên bàn cờ — chọn chủ đề, nhạc Danse Macabre, quân bộ xương, bí ngô
 * sáng theo số nhà, mạng nhện ô thế chấp, bia mộ mọc ở ô phá sản, thẻ Bị
 * Nguyền, Xác Sống hỏi mời thầy pháp, Phù Thuỷ đổi chủ hai ô.
 *
 * Cần dev server đang chạy ở cổng 5178.
 */
import { launchChrome } from './launch.mjs';
import { playRollOff } from './rolloff.mjs';
import { checkHalloweenSongs } from '../src/audio/halloweenSongs.js';

const errors = [];
const fails = [];
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? '✓' : '✗'} ${name}${extra ? ` — ${extra}` : ''}`);
  if (!cond) fails.push(name);
};

/* -------------------------------------------------------- bản nhạc (Node) */

const songErr = checkHalloweenSongs();
ok('Danse Macabre đủ phách mỗi ô nhịp, hợp âm và nốt đều hợp lệ', songErr.length === 0, songErr.join('; '));

/* ------------------------------------------------------------- trình duyệt */

const browser = await launchChrome();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
const wait = (ms) => page.waitForTimeout(ms);
const clickModal = (text) => page.locator('.scrim.show button.btn', { hasText: text }).first().click({ timeout: 15000 });

await page.goto('http://localhost:5178/', { waitUntil: 'networkidle' });
const solo = page.locator('.scrim.show button.btn', { hasText: 'Chơi trên một máy' });
await solo.waitFor({ timeout: 30000 });
await solo.click();
await wait(1500);

/* ------------------------------------------------- luật thuần (chạy trong trang) */

const pure = await page.evaluate(async () => {
  const { GameState } = await import('/src/core/state.js');
  const ev = await import('/src/core/events.js');
  const { usableCard, moveDest } = await import('/src/core/cards.js');
  const { CHANCE, CHEST, Deck } = await import('/src/data/cards.js');
  const { EVENT_BY_ID } = await import('/src/data/events.js');
  const { snapshot, fromSnapshot } = await import('/src/core/serialize.js');
  const out = {};

  const plain = new GameState(['A', 'B', 'C'], null, { events: 'hon-loan' });
  const spook = new GameState(['A', 'B', 'C'], null, { events: 'hon-loan', theme: 'halloween' });
  for (const st of [plain, spook]) {
    for (const id of [1, 3]) st.owner.set(id, 0);
    st.houses.set(1, 2);
  }

  // Thẻ Thời Cuộc riêng chủ đề
  const ids = ['xac-song', 'phu-thuy', 'trang-mau'];
  const seenPlain = new Set();
  for (let i = 0; i < 300; i++) seenPlain.add(ev.drawEvent(plain)?.id);
  out.plainDrawsSpook = ids.some((id) => seenPlain.has(id));
  out.zombiePlain = ev.usable(plain, EVENT_BY_ID['xac-song']);
  out.zombieSpook = ev.usable(spook, EVENT_BY_ID['xac-song']);

  // Thẻ Cơ Hội / Khí Vận riêng chủ đề: ván mặc định không bao giờ rút trúng
  const deck = new Deck(CHEST, 'chest');
  let drew = false;
  for (let i = 0; i < 400; i++) if (deck.draw((c) => usableCard(plain, c, 0))?.card.theme === 'halloween') drew = true;
  out.plainDrawsCard = drew;
  out.curseCards = [...CHANCE, ...CHEST].filter((c) => c.type === 'curse').length;

  // Bị Nguyền: chủ đất bị nguyền thì thu 0, người khác vẫn thu
  const rent0 = spook.rentFor(1, 7);
  spook.addMod({ id: 'bi-nguyen:0', type: 'curse', seat: 0, turns: 3 });
  out.curse = { before: rent0, after: spook.rentFor(1, 7), block: spook.rentBlock(1) };
  // Một vòng (3 lượt ở bàn 3 người) thì lời nguyền hết
  for (let i = 0; i < 3; i++) spook.nextTurn();
  out.curseGone = !spook.isCursed(0) && spook.rentFor(1, 7) === rent0;

  // Trăng Máu: ô có nhà +50%, ô trống (3) không thu
  const r1 = spook.rentFor(1, 7);
  spook.addMod({ id: 'trang-mau', type: 'blood-moon', mult: 1.5, turns: 6 });
  out.moon = { built: spook.rentFor(1, 7), base: r1, bare: spook.rentFor(3, 7), block: spook.rentBlock(3) };
  spook.mods = [];

  // Xác Sống: kế hoạch hỏi mỗi ô 60% giá xây; ô bị chiếm thu 0
  const zplan = ev.planEvent(spook, EVENT_BY_ID['xac-song']);
  out.zplan = zplan && { group: zplan.group, costs: zplan.tiles.map((l) => l.cost), turns: zplan.turns };
  spook.addMod({ id: 'xac-song:1', type: 'zombie', tiles: [1], turns: 6 });
  out.zombieRent = spook.rentFor(1, 7);
  out.zombieBlock = spook.rentBlock(1);
  spook.mods = [];

  // Phù Thuỷ: hai lô trống của hai người, giá chênh ≤ 20%, khu chưa xây
  const w = new GameState(['A', 'B'], null, { theme: 'halloween' });
  w.owner.set(6, 0); w.owner.set(8, 1);         // 100$ và 100$
  w.owner.set(39, 1);                           // 400$: lệch quá 20% với lô 100$
  out.witchPairs = ev.witchPairs(w, EVENT_BY_ID['phu-thuy']).map((p) => p.join('-'));
  w.owner.set(9, 0); w.houses.set(9, 1);        // khu xanh nhạt của A đã xây: lô 6 bị loại
  w.owner.delete(8); w.owner.set(8, 0);
  w.houses.delete(9); w.owner.delete(9);
  out.witchUsable = ev.usable(w, EVENT_BY_ID['phu-thuy']);

  // Bộ xương dẫn đường: lô trống gần nhất phía trước, hết lô trống thì về ô 0
  const guide = CHANCE.find((c) => c.nearest === 'free');
  const g = new GameState(['A', 'B'], null, { theme: 'halloween' });
  out.guideFrom0 = moveDest(guide, 0, g).tile;
  g.owner.set(1, 0); g.owner.set(3, 0);
  out.guideSkipOwned = moveDest(guide, 0, g).tile;

  // Vòng chơi và bia mộ qua ảnh chụp
  const b = new GameState(['A', 'B', 'C'], null, { theme: 'halloween' });
  for (let i = 0; i < 7; i++) b.nextTurn();     // 7 lượt ở bàn 3 người: sang vòng 3
  out.round = b.round;
  b.players[1].pos = 24;
  b.bankrupt(1);
  const back = fromSnapshot(JSON.parse(JSON.stringify(snapshot(b))));
  out.grave = { pos: back.players[1].outPos, round: back.players[1].outRound, roundState: back.round };
  return out;
});

ok('300 lần rút ở ván mặc định không ra sự kiện Halloween nào', pure.plainDrawsSpook === false);
ok('Xác Sống không dùng được ở ván mặc định, dùng được ở ván Halloween',
  pure.zombiePlain === false && pure.zombieSpook === true);
ok('400 lần rút Khí Vận ở ván mặc định không ra thẻ Halloween', pure.plainDrawsCard === false);
ok('có thẻ Bị Nguyền ở cả Cơ Hội lẫn Khí Vận', pure.curseCards === 2, String(pure.curseCards));
ok('Bị Nguyền: chủ đất không thu được tiền thuê',
  pure.curse.before > 0 && pure.curse.after === 0 && pure.curse.block === 'curse', JSON.stringify(pure.curse));
ok('Bị Nguyền hết sau một vòng', pure.curseGone);
ok('Trăng Máu: ô có nhà +50%, đất trống không thu',
  pure.moon.built === Math.round(pure.moon.base * 1.5) && pure.moon.bare === 0 && pure.moon.block === 'blood-moon',
  JSON.stringify(pure.moon));
ok('Xác Sống: kế hoạch hỏi 60% giá xây mỗi ô (30$, 30$)',
  JSON.stringify(pure.zplan?.costs) === '[30,30]', JSON.stringify(pure.zplan));
ok('Xác Sống chiếm ô thì ô ấy không thu tiền thuê', pure.zombieRent === 0 && pure.zombieBlock === 'zombie');
ok('Phù Thuỷ: chỉ cặp lô 100$–100$ hợp lệ, lô 400$ bị loại vì lệch giá',
  JSON.stringify(pure.witchPairs) === '["6-8"]', JSON.stringify(pure.witchPairs));
ok('Phù Thuỷ: hai lô cùng một chủ thì không có cặp nào', pure.witchUsable === false);
ok('Bộ xương dẫn đường tới lô trống gần nhất (ô 1)', pure.guideFrom0 === 1, String(pure.guideFrom0));
ok('Bộ xương dẫn đường bỏ qua lô đã có chủ (ô 5)', pure.guideSkipOwned === 5, String(pure.guideSkipOwned));
ok('7 lượt ở bàn 3 người là vòng 3', pure.round === 3, String(pure.round));
ok('bia mộ nhớ ô 24 và vòng 3 qua ảnh chụp',
  pure.grave.pos === 24 && pure.grave.round === 3 && pure.grave.roundState === 3, JSON.stringify(pure.grave));

/* --------------------------------------------------------- chọn chủ đề, vào ván */

await page.locator('.count-btn[data-n="3"]').click();
await page.selectOption('[data-theme-pick]', 'halloween');
await wait(500);
ok('chọn Halloween ở hộp bày bàn thì trang đổi chủ đề ngay',
  await page.evaluate(() => document.documentElement.dataset.theme) === 'halloween');
ok('nhạc chờ đổi sang Danse Macabre', await page.evaluate(() => window.__audioProbe.songName) === 'Danse Macabre');
ok('hộp thoại có mạng nhện và dơi treo',
  await page.evaluate(() => document.querySelectorAll('.scrim.show .spook-frame .spook-web').length === 2
    && !!document.querySelector('.scrim.show .spook-frame .spook-bat')));

/* Mạng nhện của hộp thoại nằm ngoài mép hộp: không chồng lên khung chữ nào */
const webOut = await page.evaluate(() => {
  const m = document.querySelector('.scrim.show .modal').getBoundingClientRect();
  return [...document.querySelectorAll('.scrim.show .spook-web')].every((w) => {
    const r = w.getBoundingClientRect();
    return r.bottom <= m.top + 6;
  });
});
ok('mạng nhện hộp thoại nằm phía trên mép hộp', webOut);

await page.getByRole('button', { name: 'Khai cuộc' }).click();
await wait(2600);
await playRollOff(page);
await wait(800);

const inGame = await page.evaluate(() => {
  const c = window.__monopoly.controller;
  const sc = c.scene;
  return {
    theme: c.state.settings.theme,
    skel: sc.tokens.every((t) => t.texture.key.startsWith('tok-halloween-')),
    frames: sc.textures.exists(`${sc.tokens[0].texture.key}-w0`),
    walkers: sc.walkers.length,
    bats: sc.bats.length,
    litBefore: sc.glowLayer.length,
  };
});
ok('ván chơi chủ đề Halloween', inGame.theme === 'halloween');
ok('quân cờ là bộ xương, có khung bước đi', inGame.skel && inGame.frames);
ok('nghĩa địa có một bộ xương cho mỗi người, có dơi', inGame.walkers === 3 && inGame.bats > 0,
  `${inGame.walkers} xương, ${inGame.bats} dơi`);
ok('chưa có nhà thì bí ngô tắt hết', inGame.litBefore === 0, String(inGame.litBefore));

/* Bí ngô sáng: mỗi quả sáng là hai ảnh (quầng + quả), khách sạn thêm ngọn lửa */
const lamps = await page.evaluate(() => {
  const c = window.__monopoly.controller;
  const st = c.state;
  const n = () => c.scene.glowLayer.length;
  st.owner.set(1, 0); st.owner.set(3, 0); st.owner.set(39, 1);
  st.houses.set(1, 2);
  c.scene.refresh(st);
  const two = n();
  st.houses.set(39, 5);
  c.scene.refresh(st);
  const plusHotel = n();
  st.houses.delete(1); st.houses.delete(39);
  c.scene.refresh(st);
  return { two, plusHotel, after: n() };
});
ok('2 nhà sáng 2 bí ngô, khách sạn sáng đủ 5 quả và ngọn lửa tím',
  lamps.two === 4 && lamps.plusHotel === 4 + 11 && lamps.after === 0, JSON.stringify(lamps));

/* Mạng nhện ô thế chấp nằm trong hai góc mái cổng, không chạm biển tên */
const web = await page.evaluate(() => {
  const c = window.__monopoly.controller;
  const st = c.state;
  st.mortgaged.add(3);
  c.scene.refresh(st);
  const parts = c.scene.mortParts.get(3);
  const webs = parts.tag.list.filter((o) => o.texture?.key === 'web-corner');
  st.mortgaged.delete(3);
  c.scene.refresh(st);
  const sw = c.scene.size / 12;
  return { n: webs.length, maxR: Math.max(...webs.map((w) => w.displayWidth)) / sw };
});
ok('ô thế chấp có hai mạng nhện góc, bán kính ≤ 0,22 bề ngang ô',
  web.n === 2 && web.maxR <= 0.221, JSON.stringify(web));

/* ------------------------------------------------------------- thẻ Bị Nguyền */

const cursed = await page.evaluate(async () => {
  const c = window.__monopoly.controller;
  const card = c.state.decks.chance.cards.find((x) => x.type === 'curse');
  window.__done = c.cardCurse(c.state.current, 'chance', card, 'CƠ HỘI', 4242);
  return c.state.turn;
});
await clickModal('Đành chịu');
await page.evaluate(() => window.__done);
const curseState = await page.evaluate((s) => {
  const st = window.__monopoly.controller.state;
  const badge = document.querySelector(`.pcard:nth-child(${s + 1}) .pcard-meta`)?.textContent ?? '';
  return { cursed: st.isCursed(s), badge: [...document.querySelectorAll('.pcard-meta')].some((el) => el.textContent.includes('BỊ NGUYỀN')) };
}, cursed);
ok('rút thẻ Bị Nguyền thì người rút bị nguyền', curseState.cursed);
ok('thẻ người chơi có nhãn BỊ NGUYỀN', curseState.badge);

const curseMsg = await page.evaluate(async (s) => {
  const c = window.__monopoly.controller;
  const st = c.state;
  const other = st.players.find((p) => p.id !== s);
  st.owner.set(1, s);
  const titles = [];
  const show = c.bc.show.bind(c.bc);
  c.bc.show = (t, ...rest) => { titles.push(t); return show(t, ...rest); };
  const before = other.money;
  other.pos = 1;
  await c.resolveTile(other, { a: 3, b: 4, sum: 7 });
  c.bc.show = show;
  st.mods = st.mods.filter((m) => m.type !== 'curse');
  return { titles, paid: before - other.money };
}, cursed);
ok('đáp vào đất người bị nguyền: báo BỊ NGUYỀN, không mất tiền',
  curseMsg.titles.includes('BỊ NGUYỀN') && curseMsg.paid === 0, JSON.stringify(curseMsg));

/* ------------------------------------------------- Xác Sống: một lần để mặc */

const zSeat = await page.evaluate(() => {
  const c = window.__monopoly.controller;
  const st = c.state;
  const me = st.turn;
  for (const id of [1, 3]) st.owner.set(id, me);
  st.houses.set(1, 1);
  c.scene.refresh(st);
  st.eventPile = ['xac-song'];
  window.__done = c.events.run();
  return me;
});
await clickModal('Đã rõ');
await clickModal('Để xác sống ở lại');
await page.evaluate(() => window.__done);
const zombie = await page.evaluate(() => {
  const st = window.__monopoly.controller.state;
  return { z1: st.isZombied(1), z3: st.isZombied(3), rent: st.rentFor(1, 7) };
});
ok('để xác sống ở lại: cả hai ô bị chiếm, không thu tiền thuê',
  zombie.z1 && zombie.z3 && zombie.rent === 0, JSON.stringify(zombie));
await page.evaluate(() => { const st = window.__monopoly.controller.state; st.mods = []; st.houses.delete(1); });

/* --------------------------------------------- Phù Thuỷ: hai ô đổi chủ cho nhau */

const swap = await page.evaluate(async () => {
  const c = window.__monopoly.controller;
  const st = c.state;
  for (const id of [...st.owner.keys()]) st.owner.delete(id);
  const [a, b] = [st.players[0].id, st.players[1].id];
  st.owner.set(6, a); st.owner.set(8, b);
  c.scene.refresh(st);
  st.eventPile = ['phu-thuy'];
  window.__done = c.events.run();
  return { a, b };
});
await clickModal('Đã rõ');
await page.evaluate(() => window.__done);
const swapped = await page.evaluate(() => {
  const st = window.__monopoly.controller.state;
  return [st.owner.get(6), st.owner.get(8)];
});
ok('Phù Thuỷ: ô 6 và ô 8 đổi chủ cho nhau', swapped[0] === swap.b && swapped[1] === swap.a,
  JSON.stringify({ swap, swapped }));

/* ------------------------------------------- phá sản: bia mộ mọc ở đúng ô */

const tomb = await page.evaluate(async () => {
  const c = window.__monopoly.controller;
  const st = c.state;
  const p = st.players.find((x) => x.id !== st.turn && !x.bankrupt);
  p.pos = 24;
  await c.doBankrupt(p.id);
  const key = [...c.scene.tombs.keys()][0];
  return { n: c.scene.tombs.size, key, outPos: p.outPos, walkers: c.scene.walkers.length };
});
ok('người phá sản có bia mộ ở ô 24', tomb.n === 1 && tomb.key.split(':')[1] === '24' && tomb.outPos === 24,
  JSON.stringify(tomb));
ok('nghĩa địa bớt một bộ xương', tomb.walkers === 2, String(tomb.walkers));

/* ---------------------------------------------------------------- kết */

ok('không có lỗi console', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
if (fails.length) {
  console.log(`\n${fails.length} kiểm tra hỏng`);
  process.exit(1);
}
console.log('\nChủ đề Halloween: mọi kiểm tra đều qua');
