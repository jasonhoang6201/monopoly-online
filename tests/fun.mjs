/**
 * Phần "vui nhộn" của ván — không đổi luật, chỉ kể và diễn:
 * chủ đề Tết, bình luận viên, oan gia, khoảnh khắc quay chậm, hội đồng hồn
 * ma (bỏ phiếu thẻ Thời Cuộc, ám quẻ), lễ trao giải cuối ván.
 *
 * Cần dev server đang chạy ở cổng 5178. `SHOTS=thư-mục` để chụp màn hình.
 */
import { launchChrome } from './launch.mjs';
import { playRollOff } from './rolloff.mjs';
import { checkTetSongs } from '../src/audio/tetSongs.js';

const errors = [];
const fails = [];
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? '✓' : '✗'} ${name}${extra ? ` — ${extra}` : ''}`);
  if (!cond) fails.push(name);
};
const SHOTS = process.env.SHOTS;
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

const songErr = checkTetSongs();
ok('hai bài Tết đủ phách mỗi ô nhịp, nốt và hợp âm hợp lệ', songErr.length === 0, songErr.join('; '));

const browser = await launchChrome();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
const wait = (ms) => page.waitForTimeout(ms);

await page.goto('http://localhost:5178/', { waitUntil: 'networkidle' });
const solo = page.locator('.scrim.show button.btn', { hasText: 'Chơi trên một máy' });
await solo.waitFor({ timeout: 30000 });
await solo.click();
await wait(1200);

/* ------------------------------------------------------------- chủ đề Tết */

await page.locator('.count-btn[data-n="3"]').click();
await page.selectOption('[data-theme-pick]', 'tet');
await wait(500);
ok('chọn Tết thì trang đổi chủ đề ngay', await page.evaluate(() => document.documentElement.dataset.theme) === 'tet');
ok('nhạc chờ đổi sang Xuân Về Phố Thị', await page.evaluate(() => window.__audioProbe.songName) === 'Xuân Về Phố Thị');

await page.getByRole('button', { name: 'Khai cuộc' }).click();
await wait(2600);
await playRollOff(page);
await wait(800);

const tet = await page.evaluate(() => {
  const sc = window.__monopoly.controller.scene;
  return {
    theme: window.__monopoly.controller.state.settings.theme,
    petals: sc.flakes.filter((f) => f.img.texture.key.startsWith('petal-')).length,
    lixi: sc.textures.exists('lixi'),
  };
});
ok('ván mang chủ đề Tết', tet.theme === 'tet');
ok('hoa mai, hoa đào rơi trên bàn', tet.petals > 0, `${tet.petals} cánh`);
ok('có ảnh bao lì xì cho tiền bay', tet.lixi);
await shot(page, 'tet-board');

/* ------------------------------------------------- bình luận viên + quay chậm */

const cine = page.evaluate(() => window.__monopoly.controller.moment('rentBig', { a: 0, b: 1, tile: 39, amount: 1200 }));
await wait(700);
const live = await page.evaluate(() => ({
  text: document.querySelector('#commentator.show .blv-text')?.textContent ?? '',
  hot: document.querySelector('#commentator')?.classList.contains('hot'),
  bars: document.getElementById('cine-bars')?.classList.contains('on'),
  name: window.__monopoly.controller.state.players[0].name,
}));
await shot(page, 'cinematic');
ok('bình luận viên nói về cú thuê đau, có tên người trả', live.text.includes(live.name), live.text);
ok('câu quan trọng thì khung bình luận đỏ lên', live.hot);
ok('dải đen điện ảnh trượt vào', live.bars);
await cine;
ok('dải đen rút đi sau khoảnh khắc',
  !(await page.evaluate(() => document.getElementById('cine-bars')?.classList.contains('on'))));

// Câu vặt (ưu tiên 1) không được chen ngang câu lớn đang đứng
await page.evaluate(() => window.__monopoly.controller.moment('rentBig', { a: 1, b: 2, tile: 39, amount: 900 }));
const before = await page.evaluate(() => document.querySelector('#commentator .blv-text').textContent);
await page.evaluate(() => window.__monopoly.controller.showMoment({ kind: 'buy', a: 0, tile: 1, v: 1 }));
ok('câu vặt không đè câu lớn đang đứng',
  await page.evaluate(() => document.querySelector('#commentator .blv-text').textContent) === before);

/* ---------------------------------------------------------------- oan gia */

const rival = await page.evaluate(async () => {
  const c = window.__monopoly.controller;
  const st = c.state;
  const ch = await import('/src/core/chronicle.js');
  ch.notePay(st, 0, 1, 400);
  ch.notePay(st, 1, 0, 300);
  const r = ch.checkRival(st);
  c.hud.refresh();
  return {
    pair: r ? [r.a, r.b] : null,
    badges: document.querySelectorAll('.rchip.is-rival').length,
  };
});
ok('trả qua trả lại đủ ngưỡng thì thành oan gia', JSON.stringify(rival.pair) === '[0,1]');
ok('thanh bên đánh dấu cả hai người', rival.badges === 2, `${rival.badges} thẻ`);

/* ------------------------------------------------------- hội đồng hồn ma */

ok('chưa ai phá sản thì không có nút ám quẻ', !(await page.locator('#hex-btn').isVisible()));
await page.evaluate(() => {
  const c = window.__monopoly.controller;
  c.state.bankrupt(2);
  c.hud.refresh();
  c.hexes.refresh();
});
ok('có người phá sản thì nút ám quẻ hiện', await page.locator('#hex-btn').isVisible());
await page.locator('#hex-btn').click();
await page.locator('.hex-kind[data-hex="cloud"]').click();
await page.locator('.hex-target[data-seat="0"]').click();
await wait(400);
ok('quẻ bám lên quân người bị ám',
  await page.evaluate(() => document.querySelector('.hex-mark')?.dataset.kind) === 'cloud');
await shot(page, 'hex');
ok('vừa ám xong thì phải chờ mới ám tiếp', await page.evaluate(() => {
  const h = window.__monopoly.controller.hexes;
  h.open();
  const dis = [...document.querySelectorAll('.hex-target')].every((b) => b.disabled);
  h.close();
  return dis;
}));

const voting = page.evaluate(async () => {
  const c = window.__monopoly.controller;
  c.state.eventsFired = 0;   // trước pha cuối ván: không có thẻ ưu tiên chen vào
  const card = await c.events.pickCard();
  return { id: card?.id, voted: c.events.voted, pile: c.state.eventPile.length };
});
await page.locator('.scrim.show .ghost-card').first().waitFor({ timeout: 8000 });
const shown = await page.evaluate(() => [...document.querySelectorAll('.scrim.show .ghost-card')].map((b) => b.dataset.id));
await shot(page, 'ghost-vote');
await page.locator('.scrim.show .ghost-card').nth(1).click();
const vote = await voting;
ok('hội đồng hồn ma thấy hai lá khác nhau', shown.length === 2 && shown[0] !== shown[1], shown.join(', '));
ok('lá được bầu là lá sẽ nổ', vote.id === shown[1] && vote.voted, vote.id);

const pure = await page.evaluate(async () => {
  const { GameState } = await import('/src/core/state.js');
  const ev = await import('/src/core/events.js');
  const st = new GameState(['A', 'B', 'C'], null, { events: 'hon-loan' });
  st.eventPile = [];
  ev.drawEvent(st);                       // xáo chồng lần đầu
  const size = st.eventPile.length;
  const { a, b } = ev.drawEventPair(st);
  ev.returnEvent(st, b);
  return { size, after: st.eventPile.length, back: st.eventPile.includes(b?.id), a: a?.id, b: b?.id };
});
ok('lá thua quay lại chồng, chồng chỉ vơi đúng một lá', pure.back && pure.after === pure.size - 1,
  `${pure.size} → ${pure.after}`);

/* ----------------------------------------------------------- lễ trao giải */

await page.evaluate(async () => {
  const c = window.__monopoly.controller;
  const st = c.state;
  const ch = await import('/src/core/chronicle.js');
  ch.noteRent(st, 1, 0, 650, 39);
  st.players[1].jails = 3;
  for (let i = 0; i < 6; i++) { st.round += 1; st.players[0].money += 300; ch.sampleWorth(st); }
  const { winnerModal } = await import('/src/ui/modals.js');
  winnerModal(st, st.players[0]);
});
await page.locator('.scrim.show .award').first().waitFor({ timeout: 5000 });
await wait(900);
const prize = await page.evaluate(() => ({
  titles: [...document.querySelectorAll('.scrim.show .award-title')].map((e) => e.textContent),
  lines: document.querySelectorAll('.scrim.show .worth-chart polyline').length,
}));
await shot(page, 'awards');
ok('màn hạ màn có lễ trao giải', prize.titles.includes('Thánh Đen') && prize.titles.includes('Hộ Khẩu Chí Hoà'),
  prize.titles.join(', '));
ok('có đường tài sản cho từng người', prize.lines === 3);

ok('không lỗi trang', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();

if (fails.length) {
  console.log(`\n${fails.length} lỗi`);
  process.exit(1);
}
console.log('\nVui nhộn: ổn.');
