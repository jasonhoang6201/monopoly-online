/**
 * Lớp diễn của ván: nhận sự kiện từ chủ ván rồi diễn lên bàn cờ (Phaser) và
 * giao diện (HTML), bày thanh nút và hộp thoại cho câu hỏi của ghế mình, gửi
 * câu trả lời đi.
 *
 * Luật không chạy ở đây. Chủ ván là engine (`engine/engine.js`): ở bản một
 * máy nó nằm ngay trong trình duyệt (`game/localHost.js`), ở bản online nó
 * nằm trên Durable Object. Hai bên nói chuyện cùng một kiểu:
 *   - controller gửi action: `host.send({type:'answer', id, seat, value})`;
 *   - chủ ván trả về một dãy sự kiện: `dice`, `move`, `say`, `sync`, `ask`…
 *
 * Sự kiện xếp hàng và diễn lần lượt (`pump`). `sync` mang ảnh chụp của ván
 * ngay lúc ấy, áp vào bàn đúng lúc diễn tới — nên tiền, đất, quân trên bàn
 * luôn khớp với hoạt cảnh vừa chạy, dù engine đã đi trước vài bước.
 */
import { BOARD, money, JAIL_FINE, JAIL_TILE, START_MONEY } from '../data/board.js';
import { WIN_WORTH, WIN_SETS, WIN_HOTEL_SETS } from '../core/state.js';
import { cardType } from '../core/cards.js';
import { cardOf, DECKS } from '../data/cards.js';
import { has } from '../core/skills.js';
import { snapshot, fromSnapshot, applySnapshot } from '../core/serialize.js';
import { Analytics } from '../net/analytics.js';
import { Hud, Broadcast } from '../ui/hud.js';
import { QuickView } from '../ui/quickview.js';
import {
  diceSvg, tradeSvg, estateSvg, bankruptSvg, doneSvg, coinSvg, cardSvg,
} from '../ui/actionIcons.js';
import { inventoryModal } from '../ui/inventory.js';
import { openModal, handoff, setHandoffSkip, dismissTopModal } from '../ui/modal.js';
import {
  setupModal, buyModal, manageModal, tradePickModal, tradeBuildModal, tradeReviewModal,
  redeemPromptModal, bankruptModal, winnerModal, playerModal, tileModal, rollOffModal,
  attachTimer, debtPanelHtml,
} from '../ui/modals.js';
import { raisePlan } from '../core/raisePlan.js';
import {
  bracePromptModal, firePromptModal, snowPromptModal, zombiePromptModal, auctionBidModal,
  auctionResultModal, closeBidModal,
} from '../ui/eventModals.js';
import { pickTileOnBoard, litTiles } from '../ui/tilePicker.js';
import { pickGroupOnBoard } from '../ui/groupPicker.js';
import { ghostVotePanel } from '../ui/ghostVote.js';
import { EVENT_BY_ID } from '../data/events.js';
import { audio } from '../audio/audio.js';
import { MemeDeck } from '../ui/memes.js';
import { skillIcon } from '../ui/skillIcons.js';
import { fateCase, eventCase } from '../ui/caseOpen.js';
import { setTheme } from '../theme/theme.js';
import { SkillUi } from './skillUi.js';
import { levelOfKey } from '../core/botPolicy.js';
import { LocalHost } from './localHost.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Mọi ô đất có mặt trong một đề nghị giao dịch, gộp cả hai vế. */
const offerTiles = (offer) => [...(offer?.give ?? []), ...(offer?.get ?? [])];

/** Hộp thẻ của ghế máy đứng bấy lâu rồi tự đóng, cho người ngồi xem kịp đọc. */
const BOT_READ_MS = 2600;

/** Chủ đề của ván áp lên hình (bàn cờ, quân, CSS) và tiếng (nhạc, hiệu ứng). */
function applyTheme(theme) {
  setTheme(theme);
  audio.setTheme(theme);
}

export class Game {
  constructor(scene) {
    this.scene = scene;
    this.bc = new Broadcast();
    this.quick = new QuickView(null);
    this.scene.onTileHover = (id) => this.quick.show(id);
    /** Đang mở một hộp thoại của chính máy này (quản lý tài sản, dựng giao dịch…). */
    this.localBusy = false;
    this.skills = new SkillUi(this);
    this.analytics = new Analytics(this);
    /** Chủ ván: `LocalHost` (một máy) hoặc phòng online. */
    this.host = null;
    /** Phòng online, hoặc null khi cả bàn ngồi chung một máy. */
    this.net = null;
    /** Hàng sự kiện chờ diễn. */
    this.queue = [];
    this.pumping = false;
    /** Câu hỏi đang treo, theo sự kiện `ask` gần nhất đã diễn tới. */
    this.pending = null;
    /** Những câu hỏi (id:ghế) đang mở hộp thoại ở máy này — chặn mở hai lần. */
    this.showing = new Set();
    /** Đã gửi câu trả lời cho câu hỏi id này, chờ câu hỏi kế tiếp. */
    this.sent = new Set();
    /** Thao tác ở thanh nút chờ câu hỏi `turn` kế tiếp mới gửi được. */
    this.menuQueue = [];
    /** Id các câu hỏi `fate` (hộp thẻ Cơ Hội / Khí Vận) đã nhận mà chưa xong. */
    this.fateAsks = new Set();
    /** Số hộp thẻ đã được trả lời ở máy kia mà máy này chưa diễn tới. */
    this.fateDone = 0;
    /** Chốt chờ của hộp thẻ đang mở trên máy ngồi xem. */
    this.fateWaiter = null;
    /** Hộp thẻ Cơ Hội / Khí Vận đang mở cho ghế của máy này: `{seat, done}`. */
    this.fateOpen = null;
    /** Người đang cầm máy (bản một máy, nhiều người thật) — chuyền máy khi đổi. */
    this.holder = null;
    /** Đồng hồ đang chạy cho ai, tới lúc nào. */
    this.clock = null;
    /** Hộp bầu của Hội Đồng Hồn Ma đang mở. */
    this.ghostPanel = null;
    /** Lời gọi luật thẳng của bộ kiểm thử đang chờ xong — xem `debug`. */
    this.debugWaiters = [];
    const game = this;
    /** Hội Đồng Hồn Ma: bộ kiểm thử hạ thời gian hộp bầu qua `c.ghosts.ms`. */
    this.ghosts = {
      get ms() { return game.state?.settings.timing?.ghostMs; },
      set ms(v) {
        const st = game.state;
        if (!st) return;
        st.settings.timing = { ...st.settings.timing, ghostMs: v };
        game.sync();
      },
      /** Ghế hồn ma bầu được: đã phá sản, có người thật ngồi. */
      presentGhosts: () => (this.state?.players ?? []).filter((p) => p.bankrupt && !this.isBot(p.id)).map((p) => p.id),
      localGhosts: () => this.localGhosts(this.ghosts.presentGhosts()),
    };
    /** Ghế máy của ván (bản một máy) — bộ kiểm thử hỏi qua `c.bot`. */
    this.bot = {
      is: (seat) => this.isBot(seat),
      lv: (seat) => levelOfKey(this.state?.bots?.[seat]),
      get active() { return game.botSeats().length > 0; },
    };
    /** Hai mạch thẻ Thời Cuộc mà bộ kiểm thử gọi thẳng. */
    this.events = {
      run: () => this.debug('events.run'),
      auction: (...a) => this.debug('events.auction', ...a),
    };
    this.memes = new MemeDeck(this.scene, {
      seatOf: () => this.memeSeat(),
      send: (id) => this.net?.emit('meme', { seat: this.memeSeat(), id }),
    });
    this.watchActivity();
    this.skillBtn = document.getElementById('skill-btn');
    if (this.skillBtn) {
      this.skillBtn.innerHTML = `${skillIcon('root')}<span class="skill-btn-n" hidden></span>`;
      this.skillBtn.addEventListener('click', () => this.openSkillsAnyTime());
    }
  }

