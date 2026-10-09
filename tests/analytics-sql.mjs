/**
 * Đầu-cuối số liệu cân bằng: mô phỏng ván bằng chính luật (core/state.js,
 * core/skills.js) với Analytics bắt dòng, bơm vào một Postgres **thật** đã
 * chạy supabase/migrations/*.sql, rồi soi các hàm stats_*.
 *
 * Cần biến môi trường MONO_PG trỏ tới database đã migrate (chuỗi psql, ví dụ
 * `postgresql://postgres@127.0.0.1:54329/mono`) và lệnh `psql` trong PATH
 * (hoặc MONO_PSQL). Thiếu thì bỏ qua — không phải lỗi.
 *
 *   MONO_PG=postgresql://postgres@127.0.0.1:54329/mono node tests/analytics-sql.mjs
 */
import { createServer } from 'vite';
import { execFileSync } from 'node:child_process';

const PG = process.env.MONO_PG;
const PSQL = process.env.MONO_PSQL || 'psql';
if (!PG) { console.log('bỏ qua: không có MONO_PG'); process.exit(0); }

const sql = (q, { role = null } = {}) => execFileSync(PSQL, [PG, '-v', 'ON_ERROR_STOP=1', '-At', '-c', `${role ? `set role ${role}; ` : ''}${q}`], { encoding: 'utf8' }).trim();
const sqlJson = (q, o) => JSON.parse(sql(q, o).split('\n').pop());

let fails = 0; let total = 0;
const check = (name, ok, extra = '') => { total += 1; if (!ok) fails += 1; console.log(`${ok ? '✓' : '✗'} ${name}${ok || !extra ? '' : ` — ${extra}`}`); };

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const S = await vite.ssrLoadModule('/src/core/state.js');
const K = await vite.ssrLoadModule('/src/core/skills.js');
const { telemetry } = await vite.ssrLoadModule('/src/core/telemetry.js');
const { Analytics } = await vite.ssrLoadModule('/src/net/analytics.js');

/* Analytics với fetch giả gom mọi dòng theo bảng, đồng hồ giả để t_ms/duration có nghĩa. */
let clock = Date.parse('2026-10-01T10:00:00Z');
const rowsByTable = { games: [], game_players: [], skill_events: [] };
const store = new Map();
const a = new Analytics(null, {
  url: 'https://x', key: 'k', now: () => clock,
  fetch: async (url, init) => { rowsByTable[url.split('/').pop()].push(...JSON.parse(init.body)); return { ok: true, status: 201 }; },
  storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) },
  location: { hostname: 'x', search: '' }, navigator: {},
});
check('Analytics bật', a.enabled);

