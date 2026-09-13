/**
 * Bàn thử băng chuyền bóc thẻ. Chỉ phục vụ việc xem và chỉnh tham số — không
 * có gì ở đây đi vào game; phần đi vào game nằm trong `caseOpen.js`,
 * `caseSfx.js` và `case.css`.
 */
import { CHANCE, CHEST } from '../src/data/cards.js';
import { EVENTS } from '../src/data/events.js';
import { audio } from '../src/audio/audio.js';
import { fateCase, eventCase, rankOf, RANKS, newSeed } from '../src/ui/caseOpen.js';

const POOLS = { chance: CHANCE, chest: CHEST, event: EVENTS };
const $ = (id) => document.getElementById(id);

const label = (kind, c, i) => {
  const r = RANKS[rankOf(kind, c)].name;
  const head = kind === 'event' ? c.title : (c.text.replace(/\s+/g, ' ').trim().slice(0, 46) + '…');
  return `${String(i).padStart(2, '0')} · [${r}] ${head}`;
};

/** Danh sách thẻ đổi theo bộ bài đang chọn; mục đầu để cho bốc ngẫu nhiên. */
function fillCards() {
  const kind = $('f-kind').value;
  const pool = POOLS[kind];
  $('f-card').innerHTML = '<option value="-1">— bốc ngẫu nhiên —</option>'
    + pool.map((c, i) => `<option value="${i}">${label(kind, c, i)}</option>`).join('');
}

$('f-kind').addEventListener('change', fillCards);
fillCards();

/* Mấy con số hiện ngay cạnh thanh trượt, khỏi phải đoán */
const bind = (input, out, fn = (v) => v) => {
  const el = $(input);
  const sync = () => { $(out).textContent = fn(el.value); };
  el.addEventListener('input', sync);
  sync();
};
bind('f-ms', 'v-ms');
bind('f-accel', 'v-accel', (v) => Number(v).toFixed(2));
bind('f-cruise', 'v-cruise', (v) => Number(v).toFixed(2));
bind('f-jit', 'v-jit', (v) => Number(v).toFixed(2));
bind('f-hold', 'v-hold');
$('f-spin').addEventListener('input', () => {
  const n = Number($('f-spin').value);
  $('v-spin').textContent = n;
  $('v-spin2').textContent = n + 18;
});

let lastSeed = null;

/** @param {?number} forceIndex ép trúng một thẻ cụ thể; null thì bốc */
async function open(forceIndex = null, seed = null) {
  const kind = $('f-kind').value;
  const pool = POOLS[kind];

  let idx = forceIndex ?? Number($('f-card').value);
  if (idx < 0) idx = Math.floor(Math.random() * pool.length);
  const card = pool[idx];

  const typed = $('f-seed').value.trim();
  lastSeed = seed ?? (typed ? (Number(typed) | 0) : newSeed());
  $('go-replay').disabled = false;

  const rank = rankOf(kind, card);
  $('log').textContent = `seed ${lastSeed} · ${kind} #${idx} · hạng ${RANKS[rank].name} · đang chạy…`;

  const opts = {
    seed: lastSeed,
    ms: Number($('f-ms').value),
    accel: Number($('f-accel').value),
    cruiseEnd: Number($('f-cruise').value),
    minSpin: Number($('f-spin').value),
    jitter: Number($('f-jit').value),
    holdMs: Number($('f-hold').value),
    sound: $('f-sound').checked,
    revealSfx: $('f-reveal').value,
  };
  await (kind === 'event'
    ? eventCase(card, opts)
    : fateCase(kind, card, { ...opts, amount: card.amount ?? null }));

  $('log').textContent = `seed ${lastSeed} · ${kind} #${idx} · hạng ${RANKS[rank].name}`
    + ' — chạy lại đúng seed này thì dải xếp y hệt.';
}

// Nghe thử riêng từng tiếng có sẵn của game, khỏi phải bóc cả lượt mới nghe được
$('try-sfx').addEventListener('click', () => {
  audio.init();
  audio.sfx($('f-reveal').value);
});

$('go').addEventListener('click', () => { audio.init(); open(); });
$('go-rare').addEventListener('click', () => {
  audio.init();
  const kind = $('f-kind').value;
  const pool = POOLS[kind];
  const rare = pool.map((c, i) => [c, i]).filter(([c]) => rankOf(kind, c) === 'hiem');
  if (!rare.length) return open();
  open(rare[Math.floor(Math.random() * rare.length)][1]);
});
$('go-replay').addEventListener('click', () => {
  if (lastSeed === null) return;
  audio.init();
  open(Number($('f-card').value) >= 0 ? Number($('f-card').value) : null, lastSeed);
});

// Web Audio chỉ mở được sau một cú bấm — bấm đâu cũng tính
window.addEventListener('pointerdown', () => audio.init(), { once: true });
