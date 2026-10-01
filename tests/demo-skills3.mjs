/**
 * Ảnh và video cho Jason xem — không phải bài kiểm thử.
 *
 *   1. Ảnh thẻ chi tiết có mục "Số liệu lúc này" (Liên Đoàn, Sổ Hồng, Xe Đạp…)
 *   2. Video một người học gần như cả cây (35 ô, đủ 5 tối thượng), bật hết công
 *      tắc, chơi vài lượt: Xe Đạp + Quay Đầu + Xí Ngầu Gian cùng hỏi một lần,
 *      ra đôi khi đạp xe, qua ô Bắt Đầu với Liên Đoàn + Phố Cổ + Sổ Hồng.
 *      Trong lúc quay đo thời gian mỗi lượt và khung hình (requestAnimationFrame).
 *
 *   node tests/demo-skills3.mjs        → test-result/skills3/
 *
 * Cần dev server ở cổng 5178 và ffmpeg trong PATH.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { launchChrome } from './launch.mjs';
import { playRollOff } from './rolloff.mjs';
import { picking, markedTiles } from './pick.mjs';

const OUT = 'test-result/skills3';
const RAW = `${OUT}/raw`;
rmSync(OUT, { recursive: true, force: true });
mkdirSync(RAW, { recursive: true });

const browser = await launchChrome();
const errors = [];

async function openGame(viewport, record) {
  const ctx = await browser.newContext({ viewport, ...(record ? { recordVideo: { dir: RAW, size: viewport } } : {}) });
  const t0 = Date.now();
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:5178/', { waitUntil: 'networkidle' });
  const solo = page.locator('.scrim.show button.btn', { hasText: 'Chơi trên một máy' });
  await solo.waitFor({ timeout: 30000 });
  await solo.click();
  await page.waitForTimeout(2200);
  await page.locator('.count-btn[data-n="3"]').click();
  const names = ['Ba Tư', 'Cô Hai', 'Chú Sáu'];
  for (let i = 0; i < 3; i++) await page.locator('#name-list input').nth(i).fill(names[i]);
  await page.getByRole('button', { name: 'Khai cuộc' }).click();
  await page.waitForTimeout(3200);
  await playRollOff(page);
  await page.waitForTimeout(800);
  const run = (fn) => page.evaluate(async (src) => {
    const c = window.__monopoly.controller;
    const s = c.state;
    const me = s.current;
    const [o1, o2] = s.players.filter((q) => q !== me);
    // eslint-disable-next-line no-new-func
    return new Function('c', 's', 'me', 'o1', 'o2', `return (async () => { ${src} })()`)(c, s, me, o1, o2);
  }, fn);
  return { ctx, page, run, t0, tStart: Date.now() };
}

/** Thế cờ dùng chung cho ảnh và video: "Ba Tư" (người đang đi) học gần như cả cây. */
const SETUP = `
  const { SKILLS } = await import('/src/data/skills.js');
  // Mọi ô không phải tối thượng + mỗi nhánh một tối thượng: 35 ô, hào quang trắng
  const ults = ['cnU', 'dhV', 'ddV', 'dcU', 'acU'];
  me.skills = SKILLS.filter((x) => x.tier < 4 || ults.includes(x.id)).map((x) => x.id);
  me.skillLv = { dhS1: 2, cnU: 2, ac3: 3, acS1: 3 };
  me.skillOff = [];
  me.betSet = { pick: 'even', amount: 50 }; me.lotto = 8; me.stake = o1.id;
  me.laps = 7; me.jails = 1; me.money = 1800; me.skillPoints = 0;
  me.skillUse = { cnU: { n: 4, gain: 512 }, dhS1: { n: 9, gain: 0 }, ac3: { n: 3, gain: 168 } };
  // Đất: bộ cam đủ có nhà, bến, công ty, vài ô lẻ nhiều màu
  for (const id of [16, 18, 19, 5, 15, 12, 1, 26, 37]) s.owner.set(id, me.id);
  s.houses.set(16, 3); s.houses.set(18, 3); s.houses.set(19, 2); s.houses.set(1, 1);
  s.bankHouses -= 9;
  // Đối thủ: đủ tiền để Liên Đoàn, Tất Tay, Hai Ngón có số để tính; vài kỹ năng chạm vào Ba Tư
  o1.money = 1400; o2.money = 900;
  o1.skills = ['dc1', 'dc2a', 'dcS2']; o1.stake = me.id;
  o2.skills = ['dd1', 'dd2a', 'ddX1', 'ddV', 'dh1', 'dhX2', 'dhS2']; o2.lotto = 7;
  for (const id of [21, 23, 24]) s.owner.set(id, o1.id);
  for (const id of [6, 8, 25]) s.owner.set(id, o2.id);
  c.hud.refresh(); c.scene.refresh(s); c.restoreActions();
`;

