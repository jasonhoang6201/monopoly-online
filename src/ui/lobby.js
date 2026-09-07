/**
 * Phòng chờ: mã phòng, đường mời, danh sách người đã vào, và nút khai cuộc.
 *
 * Tên **không** phát đi theo từng phím gõ. Người chơi gõ trên máy mình, bấm
 * "Sẵn sàng" thì tên mới lên sổ và hiện ra cho cả phòng. Nhờ vậy phòng không
 * phải phát lại sổ ghế mỗi lần ai đó sửa một chữ, và chủ phòng chỉ khai cuộc
 * được khi mọi người đã chốt tên.
 */
import { openModal } from './modal.js';
import { TOKENS, MAX_PLAYERS } from '../core/state.js';
import { money, START_MONEY } from '../data/board.js';
import { inviteLink } from '../net/room.js';
import { transportKind } from '../net/transport.js';
import { myName, setMyName } from '../net/identity.js';
import { EVENT_LEVELS } from '../data/events.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * @param {import('../net/room.js').Room} room
 * @param {{close?:Function}} [handle] nhận lại hàm đóng, để phiên chơi tự đóng
 *   phòng chờ khi chủ phòng khai cuộc
 * @returns {Promise<'start'|'started'|'kicked'|'closed'|'left'>}
 */
