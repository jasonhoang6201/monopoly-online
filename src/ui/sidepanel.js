/**
 * Cột thông tin thu gọn khi điện thoại nằm ngang.
 *
 * Màn 402px cao chỉ cho bàn cờ một ô vuông 378px, còn lại là hai cột hai bên.
 * Cột trái vốn giữ hiệu bài, bảng người chơi, xem nhanh và thanh Thời Cuộc —
 * toàn thứ đọc từng lúc chứ không nhìn liên tục — nên nó nhường chỗ cho một
 * thanh hẹp 44px, còn bảng đầy đủ chỉ bung ra khi người chơi bấm, và bung ra
 * thì nổi đè lên bàn cờ chứ không đẩy bàn hẹp lại.
 *
 * CSS lo phần trượt ra trượt vào; tệp này chỉ bật/tắt lớp `side-open` trên
 * <body> và dời hàng nút tiện ích xuống thanh hẹp.
 */

/** Đúng ngưỡng mà style.css dùng cho khối bố cục điện thoại nằm ngang. */
const MQ = '(orientation: landscape) and (max-height: 500px)';

export function initSidePanel() {
  const strip = document.getElementById('side-strip');
  const panel = document.getElementById('sidebar');
  if (!strip || !panel) return null;

  const scrim = document.getElementById('side-scrim');
  const toggle = document.getElementById('side-toggle');
  const closeBtn = document.getElementById('side-close');
  const tools = document.querySelector('.side-tools');
  const foot = document.querySelector('.side-foot');
  const mq = window.matchMedia(MQ);

  const isOpen = () => document.body.classList.contains('side-open');

  const setOpen = (on) => {
    const want = on && mq.matches;
    document.body.classList.toggle('side-open', want);
    toggle?.setAttribute('aria-expanded', String(want));
    /* Lúc khuất thì bảng vẫn còn trong cây DOM — nói rõ cho trình đọc màn
       hình biết nó đang không hiện, kẻo người dùng lia tới một bảng vô hình. */
    if (mq.matches) panel.setAttribute('aria-hidden', String(!want));
    else panel.removeAttribute('aria-hidden');
  };

  toggle?.addEventListener('click', () => setOpen(!isOpen()));
  closeBtn?.addEventListener('click', () => setOpen(false));
  scrim?.addEventListener('click', () => setOpen(false));
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });

  /* Bấm một người trong bảng là để mở hộp thoại tài sản của họ — hộp thoại ấy
     che kín màn, giữ bảng mở phía sau thì lúc đóng hộp thoại bàn cờ lại bị
     che tiếp. */
  panel.addEventListener('click', (e) => {
    if (e.target.closest('.rchip, .pcard')) setOpen(false);
  });

  /* Dời cả khối .side-tools chứ không dời từng nút: bảng meme là con của khối
     này (ui/memes.js gắn vào đó) nên nó đi theo, và mọi listener giữ nguyên. */
  const place = () => {
    if (mq.matches) {
      if (tools && tools.parentElement !== strip) strip.appendChild(tools);
    } else if (tools && foot && tools.parentElement !== foot) {
      foot.appendChild(tools);
    }
    setOpen(mq.matches && isOpen());
  };
  mq.addEventListener('change', place);
  place();

  return { open: () => setOpen(true), close: () => setOpen(false), collapsed: () => mq.matches };
}
