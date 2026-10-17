/**
 * Engine chạy thuần Node: chơi trọn ván, và chạy lại từ bản lưu ra đúng ván cũ.
 *
 *   node tests/engine.mjs              → 30 ván toàn bot + 30 ván có người
 *   node tests/engine.mjs --games 200  → nhiều ván hơn
 *
 * Ghế "người" ở đây do bài kiểm thử trả lời: chọn ngẫu nhiên giữa những câu
 * trả lời hợp lệ (mua / bỏ, lắc / kết thúc, xây nhà, giao dịch, đặt cược…),
 * thỉnh thoảng để hết giờ. Mục đích là đi qua càng nhiều nhánh luật càng tốt.
 *
 * Kiểm tra chạy lại: cứ sau mỗi action, dựng engine mới từ `doc` và so ảnh
 * chụp với engine đang chạy. Lệch một con số là lỗi — server ngủ đông rồi
 * thức dậy sẽ ra một ván khác.
 */
import { createServer } from 'vite';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i < 0 ? d : Number(process.argv[i + 1] ?? d); };
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { Engine } = await vite.ssrLoadModule('/src/engine/engine.js');
const { snapshot } = await vite.ssrLoadModule('/src/core/serialize.js');
const { kitCells } = await vite.ssrLoadModule('/src/engine/kit.js');
const { betAmounts } = await vite.ssrLoadModule('/src/engine/skills.js');
const { canLearn } = await vite.ssrLoadModule('/src/core/skills.js');
const { SKILLS } = await vite.ssrLoadModule('/src/data/skills.js');
const { BOARD } = await vite.ssrLoadModule('/src/data/board.js');
await vite.close();

const GAMES = arg('--games', 30);
let fails = 0;
const fail = (msg) => { fails += 1; console.log(`  ✗ ${msg}`); };

