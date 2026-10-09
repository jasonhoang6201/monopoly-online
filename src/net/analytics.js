/**
 * Số liệu cân bằng kỹ năng — phần gom và gửi về Supabase.
 *
 * Luật (core/skills.js, core/state.js) chỉ đổ sự kiện vào core/telemetry.js;
 * lớp này nhận từng sự kiện qua `push`, cuối mỗi lượt gom thành batch, cất
 * vào hàng đợi trong localStorage rồi gửi bằng REST (`/rest/v1/<bảng>`) với
 * anon key. Không dùng supabase-js để ghi: lúc rời trang cần `fetch` với
 * `keepalive`, mà supabase-js không có; một đường gửi cho cả hai trường hợp
 * thì ít chỗ hỏng hơn.
 *
 * Cổng chặn (`enabled`, tính một lần lúc tạo):
 *   - thiếu khoá Supabase → không có chỗ gửi;
 *   - `navigator.webdriver` → Chrome do Playwright cầm, là ván bot của bộ kiểm thử;
 *   - localhost / 127.0.0.1 → ván thử trên máy dev;
 *   - `?telemetry=0` tắt hẳn; `?telemetry=1` ép bật (kiểm tay trên dev server).
 * Chạy bất cứ hàm nào lúc đang tắt đều là không làm gì — nơi gọi khỏi hỏi.
 *
 * Chống trùng: mỗi lần nạp trang một `clientId` ngẫu nhiên (không dùng
 * sessionStorage — F5 giữa ván giữ sessionStorage nhưng `seq` về 0, khoá
 * `(game_id, client_id, seq)` sẽ đụng dòng cũ). Batch đã thử gửi là bất biến,
 * Postgres chèn nguyên tử nên bị 409 nghĩa là cả batch đã nằm trong DB → bỏ.
 */
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase.js';
import { transportKind } from './transport.js';
import { finalRanking } from '../core/state.js';
import { spentTotal, levelOf, isOff } from '../core/skills.js';

const QUEUE_KEY = 'monopoly.analytics.q';
/** Trần của một batch sự kiện và của cả hàng đợi — quá là bỏ phần cũ nhất. */
const BATCH_ROWS = 200;
const QUEUE_MAX_BATCHES = 300;
const QUEUE_MAX_BYTES = 400_000;
/** `fetch` với `keepalive` chỉ nhận thân chừng 64 KB; chừa biên cho header. */
const KEEPALIVE_BYTES = 60_000;
const RETRY_MS = 20_000;

const hex16 = () => Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

export class Analytics {
  /**
   * @param {?object} game controller (để hỏi `isDriver`, trạng thái) — `null` trong test
   * @param {object} [o] tiêm môi trường cho test Node
   */
  constructor(game, o = {}) {
    this.game = game;
    this.url = o.url ?? SUPABASE_URL ?? '';
    this.key = o.key ?? SUPABASE_ANON_KEY ?? '';
    this.fetch = o.fetch ?? globalThis.fetch?.bind(globalThis);
    this.storage = o.storage ?? safeStorage();
    this.now = o.now ?? Date.now;
    const loc = o.location ?? globalThis.location ?? { hostname: '', search: '' };
    const nav = o.navigator ?? globalThis.navigator ?? {};
    this.enabled = decide({ url: this.url, key: this.key, loc, nav });
    this.clientId = hex16();
    /** Sự kiện chưa gom thành batch. */
    this.buffer = [];
    /** Batch đang chờ gửi: `{id, table, rows}` — bản trong bộ nhớ của localStorage. */
    this.queue = this.enabled ? loadQueue(this.storage) : [];
    this.sending = null;
    /** Chế độ của ván đang chạy, ghi ở `gameStart`; máy vào phòng giữa chừng thì hỏi controller. */
    this.mode = null;
    if (this.enabled) this.hookPage();
  }

  /** Nhận một sự kiện từ core/telemetry.js (đã qua cổng cầm lái). */
  push(ev) {
    if (!this.enabled) return;
    this.buffer.push(ev);
  }

  /** Gom buffer thành batch, cất vào hàng đợi rồi gửi. Không ném lỗi, không chờ mạng lâu. */
  flush() {
    if (!this.enabled) return Promise.resolve();
    const evs = this.buffer;
    this.buffer = [];
    for (let i = 0; i < evs.length; i += BATCH_ROWS) {
      this.enqueue('skill_events', evs.slice(i, i + BATCH_ROWS).map((ev) => eventRow(ev, this.clientId)));
    }
    return this.sendQueue();
  }

