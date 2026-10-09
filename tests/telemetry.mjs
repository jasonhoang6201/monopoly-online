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

await vite.close();
console.log(`\n${total - fails}/${total} đạt`);
process.exit(fails ? 1 : 0);
