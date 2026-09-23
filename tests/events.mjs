/**
 * Bộ thẻ THỜI CUỘC: kiểm luật thuần (thanh áp lực, kế hoạch từng thẻ, cấn nợ,
 * hệ số tiền thuê) rồi kiểm một sự kiện chạy thật từ đầu tới cuối trên bàn cờ.
 *
 * Cần dev server đang chạy ở cổng 5178.
 */
import { launchChrome } from './launch.mjs';
import { playRollOff } from './rolloff.mjs';
import { pickOnBoard, picking } from './pick.mjs';

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

// 3 người, nấc Hỗn loạn để sự kiện mở khoá sớm
await page.locator('.count-btn[data-n="3"]').click();
await page.locator('.rule-btn[data-lv="hon-loan"]').click();
await page.waitForTimeout(150);
ok('phòng chờ một máy có nút chọn nấc', await page.locator('.rule-btn.on').innerText() === 'Hỗn loạn');
await page.getByRole('button', { name: 'Khai cuộc' }).click();
await page.waitForTimeout(2600);
await playRollOff(page);

const ctl = () => page.evaluate(() => !!window.__monopoly?.controller);
ok('ván đã mở', await ctl());

/* ---------------------------------------------------------------- luật thuần */

const r = await page.evaluate(async () => {
  const c = window.__monopoly.controller;
  const st = c.state;
  const ev = await import('/src/core/events.js');
  const { BOARD, GROUP_TILES } = await import('/src/data/board.js');
  const out = {};

  out.level = st.settings.events;

  // Bàn còn trống: chưa mở khoá, áp lực không tích
  out.lockedAtStart = !ev.unlocked(st);
  ev.addPressure(st, 10);
  out.noPressureBeforeUnlock = st.pressure === 0;

  // Bán hết đất cho hai người → mở khoá
  const ownable = BOARD.filter((t) => t.ownable);
  ownable.forEach((t, i) => st.owner.set(t.id, i % 2));
  out.unlockedWhenSold = ev.unlocked(st);

  ev.addPressure(st, 5);
  out.pressureCounts = st.pressure === 5;

  // Ngưỡng hạ dần theo số lần đã nổ
  const t0 = ev.threshold(st);
  st.eventsFired = 3;
  const t3 = ev.threshold(st);
  out.thresholdFalls = t3 < t0;
  st.eventsFired = 0;

  // Hệ số tiền thuê: lạm phát + đường mới mở
  const red = GROUP_TILES.red[0];
  st.owner.set(red, 0);
  const base = st.rentFor(red, 7);
  st.addMod({ id: 'lam-phat', type: 'rent', mult: 1.25, turns: 6 });
  const inflated = st.rentFor(red, 7);
  st.addMod({ id: 'mo-duong:red', type: 'group-rent', group: 'red', mult: 1.5, turns: -1 });
  const both = st.rentFor(red, 7);
  out.rentMods = [base, inflated, both];
  out.rentInflates = inflated === Math.round(base * 1.25) && both === Math.round(base * 1.25 * 1.5);

  // Giấy tờ thất lạc thì ô ấy không thu được tiền thuê
  st.addMod({ id: 'mat-giay-to', type: 'frozen', tiles: [red], turns: 4 });
  out.frozenNoRent = st.rentFor(red, 7) === 0;
  st.mods = [];

  // Giới nghiêm chặn xây, bão giá đội giá xây
  const blue = GROUP_TILES.dark_blue;
  blue.forEach((id) => st.owner.set(id, 0));
  st.players[0].money = 5000;
  const cost0 = st.buildCost(blue[0]);
  st.addMod({ id: 'bao-gia', type: 'build', mult: 1.5, turns: 6 });
  out.buildCostUp = st.buildCost(blue[0]) === Math.ceil(cost0 * 1.5);
  st.addMod({ id: 'gioi-nghiem', type: 'freeze-build', turns: 6 });
  out.buildBlocked = st.canBuild(0, blue[0]).ok === false;
  st.mods = [];

  // Lương qua ô Bắt Đầu bị mất mùa cắt một nửa
  const pay0 = st.salary();
  st.addMod({ id: 'mat-mua', type: 'salary', mult: 0.5, turns: 6 });
  out.salaryHalved = st.salary() === Math.round(pay0 * 0.5);
  st.mods = [];

  // Hiệu ứng đếm ngược theo lượt rồi tự hết hạn
  st.addMod({ id: 'x', type: 'rent', mult: 2, turns: 2 });
  st.tickMods(); st.tickMods();
  out.modsExpire = st.mods.length === 0;

  // Cấn nợ tự động: thế chấp trước, đủ tiền thì dừng
  st.players[1].money = 0;
  const before = st.propertiesOf(1).length;
  const raise = ev.autoRaise(st, 1, 300);
  out.autoRaise = raise.ok && st.players[1].money >= 300
    && raise.mortgaged.length > 0 && st.propertiesOf(1).length === before;

  // Mọi thẻ đều lập được kế hoạch, hoặc bị loại đúng lý do
  st.players.forEach((p) => { p.money = 3000; });
  const { EVENTS, EVENT_BY_ID } = await import('/src/data/events.js');
  out.planned = [];
  out.badPlan = [];
  for (const card of EVENTS) {
    const usable = ev.usable(st, card);
    if (!usable) { out.planned.push(`${card.id}:skip`); continue; }
    const plan = ev.planEvent(st, card);
    if (plan === null) out.badPlan.push(card.id);
    else out.planned.push(card.id);
  }

  /* Rút thẻ: một chồng duy nhất, mọi thẻ chung tỉ lệ. Rút cạn cả bộ rồi soi
     xem có lá nào không bao giờ lên — kỳ đã bỏ nên thẻ nhà đất phải ra được
     ngay từ lần nổ đầu. */
  st.eventsFired = 0;
  st.eventPile = [];
  // Cất nhà cho một khu, không thì thiên tai không có gì để giáng xuống
  GROUP_TILES.red.forEach((id) => { st.owner.set(id, 0); st.houses.set(id, 2); });
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const card = ev.drawEvent(st);
    if (card) seen.add(card.id);
  }
  out.drawnKinds = [...seen];
  out.heavyDrawnEarly = seen.has('dong-dat') || seen.has('hoa-hoan');
  out.noEraField = EVENTS.every((c) => c.era === undefined);

  /* Thẻ đổi giá chạy tới hết ván (`turns: -1`), và rút lại lần nữa thì bị bỏ
     qua vì `addMod` gộp theo id — bày lá ấy ra cũng không đổi được gì. */
  st.mods = [];
  const priceCards = ['lam-phat', 'mat-mua', 'bao-gia'];
  out.priceForever = priceCards.every((id) => ev.planEvent(st, EVENT_BY_ID[id]).mod.turns === -1);
  for (const id of priceCards) st.addMod(ev.planEvent(st, EVENT_BY_ID[id]).mod);
  st.tickMods(); st.tickMods(); st.tickMods(); st.tickMods();
  out.priceSurvivesTicks = st.mods.length === 3;
  out.priceSkippedTwice = priceCards.every((id) => !ev.usable(st, EVENT_BY_ID[id]));
  // Giới nghiêm vẫn có hạn: cấm xây vĩnh viễn là khoá luôn đường làm tiền thuê lớn lên
  out.curfewStillTimed = ev.planEvent(st, EVENT_BY_ID['gioi-nghiem']).mod.turns > 0;
  st.mods = [];

  // Ảnh chụp mang đủ trường mới
  const { snapshot, fromSnapshot } = await import('/src/core/serialize.js');
  st.pot = 250;
  st.addMod({ id: 'lam-phat', type: 'rent', mult: 1.25, turns: 4 });
  const snap = snapshot(st);
  const back = fromSnapshot(snap);
  out.roundTrip = back.pot === 250 && back.mods.length === 1
    && back.settings.events === st.settings.events
    && back.eventsFired === st.eventsFired && back.laps === st.laps;

  // Ảnh chụp cũ (không có phần Thời Cuộc) vẫn dựng lại được
  const legacy = { ...snap };
  delete legacy.settings; delete legacy.mods; delete legacy.pot;
  delete legacy.eventPile; delete legacy.pressure;
  const old = fromSnapshot(legacy);
  out.legacySnapshot = old.mods.length === 0 && old.pot === 0 && !!old.settings.events;

  return out;
});

