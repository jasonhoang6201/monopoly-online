/**
 * Quay video kỹ năng nhánh phụ và tối thượng thứ hai để xem UX trước khi chốt
 * — không phải bài kiểm thử. Mỗi đoạn một ngữ cảnh trình duyệt nên ra một file
 * riêng; phần khai cuộc + bốc thăm bị cắt bỏ bằng ffmpeg.
 *
 *   node tests/demo-skills2.mjs          → test-result/videos2/*.mp4
 *   node tests/demo-skills2.mjs 3 5      → chỉ quay lại đoạn 3 và 5
 *
 * Cần dev server ở cổng 5178 và ffmpeg trong PATH.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { launchChrome } from './launch.mjs';
import { playRollOff } from './rolloff.mjs';

const OUT = 'test-result/videos2';
const RAW = `${OUT}/raw`;
const only = process.argv.slice(2).map(Number);
const want = (n) => !only.length || only.includes(n);
if (!only.length) rmSync(OUT, { recursive: true, force: true });
mkdirSync(RAW, { recursive: true });

const browser = await launchChrome();
const errors = [];

async function openGame(viewport) {
  const ctx = await browser.newContext({ viewport, recordVideo: { dir: RAW, size: viewport } });
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

  /** `me` = người đang đi, `o1`, `o2` = hai người còn lại theo thứ tự ghế. */
  const run = (fn, arg) => page.evaluate(async ([src, a]) => {
    const c = window.__monopoly.controller;
    const s = c.state;
    const me = s.current;
    const [o1, o2] = s.players.filter((q) => q !== me);
    // eslint-disable-next-line no-new-func
    return new Function('c', 's', 'me', 'o1', 'o2', 'a', `return (async () => { ${src} })()`)(c, s, me, o1, o2, a);
  }, [fn, arg]);

  await run(`
    for (const p of s.players) {
      p.money = 1500; p.skills = []; p.skillPoints = 0; p.laps = 0; p.cooldowns = {};
      p.skillLv = {}; p.lapUses = {}; p.jails = 0; p.skillUse = {}; p.feats = {};
      p.lotto = null; p.spin = false; p.stake = null; p.jailSits = 0;
    }
    c.hud.refresh(); c.scene.refresh(s); c.restoreActions();
  `);
  await page.waitForTimeout(600);
  return { ctx, page, run, t0, tStart: Date.now() };
}

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

/** Ép hai con xí ngầu kế tiếp. */
const forceDice = (page, a, b) => page.evaluate(([x, y]) => {
  const orig = Math.__orig || (Math.__orig = Math.random);
  const seq = [(x - 1) / 6 + 0.01, (y - 1) / 6 + 0.01];
  let i = 0;
  Math.random = () => (i < 2 ? seq[i++] : orig());
}, [a, b]);

/** Bấm qua hộp mua đất / thông báo cho tới khi hết. */
async function drain(page, ms = 6000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    const b = page.locator('#modal-root .scrim.show .modal-foot button', { hasText: /Bỏ qua|Không mua|Đóng|Tiếp tục|OK|Ở lại|Đành chịu|Chấp nhận|Nhận tiền|Lên đường|Cất vào túi/ }).first();
    if (await b.count()) { await page.waitForTimeout(900); await b.click().catch(() => {}); }
    await page.waitForTimeout(300);
  }
}

const btn = (page, text) => page.locator('#actions button', { hasText: text }).first();
const modalBtn = (page, text) => page.locator('#modal-root .scrim.show').last().locator('button', { hasText: text }).first();

/** Mở kho "Dùng kỹ năng" rồi bấm kỹ năng có tên `name`. */
async function kit(page, name, ms = 2200) {
  await btn(page, 'Dùng kỹ năng').click();
  await page.locator('.kit').waitFor();
  await page.waitForTimeout(ms);
  await page.locator('.kit-item:not([disabled])', { hasText: name }).first().click();
}

