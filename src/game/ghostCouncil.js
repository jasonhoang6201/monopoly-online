/**
 * Hội Đồng Hồn Ma: mở phiên họp, đưa hộp bầu tới máy của người đã phá sản,
 * gom phiếu về máy cầm lái.
 *
 * Phiên họp không chặn lượt. Máy cầm lái bốc ba thẻ, ghi vào `state.ghostVote`,
 * phát ảnh chụp rồi đi tiếp; phiếu về lúc nào thì ghi lúc ấy. Lượt có trao
 * sang người khác giữa chừng thì máy cầm lái mới vẫn nhận phiếu, vì phiếu
 * phát cho **cả phòng** chứ không gửi riêng một máy, và mọi máy đều ghi vào
 * bản sao của mình.
 *
 * Luật (ai được bầu, phiếu nặng bao nhiêu) nằm ở `core/events.js`.
 */
import { EVENT_BY_ID, GHOST_VOTE } from '../data/events.js';
import { ghostVoteDue, openGhostVote, castGhostVote } from '../core/events.js';
import { ghostVotePanel } from '../ui/ghostVote.js';
import { audio } from '../audio/audio.js';

export class GhostCouncil {
  /** @param {import('./controller.js').Game} game */
  constructor(game) {
    this.g = game;
    /** Hộp bầu đang mở trên máy này. */
    this.panel = null;
    /** Số phiên của hộp đang mở — phiếu của phiên khác không vẽ lên đây. */
    this.panelN = null;
    /** Hộp đứng bao lâu; bài kiểm thử hạ xuống cho nhanh. */
    this.ms = GHOST_VOTE.ms;
  }

  get st() { return this.g.state; }

  /**
   * Ghế hồn ma còn ngồi trước máy. Bản online bỏ người đã thoát phòng hay rớt
   * mạng: mở phiên họp cho một cái ghế trống chỉ thêm một dòng thông báo
   * không ai đáp.
   */
  presentGhosts() {
    const st = this.st;
    const net = this.g.net;
    // Ghế máy phá sản không bầu: không ai ngồi đó để bấm
    return st.players.filter((p) => p.bankrupt && !this.g.bot.is(p.id)
      && (!net || (net.seats[p.id] && !net.seats[p.id].kicked && net.seats[p.id].online)))
      .map((p) => p.id);
  }

  /** Ghế hồn ma bầu được trên máy này. */
  localGhosts() {
    const st = this.st;
    if (!this.g.net) return st.players.filter((p) => p.bankrupt && !this.g.bot.is(p.id)).map((p) => p.id);
    const me = st.players[this.g.mySeat];
    return me?.bankrupt ? [me.id] : [];
  }

  /**
   * Cuối lượt, trên máy cầm lái: tới lúc thì mở phiên họp.
   * @param {boolean} justFired lượt này vừa nổ một thẻ
   */
  maybeOpen(justFired) {
    const st = this.st;
    if (!this.presentGhosts().length || !ghostVoteDue(st, justFired)) return;
    const gv = openGhostVote(st);
    if (!gv) return;
    this.g.sync();
    const call = { n: gv.n, cards: gv.cards, ms: this.ms };
    this.g.netEmit('ghostcall', call);
    this.onCall(call);
    /* Người còn sống cũng nên biết hồn ma đang nhúng tay — chỉ không biết họ
       bầu thẻ nào. Không `await`: dòng này không giữ nhịp lượt. */
    this.g.bc.show('HỘI ĐỒNG HỒN MA',
      'Người đã phá sản đang bầu thẻ Thời Cuộc kế tiếp.', { ms: 2600 });
  }

  /** Phiên họp mở — máy nào có hồn ma thì dựng hộp bầu. */
  onCall({ n, cards, ms }) {
    const seats = this.localGhosts();
    const list = (cards ?? []).map((id) => EVENT_BY_ID[id]).filter(Boolean);
    if (!seats.length || list.length < 2) return;
    this.panel?.close();
    audio.sfx('turn');
    const votes = this.st.ghostVote?.n === n ? this.st.ghostVote.votes : {};
    const panel = ghostVotePanel({
      state: this.st, cards: list, seats, votes, ms: ms ?? this.ms,
      onVote: (seat, id) => this.vote({ n, seat, id }),
    });
    this.panel = panel;
    this.panelN = n;
    panel.closed.then(() => { if (this.panel === panel) this.panel = null; });
  }

  /** Bấm một thẻ trên máy này. */
  vote(msg) {
    this.g.netEmit('ghostvote', msg);
    this.onVote(msg);
  }

  /**
   * Phiếu tới (của máy này hoặc máy khác). Máy nào cũng ghi vào bản sao, chỉ
   * máy cầm lái phát ảnh chụp: máy ghi trước rồi mới thành máy cầm lái thì
   * ảnh chụp kế tiếp của nó đã mang sẵn phiếu ấy.
   */
  onVote(msg) {
    if (this.panel && this.panelN === msg.n) this.panel.setVote(msg.seat, msg.id);
    if (castGhostVote(this.st, msg) && this.g.isDriver()) this.g.syncSoon();
  }

  /** Ván hạ màn hoặc dựng lại: đóng hộp đang mở. */
  close() { this.panel?.close(); this.panel = null; }
}
