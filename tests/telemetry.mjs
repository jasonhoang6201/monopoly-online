/**
 * Bộ đệm sự kiện kỹ năng (core/telemetry.js) và các điểm móc trong luật —
 * chạy thuần dưới Node qua Vite SSR như tests/balance.mjs, không cần dev server.
 *
 *   node tests/telemetry.mjs
 */
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const T = await vite.ssrLoadModule('/src/core/telemetry.js');

let fails = 0;
let total = 0;
const check = (name, ok, extra = '') => {
  total += 1;
  if (!ok) fails += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !extra ? '' : ` — ${extra}`}`);
};
const json = (v) => JSON.stringify(v);

/* ---------------------------------------------------------------- Telemetry */
{
  const { Telemetry, uuid } = T;
  const ids = new Set(Array.from({ length: 20 }, () => uuid()));
  check('uuid: 36 ký tự, không trùng', ids.size === 20 && [...ids].every((x) => x.length === 36));

  let clock = 1000;
  const tm = new Telemetry({ now: () => clock });
  check('tắt: track trả null, không ghi', tm.track('use', { seat: 0 }) === null && tm.size === 0 && !tm.enabled);

  let gate = true;
  const pushed = [];
  tm.start({
    startedAt: 1000,
    gate: () => gate,
    ctx: () => ({ game_id: 'G', turn_no: 7, round: 2, turn: 1 }),
    onPush: (ev) => pushed.push(ev),
  });
  check('start: bật', tm.enabled && tm.size === 0);

  clock = 1500;
  const e1 = tm.track('learn', { seat: 0, id: 'cn1' });
  clock = 2000;
  const e2 = tm.track('use', { seat: 0, id: 'cn1', delta: -5 });
  check('seq tăng dần 1, 2', e1?.seq === 1 && e2?.seq === 2, json([e1, e2]));
  check('t tính từ startedAt theo đồng hồ tiêm vào', e1.t === 500 && e2.t === 1000);
  check('ctx trộn vào sự kiện', e1.game_id === 'G' && e1.turn_no === 7 && e1.round === 2 && e1.turn === 1);
  check('payload giữ nguyên', e1.kind === 'learn' && e1.id === 'cn1' && e2.delta === -5);
  check('onPush nhận từng sự kiện', pushed.length === 2 && pushed[1] === e2);

  gate = false;
  const e3 = tm.track('use', { seat: 1, id: 'dh1' });
  gate = true;
  const e4 = tm.track('use', { seat: 1, id: 'dh1' });
  check('gate false: không ghi, seq không nhảy', e3 === null && e4.seq === 3 && pushed.length === 3);

  const got = tm.drain();
  check('drain trả mảng rồi làm rỗng', got.length === 3 && got[0] === e1 && tm.size === 0);
  check('drain lần hai rỗng', tm.drain().length === 0);

  tm.track('lap', { seat: 0 });
  tm.stop();
  check('stop: tắt, giữ buffer', !tm.enabled && tm.track('lap', {}) === null && tm.size === 1);

  tm.start({ startedAt: 5000, gate: () => true, ctx: () => ({}) });
  const e5 = tm.track('lap', { seat: 0 });
  check('start lại: seq về 1, buffer cũ đã bỏ', e5.seq === 1 && tm.size === 1);

  const { telemetry, track } = T;
  check('singleton + track() tiện dụng', telemetry instanceof Telemetry && track('x', {}) === null);
}

/* ---------------------------------------------------------- móc trong luật */
{
  const { telemetry } = T;
  const K = await vite.ssrLoadModule('/src/core/skills.js');
  const S = await vite.ssrLoadModule('/src/core/state.js');
  const Z = await vite.ssrLoadModule('/src/core/serialize.js');
  const { GROUP_TILES } = await vite.ssrLoadModule('/src/data/board.js');

  const st = new S.GameState(['A', 'B']);
  const [p, q] = st.players;
  check('GameState có gameId (uuid)', typeof st.gameId === 'string' && st.gameId.length === 36);
  const snap = Z.snapshot(st);
  check('snapshot mang gameId, fromSnapshot giữ nguyên', snap.gameId === st.gameId && Z.fromSnapshot(snap).gameId === st.gameId);

  const evs = [];
  telemetry.start({ startedAt: st.startedAt, gate: () => true, ctx: () => ({ game_id: st.gameId }), onPush: (e) => evs.push(e) });
  const last = () => evs[evs.length - 1];
  const ofKind = (k) => evs.filter((e) => e.kind === k);

  K.grantLapPoint(p, 3);
  check('grantLapPoint mặc định (qua ô Bắt Đầu) không phát sự kiện riêng', evs.length === 0);
  K.learnSkill(p, 'cn1', st);
  check('learn #1: nth=1, earned=3, point_no=1', last().kind === 'learn' && last().id === 'cn1' && last().nth === 1
    && last().earned === 3 && last().point_no === 1 && last().level === 1 && last().cost === 1 && last().points_left === 2
    && last().off_turn === false && last().game_id === st.gameId, json(last()));
  K.learnSkill(p, 'cn2a', st, { offTurn: true });
  check('learn #2 ngoài lượt: nth=2, point_no=2, off_turn', last().nth === 2 && last().point_no === 2 && last().off_turn === true);
  K.learnSkill(p, 'cn3', st);
  K.grantLapPoint(p, 2);
  const r = K.learnSkill(p, 'cnU', st);
  check('learn tối thượng giá 2: nth=4, earned=5, point_no=5', r.ok && last().cost === 2 && last().nth === 4
    && last().earned === 5 && last().point_no === 5, json(last()));
  check('learnCount lưu trên Player và đi theo snapshot', p.learnCount === 4 && Z.snapshot(st).players[0].learnCount === 4);

  p.money = 1000;
  const rs = K.respec(p);
  check('respec: wiped 4 ô, refund 5, fee 250', rs.ok && last().kind === 'respec' && last().wiped.length === 4
    && last().wiped.some((w) => w.id === 'cnU' && w.lv === 1) && last().refund === 5 && last().fee === 250
    && last().points_after === 5, json(last()));
  K.learnSkill(p, 'dh1', st);
  check('học lại sau tẩy: nth tiếp tục (5), earned giữ (5), point_no đếm lại (1)',
    last().nth === 5 && last().earned === 5 && last().point_no === 1, json(last()));

  K.onLap(p);
  check('onLap → lap {laps:1, points:1, points_now}', last().kind === 'lap' && last().laps === 1 && last().points === 1
    && last().points_now === p.skillPoints && last().money === p.money, json(last()));
  K.grantLapPoint(p, 1, 'card');
  check('điểm từ thẻ → points {n:1, src:card}', last().kind === 'points' && last().n === 1 && last().src === 'card');

  K.credit(p, 'dh1', 20);
  check('credit dương → use delta 20, gain 20, counted', last().kind === 'use' && last().id === 'dh1' && last().delta === 20
    && last().gain === 20 && last().counted === true && p.skillUse.dh1.n === 1 && p.skillUse.dh1.gain === 20);
  K.credit(p, 'dh1', 0, { delta: -50 });
  check('credit âm → delta -50, gain 0, n tăng', last().delta === -50 && last().gain === 0 && p.skillUse.dh1.n === 2 && p.skillUse.dh1.gain === 20);
  K.tally(p, 'dh1', -7);
  check('tally → counted=false, n không đổi', last().delta === -7 && last().counted === false && p.skillUse.dh1.n === 2);
  const before = evs.length;
  K.credit(p, 'cn1', 99);
  check('credit skill chưa học: không ghi', evs.length === before);

  K.grantLapPoint(p, 2);
  K.learnSkill(p, 'dd1', st);
  K.learnSkill(p, 'dd2a', st);
  check('dd2a học xong nằm tắt', K.isOff(p, 'dd2a'));
  K.setSkillOn(p, 'dd2a', true);
  check('setSkillOn → toggle on, auto=false', last().kind === 'toggle' && last().id === 'dd2a' && last().on === true && last().auto === false);
  p.cooldowns = { dd2a: 1 };
  K.offSpent(p);
  check('offSpent → toggle off, auto=true', last().kind === 'toggle' && last().id === 'dd2a' && last().on === false && last().auto === true);

  // Xây nhà có Mái Ấm (ac1): credit trong state.js cũng phải phát sự kiện
  const brown = GROUP_TILES[Object.keys(GROUP_TILES)[0]];
  for (const id of brown) st.owner.set(id, q.id);
  q.money = 2000;
  K.grantLapPoint(q, 2);
  K.learnSkill(q, 'acX2', st);
  K.learnSkill(q, 'ac1', st);
  const b = st.build(q.id, brown[0]);
  check('st.build có Mái Ấm → use ac1 với delta = tiền được bớt', b.ok && last().kind === 'use' && last().id === 'ac1'
    && last().seat === q.id && last().delta > 0, json(last()));

  st.bankrupt(q.id);
  check('bankrupt → sự kiện kèm cây kỹ năng lúc vỡ nợ', last().kind === 'bankrupt' && last().seat === q.id
    && last().round === st.round && last().skills.length === 2 && last().skills[1].id === 'ac1' && last().skills[1].lv === 1, json(last()));
  st.bankrupt(q.id);
  check('bankrupt lần hai không ghi thêm', ofKind('bankrupt').length === 1);

  // Ghi bù một lần học đã xảy ra lúc cổng tắt (máy ngồi xem học ngoài lượt rồi mới thành máy cầm lái)
  let open = false;
  telemetry.start({ startedAt: st.startedAt, gate: () => open, ctx: () => ({ game_id: st.gameId }), onPush: (e) => evs.push(e) });
  K.grantLapPoint(p, 1);
  const n0 = evs.length;
  const rl = K.learnSkill(p, 'dh2b', st);
  check('học lúc cổng tắt: không ghi', rl.ok && evs.length === n0);
  open = true;
  K.recordLearn(p, 'dh2b', 1, { offTurn: true, late: true });
  check('recordLearn ghi bù đúng level, nth, point_no, off_turn, late', last().kind === 'learn' && last().id === 'dh2b' && last().level === 1
    && last().nth === p.learnCount && last().point_no === K.spentTotal(p) && last().cost === 1 && last().off_turn === true && last().late === true
    && last().points_left === p.skillPoints, json(last()));
  telemetry.stop();
}

await vite.close();
console.log(`\n${total - fails}/${total} đạt`);
process.exit(fails ? 1 : 0);
