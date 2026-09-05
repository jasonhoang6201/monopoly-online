import { launchChrome } from './launch.mjs';
import { playRollOff } from './rolloff.mjs';
const log = (...a) => console.log(...a);
const errors = [];

const browser = await launchChrome({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto('http://localhost:5178/', { waitUntil: 'networkidle' });
/* Bản online hỏi "Chơi kiểu nào?" trước khi bày bàn. Bộ này kiểm phần chơi trên
   một máy, nên bấm luôn cửa ấy rồi mới vào màn hình bày bàn cờ quen thuộc. */
const soloBtn = page.locator('.scrim.show button.btn', { hasText: 'Chơi trên một máy' });
await soloBtn.waitFor({ timeout: 30000 });
await soloBtn.click();

await page.waitForTimeout(2200);

// Nhạc nền chỉ sống ở màn hình chờ
const a1 = await page.evaluate(() => {
  const mod = window.__audioProbe;
  return mod ? { state: mod.ctx?.state, started: mod.started, menuMode: mod.menuMode, bar: mod.barCount, section: mod.section } : null;
});
log('audio ở màn hình chờ:', JSON.stringify(a1));

/**
 * Đo tín hiệu thật: gắn AnalyserNode vào master rồi lấy biên độ RMS.
 * Đây là bằng chứng nhạc có phát ra chứ không chỉ "không lỗi".
 */
const rms = await page.evaluate(async () => {
  const A = window.__audioProbe;
  if (!A?.ctx) return { error: 'không có AudioContext' };
  const an = A.ctx.createAnalyser();
  an.fftSize = 2048;
  A.master.connect(an);
  const buf = new Float32Array(an.fftSize);
  const samples = [];
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 120));
    an.getFloatTimeDomainData(buf);
    let s = 0;
    for (const v of buf) s += v * v;
    samples.push(Math.sqrt(s / buf.length));
  }
  return {
    section: A.section,
    peak: Math.max(...samples).toFixed(5),
    avg: (samples.reduce((x, y) => x + y, 0) / samples.length).toFixed(5),
    nonSilent: samples.filter((v) => v > 0.0005).length,
    total: samples.length,
  };
});
log('đo nhạc chờ (RMS):', JSON.stringify(rms));

await page.getByRole('button', { name: 'Khai cuộc' }).click();
await page.waitForTimeout(3000);

// Mở màn là vòng lắc giành quyền đi trước — bấm hộ rồi trả thứ tự về theo ghế
await playRollOff(page);


// Vào ván: nhạc nền phải tắt hẳn, chỉ còn hiệu ứng
const inGame = await page.evaluate(async () => {
  const A = window.__audioProbe;
  const an = A.ctx.createAnalyser();
  an.fftSize = 2048;
  A.musicGain.connect(an);
  const buf = new Float32Array(an.fftSize);
  let peak = 0;
  for (let i = 0; i < 16; i++) {
    await new Promise((r) => setTimeout(r, 100));
    an.getFloatTimeDomainData(buf);
    for (const v of buf) peak = Math.max(peak, Math.abs(v));
  }
  return { started: A.started, menuMode: A.menuMode, musicGain: +A.musicGain.gain.value.toFixed(4), peakNhac: peak.toFixed(5) };
});
log('audio sau khi khai cuộc:', JSON.stringify(inGame));

// Kiểm tra hiệu ứng âm thanh
const sfxCheck = await page.evaluate(async () => {
  const A = window.__audioProbe;
  const an = A.ctx.createAnalyser();
  an.fftSize = 2048;
  A.sfxGain.connect(an);
  const buf = new Float32Array(an.fftSize);
  const out = {};
  for (const name of ['shake', 'diceHit', 'step', 'dice', 'coin', 'buy', 'card', 'jail', 'bankrupt', 'firework', 'trade', 'turn']) {
    A.sfx(name);
    let peak = 0;
    for (let i = 0; i < 8; i++) {
      await new Promise((r) => setTimeout(r, 60));
      an.getFloatTimeDomainData(buf);
      for (const v of buf) peak = Math.max(peak, Math.abs(v));
    }
    out[name] = peak > 0.001 ? `✔ ${peak.toFixed(4)}` : `✘ im lặng`;
    await new Promise((r) => setTimeout(r, 400));
  }
  return out;
});
log('hiệu ứng âm thanh:');
for (const [k, v] of Object.entries(sfxCheck)) log(`   ${k.padEnd(10)} ${v}`);

// Hai công tắc riêng: nhạc nền và hiệu ứng
await page.locator('#music-toggle').click();
await page.waitForTimeout(700);
log('tắt nhạc:', JSON.stringify(await page.evaluate(() => ({
  musicOn: window.__audioProbe.musicOn,
  musicGain: +window.__audioProbe.musicGain.gain.value.toFixed(3),
  sfxVanConBat: window.__audioProbe.sfxOn,
}))));

await page.locator('#sfx-toggle').click();
await page.waitForTimeout(400);
log('tắt hiệu ứng:', JSON.stringify(await page.evaluate(() => ({
  sfxOn: window.__audioProbe.sfxOn,
  sfxGain: +window.__audioProbe.sfxGain.gain.value.toFixed(3),
}))));

await page.locator('#music-toggle').click();
await page.waitForTimeout(400);
log('bật lại nhạc:', JSON.stringify(await page.evaluate(() => ({
  musicOn: window.__audioProbe.musicOn, section: window.__audioProbe.section,
}))));

log('\nLỖI (' + errors.length + '):');
for (const e of errors.slice(0, 10)) log(' ', e);
await browser.close();
