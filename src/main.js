/**
 * Điểm khởi động: nạp font, dựng Phaser ở đúng độ phân giải màn hình,
 * rồi trao scene cho controller.
 */
import Phaser from 'phaser';
import BoardScene from './scenes/BoardScene.js';
import { Game } from './game/controller.js';
import { startSession } from './net/session.js';
import { audio } from './audio/audio.js';
import { loadLacBird } from './render/motifs.js';
import { loadArtwork } from './render/artwork.js';
import { initSidePanel } from './ui/sidepanel.js';
import { DPR } from './dpr.js';
import { telemetry } from './core/telemetry.js';

/** Chờ font sẵn sàng — canvas đo chữ sai nếu font chưa nạp xong. */
async function loadFonts() {
  if (!document.fonts) return;
  const faces = [
    '700 40px "Playfair Display"',
    '800 40px "Playfair Display"',
    '500 40px "Playfair Display"',
    '400 20px "Noto Serif"',
    '600 20px "Noto Serif"',
    '700 20px "Noto Serif"',
    '400 16px "Be Vietnam Pro"',
    '600 16px "Be Vietnam Pro"',
  ];
  // Nạp kèm chữ có dấu để chắc chắn lấy đúng bộ subset tiếng Việt
  await Promise.all(
    faces.map((f) => document.fonts.load(f, 'Cờ Tỷ Phú Sài Gòn Gia Định ưởẫộằễ')
      .catch(() => {})),
  );
  await document.fonts.ready;
}

const cssW = () => window.innerWidth;
const cssH = () => window.innerHeight;

/**
 * Khởi động trong một hàm async thay vì `await` ở cấp cao nhất —
 * top-level await không biên dịch được cho các trình duyệt đích của bản build.
 */
async function boot() {
  // Ảnh chim Lạc và bốn tấm hoạ tiết (mái đình, mây, rồng, phụng) phải có mặt
  // trước khi vẽ mặt bàn, nếu không bàn cờ sẽ rơi về bản dựng bằng code.
  await Promise.all([loadFonts(), loadLacBird(), loadArtwork()]);

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game-canvas',
    backgroundColor: '#150A06',
    scale: {
      mode: Phaser.Scale.NONE,
      width: Math.round(cssW() * DPR),
      height: Math.round(cssH() * DPR),
      zoom: 1 / DPR,
    },
    render: { antialias: true, roundPixels: false, powerPreference: 'high-performance' },
    scene: [BoardScene],
  });

  stepWhileHidden(game);

  let sceneRef = null;

  /**
   * Khung vẽ = số điểm ảnh vật lý; kích thước CSS = số điểm ảnh logic.
   * Nhờ vậy nét vẽ sắc đúng bằng độ phân giải màn hình.
   * Đổi cỡ xong phải dựng lại bố cục bàn cờ ngay — nhất là lúc bật/tắt
   * toàn màn hình, để bàn cờ nở ra ăn hết khoảng trống mới.
   */
  const fitCanvas = () => {
    const w = cssW(), h = cssH();
    game.scale.resize(Math.round(w * DPR), Math.round(h * DPR));
    const c = game.canvas;
    if (c) {
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
    }
    sceneRef?.relayout();
  };

  window.addEventListener('resize', fitCanvas);
  /* iOS bắn `orientationchange` trước khi cập nhật innerWidth/innerHeight, nên
     đo ngay lúc ấy sẽ ra cỡ của chiều cũ. Đo lại vài nhịp sau cho chắc.
     `visualViewport` là chỗ duy nhất báo đúng khi thanh công cụ nổi của Safari
     thu vào hay bung ra — lúc ấy `resize` của window không nổ. */
  window.addEventListener('orientationchange', () => {
    fitCanvas();
    setTimeout(fitCanvas, 120);
    setTimeout(fitCanvas, 420);
  });
  window.visualViewport?.addEventListener('resize', fitCanvas);
  // Trình duyệt cần vài khung hình để chốt kích thước sau khi đổi chế độ
  document.addEventListener('fullscreenchange', () => {
    fitCanvas();
    setTimeout(fitCanvas, 80);
    setTimeout(fitCanvas, 320);
  });

  game.events.once('scene-ready', (scene) => {
    sceneRef = scene;
    fitCanvas();
    const controller = new Game(scene);
    window.__monopoly = { game, scene, controller, DPR, telemetry };
    window.__audioProbe = audio;
    wireChrome();
    // Phiên chơi tự hỏi chơi một máy hay mở phòng online, rồi mới trao ván
    // cho controller. Bấm vào đường mời thì vào thẳng phòng, khỏi hỏi.
    startSession(controller);
  });
}

boot();

