/**
 * Phòng chơi: ai đang ngồi ghế nào, ai là chủ phòng, và ván đã mở chưa.
 *
 * ── Ai quyết định cái gì ────────────────────────────────────────────────────
 * **Trong phòng chờ, chủ phòng giữ sổ ghế.** Chỉ máy chủ phòng thêm ghế, bỏ
 * ghế, ghi tên và mời ra khỏi phòng; xong việc thì phát lại toàn bộ sổ (`room`)
 * cho mọi người. Máy khác không tự sửa sổ bao giờ, chỉ vẽ lại theo sổ nhận
 * được. Cần một nguồn sự thật duy nhất vì `player.id` **chính là số thứ tự
 * ghế**: hai người bấm đường mời cùng lúc mà mỗi máy chốt một danh sách thì từ
 * đó mọi ảnh chụp ván đều gán đất nhầm chủ.
 *
 * **Vào ván rồi thì chủ phòng hết vai.** Sổ ghế đóng lại, không ai thêm bớt
 * nữa; lượt chơi không đi qua ai cả — máy nào tới lượt thì chạy luật rồi phát
 * ảnh chụp (`sync`). Chủ phòng thoát giữa ván cũng không sao.
 *
 * Còn đúng hai việc không thuộc lượt của ai: bỏ qua lượt của người vừa rớt
 * mạng, và tịch thu tài sản của người đi quá lâu. Hai việc ấy giao cho
 * **trọng tài — ghế còn nối mạng có số nhỏ nhất**. Đó là một *luật*, không
 * phải một *chức vụ*: mọi máy có cùng sổ ghế nên cùng tính ra một người, không
 * cần bầu bán, trọng tài rớt thì ghế kế tiếp tự lên thay.
 *
 * ── Thông điệp ──────────────────────────────────────────────────────────────
 *   hello   khách → chủ    tôi vừa vào, xin một ghế
 *   ready   khách → chủ    tôi đã gõ xong tên và bấm sẵn sàng
 *   pick    khách → chủ    tôi đổi sang màu quân này
 *   room    chủ → tất cả   sổ ghế mới nhất
 *   full    chủ → một người  phòng đã đầy, không còn ghế
 *   kick    chủ → tất cả   mời một người ra
 *   start   chủ → tất cả   khai cuộc, kèm ảnh chụp ván đầu
 *   sync    người tới lượt → tất cả   ảnh chụp trạng thái sau một nước
 *   ev      người tới lượt → tất cả   việc cần diễn hoạt (xí ngầu, đi quân)
 *   bc      người tới lượt → tất cả   dòng thông báo giữa bàn
 *   ask/reply  giữa hai người   hỏi–đáp có chờ trả lời (dùng cho giao dịch)
 */
import { MAX_PLAYERS, TOKENS } from '../core/state.js';
import { DEFAULT_EVENT_LEVEL } from '../data/events.js';
import { makeTransport } from './transport.js';

/** Mã phòng 4 ký tự, bỏ các chữ dễ đọc nhầm (I, O, 0, 1). */
export function makeRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
}

/** Đường mời — dán vào chat là người kia bấm vào vào thẳng phòng. */
export function inviteLink(code) {
  const u = new URL(window.location.href);
  u.search = `?room=${code}`;
  u.hash = '';
  return u.toString();
}

/** Mã phòng nằm trong địa chỉ hiện tại, nếu có. */
export function roomFromUrl() {
  const v = new URLSearchParams(window.location.search).get('room');
  return v ? v.toUpperCase().slice(0, 8) : null;
}

/** Chờ tối đa bấy nhiêu mili giây để chủ phòng trả lời `hello`. */
const JOIN_TIMEOUT_MS = 6000;

/**
 * Vắng mặt bao lâu thì mới coi là đã rời phòng.
 *
 * Danh sách có mặt (presence) đi một đường, thông điệp đi một đường, và
 * presence thường về chậm hơn. Không có khoảng ân hạn này thì người vừa xin
 * ghế xong đã bị gạch tên ngay nhịp presence kế tiếp, chỉ vì tin "tôi có mặt"
 * chưa kịp tới.
 */
