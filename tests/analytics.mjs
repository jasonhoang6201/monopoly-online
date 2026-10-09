/**
 * net/analytics.js dưới Node: cổng chặn bot, gom batch, hàng đợi và gửi lại.
 * Mọi thứ ngoài (fetch, localStorage, location, navigator) đều tiêm giả.
 *
 *   node tests/analytics.mjs
 */
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { Analytics } = await vite.ssrLoadModule('/src/net/analytics.js');

let fails = 0; let total = 0;
const check = (name, ok, extra = '') => {
  total += 1; if (!ok) fails += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !extra ? '' : ` — ${extra}`}`);
};

/** Dựng một Analytics với môi trường giả. */
function make({ host = 'co-ty-phu.vercel.app', search = '', webdriver = false, key = 'anon', url = 'https://x.supabase.co', fetch, storage } = {}) {
  const store = storage ?? new Map();
  return new Analytics(null, {
    url, key,
    fetch: fetch ?? (async () => ({ status: 201, ok: true })),
    storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) },
    location: { hostname: host, search },
    navigator: { webdriver },
    now: () => 1_700_000_000_000,
  });
}

/* ------------------------------------------------------------- cổng chặn */
check('bật: domain thật, không webdriver, có khoá', make().enabled);
check('tắt: navigator.webdriver (Playwright)', !make({ webdriver: true }).enabled);
check('tắt: localhost không có ?telemetry=1', !make({ host: 'localhost' }).enabled);
check('tắt: 127.0.0.1', !make({ host: '127.0.0.1' }).enabled);
check('bật: localhost + ?telemetry=1', make({ host: 'localhost', search: '?telemetry=1' }).enabled);
check('bật: webdriver + ?telemetry=1 (ép bật để kiểm tay)', make({ webdriver: true, search: '?room=AB12&telemetry=1' }).enabled);
check('tắt: ?telemetry=0 trên domain thật', !make({ search: '?telemetry=0' }).enabled);
check('tắt: thiếu khoá Supabase', !make({ key: '' }).enabled && !make({ url: '' }).enabled);

/* ------------------------------------------------------------- buffer */
{
  const a = make();
  a.push({ seq: 1, kind: 'learn' });
  a.push({ seq: 2, kind: 'use' });
  check('push gom vào buffer', a.buffer.length === 2 && a.buffer[1].kind === 'use');
  check('clientId 16 hex, mỗi lần tạo khác nhau', /^[0-9a-f]{16}$/.test(a.clientId) && a.clientId !== make().clientId);
}

/* ------------------------------------------------------------- gửi batch */
/** fetch giả: ghi lại từng request, trả status theo kịch bản (mảng, hết thì 201). */
function fakeFetch(statuses = []) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    const status = statuses.length ? statuses.shift() : 201;
    if (status === 'neterr') throw new TypeError('Failed to fetch');
    return { status, ok: status >= 200 && status < 300, text: async () => '' };
  };
  fn.calls = calls;
  return fn;
}
const ev = (seq, extra = {}) => ({ seq, t: seq * 10, kind: 'use', game_id: 'G1', turn_no: 3, round: 1, turn: 0, seat: 0, id: 'cn1', delta: 20, gain: 20, counted: true, ...extra });

{
  const f = fakeFetch();
  const a = make({ fetch: f });
  a.push(ev(1)); a.push(ev(2, { kind: 'learn', level: 1, cost: 1, delta: undefined }));
  await a.flush();
  check('flush: một request POST /rest/v1/skill_events', f.calls.length === 1 && f.calls[0].url === 'https://x.supabase.co/rest/v1/skill_events' && f.calls[0].init.method === 'POST');
  const h = f.calls[0].init.headers;
  check('header apikey / Bearer / Prefer minimal / json', h.apikey === 'anon' && h.Authorization === 'Bearer anon'
    && h.Prefer === 'return=minimal' && h['Content-Type'] === 'application/json', JSON.stringify(h));
  const rows = f.calls[0].body;
  check('dòng tách cột: game_id, client_id, seq, t_ms, kind, seat, skill_id, delta, turn_no, round, payload',
    rows.length === 2 && rows[0].game_id === 'G1' && rows[0].client_id === a.clientId && rows[0].seq === 1 && rows[0].t_ms === 10
    && rows[0].kind === 'use' && rows[0].seat === 0 && rows[0].skill_id === 'cn1' && rows[0].delta === 20 && rows[0].turn_no === 3
    && rows[0].round === 1 && rows[0].payload.gain === 20 && rows[0].payload.counted === true && rows[0].payload.turn === 0
    && !('id' in rows[0].payload) && !('seq' in rows[0].payload) && rows[1].delta === null && rows[1].payload.level === 1, JSON.stringify(rows));
  check('201 → hàng đợi rỗng, buffer rỗng', a.queue.length === 0 && a.buffer.length === 0);
  check('flush buffer rỗng không gửi gì', (await a.flush(), f.calls.length === 1));
}
{
  const f = fakeFetch([500, 'neterr', 201]);
  const store = new Map();
  const a = make({ fetch: f, storage: store });
  a.push(ev(1));
  await a.flush();
  check('500 → giữ batch trong hàng đợi', a.queue.length === 1 && f.calls.length === 1);
  check('hàng đợi được ghi vào localStorage', JSON.parse(store.get('monopoly.analytics.q')).length === 1);
  a.push(ev(2));
  await a.flush();
  check('batch bất biến: sự kiện mới thành batch mới, không gộp vào batch đã thử gửi',
    a.queue.length === 2 && a.queue[0].rows.length === 1 && a.queue[1].rows.length === 1 && a.queue[0].id !== a.queue[1].id);
  check('lỗi mạng → vẫn giữ, gửi tuần tự nên batch 2 chưa đi', f.calls.length === 2 && a.queue.length === 2);
  await a.sendQueue();
  check('gửi lại: batch 1 đi (201), batch 2 đi (201) → rỗng', f.calls.length === 4 && a.queue.length === 0, `${f.calls.length} ${a.queue.length}`);
}
{
  const f = fakeFetch([409, 400]);
  const a = make({ fetch: f });
  a.push(ev(1)); await a.flush();
  check('409 (đã có) → bỏ batch', a.queue.length === 0);
  a.push(ev(2)); await a.flush();
  check('4xx khác → bỏ batch (không gửi lại mãi)', a.queue.length === 0 && f.calls.length === 2);
}
{
  // Hàng đợi còn dở từ lần mở trang trước được nạp lại và gửi
  const store = new Map();
  store.set('monopoly.analytics.q', JSON.stringify([{ id: 'old1', table: 'skill_events', rows: [{ game_id: 'G0', client_id: 'c0', seq: 1, kind: 'lap', payload: {} }] }]));
  const f = fakeFetch();
  const a = make({ fetch: f, storage: store });
  check('nạp lại hàng đợi cũ', a.queue.length === 1 && a.queue[0].rows[0].client_id === 'c0');
  await a.sendQueue();
  check('gửi hàng đợi cũ, giữ nguyên client_id cũ', f.calls.length === 1 && f.calls[0].body[0].client_id === 'c0' && a.queue.length === 0);
}
{
  const a = make({ fetch: fakeFetch(['neterr']) });
  for (let i = 1; i <= 450; i++) a.push(ev(i));
  await a.flush();
  check('batch tối đa 200 dòng: 450 sự kiện → 3 batch', a.queue.length === 3 && a.queue[0].rows.length === 200 && a.queue[2].rows.length === 50);
}
{
  // keepalive: thân ≤ 60 KB, phần dư tách thành batch riêng **trước** khi gửi
  const f = fakeFetch();
  const a = make({ fetch: f });
  for (let i = 1; i <= 200; i++) a.push(ev(i, { note: 'x'.repeat(400) }));
  await a.flushNow({ keepalive: true, timeoutMs: 500 });
  const sizes = f.calls.map((c) => c.init.body.length);
  check('keepalive: mọi request có keepalive=true và thân < 60 KB', f.calls.length >= 2 && f.calls.every((c) => c.init.keepalive === true) && sizes.every((n) => n < 60_000), String(sizes));
  const sent = f.calls.reduce((n, c) => n + c.body.length, 0);
  check('keepalive: tổng dòng đã gửi = 200, hàng đợi rỗng', sent === 200 && a.queue.length === 0, `${sent} ${a.queue.length}`);
}
{
  // flushNow có hạn: fetch treo quá timeoutMs thì vẫn trả về, batch nằm lại
  const hang = () => new Promise(() => {});
  const a = make({ fetch: hang });
  a.push(ev(1));
  const t0 = Date.now();
  await a.flushNow({ timeoutMs: 100 });
  check('flushNow hết hạn vẫn trả về, batch giữ lại', Date.now() - t0 < 1000 && a.queue.length === 1);
}
{
  const a = make({ webdriver: true, fetch: fakeFetch() });
  a.push(ev(1)); await a.flush(); a.gameStart({ gameId: 'G', players: [] }, 'offline');
  check('đang tắt: push/flush/gameStart không làm gì', a.buffer.length === 0 && a.queue.length === 0 && a.fetch.calls.length === 0);
}

{
  // Lỗi từng gặp: sendQueue lúc hàng đợi rỗng để lại promise đã xong trong `sending`, các lần sau không gửi nữa
  const f = fakeFetch();
  const a = make({ fetch: f });
  await a.sendQueue();
  await a.sendQueue();
  a.push(ev(1)); await a.flush();
  check('sendQueue rỗng rồi gọi lại: vẫn gửi', f.calls.length === 1 && a.queue.length === 0, `${f.calls.length} ${a.queue.length}`);
  a.push(ev(2)); await a.flush();
  check('ván sau vẫn gửi', f.calls.length === 2 && a.queue.length === 0);
}

/* ------------------------------------------------------------- tổng kết ván */
{
  const S = await vite.ssrLoadModule('/src/core/state.js');
  const K = await vite.ssrLoadModule('/src/core/skills.js');
  const st = new S.GameState(['A', 'B', 'C'], null, { events: 'vua', theme: 'classic' });
  const f = fakeFetch(['neterr', 'neterr', 'neterr']);
  const a = make({ fetch: f });
  a.gameStart(st, 'online');
  const g0 = a.queue[0];
  check('gameStart → batch games phase=start với mode, players, started_at', g0.table === 'games' && g0.rows[0].phase === 'start'
    && g0.rows[0].game_id === st.gameId && g0.rows[0].mode === 'online' && g0.rows[0].players === 3
    && g0.rows[0].started_at === new Date(st.startedAt).toISOString() && g0.rows[0].client_id === a.clientId
    && g0.rows[0].theme === st.settings.theme && g0.rows[0].events_level === 'vua', JSON.stringify(g0.rows[0]));

  const [p, q, r] = st.players;
  K.grantLapPoint(p, 4); K.learnSkill(p, 'cn1', st); K.learnSkill(p, 'cn2a', st);
  p.money = 900; q.money = 1200; p.laps = 3; q.laps = 2; r.laps = 1; q.jails = 1;
  K.grantLapPoint(r, 1); K.learnSkill(r, 'dh1', st);
  st.turnNo = 30; st.round = 11; st.laps = 6; st.eventsFired = 2;
  st.bankrupt(r.id);
  st.endedAt = st.startedAt + 90_000;
  a.gameEnd(st, { player: q, by: 'worth' });
  const ge = a.queue.find((b) => b.table === 'games' && b.rows[0].phase === 'end');
  const gp = a.queue.find((b) => b.table === 'game_players');
  check('gameEnd → games phase=end: win_by, winner_seat, ended_at, turns, rounds', ge && ge.rows[0].win_by === 'worth' && ge.rows[0].winner_seat === 1
    && ge.rows[0].ended_at === new Date(st.endedAt).toISOString() && ge.rows[0].turns === 30 && ge.rows[0].rounds === 11
    && ge.rows[0].laps === 6 && ge.rows[0].events_fired === 2 && ge.rows[0].players === 3, JSON.stringify(ge?.rows[0]));
  check('game_players: 3 dòng, hạng theo finalRanking (B thắng, A, C phá sản)', gp && gp.rows.length === 3
    && gp.rows.find((x) => x.seat === 1).rank === 1 && gp.rows.find((x) => x.seat === 1).won === true
    && gp.rows.find((x) => x.seat === 0).rank === 2 && gp.rows.find((x) => x.seat === 2).rank === 3
    && gp.rows.find((x) => x.seat === 2).bankrupt === true && gp.rows.find((x) => x.seat === 2).out_rank === 1, JSON.stringify(gp?.rows));
  const pa = gp.rows.find((x) => x.seat === 0);
  check('game_players ghế A: tiền, tài sản, điểm, cây kỹ năng', pa.money_end === 900 && pa.net_worth_end === st.netWorth(0)
    && pa.points_earned === 4 && pa.points_spent === 2 && pa.points_left === 2 && pa.laps === 3 && pa.token === p.token.key
    && JSON.stringify(pa.skills) === JSON.stringify([{ id: 'cn1', lv: 1, off: false }, { id: 'cn2a', lv: 1, off: false }])
    && pa.skill_use && typeof pa.skill_use === 'object', JSON.stringify(pa));
  check('gameEnd gọi flush (đã cố gửi)', f.calls.length >= 1);
  check('dòng end mang cùng mode với dòng start (online), không hỏi lại controller', ge.rows[0].mode === 'online', ge.rows[0].mode);
}

await vite.close();
console.log(`\n${total - fails}/${total} đạt`);
process.exit(fails ? 1 : 0);
