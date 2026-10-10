/**
 * Hộp thoại cây kỹ năng.
 *
 * Năm nhánh đứng thành năm cột, mọc từ gốc ở đáy lên, tối thượng trên đỉnh.
 * Mọi thứ trên cây (ô, đường nối, đầu cột) đặt theo một hệ toạ độ cố định
 * 1400×700 rồi quy ra phần trăm, nên cây co giãn nguyên khối theo bề ngang hộp
 * thoại — đường nối SVG và ô HTML không bao giờ trượt khỏi nhau.
 *
 * Rê chuột lên ô: hiện tên và giá. Bấm (hoặc chạm, vì màn cảm ứng không có
 * rê): mở thẻ chi tiết, trên đó có nút Huỷ và Nâng cấp. Thẻ chi tiết chính là
 * bước xác nhận — người chơi đã đọc tác dụng và giá rồi mới bấm được nâng cấp.
 * Ô đã học thì nút đó thành "Lên level", tới level 3 thì hết nút.
 *
 * Cùng một cây dựng ở hai chỗ: hộp học kỹ năng (`openSkillTree`) và tab Cây kỹ
 * năng trong bảng tài sản của người chơi (`mountSkillTree` với `readOnly`) —
 * bản chỉ xem không có nút học, không có tẩy điểm, ô chưa học đều mờ như nhau
 * vì "học được ngay" chỉ có nghĩa với chính chủ cây.
 *
 * Kỹ năng bấm để dùng học xong thì nằm **tắt**; kỹ năng tự động học là chạy.
 * Cây chỉ hiện trạng thái bật / tắt, không có công tắc: bật tắt và chọn cách
 * dùng (cửa chẵn / lẻ, số tiền cược…) chỉ làm trong kho "Dùng kỹ năng". Hai
 * chỗ cùng bật được thì cây bật mà không hỏi cách dùng, kho lại giữ lựa chọn
 * cũ, hai bên lệch nhau. Tẩy điểm chỉ có trong lượt của chính chủ cây
 * (`manage`); ngoài lượt vẫn mở cây để học và lên level.
 */
import './skillTree.css';
import { openModal, isTyping } from './modal.js';
import { skillIcon } from './skillIcons.js';
import { BRANCHES, SKILLS, KINDS, RESPEC_FEE, MAX_LEVEL } from '../data/skills.js';
import {
  skillById, branchByKey, skillCost, skillState, canLearn, learnSkill, levelOf,
  canLevelUp, nextCost, lvParams, levelLine, effectLine, spentIn, branchMax, fillText,
  canRespec, respec, growNeed, growText, growProgress, rivalUlt,
  isOff, switchable, skillNow,
} from '../core/skills.js';
import { audio } from '../audio/audio.js';
import { money } from '../data/board.js';

/* ------------------------------------------------------------ hình học */

/*
 * Khung 2:1 chứ không 10:7: hộp thoại trên màn máy tính rộng hơn cao nhiều,
 * khung hẹp thì co theo chiều cao và chừa hai bên trống. Mỗi cột rộng 280 để
 * ba ô cấp 2 đứng cạnh nhau không đè huy hiệu giá lên nhau. Cỡ ô trong CSS
 * tính theo đơn vị `--u` = 1/1000 bề ngang của khung 1000 cũ, nên đổi W ở đây
 * thì phải đổi số chia của `--u` trong skillTree.css theo.
 */
const W = 1400;
const H = 700;
const COL_X = [140, 420, 700, 980, 1260];
/* Hàng nhánh phụ (ô cấp 3 slot 'c' / 'd') đứng riêng giữa cấp 2 và cấp 3:
   mỗi cột chỉ đủ chỗ cho 3 ô cạnh nhau, dồn 4 ô lên một hàng thì ô đè sang
   cột bên cạnh. */
const TIER_Y = { 4: 166, 3: 296, side: 392, 2: 488, 1: 588 };
/**
 * Độ lệch khỏi trục cột theo `slot`. Mỗi ô một cha (xem `requires` trong
 * data/skills.js), nên ô con đứng gần thẳng trên ô cha và đường nối gần như
 * dựng đứng: 2a → 3a → tối thượng a ở bên trái, 2b → 3b → tối thượng b ở giữa,
 * 2b → nhánh phụ c chếch trái giữa hai đường ấy, 2c → nhánh phụ d bên phải.
 * Khoảng hở giữa đường nối và ô gần nhất ≥ 11 đơn vị (ô rộng 68).
 */
const SLOT_DX = {
  2: { a: -90, b: 0, c: 90 },
  3: { a: -80, b: 10, c: -40, d: 90 },
  // Ô tối thượng xoay 45°: đường chéo ≈ 116, hai ô phải cách nhau hơn thế
  4: { a: -80, b: 45 },
};