/** Chọn một ô trên bàn cờ rồi chốt ở hộp xác nhận. */
async function pickTile(page, id) {
  await page.locator('.tile-pick').first().waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(2600);
  await page.evaluate((t) => { window.__monopoly.scene.onTileClick(t); }, id);
  await page.waitForTimeout(1400);
  const quick = await page.locator('.tile-pick[data-quick]').count();
  if (!quick) await page.locator('.scrim.show .modal-foot button.btn').first().click({ timeout: 10000 });
}

async function finish(g, name) {
  const video = g.page.video();
  await g.ctx.close();
  const src = await video.path();
  const ss = ((g.tStart - g.t0) / 1000).toFixed(2);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', ss, '-i', src,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', `${OUT}/${name}.mp4`]);
  console.log('  ✓', `${OUT}/${name}.mp4`);
}

/* ------------------------------------------------ 1. cây: mỗi ô một cha, hai tối thượng */
if (want(1)) {
  console.log('1. cây kỹ năng: mỗi ô một cha, nhánh phụ, chọn một trong hai tối thượng');
  const g = await openGame({ width: 1600, height: 1000 });
  const { page, run } = g;
  await run(`me.skills = ['dh1','dh2a','dh2b']; me.skillPoints = 9; c.restoreActions();`);
  await btn(page, 'Kỹ năng').click();
  const node = (id) => page.locator(`.st-node[data-id="${id}"]`);
  await node('dhS1').waitFor();
  await cap(page, 'Mỗi ô chỉ nối từ một ô cha: học ô cha rồi mới mở ô con');
  await page.waitForTimeout(4500);
  await cap(page, 'Tàu Tốc Hành → Quay Đầu → Xuyên Việt;  Về Nhà → Hai Ngón → BOT;  Về Nhà → Xe Đạp;  Phượt Thủ → Dẫn Tour');
  await page.waitForTimeout(5500);
  await cap(page, 'Học Quay Đầu (mọc từ Tàu Tốc Hành)');
  await node('dh3').click();
  await page.waitForTimeout(3500);
  await page.locator('[data-act="learn"]').click();
  await page.waitForTimeout(1200);
  await cap(page, 'Dẫn Tour còn khoá: ô cha của nó là Phượt Thủ, chưa học');
  await node('dhS2').click();
  await page.waitForTimeout(4500);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(700);
  await cap(page, 'Học Xe Đạp (nhánh phụ, mọc từ Về Nhà)');
  await node('dhS1').click();
  await page.waitForTimeout(3000);
  await page.locator('[data-act="learn"]').click();
  await page.waitForTimeout(1200);
  await cap(page, 'Chọn tối thượng Xuyên Việt → BOT khoá (và vốn cũng chưa có Hai Ngón)');
  await node('dhU').click();
  await page.waitForTimeout(3000);
  await page.locator('[data-act="learn"]').click();
  await page.waitForTimeout(1500);
  await node('dhV').click();
  await page.waitForTimeout(5000);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1500);
  await finish(g, '1-cay-mot-cha');
}