  // ---------------------------------------------------------------- khởi đầu

  /** Bản một máy: hỏi cách bày bàn, dựng chủ ván ngay trong trình duyệt. */
  async start() {
    audio.startMusic();
    const { names, tokens, bots, settings } = await setupModal();
    audio.stopMusic();
    const host = new LocalHost({ names, tokens: tokens ?? null, settings, bots: bots ?? null }, {
      onTelemetry: (ev) => this.analytics.push(ev),
    });
    this.host = host;
    host.onEvents = (evs) => this.receive(evs);
    const snap = host.start();
    this.mount(snap);
    if (!this.botSeats().length) this.analytics.gameStart(this.state, 'offline');
    this.setupHandoff();
    this.bc.show('KHAI CUỘC',
      `Ván cờ bắt đầu, mỗi người ${money(START_MONEY)} vốn liếng. Thắng khi còn trụ lại một mình,
       giữ ${WIN_SETS} bộ màu với ${WIN_HOTEL_SETS} bộ phủ kín khách sạn, hoặc gom đủ ${money(WIN_WORTH)} tổng tài sản.`,
      { ms: 4200 });
  }

  /**
   * Bản online: chủ ván là phòng trên máy chủ (`net/gameServer.js`). Khai cuộc
   * và vào lại giữa ván đều đi qua đây với tin `start` / `game` của server:
   * ảnh chụp, câu hỏi đang treo, và (lúc khai cuộc) dãy sự kiện đầu ván.
   *
   * @param {import('../net/gameServer.js').GameRoom} room
   * @param {{snap:object, pending?:object, events?:Array<object>}} view
   */
  startOnline(room, view) {
    audio.stopMusic();
    this.net = room;
    this.host = room;
    room.onEvents = (evs) => this.receive(evs);
    // Server gửi lại cả ván mỗi lần nối lại socket: sự kiện lỡ mất trong lúc đứt không đòi lại được
    room.on.game = (m) => this.resume(m);
    room.on.room = () => this.onRoomChange();
    room.on.link = (status) => this.onLink(status);
    // Server phát meme cho cả phòng, kể cả máy gửi — máy gửi đã tự hiện lúc bấm
    room.on.meme = (m) => { if (m.seat !== room.mySeat) this.memes.receive(m.seat, m.id); };
    this.mount(view.snap);
    this.onRoomChange();
    if (view.pending) this.receive([view.pending]);
    if (view.events?.length) this.receive(view.events);
  }

  /** Nối lại giữa ván: bỏ hàng sự kiện cũ, áp ảnh chụp mới, dựng lại câu hỏi đang treo. */
  resume(m) {
    if (!this.state || !m?.snap) return;
    this.queue = [];
    this.sent.clear();
    this.pending = null;
    this.applySync(m.snap);
    if (m.pending) this.receive([m.pending]);
    else { this.clearClock(); this.hud.clearActions(); }
  }

  /** Sổ ghế của phòng đổi: ai đang rớt mạng, ai đã rời bàn. */
  onRoomChange() {
    if (!this.net || !this.state) return;
    this.hud.setSeatStatus(this.net.seats.map((s, i) => (
      this.state.players[i]?.bankrupt ? 'out' : (s.online ? 'live' : 'away')
    )));
  }

  /** Đường truyền của máy mình đứt / thông. Đứt thì cất thanh nút: bấm cũng không tới server. */
  onLink(status) {
    if (!this.net || !this.state) return;
    const lost = status === 'lost';
    this.hud.setLinkLost(lost);
    if (lost) { this.clearClock(); this.hud.clearActions(); }
  }

  /** Dựng bàn cờ và giao diện từ ảnh chụp đầu tiên. */
  mount(snap) {
    this.state = fromSnapshot(snap);
    applyTheme(this.state.settings.theme);
    this.quick.setState(this.state);
    this.hud = new Hud(this.state, (id) => this.showPlayer(id), this.quick);
    this.hookPeek();
    this.scene.setBaseTileClick((id) => this.showTile(id));
    this.scene.setPlayers(this.state.players);
    this.scene.refresh(this.state);
    this.memes.setState(this.state);
    this.bc.clear();
    if (this.skillBtn) this.skillBtn.hidden = !this.net && !this.botSeats().length;
    this.refreshSkillBtn();
    this.hud.refresh();
  }

  /** Rê chuột lên một người ở thanh bên: soi đất của họ trên bàn cờ. */
  hookPeek() {
    this.hud.onPeek = (id) => {
      if (id == null) { this.scene.unpeekTiles(); return; }
      const p = this.state.players[id];
      if (p) this.scene.peekTiles(this.state.propertiesOf(id), p.token.css);
    };
  }

  /**
   * Chuyền máy chỉ có nghĩa giữa hai người thật cùng ngồi quanh máy: sang ghế
   * máy thì không ai cầm, còn bàn một người thật thì chẳng có ai để chuyền.
   */
  setupHandoff() {
    const st = this.state;
    const bots = new Set(this.botSeats());
    const botNames = new Set(st.players.filter((p) => bots.has(p.id)).map((p) => p.name));
    const humanNames = new Set(st.players.filter((p) => !bots.has(p.id)).map((p) => p.name));
    const humans = st.players.length - bots.size;
    setHandoffSkip(bots.size ? (name) => humans <= 1 || (botNames.has(name) && !humanNames.has(name)) : null);
  }

