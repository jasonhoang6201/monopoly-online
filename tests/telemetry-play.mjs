/**
 * Số liệu cân bằng kỹ năng trong trang thật (một máy):
 *   1. Chrome do Playwright cầm (`navigator.webdriver`) → analytics **tắt**,
 *      luật vẫn chạy bình thường, không request nào tới /rest/v1/.
 *   2. Ép bật bằng `?telemetry=1` + chèn fetch giả → học kỹ năng, đi một lượt
 *      thì buffer có `learn`, `turn`, và flush gửi đúng dòng.
 * Cần dev server ở cổng 5178.
 */
import { launchChrome } from './launch.mjs';
import { playRollOff } from './rolloff.mjs';

const errors = [];
let fails = 0;
const check = (ok, msg, extra = '') => { console.log(`  ${ok ? '✓' : '✗'} ${msg}${ok || !extra ? '' : ` — ${extra}`}`); if (!ok) fails++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await launchChrome();

async function boot(page, url) {
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__monopoly?.controller, null, { timeout: 30000 });
}
async function startSolo(page) {
  const solo = page.locator('.scrim.show button.btn', { hasText: 'Chơi trên một máy' });
  await solo.waitFor({ timeout: 30000 });
  await solo.click();
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Khai cuộc' }).click();
  await page.waitForTimeout(2500);
  await playRollOff(page);
  await page.waitForTimeout(600);
}
const ctl = (page, src) => page.evaluate((s) => new Function('c', 's', 'T', s)(window.__monopoly.controller, window.__monopoly.controller.state, window.__monopoly.telemetry), src);

/* ------------------------------------------------ 1. tắt khi là bot */
console.log('\n=== 1. Chrome của Playwright: tắt ===');
{
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const rest = [];
  page.on('request', (r) => { if (r.url().includes('/rest/v1/')) rest.push(r.url()); });
  await boot(page, 'http://localhost:5178/');
  check(await page.evaluate(() => navigator.webdriver === true), 'navigator.webdriver = true');
  await startSolo(page);
  check(await ctl(page, 'return c.analytics.enabled === false;'), 'analytics.enabled = false');
  check(await ctl(page, 'return T.enabled === true && T.track("x", {}) === null && T.size === 0;'), 'telemetry đã bật cho ván nhưng cổng chặn: track trả null');
  check(await ctl(page, 'return typeof s.gameId === "string" && s.gameId.length === 36;'), 'ván vẫn có gameId');
  await ctl(page, 's.current.skillPoints = 2; c.hud.refresh(); c.restoreActions();');
  await page.locator('#actions button[data-key="k"]').click();
  await page.locator('.st-node[data-id="cn1"]').click();
  await page.locator('[data-act="learn"]').click();
  await page.waitForTimeout(300);
  await page.locator('.st-close').click();
  check(await ctl(page, 'return s.current.skills.includes("cn1") && c.analytics.buffer.length === 0;'), 'học được như thường, buffer rỗng');
  check(rest.length === 0, 'không request nào tới /rest/v1/');
  await page.close();
}

