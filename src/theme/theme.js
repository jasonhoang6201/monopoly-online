/**
 * Đổi chủ đề trên máy này: bảng màu vẽ bàn cờ, biến CSS, và báo cho những
 * module cần dựng lại hình (bàn cờ, âm thanh, khung đèn hộp thoại).
 *
 * Chủ đề chỉ đổi lúc **chưa có ván nào đang chạy** — phòng chờ, bày bàn, màn
 * hạ màn — hoặc đúng một lần lúc vào ván (kể cả vào lại giữa ván) theo
 * `state.settings.theme`. Giữa ván không đổi, nên mấy texture vẽ theo chủ đề
 * (quân cờ, xí ngầu, bàn cờ) chỉ phải dựng lại vào đúng những lúc ấy.
 *
 * Danh sách chủ đề và luật lọc thẻ nằm ở `data/themes.js` (không đụng DOM).
 */
import { P } from '../render/boardArt.js';
import { themeKey, DEFAULT_THEME } from '../data/themes.js';

/** Bảng màu gốc của bàn cờ, chép lại trước khi chủ đề nào kịp ghi đè. */
const BASE = { ...P };

/**
 * Bảng màu bàn cờ của từng chủ đề — chỉ khai những màu khác bản gốc.
 *
 * Giáng Sinh: mặt ô trắng tuyết, còn khung ngoài và lòng bàn cờ là xanh đêm
 * Noel. Đèn nhà và dây LED vẽ bằng blend cộng, nên cần nền tối mới hiện ra;
 * nền xanh nhạt trước đây làm đèn đất có nhà gần như mất hẳn. Nét kẻ trên ô
 * đổi sang xanh băng đậm, đỏ sơn mài đổi sang đỏ Noel cho giá tiền và tấm
 * biển giữa bàn.
 */
const PALETTES = {
  default: {},
  christmas: {
    lacDeep: '#7E1A20',
    lac: '#B3262E',
    lacLight: '#D8434A',
    gold: '#5E8DB5',
    goldLight: '#FFFFFF',
    goldDeep: '#3E6E99',
    paper: '#F7FBFE',
    paperTop: '#FFFFFF',
    paperWarm: '#E4EEF7',
    paperDeep: '#C9DCEB',
    groundLight: '#284C78',
    ground: '#17345A',
    groundDeep: '#0C1D33',
    groundNight: '#0F2440',
    ink: '#1E3A55',
    inkSoft: '#56758F',
    jade: '#2E6B45',
    indigo: '#27418C',
    line: 'rgba(30,58,85,.42)',
    lineSoft: 'rgba(30,58,85,.28)',
    theme: 'christmas',
  },
};

let current = DEFAULT_THEME;
const subs = new Set();

/** Chủ đề đang áp trên máy này. */
export const currentTheme = () => current;
export const isXmas = () => current === 'christmas';

/**
 * Áp một chủ đề. Gọi lại với đúng chủ đề đang chạy thì không làm gì, nên chỗ
 * gọi khỏi phải tự so — phòng chờ gọi mỗi lần sổ ghế đổi.
 */
export function setTheme(name) {
  const key = themeKey(name);
  if (key === current) return;
  current = key;
  Object.assign(P, BASE, PALETTES[key]);
  document.documentElement.dataset.theme = key;
  for (const fn of subs) {
    try { fn(key); } catch (err) { console.error(err); }
  }
}

/** Nghe đổi chủ đề. Trả về hàm gỡ. */
export function onTheme(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

/** Người dùng bật "giảm chuyển động" ở hệ điều hành: đèn đứng yên, tuyết thôi rơi. */
export const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