  /**
   * Ván đang bận: còn sự kiện chờ diễn, đang chạy một mạch luật gọi thẳng,
   * hoặc đang mở hộp thoại của mình. Bộ kiểm thử chờ cờ này tắt rồi mới đọc ván.
   */
  get busy() {
    return this.localBusy || this.pumping || this.queue.length > 0 || this.debugWaiters.length > 0;
  }

  /** Cảnh bộ xương của chủ đề Halloween (bộ kiểm thử gọi thẳng). */
  skit(kind, seat, owner) {
    if (this.state?.settings.theme !== 'halloween') return;
    this.scene.playSkit?.(kind, seat, owner);
  }

  /** Hoạt cảnh nhà cửa trên các ô (bộ kiểm thử gọi thẳng). */
  tileFx(kind, ids, lost = true) { return this.scene.tileFx(kind, ids, lost); }

  // ---------------------------------------------------------------- ghế

  botSeats() { return (this.state?.bots ?? []).map((b, i) => (b ? i : -1)).filter((i) => i >= 0); }
  isBot(seat) { return !!this.state?.bots?.[seat]; }

  /** Máy này trả lời được câu hỏi của ghế này không. */
  mine(seat) {
    if (this.net) return seat === this.net.mySeat;
    return seat >= 0 && !this.isBot(seat);
  }

  /** Ghế của mình trong ván (−1 khi chơi một máy không có bot). */
  get mySeat() { return this.net ? this.net.mySeat : this.homeSeat(); }

  /**
   * Ghế của người ngồi trước màn hình ở bàn có bot: người tới lượt nếu là
   * người, không thì người thật đi gần nhất.
   */
  homeSeat() {
    const st = this.state;
    if (!st || !this.botSeats().length) return -1;
    if (!this.isBot(st.turn) && !st.current.bankrupt) this.home = st.turn;
    if (this.home == null || this.isBot(this.home) || st.players[this.home]?.bankrupt) {
      this.home = st.players.find((p) => !this.isBot(p.id) && !p.bankrupt)?.id ?? -1;
    }
    return this.home;
  }

  /** Meme thả ra thì bong bóng hiện trên đầu ai. */
  memeSeat() {
    if (this.net) return this.net.mySeat;
    if (this.botSeats().length) return this.homeSeat();
    return this.state?.turn ?? -1;
  }

  /** Ghế tới lượt có phải của máy này và máy này đang được bấm không. */
  isDriver() {
    if (!this.state) return false;
    return this.mine(this.state.turn);
  }

  // ---------------------------------------------------------------- nhận sự kiện

  /**
   * Sự kiện mới từ chủ ván. `answered` của hộp thẻ được xét ngay lúc nhận,
   * không chờ diễn tới: máy ngồi xem đang đứng chờ hộp ấy đóng, mà chính hàng
   * sự kiện đang kẹt sau hộp ấy.
   */
  receive(events) {
    for (const ev of events) {
      if (ev.type === 'ask' && ev.list.some((q) => q.kind === 'fate')) this.fateAsks.add(ev.id);
      if (ev.type === 'answered' && ev.all && this.fateAsks.delete(ev.id)) {
        if (this.fateWaiter) { this.fateWaiter(); this.fateWaiter = null; } else this.fateDone += 1;
      }
    }
    this.queue.push(...events);
    this.pump();
  }

