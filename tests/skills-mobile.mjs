/**
 * Cây kỹ năng trên điện thoại nằm ngang: mọi nút người chơi cần chạm có nằm
 * trong khung và nhận được cú chạm không.
 *
 * Lấy trường hợp chật nhất: người chơi có đủ ba kỹ năng bấm trước khi lắc
 * (Cược Chẵn Lẻ, Tất Tay, Xuyên Việt) cộng túi thẻ — thanh nút lên 9 nút.
 * Rồi đi qua cây kỹ năng (chạm ô → thẻ chi tiết → Nâng cấp), hộp cược, hộp hỏi
 * sau khi lắc (4 nút) và hộp Thâu Tóm — tất cả bằng cú chạm thật.
 *
 * Cỡ màn lấy đúng bốn cỡ của tests/mobile.mjs. Cần dev server ở cổng 5178.
 * `--shots` lưu ảnh chụp vào test-result/skills-mobile/.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launchChrome } from './launch.mjs';
import { playRollOff } from './rolloff.mjs';

const SIZES = [[874, 402], [740, 360], [667, 375], [568, 320]];
const SHOTS = process.argv.includes('--shots');
const OUT = join(import.meta.dirname, '..', 'test-result', 'skills-mobile');
if (SHOTS) mkdirSync(OUT, { recursive: true });

const errors = [];
const fails = [];
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? '✓' : '✗'} ${name}${extra ? ` — ${extra}` : ''}`);
  if (!cond) fails.push(name);
};

/** Như tests/mobile.mjs: nằm trọn trong khung nhìn, và chạm vào giữa thì trúng nó. */
const probe = (page, sel, nth = 0) => page.evaluate(({ sel, nth }) => {
  const el = document.querySelectorAll(sel)[nth];
  if (!el) return { missing: true };
  const r = el.getBoundingClientRect();
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return {
    rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    inView: r.top >= -0.5 && r.left >= -0.5 && r.bottom <= innerHeight + 0.5 && r.right <= innerWidth + 0.5,
    onTop: !!top && (el === top || el.contains(top)),
    topEl: top ? `${top.tagName.toLowerCase()}.${[...top.classList].join('.')}` : 'null',
  };
}, { sel, nth });

const tappable = async (tag, name, page, sel, nth = 0) => {
  const b = await probe(page, sel, nth);
  ok(`${tag} · ${name}`, !b.missing && b.inView && b.onTop,
    b.missing ? 'không thấy' : `${JSON.stringify(b.rect)} trên cùng: ${b.topEl}`);
  return !b.missing && b.inView && b.onTop;
};

/** Nút trong hộp thoại trên cùng, theo chữ. */
const modalBtn = (page, text) => page.locator('#modal-root .scrim.show').last()
  .locator('button', { hasText: text }).first();

const run = (page, src) => page.evaluate(async (src) => {
  const c = window.__monopoly.controller;
  // eslint-disable-next-line no-new-func
  return new Function('c', 's', `return (async () => { ${src} })()`)(c, c.state);
}, src);

const browser = await launchChrome();