  /**
   * Gửi gấp — trước khi rời trang. `keepalive` để trình duyệt giữ request
   * sau khi trang đóng; nhưng thân chỉ được chừng 64 KB nên batch to phải
   * **tách hẳn trong hàng đợi** rồi mới gửi: batch đã cất là bất biến, lần
   * mở sau gửi lại đúng batch ấy, bị 409 là biết nó đã vào DB.
   */
  async flushNow({ keepalive = false, timeoutMs = 1500 } = {}) {
    if (!this.enabled) return;
    const evs = this.buffer;
    this.buffer = [];
    for (let i = 0; i < evs.length; i += BATCH_ROWS) {
      this.enqueue('skill_events', evs.slice(i, i + BATCH_ROWS).map((ev) => eventRow(ev, this.clientId)));
    }
    if (keepalive) this.splitForKeepalive();
    await Promise.race([this.sendQueue({ keepalive }), new Promise((r) => setTimeout(r, timeoutMs))]);
  }

  /** Ván vừa dựng: một dòng `games` giai đoạn 'start' — ván bỏ dở vẫn để lại dấu. */
  gameStart(st, mode) {
    if (!this.enabled) return;
    /* Ghi nhớ cho dòng 'end': máy hạ màn có thể không phải máy dựng ván, nhưng
       chế độ (online / một máy) là của cả ván. */
    this.mode = mode;
    this.enqueue('games', [gameRow(st, 'start', mode, this.clientId)]);
    this.sendQueue();
  }

  /**
   * Ván hạ màn (máy cầm lái gọi từ `checkGameOver`): dòng `games` giai đoạn
   * 'end' và một dòng `game_players` cho mỗi ghế, rồi gửi ngay.
   * @param {{player:object, by:string}} win kết quả `GameState.winCheck`
   */
  gameEnd(st, win) {
    if (!this.enabled) return;
    this.enqueue('games', [gameRow(st, 'end', this.mode ?? this.modeOf(), this.clientId, win)]);
    const rank = finalRanking(st, win.player);
    this.enqueue('game_players', st.players.map((p) => playerRow(st, p, rank.indexOf(p) + 1, p === win.player)));
    return this.flush();
  }

  /** Bản online hay một máy — hỏi controller; test không có controller thì 'offline'. */
  modeOf() {
    if (!this.game?.net) return 'offline';
    return transportKind() === 'supabase' ? 'online' : 'local';
  }

  enqueue(table, rows) {
    if (!rows.length) return;
    this.queue.push({ id: hex16(), table, rows });
    this.trimQueue();
    saveQueue(this.storage, this.queue);
  }

  /** Quá trần thì bỏ batch cũ nhất: số liệu cũ không đáng để treo localStorage. */
  trimQueue() {
    while (this.queue.length > QUEUE_MAX_BATCHES) this.queue.shift();
    while (this.queue.length > 1 && JSON.stringify(this.queue).length > QUEUE_MAX_BYTES) this.queue.shift();
  }

  splitForKeepalive() {
    const out = [];
    for (const b of this.queue) {
      let rows = b.rows;
      let first = true;
      while (rows.length) {
        let n = rows.length;
        while (n > 1 && JSON.stringify(rows.slice(0, n)).length > KEEPALIVE_BYTES) n = Math.ceil(n / 2);
        out.push(first ? { ...b, rows: rows.slice(0, n) } : { id: hex16(), table: b.table, rows: rows.slice(0, n) });
        rows = rows.slice(n);
        first = false;
      }
    }
    this.queue = out;
    saveQueue(this.storage, this.queue);
  }

  /**
   * Gửi tuần tự từ đầu hàng đợi. Một lượt gửi đang chạy thì lượt gọi sau chờ
   * chung — không hai request cùng batch.
   *   2xx → bỏ batch; 409 → đã nằm trong DB, bỏ; 4xx khác → dữ liệu hỏng, bỏ
   *   và báo console; lỗi mạng / 5xx → giữ lại, dừng, lần sau gửi tiếp.
   */
  sendQueue(o = {}) {
    if (!this.enabled || !this.queue.length) return Promise.resolve();
    if (this.sending) return this.sending;
    /* Gán qua biến cục bộ rồi mới xoá: hàm async chạy đồng bộ tới `await`
       đầu tiên, nên `finally` có thể chạy **trước** phép gán vào `this.sending`
       và để lại một promise đã xong ở đó — từ đấy không gửi gì nữa. */
    const run = (async () => {
      while (this.queue.length) {
        const b = this.queue[0];
        const ok = await this.post(b, o);
        if (!ok) break;
        this.queue.shift();
        saveQueue(this.storage, this.queue);
      }
    })();
    this.sending = run;
    run.finally(() => { if (this.sending === run) this.sending = null; });
    return run;
  }

