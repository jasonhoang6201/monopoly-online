/**
 * Đấu giá kín trên bản online, ván **ba máy** — dồn vào mấy cảnh dễ treo bàn.
 *
 * Lỗi gốc: máy cầm lái ghi giá xong rồi chuyển tab ngồi chờ. Tab nền không còn
 * `requestAnimationFrame`, vòng lặp Phaser đứng, mạch đấu giá kẹt ở cú bay tiền
 * nên bảng giá không bao giờ mở ở máy nào và lượt không trao đi. Playwright
 * luôn báo tab là "visible", nên tab nền được giả lập bằng cách giữ lại mọi lời
 * gọi `requestAnimationFrame` — đúng phần trình duyệt cắt đi ở tab thật.
 *
 * Mỗi cảnh gọi thẳng `events.auction()` / `forcedSale()` rồi `endTurn()` trên
 * máy cầm lái, để chọn đúng lô, đúng người bị gạt, đúng túi tiền; đường bày thẻ
 * Thời Cuộc đã có `events-online.mjs` lo.
 *
 * Chạy: cần dev server ở cổng 5179
 *   npx vite --port 5179 --strictPort &
 *   node tests/auction-online.mjs
 */
import { launchChrome } from './launch.mjs';
import { playRollOff } from './rolloff.mjs';

const BASE = 'http://localhost:5179/';
/** `ONLY=2,5 node tests/auction-online.mjs` chạy riêng mấy cảnh ấy. */
const ONLY = process.env.ONLY?.split(',').map(Number) ?? null;
const want = (n) => !ONLY || ONLY.includes(n);
/** Hạn ghi giá trong bài kiểm — ngắn cho nhanh, máy cầm lái chờ thêm 8 giây. */
const ASK_MS = 6000;
const errors = [];
const fails = [];

const browser = await launchChrome();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });

function watch(page, tag) {
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${tag}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${tag}] ${e.message}`));
  page.tag = tag;
  return page;
}
const ok = (cond, label, extra = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${label}${extra ? ` — ${extra}` : ''}`);
  if (!cond) fails.push(label);
};
async function until(fn, ms = 15000, step = 200) {
  const t0 = Date.now();
  for (;;) {
    if (await fn().catch(() => false)) return true;
    if (Date.now() - t0 > ms) return false;
    await new Promise((r) => setTimeout(r, step));
  }
}
async function bootToLobby(page, ms = 90000) {
  await page.bringToFront();
  const mode = page.locator('.scrim.show button.btn', { hasText: 'Mở phòng online' });
  await until(async () => (await mode.count()) > 0 || (await page.locator('#lobby-link').count()) > 0, ms);
  if (await mode.count()) await mode.click();
  await page.locator('#lobby-link').waitFor({ timeout: 30000 });
}

/* ------------------------------------------------------------ dựng ván */

console.log('\n▸ Dựng ván ba máy');
const A = watch(await ctx.newPage(), 'A');
await A.goto(BASE, { waitUntil: 'domcontentloaded' });
await bootToLobby(A);
const link = await A.locator('#lobby-link').inputValue();
await A.locator('.lobby-seat.is-me input.lobby-name').fill('An');
await A.locator('.lobby-seat.is-me .lobby-ready').click();

const pages = [A];
for (const [tag, name] of [['B', 'Bình'], ['C', 'Châu']]) {
  const p = watch(await ctx.newPage(), tag);
  await p.goto(link, { waitUntil: 'domcontentloaded' });
  await bootToLobby(p);
  await p.locator('.lobby-seat.is-me input.lobby-name').fill(name);
  await p.locator('.lobby-seat.is-me .lobby-ready').click();
  pages.push(p);
}
await A.bringToFront();
ok(await until(async () => !(await A.locator('#lobby-start').isDisabled()), 30000), 'cả phòng sẵn sàng');
await A.locator('#lobby-start').click();
for (const p of pages) {
  await p.bringToFront();
  await until(() => p.evaluate(() => !!window.__monopoly?.controller?.state), 60000);
}
ok(!!(await playRollOff(pages)), 'lắc giành quyền xong');

