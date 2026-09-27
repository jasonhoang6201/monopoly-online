/**
 * Hai tối thượng mỗi nhánh, chỉ được học một — và năm tối thượng mới:
 *   - học một tối thượng thì tối thượng kia khoá (luật + ô trên cây + thẻ chi tiết);
 *     tẩy điểm thì chọn lại được;
 *   - Vé Tháng: bến của mình thu thêm theo số bến;
 *   - Bảo Hiểm Xã Hội trả hộ phần thiếu rồi chờ hồi;
 *   - Trạm Thu Phí BOT thu khi đi ngang, không thu ô dừng, ô thế chấp;
 *   - Xổ Số Kiến Thiết: chọn số khi qua ô Bắt Đầu, người khác lắc ra số đó thì trả;
 *   - Siết Nợ: nút hiện khi có đất thế chấp của người khác, mua đứt qua bảng chọn ô;
 *   - Mặt Tiền cộng thẳng theo số màu đất.
 * Cần dev server ở cổng 5178.
 */
import { launchChrome } from './launch.mjs';
import { playRollOff } from './rolloff.mjs';
import { markedTiles } from './pick.mjs';

const errors = [];
let fails = 0;
const log = (...a) => console.log(...a);
const check = (ok, msg) => { log(`  ${ok ? '✓' : '✗'} ${msg}`); if (!ok) fails++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await launchChrome();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

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
await page.waitForTimeout(600);

const run = (fn, arg) => page.evaluate(async ([src, a]) => {
  const c = window.__monopoly.controller;
  const K = await import('/src/core/skills.js');
  const S = await import('/src/core/serialize.js');
  // eslint-disable-next-line no-new-func
  return new Function('c', 's', 'K', 'S', 'a', `return (async () => { ${src} })()`)(c, c.state, K, S, a);
}, [fn, arg]);

const reset = () => run(`
  for (const p of s.players) {
    p.money = 1500; p.skills = []; p.skillPoints = 0; p.laps = 0; p.cooldowns = {}; p.usedTurn = {};
    p.skillLv = {}; p.lapUses = {}; p.jails = 0; p.skillUse = {}; p.feats = {}; p.lotto = null;
    p.pos = 5; p.inJail = false; p.bankrupt = false;
  }
  s.owner.clear(); s.houses.clear(); s.mortgaged.clear(); s.heritage.clear();
  s.bankHouses = 32; s.bankHotels = 12; s.mods = []; s.pot = 0;
  c.hud.refresh(); c.scene.refresh(s);
`);

/* ------------------------------------------------ 1. chỉ một tối thượng mỗi nhánh */
log('\n=== 1. CHỌN MỘT TRONG HAI ===');
await reset();
const pick = await run(`
  const p = s.current;
  p.skills = ['dh1', 'dh2a', 'dh3']; p.skillPoints = 10;
  const first = K.learnSkill(p, 'dhV').ok;
  const second = K.canLearn(p, 'dhU');
  const other = K.canLearn(p, 'cnU').reason;      // nhánh khác không bị ảnh hưởng
  return { first, ok: second.ok, reason: second.reason, state: K.skillState(p, 'dhU'), other };
`);
check(pick.first, 'học Trạm Thu Phí BOT được');
check(!pick.ok && pick.reason.includes('Trạm Thu Phí BOT') && pick.state === 'locked',
  `Xuyên Việt khoá sau khi chọn BOT (${pick.reason})`);
check(!/tối thượng/.test(pick.other ?? ''), 'nhánh khác không bị khoá bởi luật này');
const re = await run(`
  const p = s.current; p.money = 2000;
  K.respec(p);
  p.skills = ['dh1', 'dh2a', 'dh3'];
  return K.canLearn(p, 'dhU').ok && K.canLearn(p, 'dhV').ok;
`);
check(re, 'tẩy điểm xong chọn lại được cả hai');

// Ô trên cây và thẻ chi tiết
await run(`const p = s.current; p.skills = ['dh1','dh2a','dh3','dhV']; p.skillPoints = 5; c.restoreActions();`);
await page.locator('#actions button', { hasText: 'Kỹ năng' }).first().click();
await page.locator('.st-node[data-id="dhU"]').waitFor({ timeout: 5000 });
check(await page.locator('.st-node[data-id="dhU"].is-locked').count() === 1, 'ô Xuyên Việt trên cây hiện khoá');
check(await page.locator('.st-node.ult').count() === 10, 'cây có 10 ô tối thượng');
const overlap = await page.evaluate(() => {
  const r = [...document.querySelectorAll('.st .st-node')].map((n) => [n.dataset.id, n.getBoundingClientRect()]);
  const bad = [];
  for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) {
    const [ia, a] = r[i], [ib, b] = r[j];
    if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) bad.push(ia + '/' + ib);
  }
  return bad;
});
check(!overlap.length, `không ô nào đè nhau (${overlap.join(', ') || 'không'})`);
await page.locator('.st-node[data-id="dhU"]').click();
const conds = await page.locator('.sd-conds').textContent();
check(conds.includes('Chưa học tối thượng kia') && conds.includes('Trạm Thu Phí BOT'), 'thẻ chi tiết ghi lý do khoá');
check((await page.locator('.sd-card').textContent()).includes('chỉ được học một'), 'phần Cách dùng nhắc luật chọn một');
await page.screenshot({ path: 'test-result/skills-ult2-tree.png' });
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await page.keyboard.press('Escape');
await page.waitForTimeout(3000);

