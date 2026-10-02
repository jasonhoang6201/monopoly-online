/**
 * Quay video các tính năng cây kỹ năng để xem bằng mắt — không phải bài kiểm
 * thử, không chấm đúng sai. Mỗi đoạn một ngữ cảnh trình duyệt riêng nên ra một
 * file riêng; phần khai cuộc + bốc thăm ở đầu mỗi đoạn bị cắt bỏ bằng ffmpeg.
 *
 *   node tests/demo-videos.mjs            → test-result/videos/*.mp4
 *
 * Cần dev server ở cổng 5178 và ffmpeg trong PATH.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { launchChrome } from './launch.mjs';
import { playRollOff } from './rolloff.mjs';

const OUT = 'test-result/videos';
const RAW = `${OUT}/raw`;
// node tests/demo-videos.mjs 3 5 → chỉ quay lại đoạn 3 và 5
const only = process.argv.slice(2).map(Number);
const want = (n) => !only.length || only.includes(n);
if (!only.length) rmSync(OUT, { recursive: true, force: true });
mkdirSync(RAW, { recursive: true });

const browser = await launchChrome();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Mở một ván 3 người trong ngữ cảnh có quay phim. */
async function openGame(viewport) {
  const ctx = await browser.newContext({ viewport, recordVideo: { dir: RAW, size: viewport } });
  const t0 = Date.now();
  const page = await ctx.newPage();
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

  const run = (fn, arg) => page.evaluate(async ([src, a]) => {
    const c = window.__monopoly.controller;
    // eslint-disable-next-line no-new-func
    return new Function('c', 's', 'a', `return (async () => { ${src} })()`)(c, c.state, a);
  }, [fn, arg]);

  // Bàn sạch: 1500$, chưa ai học gì, không ai sở hữu gì
  await run(`
    for (const p of s.players) {
      p.money = 1500; p.skills = []; p.skillPoints = 0; p.laps = 0; p.cooldowns = {};
      p.skillLv = {}; p.lapUses = {}; p.jails = 0; p.skillUse = {};
    }
    c.hud.refresh(); c.scene.refresh(s); c.restoreActions();
  `);
  await page.waitForTimeout(600);
  return { ctx, page, run, t0, tStart: Date.now() };
}

/** Dòng chú thích phía trên màn hình, chỉ để người xem video biết đang xem gì. */
const cap = (page, text) => page.evaluate((t) => {
  let el = document.getElementById('demo-cap');
  if (!el) {
    el = document.createElement('div');
    el.id = 'demo-cap';
    el.style.cssText = 'position:fixed;bottom:10px;left:50%;transform:translateX(-50%);z-index:999999;'
      + 'pointer-events:none;background:rgba(10,10,10,.82);color:#fff;font:600 19px/1.35 system-ui;'
      + 'padding:8px 16px;border-radius:8px;max-width:86vw;text-align:center';
    document.body.appendChild(el);
  }
  el.textContent = t;
  el.style.display = t ? '' : 'none';
}, text);

/** Ép hai con xí ngầu kế tiếp (hai lần gọi Math.random đầu tiên là của rollDice). */
const forceDice = (page, a, b) => page.evaluate(([x, y]) => {
  const orig = Math.__orig || (Math.__orig = Math.random);
  const seq = [(x - 1) / 6 + 0.01, (y - 1) / 6 + 0.01];
  let i = 0;
  Math.random = () => (i < 2 ? seq[i++] : orig());
}, [a, b]);

/** Bấm qua các hộp thoại phát sinh (mua đất, thông báo) cho tới khi hết. */
async function drain(page, ms = 6000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    const b = page.locator('#modal-root .scrim.show .modal-foot button', { hasText: /Bỏ qua|Không mua|Đóng|Tiếp tục|OK|Ở lại/ }).first();
    if (await b.count()) { await page.waitForTimeout(900); await b.click().catch(() => {}); }
    await page.waitForTimeout(300);
  }
}

/** Đóng ngữ cảnh, cắt phần khai cuộc, đổi sang mp4. */
async function finish(g, name) {
  const video = g.page.video();
  await g.ctx.close();
  const src = await video.path();
  const ss = ((g.tStart - g.t0) / 1000).toFixed(2);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', ss, '-i', src,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', `${OUT}/${name}.mp4`]);
  console.log('  ✓', `${OUT}/${name}.mp4`);
}