/* ------------------------------------------------ 2. nút trước khi lắc */
if (want(2)) {
  console.log('2. các nút kỹ năng trước khi lắc');
  const g = await openGame({ width: 1600, height: 1000 });
  const { page, run } = g;
  await run(`me.skills = ['dhS1','ddS2','dcS2','ddV']; me.pos = 21;
    c.scene.refresh(s); await c.scene.jumpToken(s.players.indexOf(me), 21); c.restoreActions();`);
  await cap(page, 'Thanh nút chỉ có thêm 1 nút "Dùng kỹ năng": bấm vào mới mở kho');
  await page.waitForTimeout(4000);
  await btn(page, 'Dùng kỹ năng').click();
  await page.locator('.kit').waitFor();
  await cap(page, 'Kho kỹ năng: ô sáng là dùng được ngay, ô mờ ghi lý do');
  await page.waitForTimeout(4500);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  await cap(page, 'Cò Quay Lương đang tắt: nền xám. Bấm để bật');
  await kit(page, 'Cò Quay', 3500);
  await page.waitForTimeout(2500);
  await btn(page, 'Dùng kỹ năng').click();
  await page.locator('.kit').waitFor();
  await cap(page, 'Bật rồi: ô Cò Quay hiện màu như thường');
  await page.waitForTimeout(3500);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  await cap(page, 'Góp Vốn: chip màu từng người, chọn một người thì người kia xám đi, bấm Chốt');
  await kit(page, 'Góp Vốn');
  await page.locator('.stake-list').waitFor();
  await page.waitForTimeout(2500);
  await page.locator('.stake-chip', { hasText: 'Chú Sáu' }).click();
  await page.waitForTimeout(1500);
  await page.locator('.stake-chip', { hasText: 'Cô Hai' }).click();
  await page.waitForTimeout(2000);
  await modalBtn(page, 'Chốt').click();
  await page.waitForTimeout(2800);
  await cap(page, 'Xổ Số: chọn một tổng; số giữ qua các vòng, đổi được 1 lần mỗi vòng');
  await kit(page, 'Xổ Số');
  await page.locator('.sk-lotto').waitFor();
  await page.waitForTimeout(2500);
  await page.locator('.sk-lotto button[data-v="10"]').click();
  await page.waitForTimeout(1000);
  await modalBtn(page, 'Chọn số này').click();
  await page.waitForTimeout(3000);
  await cap(page, 'Xe Đạp: lần lắc này chỉ đi theo viên nhỏ hơn');
  await kit(page, 'Xe Đạp');
  await page.waitForTimeout(2800);
  await cap(page, 'Lắc 5 + 2 → đi 2 ô');
  await forceDice(page, 5, 2);
  await btn(page, 'Lắc xí ngầu').click();
  await page.waitForTimeout(5500);
  await cap(page, 'Không mua ô này: ô được ghi lại cho Nhặt Hàng Thừa của người khác');
  await drain(page, 4000);
  await page.waitForTimeout(1500);
  await finish(g, '2-nut-truoc-khi-lac');
}

/* ------------------------------------------------ 3. chọn ô trên bàn: Nhặt Hàng Thừa, Siết Nợ */
if (want(3)) {
  console.log('3. Nhặt Hàng Thừa và Siết Nợ');
  const g = await openGame({ width: 1600, height: 1000 });
  const { page, run } = g;
  await run(`
    me.skills = ['dcS1', 'dcV'];
    s.passedUp.set(23, [o1.id]); s.passedUp.set(39, [o2.id]); s.passedUp.set(3, [me.id]);
    s.owner.set(6, o1.id); s.owner.set(8, o1.id); s.mortgaged.add(6);
    c.hud.refresh(); c.scene.refresh(s); c.restoreActions();
  `);
  await cap(page, 'Kho kỹ năng: Nhặt Hàng Thừa (có ô người khác bỏ qua) và Siết Nợ (có đất thế chấp)');
  await page.waitForTimeout(2500);
  await kit(page, 'Nhặt Hàng Thừa', 3500);
  await cap(page, 'Chỉ ô người khác đã dừng mà không mua mới sáng (ô mình tự bỏ qua thì không): mua 80% giá');
  await pickTile(page, 39);
  await page.waitForTimeout(5000);
  await kit(page, 'Siết Nợ');
  await cap(page, 'Siết Nợ: chỉ ô đang thế chấp của người khác sáng: trả ngân hàng số thế chấp + 20% cho chủ cũ');
  await pickTile(page, 6);
  await page.waitForTimeout(6000);
  await finish(g, '3-nhat-hang-thua-siet-no');
}

