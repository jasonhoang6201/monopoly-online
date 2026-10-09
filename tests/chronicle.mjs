/**
 * Biên niên ván (core/chronicle.js) — chạy thuần dưới Node, không cần dev server.
 *
 * Soát: sổ ghi đúng ai trả ai, cặp oan gia chỉ xướng tên một lần, đường tài
 * sản ghi mỗi vòng một mốc, sổ đi nguyên vẹn qua ảnh chụp, và danh hiệu trao
 * đúng người — hoà nhau thì không trao.
 */
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { GameState } = await vite.ssrLoadModule('/src/core/state.js');
const { snapshot, fromSnapshot } = await vite.ssrLoadModule('/src/core/serialize.js');
const Ch = await vite.ssrLoadModule('/src/core/chronicle.js');
await vite.close();

const fails = [];
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? '✓' : '✗'} ${name}${extra ? ` — ${extra}` : ''}`);
  if (!cond) fails.push(name);
};

const st = new GameState(['An', 'Bình', 'Chi']);
ok('ván mới có sẵn một mốc tài sản', st.chron.worth.length === 1 && st.chron.worth[0].w[0] === st.players[0].money);

st.buy(0, 1); st.buy(0, 3); st.buy(1, 6);
st.mortgage(0, 1); st.mortgage(0, 3);
ok('mua đất và cầm cố được đếm', st.chron.tally[0].buys === 2 && st.chron.tally[0].morts === 2);

Ch.notePay(st, 0, 1, 300);
ok('chưa đủ ngưỡng thì chưa thành oan gia', Ch.checkRival(st) === null);
Ch.notePay(st, 1, 0, 250);
const r = Ch.checkRival(st);
ok('vượt ngưỡng thì xướng tên cặp oan gia', r && r.a === 0 && r.b === 1 && r.total === 550);
ok('cặp cũ không xướng tên lần hai', Ch.checkRival(st) === null);
ok('rivalFor trả đúng người kia', Ch.rivalFor(st, 1) === 0 && Ch.rivalFor(st, 2) === null);

// Cặp khác vượt sát nút thì chưa thế chỗ — băng rôn không nhảy qua nhảy lại
Ch.notePay(st, 2, 0, 600);
ok('cặp mới vượt sát nút thì chưa thế chỗ', Ch.checkRival(st) === null && Ch.rivalFor(st, 1) === 0);
Ch.notePay(st, 0, 2, 200);
const swap = Ch.checkRival(st);
ok('cặp mới vượt hẳn thì thành oan gia mới', swap && swap.a === 0 && swap.b === 2 && Ch.rivalFor(st, 2) === 0);

Ch.noteRent(st, 0, 1, 450, 6);
Ch.noteRent(st, 2, 1, 100, 6);
ok('tiền thuê ghi cú đau nhất', st.chron.rent[0].max === 450 && st.chron.rent[1].got === 550);

const before = st.chron.worth.length;
for (let i = 0; i < 6; i++) st.nextTurn();
ok('mỗi vòng mới thêm một mốc tài sản', st.chron.worth.length === before + 2, `${before} → ${st.chron.worth.length}`);

st.players[2].jails = 3;
const st2 = fromSnapshot(JSON.parse(JSON.stringify(snapshot(st))));
ok('sổ đi nguyên vẹn qua ảnh chụp', JSON.stringify(st2.chron) === JSON.stringify(st.chron));
st2.chron.pay[0][1] += 1;
ok('ảnh chụp chép sổ chứ không dùng chung', st.chron.pay[0][1] === 300);

const list = Ch.awards(st);
const by = (id) => list.find((a) => a.id === id);
ok('Thánh Đen về người trả cú 450', by('ouch')?.seat === 0);
ok('Địa Chủ Thu Tô về người thu nhiều nhất', by('landlord')?.seat === 1);
ok('Hộ Khẩu Chí Hoà về người vào tù 3 lần', by('jail')?.seat === 2);
ok('Oan Gia Ngõ Hẹp mang đủ hai người', by('rival')?.seats?.join() === '0,2');

const tie = new GameState(['A', 'B']);
tie.players[0].jails = 2; tie.players[1].jails = 2;
ok('hoà nhau thì không trao danh hiệu', !Ch.awards(tie).some((a) => a.id === 'jail'));

const old = snapshot(st);
delete old.chron;
const st3 = fromSnapshot(JSON.parse(JSON.stringify(old)));
ok('ảnh chụp cũ chưa có sổ vẫn dựng được ván', Array.isArray(st3.chron.worth) && Ch.awards(st3).length >= 0);

if (fails.length) {
  console.log(`\n${fails.length} lỗi`);
  process.exit(1);
}
console.log('\nBiên niên ván: ổn.');