  /** @returns {Promise<boolean>} true là batch đã xong (vào DB hoặc bị bỏ), false là phải thử lại */
  async post(b, { keepalive = false } = {}) {
    if (!this.fetch) return false;
    let res;
    try {
      res = await this.fetch(`${this.url}/rest/v1/${b.table}`, {
        method: 'POST',
        keepalive,
        headers: {
          apikey: this.key,
          Authorization: `Bearer ${this.key}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(b.rows),
      });
    } catch { return false; }
    if (res.ok || res.status === 409) return true;
    if (res.status >= 400 && res.status < 500) {
      console.warn(`[analytics] ${b.table} bị từ chối ${res.status}, bỏ batch`, await res.text?.().catch(() => ''));
      return true;
    }
    return false;
  }

  /** Gửi lại theo nhịp và khi có mạng trở lại; rời trang thì đẩy nốt bằng keepalive. */
  hookPage() {
    const w = globalThis.window;
    if (!w?.addEventListener) return;
    w.addEventListener('online', () => this.sendQueue());
    w.addEventListener('pagehide', () => { this.flushNow({ keepalive: true, timeoutMs: 0 }); });
    setInterval(() => { if (this.queue.length) this.sendQueue(); }, RETRY_MS);
  }
}

/* ------------------------------------------------------------------ dòng */

/** Sự kiện của core/telemetry.js → dòng `skill_events`: vài cột tách riêng, phần còn lại vào `payload`. */
function eventRow(ev, clientId) {
  const { seq, t, kind, game_id, seat, id, delta, turn_no, round, ...payload } = ev;
  return {
    game_id, client_id: clientId, seq, t_ms: Math.round(t), kind,
    seat: seat ?? null, skill_id: id ?? null, delta: delta == null ? null : Math.round(delta),
    turn_no: turn_no ?? null, round: round ?? null, payload,
  };
}

const iso = (ms) => (ms == null ? null : new Date(ms).toISOString());

function gameRow(st, phase, mode, clientId, win = null) {
  return {
    game_id: st.gameId, phase, client_id: clientId, mode,
    players: st.players.length,
    theme: st.settings?.theme ?? null,
    events_level: st.settings?.events ?? null,
    app_version: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : null,
    started_at: iso(st.startedAt),
    ended_at: iso(st.endedAt),
    win_by: win?.by ?? null,
    winner_seat: win ? win.player.id : null,
    turns: st.turnNo ?? null, rounds: st.round ?? null, laps: st.laps ?? null, events_fired: st.eventsFired ?? null,
  };
}

function playerRow(st, p, rank, won) {
  const spent = spentTotal(p);
  return {
    game_id: st.gameId, seat: p.id, token: p.token?.key ?? null,
    rank, won, bankrupt: !!p.bankrupt, out_rank: p.outRank || null, out_round: p.outRound ?? null,
    money_end: p.money, net_worth_end: st.netWorth(p.id),
    laps: p.laps ?? 0, jails: p.jails ?? 0, turns_taken: null,
    points_left: p.skillPoints, points_spent: spent, points_earned: spent + p.skillPoints,
    skills: p.skills.map((id) => ({ id, lv: levelOf(p, id), off: isOff(p, id) })),
    skill_use: p.skillUse ?? {},
  };
}

/* ------------------------------------------------------------- hàng đợi */

function loadQueue(storage) {
  try {
    const q = JSON.parse(storage.getItem(QUEUE_KEY) || '[]');
    return Array.isArray(q) ? q.filter((b) => b && b.table && Array.isArray(b.rows)) : [];
  } catch { return []; }
}

function saveQueue(storage, queue) {
  try {
    if (queue.length) storage.setItem(QUEUE_KEY, JSON.stringify(queue));
    else storage.removeItem(QUEUE_KEY);
  } catch { /* đầy hoặc bị chặn: hàng đợi vẫn còn trong bộ nhớ */ }
}

/** Cổng chặn — xem đầu file. `?telemetry=1` thắng mọi lý do tắt khác trừ thiếu khoá. */
function decide({ url, key, loc, nav }) {
  if (!url || !key) return false;
  const q = new URLSearchParams(loc.search ?? '').get('telemetry');
  if (q === '1') return true;
  if (q === '0') return false;
  if (nav.webdriver) return false;
  if (loc.hostname === 'localhost' || loc.hostname === '127.0.0.1') return false;
  return true;
}

/** localStorage có thể bị chặn (chế độ riêng tư) — thiếu thì hàng đợi chỉ nằm trong bộ nhớ. */
function safeStorage() {
  try {
    const s = globalThis.localStorage;
    if (s) { s.getItem(QUEUE_KEY); return s; }
  } catch { /* bị chặn */ }
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
}