const seatOf = new Map();
for (const p of pages) {
  seatOf.set(p, await p.evaluate(() => window.__monopoly.controller.net.mySeat));
  await p.evaluate((ms) => { window.__monopoly.controller.events.askMs = ms; }, ASK_MS);
}
const pageOf = (seat) => pages.find((p) => seatOf.get(p) === seat);

/* ------------------------------------------------------------ tiện ích */

async function driverOf() {
  for (let i = 0; i < 40; i++) {
    for (const p of pages) {
      const d = await p.evaluate(() => {
        const c = window.__monopoly.controller;
        return c.isDriver() && !c.busy;
      }).catch(() => false);
      if (d) return p;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

/** Tab nằm nền: giữ lại mọi khung hình như trình duyệt thật. */
const hide = (p) => p.evaluate(() => {
  if (window.__heldRAF) return;
  window.__realRAF = window.requestAnimationFrame;
  window.__heldRAF = [];
  window.requestAnimationFrame = (cb) => { window.__heldRAF.push(cb); return 0; };
});
const show = (p) => p.evaluate(() => {
  if (!window.__heldRAF) return;
  window.requestAnimationFrame = window.__realRAF;
  const held = window.__heldRAF;
  window.__heldRAF = null;
  for (const cb of held) window.requestAnimationFrame(cb);
});

/** Ảnh trạng thái ở một máy. */
const snap = (p) => p.evaluate(() => {
  const c = window.__monopoly.controller;
  const st = c.state;
  return {
    turn: st.turn, rev: st.rev,
    money: st.players.map((x) => x.money),
    owner: Object.fromEntries(st.owner),
  };
});

/** Bảng giá đang mở ở một máy (null nếu chưa có). */
const table = (p) => p.evaluate(() => {
  const scrim = [...document.querySelectorAll('#modal-root .scrim:not(.hide)')]
    .find((s) => s.querySelector('.bid-table'));
  if (!scrim) return null;
  const rows = [...scrim.querySelectorAll('.bid-row')];
  return {
    eyebrow: scrim.querySelector('.modal-eyebrow')?.textContent ?? '',
    names: rows.map((r) => r.querySelector('.arow-name').textContent),
    bids: rows.map((r) => +r.querySelector('.bid-money').textContent.replace(/\D/g, '') || 0),
    metas: rows.map((r) => r.querySelector('.arow-meta').textContent.trim()),
    winAt: rows.findIndex((r) => r.classList.contains('win')),
  };
});

const bidBox = (p) => p.locator('.scrim:not(.hide) #bid-input');

/** Ghi giá rồi chốt; `confirm: false` thì chỉ gõ, để đồng hồ tự chốt. */
async function bid(p, v, { confirm = true } = {}) {
  await p.bringToFront();
  await bidBox(p).waitFor({ state: 'visible', timeout: 20000 });
  await bidBox(p).fill(String(v));
  if (confirm) await p.locator('.scrim:not(.hide) button.btn', { hasText: 'Chốt giá' }).click();
}

/** Dọn bảng giá và mọi hộp xem trên mọi máy, chờ cả bàn cùng một lượt. */
async function settle() {
  for (const p of pages) {
    await show(p);
    await p.evaluate(() => {
      for (const s of document.querySelectorAll('#modal-root .scrim:not(.hide)')) {
        if (s.querySelector('.bid-table')) s._close?.(true);
      }
    });
  }
  return until(async () => {
    const all = await Promise.all(pages.map(snap));
    return all.every((s) => s.turn === all[0].turn && s.rev === all[0].rev)
      && !!(await driverOf());
  }, 30000);
}

/**
 * Mở một phiên ở máy cầm lái rồi trao lượt. `setup` chạy trước trên máy ấy
 * (nạp tiền, giao đất), xong thì phát ảnh chụp cho cả bàn cùng thấy.
 */
async function start(drv, { tile, kind = 'bank', seller = null, setup = null }) {
  await drv.evaluate(({ tile, kind, seller, setup }) => {
    const c = window.__monopoly.controller;
    const st = c.state;
    st.pressure = 0;            // đừng để thẻ Thời Cuộc chen vào lúc trao lượt
    if (setup) (new Function('st', setup))(st);
    c.sync();
    c.guard(async () => {
      if (kind === 'forced') await c.events.forcedSale({ tileId: tile, seat: seller });
      else await c.events.auction(tile, { seller: null, reason: 'Bài kiểm thử.' });
      await c.endTurn();
    });
  }, { tile, kind, seller, setup });
}

/** Chờ bảng giá hiện ở đủ mọi máy, trả về bảng của từng máy. */
async function tablesEverywhere(ms) {
  const out = new Map();
  const seen = await until(async () => {
    for (const p of pages) if (!out.has(p)) { const t = await table(p); if (t) out.set(p, t); }
    return out.size === pages.length;
  }, ms, 150);
  return seen ? out : null;
}

const names = await A.evaluate(() => window.__monopoly.controller.state.players.map((p) => p.name));

/* ================================================ 1 · máy cầm lái nằm nền */

if (want(1)) {
  console.log('\n▸ 1. Máy cầm lái ghi giá xong rồi chuyển tab');
  const drv = await driverOf();
  const me = seatOf.get(drv);
  const others = pages.filter((p) => p !== drv);
  const before = await snap(drv);
  await start(drv, { tile: 1 });
  await bid(drv, 100);
  await hide(drv);
  await bid(others[0], 60);
  // others[1] không đụng gì, để đồng hồ tự chốt

  const t0 = Date.now();
  const tabs = await tablesEverywhere(ASK_MS + 20000);
  ok(!!tabs, 'bảng giá vẫn mở ở cả ba máy dù máy cầm lái nằm nền', `${Date.now() - t0}ms`);
  if (tabs) {
    const t = tabs.get(others[1]);
    ok(t.names[t.winAt] === names[me] && t.bids[0] === 100,
      'người trả cao nhất đứng đầu, tô sáng', JSON.stringify(t));
  }
  const turned = await until(async () => {
    const s = await snap(others[0]);
    return s.turn !== before.turn && s.owner[1] === me;
  }, 20000);
  ok(turned, 'đất sang tên và lượt được trao đi trong lúc tab vẫn nằm nền');
  const after = await snap(others[1]);
  ok(after.money[me] === before.money[me] - 100, 'người thắng trả đúng 100', String(after.money[me]));
  ok(await settle(), 'cả bàn về cùng một lượt');
}

/* ================================================ 2 · cả bàn để hết giờ */

if (want(2)) {
  console.log('\n▸ 2. Không ai ghi giá, cả bàn để hết giờ');
  const drv = await driverOf();
  const before = await snap(drv);
  await start(drv, { tile: 3 });
  const tabs = await tablesEverywhere(ASK_MS + 20000);
  ok(!!tabs, 'phiên ế vẫn mở bảng giá ở mọi máy');
  if (tabs) {
    const all = [...tabs.values()];
    ok(all.every((t) => t.eyebrow === 'PHIÊN ĐẤU GIÁ Ế' && t.winAt === -1 && t.bids.every((b) => b === 0)),
      'bảng ghi rõ phiên ế, không ai được tô sáng', JSON.stringify(all[0]));
    ok(all[0].names.length === 3, 'bảng đủ mặt ba người được hỏi', String(all[0].names.length));
  }
  ok(await until(async () => (await snap(pages[2])).turn !== before.turn, 20000), 'lượt vẫn trao đi');
  const s = await snap(pages[1]);
  ok(s.owner[3] === undefined, 'lô đất nằm lại ngân hàng');
  ok(JSON.stringify(s.money) === JSON.stringify(before.money), 'không ai mất tiền');
  ok(await settle(), 'cả bàn về cùng một lượt');
}

/* ======================================== 3 · gõ giá mà quên bấm chốt */

if (want(3)) {
  console.log('\n▸ 3. Gõ giá rồi để đồng hồ tự chốt; ô đỏ thì tính là bỏ qua');
  const drv = await driverOf();
  const [x, y] = pages.filter((p) => p !== drv);
  const before = await snap(drv);
  await start(drv, { tile: 6 });
  await bid(drv, 0);
  await bid(x, 150, { confirm: false });
  await bid(y, 999999, { confirm: false });
  ok(await y.locator('.scrim:not(.hide) #bid-input.bad').isVisible(), 'ô vượt túi tô đỏ');
  const tabs = await tablesEverywhere(ASK_MS + 20000);
  ok(!!tabs, 'bảng giá mở');
  if (tabs) {
    const t = tabs.get(drv);
    const at = (seat) => t.bids[t.names.indexOf(names[seat])];
    ok(t.names[t.winAt] === names[seatOf.get(x)] && at(seatOf.get(x)) === 150,
      'giá đã gõ mà chưa bấm vẫn được chốt khi hết giờ', JSON.stringify(t));
    ok(at(seatOf.get(y)) === 0, 'ô đang đỏ lúc hết giờ tính là 0, không gửi giá cũ', String(at(seatOf.get(y))));
  }
  await until(async () => (await snap(drv)).owner[6] === seatOf.get(x), 15000);
  const s = await snap(drv);
  ok(s.owner[6] === seatOf.get(x) && s.money[seatOf.get(x)] === before.money[seatOf.get(x)] - 150,
    'người gõ 150 lấy đất, trả đúng 150');
  ok(await settle(), 'cả bàn về cùng một lượt');
}

/* ================================================ 4 · hoà giá */

if (want(4)) {
  console.log('\n▸ 4. Hoà giá: người chốt giá trước thắng');
  const drv = await driverOf();
  const order = await drv.evaluate(() => window.__monopoly.controller.state.playOrder);
  const others = pages.filter((p) => p !== drv)
    .sort((a, b) => order.indexOf(seatOf.get(a)) - order.indexOf(seatOf.get(b)));
  const [early, late] = others;
  await start(drv, { tile: 8 });
  // Người đi sau trong vòng lượt chốt trước: thắng phải theo thứ tự chốt,
  // không theo thứ tự lượt
  await bid(late, 120);
  await late.waitForTimeout(800);   // cách xa hơn độ trễ đường truyền
  await bid(early, 120);
  await bid(drv, 10);
  const tabs = await tablesEverywhere(ASK_MS + 20000);
  ok(!!tabs, 'bảng giá mở');
  if (tabs) {
    const t = tabs.get(early);
    const iEarly = t.names.indexOf(names[seatOf.get(early)]);
    ok(t.names[t.winAt] === names[seatOf.get(late)], 'người chốt giá trước thắng', JSON.stringify(t.names));
    ok(t.metas[iEarly] === 'Bằng giá, thua vì chốt sau', 'bảng nói rõ vì sao người bằng giá thua', t.metas[iEarly]);
  }
  ok(await settle(), 'cả bàn về cùng một lượt');
}

/* ======================================== 5 · một máy không bao giờ trả lời */

if (want(5)) {
  console.log('\n▸ 5. Một máy im bặt: không hiện hộp, không trả lời');
  const drv = await driverOf();
  const [mute, live] = pages.filter((p) => p !== drv);
  await mute.evaluate(() => {
    const room = window.__monopoly.controller.net;
    window.__askBak = room.on.ask;
    room.on.ask = null;
  });
  await start(drv, { tile: 9 });
  await bid(live, 70);
  await bid(drv, 40);
  const t0 = Date.now();
  const tabs = await tablesEverywhere(ASK_MS + 25000);
  const took = Date.now() - t0;
  ok(!!tabs, 'máy cầm lái hết hạn chờ rồi vẫn chốt phiên', `${took}ms`);
  if (tabs) {
    const t = tabs.get(live);
    ok(t.bids[t.names.indexOf(names[seatOf.get(mute)])] === 0, 'máy im bặt tính là 0');
    ok(t.names[t.winAt] === names[seatOf.get(live)], 'người trả 70 thắng');
  }
  /* Đồng hồ lượt không được chạm 0 trước khi bảng giá kịp mở — máy ngồi xem
     thấy vòng cung cạn là tưởng ván đã treo. */
  const left = await live.evaluate(() => {
    const c = window.__monopoly.controller.clock;
    return c ? c.until - Date.now() : null;
  });
  ok(left === null || left > 0, 'đồng hồ lượt chưa cạn lúc bảng giá mở', String(left));
  await mute.evaluate(() => { window.__monopoly.controller.net.on.ask = window.__askBak; });
  ok(await settle(), 'cả bàn về cùng một lượt');
}

/* ================================== 6 · hộp ghi giá bên kia còn mở lúc chốt */

if (want(6)) {
  console.log('\n▸ 6. Máy bên kia đếm chậm hơn hạn của máy cầm lái');
  const drv = await driverOf();
  const [slow, other] = pages.filter((p) => p !== drv);
  // Hộp ở máy này đếm 60 giây, còn máy cầm lái chỉ chờ ASK_MS + 8 giây
  await slow.evaluate(() => { window.__monopoly.controller.events.askMs = 60000; });
  await start(drv, { tile: 11 });
  await bid(other, 50);
  await bid(drv, 20);
  await bidBox(slow).waitFor({ state: 'visible', timeout: 20000 });
  const tabs = await tablesEverywhere(ASK_MS + 25000);
  ok(!!tabs, 'bảng giá mở dù hộp bên kia chưa hết giờ');
  ok(await until(async () => (await bidBox(slow).count()) === 0, 5000),
    'hộp ghi giá cũ bên ấy tự đóng khi phiên đã chốt');
  await slow.evaluate((ms) => { window.__monopoly.controller.events.askMs = ms; }, ASK_MS);
  ok(await settle(), 'cả bàn về cùng một lượt');
}

/* ========================================= 7 · phát mãi: chủ cũ đứng ngoài */

if (want(7)) {
  console.log('\n▸ 7. Phát mãi: chủ cũ không được ghi giá, tiền về tay họ');
  const drv = await driverOf();
  const [owner, buyer] = pages.filter((p) => p !== drv);
  const os = seatOf.get(owner);
  const before = await snap(owner);
  await start(drv, { tile: 13, kind: 'forced', seller: os, setup: `st.owner.set(13, ${os});` });
  await bid(buyer, 200);
  await bid(drv, 90);
  await owner.bringToFront();
  ok((await bidBox(owner).count()) === 0, 'chủ cũ không nhận hộp ghi giá');
  const tabs = await tablesEverywhere(ASK_MS + 20000);
  ok(!!tabs, 'bảng giá mở ở cả máy chủ cũ');
  if (tabs) ok(tabs.get(owner).names.length === 2, 'bảng chỉ có hai người được hỏi');
  await until(async () => (await snap(owner)).owner[13] === seatOf.get(buyer), 15000);
  const after = await snap(owner);
  ok(after.owner[13] === seatOf.get(buyer), 'đất về tay người trả 200');
  ok(after.money[os] === before.money[os] + 200, 'chủ cũ nhận đủ 200', `${before.money[os]} → ${after.money[os]}`);
  ok(await settle(), 'cả bàn về cùng một lượt');
}

/* ================================================ 8 · trả sạch túi */

if (want(8)) {
  console.log('\n▸ 8. Ghi đúng bằng số tiền đang có');
  const drv = await driverOf();
  const [rich, poor] = pages.filter((p) => p !== drv);
  const ps = seatOf.get(poor);
  await start(drv, { tile: 14, setup: `st.players[${ps}].money = 137;` });
  await bid(poor, 137);
  await bid(rich, 0);
  await bid(drv, 0);
  const tabs = await tablesEverywhere(ASK_MS + 20000);
  ok(!!tabs, 'bảng giá mở');
  await until(async () => (await snap(drv)).owner[14] === ps, 15000);
  const s = await snap(drv);
  const p = await drv.evaluate((seat) => window.__monopoly.controller.state.players[seat].bankrupt, ps);
  ok(s.owner[14] === ps && s.money[ps] === 0 && !p, 'lấy được đất, còn 0$, không bị tính vỡ nợ',
    JSON.stringify({ owner: s.owner[14], money: s.money[ps], bankrupt: p }));
  ok(await settle(), 'cả bàn về cùng một lượt');
}

/* ================================== 9 · máy cầm lái nằm nền ngay từ đầu */

if (want(9)) {
  console.log('\n▸ 9. Máy cầm lái đã nằm nền trước khi mở phiên');
  const drv = await driverOf();
  const [x, y] = pages.filter((p) => p !== drv);
  const before = await snap(drv);
  await hide(drv);
  await start(drv, { tile: 16 });
  await bid(x, 30);
  await bid(y, 45);
  const tabs = await tablesEverywhere(ASK_MS + 25000);
  ok(!!tabs, 'phiên vẫn chạy trọn, bảng giá mở ở mọi máy');
  ok(await until(async () => (await snap(x)).turn !== before.turn, 20000),
    'lượt trao đi dù tab cầm lái chưa lúc nào hiện lại');
  ok(await settle(), 'cả bàn về cùng một lượt');
}

/* ======================================================= 10 · đồng bộ */

if (want(10)) {
  console.log('\n▸ 10. Sau chín phiên, ba máy cùng một bàn cờ');
  const all = await Promise.all(pages.map(snap));
  ok(all.every((s) => JSON.stringify(s) === JSON.stringify(all[0])),
    'sổ chủ đất, túi tiền, lượt khớp nhau trên cả ba máy', JSON.stringify(all.map((s) => s.rev)));
}

/* =========================== 11 · máy cầm lái đóng tab giữa phiên (để cuối) */

if (want(11)) {
  console.log('\n▸ 11. Máy cầm lái đóng hẳn tab trong lúc cả bàn đang ghi giá');
  const drv = await driverOf();
  const gone = seatOf.get(drv);
  const rest = pages.filter((p) => p !== drv);
  const before = await snap(rest[0]);
  // Hộp ở hai máy còn lại đếm tận 60 giây: phải tự đóng vì máy hỏi đã đi, không vì hết giờ
  for (const p of rest) await p.evaluate(() => { window.__monopoly.controller.events.askMs = 60000; });
  await start(drv, { tile: 18 });
  for (const p of rest) await bidBox(p).waitFor({ state: 'visible', timeout: 20000 });
  await bid(rest[0], 80);
  await drv.close();
  pages.splice(pages.indexOf(drv), 1);

  /* Phiên chết theo máy ấy, đất không đổi chủ. Điều cần kiểm là hai máy còn
     lại không ngồi trước một hộp ghi giá của phiên đã chết, và lượt đi tiếp. */
  ok(await until(async () => {
    const s = await snap(rest[1]);
    return s.turn !== gone;
  }, 60000), 'lượt bỏ qua người vừa đóng tab', `trước: ${before.turn}`);
  ok(await until(async () => {
    for (const p of rest) if (await bidBox(p).count()) return false;
    return true;
  }, 20000), 'hộp ghi giá của phiên đã chết tự đóng khi máy hỏi rời bàn');
  const s = await snap(rest[0]);
  ok(s.owner[18] === undefined, 'lô đất không đổi chủ', JSON.stringify(s.owner[18]));
  const driver = await driverOf();
  ok(!!driver, 'có máy cầm lái mới, rảnh tay', driver?.tag);
  if (driver) {
    const acts = await driver.evaluate(() => document.querySelectorAll('#actions button').length);
    ok(acts > 0, 'người tới lượt có nút để bấm', String(acts));
  }
}

console.log(errors.length ? `\nLỖI TRANG:\n${errors.join('\n')}` : '\nKhông có lỗi trang.');
await browser.close();
if (fails.length || errors.length) {
  console.log(`\nHỎNG: ${fails.join(', ')}`);
  process.exit(1);
}
console.log('\n✓ Tất cả kiểm tra đều đạt');
