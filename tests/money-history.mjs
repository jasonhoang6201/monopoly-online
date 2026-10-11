/**
 * Sổ tiền cho biểu đồ cuối ván (core/history.js) — chạy thuần dưới Node qua
 * Vite SSR như tests/telemetry.mjs, không cần dev server.
 *
 *   node tests/money-history.mjs
 */
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { GameState } = await vite.ssrLoadModule('/src/core/state.js');
const H = await vite.ssrLoadModule('/src/core/history.js');
const { snapshot, fromSnapshot } = await vite.ssrLoadModule('/src/core/serialize.js');

const fails = [];
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? '✓' : '✗'} ${name}${extra ? ` — ${extra}` : ''}`);
  if (!cond) fails.push(name);
};

const st = new GameState(['An', 'Bình', 'Chi']);
ok('ván mới có sẵn một mốc', st.hist.pts.length === 1 && st.hist.pts[0].m[0] === st.players[0].money);

st.buy(0, 1);
for (let i = 0; i < 5; i++) st.nextTurn();
const last = st.hist.pts.at(-1);
ok('mỗi lượt thêm một mốc', st.hist.pts.length === 6, `${st.hist.pts.length} mốc`);
ok('mốc ghi cả tiền mặt lẫn tổng tài sản', last.m[0] === st.players[0].money && last.w[0] === st.netWorth(0)
  && last.w[0] > last.m[0]);

H.noteRent(st, 1, 0, 450, 1);
H.noteRent(st, 2, 0, 120, 1);
ok('tiền thuê ghi cú đau nhất', st.hist.rent[1].max === 450 && st.hist.rent[0].got === 570);

H.sampleMoney(st, st.turnNo);
ok('cùng lượt thì ghi đè, không thêm mốc', st.hist.pts.length === 6);

const sr = H.moneySeries(st, 'm');
ok('chuỗi tiền mặt đủ người, đủ mốc', sr.series.length === 3 && sr.series[1].length === 6);
ok('người dẫn đầu tính theo tổng tài sản', sr.lead.at(-1) === 0);

const st2 = fromSnapshot(JSON.parse(JSON.stringify(snapshot(st))));
ok('sổ đi nguyên vẹn qua ảnh chụp', JSON.stringify(st2.hist) === JSON.stringify(st.hist));
const old = snapshot(st);
delete old.hist;
const st3 = fromSnapshot(JSON.parse(JSON.stringify(old)));
ok('ảnh chụp cũ chưa có sổ vẫn dựng được ván', Array.isArray(st3.hist.pts) && H.moneySeries(st3).pts.length >= 1);

const big = new GameState(['A', 'B']);
for (let i = 0; i < H.HIST_MAX * 2; i++) big.nextTurn();
const ks = big.hist.pts.map((p) => p.k);
ok('ván dài co sổ lại dưới trần, giữ mốc cuối', ks.length <= H.HIST_MAX && ks.at(-1) === big.turnNo,
  `${ks.length} mốc, cuối k=${ks.at(-1)}`);
ok('mốc vẫn xếp tăng dần sau khi co', ks.every((k, i) => i === 0 || k > ks[i - 1]));
big.players[1].bankrupt = true;
H.sampleMoney(big, big.turnNo + 1);
ok('người phá sản ghi null để đường dừng chỗ ngã', big.hist.pts.at(-1).w[1] === null);
ok('ảnh chụp ván dài vẫn nhỏ', JSON.stringify(snapshot(big).hist).length < 20000,
  `${JSON.stringify(snapshot(big).hist).length} byte`);

await vite.close();
if (fails.length) { console.log(`\n${fails.length} lỗi`); process.exit(1); }
console.log('\nSổ tiền: ổn.');