/* ------------------------------------------------ 2. ép bật, fetch giả */
console.log('\n=== 2. ?telemetry=1 + fetch giả ===');
{
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await boot(page, 'http://localhost:5178/?telemetry=1');
  // Không có khoá Supabase ở máy kiểm thử thì `enabled` vẫn tắt: chèn tay để soi đường đi của sự kiện
  await ctl(page, `
    window.__sent = [];
    c.analytics.enabled = true; c.analytics.url = 'https://fake.local'; c.analytics.key = 'k';
    c.analytics.fetch = async (url, init) => { window.__sent.push({ url, rows: JSON.parse(init.body), keepalive: !!init.keepalive }); return { ok: true, status: 201 }; };
  `);
  await startSolo(page);
  const sent0 = await page.evaluate(() => window.__sent);
  check(sent0.length === 1 && sent0[0].url.endsWith('/rest/v1/games') && sent0[0].rows[0].phase === 'start' && sent0[0].rows[0].mode === 'offline',
    'khai cuộc gửi games phase=start, mode=offline', JSON.stringify(sent0));
  await ctl(page, 's.current.skillPoints = 2; c.hud.refresh(); c.restoreActions();');
  await page.locator('#actions button[data-key="k"]').click();
  await page.locator('.st-node[data-id="cn1"]').click();
  await page.locator('[data-act="learn"]').click();
  await page.waitForTimeout(300);
  await page.locator('.st-close').click();
  await page.waitForTimeout(400);
  const buf = await ctl(page, 'return c.analytics.buffer.map((e) => ({ kind: e.kind, id: e.id, seat: e.seat, game_id: e.game_id, nth: e.nth, point_no: e.point_no }));');
  check(buf.length === 1 && buf[0].kind === 'learn' && buf[0].id === 'cn1' && buf[0].nth === 1 && buf[0].point_no === 1, 'học trong lượt → buffer có learn', JSON.stringify(buf));
  check(buf[0].game_id === await ctl(page, 'return s.gameId;'), 'sự kiện mang gameId của ván');

  // Lắc rồi kết thúc lượt: đóng mọi hộp thoại mọc ra (mua đất, thẻ…) rồi bấm "Kết thúc lượt"
  const turn0 = await ctl(page, 'return s.turnNo;');
  await page.locator('#actions button[data-key="r"]').click();
  // Thứ tự nút ưu tiên như tests/skills-play.mjs — tránh mua đất, cược, phá sản
  const order = ['Đành chịu', 'Tiếp tục', 'Chấp nhận', 'Lên đường', 'Cất vào túi', 'Chốt giá', 'Xong', 'Đóng', 'Đã rõ',
    'Bỏ qua', 'Để sau', 'Chơi tiếp', 'Thôi', 'Không cược', 'Huỷ'];
  for (let i = 0; i < 120; i++) {
    await wait(500);
    if ((await ctl(page, 'return s.turnNo;')) > turn0) break;
    const top = page.locator('#modal-root .scrim.show:not(.stashed):not(.hide)').last();
    if (await top.count()) {
      let hit = false;
      for (const label of order) {
        const b = top.locator('.modal-foot button.btn:not([disabled])', { hasText: label }).first();
        if (await b.count()) { await b.click().catch(() => {}); hit = true; break; }
      }
      if (!hit) {
        const any = top.locator('.modal-foot button.btn:not([disabled])').last();
        if (await any.count()) await any.click().catch(() => {});
      }
      continue;
    }
    const end = page.locator('#actions button[data-key="e"]');
    if (await end.count()) await end.click().catch(() => {});
    const roll = page.locator('#actions button[data-key="r"]');
    if (await roll.count()) await roll.click().catch(() => {});
  }
  check((await ctl(page, 'return s.turnNo;')) > turn0, 'đã sang lượt mới');
  await page.waitForTimeout(800);
  const sent = await page.evaluate(() => window.__sent);
  const evRows = sent.filter((x) => x.url.endsWith('/rest/v1/skill_events')).flatMap((x) => x.rows);
  check(evRows.some((r) => r.kind === 'learn' && r.skill_id === 'cn1') && evRows.some((r) => r.kind === 'turn' && Array.isArray(r.payload.cash)),
    'hết lượt → flush gửi skill_events có learn và turn', JSON.stringify(evRows.map((r) => r.kind)));
  check(evRows.every((r) => r.client_id === evRows[0].client_id && r.game_id === evRows[0].game_id) && new Set(evRows.map((r) => r.seq)).size === evRows.length,
    'cùng game_id/client_id, seq không trùng');
  check(await ctl(page, 'return c.analytics.buffer.length === 0 && c.analytics.queue.length === 0;'), 'buffer và hàng đợi rỗng sau khi gửi xong');
  await page.close();
}

await browser.close();
if (errors.length) { console.log('\nLỗi trang:'); for (const e of errors) console.log('  ' + e); }
console.log(fails || errors.length ? `\n✗ ${fails} kiểm thất bại, ${errors.length} lỗi trang` : '\n✓ telemetry-play đạt');
process.exit(fails || errors.length ? 1 : 0);
