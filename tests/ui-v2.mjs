import { chromium } from 'playwright';
const SHOT='/private/tmp/claude-501/-Users-jasonhoang-Desktop-monopoly/a29323e2-f3f4-4b2d-9c9c-70118d22612f/scratchpad';
const errors=[]; const log=(...a)=>console.log(...a);
const browser = await chromium.launch({ channel:'chrome' });
const page = await browser.newPage({ viewport:{width:1600,height:1000}, deviceScaleFactor:2 });
page.on('pageerror', e=>errors.push('PAGEERROR: '+e.message+'\n  '+(e.stack||'').split('\n')[1]));
page.on('console', m=>{ if(m.type()==='error') errors.push('CONSOLE: '+m.text()); });

await page.goto('http://localhost:5178/',{waitUntil:'networkidle'});
/* Bản online hỏi "Chơi kiểu nào?" trước khi bày bàn. Bộ này kiểm phần chơi trên
   một máy, nên bấm luôn cửa ấy rồi mới vào màn hình bày bàn cờ quen thuộc. */
const soloBtn = page.locator('.scrim.show button.btn', { hasText: 'Chơi trên một máy' });
await soloBtn.waitFor({ timeout: 30000 });
await soloBtn.click();

await page.waitForTimeout(2500);
await page.locator('.count-btn[data-n="4"]').click();
await page.waitForTimeout(200);
for (const [i,n] of ['Bảy Viễn','Cô Ba Trà','Chú Hoả','Bà Từ'].entries())
  await page.locator('#name-list input').nth(i).fill(n);
await page.getByRole('button',{name:'Khai cuộc'}).click();
await page.waitForTimeout(3200);

// dựng tài sản
await page.evaluate(()=>{
  const c=window.__monopoly.controller, s=c.state;
  for(const id of [16,18,19,1,3,5]) s.owner.set(id,0);
  for(const id of [37,39,15,25]) s.owner.set(id,1);
  for(const id of [21,23,24,26]) s.owner.set(id,2);
  for(const id of [6,8,9,12]) s.owner.set(id,3);
  s.houses.set(16,5); s.houses.set(18,4); s.houses.set(19,3);
  s.houses.set(6,3); s.houses.set(8,2); s.houses.set(9,2);
  s.bankHouses=32-14; s.bankHotels=11;
  s.mortgaged.add(26); s.mortgaged.add(15);
  s.players[0].money=1240; s.players[2].money=640;
  c.hud.refresh(); c.scene.refresh(s);
});
await page.waitForTimeout(600);

log('=== 3. NHẠC: vào ván là phải im, chỉ còn hiệu ứng ===');
const music = await page.evaluate(()=>({
  started: window.__audioProbe.started,
  menuMode: window.__audioProbe.menuMode,
  musicGain: +(window.__audioProbe.musicGain?.gain.value ?? -1).toFixed(4),
  musicOn: window.__audioProbe.musicOn,
  sfxOn: window.__audioProbe.sfxOn,
}));
log('  ', JSON.stringify(music));

log('\n=== 4. BÀN CỜ ĂN HẾT KHOẢNG TRỐNG BÊN PHẢI CỘT ===');
const geo = await page.evaluate(()=>{
  const s = window.__monopoly.scene, D = window.__monopoly.DPR;
  const rail = document.getElementById('sidebar').getBoundingClientRect().width;
  return {
    cot: Math.round(rail),
    banCo: Math.round(s.size/D),
    cuaSo: [window.innerWidth, window.innerHeight],
    chiemChieuCao: (s.size/D/window.innerHeight*100).toFixed(1)+'%',
  };
});
log('  ', JSON.stringify(geo));

// Thu nhỏ cửa sổ rồi bung ra lại — bàn cờ phải tự dựng lại bố cục
await page.setViewportSize({width:1120,height:720});
await page.waitForTimeout(600);
log('  1120×720 →', await page.evaluate(()=>Math.round(window.__monopoly.scene.size/window.__monopoly.DPR)), 'điểm ảnh CSS');
await page.screenshot({path:`${SHOT}/v2-small.png`});
await page.setViewportSize({width:1600,height:1000});
await page.waitForTimeout(600);
log('  1600×1000 →', await page.evaluate(()=>Math.round(window.__monopoly.scene.size/window.__monopoly.DPR)), 'điểm ảnh CSS');