/* ------------------------------------------------ 2. Vé Tháng + Mặt Tiền */
log('\n=== 2. TIỀN THUÊ CỘNG THẲNG ===');
await reset();
const rent = await run(`
  const [me, other] = [s.current, s.players.find((q) => q.id !== s.turn)];
  s.owner.set(5, me.id); s.owner.set(15, me.id);
  const plain = s.rentFor(5, 7);
  me.skills = ['dh1'];
  const lv1 = s.rentFor(5, 7);
  me.skillLv = { dh1: 3 };
  const lv3 = s.rentFor(5, 7);
  // Người trả cũng có Vé Tháng: được bớt trên cả phần cộng thêm
  other.skills = ['dh1'];
  const bill = c.skills.rentBill(other, 5, null);
  other.skills = [];
  me.skills = ['acV']; me.skillLv = {};
  s.owner.set(1, me.id); s.owner.set(6, me.id); s.owner.set(11, me.id);   // 3 màu
  const front = s.rentFor(1, 7);
  const gains = K.rentGains(s, 1, front);
  s.mortgaged.add(1);
  const mort = s.rentFor(1, 7);
  return { plain, lv1, lv3, bill: bill.total, front, gains, mort };
`);
check(rent.plain === 50 && rent.lv1 === 70 && rent.lv3 === 90,
  `2 bến: 50$ → Vé Tháng lv1 +10×2 = 70$, lv3 +20×2 = 90$ (${rent.plain}/${rent.lv1}/${rent.lv3})`);
check(rent.bill === 54, `người trả có Vé Tháng lv1 trả 60% của 90$ = 54$ (được ${rent.bill})`);
check(rent.front === 2 + 18 && rent.gains.some(([id, n]) => id === 'acV' && n === 18),
  `Mặt Tiền lv1, 3 màu: đất 2$ +6×3 = 20$, ghi 18$ vào tiến độ (${rent.front}, ${JSON.stringify(rent.gains)})`);
check(rent.mort === 0, 'ô thế chấp vẫn không thu thuê');

/* ------------------------------------------------ 3. Bảo Hiểm Xã Hội */
log('\n=== 3. BẢO HIỂM XÃ HỘI ===');
await reset();
const ins = await run(`
  const me = s.current;
  me.skills = ['cnV']; me.money = 100;
  const ok = await c.payBank(me.id, 250);
  const first = { ok, money: me.money, cd: me.cooldowns.cnV, gain: K.usage(me, 'cnV').gain };
  me.money = 1000;
  await c.payBank(me.id, 50);
  me.money = 100;
  me.skillLv = { cnV: 1 };
  return { first, cd2: me.cooldowns.cnV };
`);
check(ins.first.ok && ins.first.money === 0 && ins.first.cd === 3 && ins.first.gain === 150,
  `thiếu 150$ → bảo hiểm trả hộ 150$, chờ 3 lần qua (${JSON.stringify(ins.first)})`);