ok('nấc luật đi vào ván', r.level === 'hon-loan', r.level);
ok('bàn còn trống thì chưa mở khoá', r.lockedAtStart && r.noPressureBeforeUnlock);
ok('bán hết đất thì mở khoá và tích áp lực', r.unlockedWhenSold && r.pressureCounts);
ok('ngưỡng hạ dần sau mỗi lần nổ', r.thresholdFalls);
ok('lạm phát và đường mới nhân dồn vào tiền thuê', r.rentInflates, JSON.stringify(r.rentMods));
ok('ô mất giấy tờ không thu tiền thuê', r.frozenNoRent);
ok('bão giá đội giá xây', r.buildCostUp);
ok('giới nghiêm chặn xây nhà', r.buildBlocked);
ok('mất mùa cắt nửa lương', r.salaryHalved);
ok('hiệu ứng tự hết hạn theo lượt', r.modsExpire);
ok('cấn nợ tự động thế chấp đủ tiền', r.autoRaise);
ok('mọi thẻ đều lập được kế hoạch', r.badPlan.length === 0, r.badPlan.join(','));
ok('thẻ nhà đất rút được ngay từ đầu', r.heavyDrawnEarly && r.noEraField,
  r.drawnKinds.join(','));
ok('thẻ đổi giá chạy tới hết ván', r.priceForever && r.priceSurvivesTicks);
ok('rút lại thẻ đổi giá đang có hiệu lực thì bỏ qua', r.priceSkippedTwice);
ok('giới nghiêm vẫn có hạn', r.curfewStillTimed);
ok('ảnh chụp mang đủ phần Thời Cuộc', r.roundTrip);
ok('ảnh chụp cũ vẫn dựng lại được', r.legacySnapshot);

