/**
 * Bộ meme gửi lên bàn cờ.
 *
 * Bốn tệp nằm trong `assets/meme/` và đi qua Vite như mọi ảnh khác của dự án —
 * lúc build chúng được băm tên rồi chép vào `dist/assets`, nên `url` ở đây luôn
 * là đường dẫn thật của bản đang chạy, cả khi mở dev server lẫn khi đã build.
 *
 * `id` là thứ bay qua đường truyền (xem `netEmit('meme')` trong controller),
 * nên đổi tên id là hai máy chạy hai bản khác nhau sẽ không hiểu nhau nữa —
 * thêm meme mới thì thêm dòng, đừng sửa id cũ.
 */
import angryUrl from '../../assets/meme/pepe-angry.gif';
import cryUrl from '../../assets/meme/pepe-cry.gif';
import shockUrl from '../../assets/meme/pepe-shock.gif';
import chiikawaUrl from '../../assets/meme/chiikawa.gif';

export const MEMES = [
  { id: 'angry', label: 'Cay cú', url: angryUrl },
  { id: 'shock', label: 'Choáng', url: shockUrl },
  { id: 'cry', label: 'Khóc ròng', url: cryUrl },
  { id: 'cute', label: 'Dễ thương', url: chiikawaUrl },
];

export const MEME_BY_ID = Object.fromEntries(MEMES.map((m) => [m.id, m]));
