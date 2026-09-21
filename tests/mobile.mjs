/**
 * Điện thoại nằm ngang: nút có nằm trong tầm chạm không.
 *
 * Bài kiểm này không soi luật — luật đã có `cards.mjs` và `events.mjs` lo. Nó
 * soi đúng một chuyện: ở những cỡ màn hẹp, cái nút người chơi cần bấm có còn
 * nằm trong khung và có nhận được cú chạm không.
 *
 * Chỗ từng hỏng: bảng chọn ô (`ui/tilePicker.js`, `ui/groupPicker.js`) đứng ở
 * cột phải, bề ngang lấy từ `--act`. Cột ấy từng chia 45% của `--cols`, mà
 * `--cols` là `100vw - 100dvh` nên màn càng vuông nó càng hẹp — xuống tới
 * 126px thì chữ xuống dòng nhiều tới mức hàng nút bỏ ngang bị đẩy khỏi mép
 * cuộn. Bản một máy không có đồng hồ tự thoát (`EventRunner.localMs` bằng 0),
 * nên mất nút ấy là lôi thẻ ra rồi không cất lại được.
 *
 * Bốn cỡ dưới đây là bốn mức của `--cols`: rộng rãi, vừa đủ, sát, và chật nhất
 * còn phải đỡ.
 *
 * Cần dev server đang chạy ở cổng 5178.
 */
import { launchChrome } from './launch.mjs';
import { playRollOff } from './rolloff.mjs';

/** [bề ngang, chiều cao] — iPhone 16 Pro, Android phổ biến, iPhone SE/8, iPhone 5/SE1 */
const SIZES = [[874, 402], [740, 360], [667, 375], [568, 320]];

