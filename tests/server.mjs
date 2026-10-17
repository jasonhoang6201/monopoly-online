/**
 * Máy chủ ván cờ (Durable Object), kiểm bằng WebSocket thuần — không cần trình duyệt.
 *
 * Cần `npm run server` đang chạy (wrangler dev, cổng 8787, TEST_TIMING=1).
 *
 *   node --experimental-websocket tests/server.mjs
 *
 * Kiểm: phòng chờ (vào, sẵn sàng, màu, chủ phòng), khai cuộc, chơi vài chục
 * lượt bằng câu trả lời ngẫu nhiên mà mọi máy thấy cùng một ván, không ai nói
 * thay ghế người khác được, rớt mạng rồi vào lại về đúng ghế, hết giờ thì
 * server lắc hộ, vắng quá hạn thì bị gạch tên.
 */
const SERVER = process.env.GAME_SERVER ?? 'ws://localhost:8787';
let fails = 0;
let n = 0;
const ok = (cond, msg) => { n += 1; if (cond) console.log(`  ✓ ${msg}`); else { fails += 1; console.log(`  ✗ ${msg}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const code = () => Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');

/** Một máy khách tối giản: giữ sổ ghế, ảnh chụp, câu hỏi đang treo. */
class Client {
  constructor(room, id, secret = `secret-${id}-xxxx`) {
    this.room = room;
    this.id = id;
    this.secret = secret;
    this.msgs = [];
    this.roomView = null;
    this.snap = null;
    this.pending = null;
    this.events = [];
  }

  open() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${SERVER}/room/${this.room}`);
      this.ws = ws;
      ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', id: this.id, secret: this.secret }));
      ws.onmessage = (e) => {
        const m = JSON.parse(e.data);
        this.msgs.push(m);
        if (m.t === 'welcome') { this.seat = m.seat; resolve(this); }
        if (m.t === 'full' || m.t === 'denied') resolve(this);
        if (m.t === 'room') this.roomView = m;
        if (m.t === 'game' || m.t === 'start') { this.snap = m.snap; this.pending = m.pending; }
        if (m.t === 'start') this.take(m.events ?? []);
        if (m.t === 'events') this.take(m.events);
      };
      ws.onerror = (e) => reject(e);
      ws.onclose = () => { this.closed = true; };
    });
  }

  take(events) {
    for (const ev of events) {
      this.events.push(ev);
      if (ev.type === 'sync') this.snap = ev.snap;
      if (ev.type === 'ask') this.pending = ev;
      if (ev.type === 'answered' && ev.all && this.pending?.id === ev.id) this.pending = null;
    }
  }

  send(m) { this.ws.send(JSON.stringify(m)); }
  act(a) { this.send({ t: 'act', a }); }
  close() { this.ws.close(); }
  get seatIndex() { return this.roomView?.seats.findIndex((s) => s.id === this.id) ?? -1; }
}

async function until(fn, ms = 8000, step = 50) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const v = fn();
    if (v) return v;
    await sleep(step);
  }
  return null;
}

/** Câu trả lời hợp lệ đơn giản nhất cho một câu hỏi. */
function simple(q, snap) {
  const p = snap.players[q.seat];
  switch (q.kind) {
    case 'turn': return p.inJail ? { do: 'jail-roll' } : (snap.rolled ? { do: 'end' } : { do: 'roll' });
    case 'buy': return 'buy';
    case 'ev-bid': return 0;
    case 'ev-pick': return q.data.ids?.[0] ?? null;
    case 'ev-group': return q.data.groups?.[0] ?? null;
    case 'raise': return { acts: [], timeout: true };
    case 'trade-review': return false;
    default: return null;
  }
}

/* ------------------------------------------------------------------ 1 */

console.log('▸ 1. Phòng chờ');
const R = code();
const A = await new Client(R, 'a-1').open();
const B = await new Client(R, 'b-1').open();
await until(() => A.roomView?.seats.length === 2 && B.roomView?.seats.length === 2);
ok(A.roomView.hostId === 'a-1', 'người vào đầu là chủ phòng');
ok(A.roomView.seats[0].token !== A.roomView.seats[1].token, 'hai ghế hai màu khác nhau');

const spoof = await new Client(R, 'a-1', 'sai-khoa-xxxxxxxx').open();
ok(spoof.msgs.some((m) => m.t === 'denied'), 'biết id của người khác mà sai khoá thì không vào được ghế ấy');

B.send({ t: 'kick', id: 'a-1' });
await sleep(300);
ok(A.roomView.seats.length === 2, 'người thường không mời ai ra được');

