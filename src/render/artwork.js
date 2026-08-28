/**
 * Bốn tấm hoạ tiết vẽ tay dùng trên mặt bàn cờ: mái đình, mây cuộn, rồng, phụng.
 *
 * Ảnh đã được tách nền sẵn (mực đen tuyền + kênh alpha) nên **nhuộm màu** chỉ là
 * phủ một mảng màu qua đúng hình mực bằng `source-in`: giữ nguyên nét khử răng
 * cưa ở mép, mà vẫn ăn theo màu nhóm đất hay màu ô như phần còn lại của bàn cờ.
 *
 * Bản nhuộm được giữ lại theo cặp (hoạ tiết, màu) — mỗi ván chỉ có chừng mười
 * cặp, mà bàn cờ thì vẽ lại mỗi lần đổi cỡ màn hình.
 */
import gateUrl from '../../assets/gate.png';
import cloudUrl from '../../assets/cloud.png';
import dragonUrl from '../../assets/dragon.png';
import phoenixUrl from '../../assets/phoenix.png';

const SRC = { gate: gateUrl, cloud: cloudUrl, dragon: dragonUrl, phoenix: phoenixUrl };

/** Cạnh dài nhất của bản nhuộm. Chỗ vẽ to nhất là thẻ đất ×2 cho màn Retina. */
const MAX_TINT = 768;

const loaded = {};
const cache = new Map();

/**
 * Nạp trước cả bốn tấm. Ảnh nào hỏng thì bỏ qua — nơi gọi `drawArt` sẽ tự rơi
 * về bản hoạ tiết dựng bằng code.
 */
export function loadArtwork() {
  return Promise.all(Object.entries(SRC).map(([name, url]) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { loaded[name] = img; resolve(name); };
    img.onerror = () => resolve(null);
    img.src = url;
  })));
}

/** Bản đã nhuộm màu của một hoạ tiết. */
function tinted(name, color) {
  const key = `${name}:${color}`;
  let cv = cache.get(key);
  if (!cv) {
    const img = loaded[name];
    const s = Math.min(1, MAX_TINT / Math.max(img.naturalWidth, img.naturalHeight));
    cv = document.createElement('canvas');
    cv.width = Math.round(img.naturalWidth * s);
    cv.height = Math.round(img.naturalHeight * s);
    const c = cv.getContext('2d');
    c.drawImage(img, 0, 0, cv.width, cv.height);
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = color;
    c.fillRect(0, 0, cv.width, cv.height);
    cache.set(key, cv);
  }
  return cv;
}

/**
 * Vẽ hoạ tiết đã nhuộm màu, canh giữa tại (cx, cy) và **vừa khít** trong khung
 * `boxW × boxH` mà không kéo méo tỉ lệ. `flip` lật ngang.
 * @returns {boolean} false nếu ảnh chưa nạp được — nơi gọi tự vẽ bản dự phòng.
 */
export function drawArt(ctx, name, color, cx, cy, boxW, boxH, flip = false) {
  if (!loaded[name]) return false;
  const cv = tinted(name, color);
  const s = Math.min(boxW / cv.width, boxH / cv.height);
  const w = cv.width * s, h = cv.height * s;
  ctx.save();
  ctx.translate(cx, cy);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(cv, -w / 2, -h / 2, w, h);
  ctx.restore();
  return true;
}