/** Ô nhánh phụ: cấp 3 slot 'c' / 'd' — 2 điểm, không dẫn lên tối thượng. */
const isSide = (s) => s.tier === 3 && (s.slot === 'c' || s.slot === 'd');

/** Toạ độ của một ô trong hệ 1400×700. */
function posOf(s) {
  const col = BRANCHES.findIndex((b) => b.key === s.branch);
  return { x: COL_X[col] + (SLOT_DX[s.tier]?.[s.slot] ?? 0), y: TIER_Y[isSide(s) ? 'side' : s.tier] };
}

const pct = ({ x, y }) => `left:${(x / W) * 100}%;top:${(y / H) * 100}%`;

/** Đường cong nối từ ô dưới lên ô trên — cong theo chiều dọc cho mềm mắt. */
function curve(a, b) {
  const my = (a.y + b.y) / 2;
  return `M${a.x} ${a.y} C${a.x} ${my} ${b.x} ${my} ${b.x} ${b.y}`;
}

/** Danh sách cạnh. Ô cấp 1 không có cạnh nào: cây không vẽ nút gốc chung. */
const EDGES = SKILLS.flatMap((s) => (s.requires ?? []).map((r) => ({ from: r, to: s.id })));

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const TIER_NAME = { 1: 'Cấp 1', 2: 'Cấp 2', 3: 'Cấp 3', 4: 'Tối thượng' };
const tierName = (s) => (isSide(s) ? `${TIER_NAME[s.tier]} · Nhánh phụ` : TIER_NAME[s.tier]);

/** Tiến độ tới level kế tiếp của ô đã học: "Kiếm được 150$ từ kỹ năng này (120/150$)". */
function growLine(player, s, lv, st) {
  return `${growText(s, lv)} (${growProgress(player, s, lv, st)})`;
}

/** Nhãn thời hạn: vĩnh viễn, reset ở ô Bắt Đầu, hoặc số lần dùng. */
const spanTag = (s) => (s.uses
  ?? (s.span === 'lap' ? 'Reset mỗi lần qua ô Bắt Đầu' : 'Vĩnh viễn'));

/* ------------------------------------------------------------ dựng cây */

function buildTree(player, readOnly, manage) {
  const el = document.createElement('div');
  el.className = 'st' + (readOnly ? ' st-view' : '');

  const heads = BRANCHES.map((b, i) => `
    <div class="st-head" style="${pct({ x: COL_X[i], y: 0 })};--c:${b.color}" data-branch="${b.key}">
      <span class="st-emblem">${skillIcon(b.key)}</span>
      <b class="st-bname">${esc(b.name)}</b>
      <span class="st-depth"></span>
    </div>`).join('');

  const nodes = SKILLS.map((s) => {
    const b = branchByKey(s.branch);
    return `
      <button type="button" class="st-node${s.tier === 4 ? ' ult' : ''}" data-id="${s.id}"
              style="${pct(posOf(s))};--c:${b.color}" aria-label="${esc(s.name)}">
        <span class="st-face">${skillIcon(s.icon)}</span>
        <span class="st-cost">${skillCost(s)}</span>
        <span class="st-lock">${skillIcon('lock')}</span>
        <span class="st-lv" aria-hidden="true">${'<i></i>'.repeat(MAX_LEVEL)}</span>
      </button>`;
  }).join('');

  const edges = EDGES.map((e) => {
    const to = skillById(e.to);
    const a = posOf(skillById(e.from));
    const col = branchByKey(to.branch).color;
    return `<path class="st-edge" data-from="${e.from ?? ''}" data-to="${e.to}"
                  style="--c:${col}" d="${curve(a, posOf(to))}" pathLength="100"/>`;
  }).join('');

  el.innerHTML = `
    <div class="st-bar">
      <span class="st-who">${esc(player.name)}</span>
      <div class="st-points" aria-live="polite">
        <span class="st-gem"></span>
        <b class="st-pnum">0</b>
        <span class="st-plabel">điểm kỹ năng</span>
      </div>
      <span class="st-hint">${readOnly ? 'Bấm vào một ô để xem tác dụng và level'
        : manage ? '+1 điểm mỗi lần đi qua ô Bắt Đầu · kỹ năng bấm để dùng bật trong kho Dùng kỹ năng'
          : 'Chưa tới lượt bạn: học và lên level được, tẩy điểm thì chờ tới lượt'}</span>
      <span class="st-count"></span>
      ${readOnly || !manage ? '' : `<button type="button" class="btn btn-sm btn-ghost st-respec" data-act="respec-open"
              title="Hoàn lại toàn bộ điểm đã tiêu để học lại từ đầu">Tẩy điểm</button>`}
      <button type="button" class="st-close" data-act="close" title="Đóng (Esc)" aria-label="Đóng cây kỹ năng">✕</button>
    </div>
    <div class="st-wrap">
      <div class="st-stage">
        <svg class="st-links" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${edges}</svg>
        ${heads}
        ${nodes}
        <div class="st-tip" role="tooltip"></div>
      </div>
    </div>
    <div class="st-detail" hidden></div>`;
  return el;
}

