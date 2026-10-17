/**
 * Hội Đồng Hồn Ma: người đã phá sản bầu thẻ Thời Cuộc kế tiếp.
 *
 * Phiên họp không chặn lượt: engine bốc ba thẻ, ghi vào `state.ghostVote`,
 * báo bên diễn mở hộp bầu ở máy của người đã phá sản, rồi đi tiếp. Phiếu là
 * action ngoài luồng (`ghost-vote`), về lúc nào ghi lúc ấy.
 *
 * Luật (ai được bầu, phiếu nặng bao nhiêu) nằm ở `core/events.js`.
 */
import { GHOST_VOTE } from '../data/events.js';
import { ghostVoteDue, openGhostVote, castGhostVote } from '../core/events.js';

export class GhostRules {
  /** @param {import('./game.js').Rules} g */
  constructor(g) { this.g = g; }

  get st() { return this.g.st; }

  /**
   * Ghế hồn ma còn ngồi trước máy. Ghế máy phá sản không bầu: không ai ngồi
   * đó để bấm. Bản online bỏ người đã rời phòng.
   */
  presentGhosts() {
    const e = this.g.e;
    return this.st.players.filter((p) => p.bankrupt && !e.isBot(p.id) && e.isLive(p.id)).map((p) => p.id);
  }

  /** Cuối lượt: tới lúc thì mở phiên họp. */
  maybeOpen(justFired) {
    const st = this.st;
    const seats = this.presentGhosts();
    if (!seats.length || !ghostVoteDue(st, justFired)) return;
    const gv = openGhostVote(st);
    if (!gv) return;
    this.g.sync();
    this.g.fx('ghostcall', { n: gv.n, cards: gv.cards, ms: st.settings.timing?.ghostMs ?? GHOST_VOTE.ms, seats });
    this.g.say('HỘI ĐỒNG HỒN MA', 'Người đã phá sản đang bầu thẻ Thời Cuộc kế tiếp.', { ms: 2600 });
  }

  /** Một lá phiếu. Bầu lại thì phiếu sau đè phiếu trước. */
  vote(seat, v) {
    if (!v || typeof v !== 'object') return false;
    if (!castGhostVote(this.st, { n: v.n, seat, id: v.id })) return false;
    this.g.fx('ghostvote', { n: v.n, seat, id: v.id });
    this.g.sync();
    return true;
  }
}
