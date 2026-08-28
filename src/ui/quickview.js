/**
 * Xem nhanh một ô cờ — chiếm chỗ cũ của thanh nút hành động trong cột trái.
 *
 * Rê chuột lên ô nào trên bàn cờ thì ô ấy hiện ra đây ngay: thẻ ô, chủ sở hữu,
 * mức thuê đang áp dụng và các khoản tiền. Không rê ô nào thì bảng quay về ô mà
 * người đang tới lượt đứng, nên cột trái luôn nói được điều gì đó có ích.
 * Muốn xem đầy đủ thì bấm vào ô để mở hộp thoại chi tiết như cũ.
 */
import { BOARD, GROUPS, money } from '../data/board.js';
import { tileCardUrl } from './deed.js';
import { houseSvg, hotelSvg } from '../render/glyphs.js';
import { isCorner } from '../render/geometry.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const TYPE_LABEL = {
  property: 'Ô đất', station: 'Bến · Nhà ga', utility: 'Công ích',
  chance: 'Thẻ Cơ Hội', chest: 'Thẻ Khí Vận', tax: 'Ô thuế', corner: 'Ô góc',
};

const IDLE_HTML = `
  <div class="qv-head"><span>Xem nhanh</span></div>
  <div class="qv-idle">Rê chuột lên một ô trên bàn cờ<br>để xem nhanh giá và chủ sở hữu.</div>`;

const CORNER_NOTE = {
  0:  'Đi ngang hay dừng lại đều lãnh lương 200$.',
  10: 'Ghé thăm thì vô sự. Bị giải vào thì nộp 50$, đổ ra đôi, hoặc ngồi đủ 3 lượt.',
  20: 'Nghỉ chân — không mất tiền, cũng không được tiền.',
  30: 'Về thẳng Khám Lớn, không lãnh lương dọc đường.',
};

/** Màu ô để chấm màu bên cạnh nhãn loại ô. */
function tileHex(t) {
  if (t.type === 'property') return t.groupHex;
  if (t.type === 'station') return '#27418C';
  if (t.type === 'utility') return '#2E6B52';
  if (t.type === 'chance') return '#7C1E14';
  if (t.type === 'chest') return '#2E6B52';
  if (t.type === 'tax') return '#B3322A';
  return '#C8A048';
}

export class QuickView {
  constructor(state) {
    this.el = document.getElementById('quickview');
    this.state = state ?? null;
    /** Ô đang rê chuột (null = không rê ô nào). */
    this.hovered = null;
    this.render();
  }

  /** Không rê ô nào thì bảng nói về ô người đang tới lượt đứng. */
  get fallback() {
    const st = this.state;
    return st && !st.over && !st.current?.bankrupt ? st.current.pos : null;
  }

  setState(state) { this.state = state; this.render(); }

  /** Chuột rê sang ô mới (hoặc rời bàn cờ với `id == null`). */
  show(id) {
    if (id === this.hovered) return;
    this.hovered = id;
    this.render();
  }

  /** Vẽ lại theo trạng thái mới (gọi kèm mỗi lần HUD cập nhật). */
  refresh() { this.render(); }

  render() {
    if (!this.el) return;
    const id = this.hovered ?? this.fallback;
    const html = id == null ? IDLE_HTML : this.cardHtml(id);
    // Chỉ vẽ lại khi nội dung thật sự đổi — HUD refresh liên tục lúc tiền bay,
    // dựng lại DOM mỗi lần sẽ làm bảng nhấp nháy.
    if (html === this.lastHtml) return;
    this.lastHtml = html;
    this.el.innerHTML = html;
  }