const errors = [];
const fails = [];
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? '✓' : '✗'} ${name}${extra ? ` — ${extra}` : ''}`);
  if (!cond) fails.push(name);
};

/**
 * Ô chữ nhật của một phần tử, kèm hai câu trả lời đáng quan tâm: nó có nằm
 * trọn trong khung nhìn không, và cú chạm vào giữa nó có rơi đúng nó không
 * (`elementFromPoint` trả về thứ nằm trên cùng tại điểm ấy).
 */
const probe = (page, sel, nth = 0) => page.evaluate(({ sel, nth }) => {
  const el = document.querySelectorAll(sel)[nth];
  if (!el) return { missing: true };
  const r = el.getBoundingClientRect();
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return {
    rect: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
    inView: r.top >= -0.5 && r.left >= -0.5 && r.bottom <= innerHeight + 0.5 && r.right <= innerWidth + 0.5,
    onTop: !!top && (el === top || el.contains(top)),
    topEl: top ? `${top.tagName.toLowerCase()}${top.id ? '#' + top.id : ''}` : 'null',
    noiDung: el.scrollHeight, khung: el.clientHeight,
  };
}, { sel, nth });

/** Dựng sẵn thế cờ đủ mục tiêu cho cả ba thẻ nhắm vào nhà đất. */
async function dealBoard(page) {
  await page.evaluate(async () => {
    const c = window.__monopoly.controller;
    const st = c.state;
    const { CHANCE } = await import('/src/data/cards.js');
    const { GROUP_TILES } = await import('/src/data/board.js');
    st.owner.clear();
    st.houses.clear();
    GROUP_TILES.brown.forEach((id) => st.owner.set(id, 1));
    st.houses.set(GROUP_TILES.brown[0], 3);
    st.houses.set(GROUP_TILES.brown[1], 5);
    GROUP_TILES.pink.forEach((id) => st.owner.set(id, 2));
    st.houses.set(GROUP_TILES.pink[0], 2);
    GROUP_TILES.light_blue.forEach((id) => st.owner.set(id, 1));
    st.players[0].money = 9000;
    st.players[0].cards.length = 0;
    st.takeCard(0, 'chance', CHANCE.findIndex((x) => x.type === 'demolish'));
    c.hud.refresh();
    c.restoreActions();
  });
  await page.waitForTimeout(400);
}

/**
 * Mở thẳng một phiên chọn với hạn đếm ngược.
 *
 * Đi qua túi thẻ thì chỉ dựng được phiên của bản một máy (không đồng hồ), mà
 * bảng cao nhất lại là bảng của bản online — có thêm dòng `.tp-timer`. Gọi
 * thẳng `pickGroup`/`pickTile` để đo đúng trường hợp cao nhất ấy.
 */
async function openPick(page, kind, ms = 45000) {
  await page.evaluate(async ({ kind, ms }) => {
    const c = window.__monopoly.controller;
    const st = c.state;
    const cr = await import('/src/core/cards.js');
    if (kind === 'group') {
      const card = { type: 'demolish', levels: 2 };
      c.pickGroup({
        groups: cr.demolishGroups(st, card, 0),
        ids: cr.cardTargets(st, card, 0),
        levels: 2,
        cancel: 'Thôi, cất thẻ lại',
      }, ms);
    } else {
      c.pickTile(cr.cardTargets(st, { type: 'seize' }, 0), {
        eyebrow: 'CƯỠNG CHẾ MUA ĐẤT',
        title: 'Lấy lô đất nào?',
        sub: 'Lô bạn chọn <b>sang tên cho bạn</b> ngay, chủ cũ nhận <b>giá gốc +25%</b>.',
        note: 'Chỉ lô chưa thế chấp, nằm trong khu chưa có căn nhà nào, và bạn phải đủ tiền mặt trả tiền đền.',
        confirm: 'Lấy lô này',
        owned: false,
        cancel: 'Thôi, cất thẻ lại',
      }, ms);
    }
  }, { kind, ms });
  await page.waitForTimeout(600);
}

const closePick = async (page) => {
  await page.evaluate(() => document.querySelector('.tp-cancel')?.click());
  await page.waitForTimeout(600);
};

const browser = await launchChrome();

for (const [W, H] of SIZES) {
  const tag = `${W}×${H}`;
  console.log(`\n── ${tag} ──`);
  const page = await browser.newPage({
    viewport: { width: W, height: H },
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
  });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${tag} CONSOLE: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`${tag} PAGEERROR: ${e.message}`));

  await page.goto('http://localhost:5178/', { waitUntil: 'networkidle' });
  const solo = page.locator('.scrim.show button.btn', { hasText: 'Chơi trên một máy' });
  await solo.waitFor({ timeout: 30000 });
  await solo.tap();
  await page.waitForTimeout(1500);
  // 3 người, tắt Thời Cuộc để sự kiện không chen ngang lúc đang đo
  await page.locator('.count-btn[data-n="3"]').tap();
  await page.locator('.rule-btn[data-lv="off"]').tap();
  await page.getByRole('button', { name: 'Khai cuộc' }).tap();
  await page.waitForTimeout(2400);
  await playRollOff(page);

  /* ---- thanh nút hành động ---- */
  const bar = await probe(page, '#actions');
  ok(`${tag} · thanh nút không bị cắt`, bar.noiDung <= bar.khung + 1,
    `nội dung ${bar.noiDung} / khung ${bar.khung}`);
  const nb = await page.locator('#actions button').count();
  let barOk = true;
  for (let i = 0; i < nb; i++) {
    const b = await probe(page, '#actions button', i);
    if (!(b.inView && b.onTop)) {
      barOk = false;
      const lb = await page.locator('#actions button').nth(i).getAttribute('aria-label');
      console.log(`    nút «${lb}» ${JSON.stringify(b.rect)} trên cùng là ${b.topEl}`);
    }
  }
  ok(`${tag} · mọi nút trên thanh đều chạm được`, barOk, `${nb} nút`);

  await dealBoard(page);

  /* ---- túi thẻ ---- */
  await page.locator('#actions button[data-key="b"]').tap();
  await page.waitForTimeout(700);
  const use = await probe(page, '.bag-use');
  ok(`${tag} · nút Dùng trong túi thẻ chạm được`, !use.missing && use.inView && use.onTop,
    use.missing ? 'không thấy nút' : use.topEl);
  await page.locator('.bag-row .bag-use').first().tap();
  await page.waitForTimeout(900);
  ok(`${tag} · bấm Dùng thì mở được bảng chọn khu`, await page.locator('.tile-pick').count() > 0);
  await closePick(page);
  ok(`${tag} · huỷ xong thẻ còn trong túi`,
    await page.evaluate(() => window.__monopoly.controller.state.players[0].cards.length) === 1);

  /* ---- bảng chọn ô / chọn khu: nút bỏ ngang phải luôn trong tầm chạm ---- */
  for (const kind of ['group', 'tile']) {
    await openPick(page, kind);
    const panel = await probe(page, '.tile-pick');
    const cancel = await probe(page, '.tp-cancel');
    const trongKhung = await page.evaluate(() => {
      const p = document.querySelector('.tile-pick');
      const b = document.querySelector('.tp-cancel');
      if (!p || !b) return false;
      const pr = p.getBoundingClientRect(), br = b.getBoundingClientRect();
      return br.bottom <= pr.bottom + 0.5 && br.top >= pr.top - 0.5;
    });
    ok(`${tag} · ${kind}: nút bỏ ngang nằm trong khung bảng`, trongKhung,
      `bảng rộng ${panel.rect.w} · nội dung ${panel.noiDung} / khung ${panel.khung}`);
    ok(`${tag} · ${kind}: chạm vào nút bỏ ngang thì ăn`, cancel.inView && cancel.onTop, cancel.topEl);

    // chạm thật lên đúng chỗ nút báo về — cú chạm phải đóng được phiên chọn
    await page.touchscreen.tap(cancel.rect.x + cancel.rect.w / 2, cancel.rect.y + cancel.rect.h / 2);
    await page.waitForTimeout(700);
    const con = await page.locator('.tile-pick').count();
    ok(`${tag} · ${kind}: cú chạm thật thoát được phiên chọn`, con === 0,
      con ? 'cú chạm rơi vào chỗ khác' : '');
    if (con) await closePick(page);
  }

  /* ---- chạm ô cờ: ô hẹp nhất cũng phải rơi đúng ô ---- */
  await openPick(page, 'group');
  const marked = await page.evaluate(() => [...(window.__monopoly.scene.markSet ?? [])]);
  ok(`${tag} · có ô sáng để chọn`, marked.length > 0);
  let hitOk = true;
  for (const id of marked.slice(0, 4)) {
    const hit = await page.evaluate(async (t) => {
      const { tileCenter, TEX } = await import('/src/render/geometry.js');
      const s = window.__monopoly.scene;
      const c = tileCenter(t, TEX);
      const p = s.toScreen(c.x, c.y);
      const D = window.__monopoly.DPR;
      // đi đúng đường của cú chạm: toạ độ CSS → toạ độ khung vẽ → `tileAt`
      return s.tileAt((p.x / D) * D, (p.y / D) * D);
    }, id);
    if (hit !== id) { hitOk = false; console.log(`    chạm giữa ô ${id} rơi vào ô ${hit}`); }
  }
  ok(`${tag} · chạm giữa ô rơi đúng ô`, hitOk, `${marked.length} ô sáng`);
  await closePick(page);

  await page.close();
}

console.log('');
for (const e of errors) console.log('LỖI', e);
if (errors.length) fails.push(`${errors.length} lỗi trong trang`);
console.log(fails.length ? `\n${fails.length} chỗ hỏng:\n  ${fails.join('\n  ')}` : '\nKhông có chỗ nào hỏng.');
await browser.close();
process.exit(fails.length ? 1 : 0);
