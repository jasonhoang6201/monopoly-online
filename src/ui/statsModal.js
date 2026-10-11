/**
 * Hộp thống kê cuối ván: đường tiền của từng người qua từng lượt, dải người
 * dẫn đầu, vài con số nổi bật và bảng số liệu theo người.
 *
 * Chỉ đọc sổ tiền (`core/history.js`), sổ ấy đi theo ảnh chụp nên biểu đồ ở
 * máy nào cũng như nhau. Mở từ nút "Thống kê" gắn ở mép màn hạ màn.
 */
import { openModal } from './modal.js';
import { money, tileLabel, START_MONEY } from '../data/board.js';
import { moneySeries } from '../core/history.js';
import { elapsedLabel, gameElapsed } from './hud.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Hệ toạ độ của biểu đồ (đơn vị viewBox). Lề phải chừa chỗ cho nhãn tên ở đầu đường. */
const VW = 880, VH = 330;
const M = { l: 58, r: 112, t: 16, b: 58 };
const PW = VW - M.l - M.r, PH = VH - M.t - M.b;

/** Bước chia trục tròn số (1, 2, 2.5, 5 × 10ⁿ) để vạch rơi đúng số dễ đọc. */
function niceStep(span, count) {
  const raw = span / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  for (const f of [1, 2, 2.5, 5, 10]) if (f * mag >= raw) return f * mag;
  return 10 * mag;
}

/** Nhãn tiền gọn cho trục: 12.500$ → 12,5k. Dưới 10.000 thì để nguyên. */
const axisMoney = (v) => (Math.abs(v) >= 10000
  ? `${(v / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}k`
  : money(v));

/**
 * Dựng SVG cho một chuỗi (`w` tổng tài sản hoặc `m` tiền mặt). Trả về chuỗi
 * HTML và các hàm quy đổi toạ độ để lớp rê chuột dùng lại.
 */