/* ================================================================ 1. ảnh thẻ chi tiết */
console.log('1. ảnh thẻ chi tiết');
{
  const g = await openGame({ width: 1600, height: 1000 });
  const { page, run } = g;
  await run(SETUP);
  await page.locator('#actions button[data-key="k"]').click();
  await page.locator('.st-node[data-id="cnU"]').waitFor();
  await page.waitForTimeout(1200);
  for (const id of ['cnU', 'ac3', 'dhS1', 'acS1', 'cn3', 'dhV', 'ddU', 'acV', 'dhX1', 'ddV']) {
    await page.locator(`.st-node[data-id="${id}"]`).click();
    await page.locator('.st-detail.show .sd-card').waitFor();
    await page.waitForTimeout(500);
    await page.locator('.st-detail .sd-card').screenshot({ path: `${OUT}/the-${id}.png` });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(350);
  }
  await page.screenshot({ path: `${OUT}/cay-day-du.png` });
  await g.ctx.close();
  console.log('  ✓', `${OUT}/the-*.png`);
}

/* ================================================================ 2. video bật đủ kỹ năng */
console.log('2. video bật đủ kỹ năng');
const g = await openGame({ width: 1600, height: 1000 }, true);
const { page, run } = g;
await run(SETUP + 'me.pos = 36; c.scene.refresh(s); await c.scene.jumpToken(s.players.indexOf(me), 36);');

const cap = (text) => page.evaluate((t) => {
  let el = document.getElementById('demo-cap');
  if (!el) {
    el = document.createElement('div');
    el.id = 'demo-cap';
    el.style.cssText = 'position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:999999;'
      + 'pointer-events:none;background:rgba(10,10,10,.82);color:#fff;font:600 19px/1.35 system-ui;'
      + 'padding:8px 16px;border-radius:8px;max-width:86vw;text-align:center';
    document.body.appendChild(el);
  }
  el.textContent = t;
  el.style.display = t ? '' : 'none';
}, text);

/** Ép hai viên xí ngầu của lần lắc kế tiếp. */
const forceDice = (a, b) => page.evaluate(([x, y]) => {
  const orig = Math.__orig || (Math.__orig = Math.random);
  const seq = [(x - 1) / 6 + 0.01, (y - 1) / 6 + 0.01];
  let i = 0;
  Math.random = () => (i < 2 ? seq[i++] : orig());
}, [a, b]);

/* Ghi mọi thông báo: tiêu đề, người đang đi, thời điểm — để biết lượt dài vì đâu. */
await page.evaluate(() => {
  const c = window.__monopoly.controller;
  const orig = c.bc.show.bind(c.bc);
  window.__bc = [];
  c.bc.show = (t, html, o) => { window.__bc.push({ t: Math.round(performance.now()), who: c.state.current.name, title: t, ms: o?.ms ?? 3400 }); return orig(t, html, o); };
});

/* Đo khung hình suốt video: mỗi nhịp rAF ghi khoảng cách tới nhịp trước. */
await page.evaluate(() => {
  const gaps = [];
  let last = performance.now();
  const tick = (t) => { gaps.push(t - last); last = t; window.__gapsOn && requestAnimationFrame(tick); };
  window.__gaps = gaps; window.__gapsOn = true;
  requestAnimationFrame(tick);
});

const shown = () => page.locator('#modal-root .scrim.show');
const ORDER = ['Không mua', 'Bỏ qua', 'Nhận tiền', 'Đành chịu', 'Tiếp tục', 'Chấp nhận', 'Lên đường', 'Cất vào túi',
  'Chốt giá', 'Xong', 'Đóng', 'Đã rõ', 'Để sau', 'Chơi tiếp', 'Thôi', 'Huỷ'];

/** Dọn hộp thoại; phiên chọn ô thì gọi `onPick` (mặc định: bỏ ngang hoặc ô đầu tiên). */
async function drain(onPick, maxMs = 25000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    if (await picking(page)) {
      await page.waitForTimeout(1500);
      if (onPick) { await onPick(); onPick = null; } else {
        const cancel = page.locator('.tp-cancel');
        if (await cancel.count()) await cancel.click();
        else {
          const id = (await markedTiles(page))[0];
          await page.evaluate((t) => { window.__monopoly.scene.onTileClick(t); }, id);
        }
      }
      await page.waitForTimeout(500);
      continue;
    }
    if (await shown().count() === 0) {
      await page.waitForTimeout(400);
      if (await shown().count() === 0 && !(await picking(page))) {
        // Còn nút lắc / kết thúc lượt trên thanh hành động là lượt đã dừng chờ người bấm
        if (await page.locator('#actions button[data-key="r"]:not([disabled]), #actions button[data-key="e"]:not([disabled])').count()) return;
      }
      continue;
    }
    const top = shown().last();
    let done = false;
    for (const label of ORDER) {
      const b = top.locator('.modal-foot button.btn:not([disabled])', { hasText: label }).first();
      if (await b.count()) { await page.waitForTimeout(700); await b.click().catch(() => {}); done = true; break; }
    }
    if (!done) {
      const any = top.locator('button.btn:not([disabled])').first();
      if (await any.count()) await any.click().catch(() => {}); else await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(400);
  }
}