const GRACE_MS = 3000;

/**
 * Nhận `hello` của một người thì coi họ là có mặt trong bấy nhiêu lâu, chờ tin
 * presence của họ tới xác nhận.
 *
 * `hello` đi đường broadcast, `track` đi đường presence — hai đường khác nhau
 * nên `hello` thường tới trước. Ân hạn này **phải tự hết hạn**: nếu người ấy
 * đóng tab trước khi `track` kịp đăng ký trên máy chủ thì máy chủ chưa từng
 * thấy họ có mặt, nên sẽ không phát tin presence nào nữa — không có tin nào
 * tới để sửa lại thì ghế phải tự trở về trạng thái vắng mặt.
 */
const HELLO_GRACE_MS = 6000;

export class Room {
  /**
   * @param {string} code
   * @param {{id:string,name:string}} me
   * @param {boolean} asHost máy này có mở phòng không
   */
  constructor(code, me, asHost) {
    this.code = code;
    this.me = me;
    /** Chủ phòng — chỉ có nghĩa trong phòng chờ. Vào ván rồi thì vai này hết việc. */
    this.isHost = asHost;
    this.tp = makeTransport(code, me);

    /** Sổ ghế — chỉ chủ phòng được sửa. @type {Array<{id,name,token,online,kicked,ready}>} */
    this.seats = asHost
      ? [{ id: me.id, name: 'Người chơi 1', token: 0, online: true, kicked: false, ready: false }]
      : [];
    this.hostId = asHost ? me.id : null;
    this.phase = 'lobby';
    /**
     * Luật tuỳ chọn của ván sắp mở — chủ phòng chốt, cả phòng cùng thấy.
     *
     * Đi kèm sổ ghế chứ không gửi riêng: người vào phòng muộn phải biết ngay
     * ván này chơi luật gì, mà sổ ghế thì lúc nào cũng được phát lại cho họ.
     */
    this.options = { events: DEFAULT_EVENT_LEVEL };

    this.on = {
      room: () => {}, kicked: () => {}, full: () => {}, closed: () => {},
      start: () => {}, sync: () => {}, ev: () => {}, bc: () => {}, ask: null,
      link: () => {},
    };

    /** Hỏi–đáp đang chờ trả lời: rid → resolve */
    this.pending = new Map();
    this.rid = 0;
    this.left = false;

    /**
     * Tập người đang có mặt, lấy nguyên từ tin presence gần nhất.
     *
     * Đây mới là chuẩn để biết ai còn ai mất — không dùng dấu thời gian của
     * tin presence, vì presence chỉ phát **khi danh sách đổi**. Ngồi yên một
     * phút thì không có tin nào cả, mà như thế không có nghĩa là mọi người đã
     * rời phòng.
     */
    this.livePeers = new Set([me.id]);
    /** id → lúc mình biết tới người này, chỉ dùng cho khoảng ân hạn lúc mới vào. */
    this.firstSeen = new Map([[me.id, Date.now()]]);
    /** id → lúc vắng mặt, để đếm giờ ân hạn trước khi tịch thu tài sản. */
    this.awaySince = new Map();
    /**
     * id → lúc nhận `hello` gần nhất của người ấy.
     *
     * Chỉ dùng để bắc cầu qua quãng chờ presence. **Không** ghi thẳng vào
     * `livePeers` — `livePeers` phải là bản sao nguyên vẹn của tin presence
     * gần nhất, ghi tay vào đó là tạo ra bóng ma không bao giờ dọn được.
     */
    this.helloAt = new Map();
    /** Đã từng thấy chủ phòng chưa — chưa thấy thì đừng vội kêu phòng đóng. */
    this.sawHost = asHost;
    /** Controller gắn vào: dựng ảnh chụp ván cho người xin vào lại. */
    this.onNeedSync = null;
    /** Đường truyền của máy này có đang đứt không — xem `#onLink`. */
    this.linkLost = false;
  }

  // ------------------------------------------------------------------ tra cứu

