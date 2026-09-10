/**
 * Bộ meme gửi lên bàn cờ.
 *
 * Tệp nằm trong `assets/meme/` và đi qua Vite như mọi ảnh khác của dự án —
 * lúc build chúng được băm tên rồi chép vào `dist/assets`, nên `url` ở đây luôn
 * là đường dẫn thật của bản đang chạy, cả khi mở dev server lẫn khi đã build.
 * Ảnh tĩnh (jpg/png) dùng được y như gif: cả bảng chọn lẫn bong bóng đều chỉ
 * gán vào `img.src`, không đọc gì riêng của định dạng động.
 *
 * Danh sách sinh từ `import.meta.glob` chứ không phải một dãy `import` cố định:
 * `import` cố định trỏ vào tệp đã xoá thì Vite dừng ngay ở bước phân giải, dev
 * server lẫn build đều đứng. Với glob, tệp nào còn thì có mặt, tệp nào bị xoá
 * thì rơi khỏi `MEMES` — bảng chọn hiện đúng số ảnh đang có, không còn ô trống
 * và không còn `img` gãy. Chép ảnh mới vào thư mục cũng đủ để nó xuất hiện.
 *
 * `CATALOG` giữ ba thứ tách rời nhau: `id` bay qua đường truyền (xem
 * `netEmit('meme')` trong controller), `file` là tên tệp, `label` là nhãn hiện
 * trong bảng chọn; thứ tự dòng là thứ tự hiện. Tách như vậy vì đổi tên tệp hay
 * xoá tệp thì id vẫn nguyên — hai máy chạy hai bản khác nhau vẫn hiểu nhau, còn
 * bên nhận thiếu ảnh thì tự bỏ qua (`show()` thoát sớm khi `MEME_BY_ID[id]`
 * rỗng). Thêm meme mới thì thêm dòng, đừng sửa `id` cũ. Tệp chép vào mà chưa có
 * dòng nào nhận vẫn dùng được: nó xếp cuối, lấy tên tệp làm cả id lẫn nhãn.
 *
 * Ảnh gốc đã nén lại bằng gifsicle về cạnh dài tối đa 200px — bong bóng trên
 * bàn rộng nhiều nhất 150px, giữ ảnh 498px chỉ tốn băng thông chứ không nét
 * thêm. Thêm meme mới thì nén trước rồi mới chép vào đây:
 *
 *   gifsicle --colors=255 goc.gif -o tmp.gif            # bỏ bảng màu cục bộ
 *   gifsicle -U --resize-fit 200x200 --colors 64 \
 *            --lossy=80 -O3 tmp.gif -o meme.gif
 *
 * Bước `--colors=255` chạy trước vì gif có bảng màu cục bộ thì gifsicle không
 * tháo tối ưu được (`GIF too complex to unoptimize`), resize thẳng sẽ ra khung
 * dính vệt của khung trước. Gif nào trên 30 khung thì giữ khung chẵn và nhân
 * đôi delay (`-d…` cùng danh sách `#0 #2 #4 …`): ở 150px mắt không thấy khác,
 * tệp nhẹ đi gần một nửa.
 */

/**
 * Bộ meme, theo thứ tự hiện trong bảng chọn.
 * `[id gửi qua mạng, tên tệp trong assets/meme (bỏ đuôi), nhãn]`
 */
const CATALOG = [
  ['angry', 'pepe-angry', 'Cay cú'],
  ['shock', 'pepe-shock', 'Choáng'],
  ['cry', 'pepe-cry', 'Khóc ròng'],
  ['cry2', 'pepe-cry-2', 'Mếu máo'],
  ['ple', 'worry-ple', 'Năn nỉ'],
  ['rich', 'worry-rich', 'Giàu to'],
  ['jail', 'worry-jail', 'Vô tù'],
  ['fire', 'worry-fire', 'Cháy nhà'],
  ['stab', 'worry-stab', 'Đâm sau lưng'],
  ['find', 'pepe-find', 'Đi tìm'],
  ['pinch', 'pepe-pinch', 'Nhéo má'],
  ['cute', 'chiikawa', 'Dễ thương'],
  ['broke', 'broke', 'Cháy túi'],
  ['yell', 'meo-aa', 'Gào lên'],
  ['scream', 'meo-aaa', 'La làng'],
  ['dance', 'meo-dance', 'Quẩy'],
  ['stare', 'meo-surprise', 'Trố mắt'],
  ['delivery', 'meo-delivery', 'Giao hàng'],
];

/* Liệt kê đuôi cụ thể thay vì `*`: thư mục còn dính `.DS_Store` của Finder,
   quét tất thì nó thành một ô meme hỏng. */
const FOUND = import.meta.glob('../../assets/meme/*.{gif,png,jpg,jpeg,webp,avif}', {
  eager: true,
  query: '?url',
  import: 'default',
});

/** Đường dẫn `../../assets/meme/pepe-cry.gif` → tên tệp `pepe-cry`. */
const baseOf = (path) => path.slice(path.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '');

/** Tên tệp (bỏ đuôi) → url, gom từ các tệp thật sự còn trong thư mục. */
const URL_BY_FILE = Object.fromEntries(
  Object.entries(FOUND).map(([path, url]) => [baseOf(path), url]),
);

/** Tệp đã có dòng trong CATALOG, để biết tệp nào là tệp lạ. */
const CLAIMED = new Set(CATALOG.map(([, file]) => file));

export const MEMES = [
  // Giữ nguyên thứ tự CATALOG; dòng nào mất tệp thì bỏ qua.
  ...CATALOG
    .filter(([, file]) => URL_BY_FILE[file])
    .map(([id, file, label]) => ({ id, label, url: URL_BY_FILE[file] })),
  // Tệp mới chép vào mà chưa kịp thêm dòng: vẫn dùng được, xếp cuối.
  ...Object.keys(URL_BY_FILE)
    .filter((file) => !CLAIMED.has(file))
    .sort()
    .map((file) => ({ id: file, label: file, url: URL_BY_FILE[file] })),
];

export const MEME_BY_ID = Object.fromEntries(MEMES.map((m) => [m.id, m]));

/* Nhắc lúc chạy dev: dòng còn trong CATALOG nhưng tệp đã mất. Không ném lỗi —
   thiếu ảnh chỉ làm bảng chọn ngắn đi, không có lý do gì để chặn cả ván chơi. */
if (import.meta.env?.DEV) {
  const missing = CATALOG.filter(([, file]) => !URL_BY_FILE[file]).map(([, file]) => file);
  if (missing.length) {
    console.warn(`[memes] thiếu tệp trong assets/meme/: ${missing.join(', ')}`);
  }
}