function chartSvg(state, data, key, winnerId) {
  const { pts, series, lead } = data;
  const vals = series.flat().filter((v) => v != null);
  const lo = Math.min(0, ...vals);
  const hiRaw = Math.max(START_MONEY, ...vals);
  const step = niceStep(hiRaw - lo, 4);
  const yMin = Math.floor(lo / step) * step;
  const yMax = Math.ceil(hiRaw / step) * step;
  const k0 = pts[0].k, k1 = Math.max(pts[pts.length - 1].k, k0 + 1);
  const x = (k) => M.l + ((k - k0) / (k1 - k0)) * PW;
  const y = (v) => M.t + PH - ((v - yMin) / (yMax - yMin)) * PH;

  // Vạch ngang và nhãn trục tiền
  let grid = '';
  for (let v = yMin; v <= yMax + 1e-6; v += step) {
    grid += `<line class="sc-grid${v === 0 ? ' zero' : ''}" x1="${M.l}" x2="${M.l + PW}" y1="${y(v)}" y2="${y(v)}"/>
      <text class="sc-ytick" x="${M.l - 8}" y="${y(v) + 4}">${axisMoney(v)}</text>`;
  }
  // Vốn khởi đầu: mốc để so ai đang lời, ai đang lỗ
  if (key === 'w' && START_MONEY > yMin && START_MONEY < yMax) {
    grid += `<line class="sc-base" x1="${M.l}" x2="${M.l + PW}" y1="${y(START_MONEY)}" y2="${y(START_MONEY)}"/>
      <text class="sc-base-label" x="${M.l + PW - 4}" y="${y(START_MONEY) - 6}">vốn đầu ${money(START_MONEY)}</text>`;
  }

  // Vạch dọc theo vòng: chọn vài vòng cách đều nhau, đánh dấu ở mốc đầu tiên của vòng ấy
  const rounds = [];
  pts.forEach((p, i) => { if (i === 0 || p.r !== pts[i - 1].r) rounds.push(p); });
  const rStep = Math.max(1, Math.ceil(rounds.length / 8));
  let xt = '';
  rounds.forEach((p, i) => {
    if (i % rStep) return;
    xt += `<line class="sc-xgrid" x1="${x(p.k)}" x2="${x(p.k)}" y1="${M.t}" y2="${M.t + PH}"/>
      <text class="sc-xtick" x="${x(p.k)}" y="${M.t + PH + 16}">V${p.r}</text>`;
  });

  // Dải người dẫn đầu: mỗi đoạn tô màu người đang có tổng tài sản cao nhất
  const ribbonY = M.t + PH + 30;
  let ribbon = `<text class="sc-ytick" x="${M.l - 8}" y="${ribbonY + 8}">dẫn đầu</text>`;
  for (let i = 0; i < pts.length; i++) {
    const s = lead[i];
    if (s < 0) continue;
    const xa = i === 0 ? x(pts[0].k) : (x(pts[i - 1].k) + x(pts[i].k)) / 2;
    const xb = i === pts.length - 1 ? x(pts[i].k) : (x(pts[i].k) + x(pts[i + 1].k)) / 2;
    ribbon += `<rect x="${xa.toFixed(1)}" y="${ribbonY}" width="${Math.max(0.6, xb - xa).toFixed(1)}" height="10"
      fill="${state.players[s].token.css}"/>`;
  }
  ribbon = `<g class="sc-ribbon">${ribbon}<rect class="sc-ribbon-frame" x="${M.l}" y="${ribbonY}" width="${PW}" height="10" rx="3"/></g>`;

  // Đường từng người. Người thắng vẽ sau cùng để nằm trên.
  const order = state.players.map((p) => p.id).sort((a, b) => (a === winnerId) - (b === winnerId));
  let lines = '', area = '', ends = '';
  const labels = [];
  for (const s of order) {
    const p = state.players[s];
    const vs = series[s];
    let d = '', lastI = -1;
    vs.forEach((v, i) => {
      if (v == null) return;
      d += `${lastI === i - 1 && d ? 'L' : 'M'}${x(pts[i].k).toFixed(1)},${y(v).toFixed(1)}`;
      lastI = i;
    });
    if (!d) continue;
    if (s === winnerId) {
      // Nền mờ dưới đường người thắng — chỉ một vùng tô, không chồng màu lên nhau
      const first = vs.findIndex((v) => v != null);
      area = `<path class="sc-area" data-s="${s}" d="${d}L${x(pts[lastI].k).toFixed(1)},${y(Math.max(0, yMin))}L${x(pts[first].k).toFixed(1)},${y(Math.max(0, yMin))}Z"
        fill="url(#sc-win)"/>`;
    }
    lines += `<g class="sc-line" data-s="${s}">
      <path class="sc-halo" d="${d}"/>
      <path class="sc-stroke${s === winnerId ? ' win' : ''}" d="${d}" stroke="${p.token.css}"/>
    </g>`;
    const ex = x(pts[lastI].k), ey = y(vs[lastI]);
    if (p.bankrupt && lastI < pts.length - 1) {
      // Ngã giữa đường: dấu ✕ ở mốc cuối cùng còn trụ
      ends += `<g class="sc-end" data-s="${s}" transform="translate(${ex.toFixed(1)},${ey.toFixed(1)})">
        <path class="sc-x-halo" d="M-5,-5L5,5M5,-5L-5,5"/>
        <path d="M-5,-5L5,5M5,-5L-5,5" stroke="${p.token.css}" stroke-width="2.4" stroke-linecap="round"/>
      </g>`;
    } else {
      ends += `<circle class="sc-dot" data-s="${s}" cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="4.5" fill="${p.token.css}"/>`;
      labels.push({ s, y: ey, v: vs[lastI] });
    }
  }

  // Nhãn tên ở đầu đường, đẩy xuống cho khỏi đè nhau
  labels.sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) labels[i].y = Math.max(labels[i].y, labels[i - 1].y + 30);
  const over = labels.length ? labels[labels.length - 1].y - (M.t + PH) : 0;
  if (over > 0) labels.forEach((l) => { l.y -= over; });
  const direct = labels.map((l) => {
    const p = state.players[l.s];
    return `<g class="sc-label" data-s="${l.s}" transform="translate(${M.l + PW + 12},${l.y.toFixed(1)})">
      <rect x="0" y="-5" width="8" height="8" rx="2" fill="${p.token.css}"/>
      <text class="sc-label-name" x="13" y="2">${esc(p.name)}</text>
      <text class="sc-label-val" x="13" y="16">${money(l.v)}</text>
    </g>`;
  }).join('');

  const winCss = state.players[winnerId]?.token.css ?? '#E6C878';
  const svg = `
    <svg class="sc-svg" viewBox="0 0 ${VW} ${VH}" role="img"
         aria-label="${key === 'w' ? 'Tổng tài sản' : 'Tiền mặt'} từng người qua các lượt">
      <defs>
        <linearGradient id="sc-win" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="${winCss}" stop-opacity=".22"/>
          <stop offset="1" stop-color="${winCss}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${grid}${xt}${area}${lines}${ends}${direct}${ribbon}
      <g class="sc-cross" visibility="hidden">
        <line class="sc-cross-line" y1="${M.t}" y2="${M.t + PH}"/>
        <g class="sc-cross-dots"></g>
      </g>
      <rect class="sc-hit" x="${M.l}" y="${M.t}" width="${PW}" height="${PH + 40}"/>
    </svg>`;
  return { svg, x, y, k0, k1 };
}