/* ------------------------------------------------------------ thẻ chi tiết */

function detailHtml(player, s, readOnly, manage, st) {
  const b = branchByKey(s.branch);
  const state = skillState(player, s.id);
  const lv = levelOf(player, s.id);
  const check = canLearn(player, s.id, st);
  const cost = nextCost(player, s);
  const maxed = lv >= MAX_LEVEL;
  const kind = KINDS[s.kind];
  /* Số tiền sẽ nhận / phải trả tính trên thế cờ hiện tại — người chơi khỏi
     tự nhân "3% + 1% mỗi lần qua" trong đầu. Cần bàn cờ; thiếu thì bỏ mục. */
  const now = skillNow(st, player, s);

  /* Điều kiện ghi thành từng dòng có dấu tích, để người chơi thấy ngay mình
     đang vướng ở đâu thay vì chỉ thấy một nút bấm bị mờ. */
  const conds = [];
  if (s.requires?.length) {
    const have = s.requires.some((r) => player.skills.includes(r));
    const names = s.requires.map((r) => `<b>${esc(skillById(r).name)}</b>`).join(' hoặc ');
    conds.push({ ok: have, text: `Đã học ${names}` });
  } else {
    conds.push({ ok: true, text: 'Không cần học kỹ năng nào trước' });
  }
  if (s.tier === 4 && !lv) {
    const other = SKILLS.find((x) => x.tier === 4 && x.branch === s.branch && x.id !== s.id);
    conds.push({ ok: !rivalUlt(player, s), text: `Chưa học tối thượng kia: <b>${esc(other.name)}</b>` });
  }
  if (lv && !maxed) {
    conds.push({ ok: !growNeed(player, s, lv + 1, st), text: `Lên level ${lv + 1}: ${esc(growLine(player, s, lv + 1, st))}` });
  }
  if (!maxed) {
    conds.push({
      ok: player.skillPoints >= cost,
      text: `Đủ điểm${lv ? ` lên level ${lv + 1}` : ''}: cần <b>${cost}</b>, đang có <b>${player.skillPoints}</b>`,
    });
  }

  /* Người chơi hỏi nhiều nhất là "có phải bấm không, bấm mấy lần" — nên nói
     thẳng ra thay vì chỉ ghi nhãn. */
  const ultNote = s.tier === 4 ? ' Mỗi nhánh có hai tối thượng, <b>chỉ được học một</b>; muốn đổi thì tẩy điểm.'
    : isSide(s) ? ' Ô nhánh phụ: không dẫn lên tối thượng, học vì tác dụng của chính nó.' : '';
  const howto = (s.kind === 'passive'
    ? (s.span === 'lap'
      ? 'Tự động, không cần bấm. Hiệu ứng <b>reset và chạy lại mỗi lần bạn qua ô Bắt Đầu</b>.'
      : s.span === 'cooldown'
        ? `Tự động, không cần bấm. <b>${esc(s.uses)}</b>.`
        : 'Tự động, không cần bấm. Hiệu ứng <b>vĩnh viễn</b> từ lúc học tới hết ván.')
    : s.auto
      ? `Không cần bật: học xong là game tự hỏi bạn ${esc(s.when)}, muốn dùng thì chọn, không thì bỏ qua. <b>${esc(s.uses)}</b>.`
      : s.once
        ? `Không cần bật: mở kho <b>Dùng kỹ năng</b> trên thanh nút, bấm vào ô để chọn rồi bấm Chốt, kỹ năng chạy ngay lúc ấy. `
        + `Dùng được ${esc(s.when)}. <b>${esc(s.uses)}</b>.`
      : `Học xong kỹ năng nằm <b>tắt</b> trong kho <b>Dùng kỹ năng</b> trên thanh nút. Trong kho, bấm vào ô để bật (ô có màu) `
      + `hoặc chọn cách dùng, chọn "Không" là tắt; bấm Chốt để áp dụng. Dùng được ${esc(s.when)}. <b>${esc(s.uses)}</b>.`
      + (s.levels.some((x) => x.charges || x.cooldown) ? ' Dùng hết lượt thì cuối lượt tự về tắt.' : '')) + ultNote;

  /* Ba level xếp thành ba dòng: level đang có tô sáng, level kế tiếp đánh dấu
     để người chơi so được mình sẽ nhận thêm gì trước khi bấm. Số dạng khoảng
     chỉ có ở level 1 — nhìn ba dòng là thấy level 2 chốt số, level 3 cao hơn. */
  const levels = [1, 2, 3].map((n) => `
    <li class="${n <= lv ? 'have' : ''}${n === lv + 1 && !readOnly ? ' next' : ''}">
      <span class="sd-lvn">Lv ${n}</span><span>${esc(levelLine(s, n))}${
        n > 1 && n > lv ? `<em class="sd-need">cần: ${esc(growText(s, n))} + 1 điểm</em>` : ''}</span>
    </li>`).join('');

  const after = player.skillPoints - cost;
  const upLabel = lv ? `Lên level ${lv + 1}` : 'Nâng cấp';
  const off = lv && isOff(player, s.id);
  const onTag = lv && switchable(s) ? `<span class="sd-onoff ${off ? 'is-off' : 'is-on'}">${off ? 'Đang tắt' : 'Đang bật'}</span>` : '';
  // Cây chỉ báo trạng thái; bật / tắt nằm ở kho Dùng kỹ năng (xem đầu tệp)
  const toggle = !lv || readOnly || !switchable(s) ? ''
    : '<span class="sd-wait">Bật / tắt trong kho Dùng kỹ năng</span>';
  const foot = readOnly
    ? `${lv ? `<div class="sd-learned">${skillIcon('check')} Level ${lv}/${MAX_LEVEL}${onTag}</div>` : '<div class="sd-learned sd-not">Chưa học</div>'}
       <button type="button" class="btn btn-ghost" data-act="cancel" data-primary>Đóng</button>`
    : maxed
      ? `<div class="sd-learned">${skillIcon('check')} Đã đạt level ${MAX_LEVEL}${onTag}</div>
         ${toggle}
         <button type="button" class="btn btn-ghost" data-act="cancel" data-primary>Đóng</button>`
      : `${lv ? `<div class="sd-learned">${skillIcon('check')} Level ${lv}/${MAX_LEVEL}${onTag}</div>` : ''}
         ${toggle}
         <button type="button" class="btn btn-ghost" data-act="cancel">Huỷ<kbd class="btn-key">Esc</kbd></button>
         <button type="button" class="btn btn-gold" data-act="learn" data-primary ${check.ok ? '' : 'disabled'}>
           ${upLabel} · −${cost} điểm${check.ok ? '<kbd class="btn-key">⏎</kbd>' : ''}
         </button>`;

  return `
    <div class="sd-card${s.tier === 4 ? ' ult' : ''}${off ? ' off' : ''} is-${readOnly && !lv ? 'locked' : state}" style="--c:${b.color}" role="dialog"
         aria-label="${esc(s.name)}">
      <div class="sd-top">
        <span class="sd-icon">${skillIcon(s.icon)}</span>
        <div class="sd-title">
          <span class="sd-eyebrow">${esc(b.name)} · ${tierName(s)}${lv ? ` · Level ${lv}` : ''}</span>
          <h3>${esc(s.name)}</h3>
          <span class="sd-tags">
            <span class="sd-kind k-${s.kind}">${kind.name}</span>
            <span class="sd-uses">${esc(spanTag(s))}</span>
          </span>
        </div>
        ${readOnly || maxed ? '' : `<span class="sd-price"><b>${cost}</b><i>điểm</i></span>`}
      </div>

      <div class="sd-body">
        <section>
          <h4>Tác dụng${lv ? ` (level ${lv})` : ''}</h4>
          <p class="sd-effect">${esc(effectLine(s, lv || 1))}</p>
        </section>
        ${now.length ? `<section>
          <h4>${lv ? 'Số liệu lúc này' : 'Nếu học bây giờ'}</h4>
          <dl class="sd-now">${now.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
        </section>` : ''}
        <section>
          <h4>Level</h4>
          <ul class="sd-lvs">${levels}</ul>
        </section>
        <section>
          <h4>Cách dùng</h4>
          <p>${howto}</p>
        </section>
        ${readOnly ? '' : `<section>
          <h4>Điều kiện</h4>
          <ul class="sd-conds">
            ${conds.map((c) => `<li class="${c.ok ? 'ok' : 'no'}">${c.ok ? '✓' : '✕'} ${c.text}</li>`).join('')}
          </ul>
          ${!maxed && check.ok ? `<p class="sd-after">Nâng xong còn <b>${after}</b> điểm.${
            lv || !switchable(s) ? '' : ' Học xong kỹ năng nằm <b>tắt</b>, bật trong kho <b>Dùng kỹ năng</b> thì mới dùng được.'}</p>` : ''}
          ${!maxed && !check.ok ? `<p class="sd-why">${esc(check.reason)}</p>` : ''}
        </section>`}
      </div>

      <div class="sd-foot">${foot}</div>
    </div>`;
}

/* ------------------------------------------------------------ thẻ tẩy điểm */

function respecHtml(player) {
  const c = canRespec(player);
  const names = player.skills.map((id) => skillById(id))
    .map((s) => `<span class="rs-chip" style="--c:${branchByKey(s.branch).color}">${skillIcon(s.icon)}${esc(s.name)}${
      levelOf(player, s.id) > 1 ? ` · Lv ${levelOf(player, s.id)}` : ''}</span>`)
    .join('');
  return `
    <div class="sd-card rs-card" style="--c:var(--gold)" role="dialog" aria-label="Tẩy điểm">
      <div class="sd-top">
        <span class="sd-icon">${skillIcon('reroll')}</span>
        <div class="sd-title">
          <span class="sd-eyebrow">Học lại từ đầu</span>
          <h3>Tẩy điểm</h3>
        </div>
      </div>
      <div class="sd-body">
        <p>Gỡ <b>toàn bộ</b> ${player.skills.length} kỹ năng đang học, hoàn lại đủ số điểm đã tiêu (cả level) để phân bổ lại.
           Phí <b>${money(RESPEC_FEE)}</b> cho mỗi điểm được hoàn.</p>
        <div class="rs-chips">${names}</div>
        <ul class="rs-sum">
          <li><span>Điểm kỹ năng</span><b>${player.skillPoints} → ${player.skillPoints + c.refund}</b></li>
          <li><span>Tiền mặt</span><b>${money(player.money)} → ${money(player.money - c.fee)}</b></li>
        </ul>
        ${c.ok ? '' : `<p class="sd-why">${esc(c.reason)}</p>`}
      </div>
      <div class="sd-foot">
        <button type="button" class="btn btn-ghost" data-act="cancel">Huỷ<kbd class="btn-key">Esc</kbd></button>
        <button type="button" class="btn btn-danger" data-act="respec" data-primary ${c.ok ? '' : 'disabled'}>
          Tẩy điểm · −${money(c.fee)}${c.ok ? '<kbd class="btn-key">⏎</kbd>' : ''}
        </button>
      </div>
    </div>`;
}

/* ------------------------------------------------------------ dựng + gắn sự kiện */

/**
 * Dựng cây của một người chơi, gắn sẵn rê/bấm/phím.
 *
 * @param {{name:string, skillPoints:number, skills:string[], skillLv?:object, money:number}} player
 *   bị sửa trực tiếp khi nâng cấp hay tẩy điểm (không bao giờ ở `readOnly`).
 * @param {object} [o]
 * @param {boolean} [o.readOnly] chỉ xem — không nút học, không tẩy điểm
 * @param {boolean} [o.manage=true] được tẩy điểm — `false` khi
 *   mở cây ngoài lượt của mình: chỉ học và lên level
 * @param {()=>void} [o.onChange] gọi sau mỗi lần nâng cấp hoặc tẩy điểm
 * @param {(id:string)=>void} [o.onLearn] gọi sau mỗi lần học ô mới hoặc lên level
 * @param {()=>void} [o.onClose] bấm nút ✕ trên thanh điểm
 * @param {()=>?object} [o.state] trả GameState hiện tại — điều kiện lên level
 *   theo tài sản (số ô, tổng tài sản, số màu) cần đọc bàn cờ
 * @returns {{el:HTMLElement, onKey:(e:KeyboardEvent)=>boolean, refresh:()=>void}}
 *   `onKey` trả true nếu đã xử lý phím (Esc đóng thẻ chi tiết, Enter bấm nút chính).
 *   `refresh` vẽ lại theo `player` — gọi khi ảnh chụp mới vừa ghi đè lên nó.
 */
export function mountSkillTree(player, o = {}) {
  const readOnly = !!o.readOnly;
  const manage = !readOnly && o.manage !== false;
  /* Bàn cờ hiện tại, cho điều kiện lên level theo tài sản. Hỏi mỗi lần chứ
     không giữ một bản: ảnh chụp mới có thể thay cả GameState. */
  const board = () => o.state?.() ?? null;
  const tree = buildTree(player, readOnly, manage);
  const $ = (sel) => tree.querySelector(sel);
  const tip = $('.st-tip');
  const detail = $('.st-detail');
  const pnum = $('.st-pnum');
  /** Thẻ đang mở trên cây: id kỹ năng, `'respec'` là thẻ tẩy điểm. */
  let openId = null;

  function refresh() {
    pnum.textContent = player.skillPoints;
    $('.st-points').classList.toggle('empty', player.skillPoints === 0);
    $('.st-count').textContent = `Đã học ${player.skills.length}/${SKILLS.length}`;
    if (manage) $('.st-respec').hidden = player.skills.length === 0;

    for (const n of tree.querySelectorAll('.st-node')) {
      const id = n.dataset.id;
      const st = skillState(player, id);
      const lv = levelOf(player, id);
      // Bản chỉ xem: ô chưa học đều mờ như nhau, không có "học được ngay"
      const shown = readOnly && st !== 'learned' ? 'locked' : st;
      n.className = n.className.replace(/\bis-\w+/g, '').replace(/\bcan-up\b/, '').trim() + ` is-${shown}`;
      n.classList.toggle('can-up', !readOnly && canLevelUp(player, id, board()));
      n.classList.toggle('off', lv > 0 && isOff(player, id));
      n.dataset.lv = lv;
      n.querySelector('.st-cost').textContent = lv ? `+${nextCost(player, skillById(id))}` : skillCost(skillById(id));
      n.querySelectorAll('.st-lv i').forEach((i, k) => i.classList.toggle('on', k < lv));
    }
    for (const e of tree.querySelectorAll('.st-edge')) {
      const fromOk = !e.dataset.from || player.skills.includes(e.dataset.from);
      const toSt = skillState(player, e.dataset.to);
      e.classList.toggle('lit', fromOk && toSt === 'learned');
      e.classList.toggle('open', !readOnly && fromOk && (toSt === 'ready' || toSt === 'poor'));
      e.classList.toggle('ready', !readOnly && fromOk && toSt === 'ready');
    }
    for (const h of tree.querySelectorAll('.st-head')) {
      const key = h.dataset.branch;
      const total = branchMax(key);
      const spent = spentIn(player, key);
      h.querySelector('.st-depth').innerHTML = `<i style="width:${(spent / total) * 100}%"></i>`;
      h.querySelector('.st-depth').title = `Đã đổ ${spent}/${total} điểm vào nhánh này`;
      h.classList.toggle('active', spent > 0);
    }
  }

  /* ---- tên nổi khi rê chuột ---- */
  function showTip(node) {
    const s = skillById(node.dataset.id);
    const st = skillState(player, s.id);
    const lv = levelOf(player, s.id);
    const note = readOnly
      ? (lv ? `Level ${lv}/${MAX_LEVEL}` : 'Chưa học')
      : {
        learned: lv >= MAX_LEVEL ? `Level ${lv}/${MAX_LEVEL} · tối đa`
          : canLevelUp(player, s.id, board()) ? `Level ${lv}/${MAX_LEVEL} · bấm để lên level`
            : growNeed(player, s, lv + 1, board()) ? `Level ${lv}/${MAX_LEVEL} · ${growLine(player, s, lv + 1, board())}`
              : `Level ${lv}/${MAX_LEVEL} · cần 1 điểm để lên level`,
        ready: 'Bấm để nâng cấp',
        poor: `Thiếu ${skillCost(s) - player.skillPoints} điểm`,
        locked: `Cần học ${s.requires?.map((r) => skillById(r).name).join(' hoặc ')}`,
      }[st];
    const noteCls = readOnly ? (lv ? 'learned' : 'locked') : st;
    const offNote = lv && isOff(player, s.id) ? ' · đang tắt' : '';
    tip.innerHTML = `
      <b>${esc(s.name)}</b>
      <span class="tip-meta">${tierName(s)} · ${skillCost(s)} điểm · ${KINDS[s.kind].name}</span>
      <span class="tip-short">${esc(fillText(s.short, lvParams(s, lv || 1)))}</span>
      <span class="tip-note n-${noteCls}">${esc(note + offNote)}</span>`;
    tip.style.setProperty('--c', branchByKey(s.branch).color);
    placeTip(node, s.tier === 4 ? ['bottom', 'top', 'right', 'left'] : ['top', 'bottom', 'right', 'left']);
    tip.classList.add('show');
  }

  /* Tên nổi phải nằm gọn trong thân hộp thoại: thân hộp kỹ năng là
     `overflow: hidden` nên phần lòi ra bị cắt chữ, còn trong bảng tài sản thân
     hộp cuộn được nên lòi ra là hiện thanh cuộn. Thử lần lượt các phía, phía
     nào đủ chỗ thì dùng; không phía nào đủ thì lấy phía rộng nhất rồi ép vào
     trong khung. */
  function placeTip(node, sides) {
    const GAP = 8, PAD = 6;
    const box = tree.closest('.modal-body') ?? tree;
    const br = box.getBoundingClientRect();
    const lim = {
      l: br.left + box.clientLeft + PAD,
      t: br.top + box.clientTop + PAD,
      r: br.left + box.clientLeft + box.clientWidth - PAD,
      b: br.top + box.clientTop + box.clientHeight - PAD,
    };
    // Đặt về góc sân trước khi đo, để bề ngang max-content không bị lề phải ép hẹp
    tip.style.left = '0px';
    tip.style.top = '0px';
    /* Hộp thoại mở ra bằng transform scale(.9 → 1): rect đo trên màn đã nhân
       tỉ lệ, còn offsetWidth và style.left thì chưa, phải quy đổi qua `k` */
    const stage = tip.offsetParent;
    const sr = stage.getBoundingClientRect();
    const k = sr.width / stage.offsetWidth || 1;
    tip.style.maxWidth = `${Math.min(250, (lim.r - lim.l) / k)}px`;
    const w = tip.offsetWidth * k, h = tip.offsetHeight * k;
    const n = node.getBoundingClientRect();
    const cx = n.left + n.width / 2, cy = n.top + n.height / 2;
    const room = {
      top: n.top - GAP - lim.t - h,
      bottom: lim.b - (n.bottom + GAP) - h,
      right: lim.r - (n.right + GAP) - w,
      left: n.left - GAP - lim.l - w,
    };
    const side = sides.find((d) => room[d] >= 0) ?? sides.reduce((a, d) => (room[d] > room[a] ? d : a));
    let x, y;
    if (side === 'top' || side === 'bottom') {
      x = cx - w / 2;
      y = side === 'top' ? n.top - GAP - h : n.bottom + GAP;
    } else {
      x = side === 'left' ? n.left - GAP - w : n.right + GAP;
      y = cy - h / 2;
    }
    x = Math.max(lim.l, Math.min(x, lim.r - w));
    y = Math.max(lim.t, Math.min(y, lim.b - h));
    tip.style.left = `${(x - sr.left) / k}px`;
    tip.style.top = `${(y - sr.top) / k}px`;
    tip.dataset.side = side;
  }
  const hideTip = () => tip.classList.remove('show');

  /* ---- thẻ chi tiết ---- */
  function openDetail(id) {
    openId = id;
    hideTip();
    detail.innerHTML = id === 'respec' ? respecHtml(player) : detailHtml(player, skillById(id), readOnly, manage, board());
    detail.hidden = false;
    requestAnimationFrame(() => detail.classList.add('show'));
    tree.querySelector(`.st-node[data-id="${id}"]`)?.classList.add('focus');
    audio.sfx('click');
    // Nút mặc định nhận focus để Enter/Space bấm được ngay
    (detail.querySelector('[data-primary]:not(:disabled)')
      ?? detail.querySelector('[data-act="cancel"]'))?.focus({ preventScroll: true });
  }

  function closeDetail() {
    if (!openId) return;
    const node = tree.querySelector(`.st-node[data-id="${openId}"]`);
    node?.classList.remove('focus');
    openId = null;
    detail.classList.remove('show');
    setTimeout(() => { if (!openId) { detail.hidden = true; detail.innerHTML = ''; } }, 220);
    node?.focus({ preventScroll: true });
  }

  function doLearn() {
    if (readOnly) return;
    const id = openId;
    const before = player.skillPoints;
    const res = learnSkill(player, id, board());
    if (!res.ok) return;
    closeDetail();
    refresh();
    celebrate(id, before - player.skillPoints, res.level);
    o.onLearn?.(id);
    o.onChange?.();
  }

  function doRespec() {
    if (readOnly) return;
    const res = respec(player);
    if (!res.ok) return;
    closeDetail();
    refresh();
    floatPoints(`+${res.refund}`);
    audio.sfx('card');
    o.onChange?.();
  }

  /** Số điểm vừa trừ / vừa hoàn bay lên khỏi bộ đếm. */
  function floatPoints(text) {
    const tag = document.createElement('span');
    tag.className = 'st-minus' + (text.startsWith('+') ? ' plus' : '');
    tag.textContent = text;
    $('.st-points').appendChild(tag);
    setTimeout(() => tag.remove(), 1100);
    $('.st-points').classList.remove('bump');
    void $('.st-points').offsetWidth;
    $('.st-points').classList.add('bump');
  }

  /** Ô vừa học bừng sáng, đường nối vẽ dần lên, bộ đếm điểm bật số trừ. */
  function celebrate(id, spent, level) {
    const node = tree.querySelector(`.st-node[data-id="${id}"]`);
    node.classList.remove('pop');
    void node.offsetWidth;
    node.classList.add('pop');

    const burst = document.createElement('span');
    burst.className = 'st-burst';
    burst.style.cssText = node.style.cssText;
    $('.st-stage').appendChild(burst);
    setTimeout(() => burst.remove(), 900);

    // Lên level thì đường nối đã sáng từ trước, không vẽ lại
    if (level === 1) {
      for (const e of tree.querySelectorAll(`.st-edge[data-to="${id}"].lit`)) {
        e.classList.remove('draw');
        void e.getBoundingClientRect();
        e.classList.add('draw');
      }
    }

    floatPoints(`−${spent}`);

    audio.sfx(skillById(id).tier === 4 && level === 1 ? 'firework' : 'build');
  }

  /* ---- sự kiện ---- */
  tree.addEventListener('pointerover', (e) => {
    const n = e.target.closest('.st-node');
    if (n && e.pointerType === 'mouse' && !openId) showTip(n);
  });
  tree.addEventListener('pointerout', (e) => {
    const n = e.target.closest('.st-node');
    if (n && !n.contains(e.relatedTarget)) hideTip();
  });
  tree.addEventListener('focusin', (e) => {
    const n = e.target.closest('.st-node');
    if (n && !openId && n.matches(':focus-visible')) showTip(n);
  });
  tree.addEventListener('focusout', (e) => { if (e.target.closest('.st-node')) hideTip(); });

  tree.addEventListener('click', (e) => {
    const n = e.target.closest('.st-node');
    if (n) { openDetail(n.dataset.id); return; }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'close') o.onClose?.();
    else if (act === 'cancel') closeDetail();
    else if (act === 'learn') doLearn();
    else if (act === 'respec-open') openDetail('respec');
    else if (act === 'respec') doRespec();
    // Bấm ra vùng tối quanh thẻ = huỷ
    else if (e.target === detail) closeDetail();
  });

  refresh();

  function onKey(e) {
    if (e.key === 'Escape' && openId) { closeDetail(); return true; }
    if (e.key === 'Enter' && openId) {
      detail.querySelector('[data-primary]:not(:disabled)')?.click();
      return true;
    }
    return false;
  }

  /** Ảnh chụp mới ghi đè lên `player`: vẽ lại cây, cả thẻ chi tiết đang mở. */
  function resync() {
    refresh();
    if (openId && openId !== 'respec') detail.innerHTML = detailHtml(player, skillById(openId), readOnly, manage, board());
  }

  return { el: tree, onKey, refresh: resync };
}