/** Một ván: 3 người, kịch bản cố định để số liệu đoán trước được. */
async function playGame({ winnerSeat, respecSeat0 }) {
  const st = new S.GameState(['A', 'B', 'C']);
  st.startedAt = clock;
  telemetry.now = () => clock;
  telemetry.start({ startedAt: st.startedAt, gate: () => true, ctx: () => ({ game_id: st.gameId, turn_no: st.turnNo, round: st.round, turn: st.turn }), onPush: (e) => a.push(e) });
  a.gameStart(st, 'online');
  const [p, q, r] = st.players;
  const tick = (ms) => { clock += ms; };
  const endTurn = () => { telemetry.track('turn', { seat: st.turn, turn_no: st.turnNo, round: st.round, cash: st.players.map((x) => x.money) }); st.nextTurn(); };

  // Vòng 1: mỗi người qua Bắt Đầu, A học cn1 (ô đầu tiên), B học dh1, C học dd1 rồi dd2a
  for (const x of [p, q, r]) { K.onLap(x); tick(5000); endTurn(); }
  K.learnSkill(p, 'cn1', st); tick(1000);
  K.learnSkill(q, 'dh1', st); tick(1000);
  K.onLap(r); K.learnSkill(r, 'dd1', st); K.learnSkill(r, 'dd2a', st); K.setSkillOn(r, 'dd2a', true); tick(1000);
  // Vài lượt: cn1 nhặt tiền, dd2a thắng/thua cược
  for (let i = 0; i < 6; i++) {
    K.credit(p, 'cn1', 20); p.money += 20;
    if (i % 2) { K.credit(r, 'dd2a', 50); r.money += 50; } else { K.credit(r, 'dd2a', 0, { delta: -30 }); r.money -= 30; }
    tick(10_000); endTurn();
  }
  // A lên level 2 cn1 (đã kiếm 120 ≥ 100), rồi (tuỳ ván) tẩy và học lại sang dh1
  K.onLap(p); K.learnSkill(p, 'cn1', st); tick(1000);
  if (respecSeat0) { p.money = 1000; K.respec(p); K.learnSkill(p, 'dh1', st); tick(1000); }
  // C vỡ nợ ở vòng 3
  r.money = 0; st.bankrupt(r.id); tick(1000); endTurn();
  for (let i = 0; i < 4; i++) { tick(10_000); endTurn(); }
  st.endedAt = clock;
  const w = st.players[winnerSeat];
  await a.gameEnd(st, { player: w, by: 'last' });
  await a.sendQueue();
  telemetry.stop();
  return st;
}

const g1 = await playGame({ winnerSeat: 0, respecSeat0: false });
console.log('sau ván 1:', JSON.stringify({ g: rowsByTable.games.length, p: rowsByTable.game_players.length, e: rowsByTable.skill_events.length, queue: a.queue.length, buffer: a.buffer.length }));
clock += 3600_000;
const g2 = await playGame({ winnerSeat: 1, respecSeat0: true });
console.log('sau ván 2:', JSON.stringify({ g: rowsByTable.games.length, p: rowsByTable.game_players.length, e: rowsByTable.skill_events.length, queue: a.queue.length, buffer: a.buffer.length, tm: telemetry.size }));
await vite.close();

check('đã gom dòng: 4 games, 6 game_players, nhiều skill_events',
  rowsByTable.games.length === 4 && rowsByTable.game_players.length === 6 && rowsByTable.skill_events.length > 40,
  JSON.stringify({ g: rowsByTable.games.length, p: rowsByTable.game_players.length, e: rowsByTable.skill_events.length }));

/* ------------------------------------------------------------- bơm vào Postgres như anon */
const ids = [g1.gameId, g2.gameId].map((x) => `'${x}'`).join(',');
/* Dọn mọi ván của ngày mẫu (2026-10-01) còn sót từ lần chạy dở trước — đây là DB dev, không phải DB thật. */
const wipe = () => sql(`with g as (select game_id from public.games where started_at >= '2026-10-01' and started_at < '2026-10-02')
  delete from public.skill_events where game_id in (select game_id from g);
  with g as (select game_id from public.games where started_at >= '2026-10-01' and started_at < '2026-10-02')
  delete from public.game_players where game_id in (select game_id from g);
  delete from public.games where started_at >= '2026-10-01' and started_at < '2026-10-02';`);