  async pump() {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (this.queue.length) {
        const ev = this.queue.shift();
        try {
          await this.play(ev);
        } catch (err) {
          console.error('diễn sự kiện hỏng', ev.type, err, err?.stack);
        }
      }
    } finally {
      this.pumping = false;
    }
  }

  /** Diễn một sự kiện. Chỉ chờ những hoạt cảnh mà sự kiện sau phải đứng sau. */
  async play(ev) {
    const sc = this.scene;
    const st = this.state;
    switch (ev.type) {
      case 'say':
        this.bc.show(ev.title, ev.html, { kind: ev.kind, ms: ev.ms || undefined });
        return;
      case 'sync':
        this.applySync(ev.snap);
        return;
      case 'sfx':
        audio.sfx(ev.name);
        return;
      case 'dice':
        await sc.rollDiceAnim(ev.a, ev.b, ev.only);
        return;
      case 'move':
        sc.clearHighlight();
        await sc.moveToken(ev.seat, ev.from, ev.steps);
        return;
      case 'jail':
        sc.shake(0.007, 340);
        await sc.jumpToken(ev.seat, JAIL_TILE);
        sc.syncJail?.(st);
        return;
      case 'hideDice':
        sc.hideDice();
        sc.clearHighlight();
        return;
      case 'highlight': {
        const p = st.players[ev.seat];
        if (p) sc.highlightTile(ev.tile, p.token.color);
        return;
      }
      case 'spin':
        await sc.spinTiles(ev.ids, ev.tileId);
        return;
      case 'quake':
        sc.shake(ev.strong ? 0.012 : 0.008, ev.strong ? 700 : 420);
        return;
      case 'spot':
        sc.spotTiles(ev.ids, ev.ms);
        return;
      case 'tilefx':
        sc.tileFx(ev.kind, ev.ids, ev.lost ?? true);
        return;
      case 'zombies':
        sc.zombieMarch?.(ev.ids);
        return;
      case 'skit':
        sc.playSkit?.(ev.kind, ev.seat, ev.owner);
        return;
      case 'witch':
        await sc.witchFly?.(ev.a, ev.b);
        return;
      case 'fly':
        this.flashFly(ev);
        return;
      case 'bankruptFx':
        await sc.bankruptFx(ev.seat);
        return;
      case 'fireworks': {
        const c = sc.boardCenter();
        sc.fireworks(c.x, c.y, 0xB3322A, 2);
        return;
      }
      case 'wait':
        await wait(ev.ms);
        return;
      case 'eventcard':
        await this.showEventCard(ev);
        return;
      case 'fatecard':
        await this.showFateCard(ev);
        return;
      case 'auctionend':
        closeBidModal();
        auctionResultModal(st, ev.tileId, ev.rows,
          { winner: ev.winner, sellerName: ev.sellerName, noSale: ev.noSale });
        await wait(1200);
        return;
      case 'turn':
        // Tới lượt mình thì reo một tiếng: chơi online người ta hay ngó sang cửa sổ khác
        if (this.net && this.mine(ev.seat)) audio.sfx('turn');
        // Bản một máy: hết một lượt thì gửi số liệu cân bằng (bản online do server gửi)
        if (!this.net) this.analytics.flush();
        return;
      case 'ghostcall':
        this.openGhostVote(ev);
        return;
      case 'ghostvote':
        if (this.ghostPanel && this.ghostPanel.n === ev.n) this.ghostPanel.panel.setVote(ev.seat, ev.id);
        return;
      case 'gameover':
        this.finish({ player: st.players[ev.seat], by: ev.by });
        return;
      case 'ask':
        this.setAsk(ev);
        return;
      case 'answered':
        if (ev.all && this.pending?.id === ev.id) {
          this.pending = null;
          this.clearClock();
          this.hud.clearActions();
        }
        return;
      case 'debug-done': {
        const i = this.debugWaiters.findIndex((w) => w.path === ev.path);
        if (i >= 0) this.debugWaiters.splice(i, 1)[0].resolve(ev.value);
        return;
      }
      case 'rejected':
        // Câu trả lời không còn hợp lệ (bàn vừa đổi): dựng lại giao diện theo câu hỏi đang treo
        this.renderAsk();
        return;
      case 'error':
        console.error('engine:', ev.message, ev.stack);
        return;
      default:
    }
  }

  /** Áp ảnh chụp vào bàn — tại chỗ, để HUD và scene giữ nguyên tham chiếu. */
  applySync(snap) {
    if (!snap || !this.state) return;
    applySnapshot(this.state, snap);
    this.hud.refresh();
    this.scene.refresh(this.state);
    this.scene.placeTokens();
    this.scene.syncJail?.(this.state);
    this.refreshSkillBtn();
  }

  /** Tiền bay giữa hai chỗ, kèm nháy số dư. */
  flashFly(ev) {
    const el = (who) => (who === 'bank' ? this.hud.bankEl() : this.hud.cardEl(who));
    if (ev.from !== 'bank') this.hud.flashMoney(ev.from, false);
    if (ev.to !== 'bank') this.hud.flashMoney(ev.to, true);
    this.scene.flyMoney(el(ev.from), el(ev.to), ev.amount, { text: ev.text, color: ev.color });
  }

  /**
   * Thẻ Thời Cuộc: máy nào cũng thấy mặt thẻ, ai cũng tự bấm đóng. Hàng sự
   * kiện chờ mặt thẻ lật xong rồi thêm một nhịp đọc mới diễn tiếp.
   */
  async showEventCard(ev) {
    const card = EVENT_BY_ID[ev.id];
    if (!card) return;
    let revealed;
    const shown = new Promise((r) => { revealed = r; });
    eventCase(card, { detail: ev.detail, seed: ev.seed, onReveal: revealed });
    await Promise.race([shown, wait(12000)]);
    await wait(900);
  }

  /**
   * Thẻ Cơ Hội / Khí Vận. Ghế của máy này: hộp có nút, câu hỏi `fate` theo
   * sau sẽ chờ cú bấm ấy. Máy ngồi xem: hộp không nút, tắt khi câu hỏi được
   * trả lời ở máy kia. Ghế máy: tắt sau một nhịp đọc.
   */
  async showFateCard(ev) {
    const card = ev.card ?? DECKS[ev.kind]?.[ev.index];
    if (!card) return;
    const o = { amount: ev.amount ?? null, note: ev.note ?? '', seed: ev.seed, label: ev.label ?? undefined };
    if (this.mine(ev.seat) && !this.isBot(ev.seat)) {
      await this.handTo(ev.seat);
      this.fateOpen = { seat: ev.seat, done: fateCase(ev.kind, card, o) };
      return;
    }
    const closeOn = this.isBot(ev.seat) ? wait(BOT_READ_MS) : this.fateWatch();
    await fateCase(ev.kind, card, {
      ...o,
      closeOn,
      waitNote: ev.by ? `Chờ ${ev.by} bấm…` : 'Chờ người đang đi…',
    });
  }

  /**
   * Chốt chờ cho hộp thẻ trên máy ngồi xem: tắt khi câu hỏi `fate` được trả
   * lời ở máy kia, hoặc sau hạn chót (máy kia tắt ngang giữa chừng). Máy này
   * diễn chậm hơn mà câu trả lời đã về từ trước thì vẫn để thẻ lật xong một nhịp.
   */
  fateWatch(ms = 20000) {
    if (this.fateDone > 0) {
      this.fateDone -= 1;
      return wait(BOT_READ_MS);
    }
    return new Promise((done) => {
      const t = setTimeout(() => { this.fateWaiter = null; done(); }, ms);
      this.fateWaiter = () => { clearTimeout(t); done(); };
    });
  }

  // ---------------------------------------------------------------- câu hỏi

  /** Câu hỏi mới diễn tới: ghi lại, bày đồng hồ, mở giao diện nếu là của mình. */
  setAsk(ev) {
    this.pending = ev;
    this.showClock(ev);
    if (ev.list.some((q) => q.kind === 'turn')) this.flushMenu();
    this.renderAsk();
  }

  /** Vòng cung đếm ngược cho ghế đang được chờ (chỉ bản online có hạn). */
  showClock(ev) {
    if (!ev.deadline || !ev.ms) { this.clearClock(); return; }
    const q = ev.list[0];
    const p = this.state.players[q.seat];
    if (!p) return;
    const label = { turn: this.state.rolled ? 'kết thúc lượt' : 'lượt đi', 'trade-review': 'trả lời giao dịch', raise: 'xoay tiền' }[q.kind]
      ?? (ev.list.length > 1 ? 'thời cuộc' : 'đang thao tác');
    this.clock = { seat: q.seat, until: Date.now() + ev.ms, total: ev.ms, label };
    this.hud.setClock({ ...this.clock, name: p.name, css: p.token.css });
  }

  clearClock() {
    this.clock = null;
    this.hud?.setClock(null);
  }

  /**
   * Bày giao diện cho câu hỏi đang treo: thanh nút, hoặc hộp thoại của từng
   * ghế máy này trả lời được. Đang mở hộp thoại của mình thì để yên, đóng
   * xong sẽ tự gọi lại.
   */
  renderAsk() {
    const ev = this.pending;
    if (!ev || this.state?.over) { this.hud?.clearActions(); return; }
    if (this.localBusy) return;
    const mineQs = ev.list.filter((q) => this.mine(q.seat) && !this.sent.has(`${ev.id}:${q.seat}`));
    const turnQ = mineQs.find((q) => q.kind === 'turn');
    if (turnQ) { this.setTurnActions(turnQ); return; }
    this.hud.clearActions();
    /* Bản một máy chỉ có một màn hình: hỏi lần lượt từng người, xong người này
       (đã gửi câu trả lời) mới mở hộp cho người kế. Mở cùng lúc thì hộp chuyền
       máy và bảng chọn ô của ba người chồng lên nhau. */
    const queue = this.net ? mineQs : mineQs.slice(0, 1);
    if (!this.net && this.showing.size) return;
    for (const q of queue) {
      const key = `${ev.id}:${q.seat}`;
      if (this.showing.has(key)) continue;
      this.showing.add(key);
      this.answerUi(ev, q).then((value) => {
        this.showing.delete(key);
        this.reply(ev, q.seat, value);
        // Hỏi nhiều người ở bản một máy: mở hộp cho người kế tiếp
        if (!this.net && this.pending?.id === ev.id) this.renderAsk();
      }, (err) => {
        this.showing.delete(key);
        console.error('hộp hỏi hỏng', q.kind, err);
      });
    }
  }

  /** Gửi câu trả lời. Câu hỏi đã có câu trả lời của máy này thì không gửi lại. */
  reply(ev, seat, value, o = {}) {
    const key = `${ev.id}:${seat}`;
    if (this.sent.has(key)) return;
    this.sent.add(key);
    if (this.sent.size > 200) this.sent = new Set([...this.sent].slice(-50));
    // `raw`: ván đang vẽ đã đổi trước theo chính thao tác này, đừng đẩy nó vào engine
    const id = (o.raw ? null : this.testSync(ev)) ?? ev.id;
    this.host.send({ type: 'answer', id, seat, value });
  }

  /**
   * Chỉ khi chạy dưới Playwright, bản một máy: bài kiểm thử hay sửa tay ván
   * đang vẽ (`c.state…`) mà không gọi `sync()`. Lúc ván đứng ở thanh nút và
   * không còn sự kiện nào chờ diễn, ván đang vẽ phải trùng ván của engine —
   * lệch là do bài kiểm thử sửa tay, nên đẩy ván ấy vào engine trước khi gửi
   * nước đi. Trả về id câu hỏi mới sau khi đẩy, hoặc null.
   */
  testSync(ev) {
    if (this.net || !globalThis.navigator?.webdriver || !this.host?.engine) return null;
    if (this.pumping || this.queue.length || (ev && ev.list?.[0]?.kind !== 'turn')) return null;
    const e = this.host.engine;
    if (e.pending?.list[0]?.kind !== 'turn') return null;
    // `flow` và `rng` là phần riêng của engine, đổi mà không phát `sync` — không tính
    const board = (st) => JSON.stringify({ ...snapshot(st), flow: null, rng: 0 });
    if (board(this.state) === board(e.st)) return null;
    // Giữ phần riêng của engine: bản ở ván đang vẽ đã cũ
    this.host.force({ ...snapshot(this.state), flow: snapshot(e.st).flow, rng: e.st.rng });
    return e.pending?.id ?? null;
  }

  /**
   * Một thao tác ở thanh nút. Câu hỏi `turn` hiện tại đã có câu trả lời mà
   * câu kế tiếp chưa tới (bấm hai nút liền trong bảng quản lý tài sản) thì
   * xếp hàng, gửi khi câu kế tiếp diễn tới.
   */
  act(value, o = {}) {
    const ev = this.pending;
    const q = ev?.list.find((x) => x.kind === 'turn' && this.mine(x.seat));
    if (!q || this.sent.has(`${ev.id}:${q.seat}`)) { this.menuQueue.push({ value, o }); return; }
    this.hud.clearActions();
    this.reply(ev, q.seat, value, o);
  }

  flushMenu() {
    if (!this.menuQueue.length) return;
    const ev = this.pending;
    const q = ev.list.find((x) => x.kind === 'turn' && this.mine(x.seat));
    if (!q) { this.menuQueue = []; return; }
    const next = this.menuQueue.shift();
    this.reply(ev, q.seat, next.value, next.o);
  }

  /**
   * Chạy một hộp thoại của chính máy này từ thanh nút. Trong lúc ấy không bày
   * lại thanh nút; bản online xin nới hạn nước đi. `fn` trả về action cho
   * thanh nút, hoặc null là bỏ ngang.
   */
  async local(fn) {
    if (this.localBusy) return;
    this.localBusy = true;
    this.hud.clearActions();
    const seat = this.state.turn;
    if (this.net && this.mine(seat)) this.host.send({ type: 'hold', seat });
    let v = null;
    try { v = await fn(); } finally { this.localBusy = false; }
    if (v) this.act(v);
    else this.renderAsk();
  }

  /**
   * Chuyền máy (bản một máy, nhiều người thật). Chỉ chuyền khi câu hỏi tới
   * người **ngoài lượt** (duyệt giao dịch, xoay tiền, thiên tai), rồi chuyền
   * lại cho người đang đi lúc xong. Sang lượt mới thì không chuyền: cả bàn
   * ngồi quanh màn hình, tới lượt ai người ấy bấm.
   */
  async handTo(seat) {
    if (this.net || seat == null || seat < 0) return;
    const st = this.state;
    const turn = seat === st.turn;
    if (this.holder === seat) { this.holderTurn = turn; return; }
    const quiet = this.holder == null || (this.holderTurn && turn);
    if (!quiet) {
      const p = st.players[seat];
      await handoff(p.name, p.token.css, turn
        ? `Xong. Chuyền máy lại cho ${p.name}.`
        : `${p.name} cần quyết định. Chuyền máy cho họ.`);
    }
    this.holder = seat;
    this.holderTurn = turn;
  }

  /** Hộp thoại cho một câu hỏi của engine. Trả về câu trả lời. */
  async answerUi(ev, q) {
    const st = this.state;
    const d = q.data ?? {};
    const ms = ev.ms || 0;
    /* Hộp bốc thăm thứ tự đã ghi "Tới phiên X lắc" — khỏi chuyền máy thêm
       một lớp; người lắc xong thì chưa ai cầm máy cả. */
    if (q.kind === 'rolloff') this.holder = null;
    // Bán sạch nhà, cầm hết đất vẫn không đủ: không có gì để quyết, khỏi chuyền máy
    else if (q.kind === 'raise' && st.liquidValue(q.seat) < d.amount) { /* hộp vỡ nợ hiện thẳng */ }
    else await this.handTo(q.seat);
    if (this.net && q.kind !== 'fate') audio.sfx('turn');
    switch (q.kind) {
      case 'rolloff':
        await rollOffModal(st, q.seat, d.rolls ?? [], ms);
        return true;
      case 'buy':
        return buyModal(d.tileId, st.players[q.seat]);
      case 'fate': {
        const open = this.fateOpen;
        this.fateOpen = null;
        if (open && open.seat === q.seat) await open.done;
        return true;
      }
      case 'bet':
        return this.skills.askBet(st.players[q.seat], ms);
      case 'after-roll':
        return this.pickTile(d.ids, d.text, ms);
      case 'seize':
        return this.skills.askSeize(d);
      case 'express':
        return this.pickTile(d.ids, d.text, ms);
      case 'card-pick':
        return this.skills.chooseCard(st.players[q.seat], d.kind, d.hand);
      case 'trade-review': {
        const v = await litTiles(this.scene, offerTiles(d.offer), () => tradeReviewModal(st, d.offer, ms));
        return v === true;
      }
      case 'redeem':
        return litTiles(this.scene, d.ids, () => redeemPromptModal(st, q.seat, d.ids, ms));
      case 'raise':
        return this.runRaise(q.seat, d.amount, ms);
      case 'ev-brace':
        return litTiles(this.scene, d.lots.map((l) => l.id), () => bracePromptModal(st, q.seat, d.lots, ms));
      case 'ev-fire':
        return litTiles(this.scene, d.lots.map((l) => l.id), () => firePromptModal(st, q.seat, d.lots, ms));
      case 'ev-snow':
        return litTiles(this.scene, d.lots.map((l) => l.id), () => snowPromptModal(st, q.seat, d.lots, ms));
      case 'ev-zombie':
        return litTiles(this.scene, d.lots.map((l) => l.id), () => zombiePromptModal(st, q.seat, d.lots, ms, d.rounds));
      case 'ev-pick':
        return this.pickTile(d.ids, d.text, ms);
      case 'ev-group':
        return this.pickGroup(d, ms);
      case 'ev-bid':
        return litTiles(this.scene, [d.tileId],
          () => auctionBidModal(st, q.seat, d.tileId, { reason: d.reason, ms, bidders: d.bidders, barred: d.barred }));
      default:
        return null;
    }
  }

  pickTile(ids, text, ms = 0) { return pickTileOnBoard(this.scene, this.state, ids, text, ms); }
  pickGroup(data, ms = 0) { return pickGroupOnBoard(this.scene, this.state, data, ms); }

  // ---------------------------------------------------------------- thanh nút

  /** Thanh nút cho người đang tới lượt. */
  setTurnActions(q) {
    const st = this.state;
    q ??= this.pending?.list.find((x) => x.kind === 'turn') ?? { seat: st.turn, kind: 'turn' };
    const p = st.players[q.seat];
    const rolled = st.rolled;
    this.refreshSkillBtn();
    this.scene.highlightTile(p.pos, p.token.color);
    if (!this.net && this.holder !== p.id) {
      // Bản một máy: máy đang trong tay người vừa được hỏi ngoài lượt
      this.localBusy = true;
      this.handTo(p.id).finally(() => { this.localBusy = false; this.renderAsk(); });
      return;
    }

    const trade = {
      label: 'Giao dịch', key: 't', cls: 'btn-jade', icon: tradeSvg(),
      hint: 'đổi đất · tiền', title: 'Mời người khác đổi đất hoặc tiền',
      onClick: () => this.local(() => this.trade(p)),
    };
    const manage = {
      label: 'Quản lý tài sản', key: 'q', cls: 'btn-ghost', icon: estateSvg(),
      hint: 'xây · thế chấp', title: 'Xây nhà, bán nhà, thế chấp hoặc chuộc đất',
      onClick: () => this.local(() => this.manage(p)),
    };
    const bankrupt = {
      label: 'Phá sản', key: 'p', cls: 'btn-danger', icon: bankruptSvg(),
      hint: 'bỏ cuộc, giao hết tài sản', title: 'Tuyên bố phá sản và rời ván',
      onClick: () => this.local(async () => ((await bankruptModal(st, p.id, false)) ? { do: 'bankrupt' } : null)),
    };
    const bag = p.cards.length ? [{
      label: `Túi thẻ · ${p.cards.length}`, key: 'b', cls: 'btn-ghost', icon: cardSvg(),
      hint: 'thẻ giữ để dùng sau', title: 'Xem và dùng thẻ Cơ Hội / Khí Vận đang giữ',
      onClick: () => this.local(async () => {
        const at = await inventoryModal(st, p.id);
        return at == null ? null : { do: 'card', at };
      }),
    }] : [];
    const send = (v) => () => this.act(v);

    if (p.inJail) {
      const ticket = st.jailCardAt(p.id);
      this.hud.setActions([
        ...(ticket >= 0 ? [{
          label: 'Dùng vé ra tù', key: 'v', cls: 'btn-jade', icon: coinSvg(), pulse: true,
          title: 'Dùng giấy bãi nại: ra tù ngay, miễn phí',
          onClick: send({ do: 'jail-card' }),
        }] : []),
        has(p, 'cnX2')
          ? { label: 'Ra tù miễn phí', key: 'n', cls: 'btn-gold', icon: coinSvg(),
              title: 'Khách Quen Nhà Đá: ra tù không phải nộp phạt', onClick: send({ do: 'jail-pay' }) }
          : { label: `Nộp ${money(JAIL_FINE)} ra tù`, key: 'n', cls: 'btn-gold', icon: coinSvg(),
              disabled: p.money < JAIL_FINE, onClick: send({ do: 'jail-pay' }) },
        { label: 'Lắc xí ngầu (cầu đôi)', key: 'r', cls: 'btn-primary', pulse: true,
          icon: diceSvg(), title: 'Ra đôi thì được thả ngay', onClick: send({ do: 'jail-roll' }) },
        ...this.skills.buttons(p, rolled), ...bag, trade, manage, bankrupt,
      ]);
      return;
    }
    this.hud.setActions([
      rolled
        ? { label: 'Kết thúc lượt', key: 'e', cls: 'btn-primary', pulse: true, icon: doneSvg(), onClick: send({ do: 'end' }) }
        : { label: 'Lắc xí ngầu', key: 'r', cls: 'btn-primary', pulse: true, icon: diceSvg(), onClick: send({ do: 'roll' }) },
      ...this.skills.buttons(p, rolled), ...bag, trade, manage, bankrupt,
    ]);
  }

  /** Dựng đề nghị giao dịch: chọn người, chọn món. Engine soát và hỏi bên kia. */
  async trade(p) {
    const st = this.state;
    const targetId = await tradePickModal(st, p.id);
    if (targetId == null) return null;
    const offer = await tradeBuildModal(st, p.id, targetId, this.scene);
    return offer ? { do: 'trade', offer } : null;
  }

  /**
   * Bảng quản lý tài sản. Mỗi cú bấm gửi ngay một thao tác lên engine, để máy
   * khác thấy căn nhà mới trong lúc bảng còn mở. Bảng đọc ván tại chỗ, nên
   * thao tác vừa bấm hiện ngay; ảnh chụp của engine về sau ghi đè bằng con số
   * chính thức.
   */
  async manage(p) {
    /* Bảng chạy trên bản sao: ván đang vẽ chỉ đổi theo ảnh chụp engine gửi
       về, không bao giờ đi trước engine một bước. */
    const copy = fromSnapshot(snapshot(this.state));
    await manageModal(copy, p.id, (act, id, res) => {
      if (res?.ok) this.act({ do: 'manage', act, id });
    });
    return null;
  }

  /**
   * Xoay tiền — chạy ở máy của chính con nợ, trên **bản sao** của ván. Ghi lại
   * từng thao tác (bán nhà, thế chấp) rồi gửi về một lượt; engine làm lại
   * trên ván thật.
   * @returns {Promise<{acts:Array, bankrupt:boolean, timeout?:boolean}>}
   */
  async runRaise(seat, amount, ms = 0) {
    const st = fromSnapshot(snapshot(this.state));
    const p = st.players[seat];
    const acts = [];
    const until = ms ? Date.now() + ms : 0;
    const timeLeft = () => (until ? Math.max(1500, until - Date.now()) : 0);
    const raisable = st.liquidValue(seat);
    if (raisable < amount) {
      await bankruptModal(st, seat, true, amount - p.money, raisable);
      return { acts, bankrupt: true };
    }
    while (p.money < amount) {
      const canRaise = st.propertiesOf(seat).some((id) => st.canSellHouse(seat, id).ok || st.canMortgage(seat, id).ok);
      if (!canRaise) {
        await bankruptModal(st, seat, true, amount - p.money);
        return { acts, bankrupt: true };
      }
      if (until && Date.now() >= until) return { acts, bankrupt: false, timeout: true };
      const choice = await this.shortfallModal(st, seat, amount, timeLeft());
      // Hết giờ: báo về để engine cấn nợ hộ trên ván thật
      if (choice === 'auto') return { acts, bankrupt: false, timeout: true };
      if (choice === 'bankrupt') {
        if (await bankruptModal(st, seat, false)) return { acts, bankrupt: true };
        continue;
      }
      await manageModal(st, seat, (act, id, res) => {
        if (!res?.ok) return;
        acts.push({ act, id });
        audio.sfx('coin');
        this.hud.flashMoney(seat, act === 'sell' || act === 'mortgage');
      }, amount);
    }
    return { acts, bankrupt: false };
  }

  /** Hộp "còn thiếu bao nhiêu" ở máy con nợ; có hạn thì tự đếm ngược. */
  shortfallModal(st, seat, amount, ms = 0) {
    const p = st.players[seat];
    let ticker = 0;
    const pr = openModal({
      eyebrow: 'THIẾU TIỀN',
      title: `Còn thiếu <span class="debt-hot">${money(amount - p.money)}</span>`,
      sub: 'Xoay đủ tiền mặt để trả, hoặc tuyên bố phá sản.',
      body: debtPanelHtml(p.money, amount, raisePlan(st, seat, amount)),
      buttons: [
        { label: 'Bán nhà / Thế chấp', value: 'manage', cls: 'btn-gold' },
        { label: 'Tuyên bố phá sản', value: 'bankrupt', cls: 'btn-danger' },
      ],
      escValue: 'manage',
      timeoutValue: 'auto',
      onMount: (body, close) => {
        if (ms) ticker = attachTimer(body, ms, close, 'auto', 'để xoay tiền. Hết giờ thì ngân hàng cấn nợ hộ.');
      },
    });
    pr.finally(() => clearInterval(ticker));
    return pr;
  }

  // ---------------------------------------------------------------- kỹ năng ngoài lượt

  /**
   * Nút cây kỹ năng ở hàng tiện ích. Tới lượt mình mà đang rảnh tay thì đi
   * đúng đường nút trên thanh hành động (được tẩy điểm). Còn lại chỉ học và
   * lên level, mỗi lần học gửi ngay một action `learn`.
   */
  async openSkillsAnyTime() {
    const st = this.state;
    if (!st || st.over || this.skills.treeOpen) return;
    let seat = this.mySeat;
    if (!this.net && this.isBot(st.turn)) seat = await this.pickHuman();
    const p = st.players[seat];
    if (!p || p.bankrupt) return;
    const menu = this.pending?.list.find((q) => q.kind === 'turn' && q.seat === seat);
    if (menu && !this.localBusy) {
      this.local(() => this.skills.openTree(p));
      return;
    }
    await this.skills.openTree(p, {
      manage: false,
      onLearn: (id) => this.host.send({ type: 'learn', seat, value: { id } }),
    });
  }

  /** Bàn có bot, nhiều người thật: ai học kỹ năng khi bấm nút giữa lượt bot. */
  async pickHuman() {
    const list = this.state.players.filter((p) => !this.isBot(p.id) && !p.bankrupt);
    if (list.length <= 1) return list[0]?.id ?? -1;
    const v = await openModal({
      manual: true,
      eyebrow: 'CÂY KỸ NĂNG',
      title: 'Ai học kỹ năng?',
      buttons: [
        ...list.map((p) => ({ label: p.name, value: p.id, cls: 'btn-gold' })),
        { label: 'Thôi', value: -1, cls: 'btn-ghost' },
      ],
      escValue: -1,
    });
    return typeof v === 'number' ? v : -1;
  }

  /** Số trên nút cây kỹ năng ở hàng tiện ích: điểm chưa tiêu của mình. */
  refreshSkillBtn() {
    const n = this.state?.players[this.mySeat]?.skillPoints ?? 0;
    const tag = this.skillBtn?.querySelector('.skill-btn-n');
    if (!tag) return;
    tag.hidden = !n;
    tag.textContent = n;
    this.skillBtn.classList.toggle('has-pts', n > 0);
  }

  // ---------------------------------------------------------------- Hội Đồng Hồn Ma

  /** Ghế hồn ma bầu được trên máy này. */
  localGhosts(seats) {
    return (seats ?? []).filter((s) => this.mine(s) && this.state.players[s]?.bankrupt);
  }

  openGhostVote({ n, cards, ms, seats }) {
    const mineSeats = this.localGhosts(seats);
    const list = (cards ?? []).map((id) => EVENT_BY_ID[id]).filter(Boolean);
    if (!mineSeats.length || list.length < 2) return;
    this.ghostPanel?.panel.close();
    audio.sfx('turn');
    const votes = this.state.ghostVote?.n === n ? this.state.ghostVote.votes : {};
    const panel = ghostVotePanel({
      state: this.state, cards: list, seats: mineSeats, votes, ms,
      onVote: (seat, id) => this.host.send({ type: 'ghost-vote', seat, value: { n, id } }),
    });
    this.ghostPanel = { n, panel };
    panel.closed.then(() => { if (this.ghostPanel?.panel === panel) this.ghostPanel = null; });
  }

  // ---------------------------------------------------------------- tiện ích

  /**
   * Bấm nút hay gõ phím là dấu hiệu người ấy còn ngồi đó. Bản online gửi một
   * action nhẹ để engine xoá chuỗi "để hết giờ" của ghế mình.
   */
  watchActivity() {
    const seen = (e) => {
      if (!this.net || !this.state) return;
      if (e.type === 'pointerdown' && !(e.target instanceof Element && e.target.closest('button'))) return;
      const now = Date.now();
      if (now - (this.lastSeen ?? 0) < 5000) return;
      this.lastSeen = now;
      this.host?.send({ type: 'seen', seat: this.net.mySeat });
    };
    document.addEventListener('pointerdown', seen, true);
    document.addEventListener('keydown', seen, true);
  }

  /** Đang có hộp thoại nào mở không — tránh chồng hộp thoại lên nhau. */
  modalOpen() { return document.querySelector('#modal-root .scrim') !== null; }

  async showPlayer(playerId) {
    if (this.modalOpen() || !this.state) return;
    const res = await playerModal(this.state, playerId);
    if (res?.openTile != null) {
      await wait(120);
      await tileModal(this.state, res.openTile, this.memeSeat());
    }
  }

  async showTile(tileId) {
    if (this.modalOpen() || !this.state) return;
    await tileModal(this.state, tileId, this.memeSeat());
  }

  // ---------------------------------------------------------------- hạ màn

  /** @param {{player:object, by:string}} win */
  async finish(win) {
    if (this.finishing) return;
    this.finishing = true;
    this.ghostPanel?.panel.close();
    this.clearClock();
    this.hud.clearActions();
    this.scene.clearHighlight();
    this.scene.hideDice();
    if (!this.botSeats().length && !this.net) this.analytics.gameEnd(this.state, win);
    const winner = win.player;
    const why = {
      last: 'là người cuối cùng trụ lại',
      empire: `giữ ${WIN_SETS} bộ màu, ${WIN_HOTEL_SETS} bộ đã phủ kín khách sạn`,
      worth: `gom đủ ${money(WIN_WORTH)} tổng tài sản`,
    }[win.by];
    this.bc.show('HẠ MÀN', `<b>${winner.name}</b> ${why}, <b>thắng ván này!</b>`, { ms: 6000 });
    this.scene.celebrate(5200, winner.token.color);
    this.scene.skeletonBow?.(winner.token.css);
    await wait(1600);
    audio.startMusic('win');
    await this.analytics.flushNow({ keepalive: true, timeoutMs: 500 });
    const again = await winnerModal(this.state, winner);
    if (this.net) {
      await this.net.leave?.();
      window.location.href = `${window.location.origin}${window.location.pathname}`;
      return;
    }
    if (again === 'again') {
      this.finishing = false;
      this.reset();
      this.bc.clear();
      await this.start();
    }
  }

  // ---------------------------------------------------------------- cho bộ kiểm thử

  /**
   * Bộ kiểm thử bản một máy sửa tay ván đang vẽ (`c.state…`) rồi gọi `sync()`:
   * đẩy nguyên ván ấy vào engine, vòng lượt dựng lại từ đầu. Bản online không
   * có đường này — ván nằm trên server.
   */
  sync() {
    if (this.net || !this.host?.force) return;
    this.host.force(snapshot(this.state));
  }

  /** Bày lại thanh nút. Bài kiểm thử vừa sửa tay ván thì đẩy ván ấy vào engine trước. */
  beginTurn() {
    if (this.testSync(null) == null) this.renderAsk();
  }
  restoreActions() { this.beginTurn(); }
  async guard(fn) { return fn(); }

  /**
   * Chạy thẳng một mạch luật trên engine (bản một máy), sau khi đẩy ván đang
   * vẽ vào — bài kiểm thử thường sửa tay vài con số ngay trước đó. Xong khi
   * hàng sự kiện diễn tới cuối mạch ấy.
   */
  debug(path, ...args) {
    return new Promise((resolve) => {
      this.debugWaiters.push({ path, resolve });
      this.host.force(snapshot(this.state));
      this.host.inject(path, args);
    });
  }

  /** Gọi một hàm luật thường trên engine, lấy giá trị trả về. */
  rulesCall(path, ...args) {
    this.host.force(snapshot(this.state));
    const v = this.host.call(path, args);
    // Bài kiểm thử đọc lại ván ngay trong cùng lệnh: chép ván engine sang tại chỗ
    applySnapshot(this.state, snapshot(this.host.engine.st));
    return v;
  }

  /** Dọn sạch trạng thái diễn trước ván mới. */
  reset() {
    this.queue = [];
    this.pending = null;
    this.showing.clear();
    this.sent.clear();
    this.menuQueue = [];
    this.fateAsks.clear();
    this.fateDone = 0;
    this.fateWaiter = null;
    this.fateOpen = null;
    this.holder = null;
    this.home = null;
    dismissTopModal();
  }
}

