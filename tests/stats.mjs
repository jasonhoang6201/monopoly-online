/**
 * Trang cân bằng kỹ năng (/stats.html) với dữ liệu mẫu: không có khoá Supabase
 * nên gắn `window.__statsRpc` trả dữ liệu giả, rồi kiểm bày bảng, làm mờ dòng
 * n nhỏ, sắp xếp, và bộ lọc gửi đúng tham số. Cần dev server ở cổng 5178.
 */
import { createServer } from 'vite';
import { launchChrome } from './launch.mjs';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { SKILLS, BRANCHES } = await vite.ssrLoadModule('/src/data/skills.js');
await vite.close();

const errors = [];
let fails = 0;
const check = (ok, msg, extra = '') => { console.log(`  ${ok ? '✓' : '✗'} ${msg}${ok || !extra ? '' : ` — ${extra}`}`); if (!ok) fails++; };

/* Dữ liệu mẫu: n tăng dần theo thứ tự ô, Δ có âm có dương, hai ô n = 0. */
const skills = SKILLS.map((s, i) => ({
  skill_id: s.id, branch: s.branch, branch_name: BRANCHES.find((b) => b.key === s.branch).name, tier: s.tier, kind: s.kind, name: s.name,
  n_players: 120, n_learned: i < 2 ? 0 : i, pick_rate: (i / 120).toFixed(4), n_first: i % 5, first_pick_rate: ((i % 5) / 40).toFixed(4),
  avg_lap_learned: (1 + (i % 4)).toFixed(2), lv2_rate: '0.4000', lv3_rate: '0.1000', n_wiped: i % 3, wipe_rate: '0.0500',
  uses_total: i * 4, uses_per_game: '4.00', delta_total: (i - 25) * 100, delta_per_game: ((i - 25) * 10).toFixed(1),
  delta_per_min: '1.50', delta_per_sec: '0.0250', delta_per_use: '12.0', delta_per_turn: '3.0', gain_total: 500, loss_total: -100,
  held_min_total: '30.0', turns_held_total: 200, n_with: i, win_rate_with: '0.3000', avg_rank_with: '2.10', n_without: 120 - i,
  win_rate_without: '0.2500', avg_rank_without: '2.40', avg_worth_with: 3200, avg_worth_without: 2900,
  off_at_end_rate: '0.2000', toggles_per_game: '1.20', avg_point_no_lv1: (1 + (i % 3)).toFixed(2), avg_point_no_lv2: '4.00', avg_point_no_lv3: null, avg_nth_lv1: '1.50',
  point_no_hist: { 1: 5, 2: 3, 3: 1 },
}));
const branches = BRANCHES.map((b, i) => ({
  branch: b.key, branch_name: b.name, n_players: 120, n_picked: 20 + i * 5, pick_rate: ((20 + i * 5) / 120).toFixed(4), n_ult: 3 + i, ult_rate: ((3 + i) / 120).toFixed(4),
  avg_points_in: '3.20', delta_total: (i - 2) * 1000, delta_per_player: ((i - 2) * 40).toFixed(1), delta_share: '0.1200',
  n_with: 20 + i * 5, win_rate_with: '0.3000', avg_rank_with: '2.00', win_rate_without: '0.2000', avg_rank_without: '2.60', n_main: 10 + i, win_rate_main: '0.3500',
}));
const fixture = {
  stats_overview: { n_games: 40, n_finished: 38, n_player_games: 120, avg_duration_s: 1860, avg_turns: 96.5, avg_rounds: 25.1, avg_laps: 7.2, win_by: { last: 20, worth: 15, empire: 3 }, players: { 2: 10, 3: 20, 4: 10 }, mode: { online: 30, offline: 10 }, first_game: '2026-09-01T10:00:00Z', last_game: '2026-10-08T10:00:00Z' },
  stats_skills: skills, stats_branches: branches,
  stats_respec: { n_respec: 6, n_player_games: 120, per_player_game: '0.0500', avg_round: '9.5', avg_lap: '3.0', avg_refund: '3.50', avg_fee: 175, wiped: [{ skill_id: 'dd2a', n: 4 }, { skill_id: 'dd1', n: 2 }], relearned: [{ skill_id: 'ac1', n: 3 }] },
  stats_points: { n: 120, avg_earned: '6.80', avg_spent: '5.90', avg_left: '0.90', hoard_rate: '0.1500', left_hist: { 0: 70, 1: 32, 2: 12, 3: 6 }, earned_hist: { 4: 10, 6: 50, 8: 40, 10: 20 }, avg_earned_winner: '7.50', avg_spent_winner: '7.10', avg_left_winner: '0.40' },
};

const browser = await launchChrome();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
await page.addInitScript((fx) => {
  window.__calls = [];
  window.__statsRpc = async (name, params) => { window.__calls.push({ name, params }); return fx[name]; };
}, fixture);