/** Số liệu từng người cho bảng bên dưới biểu đồ. */
function tableHtml(state, data, winnerId) {
  const rent = state.hist.rent;
  const n = data.pts.length;
  const at = (x) => (x ? `${money(x.v)}<small>V${x.r}</small>` : '–');
  const rows = state.players.map((p) => {
    const final = data.series[p.id][n - 1];
    const r = rent[p.id] ?? { paid: 0, got: 0, max: 0 };
    return `<tr class="${p.id === winnerId ? 'win' : ''}">
      <th scope="row"><span class="gs-chip" style="background:${p.token.css}"></span>${esc(p.name)}</th>
      <td>${p.bankrupt ? '<span class="gs-out">phá sản</span>' : money(final ?? 0)}</td>
      <td>${at(data.peak[p.id])}</td>
      <td>${at(data.low[p.id])}</td>
      <td>${n ? Math.round((data.leadCount[p.id] / n) * 100) : 0}%</td>
      <td>${money(r.paid)}</td>
      <td>${money(r.got)}</td>
      <td>${r.max ? money(r.max) : '–'}</td>
      <td>${p.jails ?? 0}</td>
    </tr>`;
  }).join('');
  return `
    <div class="gs-table-wrap">
      <table class="gs-table">
        <thead><tr>
          <th scope="col">Người chơi</th><th scope="col">Cuối ván</th>
          <th scope="col">Đỉnh cao</th><th scope="col">Đáy</th>
          <th scope="col" title="Phần trăm số lượt đứng đầu bàn về tổng tài sản">Dẫn đầu</th>
          <th scope="col">Thuê đã trả</th><th scope="col">Thuê đã thu</th>
          <th scope="col" title="Khoản tiền thuê lớn nhất từng trả một lần">Cú đau nhất</th>
          <th scope="col">Vào tù</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

/** Bốn ô số nổi bật phía trên biểu đồ. */
function tilesHtml(state, data) {
  const rent = state.hist.rent;
  const who = (s) => `<span class="gs-chip" style="background:${state.players[s].token.css}"></span>${esc(state.players[s].name)}`;
  const tiles = [];
  const top = data.peak.reduce((b, pk, s) => (pk && (!b || pk.v > b.v) ? { ...pk, s } : b), null);
  if (top) tiles.push(['Đỉnh cao nhất ván', money(top.v), `${who(top.s)} · vòng ${top.r}`]);
  tiles.push(['Đổi ngôi đầu bảng', `${data.swaps} lần`,
    data.swaps ? 'tính theo tổng tài sản' : 'một người dẫn từ đầu tới cuối']);
  const hurt = rent.reduce((b, r, s) => (r.max > (b?.max ?? 0) ? { ...r, s } : b), null);
  if (hurt) {
    tiles.push(['Cú thuê đau nhất', money(hurt.max),
      `${who(hurt.s)}${hurt.maxTile != null ? ` · ${esc(tileLabel(hurt.maxTile))}` : ''}`]);
  }
  const flow = rent.reduce((a, r) => a + r.paid, 0);
  tiles.push(['Tổng tiền thuê', money(flow), `${data.pts.length} mốc · ${state.round} vòng`]);
  return `<div class="gs-tiles">${tiles.map(([k, v, note]) => `
    <div class="gs-tile"><span class="gs-tile-k">${k}</span><b class="gs-tile-v">${v}</b><span class="gs-tile-n">${note}</span></div>`).join('')}</div>`;
}

/**
 * Mở hộp thống kê. Hộp chỉ để xem: bấm ra nền hoặc Esc là đóng, màn hạ màn
 * bên dưới vẫn nằm nguyên.
 */
export function statsModal(state, winnerId = -1) {
  const data0 = moneySeries(state, 'w');
  const body = `
    ${tilesHtml(state, data0)}
    <div class="gs-bar">
      <div class="gs-seg" role="tablist" aria-label="Chọn số liệu">
        <button type="button" role="tab" class="on" data-key="w" aria-selected="true">Tổng tài sản</button>
        <button type="button" role="tab" data-key="m" aria-selected="false">Tiền mặt</button>
      </div>
      <div class="gs-legend">${state.players.map((p) => `
        <button type="button" class="gs-leg" data-s="${p.id}">
          <span class="gs-chip" style="background:${p.token.css}"></span>${esc(p.name)}${p.bankrupt ? ' <i>✕</i>' : ''}
        </button>`).join('')}</div>
    </div>
    <div class="gs-chart">
      <div class="gs-svg-host"></div>
      <div class="gs-tip" hidden></div>
    </div>
    ${tableHtml(state, data0, winnerId)}`;

  return openModal({
    eyebrow: 'THỐNG KÊ VÁN',
    title: 'Tiền bạc cả trận',
    sub: `${data0.pts.length} mốc qua ${state.round} vòng · ván kéo dài ${elapsedLabel(gameElapsed(state))}`,
    wide: true,
    scrimClose: true,
    peekable: false,
    body,
    buttons: [{ label: 'Đóng', value: null }],
    onMount: (el, close, modal) => {
      modal.classList.add('stats-modal');
      const host = el.querySelector('.gs-svg-host');
      const tip = el.querySelector('.gs-tip');
      let key = 'w', data = data0, geo = null, focus = -1;

      const draw = () => {
        data = moneySeries(state, key);
        geo = chartSvg(state, data, key, winnerId);
        host.innerHTML = geo.svg;
        applyFocus();
        bindHover();
      };

      /* Rê lên một tên trong chú thích: đường người ấy giữ nguyên, đường
         khác lùi mờ — sáu đường đan nhau vẫn lần ra được một người. */
      const applyFocus = () => {
        host.querySelector('svg')?.classList.toggle('focusing', focus >= 0);
        host.querySelectorAll('[data-s]').forEach((g) => g.classList.toggle('on', +g.dataset.s === focus));
        el.querySelectorAll('.gs-leg').forEach((b) => b.classList.toggle('on', +b.dataset.s === focus));
      };
      el.querySelectorAll('.gs-leg').forEach((b) => {
        const s = +b.dataset.s;
        b.addEventListener('pointerenter', () => { focus = s; applyFocus(); });
        b.addEventListener('pointerleave', () => { focus = -1; applyFocus(); });
        // Màn cảm ứng không có rê chuột: chạm để bật/tắt
        b.addEventListener('click', () => { focus = focus === s ? -1 : s; applyFocus(); });
      });

      el.querySelectorAll('.gs-seg button').forEach((b) => b.addEventListener('click', () => {
        key = b.dataset.key;
        el.querySelectorAll('.gs-seg button').forEach((o) => {
          o.classList.toggle('on', o === b);
          o.setAttribute('aria-selected', String(o === b));
        });
        tip.hidden = true;
        draw();
      }));

      /** Lớp rê chuột: vạch dọc + chấm trên từng đường + khung số liệu mốc gần nhất. */
      const bindHover = () => {
        const svg = host.querySelector('svg');
        const cross = svg.querySelector('.sc-cross');
        const line = svg.querySelector('.sc-cross-line');
        const dots = svg.querySelector('.sc-cross-dots');
        const hit = svg.querySelector('.sc-hit');
        const show = (e) => {
          // Quy toạ độ chuột về viewBox qua ma trận của SVG: màn thấp thu biểu
          // đồ lại giữ tỉ lệ, chia theo bề rộng khung là lệch
          const ctm = svg.getScreenCTM();
          const vx = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse()).x;
          const k = geo.k0 + ((vx - M.l) / PW) * (geo.k1 - geo.k0);
          let i = 0;
          data.pts.forEach((p, j) => { if (Math.abs(p.k - k) < Math.abs(data.pts[i].k - k)) i = j; });
          const pt = data.pts[i];
          const cx = geo.x(pt.k);
          line.setAttribute('x1', cx); line.setAttribute('x2', cx);
          const rows = state.players
            .map((p) => ({ p, v: data.series[p.id][i] }))
            .sort((a, b) => (b.v ?? -Infinity) - (a.v ?? -Infinity));
          dots.innerHTML = rows.filter((r) => r.v != null).map((r) => `
            <circle cx="${cx}" cy="${geo.y(r.v)}" r="4.5" fill="${r.p.token.css}" class="sc-cross-dot"/>`).join('');
          cross.setAttribute('visibility', 'visible');
          const lead = data.lead[i];
          tip.innerHTML = `
            <div class="gs-tip-head">Vòng ${pt.r} · lượt ${pt.k}</div>
            ${rows.map((r) => `<div class="gs-tip-row${r.v == null ? ' out' : ''}">
              <span class="gs-chip" style="background:${r.p.token.css}"></span>
              <span class="gs-tip-name">${esc(r.p.name)}${r.p.id === lead ? ' 👑' : ''}</span>
              <b>${r.v == null ? 'phá sản' : money(r.v)}</b>
            </div>`).join('')}`;
          tip.hidden = false;
          // Khung số liệu né vạch dọc: nửa phải biểu đồ thì đặt bên trái vạch
          const hostBox = host.getBoundingClientRect();
          const scr = new DOMPoint(cx, M.t).matrixTransform(ctm);
          const px = scr.x - hostBox.left;
          const tw = tip.offsetWidth;
          const left = cx > M.l + PW * 0.55 ? px - tw - 14 : px + 14;
          tip.style.left = `${Math.max(0, Math.min(hostBox.width - tw, left))}px`;
          tip.style.top = `${scr.y - hostBox.top + 4}px`;
        };
        const hide = () => { cross.setAttribute('visibility', 'hidden'); tip.hidden = true; };
        hit.addEventListener('pointermove', show);
        hit.addEventListener('pointerdown', show);
        hit.addEventListener('pointerleave', hide);
      };

      draw();
    },
  });
}
