/**
 * Đồ nghề chung cho các bài kiểm thử bản online (tests/online*.mjs).
 *
 * Mỗi người chơi một browser context: mỗi context là một cửa sổ riêng nên tab
 * nào cũng được cấp khung hình (tab nền thì Phaser đứng), và mỗi người có kho
 * lưu trữ riêng như máy thật.
 *
 * Cần hai máy chủ:
 *   npm run server:test                 # wrangler dev, cổng 8787, TEST_TIMING=1
 *   npx vite --port 5179 --strictPort   # bàn cờ
 */
import { launchChrome } from './launch.mjs';
import { playRollOff } from './rolloff.mjs';

export const SERVER = process.env.GAME_SERVER ?? 'ws://localhost:8787';
export const BASE = `http://localhost:5179/?server=${encodeURIComponent(SERVER)}`;

export const errors = [];
export const fails = [];

export const ok = (cond, label, extra = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${label}${extra ? ` — ${extra}` : ''}`);
  if (!cond) fails.push(label);
};

export async function until(fn, ms = 12000, step = 200) {
  const t0 = Date.now();
  for (;;) {
    if (await fn().catch(() => false)) return true;
    if (Date.now() - t0 > ms) return false;
    await new Promise((r) => setTimeout(r, step));
  }
}

export const browser = await launchChrome();

/**
 * Mở một người chơi mới.
 * @param {string} tag nhãn trong dòng lỗi console
 * @param {object} [netTiming] ghi đè nhịp ping của `net/gameServer.js` (`window.__netTiming`)
 */
export async function newPage(tag, netTiming = null) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  if (netTiming) await ctx.addInitScript((t) => { window.__netTiming = t; }, netTiming);
  return watch(await ctx.newPage(), tag);
}

export function watch(page, tag) {
  page.on('console', (m) => {
    // Socket đứt giữa chừng thì trình duyệt ghi lỗi WebSocket, không phải lỗi mã
    if (m.type() === 'error' && !/WebSocket|ERR_INTERNET_DISCONNECTED|không mở được WebSocket/.test(m.text())) {
      errors.push(`[${tag}] ${m.text()}`);
    }
  });
  page.on('pageerror', (e) => errors.push(`[${tag}] ${e.message}`));
  return page;
}

export async function bootToLobby(page, ms = 90000) {
  await page.bringToFront();
  const mode = page.locator('.scrim.show button.btn', { hasText: 'Mở phòng online' });
  await until(async () => (await mode.count()) > 0 || (await page.locator('#lobby-link').count()) > 0, ms);
  if (await mode.count()) await mode.click();
  await page.locator('#lobby-link').waitFor({ timeout: 30000 });
}

/** Người được mời: mở đường mời, gõ tên, (tuỳ chọn) bấm Sẵn sàng. */
export async function enter(url, name, tag, { ready = true, netTiming = null } = {}) {
  const page = await newPage(tag, netTiming);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await bootToLobby(page);
  await page.locator('.lobby-seat.is-me input.lobby-name').fill(name);
  if (ready) await page.locator('.lobby-seat.is-me .lobby-ready').click();
  return page;
}

export const seatCount = (page) => page.locator('.lobby-seat').count();
export const title = (page) => page.locator('.scrim.show .modal-title').first().textContent().catch(() => '');

/** Chạy `fn(controller, arg)` trong tab. */
export const c = (page, fn, arg) => page.evaluate(
  ([src, a]) => (0, eval)(src)(window.__monopoly.controller, a), [fn.toString(), arg],
);

/** Phần ván mà mọi máy phải thấy giống nhau. */
export const view = (page) => c(page, (g) => g.state && JSON.stringify({
  turn: g.state.turn,
  money: g.state.players.map((p) => p.money),
  pos: g.state.players.map((p) => p.pos),
  owner: [...g.state.owner.entries()].sort((a, b) => a[0] - b[0]),
  bankrupt: g.state.players.map((p) => p.bankrupt),
}));

/** Chờ mọi tab diễn xong hàng sự kiện rồi so ván. */
export async function sameBoard(pages, ms = 20000) {
  let last = [];
  const same = await until(async () => {
    const busy = await Promise.all(pages.map((p) => c(p, (g) => g.busy)));
    if (busy.some(Boolean)) return false;
    last = await Promise.all(pages.map(view));
    return last.every((v) => v && v === last[0]);
  }, ms, 300);
  return { same, last };
}

/** Bấm các hộp thoại của lượt cho tới khi thanh nút hiện lại. */
export async function settle(page, ms = 40000) {
  const t0 = Date.now();
  const order = ['Bỏ qua', 'Đành chịu', 'Nhận tiền', 'Tiếp tục', 'Không cược', 'Xong', 'Đóng', 'Để sau', 'Thôi', 'Chưa đạp', 'Mua '];
  while (Date.now() - t0 < ms) {
    if (await page.locator('#modal-root .scrim.show').count()) {
      let clicked = false;
      for (const label of order) {
        const b = page.locator('.scrim.show button.btn', { hasText: label }).first();
        if (await b.count() && !(await b.isDisabled())) { await b.click().catch(() => {}); clicked = true; break; }
      }
      if (!clicked) {
        const any = page.locator('.scrim.show button.btn:not([disabled])').first();
        if (await any.count()) await any.click().catch(() => {});
      }
      await page.waitForTimeout(300);
      continue;
    }
    if (await page.locator('#actions button:not([disabled])').count()) return true;
    await page.waitForTimeout(250);
  }
  return false;
}

/** Tab đang giữ ghế tới lượt. */
export async function driver(pages) {
  for (const p of pages) {
    if (await c(p, (g) => g.state && !g.state.over && g.net.mySeat === g.state.turn).catch(() => false)) return p;
  }
  return null;
}

/** Đi trọn một lượt bằng thanh nút của tab đang tới lượt: lắc (kể cả cầu đôi) rồi kết thúc. */
export async function playTurn(pages) {
  const p = await driver(pages);
  if (!p) return false;
  const turn0 = await c(p, (g) => g.state.turnNo);
  for (let i = 0; i < 12; i++) {
    await settle(p);
    if (await c(p, (g, t) => g.state.turnNo !== t, turn0)) return true;
    const roll = p.locator('#actions button', { hasText: 'Lắc xí ngầu' }).first();
    const end = p.locator('#actions button', { hasText: 'Kết thúc lượt' }).first();
    const fine = p.locator('#actions button', { hasText: 'ra tù' }).first();
    if (await end.count()) await end.click().catch(() => {});
    else if (await roll.count()) await roll.click().catch(() => {});
    else if (await fine.count()) await fine.click().catch(() => {});
    /* Chờ lượt đổi, hoặc thanh nút / hộp thoại của mình hiện lại. Chỉ chờ
       "hết bận" thì sau cú bấm Kết thúc lượt, tab hết bận trước khi lượt kịp
       đổi, rồi vòng sau đứng chờ thanh nút của một lượt đã không còn là của mình. */
    await until(async () => {
      if (await c(p, (g, t) => g.state.turnNo !== t, turn0)) return true;
      if (await c(p, (g) => g.busy)) return false;
      return (await p.locator('#actions button:not([disabled]), #modal-root .scrim.show').count()) > 0;
    }, 20000, 250);
    if (await c(p, (g, t) => g.state.turnNo !== t, turn0)) return true;
  }
  return false;
}

/**
 * Sửa ván trên server qua cổng `test`: chụp ván đang vẽ ở tab, cho `fn(state,
 * arg)` sửa bản sao, rồi đẩy lên. Server thay ván và mở lại vòng lượt.
 */
export async function patch(page, fn, arg) {
  await page.evaluate(async ([src, a]) => {
    const { snapshot, fromSnapshot } = await import('/src/core/serialize.js');
    const st = fromSnapshot(snapshot(window.__monopoly.controller.state));
    (0, eval)(src)(st, a);
    window.__room.post({ t: 'test', snap: snapshot(st) });
  }, [fn.toString(), arg]);
}

/** Đổi hạn chờ của ván đang chạy (phần của phòng lẫn của engine). */
export const setTiming = (page, timing) => page.evaluate((t) => window.__room.post({ t: 'test', timing: t }), timing);

/**
 * Mở bàn: người đầu mở phòng, những người sau vào bằng đường mời, cả bàn sẵn
 * sàng, khai cuộc, lắc giành quyền.
 *
 * @param {string[]} names
 * @param {{timing?:object, netTiming?:object}} [o]
 * @returns {Promise<import('playwright').Page[]>} theo thứ tự ghế
 */
export async function openTable(names, { timing = null, netTiming = null } = {}) {
  const host = await newPage(names[0], netTiming);
  await host.goto(BASE, { waitUntil: 'domcontentloaded' });
  await bootToLobby(host);
  const link = await host.locator('#lobby-link').inputValue();
  await host.locator('.lobby-seat.is-me input.lobby-name').fill(names[0]);
  const pages = [host];
  for (const n of names.slice(1)) pages.push(await enter(link, n, n, { netTiming }));
  await until(async () => (await seatCount(host)) === names.length, 15000);
  await host.bringToFront();
  await host.locator('.lobby-seat.is-me .lobby-ready').click();
  if (timing) await host.evaluate((t) => window.__room.setOptions({ timing: t }), timing);
  await until(() => host.locator('#lobby-start').isEnabled(), 10000);
  await host.waitForTimeout(300);
  await host.locator('#lobby-start').click();
  for (const p of pages) {
    await p.bringToFront();
    await until(() => c(p, (g) => !!g.state), 30000);
  }
  await playRollOff(pages, { normalize: false });
  return pages;
}

export async function finish() {
  ok(errors.length === 0, 'không có lỗi console', errors.slice(0, 5).join(' | '));
  await browser.close();
  console.log(fails.length ? `\nFAIL ${fails.length}: ${fails.join('; ')}` : '\n✓ tất cả đạt');
  process.exit(fails.length ? 1 : 0);
}