const cover = await run(`
  const me = s.current;
  me.cooldowns = {}; me.money = 0;
  await c.skills.insure(me, 500);
  return me.money;
`);
check(cover === 300, `thiếu 500$ → trả hộ tối đa 300$, phần còn lại mới phải xoay tiền (tiền mặt ${cover})`);

/* ------------------------------------------------ 4. Trạm Thu Phí BOT */
log('\n=== 4. TRẠM THU PHÍ BOT ===');
await reset();
const toll = await run(`
  const me = s.current;
  const owner = s.players.find((q) => q.id !== me.id);
  owner.skills = ['dhV'];
  s.owner.set(5, owner.id); s.owner.set(12, owner.id); s.owner.set(15, owner.id);
  s.mortgaged.add(15);
  const list = K.tollStops(s, me, 3, 13).map((x) => x.tiles);     // 3 → 16: đi ngang 5, 12, 15
  const stop = K.tollStops(s, me, 3, 2).length;                    // dừng đúng bến 5
  const back = K.tollStops(s, me, 16, -13).map((x) => x.tiles);    // đi lùi cũng thu
  me.pos = 3; me.money = 1000; const o0 = owner.money;
  await c.skills.tolls(me, 3, 13);
  const paid = owner.money - o0;
  me.money = 20; const o1 = owner.money;
  await c.skills.tolls(me, 3, 13);
  return { list, stop, back, paid, poor: owner.money - o1, left: me.money, gain: K.usage(owner, 'dhV').gain };
`);
check(JSON.stringify(toll.list) === '[[5,12]]', `đi ngang bến 5 và công ty 12, bỏ bến 15 đang thế chấp (${JSON.stringify(toll.list)})`);
check(toll.stop === 0, 'dừng đúng trên bến thì không thu phí (trả thuê như thường)');
check(JSON.stringify(toll.back) === '[[12,5]]', 'đi lùi ngang trạm cũng thu');
check(toll.paid === 60, `level 1: 2 trạm × 30$ = 60$ (${toll.paid})`);
check(toll.poor === 20 && toll.left === 0, 'người chỉ có 20$ nộp hết 20$, không bị đẩy vào nợ');
check(toll.gain === 80, `tiến độ lên level ghi 80$ (${toll.gain})`);

/* ------------------------------------------------ 5. Xổ Số Kiến Thiết */
log('\n=== 5. XỔ SỐ KIẾN THIẾT ===');
await reset();
await run(`const me = s.current; me.skills = ['ddV']; c.restoreActions();`);
const lottoBtn = page.locator('#actions button', { hasText: 'Chọn số Xổ Số' });
check(await lottoBtn.count() === 1, 'vừa học xong có nút chọn số');
await lottoBtn.click();
await page.locator('.sk-lotto').waitFor({ timeout: 5000 });
const lottoText = await page.locator('.sk-lotto').textContent();
check(lottoText.includes('30$') && lottoText.includes('180$'), 'nút ghi tiền thưởng: 7 → 30$, 2/12 → 180$');
await page.locator('.sk-lotto button[data-v="9"]').click();
await page.locator('#modal-root .scrim.show button', { hasText: 'Chọn số này' }).click();
for (let i = 0; i < 12 && (await run('return c.busy;')); i++) await wait(400);
check(await run('return s.current.lotto;') === 9, 'đã ghi số 9');
check(await lottoBtn.count() === 0, 'chọn rồi thì nút biến mất');
const hit = await run(`
  const me = s.current;
  const q = s.players.find((x) => x.id !== me.id);
  q.money = 500; const m0 = me.money;
  await c.skills.rollPerks(q, { a: 4, b: 5, sum: 9, isDouble: false });
  const got = me.money - m0;
  await c.skills.rollPerks(q, { a: 3, b: 5, sum: 8, isDouble: false });
  const miss = me.money - m0 - got;
  // Người lắc chính là chủ số thì không tự trả mình
  await c.skills.rollPerks(me, { a: 4, b: 5, sum: 9, isDouble: false });
  return { got, miss, self: me.money - m0 - got, need: K.lottoPrize(me, 9) };
`);
check(hit.got === hit.need && hit.need === 45 && hit.miss === 0 && hit.self === 0,
  `người khác lắc ra 9 trả 45$ (5×36/4), ra 8 không trả, tự lắc không tính (${JSON.stringify(hit)})`);