/* Các mạch luật bộ kiểm thử gọi thẳng như trước (`c.payPlayer(...)`): chạy trên
   engine qua `debug`. */
for (const name of [
  'payPlayer', 'payBank', 'resolveOwnable', 'resolveTile', 'resolveCard', 'executeTrade',
  'doBankrupt', 'goToJail', 'takeRoll', 'endTurn', 'payOutOfJail', 'rollInJail', 'seizeTile',
  'evictPlayer', 'coverDebt', 'useHeldCard', 'declareBankrupt', 'advance', 'autoMove',
  'stallBankrupt', 'rollOff', 'useJailCard', 'sitInJail', 'offerRedeem', 'ensureFunds',
  'cardCollect', 'cardMoney', 'cardGift', 'cardCurse', 'cardRepair', 'cardSkill', 'cardMove',
  'keepCard', 'resumeTile', 'strikeWithPick', 'demolishInGroup', 'resumeRandom', 'askStrikeTile',
  'askDemolishGroup', 'expireMini', 'manageAct', 'skipAbandonedTurn',
]) {
  const rule = function rule(...a) { return this.debug(name, ...a); };
  /* Bài kiểm thử có lúc tạm thay một mạch luật bằng hàm rỗng (`c.takeRoll =
     async () => {}`) rồi trả lại. Mạch thật nằm trong engine, nên thay ở đây
     thì engine cũng chạy mạch rỗng; trả lại hàm cũ thì engine về như thường. */
  Object.defineProperty(Game.prototype, name, {
    configurable: true,
    get() { return this.ruleStubs?.[name] ?? rule; },
    set(fn) {
      this.ruleStubs ??= {};
      const rules = this.host?.engine?.rules;
      if (fn === rule) {
        delete this.ruleStubs[name];
        if (rules) delete rules[name];
      } else {
        this.ruleStubs[name] = fn;
        if (rules) rules[name] = function* stub() {};
      }
    },
  });
}
for (const name of ['checkGameOver', 'receiveFromBank', 'applyRaiseActs', 'demolishHouse', 'iceSlide', 'spendCard']) {
  Game.prototype[name] = function rule(...a) { return this.rulesCall(name, ...a); };
}

export { BOARD, cardOf, cardType };