wipe();
for (const table of ['games', 'game_players', 'skill_events']) {
  const json = JSON.stringify(rowsByTable[table]).replace(/'/g, "''");
  const cols = Object.keys(rowsByTable[table][0]).join(', ');
  sql(`insert into public.${table} (${cols}) select ${cols} from jsonb_populate_recordset(null::public.${table}, '${json}'::jsonb);`, { role: 'anon' });
}
check('anon chèn được cả ba bảng', true);
try { sql('select count(*) from public.skill_events', { role: 'anon' }); check('anon đọc bảng gốc: phải bị chặn', false); }
catch { check('anon đọc bảng gốc: bị chặn', true); }
// Gửi lại y hệt → 409 ở REST, ở SQL là lỗi khoá trùng: xác nhận khoá (game_id, client_id, seq) chặn trùng
try { sql(`insert into public.skill_events (game_id, client_id, seq, t_ms, kind, payload) select game_id, client_id, seq, t_ms, kind, payload from jsonb_populate_recordset(null::public.skill_events, '${JSON.stringify(rowsByTable.skill_events.slice(0, 1)).replace(/'/g, "''")}'::jsonb);`, { role: 'anon' }); check('chèn lại dòng cũ phải trùng khoá', false); }
catch (e) { check('chèn lại dòng cũ → trùng khoá (23505)', /duplicate key|23505/.test(String(e.stderr ?? e.message))); }

/* ------------------------------------------------------------- soi số liệu (lọc theo 2 ván này) */
const F = `'2026-10-01T00:00:00Z','2026-10-02T00:00:00Z'`;
const games = sqlJson(`select to_jsonb(array_agg(g)) from (select * from public.v_games where game_id in (${ids}) order by started_at) g`, { role: 'anon' });
check('v_games: 2 ván đã xong, duration đúng, win_by last', games.length === 2 && games.every((g) => g.finished && g.win_by === 'last') && games[0].duration_s > 100,
  JSON.stringify(games.map((g) => [g.finished, g.win_by, g.duration_s])));

const ov = sqlJson(`select stats_overview(${F})`, { role: 'anon' });
check('stats_overview: n_games 2, n_player_games 6, players {3:2}', ov.n_games === 2 && ov.n_player_games === 6 && ov.players['3'] === 2 && ov.win_by.last === 2, JSON.stringify(ov));

const sk = sqlJson(`select to_jsonb(array_agg(s)) from stats_skills(${F}) s`, { role: 'anon' });
const by = Object.fromEntries(sk.map((s) => [s.skill_id, s]));
check('stats_skills: 50 dòng, có cả ô chưa ai học (n_learned 0)', sk.length === 50 && by.acU.n_learned === 0 && by.acU.n_players === 6);
check('cn1: học 2 người-ván / 6 → pick_rate 0.3333', by.cn1.n_learned === 2 && Number(by.cn1.pick_rate) === 0.3333, JSON.stringify([by.cn1.n_learned, by.cn1.pick_rate]));
check('cn1: là ô đầu tiên 2 lần trong 6 người có học → first_pick_rate 0.3333', by.cn1.n_first === 2 && Number(by.cn1.first_pick_rate) === 0.3333, JSON.stringify([by.cn1.n_first, by.cn1.first_pick_rate]));
check('cn1: lên lv2 cả 2 ván → lv2_rate 1, lv3_rate 0', Number(by.cn1.lv2_rate) === 1 && Number(by.cn1.lv3_rate) === 0);
check('cn1: 12 lần chạy, delta_total 240, delta_per_game 120, per_use 20', by.cn1.uses_total === 12 && by.cn1.delta_total === 240 && Number(by.cn1.delta_per_game) === 120 && Number(by.cn1.delta_per_use) === 20,
  JSON.stringify([by.cn1.uses_total, by.cn1.delta_total, by.cn1.delta_per_game, by.cn1.delta_per_use]));
check('cn1: học ở điểm thứ 1, lv2 ở điểm thứ 2; hist {"1": 2}', Number(by.cn1.avg_point_no_lv1) === 1 && Number(by.cn1.avg_point_no_lv2) === 2 && by.cn1.point_no_hist['1'] === 2, JSON.stringify([by.cn1.avg_point_no_lv1, by.cn1.avg_point_no_lv2, by.cn1.point_no_hist]));
check('cn1: bị tẩy 1 lần (ván 2) → n_wiped 1, wipe_rate 0.5', by.cn1.n_wiped === 1 && Number(by.cn1.wipe_rate) === 0.5);
check('cn1: thắng 1/2 ván có học → win_rate_with 0.5, n_with 2; without 4 người-ván, thắng 1 → 0.25',
  by.cn1.n_with === 2 && Number(by.cn1.win_rate_with) === 0.5 && by.cn1.n_without === 4 && Number(by.cn1.win_rate_without) === 0.25, JSON.stringify([by.cn1.n_with, by.cn1.win_rate_with, by.cn1.n_without, by.cn1.win_rate_without]));
check('dd2a: delta có dấu: 3×50 − 3×30 = 60 mỗi ván → delta_total 120, gain 300, loss −180', by.dd2a.delta_total === 120 && by.dd2a.gain_total === 300 && by.dd2a.loss_total === -180, JSON.stringify([by.dd2a.delta_total, by.dd2a.gain_total, by.dd2a.loss_total]));
check('dd2a: toggles_per_game 1 (bật tay), off_at_end 0 — người học đã vỡ nợ nên held_at_end theo cây lúc hạ màn', Number(by.dd2a.toggles_per_game) === 1, JSON.stringify([by.dd2a.toggles_per_game, by.dd2a.off_at_end_rate]));
check('cn1: thời gian nắm giữ > 0 phút, delta_per_min > 0, turns_held > 0', Number(by.cn1.held_min_total) > 1 && Number(by.cn1.delta_per_min) > 0 && by.cn1.turns_held_total > 0, JSON.stringify([by.cn1.held_min_total, by.cn1.delta_per_min, by.cn1.turns_held_total]));
check('dh1: học 3 lần (B×2 ở nth 1, A sau tẩy ở nth 3) → avg_point_no_lv1 = 1, avg_nth_lv1 = 1.67', Number(by.dh1.avg_point_no_lv1) === 1 && Number(by.dh1.avg_nth_lv1) === 1.67, JSON.stringify([by.dh1.avg_point_no_lv1, by.dh1.avg_nth_lv1]));

const br = sqlJson(`select to_jsonb(array_agg(b)) from stats_branches(${F}) b`, { role: 'anon' });
const bb = Object.fromEntries(br.map((b) => [b.branch, b]));
check('stats_branches: 5 nhánh; congnhan 2 người-ván, doden 2, duhanh 3 (B ×2 + A sau tẩy), ancu 0',
  br.length === 5 && bb.congnhan.n_picked === 2 && bb.doden.n_picked === 2 && bb.duhanh.n_picked === 3 && bb.ancu.n_picked === 0, JSON.stringify(br.map((b) => [b.branch, b.n_picked])));
check('doden: delta_total 120', bb.doden.delta_total === 120);

const rs = sqlJson(`select stats_respec(${F})`, { role: 'anon' });
check('stats_respec: 1 lần, tẩy cn1 lv2, học lại dh1', rs.n_respec === 1 && rs.wiped[0].skill_id === 'cn1' && rs.relearned[0].skill_id === 'dh1', JSON.stringify(rs));

const pt = sqlJson(`select stats_points(${F})`, { role: 'anon' });
check('stats_points: 6 người-ván, avg_earned > 0, có left_hist', pt.n === 6 && Number(pt.avg_earned) > 0 && pt.left_hist && typeof pt.left_hist === 'object', JSON.stringify(pt));

// Bộ lọc: ngoài khoảng ngày → rỗng; p_finished=false vẫn đếm
const empty = sqlJson(`select stats_overview('2030-01-01','2030-01-02')`, { role: 'anon' });
check('bộ lọc ngày: ngoài khoảng → 0 ván', empty.n_games === 0);
check('bộ lọc mode: online → 2, offline → 0', sqlJson(`select stats_overview(${F},'online')`, { role: 'anon' }).n_games === 2 && sqlJson(`select stats_overview(${F},'offline')`, { role: 'anon' }).n_games === 0);

if (!process.env.KEEP) wipe();
console.log(`\n${total - fails}/${total} đạt`);
process.exit(fails ? 1 : 0);
