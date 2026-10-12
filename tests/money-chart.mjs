/**
 * Biểu đồ tiền cả trận: nút "Thống kê" ở mép màn hạ màn mở hộp biểu đồ, đủ
 * ba chủ đề. Ván dựng sẵn bằng sổ tiền giả (4 người, 29 vòng, một người phá
 * sản) để không phải chơi trọn một ván.
 *
 * Cần dev server ở cổng 5178. `SHOTS=thư-mục` để chụp màn hình,
 * `VIEW=844x390` để chạy ở màn ngang điện thoại.
 */
import { launchChrome } from './launch.mjs';

const errors = [];
const fails = [];
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? '✓' : '✗'} ${name}${extra ? ` — ${extra}` : ''}`);
  if (!cond) fails.push(name);
};
const SHOTS = process.env.SHOTS;
const [VW, VH] = (process.env.VIEW ?? '1600x1000').split('x').map(Number);
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

const browser = await launchChrome();
const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: SHOTS ? 2 : 1 });
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
const wait = (ms) => page.waitForTimeout(ms);

await page.goto('http://localhost:5178/', { waitUntil: 'networkidle' });
await page.locator('.scrim.show button.btn', { hasText: 'Chơi trên một máy' }).waitFor({ timeout: 30000 });

/** Dọn mọi hộp đang mở, dựng ván giả theo chủ đề rồi mở màn hạ màn. */
async function openWinner(theme) {
  await page.evaluate(async (theme) => {
    const { setTheme } = await import('/src/theme/theme.js');
    setTheme(theme);
    document.querySelectorAll('#modal-root .scrim').forEach((x) => x.remove());
    const { GameState } = await import('/src/core/state.js');
    const H = await import('/src/core/history.js');
    const s = new GameState(['Bảy Viễn', 'Cô Ba', 'Chú Hoả', 'Bà Từ']);
    s.hist = H.blankHistory(4);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const goal = [
      (t) => 750 + 2600 * t ** 1.6 + 300 * Math.sin(t * 9),
      (t) => 750 + 1500 * Math.sin(Math.PI * Math.min(1, t * 1.25)) - 250 * t,
      (t) => 750 + 500 * t + 260 * Math.sin(t * 13),
      (t) => 750 + 350 * Math.sin(t * 6) - 900 * t,
    ];
    const noise = [0, 0, 0, 0], gap = [200, 150, 300, 100];
    const N = 29 * 4;
    for (let k = 0; k < N; k++) {
      const t = k / (N - 1);
      const w = goal.map((g, i) => {
        noise[i] = noise[i] * 0.8 + (rnd() - 0.5) * 140;
        if (rnd() < 0.03) noise[i] -= 260;
        return Math.max(0, Math.round(g(t) + noise[i] - (i === 1 && k > 70 ? (k - 70) * 18 : 0)));
      });
      if (k >= 86) w[3] = null;
      const m = w.map((v, i) => {
        if (v == null) return null;
        gap[i] = Math.max(0, gap[i] * 0.9 + (rnd() - 0.4) * 160 + (t > 0.3 ? 60 : 10));
        return Math.max(0, Math.round(v - gap[i] * (0.4 + t)));
      });
      s.hist.pts.push({ k, r: Math.floor(k / 4), w, m });
    }
    s.round = 28; s.turnNo = N - 1;
    s.players[3].bankrupt = true; s.players[3].outRank = 1;
    H.noteRent(s, 1, 0, 820, 39); H.noteRent(s, 2, 0, 450, 37); H.noteRent(s, 3, 1, 380, 24);
    H.noteRent(s, 0, 1, 300, 24); H.noteRent(s, 0, 2, 190, 13);
    s.players[2].jails = 3; s.players[3].jails = 1;
    const fin = s.hist.pts.at(-1);
    [0, 1, 2].forEach((i) => { s.players[i].money = fin.w[i]; });
    s.startedAt = Date.now() - 52 * 60000; s.endedAt = Date.now();
    const { winnerModal } = await import('/src/ui/modals.js');
    winnerModal(s, s.players[0]);
  }, theme);
  await page.locator('.scrim.show .modal-edge-tab').waitFor({ timeout: 5000 });
  await wait(1300);
}

for (const theme of ['default', 'christmas', 'halloween']) {
  console.log(`\n— chủ đề ${theme}`);
  await openWinner(theme);
  await shot(page, `${theme}-1-ha-man`);
  ok('màn hạ màn có nút thống kê ở mép', await page.locator('.scrim.show .modal-edge-tab').isVisible());

  await page.locator('.scrim.show .modal-edge-tab').click();
  await page.locator('.stats-modal .sc-svg').waitFor({ timeout: 5000 });
  await wait(700);
  const info = await page.evaluate(() => ({
    lines: document.querySelectorAll('.stats-modal .sc-stroke').length,
    rows: document.querySelectorAll('.stats-modal .gs-table tbody tr').length,
    cross: document.querySelectorAll('.stats-modal .sc-end').length,
    ribbon: document.querySelectorAll('.stats-modal .sc-ribbon rect').length,
  }));
  ok('đủ bốn đường tiền và bốn hàng số liệu', info.lines === 4 && info.rows === 4, `${info.lines} đường, ${info.rows} hàng`);
  ok('người phá sản có dấu ✕ ở chỗ ngã', info.cross === 1);
  ok('có dải người dẫn đầu', info.ribbon > 10);
  await shot(page, `${theme}-2-thong-ke`);

  // Rê chuột lên biểu đồ: hiện khung số liệu, vạch dọc rơi đúng mốc gần nhất
  const box = await page.locator('.stats-modal .sc-hit').boundingBox();
  await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.3);
  await wait(250);
  const tip = await page.evaluate(() => {
    const t = document.querySelector('.stats-modal .gs-tip');
    const r = t.getBoundingClientRect();
    const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return {
      shown: !t.hidden && getComputedStyle(t).opacity === '1' && r.width > 0,
      rows: t.querySelectorAll('.gs-tip-row').length,
      head: t.querySelector('.gs-tip-head')?.textContent ?? '',
      // Khung số liệu phải nằm gọn trong hộp thống kê
      inside: !!el?.closest('.stats-modal'),
    };
  });
  ok('rê chuột hiện khung số liệu của mốc', tip.shown && tip.rows === 4 && tip.inside, tip.head);
  await shot(page, `${theme}-3-re-chuot`);

  await page.locator('.gs-leg[data-s="1"]').hover();
  await wait(250);
  const dim = await page.evaluate(() => getComputedStyle(document.querySelector('.sc-line[data-s="0"]')).opacity);
  ok('rê lên tên trong chú thích làm mờ đường người khác', Number(dim) < 0.5, dim);
  await shot(page, `${theme}-4-lam-noi`);
  await page.mouse.move(2, 2);

  await page.locator('.stats-modal .gs-seg button[data-key="m"]').click();
  await wait(300);
  const label = await page.evaluate(() => document.querySelector('.stats-modal .sc-svg').getAttribute('aria-label'));
  ok('đổi sang tiền mặt vẽ lại biểu đồ', label.startsWith('Tiền mặt'), label);
  await shot(page, `${theme}-5-tien-mat`);

  await page.keyboard.press('Escape');
  await wait(500);
  const back = await page.evaluate(() => !document.querySelector('.scrim:not(.hide) .stats-modal')
    && !!document.querySelector('.scrim.show:not(.hide) .modal-edge-tab'));
  ok('Esc đóng hộp thống kê, màn hạ màn còn nguyên', back);
}

ok('không lỗi trang', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
if (fails.length) { console.log(`\n${fails.length} lỗi`); process.exit(1); }
console.log('\nBiểu đồ tiền cả trận: ổn.');
