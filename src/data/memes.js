/**
 * Bộ meme gửi lên bàn cờ.
 *
 * Tệp nằm trong `assets/meme/` và đi qua Vite như mọi ảnh khác của dự án —
 * lúc build chúng được băm tên rồi chép vào `dist/assets`, nên `url` ở đây luôn
 * là đường dẫn thật của bản đang chạy, cả khi mở dev server lẫn khi đã build.
 * Ảnh tĩnh (jpg/png) dùng được y như gif: cả bảng chọn lẫn bong bóng đều chỉ
 * gán vào `img.src`, không đọc gì riêng của định dạng động.
 *
 * Ảnh gốc đã nén lại bằng gifsicle về cạnh dài tối đa 200px — bong bóng trên
 * bàn rộng nhiều nhất 150px, giữ ảnh 498px chỉ tốn băng thông chứ không nét
 * thêm. Thêm meme mới thì nén trước rồi mới chép vào đây.
 *
 * `id` là thứ bay qua đường truyền (xem `netEmit('meme')` trong controller),
 * nên đổi tên id là hai máy chạy hai bản khác nhau sẽ không hiểu nhau nữa —
 * thêm meme mới thì thêm dòng, đừng sửa id cũ.
 */
import angryUrl from '../../assets/meme/pepe-angry.gif';
import cryUrl from '../../assets/meme/pepe-cry.gif';
import cry2Url from '../../assets/meme/pepe-cry-2.gif';
import shockUrl from '../../assets/meme/pepe-shock.gif';
import findUrl from '../../assets/meme/pepe-find.gif';
import pinchUrl from '../../assets/meme/pepe-pinch.gif';
import chiikawaUrl from '../../assets/meme/chiikawa.gif';
import fireUrl from '../../assets/meme/worry-fire.gif';
import jailUrl from '../../assets/meme/worry-jail.gif';
import pleUrl from '../../assets/meme/worry-ple.gif';
import richUrl from '../../assets/meme/worry-rich.jpg';
import stabUrl from '../../assets/meme/worry-stab.gif';

export const MEMES = [
  { id: 'angry', label: 'Cay cú', url: angryUrl },
  { id: 'shock', label: 'Choáng', url: shockUrl },
  { id: 'cry', label: 'Khóc ròng', url: cryUrl },
  { id: 'cry2', label: 'Mếu máo', url: cry2Url },
  { id: 'ple', label: 'Năn nỉ', url: pleUrl },
  { id: 'rich', label: 'Giàu to', url: richUrl },
  { id: 'jail', label: 'Vô tù', url: jailUrl },
  { id: 'fire', label: 'Cháy nhà', url: fireUrl },
  { id: 'stab', label: 'Đâm sau lưng', url: stabUrl },
  { id: 'find', label: 'Đi tìm', url: findUrl },
  { id: 'pinch', label: 'Nhéo má', url: pinchUrl },
  { id: 'cute', label: 'Dễ thương', url: chiikawaUrl },
];

export const MEME_BY_ID = Object.fromEntries(MEMES.map((m) => [m.id, m]));
