/**
 * Kho kỹ năng kích hoạt — phần thuần dữ liệu: ô nào có trong kho, bấm được
 * không, vì sao không, kiểu ô gì.
 *
 * Dùng ở hai nơi: máy khách vẽ hộp "Dùng kỹ năng" từ đây (thêm chữ, bảng
 * chọn), còn engine soát lại bản nháp máy khách gửi lên bằng chính danh sách
 * này — ô nào lúc này không `ok` thì phần nháp của nó bị bỏ qua.
 *
 * Ba kiểu ô:
 *   - bật / tắt (`switch`, không `once`): Cò Quay, Xe Đạp;
 *   - giữ lựa chọn (`val`): Xổ Số (số), Góp Vốn (người);
 *   - làm một lần lúc Chốt (`once`): Tất Tay (cửa), Xuyên Việt / Nhặt Hàng
 *     Thừa / Siết Nợ (ô);
 *   - việc làm ngay (`act`): Ngồi Yên trong tù.
 */
import {
  skillById, has, param, ready, usesLeft, leftoverOffers, forecloseOffers, isOff, switchable, waitText,
} from '../core/skills.js';

/** Còn ngồi yên được không (nút Ngồi Yên trong tù). */
export function canSit(p) { return has(p, 'cnS2') && p.inJail && (p.jailSits ?? 0) < param(p, 'cnS2').stay; }
export function sitsLeft(p) { return param(p, 'cnS2').stay - (p.jailSits ?? 0); }

/** Cược / Tất Tay đang chờ lần lắc kế tiếp, còn đúng lượt này của đúng người này. */
export function pendingBet(st, b) {
  return b && b.turnNo === st.turnNo && b.seat === st.turn ? b : null;
}

/**
 * Các ô của kho. Ô đang tắt vẫn phải ghi đúng tình trạng như lúc bật (còn mấy
 * lần, chờ bao lâu), mà `ready` / `usesLeft` đều đi qua `has()`, coi kỹ năng
 * tắt là chưa học — nên tính trên danh sách tắt rỗng rồi trả lại.
 *
 * @returns {Array<{id:string, ok:boolean, why?:string, switch?:boolean, once?:boolean,
 *   act?:boolean, val?:any, kind?:string, offers?:number}>}
 */
export function kitCells(st, p, rolled) {
  const offs = p.skillOff;
  p.skillOff = [];
  try { return listCells(st, p, rolled); } finally { p.skillOff = offs; }
}

function listCells(st, p, rolled) {
  const out = [];
  const jail = p.inJail;
  const wait = (id) => waitText(p, id);
  const beforeRoll = rolled ? 'Chỉ dùng trước khi lắc' : jail ? 'Không dùng khi đang ở tù' : '';
  const cell = (id, o) => { if (has(p, id)) out.push({ id, switch: switchable(skillById(id)), ok: true, ...o }); };
  const toggle = (id) => cell(id, ready(p, id) ? {} : { ok: false, why: wait(id) });

  const all = pendingBet(st, st.flow?.allIn);
  const PARITY = { even: 'Chẵn', odd: 'Lẻ' };
  cell('ddU', all ? { ok: false, why: `Đã tất tay cửa ${PARITY[all.pick]}` }
    : !ready(p, 'ddU') ? { ok: false, why: wait('ddU') }
      : beforeRoll ? { ok: false, why: beforeRoll }
        : { once: true, kind: 'parity' });
  cell('dhU', !ready(p, 'dhU') ? { ok: false, why: wait('dhU') }
    : beforeRoll ? { ok: false, why: beforeRoll }
      : { once: true, kind: 'tile' });
  toggle('dhS1');
  cell('ddV', { val: p.lotto, kind: 'lotto' });
  toggle('ddS2');
  const offers = leftoverOffers(st, p).length;
  cell('dcS1', usesLeft(p, 'dcS1') <= 0 ? { ok: false, why: wait('dcS1') }
    : jail ? { ok: false, why: 'Không dùng khi đang ở tù' }
      : !offers ? { ok: false, why: 'Không có ô trống nào người khác đang đứng, hoặc bạn chưa đủ tiền' }
        : { once: true, kind: 'tile', offers });
  const live = (v) => (v != null && !st.players[v]?.bankrupt ? v : null);
  cell('dcS2', { val: live(p.stake), kind: 'stake' });
  const liens = forecloseOffers(st, p).length;
  cell('dcV', usesLeft(p, 'dcV') <= 0 ? { ok: false, why: wait('dcV') }
    : jail ? { ok: false, why: 'Không dùng khi đang ở tù' }
      : !liens ? { ok: false, why: 'Chưa ai đang túng tiền, hoặc bạn chưa đủ tiền siết ô nào của họ' }
        : { once: true, kind: 'tile', offers: liens });
  cell('cnS2', canSit(p)
    ? { act: true }
    : { ok: false, why: !jail ? 'Chỉ dùng khi đang ở tù' : 'Đã ngồi yên đủ số lượt lần này' });
  return out;
}

/** Trạng thái bật của một ô lúc mở kho — điểm xuất phát của bản nháp. */
export function draftStart(p, c) {
  return { on: c.once ? false : c.switch ? !isOff(p, c.id) : true, val: c.once ? null : c.val };
}
