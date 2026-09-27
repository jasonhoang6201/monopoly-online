/**
 * Bàn thử cây kỹ năng. Người chơi ở đây là đồ giả — chỉ mang đúng hai trường
 * mà core/skills.js cần (`skillPoints`, `skills`, `money`) cùng tên và màu để hiện.
 */
import { openSkillTree } from '../src/ui/skillTree.js';
import { skillIcon } from '../src/ui/skillIcons.js';
import { BRANCHES, BUILDS, SKILLS } from '../src/data/skills.js';
import { skillById, skillCost, grantLapPoint, spentIn } from '../src/core/skills.js';
import { TOKENS } from '../src/core/state.js';
import { audio } from '../src/audio/audio.js';

const $ = (id) => document.getElementById(id);

const players = [
  { name: 'Ba Tư Xe Ngựa', token: TOKENS[0], laps: 0, money: 750, skillPoints: 3, skills: [] },
  { name: 'Cô Hai Chợ Lớn', token: TOKENS[2], laps: 0, money: 750, skillPoints: 0, skills: [] },
  { name: 'Chú Sáu Bến Nghé', token: TOKENS[3], laps: 0, money: 750, skillPoints: 0, skills: [] },
];
let cur = 0;

function renderSeats() {
  $('seats').innerHTML = players.map((p, i) => `
    <button type="button" class="sk-seat${i === cur ? ' on' : ''}" data-i="${i}" style="--t:${p.token.css}">
      <span class="sk-dot"></span>
      <span class="sk-sname">${p.name}</span>
      <span class="sk-spts">${p.skillPoints} điểm · ${p.skills.length} kỹ năng</span>
    </button>`).join('');
}

function renderMe() {
  const p = players[cur];
  const byBranch = BRANCHES.map((b) => {
    const mine = SKILLS.filter((s) => s.branch === b.key && p.skills.includes(s.id));
    if (!mine.length) return '';
    return `
      <div class="sk-row" style="--c:${b.color}">
        <span class="sk-bn">${skillIcon(b.key)} ${b.name} <i>${spentIn(p, b.key)} điểm</i></span>
        <span class="sk-chips">${mine.map((s) => `
          <span class="sk-chip${s.tier === 4 ? ' ult' : ''}" title="${s.short}">${skillIcon(s.icon)}${s.name}</span>`).join('')}
        </span>
      </div>`;
  }).join('');

  $('me').innerHTML = `
    <div class="sk-me-head" style="--t:${p.token.css}">
      <span class="sk-dot big"></span>
      <div>
        <b>${p.name}</b>
        <span>Đã đi ${p.laps} vòng · tiền mặt ${p.money}$</span>
      </div>
      <div class="sk-pts" id="pts"><b>${p.skillPoints}</b><i>điểm</i></div>
    </div>
    <div class="sk-actions">
      <button type="button" class="btn btn-jade" id="lap">Đi qua Bắt Đầu · +1 điểm</button>
      <button type="button" class="btn btn-ghost" id="plus5">+5 điểm</button>
      <button type="button" class="btn btn-gold" id="open">Mở cây kỹ năng<kbd class="btn-key">K</kbd></button>
      <button type="button" class="btn btn-ghost" id="reset">Làm lại</button>
    </div>
    <div class="sk-have">
      ${byBranch || '<p class="sk-note">Chưa học kỹ năng nào.</p>'}
    </div>`;

  $('lap').onclick = () => {
    p.laps += 1;
    p.money += 200;
    grantLapPoint(p);
    audio.sfx('coin');
    renderAll();
    const pts = $('pts');
    pts.classList.add('gain');
    setTimeout(() => pts.classList.remove('gain'), 700);
  };
  $('plus5').onclick = () => { grantLapPoint(p, 5); renderAll(); };
  $('open').onclick = open;
  $('reset').onclick = () => {
    p.skills = []; p.skillPoints = 0; p.laps = 0; p.money = 750;
    renderAll();
  };
}

function renderBuilds() {
  $('builds').innerHTML = BUILDS.map((b, i) => {
    const total = b.skills.reduce((n, id) => n + skillCost(skillById(id)), 0);
    return `
      <article class="sk-build">
        <header>
          <b>${b.name}</b>
          <span class="sk-cost">${total} điểm</span>
          <button type="button" class="btn btn-sm btn-ghost" data-build="${i}">Áp thử</button>
        </header>
        <div class="sk-chips">${b.skills.map((id) => {
          const s = skillById(id);
          const c = BRANCHES.find((x) => x.key === s.branch).color;
          return `<span class="sk-chip${s.tier === 4 ? ' ult' : ''}" style="--c:${c}">${skillIcon(s.icon)}${s.name}</span>`;
        }).join('')}</div>
        <p>${b.note}</p>
      </article>`;
  }).join('');
}

function renderAll() { renderSeats(); renderMe(); }

async function open() {
  const p = players[cur];
  await openSkillTree(p, { color: p.token.css, onChange: renderAll });
  renderAll();
}

$('seats').addEventListener('click', (e) => {
  const b = e.target.closest('[data-i]');
  if (!b) return;
  cur = Number(b.dataset.i);
  renderAll();
});

$('builds').addEventListener('click', (e) => {
  const b = e.target.closest('[data-build]');
  if (!b) return;
  const p = players[cur];
  p.skills = [...BUILDS[b.dataset.build].skills];
  p.skillPoints = 0;
  renderAll();
  open();
});

window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'k' && !document.querySelector('#modal-root .scrim:not(.hide)')) open();
});

renderBuilds();
renderAll();
