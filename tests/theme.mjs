/**
 * Chủ đề Giáng Sinh: kiểm luật thuần (thẻ riêng chủ đề chỉ ra ở đúng chủ đề,
 * Bão Tuyết mất đúng số cấp nhà, quà Noel chia đúng) rồi kiểm cả luồng chạy
 * thật trên bàn cờ — chọn chủ đề ở hộp bày bàn, nhạc chờ đổi bài, quân đội mũ,
 * đèn LED, bóc thẻ hộp quà, Bão Tuyết hỏi xúc tuyết, Đường Đóng Băng trượt quân.
 *
 * Cần dev server đang chạy ở cổng 5178.
 */
import { launchChrome } from './launch.mjs';
import { playRollOff } from './rolloff.mjs';
import { checkSongs } from '../src/audio/xmasSongs.js';

const errors = [];
const fails = [];
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? '✓' : '✗'} ${name}${extra ? ` — ${extra}` : ''}`);
  if (!cond) fails.push(name);
};

/* -------------------------------------------------------- bản nhạc (Node) */

const songErr = checkSongs();
ok('ba bài Giáng Sinh đủ phách mỗi ô nhịp, hợp âm và nốt đều hợp lệ', songErr.length === 0, songErr.join('; '));

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

ok('mặc định là chủ đề gốc', await page.evaluate(() => (document.documentElement.dataset.theme ?? 'default') === 'default'));
ok('nhạc chờ mặc định là bản phòng trà', await page.evaluate(() => window.__audioProbe.songName) === 'Phòng trà');

/* ------------------------------------------------- luật thuần (chạy trong trang) */

const pure = await page.evaluate(async () => {
  const { GameState } = await import('/src/core/state.js');
  const ev = await import('/src/core/events.js');
  const { usableCard, giftShares } = await import('/src/core/cards.js');
  const { CHEST, Deck } = await import('/src/data/cards.js');
  const { EVENT_BY_ID } = await import('/src/data/events.js');
  const out = {};

  const build = (st) => {
    for (const id of [1, 3]) st.owner.set(id, 0);
    st.houses.set(1, 3);
    st.houses.set(3, 5);
  };
  const plain = new GameState(['A', 'B', 'C'], null, { events: 'hon-loan' });
  const xmas = new GameState(['A', 'B', 'C'], null, { events: 'hon-loan', theme: 'christmas' });
  const junk = new GameState(['A', 'B'], null, { theme: 'khong-co' });
  build(plain); build(xmas);
  out.junkTheme = junk.settings.theme;

  const snow = EVENT_BY_ID['bao-tuyet'];
  const ice = EVENT_BY_ID['duong-dong-bang'];
  out.snowPlain = ev.usable(plain, snow);
  out.snowXmas = ev.usable(xmas, snow);
  out.icePlain = ev.usable(plain, ice);

  // Rút 300 lần ở ván mặc định: hai thẻ Giáng Sinh không bao giờ ra
  const seen = new Set();
  for (let i = 0; i < 300; i++) seen.add(ev.drawEvent(plain)?.id);
  out.plainDrawsXmas = seen.has('bao-tuyet') || seen.has('duong-dong-bang');
  const seenX = new Set();
  for (let i = 0; i < 300; i++) seenX.add(ev.drawEvent(xmas)?.id);
  out.xmasDrawsSnow = seenX.has('bao-tuyet');

  // Bão tuyết: 3 nhà mất 1 cấp, khách sạn mất 2, tiền xúc tuyết 90% giá xây phần mất
  const plan = ev.planEvent(xmas, snow);
  out.lots = plan.tiles.map((l) => ({ id: l.id, lose: l.lose, save: l.save }));

  // Đường đóng băng thành hiệu ứng 'ice' có hạn
  out.iceMod = ev.planEvent(xmas, ice).mod;
  out.iceLabel = ev.modLabel(out.iceMod);

  // Thẻ quà Noel chỉ dùng được ở ván Giáng Sinh; chia gấp đôi cho người ít tiền mặt nhất
  const gift = CHEST.find((c) => c.type === 'gift');
  out.giftPlain = usableCard(plain, gift, 0);
  out.giftXmas = usableCard(xmas, gift, 0);
  xmas.players[2].money = 100;
  out.shares = giftShares(xmas, gift).map((s) => s.amount);
  const deck = new Deck(CHEST, 'chest');
  let drew = false;
  for (let i = 0; i < 300; i++) if (deck.draw((c) => usableCard(plain, c, 0))?.card.type === 'gift') drew = true;
  out.plainDrawsGift = drew;
  return out;
});

ok('chủ đề lạ trong settings quy về mặc định', pure.junkTheme === 'default', pure.junkTheme);
ok('Bão Tuyết không dùng được ở ván mặc định', pure.snowPlain === false);
ok('Bão Tuyết dùng được ở ván Giáng Sinh khi có nhà', pure.snowXmas === true);
ok('Đường Đóng Băng không dùng được ở ván mặc định', pure.icePlain === false);
ok('300 lần rút ở ván mặc định không ra thẻ Giáng Sinh nào', pure.plainDrawsXmas === false);
ok('ván Giáng Sinh rút ra được Bão Tuyết', pure.xmasDrawsSnow === true);
ok('Bão Tuyết: 3 nhà mất 1 cấp, khách sạn mất 2',
  JSON.stringify(pure.lots.map((l) => l.lose)) === '[1,2]', JSON.stringify(pure.lots));
ok('Bão Tuyết: tiền xúc tuyết = 90% giá xây phần mất (45$, 90$)',
  JSON.stringify(pure.lots.map((l) => l.save)) === '[45,90]', JSON.stringify(pure.lots));
ok('Đường Đóng Băng thành hiệu ứng ice có hạn', pure.iceMod.type === 'ice' && pure.iceMod.turns > 0, pure.iceLabel);
ok('thẻ quà Noel không dùng được ở ván mặc định', pure.giftPlain === false);
ok('thẻ quà Noel dùng được ở ván Giáng Sinh', pure.giftXmas === true);
ok('quà Noel: người ít tiền mặt nhất nhận gấp đôi', JSON.stringify(pure.shares) === '[50,50,100]', JSON.stringify(pure.shares));
ok('300 lần rút Khí Vận ở ván mặc định không ra thẻ quà Noel', pure.plainDrawsGift === false);

/* --------------------------------------------------------- chọn chủ đề, vào ván */

await page.locator('.count-btn[data-n="3"]').click();
await page.selectOption('[data-theme-pick]', 'christmas');
await wait(500);
ok('chọn Giáng Sinh ở hộp bày bàn thì trang đổi chủ đề ngay',
  await page.evaluate(() => document.documentElement.dataset.theme) === 'christmas');
ok('nhạc chờ đổi sang Jingle Bells', await page.evaluate(() => window.__audioProbe.songName) === 'Jingle Bells');
ok('hộp thoại có viền đèn LED',
  await page.evaluate(() => document.querySelectorAll('.scrim.show .led-frame .led').length) > 12);

await page.getByRole('button', { name: 'Khai cuộc' }).click();
await wait(2600);
await playRollOff(page);
await wait(800);

const inGame = await page.evaluate(() => {
  const c = window.__monopoly.controller;
  const sc = c.scene;
  return {
    theme: c.state.settings.theme,
    menu: window.__audioProbe.menuMode,
    hats: sc.tokens.every((t) => t.texture.key.startsWith('tok-christmas-')),
    flakes: sc.flakes.length,
    // Chưa ai có nhà: không bóng đèn nào bật
    litBefore: sc.glowLayer.length,
  };
});

/* Đèn chỉ bật ở ô có nhà: 2 nhà bật 2 bóng, khách sạn bật đủ 5 bóng. Mỗi bóng
   sáng là hai ảnh (quầng + lõi). */
const bulbs = await page.evaluate(() => {
  const c = window.__monopoly.controller;
  const st = c.state;
  const count = () => c.scene.glowLayer.length / 2;
  st.owner.set(1, 0); st.owner.set(3, 0); st.owner.set(39, 1);
  st.houses.set(1, 2);
  c.scene.refresh(st);
  const two = count();
  st.houses.set(39, 5);
  c.scene.refresh(st);
  const plusHotel = count();
  st.owner.delete(1); st.owner.delete(3); st.owner.delete(39);
  st.houses.delete(1); st.houses.delete(39);
  c.scene.refresh(st);
  return { two, plusHotel, after: count() };
});
ok('ván chơi chủ đề Giáng Sinh', inGame.theme === 'christmas');
ok('vào ván thì tắt nhạc nền', inGame.menu === false);
ok('quân cờ dùng texture có mũ Noel', inGame.hats);
ok('chưa có nhà thì dây đèn tắt hết', inGame.litBefore === 0, String(inGame.litBefore));
ok('2 nhà bật 2 bóng, khách sạn bật đủ 5 bóng',
  bulbs.two === 2 && bulbs.plusHotel === 7 && bulbs.after === 0, JSON.stringify(bulbs));
ok('có tuyết rơi trên bàn cờ', inGame.flakes > 0, String(inGame.flakes));

/* ------------------------------------------------------- thẻ quà Noel chạy thật */

await page.evaluate(() => {
  const c = window.__monopoly.controller;
  const card = c.state.decks.chest.cards.find((x) => x.type === 'gift');
  window.__done = c.cardGift(c.state.current, 'chest', card, 'KHÍ VẬN', 4242);
});
await wait(1200);
ok('băng chuyền bóc thẻ bọc ô thành hộp quà',
  await page.evaluate(() => document.querySelectorAll('.scrim.show .co-cell .co-lid').length) > 10);
await clickModal('Nhận quà');
await page.evaluate(() => window.__done);
ok('quà Noel: bàn bằng tiền thì ai cũng nhận 100$',
  JSON.stringify(await page.evaluate(() => window.__monopoly.controller.state.players.map((p) => p.money))) === '[850,850,850]');

/* --------------------------------------------- Bão Tuyết: một lần chịu, một lần xúc */

const setupSnow = () => page.evaluate(() => {
  const c = window.__monopoly.controller;
  const st = c.state;
  const me = st.turn;
  for (const id of [1, 3]) st.owner.set(id, me);
  st.houses.set(1, 3);
  st.houses.set(3, 5);
  c.scene.refresh(st);
  c.hud.refresh();
  st.eventPile = ['bao-tuyet'];
  window.__done = c.events.run();
  return me;
});

let seat = await setupSnow();
await clickModal('Đã rõ');
await clickModal('Để mặc mái sập');
await page.evaluate(() => window.__done);
const after = await page.evaluate(() => [1, 3].map((id) => window.__monopoly.controller.state.housesOn(id)));
ok('để mặc mái sập: 3 nhà còn 2, khách sạn còn 3 nhà', JSON.stringify(after) === '[2,3]', JSON.stringify(after));

const money0 = await page.evaluate((s) => window.__monopoly.controller.state.players[s].money, seat);
seat = await setupSnow();
await clickModal('Đã rõ');
await clickModal('Xúc tuyết');
await page.evaluate(() => window.__done);
const kept = await page.evaluate((s) => ({
  houses: [1, 3].map((id) => window.__monopoly.controller.state.housesOn(id)),
  money: window.__monopoly.controller.state.players[s].money,
}), seat);
ok('xúc tuyết: nhà còn nguyên', JSON.stringify(kept.houses) === '[3,5]', JSON.stringify(kept.houses));
ok('xúc tuyết: trả 135$ (45$ + 90$)', money0 - kept.money === 135, `${money0} → ${kept.money}`);

/* ------------------------------------------------------- Đường Đóng Băng */

await page.evaluate(() => {
  const c = window.__monopoly.controller;
  c.state.eventPile = ['duong-dong-bang'];
  window.__done = c.events.run();
});
await clickModal('Đã rõ');
await page.evaluate(() => window.__done);
ok('Đường Đóng Băng nằm trên bàn', await page.evaluate(() => window.__monopoly.controller.state.hasMod('ice')));

const slid = await page.evaluate(async () => {
  const c = window.__monopoly.controller;
  const titles = [];
  const show = c.bc.show.bind(c.bc);
  c.bc.show = (t, ...rest) => { titles.push(t); return show(t, ...rest); };
  const p = c.state.current;
  // Cố định xí ngầu 3 + 4 (không đôi) để biết quân phải tới đâu
  const rnd = Math.random;
  let k = 0;
  const seq = [2.5 / 6, 3.5 / 6];
  Math.random = () => (k < 2 ? seq[k++] : rnd());
  const from = p.pos;
  const run = c.takeRoll();
  await new Promise((r) => setTimeout(r, 8000));
  Math.random = rnd;
  c.bc.show = show;
  return { from, to: p.pos, titles, run: !!run };
});
const moved = (slid.to - slid.from + 40) % 40;
ok('lắc 7 trên đường đóng băng thì đi 8 hoặc 9 ô', moved === 8 || moved === 9, `${slid.from} → ${slid.to}`);
ok('có dòng thông báo trượt băng', slid.titles.includes('ĐƯỜNG ĐÓNG BĂNG'), slid.titles.join(', '));

/* ---------------------------------------------------------------- kết */

ok('không có lỗi console', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
if (fails.length) {
  console.log(`\n${fails.length} kiểm tra hỏng`);
  process.exit(1);
}
console.log('\nChủ đề Giáng Sinh: mọi kiểm tra đều qua');