/* ------------------------------------------------ 1. học và lên level */
if (want(1)) {
  console.log('1. học kỹ năng, lên level, mở tối thượng');
  const g = await openGame({ width: 1600, height: 1000 });
  const { page, run } = g;
  await run(`s.current.skillPoints = 9; c.restoreActions();`);
  await cap(page, '9 điểm kỹ năng. Bấm nút Kỹ năng để mở cây');
  await page.waitForTimeout(1500);
  await page.locator('#actions button', { hasText: 'Kỹ năng' }).click();
  await page.locator('.st-node[data-id="cn1"]').waitFor();
  await page.waitForTimeout(1200);
  const node = (id) => page.locator(`.st-node[data-id="${id}"]`);
  const learn = async (text, ms = 2600) => {
    await page.waitForTimeout(ms);
    await page.locator('[data-act="learn"]').click();
    await page.waitForTimeout(900);
  };
  await cap(page, 'Level 1: số tiền ngẫu nhiên trong khoảng (10–40$), 1 điểm');
  await node('cn1').click(); await learn();
  await cap(page, 'Lên level cần điều kiện: kỹ năng phải nhặt đủ 150$, nút Lên level còn mờ');
  await node('cn1').click();
  await page.waitForTimeout(5000);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  await run(`s.current.skillUse = { cn1: { n: 11, gain: 420 } };`);
  await cap(page, 'Sau vài vòng kỹ năng đã nhặt được 420$: đủ điều kiện level 2 (150$) và level 3 (400$)');
  await page.waitForTimeout(1500);
  await node('cn1').click(); await learn(3500);
  await cap(page, 'Level 3: 45% khả năng, 40$, sáng 3 chấm level');
  await node('cn1').click(); await learn();
  await cap(page, 'Học tiếp tầng 2 và tầng 3 (level 1 là đủ để mở tối thượng)');
  await node('cn2a').click(); await learn(1800);
  await node('cn3').click(); await learn(1800);
  await cap(page, 'Tối thượng Liên Đoàn Lao Động · 3 điểm');
  await node('cnU').click(); await learn(3500);
  await page.waitForTimeout(1500);
  await cap(page, 'Đóng cây → quân có hào quang màu nhánh Công Nhân');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(4500);
  await cap(page, 'Lắc xí ngầu: quân để lại bóng mờ khi đi');
  await forceDice(page, 3, 5);
  await page.locator('#actions button', { hasText: 'Lắc xí ngầu' }).click();
  await page.waitForTimeout(6000);
  await drain(page, 3000);
  await finish(g, '1-hoc-va-len-level');
}

/* ------------------------------------------------ 2. hào quang trộn màu */
if (want(2)) {
  console.log('2. hào quang và bóng mờ theo số tối thượng');
  const g = await openGame({ width: 1600, height: 1000 });
  const { page, run } = g;
  const U = { cn: ['cn1','cn2a','cn3','cnU'], dh: ['dh1','dh2a','dh3','dhU'], dd: ['dd1','dd2a','dd3','ddU'],
    dc: ['dc1','dc2a','dc3','dcU'], ac: ['ac1','ac2a','ac3','acU'] };
  const setUlts = (list) => run(`
    a.forEach((ids, i) => { s.players[i].skills = ids; });
    c.scene.refresh(s);
  `, list);
  await run(`const [a, b, d] = s.players; a.pos = 1; b.pos = 11; d.pos = 21;
    c.scene.refresh(s); for (const [i, p] of s.players.entries()) await c.scene.jumpToken(i, p.pos);`);
  const walk = async (i, name, note) => {
    await cap(page, `${name}: ${note}`);
    await page.waitForTimeout(1600);
    await run(`const p = s.players[a]; const from = p.pos; p.pos = (p.pos + 6) % 40; await c.scene.moveToken(a, from, 6);`, i);
    await page.waitForTimeout(1400);
  };
  await setUlts([U.cn, [...U.cn, ...U.dh], [...U.dd, ...U.dc, ...U.ac]]);
  await walk(0, 'Ba Tư', '1 tối thượng (Công Nhân) → màu nhánh');
  await walk(1, 'Cô Hai', '2 tối thượng (Công Nhân + Du Hành) → hồng tím riêng của cặp này');
  await walk(2, 'Chú Sáu', '3 tối thượng (Đỏ Đen + Đầu Cơ + An Cư) → vàng chanh riêng');
  await setUlts([[...U.dh, ...U.ac], [...U.cn, ...U.dh, ...U.dd, ...U.dc], [...U.cn, ...U.dh, ...U.dd, ...U.dc, ...U.ac]]);
  await walk(0, 'Ba Tư', '2 tối thượng (Du Hành + An Cư) → xanh ngọc');
  await walk(1, 'Cô Hai', '4 tối thượng → đen');
  await walk(2, 'Chú Sáu', 'đủ 5 tối thượng → trắng (viền tối để tách khỏi nền ô)');
  await cap(page, 'Nhảy thẳng (Xuyên Việt) cũng để bóng mờ');
  await run(`const p = s.players[1]; p.pos = 30; await c.scene.jumpToken(1, 30);`);
  await page.waitForTimeout(2200);
  await finish(g, '2-hao-quang-bong-mo');
}