/* ------------------------------------------------------- một sự kiện chạy thật */

// Ép thanh áp lực đầy rồi kết thúc lượt → sự kiện phải nổ
await page.evaluate(() => {
  const c = window.__monopoly.controller;
  const st = c.state;
  // Chỉ để lại thẻ Kỳ 1 không cần hỏi ai, cho bước kiểm này chạy gọn
  st.eventPile = ['hoi-cho'];
  st.eventsFired = 0;
  st.pressure = 999;
  c.guard(() => c.endTurn());
});
/* Thẻ nay đi qua băng chuyền (`ui/caseOpen.js`): dải chạy 2,5 giây, dừng lại một
   nhịp rồi mặt thẻ mới nở ra. Chờ đúng lúc nó hiện chứ đừng đếm giây. */
const cardSeen = await page.locator('.event-card')
  .waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
ok('thẻ Thời Cuộc hiện ra khi thanh đầy', cardSeen);
if (cardSeen) {
  const cashBefore = await page.evaluate(
    () => window.__monopoly.controller.state.players.reduce((s, p) => s + p.money, 0));
  ok('thẻ ghi rõ sự kiện rơi vào ai', (await page.locator('.event-detail').innerText()).length > 0);
  // Nửa dưới mặt thẻ phải in luật sẽ áp dụng, không để người chơi đoán theo lời văn
  const effect = await page.locator('.event-effect-list li').allInnerTexts().catch(() => []);
  ok('thẻ in rõ phần áp dụng', effect.length > 0, effect.join(' | '));
  /* Hộp thẻ không chặn mạch nữa: hai giây sau khi lật, `apply()` chạy và dòng
     thông báo nổi lên dù chưa ai bấm — còn tấm thẻ thì vẫn nằm nguyên đó.
     Soi qua tiền trong ví chứ không qua câu chữ: thẻ "hội chợ" cho người nghèo
     nhất 200$, tức tổng tiền cả bàn phải nhúc nhích trong lúc hộp còn mở. */
  const applied = await page.waitForFunction(
    (n) => window.__monopoly.controller.state.players.reduce((s, p) => s + p.money, 0) > n,
    cashBefore, { timeout: 8000 }).then(() => true).catch(() => false);
  ok('luật áp dụng xong dù chưa bấm đóng thẻ', applied);
  ok('thông báo nổi lên cùng lúc', (await page.locator('#broadcast .bcast').count()) > 0);
  ok('thẻ vẫn nằm đó, không tự tắt',
    await page.locator('.event-card').isVisible().catch(() => false));
  await page.locator('.scrim.show button.btn').first().click({ timeout: 8000 });
  ok('bấm nút thì hộp đóng', await page.locator('.event-card')
    .waitFor({ state: 'detached', timeout: 6000 }).then(() => true).catch(() => false));
  await page.waitForTimeout(1500);
}

const after = await page.evaluate(() => {
  const st = window.__monopoly.controller.state;
  return { fired: st.eventsFired, pressure: st.pressure, meter: !document.getElementById('fate-meter').hidden };
});
ok('sự kiện đã nổ và thanh áp lực xả về 0', after.fired === 1 && after.pressure === 0,
  JSON.stringify(after));
ok('thanh Thời Cuộc hiện trên HUD', after.meter);

/* ------------------------------------------- từng thẻ Kỳ 2 chạy thật một lượt */

/**
 * Bấm hết mọi hộp thoại cho tới khi controller thật sự rảnh.
 *
 * Không thể dừng ngay lúc màn hình sạch: giữa hai hộp thoại còn hoạt cảnh
 * (tiền bay, dòng thông báo) kéo dài hơn một giây, xong mới mở hộp kế. Dừng
 * sớm thì hộp sau không ai bấm và controller kẹt ở `busy` mãi.
 */
