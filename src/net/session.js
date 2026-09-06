/**
 * Điều phối một phiên chơi: chọn chế độ, mở/vào phòng, ngồi phòng chờ,
 * rồi trao ván cho controller.
 *
 * Đây là chỗ duy nhất biết cả hai thế giới — phòng (`net/`) và ván cờ
 * (`game/controller.js`). Controller không tự đi tìm phòng, phòng không biết
 * luật chơi; tệp này ghép hai đầu lại.
 */
import { GameState } from '../core/state.js';
import { snapshot } from '../core/serialize.js';
import { Room, makeRoomCode, roomFromUrl } from './room.js';
import { transportKind } from './transport.js';
import { me } from './identity.js';
import { openModal } from '../ui/modal.js';
import { lobbyModal, kickedModal, fullModal } from '../ui/lobby.js';

const homeUrl = () => `${window.location.origin}${window.location.pathname}`;

/** Đưa mã phòng lên thanh địa chỉ để bấm F5 hay chép URL đều vào lại đúng phòng. */
function showCodeInUrl(code) {
  history.replaceState(null, '', `?room=${code}`);
}

/* ==================================================================
   Các hộp thoại mở màn
   ================================================================== */

function modeModal() {
  const local = transportKind() === 'local';
  return openModal({
    eyebrow: 'CỜ TỶ PHÚ · SÀI GÒN – GIA ĐỊNH',
    title: 'Chơi kiểu nào?',
    dismissible: false,
    peekable: false,
    body: `<div class="mode-pick">
        <p>Chơi <b>trên một máy</b> thì cả bàn ngồi quanh, chuyền máy cho nhau theo lượt.
           Mở <b>phòng online</b> thì mỗi người một máy, ai có đường mời là vào được.</p>
        ${local ? `<p class="lobby-warn">Chưa cắm khoá Supabase — phòng online lúc này
           <b>chỉ nối được các tab trên cùng máy</b> (đủ để chơi thử).
           Xem <code>.env.example</code> để nối nhiều máy thật.</p>` : ''}
      </div>`,
    buttons: [
      { label: 'Mở phòng online', value: 'online', cls: 'btn-primary' },
      { label: 'Chơi trên một máy', value: 'offline', cls: 'btn-ghost' },
    ],
    escValue: 'offline',
  });
}

function errorModal(message) {
  return openModal({
    eyebrow: 'KHÔNG VÀO ĐƯỢC PHÒNG',
    title: 'Có trục trặc',
    sub: message,
    dismissible: false,
    peekable: false,
    buttons: [
      { label: 'Mở phòng mới', value: 'new', cls: 'btn-primary' },
      { label: 'Thử lại', value: 'retry', cls: 'btn-ghost' },
    ],
  });
}

/* ==================================================================
   Phiên chơi
   ================================================================== */

/**
 * @param {import('../game/controller.js').Game} controller
 */
export async function startSession(controller) {
  const urlCode = roomFromUrl();

  // Bấm vào đường mời thì vào thẳng phòng ấy, khỏi hỏi chơi kiểu gì.
  if (!urlCode) {
    const mode = await modeModal();
    if (mode !== 'online') { await controller.start(); return; }
  }

  let code = urlCode ?? makeRoomCode();
  let asHost = !urlCode;

  for (;;) {
    const room = new Room(code, me(), asHost);
    window.__room = room;   // để soi phòng từ devtools và từ bộ kiểm thử

    /* Bắt ảnh chụp ván **trước khi** vào phòng. Người quay lại giữa ván được
       trọng tài gửi trạng thái ngay lúc nhận `hello`; cài người nghe sau khi
       `join()` xong là tin ấy đã bay qua mất. */
    let resumeSnap = null;
    room.on.sync = (m) => { resumeSnap = m.snapshot; };

    try {
      await room.join();
    } catch (err) {
      await room.leave();
      const again = err.full ? await fullModal() : await errorModal(err.message);
      if (again === 'retry') continue;
      code = makeRoomCode();          // mở phòng mới: đổi mã, tự làm chủ phòng
      asHost = true;
      showCodeInUrl(code);
      continue;
    }

    showCodeInUrl(code);

    // Ván đang chạy và mình vẫn còn ghế → vào lại đúng chỗ cũ.
    if (room.phase === 'playing') {
      const snap = resumeSnap ?? await waitFor(() => resumeSnap, 9000);
      if (snap) { enterGame(controller, room, snap); return; }
      await room.leave();
      const again = await errorModal('Ván đang chạy nhưng chưa lấy được trạng thái bàn cờ.');
      if (again === 'retry') continue;
      code = makeRoomCode();
      asHost = true;
      showCodeInUrl(code);
      continue;
    }

    const done = await runRoom(controller, room);
    if (done === 'again') { code = makeRoomCode(); asHost = true; continue; }
    return;
  }
}

/** Chờ tới khi `get()` trả về giá trị thật, hoặc hết giờ. */
function waitFor(get, ms) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const tick = () => {
      const v = get();
      if (v) { resolve(v); return; }
      if (Date.now() - t0 > ms) { resolve(null); return; }
      setTimeout(tick, 150);
    };
    tick();
  });
}

/** Ngồi phòng chờ, rồi (nếu khai cuộc) trao ván cho controller. */
async function runRoom(controller, room) {
  const handle = {};
  let opening = null;

  // Khách nhận lệnh khai cuộc từ chủ phòng → đóng phòng chờ, vào ván.
  room.on.start = (m) => { opening = m; handle.close?.('started'); };

  const res = await lobbyModal(room, handle);

  if (res === 'kicked') {
    await kickedModal();
    window.location.href = homeUrl();
    return 'left';
  }
  if (res === 'closed') {
    await errorModal('Chủ phòng đã rời — phòng này đóng rồi.');
    window.location.href = homeUrl();
    return 'left';
  }
  if (res === 'left') {
    await room.leave();
    window.location.href = homeUrl();
    return 'left';
  }

  // Chủ phòng bấm Khai cuộc: dựng ván đầu rồi phát cho cả phòng.
  if (res === 'start') {
    const seats = room.seats;
    // Luật tuỳ chọn của phòng đi thẳng vào ván, rồi theo ảnh chụp sang mọi máy
    const st = new GameState(
      seats.map((s) => s.name), seats.map((s) => s.token), room.options,
    );
    opening = { snapshot: snapshot(st) };
    room.startGame(opening.snapshot);
  }

  if (!opening) { await room.leave(); return 'left'; }

  enterGame(controller, room, opening.snapshot);
  return 'playing';
}

/**
 * Trao ván cho controller. Từ đây phòng chỉ còn lo chuyện ai còn nối mạng —
 * không còn chủ phòng, không còn ai mời ai ra.
 */
function enterGame(controller, room, snap) {
  room.on.kicked = () => {};
  room.on.closed = () => {};
  controller.startOnline(room, snap);
}