  cardHtml(id) {
    const st = this.state;
    const t = BOARD[id];
    const owner = st?.ownerOf(id) ?? null;
    const houses = st?.housesOn(id) ?? 0;
    const mortgaged = st?.isMortgaged(id) ?? false;
    const live = this.hovered != null;

    const badges = [];
    if (houses === 5) badges.push(`<span class="deed-badge hotel">${hotelSvg()} Khách sạn</span>`);
    else if (houses > 0) badges.push(`<span class="deed-badge house">${houseSvg().repeat(houses)}</span>`);
    if (mortgaged) badges.push('<span class="deed-badge mort">Thế chấp</span>');

    let ownerLine = '';
    if (t.ownable) {
      ownerLine = owner
        ? `<div class="qv-owner" style="color:${owner.token.css}">
             <span class="dot" style="background:${owner.token.css}"></span>${esc(owner.name)}</div>`
        : '<div class="qv-owner free"><span class="dot" style="background:#5A4632"></span>Chưa có chủ</div>';
    }

    const kind = t.type === 'property'
      ? `${TYPE_LABEL[t.type]} · ${GROUPS[t.color_group].name}`
      : TYPE_LABEL[t.type];

    return `
      <div class="qv-head">
        <span>${live ? 'Xem nhanh' : 'Đang đứng tại'}</span>
        <span class="qv-no">Ô ${id}</span>
      </div>
      <span class="qv-thumb${isCorner(id) ? ' corner' : ''}"
            style="background-image:url('${tileCardUrl(id, 180)}')"></span>
      <div class="qv-main">
        <span class="qv-name">${esc(t.short.replace(/\n/g, ' '))}</span>
        ${t.modern ? `<span class="qv-modern">${esc(t.modern)}</span>` : ''}
        <span class="qv-kind"><span class="swatch" style="background:${tileHex(t)}"></span>${esc(kind)}</span>
        ${ownerLine}
        ${badges.length ? `<span class="qv-badges">${badges.join('')}</span>` : ''}
      </div>
      ${this.rowsHtml(id, owner, mortgaged)}
      ${this.noteHtml(id)}`;
  }

  /** Các dòng tiền — mức đang thực sự áp dụng được tô sáng. */
  rowsHtml(id, owner, mortgaged) {
    const st = this.state;
    const t = BOARD[id];
    const rows = [];

    if (t.ownable) {
      if (!owner) {
        rows.push({ label: 'Giá mua', value: money(t.price), cls: 'now' });
        rows.push({ label: 'Thuê khi có chủ', value: this.rentText(id, 1) });
      } else if (mortgaged) {
        rows.push({ label: 'Đang thế chấp', value: 'miễn thuê', cls: 'warn' });
        rows.push({ label: 'Chuộc lại', value: money(t.redeem) });
      } else {
        rows.push({ label: 'Thuê phải trả', value: this.rentText(id), cls: 'now' });
        rows.push({ label: 'Giá mua', value: money(t.price) });
      }
      if (t.type === 'property') rows.push({ label: 'Giá một căn nhà', value: money(t.house_cost) });
      if (!mortgaged) rows.push({ label: 'Thế chấp được', value: money(t.mortgage) });
    } else if (t.type === 'tax') {
      rows.push({ label: 'Phải nộp', value: money(t.tax_amount), cls: 'warn' });
    }

    if (!rows.length) return '';
    return `<div class="qv-rows">${rows.map((r) => `
        <div class="qv-row ${r.cls ?? ''}"><span>${r.label}</span><b>${r.value}</b></div>`).join('')}</div>`;
  }

  /**
   * Tiền thuê hiện tại. Ô công ích ăn theo xí ngầu nên ghi hệ số thay vì số tiền.
   * @param {number} [assumeOwners] giả định số ô cùng loại chủ đang giữ (ô chưa có chủ)
   */
  rentText(id, assumeOwners) {
    const st = this.state;
    const t = BOARD[id];
    if (t.type === 'utility') {
      const n = assumeOwners ?? (st?.ownerOf(id) ? st.utilityCount(st.ownerOf(id).id) : 1);
      return `${n >= 2 ? 10 : 4} × xí ngầu`;
    }
    if (t.type === 'station') {
      const n = assumeOwners ?? (st?.ownerOf(id) ? st.stationCount(st.ownerOf(id).id) : 1);
      return money([0, 25, 50, 100, 200][Math.min(4, Math.max(1, n))]);
    }
    if (!st || !st.ownerOf(id)) return money(t.rents[0]);
    return money(st.rentFor(id, 7));
  }

  /** Ghi chú cuối bảng: luật của ô + ai đang đứng ở đó. */
  noteHtml(id) {
    const st = this.state;
    const t = BOARD[id];
    const bits = [];
    if (t.type === 'corner') bits.push(CORNER_NOTE[id]);
    if (t.type === 'chance' || t.type === 'chest') {
      bits.push('Bóc một thẻ ngẫu nhiên: được thưởng hoặc phải chi tiền.');
    }
    const here = st ? st.players.filter((p) => !p.bankrupt && p.pos === id) : [];
    if (here.length) {
      bits.push(`<span class="qv-here">Đang đứng: ${here.map((p) => esc(p.name)).join(', ')}</span>`);
    }
    return bits.length ? `<div class="qv-note">${bits.join('<br>')}</div>` : '';
  }
}
