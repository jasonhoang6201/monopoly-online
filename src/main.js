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
import { DPR } from './dpr.js';

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
    window.__monopoly = { game, scene, controller, DPR };
    window.__audioProbe = audio;
    wireChrome();
    // Phiên chơi tự hỏi chơi một máy hay mở phòng online, rồi mới trao ván
    // cho controller. Bấm vào đường mời thì vào thẳng phòng, khỏi hỏi.
    startSession(controller);
  });
}

boot();

/** Các nút tiện ích dưới chân cột: nhạc, hiệu ứng, toàn màn hình. */
function wireChrome() {
  const $ = (id) => document.getElementById(id);

  $('music-toggle').addEventListener('click', (e) => {
    e.currentTarget.classList.toggle('off', !audio.toggleMusic());
  });
  $('sfx-toggle').addEventListener('click', (e) => {
    e.currentTarget.classList.toggle('off', !audio.toggleSfx());
  });

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

  // Phím tắt: F toàn màn hình · M tắt nhạc
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    const k = e.key.toLowerCase();
    if (k === 'f') fsBtn.click();
    else if (k === 'm') $('music-toggle').click();
  });
}