for (const [W, H] of SIZES) {
  const tag = `${W}×${H}`;
  console.log(`\n── ${tag} ──`);
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${tag} CONSOLE: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`${tag} PAGEERROR: ${e.message}`));
  const shot = (name) => SHOTS && page.screenshot({ path: join(OUT, `${W}x${H}-${name}.png`) });

  await page.goto('http://localhost:5178/', { waitUntil: 'networkidle' });
  const solo = page.locator('.scrim.show button.btn', { hasText: 'Chơi trên một máy' });
  await solo.waitFor({ timeout: 30000 });
  await solo.tap();
  await page.waitForTimeout(1500);
  await page.locator('.count-btn[data-n="3"]').tap();
  await page.locator('.rule-btn[data-lv="off"]').tap();
  await page.getByRole('button', { name: 'Khai cuộc' }).tap();
  await page.waitForTimeout(2400);
  await playRollOff(page);

  /* ---- thanh nút chật nhất: 7 nút (kỹ năng kích hoạt đã gom vào kho "Dùng kỹ năng") ---- */
  await run(page, `
    const p = s.current;
    p.skills = ['dd1','dd2a','dd2b','dd3','ddU','dh1','dh2a','dh3','dhU'];
    p.skillPoints = 4; p.money = 1500;
    s.takeCard(p.id, 'chance', s.decks.chance.cards.findIndex((x) => x.type === 'jail-free'));
    c.hud.refresh(); c.restoreActions();
  `);
  await page.waitForTimeout(500);
  const n = await page.locator('#actions button').count();
  let all = true;
  for (let i = 0; i < n; i++) {
    const b = await probe(page, '#actions button', i);
    if (b.inView && b.onTop) continue;
    // Thanh nút cuộn được thì nút khuất phải cuộn tới được rồi chạm trúng
    await page.locator('#actions button').nth(i).scrollIntoViewIfNeeded();
    const b2 = await probe(page, '#actions button', i);
    if (!(b2.inView && b2.onTop)) {
      all = false;
      console.log(`    nút ${i} «${await page.locator('#actions button').nth(i).getAttribute('aria-label')}» ${JSON.stringify(b2.rect)} ${b2.topEl}`);
    }
  }
  ok(`${tag} · ${n} nút trên thanh đều chạm được (kể cả sau khi cuộn)`, all && n >= 7);
  await shot('1-actions');

  /* ---- cây kỹ năng ---- */
  await page.locator('#actions button[data-key="k"]').tap();
  await page.locator('.st-node[data-id="cn1"]').waitFor({ timeout: 5000 });
  await page.waitForTimeout(500);
  await shot('2-tree');
  let nodesOk = true;
  for (const id of ['cn1', 'dcU', 'acU', 'ac2b', 'cn2a']) {
    const b = await probe(page, `.st-node[data-id="${id}"]`);
    if (!(b.inView && b.onTop)) { nodesOk = false; console.log(`    ô ${id} ${JSON.stringify(b.rect)} ${b.topEl}`); }
  }
  ok(`${tag} · ô trên cây nằm trong khung và chạm trúng`, nodesOk);
  await tappable(tag, 'nút ✕ đóng cây', page, '.st-close');
  await tappable(tag, 'nút Tẩy điểm', page, '.st-respec');
  await page.locator('.st-node[data-id="cn1"]').tap();
  await page.waitForTimeout(500);
  await shot('3-detail');
  await tappable(tag, 'thẻ chi tiết: nút Nâng cấp', page, '[data-act="learn"]');
  await tappable(tag, 'thẻ chi tiết: nút Huỷ', page, '.sd-foot [data-act="cancel"]');
  await page.locator('[data-act="learn"]').tap();
  await page.waitForTimeout(500);
  ok(`${tag} · chạm Nâng cấp thì học được`, await run(page, 'return s.current.skills.includes("cn1") && s.current.skillPoints === 3;'));
  // Lên level cần kỹ năng đã kiếm đủ 150$ trong ván
  await run(page, 's.current.skillUse = { cn1: { n: 3, gain: 150 } };');
  // Lên level: thẻ chi tiết dài hơn (thêm mục Level) — nút vẫn phải chạm được
  await page.locator('.st-node[data-id="cn1"]').tap();
  await page.waitForTimeout(500);
  await shot('3b-levelup');
  await tappable(tag, 'thẻ chi tiết ô đã học: nút Lên level 2', page, '[data-act="learn"]');
  const lvList = await page.evaluate(() => {
    const body = document.querySelector('.sd-body');
    const ul = document.querySelector('.sd-lvs');
    if (!body || !ul) return null;
    // Mục Level phải xem được: nằm trong khung, hoặc cuộn thân thẻ tới được
    ul.scrollIntoView({ block: 'nearest' });
    const r = ul.getBoundingClientRect(), b = body.getBoundingClientRect();
    return r.top >= b.top - 1 && r.bottom <= b.bottom + 1;
  });
  ok(`${tag} · thẻ chi tiết: 3 dòng level xem được (cuộn tới được)`, lvList === true);
  await page.locator('[data-act="learn"]').tap();
  await page.waitForTimeout(500);
  ok(`${tag} · chạm Lên level thì lên level 2`, await run(page, 'return s.current.skillLv.cn1 === 2 && s.current.skillPoints === 2;'));
  // Thẻ tẩy điểm
  await page.locator('.st-respec').tap();
  await page.waitForTimeout(500);
  await shot('4-respec');
  await tappable(tag, 'thẻ tẩy điểm: nút Tẩy', page, '[data-act="respec"]');
  await tappable(tag, 'thẻ tẩy điểm: nút Huỷ', page, '.sd-foot [data-act="cancel"]');
  await page.locator('.sd-foot [data-act="cancel"]').tap();
  await page.waitForTimeout(400);
  await page.locator('.st-close').tap();
  await page.waitForTimeout(3400);
  ok(`${tag} · đóng cây xong thanh nút bày lại`, await page.locator('#actions button[data-key="r"]').count() === 1);

  /* ---- kho kỹ năng rồi hộp cược ---- */
  await page.locator('#actions button[data-key="u"]').scrollIntoViewIfNeeded();
  await page.locator('#actions button[data-key="u"]').tap();
  await page.locator('.kit-item').first().waitFor({ timeout: 5000 });
  await page.waitForTimeout(400);
  await shot('5a-kit');
  const kitN = await page.locator('.kit-item:not([disabled])').count();
  for (let i = 0; i < kitN; i++) {
    await page.locator('.kit-item:not([disabled])').nth(i).scrollIntoViewIfNeeded();
    await tappable(tag, `kho kỹ năng: ô ${i + 1}/${kitN}`, page, '.kit-item:not([disabled])', i);
  }
  for (const t of ['Chốt', 'Huỷ']) {
    const i = await page.evaluate((t) => [...document.querySelectorAll('#modal-root .scrim.show .modal-foot button')]
      .findIndex((b) => b.textContent.includes(t)), t);
    await tappable(tag, `kho kỹ năng: nút «${t}»`, page, '#modal-root .scrim.show .modal-foot button', i);
  }
  await page.locator('.kit-item', { hasText: 'Cược Chẵn Lẻ' }).tap();
  await page.locator('.sk-bet').waitFor({ timeout: 5000 });
  await page.waitForTimeout(600);
  await shot('5-bet');
  const top = '#modal-root .scrim.show:not(.stashed) button';
  for (const t of ['Không', 'Chẵn', 'Lẻ', '200$', 'Xong', 'Huỷ']) {
    const i = await page.evaluate(([t, sel]) => [...document.querySelectorAll(sel)]
      .findIndex((b) => b.textContent.trim().startsWith(t)), [t, top]);
    await tappable(tag, `hộp cược: nút «${t}»`, page, top, i);
  }
  await page.locator(top, { hasText: 'Lẻ' }).first().tap();
  await page.locator(top, { hasText: 'Xong' }).tap();
  await page.waitForTimeout(400);
  ok(`${tag} · chọn cược xong về lại kho, ô Cược ghi cửa vừa chọn`,
    (await page.locator('.kit-item', { hasText: 'Cược Chẵn Lẻ' }).textContent()).includes('Lẻ'));
  await modalBtn(page, 'Huỷ').tap();
  await page.waitForTimeout(500);

  /* ---- sau khi lắc: chọn ô đi tới / đi lùi trên bàn cờ, 3 nút phụ ---- */
  await run(page, `await c.scene.rollDiceAnim(3, 4);
    window.__ar = c.skills.afterRoll(s.current, { a: 3, b: 4, sum: 7, isDouble: false });`);
  await page.locator('.tile-pick[data-quick]:not(.out)').waitFor({ timeout: 5000 });
  await page.waitForTimeout(400);
  await shot('6-afterroll');
  const count = await page.locator('.tile-pick:not(.out) .tp-acts button').count();
  const dice = await page.evaluate(() => !!window.__monopoly.scene.dicePick);
  ok(`${tag} · Quay Đầu chọn trên bàn cờ: xí ngầu bấm được + nút đi như thường`, count === 1 && dice, `${count} nút, xí ngầu ${dice}`);
  for (let i = 0; i < count; i++) {
    await tappable(tag, `bảng chọn sau khi lắc: nút ${i + 1}/${count}`, page, '.tile-pick:not(.out) .tp-acts button', i);
  }
  await page.locator('.tile-pick:not(.out) .tp-cancel').tap();
  await run(page, 'await window.__ar;');

  /* ---- hộp Thâu Tóm ---- */
  await run(page, `
    const me = s.current, other = s.players[(s.turn + 1) % 3];
    s.owner.set(39, other.id); me.skills.push('dc1','dc2a','dc3');
    const { BOARD } = await import('/src/data/board.js');
    window.__sz = c.skills.trySeize(me, 39, 50);
  `);
  await page.waitForTimeout(600);
  await shot('7-seize');
  await tappable(tag, 'hộp Thâu Tóm: nút Thâu Tóm', page, '#modal-root .scrim.show .modal-foot button', 0);
  await tappable(tag, 'hộp Thâu Tóm: nút Trả thuê', page, '#modal-root .scrim.show .modal-foot button', 1);
  await modalBtn(page, 'Trả thuê').tap();
  await run(page, 'await window.__sz;');

  /* ---- Tàu Tốc Hành level 3: 3 ga để chọn + Ở lại ---- */
  await run(page, `
    const me = s.current; me.pos = 5; me.skills.push('dh2a'); me.skillLv = { ...me.skillLv, dh2a: 3 };
    window.__ex = c.skills.express(me, { a: 2, b: 3, sum: 5, isDouble: false });
  `);
  await page.locator('.tile-pick[data-quick]:not(.out)').waitFor({ timeout: 5000 });
  await page.waitForTimeout(400);
  await shot('7b-express');
  const exLit = await page.evaluate(() => [...window.__monopoly.scene.markSet].length);
  ok(`${tag} · Tàu Tốc Hành level 3: 3 ga sáng trên bàn cờ`, exLit === 3, `${exLit} ô`);
  await tappable(tag, 'Tàu Tốc Hành: nút Ở lại', page, '.tile-pick:not(.out) .tp-cancel');
  await page.locator('.tile-pick:not(.out) .tp-cancel').tap();
  await run(page, 'await window.__ex;');

  /* ---- tab Cây kỹ năng trong bảng tài sản ---- */
  await run(page, `
    const q = s.players[(s.turn + 1) % 3];
    q.skills = ['ac1','ac2a','ac3','acU']; q.skillLv = { ac1: 3 };
    const M = await import('/src/ui/modals.js');
    window.__pm = M.playerModal(s, q.id);
  `);
  await page.locator('.ptab[data-tab="skills"]').waitFor({ timeout: 5000 });
  await tappable(tag, 'bảng tài sản: tab Cây kỹ năng', page, '.ptab[data-tab="skills"]');
  await page.locator('.ptab[data-tab="skills"]').tap();
  await page.waitForTimeout(500);
  await shot('8-profile-tree');
  let viewOk = true;
  for (const id of ['cn1', 'acU', 'dcU', 'ac2b']) {
    await page.locator(`.ppane-skills .st-node[data-id="${id}"]`).scrollIntoViewIfNeeded();
    const b = await probe(page, `.ppane-skills .st-node[data-id="${id}"]`);
    if (!(b.inView && b.onTop)) { viewOk = false; console.log(`    ô ${id} ${JSON.stringify(b.rect)} ${b.topEl}`); }
  }
  ok(`${tag} · tab Cây kỹ năng: ô chạm trúng (kể cả sau khi cuộn)`, viewOk);
  await page.locator('.ppane-skills .st-node[data-id="acU"]').tap();
  await page.waitForTimeout(500);
  await shot('9-profile-detail');
  await tappable(tag, 'tab Cây kỹ năng: nút Đóng thẻ chi tiết', page, '.ppane-skills .sd-foot [data-act="cancel"]');
  await page.locator('.ppane-skills .sd-foot [data-act="cancel"]').tap();
  await page.waitForTimeout(400);
  await page.locator('.ptab[data-tab="assets"]').tap();
  await page.waitForTimeout(300);
  ok(`${tag} · quay lại tab Tài sản`, await page.locator('.ppane[data-pane="assets"]').isVisible());
  const pmHs = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  ok(`${tag} · bảng tài sản không làm trang cuộn ngang`, !pmHs);
  // Mở lại tab cây rồi đóng cả bảng bằng ✕ trên thanh điểm (chân hộp đã ẩn)
  await page.locator('.ptab[data-tab="skills"]').tap();
  await page.waitForTimeout(300);
  await tappable(tag, 'tab Cây kỹ năng: nút ✕ đóng bảng', page, '.ppane-skills .st-close');
  await page.locator('.ppane-skills .st-close').tap();
  await run(page, 'await window.__pm;');
  await page.waitForTimeout(600);
  ok(`${tag} · ✕ đóng hẳn bảng tài sản`, await page.locator('#modal-root .scrim.show .ptab').count() === 0);

  /* ---- thẻ người chơi trên thanh hẹp: nhãn điểm không đẩy vỡ khung ---- */
  const strip = await page.evaluate(() => {
    const el = document.querySelector('#side-strip');
    return el ? { sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight } : null;
  });
  ok(`${tag} · thanh bên không tràn`, !strip || (strip.sw <= strip.cw + 1), JSON.stringify(strip));
  const hscroll = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  ok(`${tag} · trang không cuộn ngang`, !hscroll);

  await page.close();
}

console.log(errors.length ? `\nLỗi console:\n${errors.join('\n')}` : '\nKhông có lỗi console.');
if (errors.length) fails.push('lỗi console');
console.log(fails.length ? `\n✗ ${fails.length} chỗ hỏng` : '\nKhông có chỗ nào hỏng.');
await browser.close();
process.exit(fails.length ? 1 : 0);