/* ------------------------------------------------ 3. tab cây kỹ năng trong hồ sơ */
if (want(3)) {
  console.log('3. tab cây kỹ năng trong bảng tài sản');
  const g = await openGame({ width: 1600, height: 1000 });
  const { page, run } = g;
  await run(`
    const q = s.players[1];
    q.skills = ['dd1','dd2a','dd3','ddU','dc1']; q.skillLv = { dd1: 3, dd3: 2 }; q.skillPoints = 2;
    for (const id of [1, 3, 6]) s.owner.set(id, q.id);
    c.hud.refresh(); c.scene.refresh(s);
  `);
  await cap(page, 'Bấm thẻ người chơi Cô Hai ở bảng bên cạnh');
  await page.waitForTimeout(1800);
  // Thẻ người chơi có thể nằm trong ngăn đang gập: gọi thẳng hàm mà thẻ gọi
  await run('c.showPlayer(s.players[1].id);');
  await page.locator('.ptab[data-tab="skills"]').waitFor();
  await page.waitForTimeout(2000);
  await cap(page, 'Tab "Cây kỹ năng": chỉ xem, không học hộ được');
  await page.locator('.ptab[data-tab="skills"]').click();
  await page.waitForTimeout(3500);
  await cap(page, 'Bấm một ô để xem level đã có');
  await page.locator('.ppane-skills .st-node[data-id="dd1"]').click();
  await page.waitForTimeout(3500);
  await page.locator('.ppane-skills [data-act="cancel"]').click();
  await page.waitForTimeout(600);
  await page.locator('.ppane-skills .st-node[data-id="dd3"]').click();
  await page.waitForTimeout(3500);
  await page.locator('.ppane-skills [data-act="cancel"]').click();
  await page.waitForTimeout(600);
  await cap(page, 'Quay về tab Tài sản');
  await page.locator('.ptab[data-tab="assets"]').click();
  await page.waitForTimeout(2500);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  await finish(g, '3-tab-ho-so');
}

/* ------------------------------------------------ 4. Liên Đoàn Lao Động */
if (want(4)) {
  console.log('4. Liên Đoàn Lao Động khi qua ô Bắt Đầu');
  const g = await openGame({ width: 1600, height: 1000 });
  const { page, run } = g;
  const info = await run(`
    const p = s.current;
    p.skills = ['cn1','cn2a','cn3','cnU']; p.skillLv = { cnU: 3 };
    p.laps = 9; p.jails = 1; p.money = 1500; p.pos = 37;
    const others = s.players.filter((q) => q.id !== p.id);
    others[0].money = 900; others[1].money = 40;
    c.hud.refresh(); c.scene.refresh(s); await c.scene.jumpToken(s.players.indexOf(p), 37);
    c.restoreActions();
    return p.name;
  `);
  await cap(page, `${info}: Liên Đoàn level 3, đã qua Bắt Đầu 9 lần, vào tù 1 lần → 3% + 10% − 3% = 10% tiền mặt`);
  await page.waitForTimeout(4500);
  await cap(page, 'Trần mỗi người: 18$ × 10 lần qua = 180$ · người chỉ có 40$ thì nộp hết 40$');
  await page.waitForTimeout(4000);
  await forceDice(page, 1, 2);
  await page.locator('#actions button', { hasText: 'Lắc xí ngầu' }).click();
  await page.waitForTimeout(14000);
  await drain(page, 3000);
  await cap(page, '');
  await page.waitForTimeout(1500);
  await finish(g, '4-lien-doan-lao-dong');
}