await page.goto('http://localhost:5178/stats.html', { waitUntil: 'networkidle' });
await page.waitForFunction(() => !document.querySelector('#report').hidden, null, { timeout: 15000 });
const calls = await page.evaluate(() => window.__calls);
check(calls.length === 5 && calls.every((c) => c.params.p_finished === true && c.params.p_mode === null), 'nạp trang gọi 5 hàm stats_* với bộ lọc mặc định', JSON.stringify(calls.map((c) => c.name)));

check((await page.locator('#tiles .tile').count()) === 6 && /40/.test(await page.locator('#tiles .tile').first().textContent()), 'tổng quan: 6 ô, ô đầu ghi 40 ván');
check((await page.locator('#branch-table tbody tr').count()) === 5, 'bảng nhánh 5 dòng');
check((await page.locator('#branch-legend span').count()) === 5, 'chú giải 5 nhánh');
check((await page.locator('#skill-table tbody tr').count()) === 50, 'bảng ô kỹ năng 50 dòng');
check((await page.locator('#skill-table tbody tr.dim').count()) === 3, 'n < 3 (hai ô n=0, một ô n=2) được làm mờ', String(await page.locator('#skill-table tbody tr.dim').count()));
const firstName = await page.locator('#skill-table tbody tr').first().getAttribute('data-id');
check(firstName === SKILLS[49].id, 'mặc định sắp theo tỉ lệ học giảm dần: ô có n lớn nhất đứng đầu', firstName);
check((await page.locator('#skill-table .hist').count()) === 50 && (await page.locator('#skill-table .hist').first().locator('i').count()) === 3, 'mỗi dòng có dải phân phối điểm thứ (3 cột)');
check((await page.locator('#skill-table .bar.signed .fill.neg').count()) > 0 && (await page.locator('#skill-table .bar.signed .fill.pos').count()) > 0, 'Δ / ván có thanh âm và dương');
check(/Nhặt Tiền Rơi/.test(await page.locator('#skill-table tbody tr[data-id="cn1"] td.name').textContent()), 'tên ô lấy từ data/skills.js');

// Sắp xếp: bấm "Δ / ván" → giảm dần, bấm lần nữa → tăng dần
await page.locator('#skill-table th[data-key="delta_per_game"]').click();
check((await page.locator('#skill-table tbody tr').first().getAttribute('data-id')) === SKILLS[49].id && (await page.locator('#skill-table th.sorted').getAttribute('data-key')) === 'delta_per_game', 'bấm cột Δ / ván: sắp giảm dần');
await page.locator('#skill-table th[data-key="delta_per_game"]').click();
check((await page.locator('#skill-table tbody tr').first().getAttribute('data-id')) === SKILLS[0].id, 'bấm lần nữa: tăng dần (ô Δ âm nhất lên đầu)');

check(/dd2a|Cược/.test(await page.locator('#wiped-table').textContent()) && /ac1|Mái Ấm/.test(await page.locator('#relearn-table').textContent()), 'tẩy điểm: bảng ô bị tẩy và học lại');
check((await page.locator('#left-table tbody tr').count()) === 4 && (await page.locator('#earned-table tbody tr').count()) === 4, 'điểm kỹ năng: hai bảng phân phối');

// Bộ lọc: đổi chế độ, bỏ "chỉ ván đã xong", n tối thiểu 10 → gọi lại với tham số mới, nhiều dòng mờ hơn
await page.selectOption('#filters select[name="mode"]', 'online');
await page.locator('#filters input[name="finished"]').uncheck();
await page.fill('#filters input[name="minN"]', '10');
await page.fill('#filters input[name="from"]', '2026-09-01');
await page.locator('#filters button[type="submit"]').click();
await page.waitForFunction(() => window.__calls.length === 10, null, { timeout: 10000 });
const last = await page.evaluate(() => window.__calls[window.__calls.length - 1].params);
check(last.p_mode === 'online' && last.p_finished === false && typeof last.p_from === 'string' && last.p_from.startsWith('2026-0'), 'bộ lọc gửi p_mode/p_finished/p_from', JSON.stringify(last));
check((await page.locator('#skill-table tbody tr.dim').count()) === 10, 'n tối thiểu 10 → 10 dòng mờ', String(await page.locator('#skill-table tbody tr.dim').count()));

await page.screenshot({ path: 'test-result/stats.png', fullPage: true }).catch(() => {});

// Không có khoá và không có móc giả → lời nhắc, không văng lỗi
const p2 = await browser.newPage({ viewport: { width: 900, height: 700 } });
p2.on('pageerror', (e) => errors.push('PAGEERROR(p2): ' + e.message));
await p2.goto('http://localhost:5178/stats.html', { waitUntil: 'networkidle' });
await p2.waitForTimeout(500);
check(/Chưa có khoá Supabase/.test(await p2.locator('#status').textContent()) && (await p2.locator('#report').isHidden()), 'thiếu khoá: hiện lời nhắc, không bày bảng');

await browser.close();
if (errors.length) { console.log('\nLỗi trang:'); for (const e of errors) console.log('  ' + e); }
console.log(fails || errors.length ? `\n✗ ${fails} kiểm thất bại, ${errors.length} lỗi trang` : '\n✓ stats đạt');
process.exit(fails || errors.length ? 1 : 0);