A.send({ t: 'options', patch: { timing: { turnMs: 2500, awayMs: 2500, skipMs: 1200, tradeMs: 3000, askMs: 3000, raiseMs: 3000, fateMs: 1500 } } });
A.send({ t: 'start' });
await sleep(300);
ok(A.roomView.phase === 'lobby', 'chưa ai sẵn sàng thì chưa khai cuộc được');

A.send({ t: 'ready', name: 'An <b>', ready: true });
B.send({ t: 'ready', name: 'Bình', ready: true });
await until(() => A.roomView.seats.every((s) => s.ready));
ok(A.roomView.seats[0].name === 'An b', 'tên bị bỏ ký tự HTML');
B.send({ t: 'start' });
await sleep(300);
ok(A.roomView.phase === 'lobby', 'chỉ chủ phòng khai cuộc được');
A.send({ t: 'start' });
await until(() => A.snap && B.snap);
ok(!!A.snap && !!B.snap, 'khai cuộc: cả hai máy nhận ảnh chụp ván đầu');

/* ------------------------------------------------------------------ 2 */

console.log('▸ 2. Chơi vài chục câu hỏi, hai máy cùng một ván');
const clients = [A, B];
const bySeat = (seat) => clients.find((c) => c.seatIndex === seat);
let answered = 0;
let refused = 0;
for (let i = 0; i < 120 && !A.snap.over; i++) {
  const w = await until(() => A.pending, 6000);
  if (!w) break;
  const q = w.list.find((x) => !(w.answered ?? []).includes(x.seat));
  const owner = bySeat(q.seat);
  const other = clients.find((c) => c !== owner);
  // Máy kia thử nói thay: server phải bỏ qua
  if (i % 7 === 0) {
    const before = A.events.length;
    other.act({ type: 'answer', id: w.id, seat: q.seat, value: simple(q, A.snap) });
    await sleep(150);
    if (A.pending?.id === w.id && A.events.slice(before).every((e) => e.type !== 'answered' || e.id !== w.id)) refused += 1;
  }
  owner.act({ type: 'answer', id: w.id, seat: q.seat, value: simple(q, owner.snap ?? A.snap) });
  await until(() => A.pending?.id !== w.id, 6000);
  answered += 1;
}
ok(answered >= 30, `trả lời được ${answered} câu hỏi`);
ok(refused >= 3, `máy khác nói thay ghế người khác bị bỏ qua (${refused} lần)`);
await sleep(300);
ok(JSON.stringify(A.snap) === JSON.stringify(B.snap), 'ảnh chụp ở hai máy giống hệt nhau');

/* ------------------------------------------------------------------ 3 */

console.log('▸ 3. Ngồi im hết giờ thì server lắc hộ');
const w0 = await until(() => A.pending, 5000);
const turnNo = A.snap.turnNo;
const rolledBefore = A.events.filter((e) => e.type === 'dice').length;
await until(() => A.events.filter((e) => e.type === 'dice').length > rolledBefore || A.snap.turnNo > turnNo, 9000);
ok(A.events.filter((e) => e.type === 'dice').length > rolledBefore || A.snap.turnNo > turnNo,
  `hết hạn câu hỏi ${w0?.list?.[0]?.kind} thì ván tự đi tiếp`);

/* ------------------------------------------------------------------ 4 */

console.log('▸ 4. Rớt mạng rồi vào lại về đúng ghế');
const seatB = B.seatIndex;
B.close();
await until(() => A.roomView.seats[seatB] && !A.roomView.seats[seatB].online, 4000);
ok(A.roomView.seats[seatB]?.online === false, 'máy kia thấy ghế ấy mất kết nối');
const B2 = await new Client(R, 'b-1').open();
await until(() => B2.snap, 4000);
ok(B2.seat === seatB && !!B2.snap, 'vào lại: đúng ghế cũ, nhận ván đang chơi');
ok(B2.snap && !B2.snap.players[seatB].bankrupt, 'vào lại trong hạn ân: chưa bị gạch tên');
clients[1] = B2;

/* ------------------------------------------------------------------ 5 */

console.log('▸ 5. Vắng quá hạn thì bị gạch tên');
B2.close();
await until(() => A.snap.players[seatB]?.bankrupt || A.snap.over, 12000);
ok(A.snap.players[seatB]?.bankrupt || A.snap.over, 'quá hạn ân: ghế ấy phá sản, tài sản về ngân hàng');

A.close();
spoof.close();
console.log(fails ? `\nFAIL ${fails}/${n}` : `\n✓ ${n} kiểm tra đều đạt`);
process.exit(fails ? 1 : 0);
