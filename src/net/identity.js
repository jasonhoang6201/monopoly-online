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
 */
const ID_KEY = 'monopoly.playerId';
const NAME_KEY = 'monopoly.playerName';

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