/* ------------------------------------------------ 4. Bài Tẩy */
if (want(4)) {
  console.log('4. Bài Tẩy');
  const g = await openGame({ width: 1600, height: 1000 });
  const { page, run } = g;
  await run(`me.skills = ['ddS1', 'cnS1']; me.skillLv = { ddS1: 3 }; me.pos = 19;
    c.scene.refresh(s); await c.scene.jumpToken(s.players.indexOf(me), 19); c.restoreActions();`);
  await cap(page, 'Bài Tẩy level 3: dừng ô Cơ Hội → rút 3 lá, chọn 1');
  await page.waitForTimeout(2500);
  await forceDice(page, 1, 2);
  await btn(page, 'Lắc xí ngầu').click();
  await page.locator('.hand').waitFor({ timeout: 20000 });
  await page.waitForTimeout(3000);
  await page.locator('.hand-card[data-i="1"]').hover();
  await page.waitForTimeout(2000);
  await page.locator('.hand-card[data-i="1"]').click();
  await cap(page, 'Lá đã chọn chạy như thường; hai lá kia xáo về bộ');
  await page.waitForTimeout(3000);
  await drain(page, 9000);
  await finish(g, '4-bai-tay');
}

/* ------------------------------------------------ 4b. Bài Tẩy trên điện thoại */
if (want(41)) {
  console.log('4b. Bài Tẩy trên màn điện thoại nằm ngang');
  const g = await openGame({ width: 844, height: 390 });
  const { page, run } = g;
  await run(`me.skills = ['ddS1']; me.skillLv = { ddS1: 3 }; me.pos = 19;
    c.scene.refresh(s); await c.scene.jumpToken(s.players.indexOf(me), 19); c.restoreActions();`);
  await forceDice(page, 1, 2);
  await btn(page, 'Lắc xí ngầu').click();
  await page.locator('.hand').waitFor({ timeout: 20000 });
  await page.waitForTimeout(4000);
  await page.locator('.hand-card[data-i="0"]').click();
  await page.waitForTimeout(3000);
  await drain(page, 6000);
  await finish(g, '4b-bai-tay-mobile');
}

/* ------------------------------------------------ 5. Ở Tù Cho Lành */
if (want(5)) {
  console.log('5. Ở Tù Cho Lành');
  const g = await openGame({ width: 1600, height: 1000 });
  const { page, run } = g;
  await run(`me.skills = ['cnS2']; s.sendToJail(me);
    c.scene.refresh(s); await c.scene.jumpToken(s.players.indexOf(me), 10); c.hud.refresh(); c.restoreActions();`);
  await cap(page, 'Trong tù, kho kỹ năng có Ngồi Yên (không tính vào hạn 3 lượt, tối đa 2 lượt ở level 1)');
  await page.waitForTimeout(3000);
  await kit(page, 'Ở Tù Cho Lành', 3000);
  await cap(page, 'Mỗi lượt trong tù lãnh 50$, rồi hết lượt ngay');
  await page.waitForTimeout(7000);
  await finish(g, '5-o-tu-cho-lanh');
}

/* ------------------------------------------------ 6. BOT + Dẫn Tour + Xổ Số trúng */
if (want(6)) {
  console.log('6. Trạm Thu Phí BOT, Dẫn Tour, Xổ Số trúng');
  const g = await openGame({ width: 1600, height: 1000 });
  const { page, run } = g;
  await run(`
    me.skills = ['dhS2']; me.pos = 3;
    o1.skills = ['dhV']; for (const id of [5, 12, 15]) s.owner.set(id, o1.id);
    o2.skills = ['ddV']; o2.lotto = 10; o2.pos = 8;
    c.scene.refresh(s);
    for (const [i, p] of s.players.entries()) await c.scene.jumpToken(i, p.pos);
    c.hud.refresh(); c.restoreActions();
  `);
  await cap(page, 'Cô Hai có BOT (bến 5, công ty 12). Chú Sáu đứng ở ô 8, đã chọn số Xổ Số 10. Ba Tư có Dẫn Tour');
  await page.waitForTimeout(5000);
  await cap(page, 'Ba Tư lắc 4 + 6 = 10: trúng số của Chú Sáu, đi ngang bến 5, vượt Chú Sáu, đi ngang công ty 12');
  await forceDice(page, 4, 6);
  await btn(page, 'Lắc xí ngầu').click();
  await page.waitForTimeout(16000);
  await drain(page, 3000);
  await finish(g, '6-bot-dan-tour-xo-so');
}