async function clearModals(page, ms = 120000) {
  const t0 = Date.now();
  let calm = 0;
  while (Date.now() - t0 < ms) {
    /* Bảng chọn ô nằm ngay trên bàn cờ, không có nền tối — vòng lặp chỉ soi
       hộp thoại sẽ tưởng màn hình đã sạch rồi bỏ mặc nó đứng đó. */
    if (await picking(page)) {
      calm = 0;
      await pickOnBoard(page).catch(() => {});
      continue;
    }
    const scrim = page.locator('#modal-root .scrim.show');
    if (await scrim.count()) {
      calm = 0;
      /* Chỉ bấm nút ở **thanh dưới cùng**. Trong thân hộp thoại còn những nút
         phụ không đóng gì cả (mấy mức giá gợi ý trong hộp đấu giá) — bấm trúng
         chúng thì vòng lặp này quay mãi mà hộp vẫn đứng đó. */
      const foot = page.locator(
        '.scrim.show .modal-foot:not(.co-foot-hidden) button.btn:not([disabled])').first();
      const btn = (await foot.count())
        ? foot
        : page.locator('.scrim.show button.btn:not([disabled])').first();
      if (await btn.count()) await btn.click().catch(() => {});
      await page.waitForTimeout(320);
      continue;
    }
    const busy = await page.evaluate(() => window.__monopoly.controller.busy);
    if (!busy) {
      calm += 1;
      if (calm >= 5) return true;   // rảnh liên tục ~1,5 giây thì mới tin là xong
    } else calm = 0;
    await page.waitForTimeout(300);
  }
  return false;
}

console.log('\n--- từng thẻ đụng nhà đất ---');
const HEAVY = ['dong-dat', 'hoa-hoan', 'mat-giay-to', 'trung-thu',
               'sang-nhuong', 'hoan-doi-dia-ba', 'mo-duong', 'dai-ha-gia'];

for (const id of HEAVY) {
  const before = errors.length;
  await clearModals(page);
  // Dựng lại một bàn có đất và nhà để thẻ nào cũng có việc để làm
  await page.evaluate((cardId) => {
    const c = window.__monopoly.controller;
    const st = c.state;
    const B = window.__monopoly.BOARD ?? null;
    st.owner.clear(); st.houses.clear(); st.mortgaged.clear();
    st.mods = []; st.pot = 0;
    // Ván trước có thể đã hạ màn (sự kiện làm người ta vỡ nợ) — mở lại bàn mới
    st.over = false;
    st.players.forEach((p, i) => { p.money = 2000; p.bankrupt = false; p.inJail = false; p.pos = i; });
    // Chia đều đất cho ba người, chừa vài ô trống cho thẻ "đại hạ giá"
    const ids = [1, 3, 6, 8, 9, 11, 13, 14, 16, 18, 19, 21, 23, 24, 26, 27, 29, 31, 32, 34];
    ids.forEach((tile, k) => st.owner.set(tile, k % 3));
    // Một bộ đủ màu có nhà, để động đất và hoả hoạn có chỗ mà giáng xuống
    [11, 13, 14].forEach((tile) => { st.owner.set(tile, 0); st.houses.set(tile, 3); });
    st.bankHouses = 32 - 9;
    st.eventPile = [cardId];
    st.eventsFired = 5;
    st.laps = 99;
    st.pressure = 999;
    c.hud.refresh();
    c.scene.refresh(st);
    c.guard(() => c.endTurn());
  }, id);

  const shown = await page.locator('.event-card')
    .waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
  await clearModals(page);
  await page.waitForTimeout(600);
  const state = await page.evaluate(() => {
    const c = window.__monopoly.controller;
    return {
      fired: c.state.eventsFired, mods: c.state.mods.length, owners: c.state.owner.size,
      busy: c.busy, modal: document.querySelectorAll('#modal-root .scrim.show').length,
    };
  });
  ok(`thẻ ${id} chạy trọn không lỗi`,
    shown && state.fired === 6 && errors.length === before,
    `thẻ hiện=${shown} ${JSON.stringify(state)} ${errors.slice(before).join(' | ')}`);
}

console.log(errors.length ? `\nLỖI TRANG:\n${errors.join('\n')}` : '\nKhông có lỗi trang.');
await browser.close();
if (fails.length || errors.length) {
  console.log(`\nHỎNG: ${fails.join(', ')}`);
  process.exit(1);
}
console.log('\nTẤT CẢ ĐỀU ĐẠT');
