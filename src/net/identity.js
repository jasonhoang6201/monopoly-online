/**
 * Danh tính người chơi trên máy này.
 *
 * `id` để trong **sessionStorage** chứ không phải localStorage: mỗi tab là một
 * người chơi riêng. Nhờ vậy mở hai cửa sổ trên cùng một máy là thử được phòng
 * hai người, và bộ kiểm thử đa-tab chạy được. Đổi lại, F5 giữ nguyên id (cùng
 * tab) nên vào lại phòng vẫn đúng ghế cũ.
 *
 * `name` để trong **localStorage** — tên là thứ người chơi muốn giữ lại giữa
 * các ván, không phụ thuộc tab.
 *
 * ── Nhận lại ghế sau khi đóng tab ───────────────────────────────────────────
 * sessionStorage chết theo tab: đóng tab rồi mở lại đường mời là `myId()` sinh
 * một id khác, mà với phòng thì id khác nghĩa là người lạ — ván đang chạy thì
 * người lạ bị trả lời "phòng đã đầy" và không còn đường vào lại.
 *
 * Nên ghi thêm một *phiếu giữ ghế* vào localStorage cho từng phòng: id nào,
 * lúc nào, ván đã khai cuộc chưa. Tab mới vào đúng phòng ấy nhận lại id trong
 * phiếu, với hai điều kiện:
 *
 *   1. **Ván đã khai cuộc.** Còn ở phòng chờ thì mất danh tính chẳng mất gì —
 *      xin lại một ghế trống là xong — mà nhận lại id của người vừa rời phòng
 *      sẽ làm sổ ghế nhấp nháy: chủ phòng vừa xoá ghế ấy xong đã phải thêm lại.
 *   2. **Không tab nào đang cầm id đó**, hỏi qua BroadcastChannel trước khi
 *      lấy. Hai tab cùng máy chơi cùng phòng vì thế vẫn là hai người: tab đang
 *      mở trả lời "tôi đang giữ", tab mới đành sinh id mới.
 */
const ID_KEY = 'monopoly.playerId';
const NAME_KEY = 'monopoly.playerName';
/** localStorage: mã phòng → { id, at, playing } */
const SEAT_KEY = 'monopoly.seats';

/** Phiếu giữ ghế cũ hơn ngần này thì coi như ván đã tàn. */
const SEAT_TTL_MS = 6 * 60 * 60 * 1000;
/** Chờ tab khác lên tiếng "id này của tôi" bấy nhiêu lâu rồi mới dám lấy. */
const PROBE_MS = 400;

/**
 * Kênh hỏi–đáp giữa các tab cùng máy: `{ask:id}` → `{holds:id}`.
 *
 * Mở ở cấp module để **mọi** tab đều nghe, kể cả tab đang ở màn hình chọn chế
 * độ — nếu chỉ mở sau khi vào phòng thì có quãng tab cũ chưa kịp trả lời, tab
 * mới tưởng ghế bỏ không và lấy mất id đang dùng.
 */
const idChannel = typeof BroadcastChannel === 'function'
  ? new BroadcastChannel('monopoly-id') : null;

idChannel?.addEventListener('message', (e) => {
  const ask = e.data?.ask;
  // Đọc thẳng sessionStorage chứ không gọi `myId()`: tab chưa có danh tính thì
  // đừng sinh ra một cái chỉ để trả lời câu hỏi của tab khác.
  if (ask && sessionStorage.getItem(ID_KEY) === ask) idChannel.postMessage({ holds: ask });
});

function randomId() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function myId() {
  let id = sessionStorage.getItem(ID_KEY);
  if (!id) {
    id = randomId();
    sessionStorage.setItem(ID_KEY, id);
  }
  return id;
}

export function myName() {
  return localStorage.getItem(NAME_KEY) || '';
}

export function setMyName(name) {
  const clean = String(name ?? '').trim().slice(0, 14);
  if (clean) localStorage.setItem(NAME_KEY, clean);
  return clean;
}

/** Danh tính gọn để gửi lên phòng. */
export function me() {
  return { id: myId(), name: myName() || 'Khách' };
}

/* ================================================================ giữ ghế */

/** Toàn bộ phiếu còn hạn, mã phòng → phiếu. */
function readSeats() {
  try {
    const raw = JSON.parse(localStorage.getItem(SEAT_KEY) || '{}');
    const cut = Date.now() - SEAT_TTL_MS;
    const out = {};
    for (const [code, v] of Object.entries(raw)) {
      if (v?.id && (v.at ?? 0) > cut) out[code] = v;
    }
    return out;
  } catch { return {}; }
}

/**
 * Ghi phiếu: tab này đang giữ ghế trong phòng `code`.
 * @param {string} code
 * @param {boolean} playing ván đã khai cuộc chưa — chỉ ván đang chạy mới đáng
 *   nhận lại id cũ, xem đầu tệp.
 */
export function holdSeat(code, playing = false) {
  try {
    const all = readSeats();
    all[code] = { id: myId(), at: Date.now(), playing };
    localStorage.setItem(SEAT_KEY, JSON.stringify(all));
  } catch { /* trình duyệt chặn localStorage — mất đường vào lại, không hỏng ván */ }
}

/** Rời phòng hẳn (bị mời ra, phòng đóng, tự thoát) → xoá phiếu của phòng ấy. */
export function dropSeat(code) {
  try {
    const all = readSeats();
    delete all[code];
    localStorage.setItem(SEAT_KEY, JSON.stringify(all));
  } catch { /* không sao */ }
}

/**
 * Ván dở dang gần nhất, để màn hình chọn chế độ mời quay lại.
 * Chỉ tính ván đã khai cuộc: phòng chờ bỏ dở thì mở phòng mới còn nhanh hơn.
 * @returns {{code:string,id:string,at:number}|null}
 */
export function lastSeat() {
  const rows = Object.entries(readSeats())
    .filter(([, v]) => v.playing)
    .sort((a, b) => b[1].at - a[1].at);
  return rows.length ? { code: rows[0][0], ...rows[0][1] } : null;
}

/** Có tab nào cùng máy đang cầm id này không. */
function idInUse(id) {
  if (!idChannel) return Promise.resolve(false);
  return new Promise((resolve) => {
    const onMsg = (e) => { if (e.data?.holds === id) done(true); };
    const timer = setTimeout(() => done(false), PROBE_MS);
    const done = (v) => {
      clearTimeout(timer);
      idChannel.removeEventListener('message', onMsg);
      resolve(v);
    };
    idChannel.addEventListener('message', onMsg);
    idChannel.postMessage({ ask: id });
  });
}

/**
 * Nhận lại danh tính cũ của phòng `code` cho tab vừa mở.
 *
 * Phải gọi **trước** lần `me()` đầu tiên: `myId()` mà chạy trước thì tab đã có
 * id mới, và người cũ coi như mất ghế.
 *
 * @returns {Promise<boolean>} có nhận lại được không
 */
export async function reclaimSeat(code) {
  if (sessionStorage.getItem(ID_KEY)) return false;   // tab này đã có danh tính
  const claim = readSeats()[code];
  if (!claim?.playing) return false;                  // xem điều kiện 1 ở đầu tệp
  if (await idInUse(claim.id)) return false;          // tab khác đang ngồi ghế ấy
  sessionStorage.setItem(ID_KEY, claim.id);
  return true;
}
