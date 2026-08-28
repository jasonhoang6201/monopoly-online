/**
 * Điều phối ván đấu: vòng lượt, xử lý ô đáp xuống, tiền nong, tù tội,
 * giao dịch và kết thúc — nối luật chơi (core/state) với bàn cờ (Phaser)
 * và giao diện (HTML).
 */
import {
  BOARD, money, tileLabel, GO_SALARY, JAIL_FINE, JAIL_TILE, GOTO_JAIL_TILE,
  MAX_JAIL_TURNS,
} from '../data/board.js';
import { GameState, rollDice } from '../core/state.js';
import { snapshot, fromSnapshot, applySnapshot } from '../core/serialize.js';
import { Hud, Broadcast } from '../ui/hud.js';
import { QuickView } from '../ui/quickview.js';
import {
  diceSvg, tradeSvg, estateSvg, bankruptSvg, doneSvg, coinSvg,
} from '../ui/actionIcons.js';
import { openModal, handoff } from '../ui/modal.js';
import {
  setupModal, buyModal, cardModal, manageModal, tradePickModal,
  tradeBuildModal, tradeReviewModal, redeemPromptModal, bankruptModal,
  winnerModal, describe, playerModal, tileModal,
} from '../ui/modals.js';
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
    /** Phòng online, hoặc null khi cả bàn ngồi chung một máy. */
    this.net = null;
    /**
     * Mất kết nối bao lâu thì tài sản trả về ngân hàng.
     * Rộng rãi một chút để sụt wifi hay bấm F5 không làm mất cả cơ nghiệp —
     * quay lại kịp trong hạn này là về đúng ghế cũ, đất nhà nguyên vẹn.
     * (Bộ kiểm thử hạ xuống vài giây cho đỡ phải ngồi chờ.)
     */
    this.awayGraceMs = 45000;
  }

  // ---------------------------------------------------------------- khởi đầu

  async start() {
    // Nhạc nền chỉ sống ở màn hình chờ; khai cuộc xong là nhường chỗ
    // cho tiếng xí ngầu và tiếng quân cờ.
    audio.startMusic();
    const names = await setupModal();
    audio.stopMusic();
    this.state = new GameState(names);
    this.quick.setState(this.state);
    this.hud = new Hud(this.state, (id) => this.showPlayer(id), this.quick);
    this.scene.onTileClick = (id) => this.showTile(id);
    this.scene.setPlayers(this.state.players);
    this.scene.refresh(this.state);
    this.bc.clear();

    await this.bc.show('KHAI CUỘC',
      `Ván cờ bắt đầu — mỗi người ${money(1500)} vốn liếng. Chúc may mắn!`, { ms: 2600 });
    this.beginTurn();
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
    this.absentTimer = setInterval(() => this.checkAbsent(), 2000);

    this.onRoomChange();
    this.bc.show('KHAI CUỘC',
      `Ván bắt đầu với <b>${this.state.players.length} người</b> — mỗi người ${money(1500)}
       vốn liếng. Chúc may mắn!`, { ms: 2600 });
    this.beginTurn();
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
   */
  sync() {
    if (this.net) this.net.publishSync(snapshot(this.state));
  }

  /** Báo một việc cần diễn hoạt cho các máy đang ngồi xem. */
  netEmit(name, data) {
    if (this.net) this.net.emit(name, data);
  }

  /** Nhận ảnh chụp từ người đang cầm lái — ảnh chụp là lời cuối. */
  onSync(snap) {
    if (!this.state) return;
    applySnapshot(this.state, snap);
    this.hud.refresh();
    this.scene.refresh(this.state);
    this.scene.placeTokens();
    // Đang giữa một hộp thoại của chính mình thì để yên, xong việc sẽ tự bày lại
    if (!this.busy) this.beginTurn();
  }

  /** Diễn lại hoạt cảnh của người đang đi, cho bàn bên này cũng thấy động. */
  async onEvent(name, data) {
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
    }
  }

  /**
   * Có người hỏi và đang chờ mình trả lời. Hiện chỉ dùng cho giao dịch: bên
   * kia dựng đề nghị trên máy họ, còn người bấm đồng ý phải là mình.
   */
  async onAsk(name, data) {
    if (name !== 'trade-review') return null;
    const accepted = await tradeReviewModal(this.state, data.offer);
    return !!accepted;
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
    if (lost) { this.hud.clearActions(); return; }
    if (!this.busy) this.beginTurn();
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

  /** Người rời bàn: tài sản trả hết về ngân hàng, ai cũng mua lại được. */
  async evictPlayer(seat) {
    const st = this.state;
    const p = st.players[seat];
    if (!p || p.bankrupt) return;
    const props = st.propertiesOf(seat).length;

    audio.sfx('bankrupt');
    st.bankrupt(seat);
    this.hud.refresh();
    this.scene.refresh(st);
    this.scene.placeTokens();

    // Trọng tài có thể đang không tới lượt, nhưng lời báo này cả bàn phải nghe.
    this.announcing = true;
    await this.bc.show('RỜI BÀN',
      `<b>${p.name}</b> mất kết nối quá lâu — ${props} ô đất cùng toàn bộ nhà cửa
       trả về <b>ngân hàng</b>, ai cũng mua lại được.`, { kind: 'bad', ms: 5000 });
    this.announcing = false;

    this.sync();
    await this.scene.bankruptFx(seat);

    // Còn đúng một người trụ lại thì hạ màn ngay, đừng bắt họ đi thêm một lượt
    // vô nghĩa rồi mới báo thắng.
    if (this.checkGameOver()) { this.sync(); return; }
    if (st.turn === seat) this.endTurn();
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
    await this.bc.show('BỎ QUA LƯỢT',
      `<b>${p.name}</b> đang mất kết nối — bỏ qua lượt này, tài sản vẫn giữ nguyên.`,
      { ms: 2600 });
    await wait(900);
    if (this.isDriver() && this.state.turn === p.id) this.endTurn();
  }

  // ------------------------------------------------------------------ lượt

  beginTurn() {
    const st = this.state;
    if (st.over) return;
    /* Mất kết nối thì không bày nút: mọi nước đi lúc này đều sẽ bị ảnh chụp của
       bàn đè lên khi nối lại. `onLink` bày lại giúp khi đường truyền thông. */
    if (this.net?.linkLost) { this.hud.clearActions(); return; }
    const p = st.current;

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

    if (p.inJail) {
      this.hud.setActions([
        { label: `Nộp ${money(JAIL_FINE)} ra tù`, key: 'n', cls: 'btn-gold', icon: coinSvg(),
          disabled: p.money < JAIL_FINE, onClick: () => this.guard(() => this.payOutOfJail()) },
        { label: 'Lắc xí ngầu (cầu đôi)', key: 'r', cls: 'btn-primary', pulse: true,
          icon: diceSvg(), title: 'Ra đôi thì được thả ngay',
          onClick: () => this.guard(() => this.rollInJail()) },
        trade, manage, bankrupt,
      ]);
      return;
    }

    this.hud.setActions([
      rolled
        ? { label: 'Kết thúc lượt', key: 'e', cls: 'btn-primary', pulse: true, icon: doneSvg(),
            onClick: () => this.guard(() => this.endTurn()) }
        : { label: 'Lắc xí ngầu', key: 'r', cls: 'btn-primary', pulse: true, icon: diceSvg(),
            onClick: () => this.guard(() => this.takeRoll()) },
      trade, manage, bankrupt,
    ]);
  }

  /** Chặn bấm nút chồng chéo khi đang chạy hiệu ứng. */
  async guard(fn) {
    if (this.busy) return;
    this.busy = true;
    this.hud.clearActions();
    try { await fn(); } finally { this.busy = false; }
  }

  endTurn() {
    const st = this.state;
    this.scene.hideDice();
    this.scene.clearHighlight();
    this.netEmit('hideDice', {});
    if (this.checkGameOver()) { this.sync(); return; }
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
        this.endTurn();
        return;
      }
      await this.bc.show('ĐỔ ĐÔI',
        `<b>${p.name}</b> ra đôi ${d.a} — được đi thêm một lượt nữa.`, { ms: 2200 });
    }

    await this.advance(p, d.sum, d);

    // Vào tù thì hết lượt ngay, kể cả khi vừa đổ đôi.
    if (st.over || p.bankrupt || p.inJail) { this.endTurn(); return; }

    if (d.isDouble) {
      this.hud.refresh();
      this.setTurnActions(false);   // lắc tiếp
    } else {
      this.setTurnActions(true);    // chỉ còn kết thúc lượt
    }
  }

  /** Đi `steps` ô, cộng lương nếu đi ngang BẮT ĐẦU, rồi xử lý ô đáp xuống. */
  async advance(p, steps, dice) {
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
      await this.bc.show('QUA Ô BẮT ĐẦU',
        `<b>${p.name}</b> lãnh lương <span class="up">${money(GO_SALARY)}</span> từ ngân hàng.`, { ms: 2400 });
      await this.receiveFromBank(idx, GO_SALARY);
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
          await this.bc.show('BẾN ĐẬU', `<b>${p.name}</b> nghỉ chân miễn phí.`, { ms: 2000 });
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

  /** Rút thẻ Cơ Hội / Khí Vận — chỉ có hiệu ứng cộng hoặc trừ tiền. */
  async resolveCard(p, kind) {
    const st = this.state;
    const card = st.decks[kind].draw();
    audio.sfx('card');
    await cardModal(kind, card);

    if (card.amount > 0) {
      await this.bc.show(kind === 'chance' ? 'CƠ HỘI' : 'KHÍ VẬN',
        `<b>${p.name}</b>: ${card.text} <span class="up">+${money(card.amount)}</span>`);
      await this.receiveFromBank(p.id, card.amount);
    } else {
      await this.bc.show(kind === 'chance' ? 'CƠ HỘI' : 'KHÍ VẬN',
        `<b>${p.name}</b>: ${card.text} <span class="down">−${money(-card.amount)}</span>`, { kind: 'bad' });
      await this.payBank(p.id, -card.amount);
    }
  }

  // -------------------------------------------------------------- tiền nong

  /** Ngân hàng chi tiền cho người chơi — xu bay từ bảng ngân hàng vào ví. */
  async receiveFromBank(playerId, amount) {
    const p = this.state.players[playerId];
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

  async payOutOfJail() {
    const st = this.state;
    const p = st.current;
    await this.bc.show('NỘP TIỀN RA TÙ',
      `<b>${p.name}</b> nộp <span class="down">${money(JAIL_FINE)}</span> để được tự do.`);
    if (!(await this.payBank(p.id, JAIL_FINE))) { this.endTurn(); return; }
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
      if (st.over || p.bankrupt || p.inJail) { this.endTurn(); return; }
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
      if (!(await this.payBank(p.id, JAIL_FINE))) { this.endTurn(); return; }
      st.releaseFromJail(p);
      this.hud.refresh();
      await this.advance(p, d.sum, d);
      if (st.over || p.bankrupt || p.inJail) { this.endTurn(); return; }
      this.setTurnActions(true);
      return;
    }

    await this.bc.show('CHƯA RA ĐÔI',
      `<b>${p.name}</b> ngồi tiếp — đã cầu đôi hụt <b>${p.jailTurns}/${MAX_JAIL_TURNS}</b> lượt.`,
      { kind: 'bad' });
    // Hết lượt: lần cầu đôi kế tiếp phải chờ vòng sau.
    this.endTurn();
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
      accepted = await this.net.ask(targetId, 'trade-review', { offer }, { fallback: false });
    } else {
      await handoff(B.name, B.token.css, `${A.name} gửi một đề nghị giao dịch. Chuyền máy cho ${B.name} xem xét.`);
      accepted = await tradeReviewModal(st, offer);
    }

    if (!accepted) {
      await this.bc.show('TỪ CHỐI GIAO DỊCH',
        `<b>${B.name}</b> không đồng ý với đề nghị của <b>${A.name}</b>.`, { kind: 'bad', ms: 4200 });
      if (!this.net) {
        await handoff(A.name, A.token.css, `Đề nghị bị từ chối. Chuyền máy lại cho ${A.name}.`);
      }
      this.restoreActions();
      return;
    }

    // Kiểm tra lại tiền trước khi chốt (có thể đã đổi trong lúc thương lượng)
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

  /** Mời chủ mới chuộc các ô vừa nhận đang bị thế chấp. */
  async offerRedeem(playerId, ids) {
    if (ids.length === 0) return;
    const st = this.state;
    const p = st.players[playerId];
    const choice = await redeemPromptModal(st, playerId, ids);
    if (choice !== 'all') {
      await this.bc.show('CÒN NỢ NGÂN HÀNG',
        `<b>${p.name}</b> giữ ${ids.length} ô đang thế chấp — có thể chuộc sau ở mục Quản lý tài sản.`,
        { ms: 3600 });
      return;
    }
    const total = ids.reduce((s, id) => s + BOARD[id].redeem, 0);
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
    if (!this.checkGameOver()) this.endTurn();
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