  get mySeat() { return this.seats.findIndex((s) => s.id === this.me.id); }
  get isFull() { return this.seats.length >= MAX_PLAYERS; }
  seatOf(id) { return this.seats.findIndex((s) => s.id === id); }

  /**
   * Ghế đang giữ màu quân này, hoặc -1 nếu màu còn trống.
   *
   * Mọi máy cùng một sổ ghế nên cùng tính ra một đáp án — nhờ vậy người bấm
   * trúng màu của người khác được báo ngay trên máy mình, không phải gửi đi
   * rồi chờ chủ phòng trả lời mới biết là hỏng.
   */
  tokenSeat(index) { return this.seats.findIndex((s) => s.token === index); }

  /** Ghế này còn người ngồi và còn nối mạng không. */
  isSeatLive(i) {
    const s = this.seats[i];
    return !!s && s.online && !s.kicked;
  }

  /**
   * **Trọng tài**: ghế còn nối mạng có số nhỏ nhất.
   *
   * Vào ván rồi thì không còn chức chủ phòng nữa, nhưng vẫn có vài việc không
   * thuộc lượt của ai — bỏ qua lượt của người vừa rớt, tịch thu tài sản của
   * người đi luôn, trả lời người xin vào lại. Phải đúng một máy làm, nếu không
   * hai máy cùng làm là ra hai kết quả.
   *
   * Chọn bằng **luật, không phải bầu**: mọi máy đều có cùng sổ ghế nên cùng
   * tính ra một đáp án, không cần hỏi ý ai. Trọng tài rớt mạng thì ghế kế tiếp
   * tự lên thay, cũng không cần bàn bạc.
   */
  get arbiterSeat() {
    return this.seats.findIndex((s, i) => this.isSeatLive(i));
  }

  get isArbiter() {
    const seat = this.arbiterSeat;
    return seat >= 0 && seat === this.mySeat;
  }

  /**
   * Người này có đang ở trong phòng không.
   *
   * Nguồn sự thật là `livePeers`; `helloAt` chỉ bắc cầu qua quãng `hello` đã
   * tới mà presence chưa, và tự hết hạn sau `HELLO_GRACE_MS`.
   */
  isLive(id) {
    if (this.livePeers.has(id)) return true;
    const t = this.helloAt.get(id);
    return t !== undefined && Date.now() - t < HELLO_GRACE_MS;
  }

  /** Ghế này đã vắng mặt bao lâu (ms). 0 nghĩa là đang có mặt. */
  awayFor(i) {
    const s = this.seats[i];
    if (!s || this.isLive(s.id)) return 0;
    return Date.now() - (this.awaySince.get(s.id) ?? Date.now());
  }

  // -------------------------------------------------------------------- vào