log('\n=== 5. MODAL THÔNG TIN NGƯỜI CHƠI ===');
await page.locator('.pcard').first().click();
await page.waitForTimeout(900);
const pm = await page.evaluate(()=>{
  const m=document.querySelector('.scrim.show');
  if(!m) return null;
  return {
    title: m.querySelector('.modal-title')?.textContent,
    stats: [...m.querySelectorAll('.pstat')].map(e=>e.textContent.replace(/\s+/g,' ').trim()),
    cards: m.querySelectorAll('.deedcard').length,
    groups: [...m.querySelectorAll('.asset-group-head')].map(e=>e.textContent.replace(/\s+/g,' ').trim()),
  };
});
log('  ', JSON.stringify(pm,null,1));
await page.screenshot({path:`${SHOT}/v2-player-modal.png`});

log('\n=== 5b. BẤM THẺ ĐẤT TRONG BẢNG → CHI TIẾT Ô ===');
await page.locator('.scrim.show .deedcard.clickable').first().click();
await page.waitForTimeout(1100);
const td = await page.evaluate(()=>{
  const m=document.querySelector('.scrim.show');
  return m ? {
    eyebrow: m.querySelector('.modal-eyebrow')?.textContent,
    title: m.querySelector('.modal-title')?.textContent,
    sub: m.querySelector('.modal-sub')?.textContent,
    rentRows: m.querySelectorAll('.rent-table .rr').length,
    nowRow: m.querySelector('.rr.now')?.textContent.replace(/\s+/g,' ').trim(),
    owner: m.querySelector('.owner-line')?.textContent.replace(/\s+/g,' ').trim(),
  } : null;
});
log('  ', JSON.stringify(td,null,1));
await page.screenshot({path:`${SHOT}/v2-tile-modal.png`});
await page.locator('.scrim.show button.btn').first().click();
await page.waitForTimeout(700);

log('\n=== 6. BẤM TRỰC TIẾP VÀO Ô TRÊN BÀN CỜ ===');
// tính toạ độ màn hình của ô 37 (Rue Catinat) rồi bấm
const pt = await page.evaluate(()=>{
  const sc=window.__monopoly.scene;
  const {TEX}=window.__monopoly.scene.constructor.name?{TEX:1600}:{TEX:1600};
  return null;
});
const clicked = await page.evaluate(()=>{
  const sc = window.__monopoly.scene;
  // dùng chính hàm tileAt để tìm điểm rơi vào ô 37
  for (let x=0; x<sc.scale.width; x+=6) {
    for (let y=0; y<sc.scale.height; y+=6) {
      if (sc.tileAt(x,y)===37) return { x: x/window.__monopoly.DPR, y: y/window.__monopoly.DPR };
    }
  }
  return null;
});
log('  điểm bấm (CSS px):', JSON.stringify(clicked));
if (clicked) {
  await page.mouse.click(clicked.x, clicked.y);
  await page.waitForTimeout(1100);
  const t2 = await page.evaluate(()=>{
    const m=document.querySelector('.scrim.show');
    return m ? { title:m.querySelector('.modal-title')?.textContent, eyebrow:m.querySelector('.modal-eyebrow')?.textContent } : null;
  });
  log('  modal mở ra:', JSON.stringify(t2));
  await page.screenshot({path:`${SHOT}/v2-tile-from-board.png`});
  await page.locator('.scrim.show button.btn').first().click();
  await page.waitForTimeout(600);
}

log('\n=== 7. QUẢN LÝ TÀI SẢN: THẺ HAI CỘT THEO MÀU Ô ===');
await page.getByRole('button',{name:'Quản lý tài sản'}).click();
await page.waitForTimeout(900);
const thumbs = await page.evaluate(()=>{
  const m=document.querySelector('.scrim.show');
  const cards=[...m.querySelectorAll('.mg-card')];
  return {
    the: cards.length,
    anh: m.querySelectorAll('.mg-thumb').length,
    cot: new Set(cards.map(c=>Math.round(c.getBoundingClientRect().left))).size,
    nhomMau: m.querySelectorAll('.mg-grid .asset-group-head').length,
    hinhNha: m.querySelectorAll('.mg-card .gi').length,
    // Mỗi thẻ phải mang đúng màu của ô — không thẻ nào bỏ trống biến màu
    thieuMau: cards.filter(c=>!c.style.getPropertyValue('--tile')).length,
  };
});
log('  ', JSON.stringify(thumbs));
await page.screenshot({path:`${SHOT}/v2-manage.png`});
await page.locator('.scrim.show button.btn').first().click();
await page.waitForTimeout(600);

log('\nLỖI ('+errors.length+'):');
for(const e of errors.slice(0,10)) log(' ',e);
await browser.close();