export function lobbyModal(room, handle = {}) {
  const local = transportKind() === 'local';
  /** Tên đang gõ — chỉ nằm trên máy này cho tới khi bấm "Sẵn sàng". */
  let draft = myName() || '';

  return openModal({
    eyebrow: `PHÒNG ${esc(room.code)}`,
    title: 'Phòng chờ',
    sub: `Mời bạn bè bằng đường dẫn bên dưới. Từ 2 đến ${MAX_PLAYERS} người,
          mỗi người bắt đầu với ${money(START_MONEY)}.`,
    dismissible: false,   // ra khỏi phòng phải bấm nút, không lỡ tay Esc
    peekable: false,      // ván chưa mở, ngó bàn cờ cũng chẳng thấy gì
    body: '<div id="lobby"></div>',
    onMount: (bodyEl, close, modalEl, foot) => {
      const box = bodyEl.querySelector('#lobby');
      const link = inviteLink(room.code);
      handle.close = close;

      // Modal gỡ thanh nút khi mở ra chưa có nút nào; phòng chờ dựng nút của
      // riêng nó sau mỗi lần vẽ lại, nên gắn thanh ấy trở lại.
      if (!foot.isConnected) modalEl.appendChild(foot);

      /** Vẽ khung ngoài một lần; phần thay đổi theo phòng nằm trong `paint()`. */
      box.innerHTML = `
        <div class="lobby-invite">
          <label for="lobby-link">Đường mời</label>
          <div class="lobby-link-row">
            <input id="lobby-link" type="text" readonly value="${esc(link)}" />
            <button class="btn btn-gold" id="lobby-copy" type="button">Chép</button>
          </div>
          ${local ? `<p class="lobby-warn">Chưa cắm khoá Supabase — đường mời này
            <b>chỉ nối được các tab trên cùng máy</b>. Muốn chơi nhiều máy thì
            điền <code>.env.local</code> theo <code>.env.example</code>.</p>` : ''}
        </div>
        <div class="lobby-count"></div>
        <div class="lobby-seats"></div>
        <div class="lobby-colors"></div>
        <div class="lobby-rule"></div>
        <p class="lobby-foot"></p>`;

      const seatsEl = box.querySelector('.lobby-seats');
      const colorsEl = box.querySelector('.lobby-colors');
      const ruleEl = box.querySelector('.lobby-rule');
      const countEl = box.querySelector('.lobby-count');
      const footNote = box.querySelector('.lobby-foot');

      const copyBtn = box.querySelector('#lobby-copy');
      copyBtn.addEventListener('click', async () => {
        const input = box.querySelector('#lobby-link');
        try {
          await navigator.clipboard.writeText(link);
        } catch {
          // Không có quyền clipboard (http, hoặc trình duyệt chặn) — bôi đen
          // sẵn để người chơi tự Ctrl-C.
          input.select();
        }
        copyBtn.textContent = 'Đã chép ✓';
        setTimeout(() => { copyBtn.textContent = 'Chép'; }, 1400);
      });

      /** Chữ ký của sổ ghế — chỉ vẽ lại khi có gì đó thật sự đổi. */
      let painted = '';

      /** Chữ ký của bảng màu — vẽ riêng để đổi màu không dựng lại ô gõ tên. */
      let paintedColors = '';
      /** Lời nhắc khi bấm trúng màu người khác đang giữ. */
      let colorWarn = '';

      /**
       * Bảng màu quân.
       *
       * Màu đã có người giữ vẫn hiện ra chứ không bị giấu đi — thấy được ai
       * lấy màu nào thì mới biết còn gì mà chọn. Bấm vào thì không đổi, chỉ
       * hiện lời nhắc; ai đã bấm "Sẵn sàng" là chốt màu, muốn đổi phải bấm
       * "Sửa lại" trước.
       */
      const paintColors = () => {
        const mine = room.mySeat;
        const seat = room.seats[mine];
        const sig = JSON.stringify([
          room.seats.map((s) => [s.token, s.ready, s.name]), mine, colorWarn,
        ]);
        if (sig === paintedColors) return;
        paintedColors = sig;
        if (!seat) { colorsEl.innerHTML = ''; return; }

        const locked = !!seat.ready;
        const swatches = TOKENS.map((t, i) => {
          const held = room.tokenSeat(i);
          const isMine = held === mine;
          const other = held >= 0 && !isMine ? room.seats[held] : null;
          const who = other ? (other.ready ? other.name : 'người khác') : '';
          const label = other
            ? `${t.name} — ${who} đang giữ`
            : isMine ? `${t.name} — màu của bạn` : t.name;
          return `
            <button type="button" class="color-swatch
                      ${isMine ? 'on' : ''} ${other ? 'taken' : ''}"
                    style="--sw:${t.css}" data-tk="${i}"
                    aria-label="${esc(label)}" title="${esc(label)}">
              <i class="color-mark">${isMine ? '✓' : other ? '✕' : ''}</i>
            </button>`;
        }).join('');

        const cur = TOKENS[seat.token] ?? TOKENS[0];
        colorsEl.innerHTML = `
          <div class="rule-head">
            <span class="rule-label">MÀU QUÂN</span>
            <i>${esc(cur.name)}</i>
          </div>
          <div class="color-pick ${locked ? 'is-locked' : ''}">${swatches}</div>
          <p class="color-note ${colorWarn ? 'warn' : ''}">${colorWarn || (locked
            ? 'Bạn đã sẵn sàng — bấm <b>Sửa lại</b> nếu muốn đổi màu.'
            : 'Bấm một ô để đổi màu quân của bạn.')}</p>`;

        colorsEl.querySelectorAll('[data-tk]').forEach((b) => {
          b.addEventListener('click', () => {
            const i = Number(b.dataset.tk);
            const held = room.tokenSeat(i);
            if (locked) {
              colorWarn = 'Bạn đã bấm <b>Sẵn sàng</b> nên màu đã chốt. Bấm <b>Sửa lại</b> rồi chọn màu khác.';
            } else if (held >= 0 && held !== mine) {
              const o = room.seats[held];
              colorWarn = o.ready
                ? `<b>${esc(o.name)}</b> đã sẵn sàng với màu <b>${esc(TOKENS[i].name)}</b> — chọn màu khác giùm.`
                : `Màu <b>${esc(TOKENS[i].name)}</b> đang có người giữ — chọn màu khác.`;
            } else {
              colorWarn = '';
              room.setToken(i);
            }
            paintColors();
          });
        });
      };

      const paint = () => {
        const mine = room.mySeat;
        const iAmReady = !!room.seats[mine]?.ready;
        const sig = JSON.stringify([
          room.seats.map((s) => [s.name, s.token, s.ready, s.online]),
          room.hostId, mine, room.options?.events,
        ]);
        // Đang gõ dở mà vẽ lại cả danh sách là mất chữ và mất con trỏ — chỉ vẽ
        // khi sổ ghế thật sự khác lần trước.
        if (sig === painted) return;
        painted = sig;

        /* Vẽ lại là dựng mới ô gõ tên, con trỏ nhảy về đầu. Ghi lại chỗ con trỏ
           trước khi dựng để người đang gõ dở tên mà có ai đó vào phòng hay đổi
           màu thì vẫn gõ tiếp được đúng chỗ. */
        const typing = seatsEl.querySelector('input.lobby-name');
        const caret = typing && document.activeElement === typing ? typing.selectionStart : null;

        const iAmHost = room.hostId === room.me.id;
        const full = room.seats.length >= MAX_PLAYERS;
        const readyCount = room.seats.filter((s) => s.ready).length;

        countEl.className = `lobby-count ${full ? 'is-full' : ''}`;
        countEl.innerHTML = `
          <span>${room.seats.length}/${MAX_PLAYERS} người</span>
          <i>${readyCount}/${room.seats.length} đã sẵn sàng</i>
          ${full ? '<b>Phòng đã đầy</b>' : ''}`;

        seatsEl.innerHTML = room.seats.map((s, i) => {
          const t = TOKENS[s.token] ?? TOKENS[0];
          const isMe = s.id === room.me.id;
          const isHost = s.id === room.hostId;
          const nameCell = isMe && !s.ready
            ? `<input class="lobby-name" type="text" maxlength="14"
                      placeholder="Tên của bạn" value="${esc(draft)}"
                      aria-label="Tên của bạn" />`
            : s.ready
              ? `<span class="lobby-name-fixed">${esc(s.name)}</span>`
              : '<i class="lobby-name-wait">đang nhập tên…</i>';

          return `
            <div class="lobby-seat ${isMe ? 'is-me' : ''} ${s.ready ? 'is-ready' : ''}">
              <span class="dot" style="background:${t.css}"></span>
              ${nameCell}
              <span class="lobby-token">${t.name}</span>
              ${isHost ? '<span class="lobby-tag">CHỦ PHÒNG</span>' : ''}
              ${s.ready ? '<span class="lobby-tag ok">SẴN SÀNG</span>' : ''}
              ${isMe
                ? `<button class="btn ${s.ready ? 'btn-ghost' : 'btn-jade'} lobby-ready"
                           type="button">${s.ready ? 'Sửa lại' : 'Sẵn sàng'}</button>`
                : ''}
              ${iAmHost && !isMe
                ? `<button class="lobby-kick" type="button" data-kick="${esc(s.id)}"
                           title="Mời ${esc(s.ready ? s.name : 'người này')} ra khỏi phòng"
                           aria-label="Mời ra khỏi phòng">✕</button>`
                : ''}
            </div>`;
        }).join('');

        const input = seatsEl.querySelector('input.lobby-name');
        if (input) {
          input.addEventListener('input', () => { draft = input.value; });
          input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') seatsEl.querySelector('.lobby-ready')?.click();
          });
          if (caret !== null) {
            input.focus();
            input.setSelectionRange(caret, caret);
          } else if (!iAmReady) setTimeout(() => input.focus(), 40);
        }

        seatsEl.querySelector('.lobby-ready')?.addEventListener('click', () => {
          if (room.seats[mine]?.ready) { room.setReady(draft, false); return; }
          const clean = setMyName(draft) || setMyName(`Người chơi ${mine + 1}`);
          draft = clean;
          room.setReady(clean, true);
        });

        seatsEl.querySelectorAll('[data-kick]').forEach((b) => {
          b.addEventListener('click', () => room.kick(b.dataset.kick));
        });

        /* Thẻ Thời Cuộc — sự kiện toàn bàn. Chỉ chủ phòng chỉnh được, và chỉ
           chỉnh trong phòng chờ: luật đổi giữa ván thì người đã đầu tư theo
           luật cũ chịu thiệt oan, mà mỗi máy lại chạy một bộ luật khác nhau. */
        const level = room.options?.events ?? 'chuan';
        const cur = EVENT_LEVELS[level] ?? EVENT_LEVELS.chuan;
        ruleEl.innerHTML = `
          <div class="rule-head">
            <span class="rule-label">THẺ THỜI CUỘC</span>
            <i>${esc(cur.short)}</i>
          </div>
          <div class="rule-pick">
            ${Object.values(EVENT_LEVELS).map((lv) => `
              <button type="button" class="rule-btn ${lv.key === level ? 'on' : ''}"
                      data-lv="${lv.key}" ${iAmHost ? '' : 'disabled'}
                      title="${esc(lv.desc)}">${lv.name}</button>`).join('')}
          </div>
          <p class="rule-note">${esc(cur.desc)}</p>`;

        if (iAmHost) {
          ruleEl.querySelectorAll('.rule-btn').forEach((b) => {
            b.addEventListener('click', () => room.setOptions({ events: b.dataset.lv }));
          });
        }

        footNote.innerHTML = iAmHost
          ? `Bạn là chủ phòng: khi <b>mọi người đã sẵn sàng</b> thì nút
             <b>Khai cuộc</b> mở ra. Bấm <b>✕</b> để mời ai đó ra khỏi phòng.`
          : `Chọn màu quân, gõ tên rồi bấm <b>Sẵn sàng</b>. Chủ phòng khai cuộc khi
             cả phòng đã sẵn sàng.`;

        // Thanh nút dưới cùng
        foot.innerHTML = '';
        if (iAmHost) {
          const go = document.createElement('button');
          go.className = 'btn btn-primary';
          go.id = 'lobby-start';
          go.textContent = 'Khai cuộc';
          go.disabled = !room.allReady;
          go.title = room.seats.length < 2
            ? 'Cần ít nhất 2 người chơi'
            : (room.allReady ? 'Bắt đầu ván' : 'Còn người chưa bấm Sẵn sàng');
          go.addEventListener('click', () => close('start'));
          foot.appendChild(go);
        }
        const out = document.createElement('button');
        out.className = 'btn btn-ghost';
        out.textContent = iAmHost ? 'Đóng phòng' : 'Rời phòng';
        out.addEventListener('click', () => close('left'));
        foot.appendChild(out);
      };

      // Sổ ghế đổi (người vào, người ra, ai đó bấm sẵn sàng) → vẽ lại
      room.on.room = () => { paint(); paintColors(); };
      room.on.kicked = () => close('kicked');
      room.on.closed = () => close('closed');
      paint();
      paintColors();
    },
  });
}

/** Báo cho người vừa bị mời ra khỏi phòng. */
export function kickedModal() {
  return openModal({
    eyebrow: 'RỜI PHÒNG',
    title: 'Bạn đã bị mời ra khỏi phòng',
    sub: 'Chủ phòng đã mời bạn ra khỏi phòng chờ.',
    dismissible: false,
    peekable: false,
    buttons: [{ label: 'Về trang chủ', value: 'home', cls: 'btn-primary' }],
  });
}

/** Báo phòng đã đầy cho người bấm vào đường mời muộn. */
export function fullModal() {
  return openModal({
    eyebrow: 'KHÔNG VÀO ĐƯỢC',
    title: 'Phòng đã đầy',
    sub: `Phòng này đã đủ ${MAX_PLAYERS} người, hoặc ván đã bắt đầu.
          Chờ có người rời phòng rồi thử lại, hoặc mở một phòng mới.`,
    dismissible: false,
    peekable: false,
    buttons: [{ label: 'Mở phòng mới', value: 'new', cls: 'btn-primary' },
              { label: 'Thử lại', value: 'retry', cls: 'btn-ghost' }],
  });
}