/* ------------------------------------------------ 5. Tàu Tốc Hành level 3 */
if (want(5)) {
  console.log('5. Tàu Tốc Hành level 3');
  const g = await openGame({ width: 1600, height: 1000 });
  const { page, run } = g;
  await run(`
    const p = s.current; p.skills = ['dh1','dh2a']; p.skillLv = { dh2a: 3 }; p.pos = 2;
    c.scene.refresh(s); await c.scene.jumpToken(s.players.indexOf(p), 2); c.restoreActions();
  `);
  await cap(page, 'Tàu Tốc Hành level 3: dừng ở ga → 3 ga còn lại sáng trên bàn cờ, bấm ga nào đi ga đó (+100$)');
  await page.waitForTimeout(3000);
  await forceDice(page, 1, 2);
  await page.locator('#actions button', { hasText: 'Lắc xí ngầu' }).click();
  // Ga 5 chưa có chủ: bỏ qua hộp mua đất để tới lượt chọn ga
  const pick = page.locator('.tile-pick[data-quick]');
  for (let i = 0; i < 30 && !(await pick.count()); i++) {
    const skip = page.locator('#modal-root .scrim.show .modal-foot button', { hasText: /Bỏ qua|Không mua/ }).first();
    if (await skip.count()) { await page.waitForTimeout(1200); await skip.click().catch(() => {}); }
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(4000);
  await cap(page, 'Bấm Ga Sài Gòn trên bàn cờ. Không muốn đi thì bấm "Ở lại"');
  await page.waitForTimeout(1500);
  await page.evaluate(() => { window.__monopoly.scene.onTileClick(35); });
  await page.waitForTimeout(6000);
  await drain(page, 4000);
  await finish(g, '5-tau-toc-hanh-level-3');
}

/* ------------------------------------------------ 6. điện thoại nằm ngang */
if (want(6)) {
  console.log('6. điện thoại nằm ngang: lên level + tab hồ sơ');
  const g = await openGame({ width: 844, height: 390 });
  const { page, run } = g;
  await run(`
    s.current.skillPoints = 3; c.restoreActions();
    const q = s.players.find((x) => x.id !== s.current.id);
    q.skills = ['ac1','ac2a','ac3','acU','dh1']; q.skillLv = { ac1: 2, acU: 3 };
    c.hud.refresh(); c.scene.refresh(s);
  `);
  await cap(page, 'Điện thoại nằm ngang');
  await page.waitForTimeout(1500);
  await page.locator('#actions button', { hasText: 'Kỹ năng' }).click();
  await page.locator('.st-node[data-id="dd1"]').waitFor();
  await page.waitForTimeout(1500);
  await page.locator('.st-node[data-id="dd1"]').click();
  await page.waitForTimeout(2500);
  await page.locator('[data-act="learn"]').click();
  await page.waitForTimeout(1200);
  await page.locator('.st-node[data-id="dd1"]').click();
  await page.waitForTimeout(2500);
  await page.locator('[data-act="learn"]').click();
  await page.waitForTimeout(1500);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(3500);
  await cap(page, 'Hồ sơ người khác → tab Cây kỹ năng, ✕ để đóng');
  // Màn thấp có thể giấu thẻ người chơi: gọi thẳng hàm mà thẻ người chơi gọi
  await run('c.showPlayer(s.players.find((x) => x.id !== s.current.id).id);');
  await page.locator('.ptab[data-tab="skills"]').waitFor({ timeout: 8000 });
  await page.waitForTimeout(1500);
  await page.locator('.ptab[data-tab="skills"]').click();
  await page.waitForTimeout(3000);
  await page.locator('.ppane-skills .st-node[data-id="acU"]').click();
  await page.waitForTimeout(3500);
  await page.locator('.ppane-skills [data-act="cancel"]').click();
  await page.waitForTimeout(1500);
  await page.locator('.ppane-skills .st-close').click().catch(() => page.keyboard.press('Escape'));
  await page.waitForTimeout(1500);
  await finish(g, '6-dien-thoai-ngang');
}

/* ------------------------------------------------ 7. Quay Đầu chọn trên bàn cờ */
if (want(7)) {
  console.log('7. Quay Đầu: chọn ô đi tới / đi lùi trên bàn cờ');
  const g = await openGame({ width: 1600, height: 1000 });
  const { page, run } = g;
  await run(`
    const p = s.current; p.skills = ['dh1','dh2a','dh3']; p.pos = 12;
    c.scene.refresh(s); await c.scene.jumpToken(s.players.indexOf(p), 12); c.restoreActions();
  `);
  await cap(page, 'Quay Đầu: lắc xong, ô đi tới và ô đi lùi cùng sáng. Bấm ô nào đi ô đó');
  await page.waitForTimeout(2500);
  await forceDice(page, 3, 4);
  await page.locator('#actions button', { hasText: 'Lắc xí ngầu' }).click();
  await page.locator('.tile-pick[data-quick]').waitFor({ timeout: 15000 });
  await page.waitForTimeout(4000);
  await cap(page, 'Bấm ô đi lùi (ô 5). Nút "Đi tới như thường" để bỏ kỹ năng');
  await page.waitForTimeout(1500);
  await page.evaluate(() => { window.__monopoly.scene.onTileClick(5); });
  await page.waitForTimeout(5000);
  await drain(page, 3000);
  await finish(g, '7-quay-dau-chon-tren-ban');
}

/* ------------------------------------------------ 8. kỹ năng thành tựu */
if (want(8)) {
  console.log('8. kỹ năng thành tựu: mở khoá, Hai Ngón, Tài Xỉu');
  const g = await openGame({ width: 1600, height: 1000 });
  const { page, run } = g;
  const node = (id) => page.locator(`.st-node[data-id="${id}"]`);
  const openTree = async () => {
    await page.locator('#actions button', { hasText: 'Kỹ năng' }).click();
    await page.locator('.st-node[data-id="cn1"]').waitFor();
    await page.waitForTimeout(900);
  };
  await run(`
    const p = s.current; p.skillPoints = 5; p.laps = 2; p.jails = 1;
    p.skills = ['dh1', 'dh2b', 'dd1', 'dd2a'];
    p.feats = { share: 3, steps: 130, betWin: 520, rentIn: 300 };
    c.restoreActions();
  `);
  await cap(page, 'Mỗi nhánh: 1 ô → 3 ô → 2 ô → tối thượng. Ô vuông là kỹ năng thành tựu: cần ô đứng trước + làm đủ một việc trong ván');
  await page.waitForTimeout(1500);
  await openTree();
  await page.waitForTimeout(2500);
  await cap(page, 'Hai Ngón (cấp 3): đã học Về Nhà ở cấp 2, nhưng còn cần dừng chung ô với người khác 5 lần, mới được 3/5');
  await node('dhX1').click();
  await page.waitForTimeout(5000);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(2500);
  await run(`s.current.feats.share = 5; c.restoreActions();`);
  await cap(page, 'Dừng chung ô đủ 5 lần → Hai Ngón mở khoá, học tốn 2 điểm như ô cấp 3');
  await openTree();
  await node('dhX1').click();
  await page.waitForTimeout(3500);
  await page.locator('[data-act="learn"]').click();
  await page.waitForTimeout(1200);
  await cap(page, 'Thắng cược đủ 400$ → Thần Tài Xỉu cũng đã mở khoá');
  await node('ddX1').click();
  await page.waitForTimeout(3500);
  await page.locator('[data-act="learn"]').click();
  await page.waitForTimeout(1500);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(3000);

  // Người kia đứng ở Bến Đậu (ô 20), mình đứng ô 12 — lắc 3 + 5 là dừng chung ô
  await run(`
    const p = s.current, q = s.players.find((x) => x.id !== p.id);
    p.pos = 12; q.pos = 20; q.money = 3000;
    c.scene.refresh(s);
    await c.scene.jumpToken(s.players.indexOf(q), 20);
    await c.scene.jumpToken(s.players.indexOf(p), 12);
    c.hud.refresh(); c.restoreActions();
  `);
  await cap(page, 'Hai Ngón: dừng ở ô có người khác → 30% khả năng lấy 5–10% tiền mặt người giàu nhất ở đó');
  await page.waitForTimeout(3000);
  // Hai con xí ngầu 3 + 5, sau đó mọi lần rút đều trúng khả năng 30% của Hai Ngón
  await page.evaluate(() => {
    const orig = Math.__orig || (Math.__orig = Math.random);
    const seq = [2 / 6 + 0.01, 4 / 6 + 0.01];
    let i = 0;
    // Hoạt cảnh đi quân cũng gọi Math.random nên không đếm số lần — giữ 0.05 tới khi quân dừng hẳn
    Math.random = () => (i < 2 ? seq[i++] : 0.05);
  });
  await page.locator('#actions button', { hasText: 'Lắc xí ngầu' }).click();
  await page.waitForTimeout(9000);
  await drain(page, 2500);
  await page.evaluate(() => { if (Math.__orig) Math.random = Math.__orig; });

  await run(`c.lastRolled = false; c.restoreActions();`);
  await cap(page, 'Thần Tài Xỉu: hộp Cược Chẵn Lẻ có thêm cửa Tài (8–12) và Xỉu (2–6), ra 7 thì cả hai thua');
  await page.waitForTimeout(2000);
  await page.locator('#actions button', { hasText: 'Cược Chẵn Lẻ' }).click();
  await page.locator('.sk-bet').waitFor();
  await page.waitForTimeout(2500);
  await page.locator('.sk-bet [data-v="big"]').click();
  await page.waitForTimeout(800);
  await page.locator('.sk-bet [data-v="100"]').click();
  await page.waitForTimeout(1500);
  await page.locator('#modal-root .scrim.show button', { hasText: 'Đặt cược' }).click();
  await page.waitForTimeout(3000);
  await cap(page, 'Lắc ra 6 + 3 = 9 → Tài trúng');
  await forceDice(page, 6, 3);
  await page.locator('#actions button', { hasText: 'Lắc xí ngầu' }).click();
  await page.waitForTimeout(8000);
  await drain(page, 3000);
  await finish(g, '8-ky-nang-thanh-tuu');
}

/* ------------------------------------------------ 9. Khách Sộp và Chủ Nhà */
if (want(9)) {
  console.log('9. hai kỹ năng thành tựu mới: Khách Sộp, Chủ Nhà');
  const g = await openGame({ width: 1600, height: 1000 });
  const { page, run } = g;
  const node = (id) => page.locator(`.st-node[data-id="${id}"]`);
  await run(`
    const p = s.current; p.skillPoints = 4; p.skills = ['dc1', 'ac1'];
    p.feats = { buys: 4, home: 4 };
    c.restoreActions();
  `);
  await cap(page, 'Khách Sộp (cấp 2 Đầu Cơ) mở khi đã mua 4 ô; Chủ Nhà (cấp 2 An Cư) mở khi dừng trên đất mình 4 lần');
  await page.waitForTimeout(1500);
  await page.locator('#actions button', { hasText: 'Kỹ năng' }).click();
  await node('dcX2').waitFor();
  await page.waitForTimeout(1500);
  for (const id of ['dcX2', 'acX2']) {
    await node(id).click();
    await page.waitForTimeout(3500);
    await page.locator('[data-act="learn"]').click();
    await page.waitForTimeout(1500);
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(2500);

  await run(`
    const p = s.current; p.pos = 34; c.scene.refresh(s);
    await c.scene.jumpToken(s.players.indexOf(p), 34);
    c.hud.refresh(); c.restoreActions();
  `);
  await cap(page, 'Lắc 2 + 3 → dừng ở ô cuối chưa có chủ, mua 400$ → ngân hàng hoàn lại 5–15%');
  await page.waitForTimeout(2000);
  await forceDice(page, 2, 3);
  await page.locator('#actions button', { hasText: 'Lắc xí ngầu' }).click();
  const buy = page.locator('#modal-root .scrim.show button', { hasText: 'Mua' }).first();
  await buy.waitFor({ timeout: 15000 });
  await page.waitForTimeout(1500);
  await buy.click();
  await page.waitForTimeout(7000);
  await drain(page, 2000);

  await run(`
    const p = s.current; p.pos = 34; c.scene.refresh(s);
    await c.scene.jumpToken(s.players.indexOf(p), 34);
    c.lastRolled = false; c.hud.refresh(); c.restoreActions();
  `);
  await cap(page, 'Lắc lại 2 + 3 → dừng trên đất của mình → Chủ Nhà trả 15–35$');
  await page.waitForTimeout(2000);
  await forceDice(page, 2, 3);
  await page.locator('#actions button', { hasText: 'Lắc xí ngầu' }).click();
  await page.waitForTimeout(8000);
  await drain(page, 2000);
  await page.locator('#actions button', { hasText: 'Kỹ năng' }).click();
  await node('dcX2').waitFor();
  await cap(page, 'Tiền hoàn và tiền thưởng cộng vào điều kiện lên level của hai ô này');
  await node('dcX2').click();
  await page.waitForTimeout(4500);
  await finish(g, '9-khach-sop-chu-nha');
}

await browser.close();
console.log('\nXong:', OUT);
