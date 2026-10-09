/**
 * Trang cân bằng kỹ năng — đọc các hàm `stats_*` trên Supabase (xem
 * supabase/README.md) và bày thành bảng. Không thư viện biểu đồ: mọi "biểu
 * đồ" là thanh ngang bằng CSS trong chính bảng, nên bảng cũng là bản dễ tiếp
 * cận của biểu đồ — không có gì chỉ hiện bằng màu.
 *
 * Tên ô / nhánh lấy thẳng từ data/skills.js chứ không tin database: đổi tên
 * trong mã là trang đổi theo, còn `skill_meta` chỉ để SQL gom nhóm.
 */
import { supabase, isConfigured } from '../net/supabase.js';
import { SKILLS, BRANCHES } from '../data/skills.js';
import { money } from '../data/board.js';

const $ = (sel) => document.querySelector(sel);
const BY_ID = new Map(SKILLS.map((s) => [s.id, s]));
const BRANCH = new Map(BRANCHES.map((b) => [b.key, b]));
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ------------------------------------------------------------- định dạng */
const num = (v, d = 0) => (v == null ? '–' : Number(v).toLocaleString('vi-VN', { maximumFractionDigits: d, minimumFractionDigits: 0 }));
const pct = (v, d = 0) => (v == null ? '–' : `${(Number(v) * 100).toFixed(d)}%`);
const sign = (v, d = 0) => (v == null ? '–' : `${Number(v) > 0 ? '+' : ''}${num(v, d)}$`);
const dur = (s) => (s == null ? '–' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`);
const cssVar = (branch) => `--br-${branch}`;

/** Thanh tỉ lệ 0..1 (hoặc 0..max) kèm nhãn số bên ngoài thanh. */
function bar(v, { max = 1, label, branch } = {}) {
  const w = v == null ? 0 : Math.max(0, Math.min(1, Number(v) / max)) * 100;
  return `<span class="bar" style="--c: var(${cssVar(branch)})"><span class="track"><span class="fill" style="width:${w.toFixed(1)}%"></span></span><span class="lbl">${label}</span></span>`;
}
/** Thanh có dấu quanh mốc 0: dương sang phải, âm sang trái. */
function signedBar(v, max, label) {
  const w = max ? Math.min(1, Math.abs(Number(v ?? 0)) / max) * 50 : 0;
  const cls = Number(v ?? 0) < 0 ? 'neg' : 'pos';
  return `<span class="bar signed"><span class="track"><span class="zero"></span><span class="fill ${cls}" style="width:${w.toFixed(1)}%"></span></span><span class="lbl">${label}</span></span>`;
}
/** Dải phân phối {"1": n, "2": n…} → cột nhỏ. */
function hist(h, branch) {
  const keys = Object.keys(h ?? {}).map(Number).sort((a, b) => a - b);
  if (!keys.length) return '';
  const max = Math.max(...keys.map((k) => h[k]));
  const last = keys[keys.length - 1];
  const cols = [];
  for (let k = 1; k <= Math.min(last, 12); k++) {
    const n = h[k] ?? 0;
    cols.push(`<i style="height:${Math.max(2, (n / max) * 16).toFixed(0)}px" title="điểm thứ ${k}: ${n} lần"></i>`);
  }
  return `<span class="hist" style="--c: var(${cssVar(branch)})" aria-hidden="true">${cols.join('')}</span>`;
}

/* ------------------------------------------------------------- bộ lọc */
function readFilters() {
  const f = new FormData($('#filters'));
  const from = f.get('from'); const to = f.get('to');
  return {
    params: {
      p_from: from ? new Date(`${from}T00:00:00`).toISOString() : null,
      // "đến ngày" lấy trọn ngày đó
      p_to: to ? new Date(new Date(`${to}T00:00:00`).getTime() + 86400_000).toISOString() : null,
      p_mode: f.get('mode') || null,
      p_players: f.get('players') ? Number(f.get('players')) : null,
      p_finished: f.get('finished') === 'on',
    },
    minN: Number(f.get('minN') || 0),
  };
}

/* Bài kiểm thử không có khoá Supabase: gắn `window.__statsRpc` trước khi trang
   nạp để trả dữ liệu mẫu thay cho `supabase.rpc`. */
const configured = () => isConfigured() || typeof window.__statsRpc === 'function';
async function rpc(name, params) {
  if (window.__statsRpc) return window.__statsRpc(name, params);
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw new Error(`${name}: ${error.message}`);
  return data;
}

/* ------------------------------------------------------------- bày */
const tile = (k, v, s = '', text = false) => `<div class="tile"><div class="k">${esc(k)}</div><div class="v${text ? ' text' : ''}">${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;

function renderOverview(o) {
  const winBy = { last: 'trụ lại cuối', empire: 'đế chế', worth: 'tổng tài sản' };
  const wb = Object.entries(o.win_by ?? {}).map(([k, n]) => `${winBy[k] ?? k} ${n}`).join(' · ') || '–';
  const pl = Object.entries(o.players ?? {}).map(([k, n]) => `${k} người: ${n}`).join(' · ') || '–';
  $('#tiles').innerHTML = [
    tile('Ván', num(o.n_games), `${num(o.n_finished)} đã xong · ${num(o.n_player_games)} người-ván`),
    tile('Thời lượng TB', dur(o.avg_duration_s), 'phút:giây, ván đã xong'),
    tile('Lượt / vòng TB', `${num(o.avg_turns, 1)} / ${num(o.avg_rounds, 1)}`, `qua ô Bắt Đầu TB ${num(o.avg_laps, 1)}`),
    tile('Cửa thắng', wb, '', true),
    tile('Số người', pl, '', true),
    tile('Khoảng ngày', o.first_game ? `${new Date(o.first_game).toLocaleDateString('vi-VN')} → ${new Date(o.last_game).toLocaleDateString('vi-VN')}` : '–', '', true),
  ].join('');
}

function renderBranches(rows, minN) {
  $('#branch-legend').innerHTML = BRANCHES.map((b) => `<span style="--c: var(${cssVar(b.key)})">${esc(b.name)}</span>`).join('');
  const maxDelta = Math.max(1, ...rows.map((r) => Math.abs(Number(r.delta_per_player ?? 0))));
  const head = `<thead><tr><th>Nhánh</th><th class="num">n</th><th>Tỉ lệ chọn</th><th>Chạm tối thượng</th><th class="num">Điểm đổ vào TB</th><th>Δ / người</th><th class="num">Δ so với ví cuối</th><th>Thắng có / không</th><th>Hạng TB có / không</th><th>Thắng khi là nhánh chính</th></tr></thead>`;
  const body = rows.map((r) => {
    const b = BRANCH.get(r.branch);
    const dim = Number(r.n_picked) < minN ? ' class="dim"' : '';
    return `<tr${dim} data-branch="${esc(r.branch)}">
      <td class="name"><span class="swatch" style="--c: var(${cssVar(r.branch)})"></span>${esc(b?.name ?? r.branch_name)}</td>
      <td class="num">${num(r.n_picked)}</td>
      <td>${bar(r.pick_rate, { label: pct(r.pick_rate), branch: r.branch })}</td>
      <td>${bar(r.ult_rate, { label: pct(r.ult_rate), branch: r.branch })}</td>
      <td class="num">${num(r.avg_points_in, 1)}</td>
      <td>${signedBar(r.delta_per_player, maxDelta, sign(r.delta_per_player))}</td>
      <td class="num">${pct(r.delta_share, 1)}</td>
      <td><span class="pair"><span>${pct(r.win_rate_with)}</span><span class="k">n=${num(r.n_with)}</span><span>${pct(r.win_rate_without)}</span><span class="k">không</span></span></td>
      <td class="num">${num(r.avg_rank_with, 2)} / ${num(r.avg_rank_without, 2)}</td>
      <td><span class="pair"><span>${pct(r.win_rate_main)}</span><span class="k">n=${num(r.n_main)}</span></span></td>
    </tr>`;
  }).join('');
  $('#branch-table').innerHTML = head + `<tbody>${body}</tbody>`;
}

/** Cột của bảng ô kỹ năng: khoá sắp xếp, nhãn, cách bày. */
const SKILL_COLS = [
  { key: 'name', label: 'Ô', cell: (r) => `<span class="swatch" style="--c: var(${cssVar(r.branch)})"></span>${esc(BY_ID.get(r.skill_id)?.name ?? r.name)}<small>${esc(r.skill_id)} · cấp ${r.tier}${BY_ID.get(r.skill_id)?.kind === 'active' ? ' · bấm' : ''}</small>`, cls: 'name', sort: (r) => `${r.branch}${r.tier}${r.skill_id}` },
  { key: 'n_learned', label: 'n', num: true, cell: (r) => num(r.n_learned) },
  { key: 'pick_rate', label: 'Tỉ lệ học', cell: (r, m) => bar(r.pick_rate, { max: m.pick, label: pct(r.pick_rate), branch: r.branch }) },
  { key: 'first_pick_rate', label: 'Học đầu tiên', cell: (r, m) => bar(r.first_pick_rate, { max: m.first, label: pct(r.first_pick_rate), branch: r.branch }) },
  { key: 'avg_point_no_lv1', label: 'Điểm thứ (TB)', cell: (r) => `${num(r.avg_point_no_lv1, 1)}${hist(r.point_no_hist, r.branch)}`, title: 'Điểm kỹ năng thứ mấy được tiêu để học ô này; dải: phân phối' },
  { key: 'avg_lap_learned', label: 'Vòng học TB', num: true, cell: (r) => num(r.avg_lap_learned, 1) },
  { key: 'lv2_rate', label: 'Lên lv2 / lv3', cell: (r) => `${pct(r.lv2_rate)} / ${pct(r.lv3_rate)}` },
  { key: 'wipe_rate', label: 'Bị tẩy', cell: (r) => `${num(r.n_wiped)} (${pct(r.wipe_rate)})` },
  { key: 'uses_per_game', label: 'Lần chạy / ván', num: true, cell: (r) => num(r.uses_per_game, 1) },
  { key: 'delta_per_game', label: 'Δ / ván', cell: (r, m) => signedBar(r.delta_per_game, m.delta, sign(r.delta_per_game)) },
  { key: 'delta_per_min', label: 'Δ / phút', num: true, cell: (r) => sign(r.delta_per_min, 1), title: 'Tiền mỗi phút nắm giữ (từ lúc học tới lúc tẩy / hết ván)' },
  { key: 'delta_per_turn', label: 'Δ / lượt', num: true, cell: (r) => sign(r.delta_per_turn, 1) },
  { key: 'delta_per_use', label: 'Δ / lần', num: true, cell: (r) => sign(r.delta_per_use, 1) },
  { key: 'win_rate_with', label: 'Thắng có / không', cell: (r) => `<span class="pair"><span>${pct(r.win_rate_with)}</span><span class="k">n=${num(r.n_with)}</span><span>${pct(r.win_rate_without)}</span><span class="k">n=${num(r.n_without)}</span></span>` },
  { key: 'avg_rank_with', label: 'Hạng TB có / không', cell: (r) => `${num(r.avg_rank_with, 2)} / ${num(r.avg_rank_without, 2)}` },
  { key: 'avg_worth_with', label: 'Tài sản cuối có / không', cell: (r) => `${r.avg_worth_with == null ? '–' : money(Number(r.avg_worth_with))} / ${r.avg_worth_without == null ? '–' : money(Number(r.avg_worth_without))}` },
  { key: 'off_at_end_rate', label: 'Tắt lúc hết ván', cell: (r) => (BY_ID.get(r.skill_id)?.kind === 'active' ? `${pct(r.off_at_end_rate)} · ${num(r.toggles_per_game, 1)} lần bật/ván` : '–') },
];
let sortKey = 'pick_rate';
let sortAsc = false;

function renderSkills(rows, minN) {
  const m = {
    pick: Math.max(0.01, ...rows.map((r) => Number(r.pick_rate ?? 0))),
    first: Math.max(0.01, ...rows.map((r) => Number(r.first_pick_rate ?? 0))),
    delta: Math.max(1, ...rows.map((r) => Math.abs(Number(r.delta_per_game ?? 0)))),
  };
  const col = SKILL_COLS.find((c) => c.key === sortKey) ?? SKILL_COLS[0];
  const val = (r) => (col.sort ? col.sort(r) : (r[col.key] == null ? -Infinity : Number(r[col.key])));
  const sorted = [...rows].sort((a, b) => {
    const x = val(a); const y = val(b);
    const c = typeof x === 'string' ? x.localeCompare(y) : x - y;
    return sortAsc ? c : -c;
  });
  const head = `<thead><tr>${SKILL_COLS.map((c) => `<th class="sortable${c.num ? ' num' : ''}${c.key === sortKey ? ` sorted${sortAsc ? ' asc' : ''}` : ''}" data-key="${c.key}"${c.title ? ` title="${esc(c.title)}"` : ''}>${esc(c.label)}</th>`).join('')}</tr></thead>`;
  const body = sorted.map((r) => `<tr data-id="${esc(r.skill_id)}"${Number(r.n_learned) < minN ? ' class="dim"' : ''}>${
    SKILL_COLS.map((c) => `<td class="${c.cls ?? ''}${c.num ? ' num' : ''}">${c.cell(r, m)}</td>`).join('')}</tr>`).join('');
  $('#skill-table').innerHTML = head + `<tbody>${body}</tbody>`;
}

function renderRespec(r) {
  $('#respec-tiles').innerHTML = [
    tile('Lần tẩy', num(r.n_respec), `${num(r.n_player_games)} người-ván · ${num(Number(r.per_player_game ?? 0) * 100, 1)}% có tẩy`),
    tile('Vòng tẩy TB', num(r.avg_round, 1), `lần qua ô Bắt Đầu thứ ${num(r.avg_lap, 1)}`),
    tile('Điểm hoàn / phí TB', `${num(r.avg_refund, 1)} · ${r.avg_fee == null ? '–' : money(Number(r.avg_fee))}`),
  ].join('');
  const list = (rows, el) => {
    $(el).innerHTML = rows?.length
      ? `<tbody>${rows.map((x) => `<tr><td class="name"><span class="swatch" style="--c: var(${cssVar(BY_ID.get(x.skill_id)?.branch ?? '')})"></span>${esc(BY_ID.get(x.skill_id)?.name ?? x.skill_id)}<small>${esc(x.skill_id)}</small></td><td class="num">${num(x.n)}</td></tr>`).join('')}</tbody>`
      : '<tbody><tr><td class="empty">Chưa có</td></tr></tbody>';
  };
  list(r.wiped, '#wiped-table');
  list(r.relearned, '#relearn-table');
}

function renderPoints(p) {
  $('#points-tiles').innerHTML = [
    tile('Nhận / tiêu / thừa TB', `${num(p.avg_earned, 1)} / ${num(p.avg_spent, 1)} / ${num(p.avg_left, 1)}`, `${num(p.n)} người-ván`),
    tile('Người thắng', `${num(p.avg_earned_winner, 1)} / ${num(p.avg_spent_winner, 1)} / ${num(p.avg_left_winner, 1)}`, 'nhận / tiêu / thừa'),
    tile('Thừa ≥ 2 điểm cuối ván', pct(p.hoard_rate), 'điểm chưa tiêu là sức mạnh bỏ phí'),
  ].join('');
  const histTable = (h, el, unit) => {
    const keys = Object.keys(h ?? {}).map(Number).sort((a, b) => a - b);
    const max = Math.max(1, ...keys.map((k) => h[k]));
    $(el).innerHTML = keys.length
      ? `<tbody>${keys.map((k) => `<tr><td>${k} ${unit}</td><td>${bar(h[k], { max, label: num(h[k]) })}</td></tr>`).join('')}</tbody>`
      : '<tbody><tr><td class="empty">Chưa có</td></tr></tbody>';
  };
  histTable(p.left_hist, '#left-table', 'điểm');
  histTable(p.earned_hist, '#earned-table', 'điểm');
}

/* ------------------------------------------------------------- chạy */
const state = { data: null, minN: 3 };

async function load() {
  const status = $('#status');
  if (!configured()) {
    status.textContent = 'Chưa có khoá Supabase (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) — trang này đọc số liệu từ đó.';
    status.classList.add('err');
    return;
  }
  const { params, minN } = readFilters();
  state.minN = minN;
  status.textContent = 'Đang tải…';
  status.classList.remove('err');
  try {
    const [overview, skills, branches, respec, points] = await Promise.all(
      ['stats_overview', 'stats_skills', 'stats_branches', 'stats_respec', 'stats_points'].map((n) => rpc(n, params)),
    );
    state.data = { overview, skills, branches, respec, points };
    render();
    status.textContent = overview?.n_games ? '' : 'Chưa có ván nào trong khoảng lọc này.';
    $('#report').hidden = false;
  } catch (e) {
    status.textContent = `Không đọc được số liệu: ${e.message}. Đã chạy migration trong supabase/ chưa?`;
    status.classList.add('err');
  }
}

function render() {
  const d = state.data;
  if (!d) return;
  renderOverview(d.overview ?? {});
  renderBranches(d.branches ?? [], state.minN);
  renderSkills(d.skills ?? [], state.minN);
  renderRespec(d.respec ?? {});
  renderPoints(d.points ?? {});
}

$('#filters').addEventListener('submit', (e) => { e.preventDefault(); load(); });
$('#skill-table').addEventListener('click', (e) => {
  const th = e.target.closest('th[data-key]');
  if (!th) return;
  if (sortKey === th.dataset.key) sortAsc = !sortAsc;
  else { sortKey = th.dataset.key; sortAsc = th.dataset.key === 'name'; }
  renderSkills(state.data?.skills ?? [], state.minN);
});

// Cho bài kiểm thử soi
window.__stats = { state, load, render };
load();
