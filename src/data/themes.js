/**
 * Danh sách chủ đề của bàn cờ — phần thuần dữ liệu.
 *
 * Chủ đề nằm trong `settings` của ván (`state.settings.theme`), cùng chỗ với
 * nấc Thời Cuộc: chủ phòng chọn lúc chờ, ảnh chụp mang theo, nên người vào lại
 * giữa ván nhận đúng chủ đề mà không cần tin nhắn riêng.
 *
 * Tệp này không đụng DOM để `core/` (chạy dưới Node trong bài kiểm thử) gọi
 * được `cardInTheme`. Phần đổi màu, đổi hình nằm ở `theme/theme.js`.
 */

export const THEMES = {
  default: {
    key: 'default',
    name: 'Mặc định · Sài Gòn Gia Định',
    desc: 'Sơn mài đỏ, vàng hoàng cung, giấy dó. Nhạc ghi-ta phòng trà.',
  },
  christmas: {
    key: 'christmas',
    name: 'Giáng Sinh · Sài Gòn tuyết',
    desc: 'Bàn cờ phủ tuyết, đèn LED trên ô và hộp thoại, nhạc Jingle Bells, thêm sự kiện Bão Tuyết.',
  },
  halloween: {
    key: 'halloween',
    name: 'Halloween · Nghĩa Địa Đô Thành',
    desc: 'Bàn cờ đen tím, nghĩa địa giữa bàn, quân là bộ xương, đèn bí ngô, nhạc Danse Macabre, thêm ba sự kiện và thẻ Bị Nguyền.',
  },
};

export const DEFAULT_THEME = 'default';

/** Tên chủ đề hợp lệ; tên lạ (ảnh chụp cũ, gói tin hỏng) rơi về mặc định. */
export const themeKey = (name) => (THEMES[name] ? name : DEFAULT_THEME);

/**
 * Thẻ này có thuộc chủ đề đang chơi không.
 *
 * Thẻ không khai `theme` là thẻ chung, chủ đề nào cũng rút được. Thẻ khai
 * `theme: 'christmas'` (Bão Tuyết, Ông Già Noel…) hay `theme: 'halloween'`
 * (Xác Sống, Bị Nguyền…) chỉ vào chồng khi ván chơi đúng chủ đề ấy.
 */
export const cardInTheme = (card, theme) => !card?.theme || card.theme === themeKey(theme);