/**
 * Tab nằm nền (hay cửa sổ bị che kín trên macOS) thì trình duyệt ngừng cấp
 * `requestAnimationFrame`, và vòng lặp Phaser đứng theo: tween, `delayedCall`
 * không chạy nữa. Mạch luật lại `await` đúng mấy hoạt cảnh ấy (`flyMoney`,
 * `spotTiles`, lắc xí ngầu…), nên máy cầm lái mà để tab nền thì cả bàn treo —
 * gặp nhiều nhất ở phiên đấu giá: ghi giá xong là người ta chuyển tab ngồi chờ,
 * hết giờ thì máy ấy kẹt ở cú bay tiền, bảng giá không bao giờ mở ở máy nào.
 *
 * Nên khi khung hình im quá `STALE`, tự bước vòng lặp bằng `headlessStep` (chạy
 * tween và hẹn giờ, không vẽ) cho kịp giờ thật. `setInterval` ở tab nền vẫn
 * chạy, chỉ bị bóp thưa lại — thưa thì mỗi nhịp bước bù nhiều hơn. Ghi lại
 * `lastTime` để lúc tab hiện lại, khung hình đầu tiên không nhảy cả quãng vắng.
 */
function stepWhileHidden(game) {
  const STALE = 400;     // khung hình im bấy lâu thì coi như tab đã nằm nền
  const CHUNK = 50;      // mỗi bước bù bấy nhiêu mili giây, tween khỏi nhảy cóc
  setInterval(() => {
    const loop = game.loop;
    if (!loop?.running || game.isPaused) return;
    const now = performance.now();
    let t = loop.lastTime;
    if (!(now - t > STALE)) return;
    while (t < now) {
      const d = Math.min(CHUNK, now - t);
      t += d;
      game.headlessStep(t, d);
    }
    loop.lastTime = t;
    loop.now = t;
  }, 250);
}

/**
 * Nút âm thanh mở bảng hai dòng Nhạc nền / Hiệu ứng, mỗi dòng một dấu tích.
 * Phím M vẫn gọi thẳng `#music-toggle.click()` nên bật tắt được cả lúc bảng đóng.
 */
function wireSoundMenu($) {
  const btn = $('sound-btn');
  const pop = $('sound-pop');
  const music = $('music-toggle');
  const sfx = $('sfx-toggle');

  const setOpen = (on) => {
    pop.hidden = !on;
    btn.setAttribute('aria-expanded', String(on));
  };
  /* Cả hai cùng tắt thì nút ngoài đổi sang loa gạch, để khỏi phải mở bảng mới
     biết vì sao ván im lặng. */
  const sync = () => {
    music.setAttribute('aria-checked', String(audio.musicOn));
    sfx.setAttribute('aria-checked', String(audio.sfxOn));
    const mute = !audio.musicOn && !audio.sfxOn;
    btn.textContent = mute ? '🔇' : '🔊';
    btn.classList.toggle('off', mute);
  };

  btn.addEventListener('click', () => setOpen(pop.hidden));
  music.addEventListener('click', () => { audio.toggleMusic(); sync(); });
  sfx.addEventListener('click', () => { audio.toggleSfx(); sync(); });
  /* Nghe ở pha capture: nút meme chặn lan truyền cú bấm của nó, nghe ở pha
     nổi bọt thì bấm từ bảng âm thanh sang nút meme không đóng được bảng này. */
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#sound-btn, #sound-pop')) setOpen(false);
  }, true);
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
  sync();
}

/** Các nút tiện ích dưới chân cột: âm thanh, toàn màn hình. */
function wireChrome() {
  const $ = (id) => document.getElementById(id);

  /* Điện thoại nằm ngang: cột thông tin thu về thanh hẹp, và hàng nút tiện ích
     dời xuống đó — phải chạy trước khi ai đó đi tìm #meme-btn theo vị trí cũ. */
  initSidePanel();

  wireSoundMenu($);

  const fsBtn = $('fullscreen-toggle');
  fsBtn.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  });
  document.addEventListener('fullscreenchange', () => {
    const on = !!document.fullscreenElement;
    fsBtn.textContent = on ? '⛉' : '⛶';
    fsBtn.title = on ? 'Thoát toàn màn hình (F)' : 'Toàn màn hình (F)';
  });

  /* Trình duyệt chỉ cho phát tiếng sau một cử chỉ của người dùng —
     chạm phát đầu tiên là lúc nối lại nhạc màn hình chờ. */
  const kick = () => {
    audio.init();
    if (audio.ctx?.state === 'suspended') audio.ctx.resume();
    if (audio.menuMode) audio.startMusic();
  };
  window.addEventListener('pointerdown', kick, { capture: true });
  window.addEventListener('keydown', kick, { capture: true });

  /* Phím tắt: F toàn màn hình · M tắt nhạc · G bảng meme.
     Số 1…0 cũng là phím tắt meme, nhưng nằm trong ui/memes.js vì nó cần biết
     hạn mức và ghế của người bấm. */
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    const k = e.key.toLowerCase();
    if (k === 'f') fsBtn.click();
    else if (k === 'm') $('music-toggle').click();
    else if (k === 'g') $('meme-btn').click();
  });
}