/* ------------------------------------------------------------ mở hộp thoại */

/** Cây trong hộp học kỹ năng đang mở, để ảnh chụp mới tới thì vẽ lại được. */
let liveView = null;

/**
 * Ảnh chụp vừa ghi đè lên người chơi: hộp cây đang mở (nếu có) vẽ lại theo.
 * Cần cho lúc học ngoài lượt — máy cầm lái có thể phát một ảnh chụp chưa kịp
 * có ô vừa học, rồi ảnh kế tiếp mới có.
 */
export function refreshSkillTree() { liveView?.refresh(); }

/**
 * Hộp học kỹ năng.
 * @param {object} player xem `mountSkillTree`
 * @param {object} [o]
 * @param {boolean} [o.manage=true] xem `mountSkillTree`
 * @param {()=>void} [o.onChange] gọi sau mỗi lần nâng cấp, bật / tắt hoặc tẩy điểm
 * @param {(id:string)=>void} [o.onLearn] gọi sau mỗi lần học ô mới hoặc lên level
 * @param {string} [o.color] màu quân của người chơi, tô lên tiêu đề
 * @param {()=>?object} [o.state] xem `mountSkillTree`
 * @returns {Promise<void>} xong khi đóng hộp
 */
export function openSkillTree(player, o = {}) {
  let closeModal = null;
  let scrimEl = null;
  const view = mountSkillTree(player, {
    manage: o.manage, onChange: o.onChange, onLearn: o.onLearn, state: o.state, onClose: () => closeModal?.(null),
  });
  liveView = view;

  /* Hộp thoại chung (modal.js) nghe Esc/Enter ở pha capture của window và
     được gắn trước, nên nó luôn bắt phím trước mọi listener gắn sau. Ở đây
     Esc phải đóng thẻ chi tiết trước rồi mới tới cả hộp, nên tắt phần phím
     của modal.js (`dismissible:false`, `enter:false`) và tự xử lý. */
  function onKey(e) {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    // Enter gửi tin chat không được bấm luôn nút "Học" của thẻ đang mở
    if (isTyping(e.target)) return;
    const open = document.querySelectorAll('#modal-root .scrim:not(.hide)');
    if (open[open.length - 1] !== scrimEl) return;
    // Enter khi chưa mở thẻ nào để nguyên cho nút ô đang focus tự bấm
    if (view.onKey(e)) e.preventDefault();
    else if (e.key === 'Escape') { e.preventDefault(); closeModal?.(null); }
  }

  const done = openModal({
    eyebrow: 'Cây kỹ năng',
    title: `<span class="st-title-dot" style="background:${o.color ?? 'var(--gold)'}"></span>${esc(player.name)}`,
    body: view.el,
    buttons: [{ label: 'Đóng', value: null, cls: 'btn-ghost' }],
    dismissible: false,
    enter: false,
    peekable: false,
    onMount: (body, close, modal) => {
      closeModal = close;
      scrimEl = modal.parentElement;
      modal.classList.add('skill-modal');
      /* Hết giờ lượt thì `dismissTopModal` đóng hộp này như mọi hộp khác —
         khai `dismissible:false` chỉ để tự xử lý phím Esc ở trên. */
      scrimEl._dismissible = true;
      scrimEl._autoValue = null;
      body.classList.add('skill-body');
      window.addEventListener('keydown', onKey, true);
    },
  });
  return done.then(() => {
    window.removeEventListener('keydown', onKey, true);
    if (liveView === view) liveView = null;
  });
}