/** RNG riêng của bài kiểm thử, để câu trả lời của "người" lặp lại được theo hạt giống. */
function rng(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Câu trả lời ngẫu nhiên mà hợp lệ cho một câu hỏi. */
function answerFor(e, q, R) {
  const st = e.st;
  const p = st.players[q.seat];
  const pick = (a) => a[Math.floor(R() * a.length)];
  switch (q.kind) {
    case 'turn': {
      const opts = [];
      if (p.inJail) {
        opts.push({ do: 'jail-roll' }, { do: 'jail-roll' });
        if (p.money >= 50) opts.push({ do: 'jail-pay' });
        if (st.jailCardAt(p.id) >= 0) opts.push({ do: 'jail-card' });
      } else opts.push(st.rolled ? { do: 'end' } : { do: 'roll' }, st.rolled ? { do: 'end' } : { do: 'roll' });
      const mine = st.propertiesOf(p.id);
      if (mine.length && R() < 0.3) {
        opts.push({ do: 'manage', act: pick(['build', 'build', 'mortgage', 'redeem', 'sell']), id: pick(mine) });
      }
      if (p.skillPoints > 0) {
        const can = SKILLS.filter((s) => canLearn(p, s.id, st).ok);
        if (can.length) opts.push({ do: 'tree', ops: [{ op: 'learn', id: pick(can).id }] });
      }
      if (p.cards.length && R() < 0.3) opts.push({ do: 'card', at: Math.floor(R() * p.cards.length) });
      const cells = kitCells(st, p, st.rolled).filter((c) => c.ok);
      if (cells.length && R() < 0.2) {
        const c = pick(cells);
        const val = c.kind === 'lotto' ? 2 + Math.floor(R() * 11)
          : c.kind === 'stake' ? pick(st.alive().filter((x) => x.id !== p.id).map((x) => x.id))
            : c.kind === 'parity' ? pick(['even', 'odd'])
              : c.kind === 'tile' ? Math.floor(R() * 40) : null;
        opts.push({ do: 'kit', draft: { cells: { [c.id]: { on: R() < 0.8, val } }, act: c.act ? c.id : null } });
      }
      const others = st.alive().filter((x) => x.id !== p.id);
      if (others.length && R() < 0.08) {
        const B = pick(others);
        const theirs = st.propertiesOf(B.id).filter((id) => st.housesOn(id) === 0);
        const ours = mine.filter((id) => st.housesOn(id) === 0);
        opts.push({ do: 'trade', offer: {
          to: B.id,
          give: ours.length && R() < 0.5 ? [pick(ours)] : [],
          get: theirs.length ? [pick(theirs)] : [],
          giveMoney: Math.floor(R() * Math.min(300, p.money)),
          getMoney: 0,
        } });
      }
      if (R() < 0.002) opts.push({ do: 'bankrupt' });
      return pick(opts);
    }
    case 'buy': return R() < 0.75 ? 'buy' : 'skip';
    case 'bet': {
      const a = betAmounts(p).filter((x) => x <= p.money);
      return a.length && R() < 0.6 ? { pick: pick(['even', 'odd']), amount: pick(a) } : null;
    }
    case 'after-roll': return pick([...q.data.ids, 'a', 'b', null]);
    case 'seize': return R() < 0.5;
    case 'express': return R() < 0.5 ? pick(q.data.ids) : null;
    case 'card-pick': return Math.floor(R() * q.data.hand.length);
    case 'trade-review': return R() < 0.5;
    case 'redeem': return R() < 0.5 ? 'all' : null;
    case 'raise': {
      const acts = [];
      for (const id of st.propertiesOf(p.id)) {
        if (st.canSellHouse(p.id, id).ok) acts.push({ act: 'sell', id });
        else if (st.canMortgage(p.id, id).ok) acts.push({ act: 'mortgage', id });
      }
      return R() < 0.1 ? { acts: [], bankrupt: true } : { acts: acts.slice(0, 1 + Math.floor(R() * 4)) };
    }
    case 'ev-brace': return R() < 0.5 ? 'brace' : null;
    case 'ev-fire':
    case 'ev-snow': return R() < 0.5 ? 'save' : null;
    case 'ev-zombie': return R() < 0.5 ? 'pay' : null;
    case 'ev-pick': return q.data.ids.length ? pick(q.data.ids) : null;
    case 'ev-group': return pick(q.data.groups);
    case 'ev-bid': return Math.floor(R() * Math.min(p.money, 2 * (BOARD[q.data.tileId].price ?? 200)));
    case 'fate':
    case 'rolloff':
    default: return true;
  }
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Một ván. `humans` là số ghế do bài kiểm thử trả lời, còn lại là bot.
 * @returns {{turns:number, actions:number, over:boolean}}
 */
function play(seed, humans, { replayEvery = 1, clock = false } = {}) {
  const R = rng(seed * 7919 + 1);
  const n = 2 + (seed % 3);
  const names = Array.from({ length: n }, (_, i) => `P${i}`);
  const kinds = ['easy', 'normal', 'hard'];
  const bots = names.map((_, i) => (i < humans ? null : kinds[(seed + i) % 3]));
  const themes = ['classic', 'halloween', 'christmas'];
  let t = 1000;
  const { engine: e } = Engine.create({
    names, bots, seed, t,
    settings: { events: ['normal', 'high', 'off'][seed % 3], theme: themes[seed % 3], clock },
    gameId: `g${seed}`,
  });
  let actions = 0;
  for (; !e.st.over && actions < 4000; actions++) {
    const w = e.pending;
    if (!w) { fail(`ván ${seed}: engine dừng mà chưa hết ván`); break; }
    t += 500 + Math.floor(R() * 3000);
    let act;
    if (clock && R() < 0.05 && w.deadline) {
      t = Math.max(t, w.deadline);
      act = { type: 'timeout', id: w.id, t };
    } else {
      const q = w.list.find((x) => !w.answered.includes(x.seat));
      act = { type: 'answer', id: w.id, seat: q.seat, value: answerFor(e, q, R), t };
    }
    // Thỉnh thoảng có người học kỹ năng ngoài lượt
    if (R() < 0.03) {
      const p = e.st.players[Math.floor(R() * n)];
      const can = SKILLS.filter((s) => canLearn(p, s.id, e.st).ok);
      if (can.length) e.dispatch({ type: 'learn', seat: p.id, value: { id: can[0].id }, t });
    }
    try {
      e.dispatch(act);
    } catch (err) {
      fail(`ván ${seed}: lỗi ở action ${actions} (${act.type}): ${err.stack}`);
      return { over: false, actions, turns: e.st.turnNo };
    }
    if (replayEvery && actions % replayEvery === 0) {
      const back = Engine.restore(e.doc);
      if (!same(snapshot(back.st), snapshot(e.st))) {
        fail(`ván ${seed}: chạy lại lệch ở action ${actions}`);
        return { over: false, actions, turns: e.st.turnNo };
      }
      if (!same(back.pending, e.pending)) {
        fail(`ván ${seed}: câu hỏi đang treo lệch sau khi chạy lại ở action ${actions}`);
        return { over: false, actions, turns: e.st.turnNo };
      }
    }
    for (const p of e.st.players) {
      if (p.money < 0) { fail(`ván ${seed}: ${p.name} âm tiền ${p.money}`); return { over: false, actions, turns: e.st.turnNo }; }
    }
  }
  return { over: e.st.over, actions, turns: e.st.turnNo };
}

console.log('▸ ván toàn bot');
let done = 0;
let turns = 0;
for (let s = 1; s <= GAMES; s++) {
  const r = play(s, 0);
  if (r.over) done += 1;
  turns += r.turns;
}
console.log(`  ${done}/${GAMES} ván hạ màn, trung bình ${Math.round(turns / GAMES)} lượt`);
if (done < GAMES) fail('có ván toàn bot không hạ màn');

console.log('▸ ván có ghế người, kiểm chạy lại sau mỗi action');
done = 0;
for (let s = 1; s <= GAMES; s++) {
  const r = play(1000 + s, 1 + (s % 2), { replayEvery: 1, clock: s % 2 === 0 });
  if (r.over) done += 1;
}
console.log(`  ${done}/${GAMES} ván hạ màn trong 4000 action`);

console.log(fails ? `\nFAIL ${fails}` : '\n✓ engine ổn');
process.exit(fails ? 1 : 0);