  async join() {
    const tp = this.tp;

    tp.on('hello', (m) => this.#onHello(m));
    tp.on('ready', (m) => this.#onReady(m));
    tp.on('pick', (m) => this.#onPick(m));
    tp.on('room', (m) => this.#applyRoom(m));
    tp.on('full', (m) => {
      if (m.to !== this.me.id) return;
      // Đang chờ ghế thì đây là câu trả lời dứt khoát — hỏng luôn lời hứa
      // `join()`, đừng để nó chờ hết giờ rồi báo sai là "không tìm thấy phòng".
      this.onceFull?.();
      this.on.full();
    });
    tp.on('kick', (m) => this.#onKick(m));
    tp.on('start', (m) => { this.phase = 'playing'; this.on.start(m); });
    tp.on('sync', (m) => this.on.sync(m));
    tp.on('ev', (m) => this.on.ev(m));
    tp.on('bc', (m) => this.on.bc(m));
    tp.on('ask', (m) => this.#onAsk(m));
    tp.on('reply', (m) => {
      const done = this.pending.get(m.rid);
      if (done) { this.pending.delete(m.rid); done(m.value); }
    });

    tp.onPresence((peers) => this.#onPresence(peers));
    tp.onStatus((st) => this.#onLink(st));

    await tp.join();
    await tp.track({ id: this.me.id, name: this.me.name, host: this.isHost });
    this.reaper = setInterval(() => this.#reap(), 1000);

    if (this.isHost) { this.#publishRoom(); return; }

    // Khách: xin ghế rồi chờ chủ phòng ghi sổ. Không ai trả lời nghĩa là mã
    // phòng sai, hoặc chủ phòng đã đóng máy.
    await new Promise((resolve, reject) => {
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        reject(new Error('Không tìm thấy phòng — kiểm tra lại mã, hoặc chủ phòng đã rời.'));
      }, JOIN_TIMEOUT_MS);

      const settle = (fn) => (...a) => {
        if (!done) { done = true; clearTimeout(timer); fn(...a); }
      };
      this.onceSeated = settle(resolve);
      this.onceFull = settle(() => reject(Object.assign(new Error('Phòng đã đầy.'), { full: true })));

      this.tp.send('hello', { id: this.me.id, name: this.me.name });
      // Chủ phòng có thể vừa bận; hỏi thêm vài nhịp cho chắc
      this.helloTimer = setInterval(
        () => this.tp.send('hello', { id: this.me.id, name: this.me.name }), 900,
      );
    }).finally(() => clearInterval(this.helloTimer));
  }

  /**
   * Đường truyền của máy này vừa đứt, hoặc vừa nối lại.
   *
   * Nối lại **chưa phải là xong**. Trong lúc đứt, ván vẫn chạy tiếp trên các
   * máy khác mà mình không nhận được ảnh chụp nào; kênh thông trở lại cũng
   * không ai gửi bù cho — `sync` là tin phát một lần, không có kho lưu lại.
   *
   * Nên nối lại rồi thì gửi `hello`, đúng lời mà người bấm F5 vẫn gửi: người
   * đang giữ sổ (chủ phòng lúc chờ, trọng tài lúc chơi) sẽ ghi lại mình là có
   * mặt, phát lại sổ ghế, và nếu đang giữa ván thì gửi kèm cả bàn cờ hiện tại.
   */
  #onLink(status) {
    if (this.left) return;
    this.linkLost = status === 'lost';
    if (status === 'live') this.tp.send('hello', { id: this.me.id, name: this.me.name });
    this.on.link(status);
  }

  // ------------------------------------------------------------ ghi sổ ghế

  /**
   * Có người xin ghế.
   *
   * Trong phòng chờ thì **chủ phòng** ghi sổ. Vào ván rồi thì chủ phòng hết
   * vai, **trọng tài** trả lời — chủ yếu là để đón người vừa rớt mạng quay lại
   * đúng ghế cũ với nguyên tài sản.
   */
  #onHello(m) {
    if (!m?.id) return;
    const inLobby = this.phase === 'lobby';
    if (inLobby ? !this.isHost : !this.isArbiter) return;

    const i = this.seatOf(m.id);

    if (i >= 0) {
      // Đã bị mời ra thì không cho lẻn vào lại bằng cách nạp lại trang.
      if (this.seats[i].kicked) { this.tp.send('kick', { id: m.id }); return; }
      this.seats[i].online = true;
      // Chỉ bắc cầu chờ presence, không ghi thẳng vào `livePeers` — xem `isLive`.
      this.helloAt.set(m.id, Date.now());
      this.awaySince.delete(m.id);
      /* Không lấy tên trong `hello`: `name` nằm ở localStorage nên **dùng chung
         mọi tab của máy đó**. Người vào lại giữa ván mà máy ấy vừa có ai gõ tên
         khác thì ghế bị đặt lại theo tên người kia. Tên vào sổ ở đúng một chỗ:
         `#onReady`, lúc bấm "Sẵn sàng" trong phòng chờ. */
      this.#publishRoom();
      // Vào lại giữa ván thì sổ ghế thôi chưa đủ — họ cần cả ván cờ hiện tại.
      if (!inLobby) this.onNeedSync?.();
      return;
    }

    // Ván đã mở thì không nhận thêm người mới — quân cờ và tài sản đã chia xong.
    if (!inLobby || this.isFull) {
      this.tp.send('full', { to: m.id });
      return;
    }

    // Ghi nhận ngay lúc nhận `hello`: presence có thể về sau, mà nhịp dọn ghế
    // chạy đều đặn — không có dòng này thì người vừa vào bị gạch tên oan.
    if (!this.firstSeen.has(m.id)) this.firstSeen.set(m.id, Date.now());
    /* Tên để trống có chủ ý: người mới vào đang gõ tên trên máy họ, và tên ấy
       chỉ lên sóng khi họ bấm "Sẵn sàng". Nhờ vậy phòng không phải phát lại sổ
       ghế theo từng phím gõ. */
    this.seats.push({
      id: m.id,
      name: `Người chơi ${this.seats.length + 1}`,
      token: this.#freeToken(),
      online: true,
      kicked: false,
      ready: false,
    });
    this.#publishRoom();
  }

  /** Đã đủ người và ai cũng bấm sẵn sàng chưa — điều kiện để khai cuộc. */
  get allReady() {
    return this.seats.length >= 2 && this.seats.every((s) => s.ready);
  }

  /**
   * Màu quân nhỏ nhất còn trống — ghế giữa bị bỏ trống thì màu ấy dùng lại được.
   * Quét cả bảng màu chứ không dừng ở `MAX_PLAYERS`: ai đó tự chọn một sắc ở
   * cuối bảng thì người vào sau vẫn còn màu để phát.
   */
  #freeToken() {
    const taken = new Set(this.seats.map((s) => s.token));
    for (let i = 0; i < TOKENS.length; i++) if (!taken.has(i)) return i;
    return 0;
  }

  /**
   * Có người bấm "Sẵn sàng" (hoặc bấm "Sửa lại" để gõ tên khác).
   * Đây là lúc duy nhất tên được ghi vào sổ — trong lúc gõ thì tên nằm yên
   * trên máy người ấy, phòng không phải phát lại sổ ghế theo từng phím.
   */
  #onReady(m) {
    if (!this.isHost || this.phase !== 'lobby') return;
    const i = this.seatOf(m?.id);
    if (i < 0) return;
    const clean = String(m.name ?? '').trim().slice(0, 14);
    this.seats[i].ready = !!m.ready;
    if (clean) this.seats[i].name = clean;
    this.#publishRoom();
  }

  /** Bấm sẵn sàng / bỏ sẵn sàng, kèm tên đã gõ xong. */
  setReady(name, ready) {
    const m = { id: this.me.id, name, ready };
    if (this.isHost) this.#onReady(m);
    else this.tp.send('ready', m);
  }

  /**
   * Đổi màu quân của mình.
   *
   * Màu đã có người giữ thì từ chối ngay tại đây, không gửi đi: hai ghế cùng
   * một màu thì trên bàn cờ không còn đọc được quân nào của ai, mà nước màu
   * chủ đất phủ trên ô cũng chỉ vào hai người.
   *
   * Bấm "Sẵn sàng" là chốt luôn màu — cùng lúc với chốt tên. Muốn đổi thì bấm
   * "Sửa lại" trước; nhờ vậy người khác nhìn màu của người đã sẵn sàng mà
   * chọn thì màu ấy không bị rút đi sau lưng họ.
   *
   * @returns {boolean} có gửi đi được không — false nghĩa là màu đã có chủ
   */
  setToken(index) {
    if (this.phase !== 'lobby') return false;
    const mine = this.mySeat;
    if (mine < 0 || this.seats[mine].ready) return false;
    if (!Number.isInteger(index) || index < 0 || index >= TOKENS.length) return false;
    const held = this.tokenSeat(index);
    if (held >= 0 && held !== mine) return false;
    const m = { id: this.me.id, token: index };
    if (this.isHost) this.#onPick(m);
    else this.tp.send('pick', m);
    return true;
  }

  /** Có người đổi màu quân. Chủ phòng xét lại lần nữa rồi mới ghi sổ. */
  #onPick(m) {
    if (!this.isHost || this.phase !== 'lobby') return;
    const i = this.seatOf(m?.id);
    const index = Number(m?.token);
    if (i < 0 || !Number.isInteger(index) || index < 0 || index >= TOKENS.length) return;
    if (this.seats[i].ready) return;
    // Hai người bấm cùng một màu gần như cùng lúc: chỉ tin nào tới trước được
    // ghi, tin sau rơi ở đây và máy người ấy vẫn giữ nguyên màu cũ.
    const held = this.tokenSeat(index);
    if (held >= 0 && held !== i) return;
    this.seats[i].token = index;
    this.#publishRoom();
  }

  /**
   * Ai biến mất khỏi danh sách có mặt thì bỏ ghế (lúc chờ) hoặc đánh dấu mất
   * kết nối (lúc đang chơi). Đang chơi mà xoá ghế thì số thứ tự người chơi
   * chạy hết, tài sản trên bàn cờ sẽ trỏ nhầm chủ.
   */
  #onPresence(peers) {
    const now = Date.now();
    this.livePeers = new Set(peers.map((p) => p.id));
    for (const id of this.livePeers) {
      if (!this.firstSeen.has(id)) this.firstSeen.set(id, now);
      // Presence đã xác nhận, không cần bắc cầu bằng `hello` nữa
      this.helloAt.delete(id);
    }
    if (this.hostId && this.livePeers.has(this.hostId)) this.sawHost = true;
    // Việc bấm giờ vắng mặt nằm trong `#reap`: nó chạy đều đặn nên bắt được cả
    // lúc ân hạn `hello` hết hạn, chứ không chỉ lúc có tin presence tới.
    this.#reap();
  }

  /**
   * Gạch tên những ai vắng quá lâu.
   *
   * Chạy bằng nhịp hẹn giờ chứ **không** chỉ chạy khi có tin presence tới. Rời
   * phòng thường chỉ sinh đúng một tin, mà ngay tại thời điểm ấy người kia vẫn
   * còn trong khoảng ân hạn — xét một lần rồi thôi thì ghế treo mãi vì không
   * bao giờ có tin thứ hai để xét lại.
   */
  #reap() {
    if (this.left) return;
    const now = Date.now();

    /* Bấm giờ vắng mặt. Đặt ở đây chứ không ở `#onPresence` vì một người có thể
       chuyển sang vắng mặt mà **không** có tin presence nào: ân hạn `hello` của
       họ hết hạn trong im lặng. */
    for (const s of this.seats) {
      if (this.isLive(s.id)) this.awaySince.delete(s.id);
      else if (!this.awaySince.has(s.id)) this.awaySince.set(s.id, now);
    }

    /**
     * Vắng mặt, và đã qua khoảng ân hạn kể từ lúc mình biết tới người này.
     * Ân hạn chỉ để đỡ cho một trường hợp: người vừa xin ghế bằng `hello` mà
     * tin presence của họ chưa kịp về.
     */
    const gone = (id) => !this.isLive(id)
      && now - (this.firstSeen.get(id) ?? 0) > GRACE_MS;

    /* Đang chơi: sổ ghế đã đóng, không ai thêm bớt nữa. Cờ "còn nối mạng" thì
       mỗi máy **tự nhìn tự ghi**, không phát đi đâu cả — đó là quan sát riêng
       của từng máy, mà ai cũng nhìn thấy cùng một danh sách presence nên cũng
       ra cùng kết quả. Nhờ vậy không cần một máy nào đứng ra giữ sổ. */
    if (this.phase !== 'lobby') {
      let moved = false;
      for (const [i, s] of this.seats.entries()) {
        if (s.kicked) continue;
        const here = s.id === this.me.id || !gone(s.id);
        if (s.online !== here) { s.online = here; moved = true; }
        void i;
      }
      if (moved) this.on.room(this);
      return;
    }

    // Trong phòng chờ, chủ phòng rời là phòng đóng — không còn ai ghi sổ ghế
    // cho người mới vào, danh sách sẽ đứng im vĩnh viễn.
    if (!this.isHost) {
      if (this.sawHost && this.hostId && gone(this.hostId)) this.on.closed();
      return;
    }

    let changed = false;
    for (let i = this.seats.length - 1; i >= 0; i--) {
      const s = this.seats[i];
      if (s.id === this.me.id) continue;
      if (gone(s.id)) { this.seats.splice(i, 1); changed = true; }
    }
    if (changed) this.#publishRoom();
  }

  #publishRoom() {
    // Phòng chờ do chủ phòng ghi sổ; vào ván rồi thì chỉ còn trọng tài phát sổ,
    // và cũng chỉ để đón người vào lại.
    if (!(this.phase === 'lobby' ? this.isHost : this.isArbiter)) return;
    const payload = {
      hostId: this.hostId ?? this.me.id,
      seats: this.seats,
      phase: this.phase,
      options: this.options,
    };
    this.tp.send('room', payload);
    this.#applyRoom(payload);   // chủ phòng không nhận lại thông điệp của mình
  }

