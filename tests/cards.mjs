/**
 * Bộ thẻ CƠ HỘI / KHÍ VẬN sau khi có thêm loại thẻ mới: tiền mừng chia đều,
 * vé ra tù, thuế nhà cửa, và mấy thẻ đụng vào nhà đất người khác.
 *
 * Kiểm luật thuần trước (chạy trong trang, vì `data/board.js` nạp JSON), rồi
 * cho vài thẻ chạy thật trên bàn cờ để chắc phần diễn không vướng.
 *
 * Cần dev server đang chạy ở cổng 5178.
 */
import fs from 'node:fs';
import { launchChrome } from './launch.mjs';
import { playRollOff } from './rolloff.mjs';
import { pickOnBoard, markedTiles, picking } from './pick.mjs';

const errors = [];
const fails = [];
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? '✓' : '✗'} ${name}${extra ? ` — ${extra}` : ''}`);
  if (!cond) fails.push(name);
};

/**
 * Bài kiểm này soi vòng quay bằng **danh sách ô đã sáng** chứ không cần ảnh,
 * nên mặc định không chụp gì cả — chụp mỗi lần chạy chỉ tổ phình nguồn.
 * Muốn xem bằng mắt thì đặt `SHOT_DIR=...`, hoặc chạy `npm run demo:spin`.
 */
const SHOT_DIR = process.env.SHOT_DIR ?? null;
if (SHOT_DIR) {
  fs.rmSync(SHOT_DIR, { recursive: true, force: true });
  fs.mkdirSync(SHOT_DIR, { recursive: true });
}

const browser = await launchChrome();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto('http://localhost:5178/', { waitUntil: 'networkidle' });
const solo = page.locator('.scrim.show button.btn', { hasText: 'Chơi trên một máy' });
await solo.waitFor({ timeout: 30000 });
await solo.click();
await page.waitForTimeout(1800);

// 3 người, tắt Thời Cuộc để sự kiện không chen ngang bài kiểm này
await page.locator('.count-btn[data-n="3"]').click();
await page.locator('.rule-btn[data-lv="off"]').click();
await page.getByRole('button', { name: 'Khai cuộc' }).click();
await page.waitForTimeout(2600);
await playRollOff(page);

/* ---------------------------------------------------------------- luật thuần */

const r = await page.evaluate(async () => {
  const c = window.__monopoly.controller;
  const st = c.state;
  const cr = await import('/src/core/cards.js');
  const { CHANCE, CHEST } = await import('/src/data/cards.js');
  const { BOARD, GROUP_TILES } = await import('/src/data/board.js');
  const out = {};

  const find = (deck, type) => deck.find((x) => (x.type ?? 'bank') === type);

  // Tiền mừng chia đều cho những người còn lại
  out.each3 = cr.shareEach(st, 0, 150);            // 3 người → 2 người góp
  st.players[2].bankrupt = true;
  out.each2 = cr.shareEach(st, 0, 150);            // còn 1 người góp
  st.players[2].bankrupt = false;
  out.collectNeedsOthers = cr.usableCard(st, { type: 'collect', amount: 100 }, 0);

  // Thuế nhà cửa tính đầu nhà, đầu khách sạn
  const { brown, light_blue: light } = GROUP_TILES;
  brown.forEach((id) => st.owner.set(id, 1));
  st.houses.set(brown[0], 3);
  st.houses.set(brown[1], 5);
  const bill = cr.repairBill(st, 1, { perHouse: 25, perHotel: 100 });
  out.repair = bill.houses === 3 && bill.hotels === 1 && bill.amount === 3 * 25 + 100;
  out.repairSkipsEmpty = !cr.usableCard(st, find(CHEST, 'repair'), 2);

  // Mấy thẻ đụng nhà đất: chỉ nhắm được vào người khác
  const strike = cr.cardTargets(st, { type: 'demolish' }, 0);
  out.strikeOnlyOthers = strike.every((id) => st.owner.get(id) !== 0)
    && strike.every((id) => st.housesOn(id) > 0)
    && strike.includes(brown[0]);
  out.ownerCantSelfStrike = cr.cardTargets(st, { type: 'demolish' }, 1).length === 0;

  // Thẻ dỡ nhà chọn tới mức khu, rồi bốc thăm ô trong khu ấy
  out.demolishGroups = cr.demolishGroups(st, { type: 'demolish' }, 0);
  const two = cr.demolishPicks(st, { type: 'demolish', levels: 2 }, 0, 'brown');
  out.demolishTwoTiles = two.hits.length === 2
    && two.hits.every((h) => h.levels === 1)
    && new Set(two.hits.map((h) => h.id)).size === 2
    && two.hits.every((h) => brown.includes(h.id));
  // Khu chỉ còn một ô có nhà: ô ấy chịu cả hai cấp
  st.houses.delete(brown[0]);
  const lone = cr.demolishPicks(st, { type: 'demolish', levels: 2 }, 0, 'brown');
  out.demolishLone = lone.hits.length === 1 && lone.hits[0].id === brown[1]
    && lone.hits[0].levels === 2;
  st.houses.set(brown[0], 3);

  // Cưỡng chiếm: chỉ lô trống, chưa thế chấp, và phải đủ tiền mặt đền
  light.forEach((id) => st.owner.set(id, 1));
  st.mortgaged.add(light[0]);
  st.players[0].money = 0;
  out.seizeNeedsCash = cr.cardTargets(st, { type: 'seize' }, 0).length === 0;
  // Đủ tiền trả lô này nhưng chưa đủ cho lô kia: chỉ lô trả nổi mới nhắm được
  st.players[0].money = cr.seizePrice(light[1]);
  out.seizeNeedsFullPrice = cr.cardTargets(st, { type: 'seize' }, 0).includes(light[1]);
  st.players[0].money = cr.seizePrice(light[1]) - 1;
  out.seizeShortOfCash = !cr.cardTargets(st, { type: 'seize' }, 0).includes(light[1]);
  st.players[0].money = 5000;
  const seize = cr.cardTargets(st, { type: 'seize' }, 0);
  out.seizeTargets = seize.includes(light[1]) && !seize.includes(light[0])
    && !seize.includes(brown[0]);
  out.seizePrice = cr.seizePrice(light[1]) === Math.round(BOARD[light[1]].price * 1.25);

  // Giải toả: nhắm được cả đất của chính mình, đền giá gốc +20%
  st.owner.set(GROUP_TILES.orange[0], 0);
  const resume = cr.cardTargets(st, { type: 'resume' }, 0);
  out.resumeIncludesOwn = resume.includes(GROUP_TILES.orange[0]);
  out.resumeSkipsBuilt = !resume.includes(brown[0]) && !resume.includes(light[0]);
  out.resumePrice = cr.resumePrice(light[1], { rate: 1.2 })
    === Math.round(BOARD[light[1]].price * 1.2);

  // Dỡ nhà thì không đền gì; khách sạn hạ xuống thành bốn căn
  const bankBefore = st.bankHotels;
  st.demolish(brown[1]);
  out.demolishHotel = st.housesOn(brown[1]) === 4 && st.bankHotels === bankBefore + 1;
  out.clearHouses = st.clearHouses(brown[1]) === 4 && st.housesOn(brown[1]) === 0;

  // Bốn vé ra tù, chia đều hai bộ
  out.tickets = [CHANCE, CHEST].map((d) => d.filter((x) => x.type === 'jail-free').length);

  // Thẻ giữ túi thì lúc nào rút cũng được, kể cả khi chưa có mục tiêu nào
  st.owner.clear(); st.houses.clear();
  out.keepableAlwaysDrawn = ['demolish', 'seize', 'resume', 'resume-random']
    .every((t) => cr.usableCard(st, { type: t }, 0));
  brown.forEach((id) => st.owner.set(id, 1));
  st.houses.set(brown[0], 3);
  st.houses.set(brown[1], 5);
  light.forEach((id) => st.owner.set(id, 1));
  st.mortgaged.add(light[0]);
  st.owner.set(GROUP_TILES.orange[0], 0);

  // Thẻ dỡ nhà mang theo số cấp phải dỡ
  out.levels = [cr.demolishLevels({ type: 'demolish' }),
    cr.demolishLevels(CHANCE.find((x) => x.type === 'demolish'))];

  // Lý do chưa dùng được: nói rõ đang chờ điều gì
  out.jailReason = cr.useReason(st, { type: 'jail-free' }, 0);
  st.players[0].inJail = true;
  out.jailOkInJail = cr.useReason(st, { type: 'jail-free' }, 0).ok;
  st.players[0].inJail = false;

  // Vé ra tù: rút rồi thì lá ấy rời bộ, xài xong mới trả về
  const idx = CHANCE.findIndex((x) => x.type === 'jail-free');
  st.takeCard(0, 'chance', idx);
  out.ticketGone = st.decks.chance.gone.has(idx) && !st.decks.chance.pile.includes(idx)
    && st.players[0].cards.length === 1;

  // Bảng túi thẻ đọc được cả nội dung lá lẫn tình trạng dùng được
  const bag = cr.inventoryOf(st, 0);
  out.bag = bag.length === 1 && bag[0].card.type === 'jail-free' && bag[0].ok === false;
  // Xáo lại giữa chừng cũng không lôi được lá đang cầm ra
  st.decks.chance.shuffle();
  out.ticketStaysGone = !st.decks.chance.pile.includes(idx);

  // Ảnh chụp mang theo vé và mấy lá đang bị giữ
  const { snapshot, fromSnapshot } = await import('/src/core/serialize.js');
  const snap = snapshot(st);
  const back = fromSnapshot(snap);
  out.roundTrip = back.players[0].cards.length === 1
    && back.decks.chance.gone.has(idx)
    && !back.decks.chance.pile.includes(idx);
  // Ảnh chụp cũ (chưa có túi thẻ) vẫn dựng lại được
  const legacy = { ...snap, players: snap.players.map((p) => ({ ...p })) };
  delete legacy.gone;
  legacy.players.forEach((p) => delete p.cards);
  const old = fromSnapshot(legacy);
  out.legacySnapshot = old.players[0].cards.length === 0 && old.decks.chance.gone.size === 0;

  st.dropCard(0);
  out.ticketBack = st.decks.chance.pile.includes(idx)
    && st.decks.chance.gone.size === 0 && st.players[0].cards.length === 0;

  // Vé của người vỡ nợ trả về bộ chứ không chôn theo
  st.takeCard(2, 'chest', CHEST.findIndex((x) => x.type === 'jail-free'));
  st.bankrupt(2);
  out.ticketOnBankrupt = st.decks.chest.gone.size === 0 && st.players[2].cards.length === 0;
  st.players[2].bankrupt = false;

  // Mọi thẻ trong cả hai bộ đều khai báo đúng loại
  const known = ['bank', 'collect', 'repair', 'jail-free', 'demolish',
    'seize', 'resume', 'resume-random'];
  out.badType = [...CHANCE, ...CHEST].filter((x) => !known.includes(cr.cardType(x))).length;
  out.hasNew = ['collect', 'repair', 'jail-free', 'demolish', 'seize',
    'resume', 'resume-random'].every((t) => !!find(CHANCE.concat(CHEST), t));
  // Bộ bài không còn thẻ phát mãi
  out.noForceSell = [...CHANCE, ...CHEST].every((x) => cr.cardType(x) !== 'force-sell');
  /* Mọi loại giữ túi đều có tên, biểu tượng và một câu công dụng — bảng túi
     thẻ in đúng hai dòng ấy chứ không in lời văn bối cảnh. */
  const { CARD_KINDS, KEEPABLE, cardName, cardEffect } = await import('/src/data/cards.js');
  out.kindsNamed = [...KEEPABLE].every((t) => !!CARD_KINDS[t]?.name && !!CARD_KINDS[t]?.sigil
    && cardEffect({ type: t, levels: 1 }).length > 20);
  out.demolishNamed = [1, 2].map((n) => cardName({ type: 'demolish', levels: n }));

  return out;
});

ok('tiền mừng chia đều cho người còn lại', r.each3 === 75 && r.each2 === 150,
  `${r.each3} / ${r.each2}`);
ok('còn một mình thì không rút được thẻ tiền mừng', r.collectNeedsOthers === true);
ok('thuế nhà cửa tính đầu nhà, đầu khách sạn', r.repair);
ok('chưa có nhà thì bỏ qua thẻ thuế nhà', r.repairSkipsEmpty);
ok('thẻ dỡ nhà chỉ nhắm vào ô có nhà của người khác', r.strikeOnlyOthers);
ok('không tự nhắm vào đất của chính mình', r.ownerCantSelfStrike);
ok('không đủ tiền đền thì không cưỡng chế mua được', r.seizeNeedsCash);
ok('đủ đúng giá đền thì cưỡng chế mua được, thiếu một đồng thì không',
  r.seizeNeedsFullPrice && r.seizeShortOfCash);
ok('cưỡng chế mua chỉ lô trống, chưa thế chấp', r.seizeTargets);
ok('tiền đền cưỡng chế mua bằng giá gốc +25%', r.seizePrice);
ok('thẻ dỡ nhà nhắm được vào khu có nhà của người khác',
  r.demolishGroups.includes('brown'), r.demolishGroups.join());
ok('thẻ dỡ 2 nhà rải vào hai ô khác nhau trong khu', r.demolishTwoTiles);
ok('khu chỉ còn một ô có nhà thì ô ấy chịu cả hai cấp', r.demolishLone);
ok('giải toả nhắm được cả đất của mình', r.resumeIncludesOwn);
ok('giải toả bỏ qua ô đã xây nhà', r.resumeSkipsBuilt);
ok('tiền đền giải toả là giá gốc +20%', r.resumePrice);
ok('dỡ khách sạn thì hạ xuống 4 nhà', r.demolishHotel);
ok('dỡ sạch nhà trên một ô', r.clearHouses);
ok('bốn vé ra tù chia đều hai bộ', r.tickets[0] === 2 && r.tickets[1] === 2, r.tickets.join('/'));
ok('thẻ giữ túi thì lúc nào rút cũng được', r.keepableAlwaysDrawn);
ok('thẻ dỡ nhà mang theo số cấp', r.levels[0] === 1 && r.levels[1] === 2, r.levels.join('/'));
ok('vé ra tù nói rõ phải ngồi tù mới dùng được',
  r.jailReason.ok === false && r.jailReason.reason.includes('Khám Lớn') && r.jailOkInJail);
ok('bảng túi thẻ đọc được nội dung lá đang giữ', r.bag);
ok('rút vé ra tù thì lá ấy rời bộ bài', r.ticketGone && r.ticketStaysGone);
ok('ảnh chụp mang theo vé và lá đang bị giữ', r.roundTrip);
ok('ảnh chụp cũ vẫn dựng lại được', r.legacySnapshot);
ok('xài vé xong thì lá trả về bộ', r.ticketBack);
ok('vỡ nợ thì vé trả về bộ', r.ticketOnBankrupt);
ok('mọi thẻ đều khai đúng loại', r.badType === 0);
ok('cả hai bộ đều có đủ loại thẻ mới', r.hasNew);
ok('mọi thẻ giữ túi đều có tên, biểu tượng và câu công dụng', r.kindsNamed);
ok('bộ bài không còn thẻ phát mãi', r.noForceSell);
ok('thẻ dỡ nhà gọi tên theo số cấp nó dỡ',
  r.demolishNamed[0] === 'Dỡ 1 nhà' && r.demolishNamed[1] === 'Dỡ 2 nhà',
  r.demolishNamed.join(' / '));

/* ---------------------------------------------------- vài thẻ chạy thật trên bàn */

/**
 * Bày lại thanh nút. Bài kiểm gọi thẳng `resolveCard` chứ không đi qua trọn
 * một nước đi, nên thanh nút không tự dựng lại như lúc chơi thật.
 */
const refreshBar = async () => {
  await waitIdle();
  await page.evaluate(() => window.__monopoly.controller.restoreActions());
  await page.waitForTimeout(250);
};

/** Chờ ván rảnh tay: đang chạy dở một nước đi thì `guard` nuốt mất lệnh sau. */
const waitIdle = () => page.waitForFunction(
  () => !window.__monopoly.controller.busy, null, { timeout: 45000 });

/** Ép người đang đi rút đúng một lá. */
const forceCard = async (kind, type) => {
  await waitIdle();
  return page.evaluate(async ([k, t]) => {
    const c = window.__monopoly.controller;
    const st = c.state;
    const deck = st.decks[k];
    const i = deck.cards.findIndex((x) => (x.type ?? 'bank') === t);
    if (i < 0) throw new Error(`bộ ${k} không có thẻ loại ${t}`);
    deck.pile = [i];
    c.guard(() => c.resolveCard(st.current, k));
  }, [kind, type]);
};

// Thẻ tiền mừng: hai người kia mỗi người góp một nửa
await page.evaluate(() => {
  const st = window.__monopoly.controller.state;
  st.players.forEach((p) => { p.money = 2000; p.bankrupt = false; });
});
const moneyBefore = await page.evaluate(() => window.__monopoly.controller.state.players.map((p) => p.money));
await forceCard('chest', 'collect');
await page.waitForTimeout(900);
ok('mặt thẻ ghi rõ mỗi người góp bao nhiêu',
  (await page.locator('.fate-note').innerText()).includes('góp'));
await page.locator('.scrim.show .modal-foot button.btn').first().click();
await page.waitForTimeout(3500);
const moneyAfter = await page.evaluate(() => window.__monopoly.controller.state.players.map((p) => p.money));
const turnSeat = await page.evaluate(() => window.__monopoly.controller.state.turn);
const gained = moneyAfter[turnSeat] - moneyBefore[turnSeat];
const paid = moneyBefore.reduce((s, m, i) => s + (i === turnSeat ? 0 : m - moneyAfter[i]), 0);
ok('tiền mừng do người chơi khác góp, không phải ngân hàng', gained > 0 && gained === paid,
  `+${gained} / −${paid}`);
// Vé ra tù: rút được, cất vào túi, HUD hiện nhãn, xài thì ra tù miễn phí
await forceCard('chance', 'jail-free');
await page.waitForTimeout(900);
ok('mặt thẻ giữ được ghi tên thẻ và công dụng, không kể lể chuyện bộ bài',
  await (async () => {
    const note = await page.locator('.fate-note').innerText();
    return note.includes('Vé ra tù') && note.includes('Khám Lớn') && !note.includes('bộ bài');
  })());
await page.locator('.scrim.show .modal-foot button.btn').first().click();
await page.waitForTimeout(2200);
const ticket = await page.evaluate(() => {
  const st = window.__monopoly.controller.state;
  return { held: st.players[st.turn].cards.length, seat: st.turn };
});
ok('rút được vé ra tù và cất vào túi', ticket.held === 1);
ok('HUD hiện nhãn túi thẻ', await page.locator('.pcard-ticket').first().isVisible());

// Bảng túi thẻ: xem được thẻ đang giữ, và nói rõ vì sao chưa dùng được
await refreshBar();
const bagBtn = page.locator('#actions button', { hasText: 'Túi thẻ' });
ok('thanh nút có nút mở túi thẻ', await bagBtn.isVisible());
await bagBtn.click();
await page.waitForTimeout(700);
ok('túi thẻ bày ra lá đang giữ',
  (await page.locator('.bag-name').first().innerText()).includes('Vé ra tù'));
ok('chưa ngồi tù thì nút Dùng bị khoá kèm lý do',
  await page.locator('.bag-row.off .bag-why').first().isVisible());
await page.locator('.scrim.show .modal-foot button.btn', { hasText: 'Đóng' }).click();
await page.waitForTimeout(600);

// Vào tù rồi bày lại thanh nút: phải có nút xài vé, và bấm là ra tù miễn phí
await page.evaluate(() => {
  const c = window.__monopoly.controller;
  c.state.sendToJail(c.state.current);
  c.hud.refresh();
  c.setTurnActions();
});
await page.waitForTimeout(400);
const ticketBtn = page.locator('#actions button', { hasText: 'Dùng vé ra tù' });
ok('thanh nút có nút xài vé khi ngồi tù', await ticketBtn.isVisible());
const moneyInJail = await page.evaluate(() => window.__monopoly.controller.state.current.money);
await ticketBtn.click();
await page.waitForTimeout(2000);
const jail = await page.evaluate(() => {
  const st = window.__monopoly.controller.state;
  const p = st.players[st.turn];
  return { free: !p.inJail, held: p.cards.length, money: p.money,
           backInDeck: st.decks.chance.gone.size === 0 };
});
ok('xài vé thì ra tù miễn phí', jail.free && jail.held === 0 && jail.money >= moneyInJail,
  JSON.stringify(jail));
ok('vé đã xài quay lại bộ bài', jail.backInDeck);

// Xài xong thì lượt đi tiếp như thường — dọn hộp thoại còn mở (hỏi mua đất…)
await page.waitForTimeout(2500);
for (let i = 0; i < 3; i++) {
  const scrim = page.locator('.scrim.show .modal-foot button.btn').last();
  if (!(await scrim.isVisible().catch(() => false))) break;
  await scrim.click();
  await page.waitForTimeout(1200);
}

/* --------------------------------------------- thẻ dỡ nhà: cất túi rồi mới dùng */

/** Dựng bàn: một ô có nhà của người khác, vài lô trống của cả hai bên. */
const setBoard = () => page.evaluate(() => {
  const c = window.__monopoly.controller;
  const st = c.state;
  const seat = st.turn;
  const other = st.players.find((p) => p.id !== seat && !p.bankrupt).id;
  st.houses.clear();
  st.owner.clear();
  st.mortgaged.clear();
  // Dọn cả túi thẻ: lượt vừa rồi có thể đã nhặt thêm lá khác vào túi
  while (st.players[seat].cards.length) st.dropCard(seat);
  st.owner.set(39, other);
  st.houses.set(39, 3);
  [37, 31, 24, 21].forEach((id, i) => st.owner.set(id, i % 2 ? seat : other));
  st.players.forEach((p) => { p.money = 2000; });
  c.hud.refresh();
  c.scene.refresh(st);
  return { seat, other };
});

/**
 * Bấm qua chuỗi hộp thoại nối nhau (chuyền máy → ghi giá → chốt), chờ cả những
 * quãng chỉ có hoạt cảnh chạy giữa hai hộp. Xong khi ván rảnh tay trở lại.
 */
const clickThrough = async (maxMs = 60000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    await page.waitForTimeout(600);
    // Bảng chọn ô nằm trên bàn cờ chứ không có nền tối — phải bấm vào ô
    if (await picking(page)) { await pickOnBoard(page).catch(() => {}); continue; }
    // Hộp chọn khu màu không có nút ở chân hộp — bấm thẳng vào dòng khu
    const grp = page.locator('.scrim.show .grp-row').first();
    if (await grp.isVisible().catch(() => false)) { await grp.click(); continue; }
    const btn = page.locator('.scrim.show .modal-foot button.btn').first();
    if (await btn.isVisible().catch(() => false)) { await btn.click(); continue; }
    // Không còn hộp nào mà ván cũng rảnh tay → chuỗi hộp thoại đã xong
    if (!(await page.evaluate(() => window.__monopoly.controller.busy))) return true;
  }
  return false;
};

/** Mở túi thẻ và bấm dùng tấm đầu tiên còn dùng được. */
const useFromBag = async () => {
  await refreshBar();
  await page.locator('#actions button', { hasText: 'Túi thẻ' }).click();
  await page.waitForTimeout(700);
  await page.locator('.bag-use:not([disabled])').first().click();
  await page.waitForTimeout(900);
};

await setBoard();
await forceCard('chest', 'demolish');       // thẻ dỡ 1 cấp
await page.waitForTimeout(900);
await page.locator('.scrim.show .modal-foot button.btn').first().click();     // cất vào túi
await page.waitForTimeout(1500);
ok('thẻ dỡ nhà nằm trong túi chứ không nổ ngay', await page.evaluate(() => {
  const st = window.__monopoly.controller.state;
  return st.players[st.turn].cards.length === 1 && st.housesOn(39) === 3;
}));

/** Chọn khu màu trong hộp thẻ dỡ nhà, rồi chờ vòng bốc thăm chạy xong. */
const pickGroup = async (key) => {
  const row = page.locator(`.grp-row[data-g="${key}"]`);
  await row.waitFor({ timeout: 15000 });
  await row.click();
  await page.waitForTimeout(3200);
};

await useFromBag();
ok('thẻ dỡ nhà mời chọn khu màu chứ không chọn ô',
  await page.locator('.grp-list .grp-row').first().isVisible());
const groupKeys = await page.locator('.grp-row').evaluateAll(
  (els) => els.map((e) => e.dataset.g));
ok('chỉ khu có nhà của người khác được bày ra', groupKeys.join() === 'dark_blue',
  groupKeys.join());
/* Vệt sáng kiểu "chỉ trỏ" (`litTiles`) không đụng `markSet` — con trỏ chuột
   giữ nguyên vì đây không phải lời mời bấm vào ô, nên đọc thẳng `marked`. */
const litIds = await page.evaluate(() => [...(window.__monopoly.scene.marked?.ids ?? [])]);
ok('ô trong tầm ngắm sáng sẵn trên bàn cờ', litIds.join() === '39', litIds.join());
await pickGroup('dark_blue');
const after = await page.evaluate(() => {
  const st = window.__monopoly.controller.state;
  return { houses: st.housesOn(39), owner: st.owner.get(39),
           held: st.players[st.turn].cards.length,
           inDeck: st.decks.chest.gone.size === 0 };
});
ok('dỡ nhà hạ đúng một cấp, đất vẫn của chủ cũ', after.houses === 2 && after.owner !== undefined,
  JSON.stringify(after));
ok('thẻ đã dùng rời túi và trả về bộ', after.held === 0 && after.inDeck);

// Thẻ dỡ 2 cấp của bộ Cơ Hội: khu chỉ có một ô có nhà nên ô ấy chịu cả hai cấp
await page.evaluate(() => { window.__monopoly.controller.state.houses.set(39, 4); });
await forceCard('chance', 'demolish');
await page.waitForTimeout(900);
await page.locator('.scrim.show .modal-foot button.btn').first().click();
await page.waitForTimeout(1400);
await useFromBag();
await pickGroup('dark_blue');
ok('thẻ Cơ Hội dỡ đúng hai cấp', await page.evaluate(() => (
  window.__monopoly.controller.state.housesOn(39) === 2)));

/* ----------------------------------------------- giải toả: chỉ định và bốc thăm */

await setBoard();
await forceCard('chance', 'resume');
await page.waitForTimeout(900);
await page.locator('.scrim.show .modal-foot button.btn').first().click();     // cất vào túi
await page.waitForTimeout(1400);
await useFromBag();
ok('giải toả cũng mời chọn lô trên bàn cờ', await page.locator('.tile-pick').first().isVisible());

// Chốt lô sáng đầu tiên, rồi đối chiếu theo đúng lô đó
const lot = (await markedTiles(page))[0];
const beforeResume = await page.evaluate((id) => {
  const st = window.__monopoly.controller.state;
  const seat = st.owner.get(id);
  return { seat, money: st.players[seat].money };
}, lot);
await pickOnBoard(page, lot);                                                 // chốt lô
// Phiên đấu giá kín: chuyền máy qua từng người, ai cũng để giá 0 → phiên ế
await clickThrough();
await page.waitForTimeout(1200);
const price = await page.evaluate(async (id) => {
  const { BOARD } = await import('/src/data/board.js');
  return BOARD[id].price;
}, lot);
const payout = (await page.evaluate((seat) => window.__monopoly.controller.state.players[seat].money,
  beforeResume.seat)) - beforeResume.money;
ok('chủ lô lãnh tiền đền giá gốc +20%', payout === Math.round(price * 1.2),
  `${payout} / ${Math.round(price * 1.2)}`);
ok('lô đất rời tay chủ cũ, vào phiên đấu giá', await page.evaluate((id) => (
  window.__monopoly.controller.state.owner.get(id) === undefined), lot));

/* ------------------------------------- giải toả bốc thăm + hoạt cảnh quay số */

await setBoard();
await forceCard('chest', 'resume-random');
await page.waitForTimeout(900);
await page.locator('.scrim.show .modal-foot button.btn').first().click();     // cất vào túi
await page.waitForTimeout(1400);

// Chụp lại vòng quay: ô nào đang sáng ở từng khung hình
await page.evaluate(() => {
  const sc = window.__monopoly.controller.scene;
  window.__spin = [];
  const orig = sc.coverTile.bind(sc);
  sc.coverTile = (rect, id) => {
    if (rect === sc.spinGfx) window.__spin.push(id);
    return orig(rect, id);
  };
});
await refreshBar();
await page.locator('#actions button', { hasText: 'Túi thẻ' }).click();
await page.waitForTimeout(700);
await page.locator('.bag-use:not([disabled])').first().click();

// Theo dõi trọn vòng quay, chụp hình kèm theo nếu có chỗ để chụp
for (let i = 0; i < 14; i++) {
  await page.waitForTimeout(260);
  if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/spin-${String(i).padStart(2, '0')}.png` });
}
const spin = await page.evaluate(() => window.__spin ?? []);
ok('vòng quay sáng lần lượt qua nhiều ô', spin.length >= 12, `${spin.length} nhịp`);
ok('vòng quay chạy trọn vài vòng rồi mới dừng',
  new Set(spin).size >= 3 && spin.length >= new Set(spin).size * 2,
  `qua ${new Set(spin).size} ô, dừng ở ${spin.at(-1)}`);
ok('vòng quay chỉ đi qua lô đất trống có chủ', await page.evaluate((ids) => {
  const st = window.__monopoly.controller.state;
  return ids.every((id) => st.housesOn(id) === 0);
}, spin));

await clickThrough();
await page.waitForTimeout(1200);
ok('lô bốc trúng rời tay chủ cũ', await page.evaluate((id) => (
  window.__monopoly.controller.state.owner.get(id) === undefined), spin.at(-1)));
if (SHOT_DIR) console.log(`   ↳ hình vòng quay: ${SHOT_DIR}`);

/* ------------------------------------------------------------------- kết */

console.log('');
if (errors.length) { console.log('Lỗi trong trang:'); errors.forEach((e) => console.log('  ' + e)); }
console.log(fails.length ? `✗ ${fails.length} mục hỏng: ${fails.join(', ')}` : '✓ Tất cả đều đạt');
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