// Qua ô Bắt Đầu: số cũ hết hạn, hỏi chọn lại
const lap = run(`await c.skills.lapEnd(s.current); return s.current.lotto;`);
await page.locator('.sk-lotto').waitFor({ timeout: 8000 });
await page.keyboard.press('Escape');
check(await lap === 7, 'qua ô Bắt Đầu hỏi chọn số mới; bấm Esc thì lấy 7');
await wait(2600);

/* ------------------------------------------------ 6. Siết Nợ */
log('\n=== 6. SIẾT NỢ ===');
await reset();
await run(`
  const me = s.current; me.skills = ['dcV'];
  const q = s.players.find((x) => x.id !== me.id);
  s.owner.set(39, q.id); s.owner.set(1, q.id); s.mortgaged.add(39);
  c.restoreActions();
`);
const fcBtn = page.locator('#actions button', { hasText: 'Siết Nợ' });
check(await fcBtn.count() === 1, 'có đất thế chấp của người khác thì nút Siết Nợ hiện');
await fcBtn.click();
await page.locator('.tile-pick').waitFor({ timeout: 5000 });
check(JSON.stringify(await markedTiles(page)) === '[39]', 'chỉ ô đang thế chấp mới sáng');
const before = await run(`const q = s.ownerOf(39); return { me: s.current.money, q: q.money, qid: q.id };`);
await page.evaluate(() => { window.__monopoly.scene.onTileClick(39); });
await page.waitForTimeout(400);
await page.locator('.scrim.show .modal-foot button.btn').first().click();
for (let i = 0; i < 20 && !(await run('return s.owner.get(39) === s.turn && !c.busy;')); i++) await wait(500);
const fc = await run(`const q = s.players[a]; return {
  owner: s.owner.get(39), me: s.current.money, q: q.money, mort: s.isMortgaged(39), turn: s.turn,
  uses: K.usesLeft(s.current, 'dcV') };`, before.qid);
// Ô 39 giá 400$, thế chấp 200$: trả ngân hàng 200$, trả chủ cũ 30% = 60$
check(fc.owner === fc.turn && !fc.mort, 'ô về tay người siết nợ, hết thế chấp');
check(before.me - fc.me === 260 && fc.q - before.q === 60, `trả tổng 260$, chủ cũ nhận 60$ (${before.me - fc.me}/${fc.q - before.q})`);
check(fc.uses === 0 && await fcBtn.count() === 0, 'dùng hết lượt thì nút ẩn tới lần qua ô Bắt Đầu sau');

/* ------------------------------------------------ 7. ảnh chụp mang số Xổ Số */
log('\n=== 7. ẢNH CHỤP ===');
const snap = await run(`
  s.current.lotto = 11;
  const copy = S.fromSnapshot(JSON.parse(JSON.stringify(S.snapshot(s))));
  return copy.players[s.turn].lotto;
`);
check(snap === 11, 'ảnh chụp online mang số Xổ Số đang chọn');

log('\nLỗi console:', errors.length ? errors : 'không có');
if (errors.length) fails += errors.length;
log(fails ? `\n✗ ${fails} lỗi` : '\n✓ tất cả đều qua');
await browser.close();
process.exit(fails ? 1 : 0);
