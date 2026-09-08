/**
 * Điều phối ván đấu: vòng lượt, xử lý ô đáp xuống, tiền nong, tù tội,
 * giao dịch và kết thúc — nối luật chơi (core/state) với bàn cờ (Phaser)
 * và giao diện (HTML).
 */
import {
  BOARD, money, tileLabel, GO_SALARY, JAIL_FINE, JAIL_TILE, GOTO_JAIL_TILE,
  START_MONEY,
  MAX_JAIL_TURNS,
} from '../data/board.js';
import { GameState, rollDice, orderFromRolls } from '../core/state.js';
import {
  addPressure, eventDue, eventsOn, pressureRatio, threshold, eraOpen, PRESSURE,
} from '../core/events.js';
import {
  cardType, isKeepable, demolishLevels, usableCard, useReason, cardTargets,
  othersOf, shareEach, repairBill, seizePrice, forcedSaleRefund, resumePrice,
} from '../core/cards.js';
import { cardOf, CARD_KINDS } from '../data/cards.js';
import { inventoryModal } from '../ui/inventory.js';
import { EventRunner } from './eventRunner.js';
import { snapshot, fromSnapshot, applySnapshot } from '../core/serialize.js';
import { Hud, Broadcast } from '../ui/hud.js';
import { QuickView } from '../ui/quickview.js';
import {
  diceSvg, tradeSvg, estateSvg, bankruptSvg, doneSvg, coinSvg, cardSvg,
} from '../ui/actionIcons.js';
import { openModal, handoff } from '../ui/modal.js';
import {
  setupModal, buyModal, cardModal, manageModal, tradePickModal,
  tradeBuildModal, tradeReviewModal, redeemPromptModal, bankruptModal,
  winnerModal, describe, playerModal, tileModal, rollOffModal,
} from '../ui/modals.js';
import {
  eventCardModal, bracePromptModal, firePromptModal, auctionBidModal,
} from '../ui/eventModals.js';
import { pickTileOnBoard, litTiles } from '../ui/tilePicker.js';
import { EVENT_BY_ID } from '../data/events.js';
import { audio } from '../audio/audio.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export class Game {
  constructor(scene) {
    this.scene = scene;
    this.bc = new Broadcast();
    this.quick = new QuickView(null);
    // Rê chuột trên bàn cờ → bảng xem nhanh bên cột trái
    this.scene.onTileHover = (id) => this.quick.show(id);
    this.busy = false;
    /** Người thi hành thẻ Thời Cuộc — xem `game/eventRunner.js`. */
    this.events = new EventRunner(this);
    /** Phòng online, hoặc null khi cả bàn ngồi chung một máy. */
    this.net = null;
    /**
     * Mất kết nối bao lâu thì tài sản trả về ngân hàng.
     * Rộng rãi một chút để sụt wifi hay bấm F5 không làm mất cả cơ nghiệp —
     * quay lại kịp trong hạn này là về đúng ghế cũ, đất nhà nguyên vẹn.
     * (Bộ kiểm thử hạ xuống vài giây cho đỡ phải ngồi chờ.)
     */
    this.awayGraceMs = 45000;
    /**
     * Hạn cho một nước đi. Hết giờ mà chưa nhúc nhích thì bị mời khỏi bàn —
     * cùng cách xử như người mất kết nối quá lâu, vì hậu quả y hệt: cả bàn
     * ngồi chờ một người không chơi nữa.
     */
    this.turnMs = 60000;
    /** Hạn để trả lời một đề nghị giao dịch. */
    this.tradeMs = 45000;
    /**
     * Hạn nới cho người đang mở dở một hộp thoại. Rộng hơn hạn lượt vì họ đang
     * thao tác thật (chọn đất để đổi, tính xây nhà), nhưng vẫn phải có đáy:
     * mở hộp thoại rồi bỏ đi cũng treo bàn hệt như ngồi im.
     */
    this.busyMs = 120000;
    /**
     * Đồng hồ đang chạy cho ai, tới lúc nào.
     * @type {?{seat:number,until:number,total:number,label:string}}
     */
    this.clock = null;
    /**
     * Số thứ tự tin đồng hồ máy này đã phát — cùng lý do với `state.rev`.
     *
     * Gieo bằng đồng hồ máy chứ không bằng 0: người bấm F5 rồi vào lại vẫn ngồi
     * đúng ghế ấy, mà đếm lại từ 0 thì mọi tin sau đó đều bị bên kia coi là tin
     * cũ và bỏ hết.
     */
    this.clockN = Date.now();
    /** Ghế phát → số thứ tự tin đồng hồ mới nhất đã nhận của họ. */
    this.clockSeen = new Map();
  }

  // ---------------------------------------------------------------- khởi đầu

  async start() {
    // Nhạc nền chỉ sống ở màn hình chờ; khai cuộc xong là nhường chỗ
    // cho tiếng xí ngầu và tiếng quân cờ.
    audio.startMusic();
    const { names, tokens, settings } = await setupModal();
    audio.stopMusic();
    this.state = new GameState(names, tokens ?? null, settings);
    this.quick.setState(this.state);
    this.hud = new Hud(this.state, (id) => this.showPlayer(id), this.quick);
    this.scene.onTileClick = (id) => this.showTile(id);
    this.scene.setPlayers(this.state.players);
    this.scene.refresh(this.state);
    this.bc.clear();

    await this.bc.show('KHAI CUỘC',
      `Ván cờ bắt đầu — mỗi người ${money(START_MONEY)} vốn liếng. Chúc may mắn!`, { ms: 2600 });
    await this.rollOff();
  }

  // ---------------------------------------------------------------- online

  /**
   * Khai cuộc bản online. Ván đã được phòng dựng sẵn nên mọi máy bắt đầu từ
   * đúng một ảnh chụp — kể cả thứ tự hai bộ thẻ đã xáo.
   *
   * @param {import('../net/room.js').Room} room
   * @param {object} snap ảnh chụp ván đầu
   */
  startOnline(room, snap) {
    audio.stopMusic();
    this.net = room;
    this.state = fromSnapshot(snap);
    this.quick.setState(this.state);
    this.hud = new Hud(this.state, (id) => this.showPlayer(id), this.quick);
    this.scene.onTileClick = (id) => this.showTile(id);
    this.scene.setPlayers(this.state.players);
    this.scene.refresh(this.state);
    this.bc.clear();

    /* Mọi dòng thông báo của người đang cầm lái được phát cho cả bàn cùng đọc,
       nhờ vậy ai cũng theo được diễn biến chứ không chỉ người đang đi. Cờ
       `replaying` chặn việc phát lại thông báo vừa nhận từ người khác. */
    this.bc.onShow = (title, html, o) => {
      if (this.replaying) return;
      if (this.isDriver() || this.announcing) this.net.say(title, html, o);
    };

    room.on.sync = (m) => this.onSync(m.snapshot);
    room.on.ev = (m) => this.onEvent(m.name, m.data);
    room.on.bc = (m) => {
      this.replaying = true;
      this.bc.show(m.title, m.html, m.o);
      this.replaying = false;
    };
    room.on.ask = (name, data) => this.onAsk(name, data);
    room.on.room = () => this.onRoomChange();
    room.on.link = (st) => this.onLink(st);
    // Có người vào lại giữa ván → gửi ngay ván hiện tại cho họ dựng lại bàn cờ
    room.onNeedSync = () => this.sync();

    /* Nhịp canh người vắng mặt. Phải là hẹn giờ chứ không thể chờ tin báo: lúc
       rớt mạng chỉ có đúng một tin, mà hạn ân thì tính bằng chục giây sau đó. */
    clearInterval(this.absentTimer);
    this.absentTimer = setInterval(() => {
      this.checkAbsent();
      this.checkClock();
    }, 2000);

    this.onRoomChange();
    this.bc.show('KHAI CUỘC',
      `Ván bắt đầu với <b>${this.state.players.length} người</b> — mỗi người ${money(START_MONEY)}
       vốn liếng. Chúc may mắn!`, { ms: 2600 });
    this.beginTurn();
  }

  // ------------------------------------------------- lắc giành quyền đi trước

  /**
   * Ai đi trước: mỗi người lắc một lần, cao nhất đi đầu, hoà thì bốc thăm
   * giữa đúng những người hoà.
   *
   * Màn này chạy ở **một máy duy nhất** — bản online là trọng tài (ghế sống
   * nhỏ nhất, lúc khai cuộc chính là chủ phòng) — rồi phát thứ tự chốt được
   * cho cả bàn qua ảnh chụp. Nút "Lắc" thì hiện ở máy của từng người: bấm là
   * việc của họ, còn con xí ngầu vẫn do máy cầm lái gieo, y như mọi nước đi
   * khác, để cả bàn chỉ có một nguồn ngẫu nhiên.
   */
  async rollOff() {
    const st = this.state;
    this.announcing = true;
    try {
      await this.bc.show('GIÀNH QUYỀN ĐI TRƯỚC',
        'Mỗi người lắc một lần — ai cao nhất được đi đầu, hoà nhau thì bốc thăm.',
        { ms: 2800 });

      /* Chỉ người còn trong ván mới lắc. Lúc khai cuộc thì ai cũng còn, nhưng
         trọng tài rớt giữa chừng là màn này chạy lại từ đầu ở máy khác — tới
         lúc ấy có thể đã có người bị gạch tên. */
      const seats = st.players.filter((p) => !p.bankrupt);

      /** @type {Array<{seat:number,sum:number}>} */
      const rolls = [];
      for (const p of seats) {
        await this.askRollOff(p.id, rolls);
        const d = rollDice();
        this.netEmit('dice', d);
        await this.scene.rollDiceAnim(d.a, d.b);
        rolls.push({ seat: p.id, sum: d.sum });
        await this.bc.show('LẮC GIÀNH QUYỀN',
          `<b>${p.name}</b> ra <b>${d.a} + ${d.b} = ${d.sum}</b>.`, { ms: 1900 });
      }

      // Người đã rời bàn xếp cuối, để `order` vẫn là hoán vị đủ mọi ghế
      const order = [
        ...orderFromRolls(rolls),
        ...st.players.filter((p) => p.bankrupt).map((p) => p.id),
      ];
      const sums = new Map(rolls.map((r) => [r.seat, r.sum]));
      const tied = rolls.length > 1 && sums.get(order[0]) === sums.get(order[1]);

      st.setOrder(order);
      this.scene.hideDice();
      this.netEmit('hideDice', {});
      this.hud.refresh();
      this.sync();

      await this.bc.show('THỨ TỰ ĐI',
        `${order.filter((seat) => sums.has(seat)).map((seat, i) => `
           <b style="color:${st.players[seat].token.css}">${i + 1}. ${st.players[seat].name}</b>
           (${sums.get(seat)})`).join(' · ')}
         <br>${tied ? '<i>Hoà điểm đầu bảng — thứ tự giữa những người hoà là bốc thăm.</i>'
          : `<b>${st.players[order[0]].name}</b> đi trước.`}`,
        { ms: 4600 });
    } finally {
      this.announcing = false;
    }
    this.beginTurn();
  }

  /**
   * Mời người ở ghế `seat` bấm lắc.
   *
   * Bản online thì hộp thoại phải hiện ở máy của chính họ. Không trả lời (rớt
   * mạng, bỏ đi lúc khai cuộc) thì quá hạn bàn lắc hộ — thà bốc thăm giúp còn
   * hơn treo cả bàn từ trước khi ván kịp bắt đầu.
   */
  async askRollOff(seat, rolls) {
    const st = this.state;
    if (!this.net || seat === this.net.mySeat) {
      if (this.net) audio.sfx('turn');
      await rollOffModal(st, seat, rolls, this.net ? this.tradeMs : 0);
      return;
    }
    await this.bc.show('CHỜ LẮC',
      `Đang chờ <b>${st.players[seat].name}</b> lắc xí ngầu…`, { ms: 2000 });
    await this.net.ask(seat, 'rolloff', { seat, rolls },
      { fallback: true, timeout: this.tradeMs + 8000 });
  }

  /** Thanh nút của người đang ngồi chờ cả bàn bốc thăm quyền đi trước. */
  showRollOffWaiting() {
    this.hud.setActions([{
      label: 'Đang giành quyền đi trước',
      cls: 'btn-ghost',
      disabled: true,
      hint: 'chờ mọi người lắc xí ngầu',
    }]);
  }

  /**
   * Vào màn bốc thăm quyền đi trước.
   *
   * Đúng một máy chạy màn này. Trọng tài rớt giữa chừng thì ghế kế tiếp lên
   * thay và bốc lại từ đầu — thà lắc lại một vòng còn hơn ván đứng im mãi ở
   * cửa khai cuộc.
   */
  beginRollOff() {
    this.hud.refresh();
    if (this.net.isArbiter) { this.guard(() => this.rollOff()); return; }
    this.showRollOffWaiting();
  }

  /**
   * Máy này có đang cầm lái ván không.
   *
   * Bình thường người cầm lái là người tới lượt — luật chạy ở đúng một chỗ nên
   * không có chuyện hai máy ra hai kết quả. Nếu người tới lượt đã rời bàn thì
   * không ai gỡ được lượt ấy, ván đứng im; lúc đó **trọng tài cầm thay** để bỏ
   * qua lượt. Trọng tài là ghế sống nhỏ nhất — một luật, không phải một chức vụ,
   * nên mọi máy tự tính ra cùng một người mà không cần bầu bán.
   */
  isDriver() {
    if (!this.net) return true;          // một máy: lúc nào cũng là mình
    if (!this.state) return false;
    const seat = this.state.turn;
    if (seat === this.net.mySeat) return true;
    const abandoned = this.state.players[seat]?.bankrupt || !this.net.isSeatLive(seat);
    return abandoned && this.net.isArbiter;
  }

  /** Ghế của mình trong ván (−1 khi chơi một máy). */
  get mySeat() { return this.net ? this.net.mySeat : -1; }

  /**
   * Phát ảnh chụp trạng thái cho cả phòng.
   * Chỉ người đang cầm lái chạy tới được các chỗ gọi hàm này, nên không cần
   * kiểm tra lại quyền ở đây.
   *
   * Mỗi lần phát nhích `state.rev` lên một nấc. Con số ấy đi kèm ảnh chụp và là
   * cơ sở để người nhận bỏ ảnh về trễ — xem `onSync`.
   */
  sync() {
    if (!this.net) return;
    this.state.rev = (this.state.rev ?? 0) + 1;
    this.net.publishSync(snapshot(this.state));
  }

  /** Báo một việc cần diễn hoạt cho các máy đang ngồi xem. */
  netEmit(name, data) {
    if (this.net) this.net.emit(name, data);
  }

  /**
   * Nhận ảnh chụp từ người đang cầm lái — ảnh chụp **mới nhất** là lời cuối.
   *
   * "Mới nhất" phải xét theo `rev` chứ không theo lúc tin tới nơi: đường truyền
   * không hứa giữ đúng thứ tự, mà một phiên đấu giá phát liên tiếp bảy tám ảnh,
   * hai ảnh cuối (kết thúc sự kiện, rồi trao lượt) cách nhau chưa tới một mili
   * giây. Nhận ngược thứ tự thì ảnh cũ ghi đè lượt vừa trao: máy ấy tưởng lượt
   * vẫn của người trước, người tới lượt thật thì không còn nút nào để bấm, mà
   * bàn cờ chỉ hiện người kia đang thao tác.
   */
  onSync(snap) {
    if (!this.state) return;
    if (snap.rev != null && this.state.rev != null && snap.rev <= this.state.rev) return;
    applySnapshot(this.state, snap);
    this.hud.refresh();
    this.scene.refresh(this.state);
    this.scene.placeTokens();
    // Đang giữa một hộp thoại của chính mình thì để yên, xong việc sẽ tự bày lại
    if (!this.busy) this.beginTurn();
  }

  /** Diễn lại hoạt cảnh của người đang đi, cho bàn bên này cũng thấy động. */
  async onEvent(name, data) {
    // Đồng hồ không phải hoạt cảnh — vào trước, khỏi xếp hàng sau tiếng xí ngầu
    if (name === 'clock') { if (!this.staleClock(data)) this.applyClock(data); return; }
    const sc = this.scene;
    if (name === 'dice') {
      await sc.rollDiceAnim(data.a, data.b);
    } else if (name === 'move') {
      sc.clearHighlight();
      await sc.moveToken(data.seat, data.from, data.steps);
    } else if (name === 'jail') {
      audio.sfx('jail');
      sc.shake(0.007, 340);
      await sc.jumpToken(data.seat, JAIL_TILE);
    } else if (name === 'hideDice') {
      sc.hideDice();
      sc.clearHighlight();
    } else if (name === 'spin') {
      // Bốc thăm giải toả: máy nào cũng quay đúng vòng ấy, dừng đúng ô ấy
      await sc.spinTiles(data.ids, data.tileId);
    } else if (name === 'quake') {
      audio.sfx('shake');
      sc.shake(0.012, 700);
    } else if (name === 'eventcard') {
      /* Thẻ Thời Cuộc là chuyện của cả bàn, nên máy nào cũng phải thấy mặt thẻ.
         Máy ngồi xem không có gì để bấm — hộp tự đóng sau mấy giây. */
      const card = EVENT_BY_ID[data.id];
      if (card) {
        audio.sfx('card');
        await eventCardModal(card, data.detail, { ms: 5200 });
      }
    }
  }

  /**
   * Có người hỏi và đang chờ mình trả lời. Hiện chỉ dùng cho giao dịch: bên
   * kia dựng đề nghị trên máy họ, còn người bấm đồng ý phải là mình.
   */
  async onAsk(name, data) {
    // Câu nào cũng là một lần "tới lượt mình" — gọi họ về màn hình cho kịp trả lời
    if (name === 'trade-review') {
      audio.sfx('turn');
      /* Trả nguyên giá trị chứ không ép về true/false: `'timeout'` cho bên hỏi
         biết đây là bỏ bàn, không phải một câu từ chối. */
      return tradeReviewModal(this.state, data.offer, this.tradeMs);
    }
    if (name === 'rolloff') {
      audio.sfx('turn');
      return rollOffModal(this.state, this.net.mySeat, data.rolls ?? [], this.tradeMs);
    }
    /* Đất thế chấp vừa về tay mình: tiền chuộc lấy từ túi mình nên câu trả lời
       cũng phải là của mình, dù giao dịch do người kia dựng. */
    if (name === 'redeem') {
      audio.sfx('turn');
      return litTiles(this.scene, data.ids,
        () => redeemPromptModal(this.state, this.net.mySeat, data.ids, this.tradeMs));
    }

    /* Bốn câu hỏi của thẻ Thời Cuộc. Hộp nào cũng đếm ngược và có sẵn câu trả
       lời lúc hết giờ, vì sự kiện hỏi cả bàn cùng lúc — một người ngồi ngẩn ra
       là bốn người kia phải chờ. */
    const ms = this.events.askMs;
    if (name === 'ev-brace') {
      audio.sfx('turn');
      return litTiles(this.scene, data.lots.map((l) => l.id),
        () => bracePromptModal(this.state, this.net.mySeat, data.lots, ms));
    }
    if (name === 'ev-fire') {
      audio.sfx('turn');
      return litTiles(this.scene, [data.plan.tileId],
        () => firePromptModal(this.state, this.net.mySeat, data.plan, ms));
    }
    if (name === 'ev-pick') {
      audio.sfx('turn');
      return this.pickTile(data.ids, data.text, ms);
    }
    if (name === 'ev-bid') {
      audio.sfx('turn');
      return litTiles(this.scene, [data.tileId],
        () => auctionBidModal(this.state, this.net.mySeat, data.tileId,
          { reason: data.reason, ms }));
    }
    return null;
  }

  /**
   * Đường truyền của **máy mình** đứt hoặc nối lại.
   *
   * Đứt thì cất thanh nút đi. Máy này vẫn chạy luật được, nhưng ảnh chụp phát
   * ra không tới được ai; và lúc nối lại, bàn sẽ gửi về ảnh chụp của nó rồi đè
   * lên — nước vừa đi coi như chưa từng có. Thà không cho bấm còn hơn cho bấm
   * rồi nuốt mất.
   *
   * Nối lại thì `Room` đã gửi `hello` xin ván mới; trong lúc chờ ảnh chụp về,
   * bày lại thanh nút theo trạng thái đang có — ván có thể chưa nhúc nhích
   * chút nào trong lúc mình vắng, và như thế thì chẳng có ảnh chụp nào tới cả.
   */
  onLink(status) {
    if (!this.net || !this.state) return;
    const lost = status === 'lost';
    this.hud.setLinkLost(lost);

    /* Quên đồng hồ cũ đi — cả lúc đứt lẫn lúc nối lại.
     *
     * Nó vẫn chạy suốt quãng mình không nghe thấy gì, nên tới lúc thông trở lại
     * thì kim đã cạn từ đời nào, trong khi bàn kia có thể đã gia hạn mấy lượt.
     * Không quên đi thì máy vừa nối lại sẽ lập tức đòi gạch tên người đang đi —
     * đứt mạng của mình mà người khác chịu phạt. Người cầm lái lên dây lại ngay
     * ở `beginTurn` bên dưới. */
    this.applyClock(null);

    if (lost) { this.hud.clearActions(); return; }
    if (!this.busy) this.beginTurn();
  }

  // ------------------------------------------------------------- đồng hồ lượt

  /**
   * Đặt đồng hồ cho một ghế rồi báo cho cả bàn.
   *
   * Gửi đi **khoảng còn lại**, không gửi mốc hết hạn: đồng hồ máy mỗi người
   * lệch nhau vài giây là chuyện thường, mà chừng ấy đủ để một máy tưởng đã
   * hết giờ trong khi máy kia còn thấy nửa phút.
   *
   * Chỉ người đang cầm lái mới gọi tới đây — cũng như `sync()`, ván chỉ có một
   * nguồn phát để hai máy khỏi ra hai con số.
   */
  armClock(seat, ms, label) {
    if (!this.net) return;
    /* Vẫn đúng người ấy, vẫn đúng việc ấy thì để đồng hồ chạy tiếp. `beginTurn`
       bị gọi lại mỗi lần sổ ghế nhúc nhích, mà lần nào cũng vặn lại kim thì
       người ngồi im chỉ cần ai đó vào ra phòng là được tha. */
    if (this.clock && this.clock.seat === seat && this.clock.label === label) return;
    this.applyClock({ seat, ms, label });
    this.netEmit('clock', { seat, ms, label, from: this.mySeat, n: ++this.clockN });
  }

  /** Cất đồng hồ đi trên mọi máy — hết ván, hoặc không còn ai phải chờ. */
  clearClock() {
    if (!this.net || !this.clock) return;
    this.applyClock(null);
    // `seat: -1` cũng là "cất đi" như `null`, nhưng còn chỗ mang số thứ tự
    this.netEmit('clock', { seat: -1, from: this.mySeat, n: ++this.clockN });
  }

  /**
   * Tin đồng hồ này có phải tin cũ về trễ không.
   *
   * Cùng một nỗi với ảnh chụp (xem `onSync`): người cầm lái bắn liền mấy tin
   * đồng hồ trong một nhịp (vào việc → thời cuộc → trao lượt), nhận ngược thứ
   * tự thì cả bàn đứng ở nhãn cũ, đếm ngược cho người đã đi xong.
   */
  staleClock(c) {
    // Bản cũ không đánh số — thà nhận thừa còn hơn bỏ mất đồng hồ
    if (!c || c.n == null || c.from == null) return false;
    const last = this.clockSeen.get(c.from);
    if (last != null && c.n <= last) return true;
    this.clockSeen.set(c.from, c.n);
    return false;
  }

  /** Nhận đồng hồ (tự đặt hoặc do người cầm lái gửi sang) rồi vẽ vòng cung. */
  applyClock(c) {
    if (!c || !(c.seat >= 0)) {
      this.clock = null;
      this.hud?.setClock(null);
      return;
    }
    const p = this.state?.players[c.seat];
    if (!p || p.bankrupt) { this.clock = null; this.hud?.setClock(null); return; }
    this.clock = {
      seat: c.seat, until: Date.now() + c.ms, total: c.ms, label: c.label ?? '',
    };
    this.hud?.setClock({ ...this.clock, name: p.name, css: p.token.css });
  }

  /**
   * Hết giờ mà người ấy vẫn chưa quyết → mời khỏi bàn.
   *
   * Người ra tay là **ghế sống nhỏ nhất không phải kẻ hết giờ**, chứ không phải
   * trọng tài như mọi việc chung khác. Vì trọng tài thường chính là ghế nhỏ
   * nhất, mà kẻ đang treo bàn rất có thể là họ — trông vào máy ấy thì chẳng bao
   * giờ có ai bấm cả.
   */
  checkClock() {
    const c = this.clock;
    if (!this.net || !this.state || this.state.over || !c) return;
    /* Đường truyền mình đang đứt: đếm ngược ở đây đã chạy suốt lúc mất tin, mà
       bàn kia có thể đã gia hạn từ đời nào. Cùng lý do với `checkAbsent`. */
    if (this.net.linkLost || this.busy) return;
    /* Đồng hồ giao dịch không xử ở đây: người gửi đề nghị đang đứng chờ ngay
       đó, họ nhận được lời "hết giờ" rồi tự gạch tên — xem `trade()`. Để cả
       hai đường cùng ra tay là hai lần tịch thu cho một lỗi. */
    if (c.seat !== this.state.turn) return;
    if (Date.now() < c.until) return;
    if (this.judgeSeat(c.seat) !== this.net.mySeat) return;

    const p = this.state.players[c.seat];
    if (!p || p.bankrupt) return;
    this.guard(() => this.evictPlayer(c.seat, 'stall'));
  }

  /** Ghế còn nối mạng nhỏ nhất, bỏ qua `skip` — xem `checkClock`. */
  judgeSeat(skip) {
    return this.net.seats.findIndex((s, i) => i !== skip && this.net.isSeatLive(i));
  }

  /** Sổ ghế đổi (ai đó rớt mạng hay vào lại) — cập nhật danh sách bên cột trái. */
  onRoomChange() {
    if (!this.net || !this.state) return;
    this.hud.setSeatStatus(this.net.seats.map((s, i) => (
      this.state.players[i]?.bankrupt ? 'out' : (s.online ? 'live' : 'away')
    )));
    // Người tới lượt vừa rớt hay vừa quay lại thì quyền cầm lái đổi theo
    if (!this.busy) this.beginTurn();
  }

  /**
   * Ai vắng mặt quá lâu thì tài sản trả về ngân hàng.
   *
   * Không cần ai ra lệnh — đây là **luật**, máy nào cũng tính ra cùng kết quả.
   * Nhưng chỉ để **trọng tài** ra tay rồi phát ảnh chụp, nếu không mấy máy cùng
   * làm một việc sẽ báo trùng và đẩy lượt hai lần.
   */
  checkAbsent() {
    if (!this.net || !this.state || this.state.over) return;
    if (!this.net.isArbiter || this.busy) return;
    /* Đường truyền của mình đang đứt: danh sách người có mặt đóng băng ở lúc
       trước khi đứt, nên "ai vắng mặt" tính ra từ đó là vô nghĩa. Và bàn kia đã
       cử trọng tài khác rồi — hai người cùng tịch thu là tịch thu hai lần. */
    if (this.net.linkLost) return;
    const seat = this.net.seats.findIndex((s, i) => (
      !s.kicked
      && this.state.players[i] && !this.state.players[i].bankrupt
      && this.net.awayFor(i) > this.awayGraceMs
    ));
    if (seat >= 0) this.guard(() => this.evictPlayer(seat));
  }

  /**
   * Người rời bàn: tài sản trả hết về ngân hàng, ai cũng mua lại được.
   *
   * Hai đường dẫn tới đây — mất kết nối quá lâu, và ngồi im hết giờ. Hậu quả
   * với cả bàn giống hệt nhau nên xử như nhau, chỉ khác lời báo.
   *
   * @param {number} seat
   * @param {'away'|'stall'} [why]
   */
  async evictPlayer(seat, why = 'away') {
    const st = this.state;
    const p = st.players[seat];
    if (!p || p.bankrupt) return;
    const props = st.propertiesOf(seat).length;

    audio.sfx('bankrupt');
    st.bankrupt(seat);
    this.clearClock();
    this.hud.refresh();
    this.scene.refresh(st);
    this.scene.placeTokens();

    // Người ra tay có thể đang không tới lượt, nhưng lời báo này cả bàn phải nghe.
    this.announcing = true;
    await this.bc.show(why === 'stall' ? 'HẾT GIỜ' : 'RỜI BÀN',
      why === 'stall'
        ? `<b>${p.name}</b> hết giờ mà chưa đi — ${props} ô đất cùng toàn bộ nhà cửa
           trả về <b>ngân hàng</b>, ghế bỏ trống.`
        : `<b>${p.name}</b> mất kết nối quá lâu — ${props} ô đất cùng toàn bộ nhà cửa
           trả về <b>ngân hàng</b>, ai cũng mua lại được.`,
      { kind: 'bad', ms: 5000 });
    this.announcing = false;

    this.sync();
    await this.scene.bankruptFx(seat);

    // Còn đúng một người trụ lại thì hạ màn ngay, đừng bắt họ đi thêm một lượt
    // vô nghĩa rồi mới báo thắng.
    if (this.checkGameOver()) { this.sync(); return; }
    if (st.turn === seat) await this.endTurn();
    else this.beginTurn();
  }

  /**
   * Lượt của người đang mất kết nối — bỏ qua để ván khỏi đứng.
   *
   * Chỉ bỏ lượt chứ không chơi hộ: tài sản của họ vẫn nguyên, quay lại kịp
   * trong hạn ân là đi tiếp bình thường.
   */
  async skipAbandonedTurn() {
    const p = this.state.current;
    this.hud.clearActions();
    // Người này đã không ngồi máy thì đếm ngược cho họ chẳng để làm gì;
    // quá hạn vắng mặt đã có `checkAbsent` lo.
    this.clearClock();
    await this.bc.show('BỎ QUA LƯỢT',
      `<b>${p.name}</b> đang mất kết nối — bỏ qua lượt này, tài sản vẫn giữ nguyên.`,
      { ms: 2600 });
    await wait(900);
    if (this.isDriver() && this.state.turn === p.id) await this.endTurn();
  }

  // ------------------------------------------------------------------ lượt

  beginTurn() {
    const st = this.state;
    if (st.over) return;
    /* Mất kết nối thì không bày nút: mọi nước đi lúc này đều sẽ bị ảnh chụp của
       bàn đè lên khi nối lại. `onLink` bày lại giúp khi đường truyền thông. */
    if (this.net?.linkLost) { this.hud.clearActions(); return; }
    /* Chưa bốc thăm xong thì chưa có lượt của ai. Cửa này chặn mọi đường vòng
       tới `beginTurn` (sổ ghế đổi, nối lại mạng) trong lúc cả bàn còn đang lắc. */
    if (this.net && !st.order) { this.beginRollOff(); return; }
    const p = st.current;

    /* Tới lượt mình thì reo một tiếng chuông: chơi online người ta hay ngó sang
       cửa sổ khác trong lúc chờ, phải có cái kéo họ về. `beginTurn` chạy lại
       sau mỗi ảnh chụp nên nhớ ghế đã reo, kẻo reo mãi một lượt. */
    if (this.net && st.turn !== this.bellSeat) {
      this.bellSeat = st.turn;
      if (st.turn === this.net.mySeat && !p.bankrupt) audio.sfx('turn');
    }

    // Bản online: ván chỉ nhúc nhích dưới tay người cầm lái; những máy còn lại
    // vẽ theo ảnh chụp và ngồi xem.
    if (this.net && !this.isDriver()) {
      this.hud.refresh();
      this.scene.highlightTile(p.pos, p.token.color);
      this.showWaiting();
      return;
    }

    /* Cầm lái lượt của người khác nghĩa là người ấy đã rớt mạng — bỏ qua lượt,
       tuyệt đối không chơi hộ họ. */
    if (this.net && !p.bankrupt && p.id !== this.net.mySeat) {
      this.guard(() => this.skipAbandonedTurn());
      return;
    }

    if (p.bankrupt) { this.endTurn(); return; }

    p.doubles = 0;
    this.hud.refresh();
    this.scene.highlightTile(p.pos, p.token.color);
    this.setTurnActions();
  }

  /** Thanh nút của người đang ngồi xem — nói rõ đang chờ ai. */
  showWaiting() {
    const p = this.state.current;
    const off = !this.net.isSeatLive(this.state.turn);
    this.hud.setActions([{
      label: `Tới lượt ${p.name}`,
      cls: 'btn-ghost',
      disabled: true,
      hint: off ? 'người này đang mất kết nối' : 'chờ họ đi xong',
    }]);
  }

  /** Thanh nút cho người đang tới lượt. */
  setTurnActions(rolled = false) {
    const st = this.state;
    const p = st.current;
    this.lastRolled = rolled;

    /* Thanh nút bày ra lại nghĩa là người này vừa làm xong một việc — cho họ
       trọn hạn mới. Nhờ đặt ở đây mà lắc xong, đóng hộp thoại xong, đổi lượt…
       đều được tính là còn sống, không phải rắc lời gọi khắp nơi. */
    if (this.net) this.armClock(p.id, this.turnMs, rolled ? 'kết thúc lượt' : 'lượt đi');

    // Hai nút phụ giống nhau ở mọi tình huống — giữ nguyên thứ tự cho quen tay
    const trade = {
      label: 'Giao dịch', key: 't', cls: 'btn-jade', icon: tradeSvg(),
      hint: 'đổi đất · tiền', title: 'Mời người khác đổi đất hoặc tiền',
      onClick: () => this.guard(() => this.trade()),
    };
    const manage = {
      label: 'Quản lý tài sản', key: 'q', cls: 'btn-ghost', icon: estateSvg(),
      hint: 'xây · thế chấp', title: 'Xây nhà, bán nhà, thế chấp hoặc chuộc đất',
      onClick: () => this.guard(() => this.manage()),
    };
    const bankrupt = {
      label: 'Phá sản', key: 'p', cls: 'btn-danger', icon: bankruptSvg(),
      hint: 'bỏ cuộc, giao hết tài sản', title: 'Tuyên bố phá sản và rời ván',
      onClick: () => this.guard(() => this.declareBankrupt()),
    };

    // Túi thẻ chỉ bày ra khi trong túi có gì — bàn cờ đã đủ nút rồi
    const bag = p.cards.length ? [{
      label: `Túi thẻ · ${p.cards.length}`, key: 'b', cls: 'btn-ghost', icon: cardSvg(),
      hint: 'thẻ giữ để dùng sau', title: 'Xem và dùng thẻ Cơ Hội / Khí Vận đang giữ',
      onClick: () => this.guard(() => this.openBag()),
    }] : [];

    if (p.inJail) {
      const ticket = st.jailCardAt(p.id);
      this.hud.setActions([
        // Có vé thì bày trước tiên — ra tù miễn phí thì chẳng ai muốn nộp tiền
        ...(ticket >= 0 ? [{
          label: 'Dùng vé ra tù', key: 'v', cls: 'btn-jade', icon: coinSvg(), pulse: true,
          title: 'Chìa tờ giấy bãi nại — được thả ngay, miễn phí',
          onClick: () => this.guard(() => this.useJailCard()),
        }] : []),
        { label: `Nộp ${money(JAIL_FINE)} ra tù`, key: 'n', cls: 'btn-gold', icon: coinSvg(),
          disabled: p.money < JAIL_FINE, onClick: () => this.guard(() => this.payOutOfJail()) },
        { label: 'Lắc xí ngầu (cầu đôi)', key: 'r', cls: 'btn-primary', pulse: true,
          icon: diceSvg(), title: 'Ra đôi thì được thả ngay',
          onClick: () => this.guard(() => this.rollInJail()) },
        ...bag, trade, manage, bankrupt,
      ]);
      return;
    }

    this.hud.setActions([
      rolled
        ? { label: 'Kết thúc lượt', key: 'e', cls: 'btn-primary', pulse: true, icon: doneSvg(),
            onClick: () => this.guard(() => this.endTurn()) }
        : { label: 'Lắc xí ngầu', key: 'r', cls: 'btn-primary', pulse: true, icon: diceSvg(),
            onClick: () => this.guard(() => this.takeRoll()) },
      ...bag, trade, manage, bankrupt,
    ]);
  }

  /** Chặn bấm nút chồng chéo khi đang chạy hiệu ứng. */
  async guard(fn) {
    if (this.busy) return;
    this.busy = true;
    this.hud.clearActions();
    /* Hộp thoại của chính mình vừa mở: nới hạn ra `busyMs`. Chỉ xét lượt của
       mình — trọng tài chạy `guard` để gạch tên người khác thì không việc gì
       phải gia hạn cho người sắp bị gạch. */
    if (this.net && !this.state.over && this.state.turn === this.net.mySeat) {
      this.armClock(this.state.turn, this.busyMs, 'đang thao tác');
    }
    try { await fn(); } finally { this.busy = false; }
  }

  /**
   * Kết thúc lượt — và đây cũng là chỗ **thẻ Thời Cuộc nổ**.
   *
   * Nổ ở cuối lượt chứ không giữa chừng, và nổ **trước** khi trao lượt cho
   * người kế: lúc này máy mình vẫn là máy cầm lái hợp lệ, chạy xong mới phát
   * ảnh chụp. Trao lượt trước rồi mới chạy sự kiện thì có hai máy cùng tưởng
   * mình đang cầm lái.
   */
  async endTurn() {
    const st = this.state;
    this.scene.hideDice();
    this.scene.clearHighlight();
    this.netEmit('hideDice', {});
    if (this.checkGameOver()) { this.sync(); return; }

    /* Lượt vừa qua không có đồng nào đổi chủ — đúng triệu chứng bàn bí mà bộ
       thẻ Thời Cuộc sinh ra để phá, nên nó đẩy thanh áp lực nhanh hơn cả. */
    if (st.dryTurn) addPressure(st, PRESSURE.dryTurn);

    if (eventDue(st)) {
      await this.events.run();
      if (this.checkGameOver()) { this.sync(); return; }
    }

    st.nextTurn();
    // Phát trước khi tự bày lại bàn: từ giây này quyền cầm lái đã sang người
    // khác, gọi `sync()` sau `beginTurn()` thì không còn ai để phát.
    this.sync();
    this.beginTurn();
  }

  // ------------------------------------------------------------- lắc xí ngầu

  async takeRoll() {
    const st = this.state;
    const p = st.current;
    const d = rollDice();
    this.netEmit('dice', d);
    await this.scene.rollDiceAnim(d.a, d.b);

    // Đổ đôi lần thứ 3 → vào tù ngay
    if (d.isDouble) {
      p.doubles += 1;
      if (p.doubles >= 3) {
        await this.bc.show('ĐỔ ĐÔI LẦN THỨ BA',
          `<b>${p.name}</b> đổ đôi ba lần liên tiếp — mời về <b>Khám Lớn</b>!`, { kind: 'bad' });
        await this.goToJail(p);
        await this.endTurn();
        return;
      }
      await this.bc.show('ĐỔ ĐÔI',
        `<b>${p.name}</b> ra đôi ${d.a} — được đi thêm một lượt nữa.`, { ms: 2200 });
    }

    await this.advance(p, d.sum, d);

    // Vào tù thì hết lượt ngay, kể cả khi vừa đổ đôi.
    if (st.over || p.bankrupt || p.inJail) { await this.endTurn(); return; }

    if (d.isDouble) {
      this.hud.refresh();
      this.setTurnActions(false);   // lắc tiếp
    } else {
      this.setTurnActions(true);    // chỉ còn kết thúc lượt
    }
  }

  /** Đi `steps` ô, cộng lương nếu đi ngang BẮT ĐẦU, rồi xử lý ô đáp xuống. */
  async advance(p, steps, dice) {
    const st = this.state;
    const idx = p.id;
    const from = p.pos;
    let passedGo = false;

    this.scene.clearHighlight();
    this.netEmit('move', { seat: idx, from, steps });
    await this.scene.moveToken(idx, from, steps, (pos) => {
      if (pos === 0) passedGo = true;
    });
    p.pos = (from + steps) % 40;
    this.hud.refresh();
    this.sync();

    if (passedGo) {
      /* Lương có thể đang bị thẻ "mất mùa" cắt còn một nửa — hỏi luật chứ đừng
         lấy thẳng hằng số. Và mỗi vòng qua đây là một nấc của thanh Thời Cuộc. */
      const pay = st.salary();
      st.laps += 1;
      addPressure(st, PRESSURE.lap);
      await this.bc.show('QUA Ô BẮT ĐẦU',
        pay === GO_SALARY
          ? `<b>${p.name}</b> lãnh lương <span class="up">${money(pay)}</span> từ ngân hàng.`
          : `<b>${p.name}</b> lãnh lương <span class="up">${money(pay)}</span> —
             mất mùa nên chỉ còn bấy nhiêu.`,
        { ms: 2400 });
      await this.receiveFromBank(idx, pay);
    }

    this.scene.highlightTile(p.pos, p.token.color);
    await this.resolveTile(p, dice);
  }

  // ------------------------------------------------------ xử lý ô đáp xuống

  async resolveTile(p, dice) {
    const st = this.state;
    const t = BOARD[p.pos];

    switch (t.type) {
      case 'property':
      case 'station':
      case 'utility':
        await this.resolveOwnable(p, t, dice);
        break;

      case 'chance':
      case 'chest':
        await this.resolveCard(p, t.type);
        break;

      case 'tax':
        await this.bc.show(t.name.split(' (')[0].toUpperCase(),
          `<b>${p.name}</b> phải nộp <span class="down">${money(t.tax_amount)}</span> cho ngân hàng.`,
          { kind: 'bad' });
        await this.payBank(p.id, t.tax_amount);
        break;

      case 'corner':
        if (t.id === GOTO_JAIL_TILE) {
          await this.bc.show('VÀO TÙ',
            `<b>${p.name}</b> bị giải về <b>Khám Lớn Sài Gòn</b>.`, { kind: 'bad' });
          await this.goToJail(p);
        } else if (t.id === JAIL_TILE) {
          await this.bc.show('GHÉ THĂM', `<b>${p.name}</b> chỉ ghé ngang Khám Lớn — vô sự.`, { ms: 2000 });
        } else if (t.id === 20) {
          // Quỹ Công chỉ có khi bật thẻ Thời Cuộc; không thì đây vẫn là ô nghỉ chân
          if (st.pot > 0) {
            const won = st.pot;
            st.pot = 0;
            await this.bc.show('QUỸ CÔNG',
              `<b>${p.name}</b> ghé Bến Đậu đúng lúc — ẵm trọn Quỹ Công
               <span class="up">${money(won)}</span>.`, { ms: 3600 });
            await this.receiveFromBank(p.id, won);
          } else {
            await this.bc.show('BẾN ĐẬU', `<b>${p.name}</b> nghỉ chân miễn phí.`, { ms: 2000 });
          }
        }
        break;
    }
  }

  /** Ô có thể sở hữu: mua, trả tiền thuê, hoặc không có gì xảy ra. */
  async resolveOwnable(p, t, dice) {
    const st = this.state;
    const ownerId = st.owner.get(t.id);

    // Chưa ai sở hữu → hỏi mua (không có luật đấu giá)
    if (ownerId === undefined) {
      if (p.money < t.price) {
        await this.bc.show('KHÔNG ĐỦ TIỀN',
          `<b>${p.name}</b> dừng ở <b>${tileLabel(t.id)}</b> nhưng chỉ có ${money(p.money)}.`, { ms: 2600 });
        return;
      }
      const choice = await buyModal(t.id, p);
      if (choice === 'buy') {
        audio.sfx('buy');
        st.buy(p.id, t.id);
        this.hud.refresh();
        this.sync();
        this.hud.flashMoney(p.id, false);
        await this.scene.flyMoney(this.hud.cardEl(p.id), this.hud.bankEl(), t.price,
          { text: `−${money(t.price)}`, color: '#FF8A7A' });
        this.scene.refresh(st);
        await this.bc.show('TẬU ĐẤT',
          `<b>${p.name}</b> mua <b>${tileLabel(t.id)}</b> giá <span class="down">${money(t.price)}</span>.`);
      } else {
        await this.bc.show('BỎ QUA', `<b>${p.name}</b> không mua <b>${tileLabel(t.id)}</b>.`, { ms: 2200 });
      }
      return;
    }

    // Đất của chính mình
    if (ownerId === p.id) {
      await this.bc.show('ĐẤT NHÀ', `<b>${p.name}</b> về thăm đất của mình.`, { ms: 1900 });
      return;
    }

    // Đất đang thế chấp → miễn tiền thuê
    if (st.isMortgaged(t.id)) {
      await this.bc.show('ĐANG THẾ CHẤP',
        `<b>${tileLabel(t.id)}</b> đang cầm cố ở ngân hàng — miễn tiền thuê.`, { ms: 2600 });
      return;
    }

    const owner = st.players[ownerId];
    const rent = st.rentFor(t.id, dice?.sum ?? 7);
    await this.bc.show('TRẢ TIỀN THUÊ',
      `<b>${p.name}</b> trả <span class="down">${money(rent)}</span> cho <b>${owner.name}</b>
       tại <b>${tileLabel(t.id)}</b>.`, { kind: 'bad' });
    await this.payPlayer(p.id, ownerId, rent);
  }

  /**
   * Rút thẻ Cơ Hội / Khí Vận.
   *
   * Hai ngả: thẻ **nổ ngay** (tiền nong, thuế nhà) xử luôn tại chỗ, thẻ **giữ
   * được** thì cất vào túi chờ đúng lúc. Bộ bài bỏ qua những lá nổ ngay mà lúc
   * này vô nghĩa (thuế nhà khi chưa cất căn nào) — xem `core/cards.js`.
   */
  async resolveCard(p, kind) {
    const st = this.state;
    const drawn = st.decks[kind].draw((c) => usableCard(st, c, p.id));
    // Cả bộ không lá nào dùng được: coi như ghé qua, đừng bày một tấm thẻ rỗng
    if (!drawn) return;

    audio.sfx('card');
    const title = kind === 'chance' ? 'CƠ HỘI' : 'KHÍ VẬN';
    if (isKeepable(drawn.card)) return this.keepCard(p, kind, drawn, title);
    switch (cardType(drawn.card)) {
      case 'collect': return this.cardCollect(p, kind, drawn.card, title);
      case 'repair':  return this.cardRepair(p, kind, drawn.card, title);
      default:        return this.cardMoney(p, kind, drawn.card, title);
    }
  }

  /** Thẻ cũ: cộng hoặc trừ tiền với ngân hàng. */
  async cardMoney(p, kind, card, title) {
    await cardModal(kind, card, { amount: card.amount });
    if (card.amount > 0) {
      await this.bc.show(title,
        `<b>${p.name}</b>: ${card.text} <span class="up">+${money(card.amount)}</span>`);
      await this.receiveFromBank(p.id, card.amount);
    } else {
      await this.bc.show(title,
        `<b>${p.name}</b>: ${card.text} <span class="down">−${money(-card.amount)}</span>`, { kind: 'bad' });
      await this.payBank(p.id, -card.amount);
    }
  }

  /**
   * Tiền mừng: **chia đều cho những người còn lại cùng góp**, chứ ngân hàng
   * không bao. Ai không xoay đủ thì đi qua đúng cửa `payPlayer` như trả tiền
   * thuê — bán nhà, thế chấp, cùng lắm là vỡ nợ.
   */
  async cardCollect(p, kind, card, title) {
    const st = this.state;
    const each = shareEach(st, p.id, card.amount);
    await cardModal(kind, card, {
      amount: card.amount,
      note: `Mỗi người còn lại góp <b>${money(each)}</b>.`,
      label: 'Nhận tiền mừng',
    });
    await this.bc.show(title,
      `<b>${p.name}</b>: ${card.text} — mỗi người góp
       <span class="up">${money(each)}</span>.`);
    for (const seat of othersOf(st, p.id)) {
      if (st.players[seat].bankrupt) continue;
      await this.payPlayer(seat, p.id, each);
    }
  }

  /** Thuế nhà cửa: tính đầu nhà, đầu khách sạn trên toàn bộ đất của mình. */
  async cardRepair(p, kind, card, title) {
    const bill = repairBill(this.state, p.id, card);
    const parts = [];
    if (bill.houses) parts.push(`${bill.houses} nhà × ${money(card.perHouse)}`);
    if (bill.hotels) parts.push(`${bill.hotels} khách sạn × ${money(card.perHotel)}`);
    await cardModal(kind, card, { amount: -bill.amount, note: parts.join(' · ') });
    await this.bc.show(title,
      `<b>${p.name}</b> nộp thuế nhà cửa <span class="down">${money(bill.amount)}</span>
       — ${parts.join(', ')}.`, { kind: 'bad' });
    await this.payBank(p.id, bill.amount);
  }

  /* ================================================================
     Túi thẻ — thẻ giữ lại dùng sau
     ================================================================ */

  /**
   * Cất một lá vào túi. Lá ấy rời khỏi bộ bài cho tới khi có người xài, nên
   * cả bàn không thể có hai tấm cùng một lá.
   */
  async keepCard(p, kind, drawn, title) {
    const st = this.state;
    const meta = CARD_KINDS[cardType(drawn.card)];
    await cardModal(kind, drawn.card, {
      note: `<b>${meta.sigil} ${meta.name}</b> — cất vào túi, khi nào thấy đúng lúc
             thì mở <b>Túi thẻ</b> ra dùng.`,
      label: 'Cất vào túi',
    });
    st.takeCard(p.id, kind, drawn.index);
    this.hud.refresh();
    this.sync();
    await this.bc.show(title,
      `<b>${p.name}</b> cất được <b>${meta.name}</b> vào túi — lá này rời khỏi bộ bài
       cho tới khi có người xài tới.`);
  }

  /** Mở túi thẻ của người đang đi; chọn một tấm thì dùng luôn tấm ấy. */
  async openBag() {
    const at = await inventoryModal(this.state, this.state.turn);
    if (at == null) { this.restoreActions(); return; }
    /* Vé ra tù kéo theo cả nước đi (thả ra rồi lắc luôn), lúc ấy thanh nút đã
       do `takeRoll` dựng lại — bày đè lên nữa là xoá mất nút "kết thúc lượt". */
    const rolls = cardType(cardOf(this.state.current.cards[at])) === 'jail-free';
    await this.useHeldCard(at);
    if (!rolls) this.restoreActions();
  }

  /**
   * Dùng một tấm trong túi.
   *
   * Lá bài **trả về bộ trước khi thi hành**: hiệu ứng có thể mở đấu giá, có
   * thể làm ai đó vỡ nợ, mà giữa chừng ấy không được để lá bài kẹt lại ngoài
   * bộ. Quyền dùng cũng soát lại ở đây chứ không tin nút bấm suông — bàn cờ
   * đổi liên tục, nút bày ra lúc nãy có thể đã hết đúng.
   */
  async useHeldCard(at) {
    const st = this.state;
    const p = st.current;
    const ref = p.cards[at];
    const card = cardOf(ref);
    if (!card) return;

    const check = useReason(st, card, p.id);
    if (!check.ok) {
      await this.bc.show('CHƯA DÙNG ĐƯỢC', check.reason, { kind: 'bad', ms: 3000 });
      return;
    }

    st.dropCard(p.id, at);
    audio.sfx('card');
    this.hud.refresh();
    this.sync();

    const title = CARD_KINDS[cardType(card)]?.name ?? 'THẺ';
    switch (cardType(card)) {
      case 'jail-free':     return this.useJailCard(false);
      case 'resume-random': return this.resumeRandom(p, card, title);
      default:              return this.strikeWithPick(p, card, title);
    }
  }

  /**
   * Chỉ một ô ngay trên bàn cờ rồi xác nhận — xem `ui/tilePicker.js`.
   *
   * Gom vào đây vì cả `answer()` (câu hỏi gửi từ máy khác) lẫn `EventRunner`
   * đều cần đúng một cách hỏi, mà chỗ duy nhất giữ `scene` là controller.
   */
  pickTile(ids, text, ms = 0) {
    return pickTileOnBoard(this.scene, this.state, ids, text, ms);
  }

  /**
   * Ba thẻ đụng thẳng vào nhà đất người khác: ép bán nhà, dỡ nhà, cưỡng chiếm
   * — và thẻ giải toả chỉ định.
   *
   * Người dùng thẻ tự chọn mục tiêu; đây mới là chỗ đắt giá, và cũng là chỗ ép
   * đất đổi chủ mà không cần đối phương gật đầu. Hỏi qua `events.askOne` nên
   * bản một máy chuyền tay, bản online hiện đúng ở máy người ấy, mà họ đã bỏ
   * bàn thì có sẵn câu trả lời mặc định.
   */
  async strikeWithPick(p, card, title) {
    const st = this.state;
    const ids = cardTargets(st, card, p.id);
    if (ids.length === 0) return;   // bàn vừa đổi thế giữa chừng
    const type = cardType(card);
    const levels = demolishLevels(card);

    const text = {
      'force-sell': {
        eyebrow: 'PHÁT MÃI NHÀ CỬA',
        title: 'Ép ai bán nhà?',
        sub: 'Ô bạn chọn bị <b>dỡ sạch nhà cửa</b>; chủ đất chỉ nhận lại nửa giá xây.',
        note: 'Chỉ chọn được ô đang có nhà của người khác.',
        confirm: 'Chốt ô này',
      },
      demolish: {
        eyebrow: 'DỠ NHÀ LẤN LỘ GIỚI',
        title: `Dỡ ${levels} cấp nhà ở ô nào?`,
        sub: `Ô bạn chọn bị <b>hạ ${levels} cấp nhà</b>, chủ đất không được đền một đồng nào.`,
        note: 'Chỉ chọn được ô đang có nhà của người khác.',
        confirm: 'Chốt ô này',
      },
      seize: {
        eyebrow: 'CƯỠNG CHIẾM ĐỊA GIỚI',
        title: 'Lấy lô đất nào?',
        sub: 'Lô bạn chọn <b>sang tên cho bạn</b> ngay, chủ cũ chỉ được đền đúng giá thế chấp.',
        note: 'Chỉ lô đất trống, chưa thế chấp, và bạn phải đủ tiền mặt trả tiền đền.',
        confirm: 'Lấy lô này',
      },
      resume: {
        eyebrow: 'GIẢI TOẢ',
        title: 'Cắm mốc giải toả lô nào?',
        sub: `Chủ lô nhận tiền đền <b>giá gốc +20%</b>, rồi lô ấy đem
              <b>đấu giá kín</b> — ai trả cao nhất thì lấy.`,
        note: 'Chọn được cả đất của mình: lãnh tiền đền rồi tranh mua lại cũng là một nước cờ.',
        confirm: 'Cắm mốc lô này',
      },
    }[type];
    text.owned = false;

    // Hết giờ / bỏ bàn thì nhắm vào ô rẻ nhất — nhẹ tay nhất trong các lựa chọn
    const fallback = [...ids].sort((a, b) => BOARD[a].price - BOARD[b].price)[0];
    const picked = await this.events.askOne({
      seat: p.id,
      name: 'ev-pick',
      data: { ids, text },
      local: () => this.pickTile(ids, text, this.events.localMs),
      fallback,
      note: 'họ vừa lôi ra một thẻ nhắm vào nhà đất người khác',
    });
    const tileId = ids.includes(picked) ? picked : fallback;
    // Đất có thể vừa đổi chủ trong lúc hỏi (người kia phá sản) — soát lại
    if (!cardTargets(st, card, p.id).includes(tileId)) return;

    if (type === 'force-sell') return this.forceSellHouses(p, tileId, title);
    if (type === 'demolish') return this.demolishHouse(p, tileId, levels, title);
    if (type === 'resume') return this.resumeTile(p, tileId, card, title);
    return this.seizeTile(p, tileId, title);
  }

  /**
   * Giải toả bốc thăm: lô đất do bàn cờ tự quay ra.
   *
   * Máy đang cầm lái gieo **một lần**, rồi phát cả danh sách ô lẫn ô trúng cho
   * mọi máy cùng quay — không máy nào tự gieo lại một con số khác, mà ai cũng
   * thấy vòng quay đi qua đúng những ô ấy.
   */
  async resumeRandom(p, card, title) {
    const st = this.state;
    const ids = cardTargets(st, card, p.id);
    if (ids.length === 0) return;
    const tileId = ids[Math.floor(Math.random() * ids.length)];

    await this.bc.show(title,
      `<b>${p.name}</b> bốc thăm giữa <b>${ids.length}</b> lô đất trống trên bàn —
       bàn cờ đang quay.`, { kind: 'trade', ms: 2200 });
    this.netEmit('spin', { ids, tileId });
    await this.scene.spinTiles(ids, tileId);
    this.scene.highlightTile(p.pos, p.token.color);

    await this.resumeTile(p, tileId, card, title);
  }

  /** Ép bán: nhà trên ô về hết kho ngân hàng, chủ đất nhận nửa giá xây. */
  async forceSellHouses(p, tileId, title) {
    const st = this.state;
    const owner = st.ownerOf(tileId);
    const refund = forcedSaleRefund(st, tileId);
    const levels = st.clearHouses(tileId);

    audio.sfx('bankrupt');
    this.hud.refresh();
    this.scene.refresh(st);
    this.sync();
    await this.bc.show(title,
      `<b>${p.name}</b> ép <b>${owner.name}</b> phát mãi <b>${levels} cấp nhà</b>
       ở <b>${tileLabel(tileId)}</b> — chỉ được lại nửa giá xây.`, { kind: 'bad' });
    await this.receiveFromBank(owner.id, refund);
  }

  /** Dỡ nhà: mất mấy cấp, không đền bù — nặng tay hơn ép bán đúng ở chỗ đó. */
  async demolishHouse(p, tileId, levels, title) {
    const st = this.state;
    const owner = st.ownerOf(tileId);
    const before = st.housesOn(tileId);
    let gone = 0;
    for (let i = 0; i < levels && st.housesOn(tileId) > 0; i++) {
      st.demolish(tileId);
      gone += 1;
    }

    audio.sfx('shake');
    this.netEmit('quake', {});
    this.scene.shake(0.008, 420);
    this.hud.refresh();
    this.scene.refresh(st);
    this.sync();
    await this.bc.show(title,
      `<b>${p.name}</b> cho dỡ <b>${before === 5 && gone === 1 ? 'khách sạn' : `${gone} cấp nhà`}</b>
       của <b>${owner.name}</b> ở <b>${tileLabel(tileId)}</b> —
       <span class="down">không đền một đồng nào</span>.`, { kind: 'bad' });
  }

  /**
   * Giải toả: lô đất bị thu, chủ cũ lãnh tiền đền hậu (giá gốc +20%), rồi lô
   * ấy đem đấu giá kín cho cả bàn — kể cả chủ cũ, họ cầm tiền đền trong tay
   * nên có quyền tranh mua lại.
   *
   * Dùng lại đúng phiên đấu giá của thẻ Thời Cuộc: một vòng ghi giá kín, cao
   * nhất lấy đất, hoà thì người đi trước trong vòng lượt thắng.
   */
  async resumeTile(p, tileId, card, title) {
    const st = this.state;
    const owner = st.ownerOf(tileId);
    const payout = resumePrice(tileId, card);

    st.owner.delete(tileId);
    st.mortgaged.delete(tileId);
    this.hud.refresh();
    this.scene.refresh(st);
    this.sync();

    await this.bc.show(title,
      `<b>${p.name}</b> cắm mốc giải toả <b>${tileLabel(tileId)}</b> —
       <b>${owner.name}</b> lãnh tiền đền <span class="up">${money(payout)}</span>
       (giá gốc +20%).`, { kind: 'trade' });
    await this.receiveFromBank(owner.id, payout);

    await this.events.auction(tileId, {
      seller: null,
      reason: `Lô đất vừa giải toả khỏi tay ${owner.name} — Toà Đô Chánh đem bán lại cho ai trả cao nhất.`,
    });
  }

  /** Cưỡng chiếm: lô đất sang tên, chủ cũ nhận đúng giá thế chấp. */
  async seizeTile(p, tileId, title) {
    const st = this.state;
    const owner = st.ownerOf(tileId);
    const price = seizePrice(tileId);

    await this.bc.show(title,
      `<b>${p.name}</b> cưỡng chiếm <b>${tileLabel(tileId)}</b> của <b>${owner.name}</b>,
       đền <span class="down">${money(price)}</span> theo giá thế chấp.`, { kind: 'trade' });
    // Trả tiền đền trước: người dùng thẻ vỡ nợ ngay tại đây thì đất không đi đâu cả
    if (!(await this.payPlayer(p.id, owner.id, price))) return;
    if (st.owner.get(tileId) !== owner.id) return;

    st.transfer(tileId, p.id);
    audio.sfx('trade');
    this.hud.refresh();
    this.scene.refresh(st);
    this.sync();
    await this.bc.show('SANG TÊN',
      `<b>${tileLabel(tileId)}</b> nay thuộc về
       <b style="color:${p.token.css}">${p.name}</b>.`, { kind: 'trade' });
  }

  // -------------------------------------------------------------- tiền nong

  /** Ngân hàng chi tiền cho người chơi — xu bay từ bảng ngân hàng vào ví. */
  async receiveFromBank(playerId, amount) {
    const p = this.state.players[playerId];
    this.state.dryTurn = false;
    p.money += amount;
    this.hud.refresh();
    this.sync();
    this.hud.flashMoney(playerId, true);
    await this.scene.flyMoney(this.hud.bankEl(), this.hud.cardEl(playerId), amount,
      { text: `+${money(amount)}`, color: '#7BE0A0' });
  }

  /**
   * Người chơi trả tiền cho ngân hàng. Nếu không đủ, mời bán nhà/thế chấp
   * hoặc tuyên bố phá sản.
   * @returns {Promise<boolean>} false nếu người chơi phá sản
   */
  async payBank(playerId, amount) {
    if (!(await this.ensureFunds(playerId, amount))) return false;
    const p = this.state.players[playerId];
    this.state.dryTurn = false;
    p.money -= amount;
    this.hud.refresh();
    this.sync();
    this.hud.flashMoney(playerId, false);
    await this.scene.flyMoney(this.hud.cardEl(playerId), this.hud.bankEl(), amount,
      { text: `−${money(amount)}`, color: '#FF8A7A' });
    return true;
  }

  /** Người chơi trả tiền cho người chơi khác. */
  async payPlayer(fromId, toId, amount) {
    if (!(await this.ensureFunds(fromId, amount))) {
      // Người trả đã phá sản: tài sản về ngân hàng, chủ nợ không nhận được gì.
      return false;
    }
    const from = this.state.players[fromId];
    const to = this.state.players[toId];
    this.state.dryTurn = false;
    from.money -= amount;
    to.money += amount;
    this.hud.refresh();
    this.sync();
    this.hud.flashMoney(fromId, false);
    this.hud.flashMoney(toId, true);
    await this.scene.flyMoney(this.hud.cardEl(fromId), this.hud.cardEl(toId), amount,
      { text: `−${money(amount)}`, color: '#FF8A7A' });
    return true;
  }

  /**
   * Bảo đảm người chơi có đủ `amount`. Cho phép bán nhà / thế chấp nhiều lần.
   * Nếu bán sạch nhà và thế chấp hết đất vẫn không đủ thì vỡ nợ ngay,
   * khỏi bắt người chơi đi qua từng bước xoay tiền vô ích.
   * @returns {Promise<boolean>} false nếu người chơi chọn (hoặc buộc phải) phá sản
   */
  async ensureFunds(playerId, amount) {
    const st = this.state;
    const p = st.players[playerId];

    if (p.money < amount) {
      const raisable = st.liquidValue(playerId);
      if (raisable < amount) {
        await bankruptModal(st, playerId, true, amount - p.money, raisable);
        await this.doBankrupt(playerId);
        return false;
      }
    }

    while (p.money < amount) {
      const props = st.propertiesOf(playerId);
      // Còn gì để xoay không?
      const canRaise = props.some(
        (id) => st.canSellHouse(playerId, id).ok || st.canMortgage(playerId, id).ok,
      );

      if (!canRaise) {
        await bankruptModal(st, playerId, true, amount - p.money);
        await this.doBankrupt(playerId);
        return false;
      }

      const choice = await openModal({
        eyebrow: 'THIẾU TIỀN',
        title: `Còn thiếu ${money(amount - p.money)}`,
        sub: `Bạn cần ${money(amount)} nhưng chỉ có ${money(p.money)}. Hãy bán nhà hoặc thế chấp để xoay tiền.`,
        body: `<div class="trade-summary">Thế chấp lấy tiền mặt ngay; sau này chuộc lại chịu <b>lãi 10%</b>.
                 Bán nhà thu về <b>nửa giá xây</b>.</div>`,
        buttons: [
          { label: 'Bán nhà / Thế chấp', value: 'manage', cls: 'btn-gold' },
          { label: 'Tuyên bố phá sản', value: 'bankrupt', cls: 'btn-danger' },
        ],
        escValue: 'manage', // Esc không được vô tình đẩy người chơi vào cửa phá sản
      });

      if (choice === 'bankrupt') {
        const sure = await bankruptModal(st, playerId, false);
        if (sure) { await this.doBankrupt(playerId); return false; }
      } else {
        await this.openManage(playerId);
      }
    }
    return true;
  }

  // ------------------------------------------------------------------- tù

  async goToJail(p) {
    const st = this.state;
    st.sendToJail(p);
    audio.sfx('jail');
    this.netEmit('jail', { seat: p.id });
    this.scene.shake(0.007, 340);
    await this.scene.jumpToken(p.id, JAIL_TILE);
    this.hud.refresh();
    this.sync();
    this.scene.highlightTile(JAIL_TILE, p.token.color);
  }

  /**
   * Xài vé ra tù: được thả ngay, không tốn đồng nào, rồi lắc đi như thường.
   * Tấm vé trả về bộ bài — người sau còn có cơ hội rút trúng.
   */
  async useJailCard(pull = true) {
    const st = this.state;
    const p = st.current;
    // Gọi từ túi thẻ thì lá bài đã rời tay rồi, đừng rút thêm tấm nữa
    if (pull) {
      const at = st.jailCardAt(p.id);
      if (at < 0 || !st.dropCard(p.id, at)) return;
    }
    st.releaseFromJail(p);
    audio.sfx('jail');
    this.hud.refresh();
    this.sync();
    await this.bc.show('DÙNG VÉ RA TÙ',
      `<b>${p.name}</b> chìa tờ giấy bãi nại ra — cửa Khám Lớn mở, khỏi tốn một đồng.`);
    await this.takeRoll();
  }

  async payOutOfJail() {
    const st = this.state;
    const p = st.current;
    await this.bc.show('NỘP TIỀN RA TÙ',
      `<b>${p.name}</b> nộp <span class="down">${money(JAIL_FINE)}</span> để được tự do.`);
    if (!(await this.payBank(p.id, JAIL_FINE))) { await this.endTurn(); return; }
    st.releaseFromJail(p);
    this.hud.refresh();
    await this.takeRoll();
  }

  /**
   * Lắc trong tù — mỗi lượt chỉ được cầu đôi một lần. Trượt thì hết lượt,
   * ngồi chờ tới lượt sau; tới lần thứ ba mà vẫn không ra đôi thì buộc nộp
   * phạt 50$ rồi đi theo số vừa lắc.
   */
  async rollInJail() {
    const st = this.state;
    const p = st.current;
    const d = rollDice();
    this.netEmit('dice', d);
    await this.scene.rollDiceAnim(d.a, d.b);

    if (d.isDouble) {
      st.releaseFromJail(p);
      this.hud.refresh();
      await this.bc.show('RA ĐÔI — ĐƯỢC THA',
        `<b>${p.name}</b> đổ đôi ${d.a}, rời Khám Lớn và đi ${d.sum} ô.`);
      await this.advance(p, d.sum, d);
      // Ra đôi để thoát tù không cho thêm lượt lắc.
      if (st.over || p.bankrupt || p.inJail) { await this.endTurn(); return; }
      this.setTurnActions(true);
      return;
    }

    p.jailTurns += 1;
    this.hud.refresh();

    if (p.jailTurns >= MAX_JAIL_TURNS) {
      await this.bc.show('HẾT HẠN 3 LƯỢT',
        `<b>${p.name}</b> cầu đôi hụt lần thứ ${MAX_JAIL_TURNS} — phải nộp
         <span class="down">${money(JAIL_FINE)}</span> rồi đi ${d.sum} ô.`,
        { kind: 'bad' });
      if (!(await this.payBank(p.id, JAIL_FINE))) { await this.endTurn(); return; }
      st.releaseFromJail(p);
      this.hud.refresh();
      await this.advance(p, d.sum, d);
      if (st.over || p.bankrupt || p.inJail) { await this.endTurn(); return; }
      this.setTurnActions(true);
      return;
    }

    await this.bc.show('CHƯA RA ĐÔI',
      `<b>${p.name}</b> ngồi tiếp — đã cầu đôi hụt <b>${p.jailTurns}/${MAX_JAIL_TURNS}</b> lượt.`,
      { kind: 'bad' });
    // Hết lượt: lần cầu đôi kế tiếp phải chờ vòng sau.
    await this.endTurn();
  }

  // -------------------------------------------------------- quản lý tài sản

  manage() { return this.openManage(this.state.turn).then(() => this.restoreActions()); }

  async openManage(playerId) {
    await manageModal(this.state, playerId, (act, id, res) => {
      this.hud.refresh();
      this.scene.refresh(this.state);
      if (!res?.ok) return;
      const p = this.state.players[playerId];
      const label = tileLabel(id);
      if (act === 'build') {
        audio.sfx('build');
        this.hud.flashMoney(playerId, false);
        this.bc.show(res.isHotel ? 'LÊN KHÁCH SẠN' : 'XÂY NHÀ',
          res.isHotel
            ? `<b>${p.name}</b> xây <b>khách sạn</b> ở <b>${label}</b>, trả lại 4 căn nhà cho ngân hàng.`
            : `<b>${p.name}</b> xây thêm một căn nhà ở <b>${label}</b> (<span class="down">−${money(res.cost)}</span>).`);
      } else if (act === 'sell') {
        this.hud.flashMoney(playerId, true);
        this.bc.show('BÁN NHÀ',
          `<b>${p.name}</b> bán lại một căn ở <b>${label}</b> (<span class="up">+${money(res.refund)}</span>).`);
      } else if (act === 'mortgage') {
        addPressure(this.state, PRESSURE.mortgage);
        this.hud.flashMoney(playerId, true);
        this.bc.show('THẾ CHẤP',
          `<b>${p.name}</b> cầm cố <b>${label}</b>, nhận <span class="up">${money(res.amount)}</span>.`);
      } else if (act === 'redeem') {
        this.hud.flashMoney(playerId, false);
        this.bc.show('CHUỘC TÀI SẢN',
          `<b>${p.name}</b> chuộc <b>${label}</b> với <span class="down">${money(res.cost)}</span> (đã gồm lãi 10%).`);
      }
    });
    this.hud.refresh();
    this.scene.refresh(this.state);
    this.sync();
  }

  restoreActions() {
    if (this.state.over) return;
    this.setTurnActions(this.lastRolled ?? false);
  }

  // -------------------------------------------------------------- giao dịch

  async trade() {
    const st = this.state;
    const A = st.current;

    const targetId = await tradePickModal(st, A.id);
    if (targetId == null) { this.restoreActions(); return; }
    const B = st.players[targetId];

    const offer = await tradeBuildModal(st, A.id, targetId);
    if (!offer) { this.restoreActions(); return; }

    // Cả bàn cùng thấy nội dung đề nghị
    await this.bc.show('ĐỀ NGHỊ GIAO DỊCH',
      `<b style="color:${A.token.css}">${A.name}</b> đưa: ${describe(st, offer.give, offer.giveMoney)}
       <br><b style="color:${B.token.css}">${B.name}</b> đưa: ${describe(st, offer.get, offer.getMoney)}`,
      { kind: 'trade', ms: 5200 });
    await wait(700);

    /* Ai duyệt đề nghị: chơi một máy thì chuyền máy tay này sang tay kia; chơi
       online thì bên B ngồi máy khác, phải hỏi sang đó rồi chờ họ bấm. Bên B
       rớt mạng giữa chừng thì `ask` trả về `false` chứ không treo lượt của A. */
    let accepted;
    if (this.net) {
      await this.bc.show('CHỜ TRẢ LỜI',
        `Đang chờ <b>${B.name}</b> xem xét đề nghị…`, { kind: 'trade', ms: 3000 });
      /* Đồng hồ chuyển sang B — giờ cả bàn chờ họ, không chờ A nữa. Hạn của B
         nới thêm vài giây so với con số hộp thoại đếm cho họ xem, để người bấm
         đúng giây cuối vẫn kịp về đích trước lúc bị gạch tên. */
      this.armClock(targetId, this.tradeMs + 5000, 'trả lời giao dịch');
      accepted = await this.net.ask(targetId, 'trade-review', { offer },
        { fallback: false, timeout: this.tradeMs + 8000 });
      // Trả lời rồi (hay hết giờ rồi) thì đồng hồ về lại người đang đi
      this.armClock(A.id, this.busyMs, 'đang thao tác');

      /* Bên kia để hết giờ → mời khỏi bàn, y như người ngồi im hết lượt.
         Việc này để **người hỏi** làm chứ không để trọng tài: mình đang đứng
         chờ ngay đây và là người duy nhất nhận được lời "hết giờ" của họ, nên
         không sợ hai máy cùng gạch một tên. */
      if (accepted === 'timeout') {
        await this.evictPlayer(targetId, 'stall');
        this.restoreActions();
        return;
      }
    } else {
      await handoff(B.name, B.token.css, `${A.name} gửi một đề nghị giao dịch. Chuyền máy cho ${B.name} xem xét.`);
      accepted = await tradeReviewModal(st, offer);
    }

    if (!accepted) {
      // Không ai chịu đổi chác chính là lúc bàn cần một cơn biến động
      addPressure(st, PRESSURE.tradeRefused);
      await this.bc.show('TỪ CHỐI GIAO DỊCH',
        `<b>${B.name}</b> không đồng ý với đề nghị của <b>${A.name}</b>.`, { kind: 'bad', ms: 4200 });
      if (!this.net) {
        await handoff(A.name, A.token.css, `Đề nghị bị từ chối. Chuyền máy lại cho ${A.name}.`);
      }
      this.restoreActions();
      return;
    }

    /* Kiểm lại trước khi chốt — thương lượng có thể kéo dài hơn ta tưởng. Tiền
       thì đổi được (trả thuê, nhận thẻ), mà người thì cũng có thể rời bàn giữa
       chừng: mình mải chọn đất trong hộp thoại quá hạn `busyMs` thì chính mình
       cũng bị gạch, lúc ấy đất đem đổi đã về ngân hàng cả rồi. */
    if (A.bankrupt || B.bankrupt) {
      await this.bc.show('GIAO DỊCH HỎNG', 'Một bên đã rời bàn trước khi chốt.', { kind: 'bad' });
      if (!this.net) await handoff(A.name, A.token.css);
      this.restoreActions();
      return;
    }
    if (A.money < offer.giveMoney || B.money < offer.getMoney) {
      await this.bc.show('GIAO DỊCH HỎNG', 'Một bên không còn đủ tiền mặt như đã đề nghị.', { kind: 'bad' });
      if (!this.net) await handoff(A.name, A.token.css);
      this.restoreActions();
      return;
    }

    await this.executeTrade(offer, A, B);
    if (!this.net) {
      await handoff(A.name, A.token.css, `Giao dịch xong. Chuyền máy lại cho ${A.name} tiếp tục lượt.`);
    }
    this.restoreActions();
  }

  /** Thực hiện chuyển tài sản + tiền giữa hai bên, kèm hiệu ứng. */
  async executeTrade(offer, A, B) {
    const st = this.state;

    audio.sfx('trade');
    for (const id of offer.give) st.transfer(id, B.id);
    for (const id of offer.get) st.transfer(id, A.id);

    const net = offer.giveMoney - offer.getMoney;
    A.money -= offer.giveMoney; A.money += offer.getMoney;
    B.money -= offer.getMoney; B.money += offer.giveMoney;

    this.hud.refresh();
    this.scene.refresh(st);
    this.sync();

    if (net !== 0) {
      const [srcId, dstId, amt] = net > 0 ? [A.id, B.id, net] : [B.id, A.id, -net];
      this.hud.flashMoney(srcId, false);
      this.hud.flashMoney(dstId, true);
      await this.scene.flyMoney(this.hud.cardEl(srcId), this.hud.cardEl(dstId), amt,
        { text: money(amt), color: '#E9CE85' });
    }

    // Thông báo kết quả cho cả bàn
    await this.bc.show('GIAO DỊCH THÀNH CÔNG',
      `<b style="color:${A.token.css}">${A.name}</b> nhận: ${describe(st, offer.get, offer.getMoney)}
       <br><b style="color:${B.token.css}">${B.name}</b> nhận: ${describe(st, offer.give, offer.giveMoney)}`,
      { kind: 'trade', ms: 6000 });

    // Chủ mới của đất đang thế chấp được mời chuộc lại (phí = thế chấp + 10%)
    await this.offerRedeem(B.id, offer.give.filter((id) => st.isMortgaged(id)));
    await this.offerRedeem(A.id, offer.get.filter((id) => st.isMortgaged(id)));
  }

  /**
   * Mời **chủ mới** chuộc các ô vừa nhận đang bị thế chấp.
   *
   * Tiền chuộc lấy từ túi chủ mới, nên quyết định cũng phải là của chủ mới:
   * hộp thoại hiện ở máy của họ chứ không ở máy người dựng giao dịch. Không
   * hỏi tới nơi được (rớt mạng, hết giờ) thì coi như "để sau" — đất vẫn nguyên
   * đó, chuộc lúc nào cũng được ở mục Quản lý tài sản.
   */
  async offerRedeem(playerId, ids) {
    if (ids.length === 0) return;
    const st = this.state;
    const p = st.players[playerId];

    let choice;
    if (this.net && playerId !== this.net.mySeat) {
      await this.bc.show('CHỜ TRẢ LỜI',
        `Đang chờ <b>${p.name}</b> quyết định có chuộc ${ids.length} ô vừa nhận không…`,
        { kind: 'trade', ms: 2600 });
      choice = await this.net.ask(playerId, 'redeem', { ids },
        { fallback: null, timeout: this.tradeMs + 8000 });
    } else {
      // Cả bàn một máy: chuyền máy cho chủ mới rồi mới hỏi
      if (!this.net && playerId !== st.turn) {
        await handoff(p.name, p.token.css,
          `${p.name} vừa nhận đất đang thế chấp — chuyền máy cho họ quyết định.`);
      }
      choice = await litTiles(this.scene, ids, () => redeemPromptModal(st, playerId, ids));
    }

    const total = ids.reduce((s, id) => s + BOARD[id].redeem, 0);
    /* Chốt lại ở máy cầm lái: từ lúc hỏi tới lúc trả lời, túi tiền của họ có
       thể đã vơi đi (trả tiền thuê, bóc thẻ) nên không tin câu trả lời suông. */
    if (choice !== 'all' || p.money < total) {
      await this.bc.show('CÒN NỢ NGÂN HÀNG',
        `<b>${p.name}</b> giữ ${ids.length} ô đang thế chấp — có thể chuộc sau ở mục Quản lý tài sản.`,
        { ms: 3600 });
      return;
    }
    for (const id of ids) st.redeem(playerId, id);
    this.hud.refresh();
    this.scene.refresh(st);
    this.sync();
    this.hud.flashMoney(playerId, false);
    await this.scene.flyMoney(this.hud.cardEl(playerId), this.hud.bankEl(), total,
      { text: `−${money(total)}`, color: '#FF8A7A' });
    await this.bc.show('CHUỘC TÀI SẢN',
      `<b>${p.name}</b> trả ngân hàng <span class="down">${money(total)}</span> để chuộc ${ids.length} ô (đã gồm lãi 10%).`);
  }

  // --------------------------------------------------------------- phá sản

  async declareBankrupt() {
    const sure = await bankruptModal(this.state, this.state.turn, false);
    if (!sure) { this.restoreActions(); return; }
    await this.doBankrupt(this.state.turn);
    if (!this.checkGameOver()) await this.endTurn();
  }

  /** Giải thể tài sản về ngân hàng + hiệu ứng. */
  async doBankrupt(playerId) {
    const st = this.state;
    const p = st.players[playerId];
    const props = st.propertiesOf(playerId).length;

    audio.sfx('bankrupt');
    st.bankrupt(playerId);
    this.hud.refresh();
    this.scene.refresh(st);
    this.scene.placeTokens();
    this.sync();

    await this.bc.show('PHÁ SẢN',
      `<b>${p.name}</b> vỡ nợ! ${props} ô đất cùng toàn bộ nhà cửa được trả về <b>ngân hàng</b>.`,
      { kind: 'bad', ms: 5000 });
    await this.scene.bankruptFx(playerId);

    // Pháo hoa tiễn người thua — cũng là một cách kết thúc có hậu
    const c = this.scene.boardCenter();
    this.scene.fireworks(c.x, c.y, 0xB3322A, 2);
    await wait(600);
  }

  // ------------------------------------------------------ tra cứu thông tin

  /** Đang có hộp thoại nào mở không — tránh chồng hộp thoại lên nhau. */
  modalOpen() { return document.querySelector('#modal-root .scrim') !== null; }

  /** Bấm vào thẻ người chơi → bảng tài sản đầy đủ. */
  async showPlayer(playerId) {
    if (this.modalOpen() || !this.state) return;
    const res = await playerModal(this.state, playerId);
    // Bấm tiếp vào một thẻ đất trong bảng thì mở chi tiết ô đó
    if (res?.openTile != null) {
      await wait(120);
      await tileModal(this.state, res.openTile);
    }
  }

  /** Bấm vào một ô trên bàn cờ → thông tin chi tiết ô. */
  async showTile(tileId) {
    if (this.modalOpen() || !this.state) return;
    await tileModal(this.state, tileId);
  }

  // ------------------------------------------------------------- kết thúc

  checkGameOver() {
    const st = this.state;
    const w = st.winner();
    if (!w) return false;
    st.over = true;
    this.clock = null;
    this.hud.setClock(null);
    this.hud.refresh();
    this.hud.clearActions();
    this.scene.clearHighlight();
    this.scene.hideDice();
    this.finish(w);
    return true;
  }

  async finish(winner) {
    await this.bc.show('HẠ MÀN',
      `<b>${winner.name}</b> là người cuối cùng trụ lại — <b>thắng ván này!</b>`, { ms: 6000 });
    this.scene.celebrate(5200, winner.token.color);
    await wait(1600);
    // Ván đã hạ màn — quay về "màn hình chờ", nhạc nền nổi lại
    audio.startMusic();
    const again = await winnerModal(this.state, winner);

    /* Ván online hạ màn thì phòng cũng hết việc: mã phòng cũ đã mang trạng
       thái "đang chơi" nên không nhận người vào lại được. Về trang chủ để chủ
       phòng mở phòng mới, ai muốn chơi tiếp thì nhận đường mời mới. */
    if (this.net) {
      clearInterval(this.absentTimer);
      await this.net.leave();
      window.location.href = `${window.location.origin}${window.location.pathname}`;
      return;
    }

    if (again === 'again') {
      this.bc.clear();
      await this.start();
    }
  }
}