/* ------------------------------------------------ 7. Chung Cư Mini + Hàng Xóm */
if (want(7)) {
  console.log('7. Chung Cư Mini, Hàng Xóm Láng Giềng, Mặt Tiền');
  const g = await openGame({ width: 1600, height: 1000 });
  const { page, run } = g;
  await run(`
    me.skills = ['acS1', 'acS2', 'acV']; s.owner.set(8, me.id); s.owner.set(9, me.id); s.owner.set(6, o1.id);
    s.owner.set(21, me.id);
    c.hud.refresh(); c.scene.refresh(s); c.restoreActions();
  `);
  await cap(page, 'Có 2/3 ô xanh nhạt (8, 9 liền nhau): chưa đủ bộ, bình thường không xây được');
  await page.waitForTimeout(3500);
  await btn(page, 'Quản lý tài sản').click();
  await cap(page, 'Chung Cư Mini level 1: đất lẻ xây được 1 căn, giá ×1.5');
  await page.waitForTimeout(4000);
  const build = page.locator('#modal-root .scrim.show button[data-act="build"]:not([disabled])').first();
  if (await build.count()) { await build.click(); await page.waitForTimeout(2500); }
  await page.waitForTimeout(2500);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(2000);
  await cap(page, 'Cô Hai dừng ở ô 9: thuê +15% vì ô 8 kề bên cũng của Ba Tư, +9$ × 2 màu (Mặt Tiền)');
  await run(`o1.pos = 9; await c.scene.jumpToken(s.players.indexOf(o1), 9); await c.resolveTile(o1, { sum: 7 });`);
  await page.waitForTimeout(3000);
  await finish(g, '7-chung-cu-hang-xom');
}

/* ------------------------------------------------ 8. điện thoại nằm ngang */
if (want(8)) {
  console.log('8. màn điện thoại nằm ngang: thanh nút và cây');
  const g = await openGame({ width: 844, height: 390 });
  const { page, run } = g;
  await run(`me.skills = ['dh1','dh2a','dh2b','dh3','dhS1','ddS2','dcS2','ddV','dd1','dd2a','dcS1'];
    s.passedUp.set(39, [o1.id]); c.restoreActions();`);
  await cap(page, 'Màn nhỏ: 11 kỹ năng mà thanh nút vẫn chỉ thêm 1 nút');
  await page.waitForTimeout(4000);
  await btn(page, 'Dùng kỹ năng').click();
  await page.locator('.kit').waitFor();
  await cap(page, 'Kho kỹ năng trên màn điện thoại nằm ngang');
  await page.waitForTimeout(4500);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  await btn(page, 'Kỹ năng').click();
  await page.locator('.st-node[data-id="dhS1"]').waitFor();
  await cap(page, 'Cây ở màn nhỏ: 50 ô');
  await page.waitForTimeout(4000);
  await page.locator('.st-node[data-id="dhS2"]').click();
  await page.waitForTimeout(4000);
  await finish(g, '8-mobile');
}

/* ------------------------------------------------ 9. chưa học kỹ năng kích hoạt */
if (want(9)) {
  console.log('9. chưa có kỹ năng kích hoạt: nút kho tối lại');
  const g = await openGame({ width: 1600, height: 1000 });
  const { page, run } = g;
  await cap(page, 'Chưa học kỹ năng nào: "Kỹ năng" và "Dùng kỹ năng" cùng một hàng, nút kho tối lại');
  await page.waitForTimeout(4500);
  await run(`me.skills = ['cn1', 'cn2a']; c.restoreActions();`);
  await cap(page, 'Chỉ có kỹ năng tự động: nút kho vẫn tối');
  await page.waitForTimeout(3500);
  await run(`me.skills = ['cn1', 'cn2a', 'dd1', 'dd2a']; c.restoreActions();`);
  await cap(page, 'Học Cược Chẵn Lẻ: nút kho sáng lên');
  await page.waitForTimeout(3500);
  await finish(g, '9-nut-kho-toi');
}

await browser.close();
console.log('\nLỗi console:', errors.length ? errors : 'không có');
console.log('Xong:', OUT);