  #applyRoom(m) {
    if (!m?.seats) return;
    this.hostId = m.hostId;
    this.seats = m.seats;
    this.phase = m.phase;
    if (m.options) this.options = m.options;
    if (this.mySeat >= 0) this.onceSeated?.();
    this.on.room(this);
  }

  // ------------------------------------------------------------------- kick

  /**
   * Chủ phòng mời một người ra khỏi **phòng chờ** — ghế bị xoá, chỗ ấy để người
   * khác vào.
   *
   * Vào ván rồi thì không mời ai ra nữa: ai tự rời bàn thì tài sản trả về ngân
   * hàng theo luật, không cần ai ra lệnh.
   */
  kick(id) {
    if (this.phase !== 'lobby' || !this.isHost || id === this.me.id) return false;
    const i = this.seatOf(id);
    if (i < 0) return false;
    this.seats.splice(i, 1);
    this.tp.send('kick', { id });
    this.#publishRoom();
    return true;
  }

  /** Chủ phòng đổi luật tuỳ chọn trong lúc chờ. Vào ván rồi thì thôi. */
  setOptions(patch) {
    if (this.phase !== 'lobby' || !this.isHost) return false;
    this.options = { ...this.options, ...patch };
    this.#publishRoom();
    return true;
  }

  #onKick(m) {
    if (m?.id !== this.me.id) return;
    this.on.kicked();
    this.leave();   // dọn cả nhịp hẹn giờ, không chỉ đóng kênh
  }

  // ------------------------------------------------------------- khai cuộc

  /** Chủ phòng mở ván. `snap` là ảnh chụp ván đầu do controller dựng. */
  startGame(snap) {
    if (!this.isHost) return;
    this.phase = 'playing';
    const seats = this.seats;
    this.tp.send('start', { snapshot: snap, seats });
    this.#publishRoom();
    // Không tự gọi `on.start` — máy chủ phòng đã cầm sẵn ảnh chụp và vào ván
    // theo đường riêng; gọi thêm ở đây là khai cuộc hai lần.
  }

  // -------------------------------------------------------- trong lúc chơi

  publishSync(snap) { return this.tp.send('sync', { snapshot: snap }); }
  emit(name, data) { return this.tp.send('ev', { name, data }); }
  say(title, html, o) { return this.tp.send('bc', { title, html, o }); }

  /**
   * Hỏi một người chơi khác và **chờ họ trả lời** — dùng cho giao dịch: bên A
   * dựng đề nghị, bên B ngồi máy khác mới là người bấm đồng ý hay không.
   * Người kia rớt mạng thì trả về `fallback` chứ không treo lượt.
   */
  ask(toSeat, name, data, { timeout = 120000, fallback = null } = {}) {
    const to = this.seats[toSeat]?.id;
    if (!to) return Promise.resolve(fallback);
    const rid = `${this.me.id}:${++this.rid}`;
    this.tp.send('ask', { to, rid, name, data });
    return new Promise((resolve) => {
      this.pending.set(rid, resolve);
      setTimeout(() => {
        if (this.pending.delete(rid)) resolve(fallback);
      }, timeout);
    });
  }

  async #onAsk(m) {
    if (m?.to !== this.me.id || !this.on.ask) return;
    const value = await this.on.ask(m.name, m.data);
    this.tp.send('reply', { rid: m.rid, value });
  }

  async leave() {
    if (this.left) return;
    this.left = true;
    clearInterval(this.helloTimer);
    clearInterval(this.reaper);
    await this.tp.leave();
  }
}