const press = async (key) => {
  const b = page.locator(`#actions button[data-key="${key}"]:not([disabled])`).first();
  if (!(await b.count())) return false;
  await b.click();
  return true;
};
const who = () => run('return s.current.name;');
const turns = [];

/** Một lượt trọn vẹn; trả số giây từ lúc bấm lắc tới lúc lượt sau sẵn sàng. */
async function playTurn({ dice = [], onPick = [], label }) {
  const name = await who();
  const t = Date.now();
  let i = 0;
  for (let guard = 0; guard < 6; guard++) {
    if (dice[i]) await forceDice(...dice[i]);
    if (!(await press('r'))) break;
    await drain(onPick[i]);
    i += 1;
    if (await page.locator('#actions button[data-key="e"]:not([disabled])').count()) break;
  }
  await press('e');
  await page.waitForTimeout(1200);
  await drain(null, 8000);
  const sec = (Date.now() - t) / 1000;
  turns.push({ name, label, sec, rolls: i });
  console.log(`  ${name} · ${label} · ${i} lần lắc · ${sec.toFixed(1)}s`);
}

/** Bấm ô đi lùi trong hộp Quay Đầu: hai ô sáng, ô lùi là ô nhỏ hơn vị trí hiện tại (theo chiều kim đồng hồ). */
const goBack = async () => {
  const [pos, marked] = await Promise.all([run('return s.current.pos;'), markedTiles(page)]);
  const back = marked.find((id) => id !== (pos + 2) % 40) ?? marked[0];
  await cap('Xe Đạp chỉ đi 2 ô; hộp Quay Đầu + Xí Ngầu Gian hỏi cùng lúc · chọn đi lùi');
  await page.waitForTimeout(1800);
  await page.evaluate((t) => { window.__monopoly.scene.onTileClick(t); }, back);
};
const goForward = async () => {
  await cap('Ra đôi 6 khi đạp xe (level 2 tính đôi) · đi tới 6 ô, đạp trúng ô Bắt Đầu');
  await page.waitForTimeout(1800);
  // Quay Đầu đã dùng ở lượt 1 nên chỉ còn Xí Ngầu Gian hỏi: bấm ô đích là đi tới
  const cancel = page.locator('.tp-cancel');
  if (await cancel.count()) await cancel.click();
  else await page.evaluate((t) => { window.__monopoly.scene.onTileClick(t); }, (await markedTiles(page))[0]);
};

await cap('Ba Tư học 35/50 ô, đủ 5 tối thượng (hào quang trắng), bật hết: Xe Đạp, Cược, Cò Quay, Xổ Số, Góp Vốn');
await page.waitForTimeout(4000);
await cap('Lượt 1: lắc 5 + 2');
await playTurn({ label: 'Xe Đạp + Quay Đầu', dice: [[5, 2]], onPick: [goBack] });
await cap('Hai đối thủ đi bình thường (Xổ Số, Góp Vốn, Môi Giới của họ vẫn chạy)');
await playTurn({ label: 'đối thủ' });
await playTurn({ label: 'đối thủ' });
await cap('Lượt 2: lắc 6 + 6');
await playTurn({ label: 'đôi khi đạp xe + qua ô Bắt Đầu', dice: [[6, 6], [4, 6]], onPick: [goForward] });
await cap('Chơi tiếp không ép xí ngầu');
for (let k = 0; k < 6; k++) await playTurn({ label: 'tự do' });
await cap('');
await page.waitForTimeout(1500);

const frames = await page.evaluate(() => {
  window.__gapsOn = false;
  const g = window.__gaps.slice(5).sort((a, b) => a - b);
  const total = g.reduce((n, x) => n + x, 0);
  const at = (q) => g[Math.floor(g.length * q)];
  return { n: g.length, fps: Math.round((g.length / total) * 1000), p50: at(0.5), p95: at(0.95), p99: at(0.99),
    max: g[g.length - 1], over50: g.filter((x) => x > 50).length, over100: g.filter((x) => x > 100).length };
});

const banners = await page.evaluate(() => window.__bc);
const video = page.video();
await g.ctx.close();
const src = await video.path();
const ss = ((g.tStart - g.t0) / 1000).toFixed(2);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', ss, '-i', src,
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', `${OUT}/bat-du-ky-nang.mp4`]);
rmSync(RAW, { recursive: true, force: true });
console.log('  ✓', `${OUT}/bat-du-ky-nang.mp4`);

const report = { turns, frames, errors, banners };
writeFileSync(`${OUT}/do-luong.json`, JSON.stringify(report, null, 2));
console.log('\nKhung hình:', JSON.stringify(frames));
console.log('Lỗi console:', errors.length ? errors : 'không có');
await browser.close();
