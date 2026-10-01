/**
 * Biểu tượng cây kỹ năng — nét vẽ đơn 24×24 ăn theo `currentColor`, cùng kiểu
 * với actionIcons.js, nên ô đổi trạng thái (khoá / học được / đã học) chỉ cần
 * đổi màu chữ là hình đổi theo.
 *
 * Mỗi kỹ năng một hình riêng, vì trên cây có 33 ô mà người chơi phải liếc qua
 * là nhận ra ô mình vừa học mà không cần đọc tên.
 */

const svg = (inner, cls = '') => `<svg class="sk-ico ${cls}" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"
    xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">${inner}</svg>`;

/** Chấm đặc — mặt xí ngầu, lỗ chip. */
const dot = (x, y, r = 1.15) => `<circle cx="${x}" cy="${y}" r="${r}" fill="currentColor" stroke="none"/>`;

const ICONS = {
  /* ---------------------------------------------------------- huy hiệu nhánh */
  congnhan:
    '<circle cx="12" cy="12" r="3"/>'
    + '<path d="M12 3v2.6M12 18.4V21M3 12h2.6M18.4 12H21M5.6 5.6l1.9 1.9M16.5 16.5l1.9 1.9M5.6 18.4l1.9-1.9M16.5 7.5l1.9-1.9"/>'
    + '<circle cx="12" cy="12" r="6.4"/>',
  duhanh:
    '<circle cx="12" cy="12" r="9"/>'
    + '<path d="M15.8 8.2 13.4 13.4 8.2 15.8 10.6 10.6z"/>' + dot(12, 12, .9),
  doden:
    '<rect x="4" y="4" width="16" height="16" rx="3.4"/>'
    + dot(8.4, 8.4) + dot(15.6, 8.4) + dot(12, 12) + dot(8.4, 15.6) + dot(15.6, 15.6),
  dauco:
    '<path d="M3.5 20.5h17"/><path d="M6 20.5v-5M10.5 20.5v-8M15 20.5v-6M19.5 20.5V9"/>'
    + '<path d="M4.5 11 9.5 6.5l4 3L19.5 3.8"/><path d="M15.8 3.5h3.9v3.9"/>',
  ancu:
    '<circle cx="8.5" cy="12" r="4.3"/><path d="M12.6 12H21M17.5 12v3.2M20.4 12v2.4"/>'
    + dot(8.5, 12, 1.2),

  /* ---------------------------------------------------------- Công Nhân Ưu Tú */
  pickup:   // đồng xu rơi vào lòng bàn tay
    '<circle cx="13" cy="6.2" r="3.2"/><path d="M13 4.8v2.8"/>'
    + '<path d="M3 14.5h3.2l3.3 1.3h4.2a1.5 1.5 0 0 1 0 3H10"/>'
    + '<path d="M13.6 18.6 19 16.4a1.6 1.6 0 0 1 1.3 2.8L14 21.5H3"/>',
  overtime: // đồng hồ có dấu cộng
    '<circle cx="10.5" cy="12.5" r="7.5"/><path d="M10.5 8.5v4.4l2.8 1.8"/>'
    + '<path d="M19.5 2.8v5M17 5.3h5"/>',
  union:    // tấm khiên chặn đôi mũi tên thuế
    '<path d="M12 3 19.5 6v5.2c0 4.6-3.1 8.3-7.5 9.8-4.4-1.5-7.5-5.2-7.5-9.8V6z"/>'
    + '<path d="M9 14.6 15 8.6"/>' + dot(9.3, 9.2, 1.2) + dot(14.7, 14.2, 1.2),
  seniority: // ba chồng xu cao dần
    '<path d="M3.5 20.5h17"/>'
    + '<path d="M4.5 20.5v-3h4v3M10 20.5v-7h4v7M15.5 20.5v-11h4v11"/>'
    + '<path d="M10 17h4M15.5 13.2h4M15.5 16.8h4"/><path d="M5 6.5 10 3.5l4.5 2.2 5-2.2"/>',
  strike:   // lá cờ bãi công
    '<path d="M5.5 21.5V3"/><path d="M5.5 3.8h12.8l-2.8 4 2.8 4H5.5"/>'
    + '<path d="M9.5 21.5h-8"/>',

  /* ---------------------------------------------------------- Nhà Du Hành */
  ticket:
    '<path d="M3.5 7h17v3a2 2 0 0 0 0 4v3h-17v-3a2 2 0 0 0 0-4z"/>'
    + '<path d="M14.5 7v2M14.5 11v2M14.5 15v2"/><path d="M6.8 10.5h4.6M6.8 13.5h3"/>',
  express:  // đầu tàu và vệt gió
    '<rect x="8.5" y="3.5" width="12" height="14" rx="3"/>'
    + '<path d="M8.5 10.5h12"/>' + dot(11.8, 14.2) + dot(17.2, 14.2)
    + '<path d="M11 21l1.5-3.5M18 21l-1.5-3.5M2 7h4M3 11h3.5M2 15h4"/>',
  homecoming: // mũi tên vòng về ngôi sao
    '<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M18.3 2.8v3.9h-3.9"/>'
    + '<path d="M12 8.6l1 2.2 2.4.3-1.8 1.6.5 2.4-2.1-1.2-2.1 1.2.5-2.4-1.8-1.6 2.4-.3z"/>',
  fork:     // cột biển chỉ hai ngả
    '<path d="M12 21.5V3"/><path d="M12 5.5h7l2 2-2 2h-7"/><path d="M12 12H5l-2 2 2 2h7"/>'
    + '<path d="M8.5 21.5h7"/>',
  teleport: // ghim đích và đường chấm
    '<path d="M17 10.2c0 3.6-5 8.3-5 8.3s-5-4.7-5-8.3a5 5 0 0 1 10 0z" transform="translate(3.5 -3)"/>'
    + '<circle cx="15.5" cy="7" r="1.8"/>'
    + '<path d="M3 20.5c2-3 4.8-3.4 7-2.2" stroke-dasharray="1.4 2.4"/>' + dot(3, 20.5, 1.3),

  /* ---------------------------------------------------------- Tay Chơi Đỏ Đen */
  parity:   // đồng xu nửa sáng nửa tối
    '<circle cx="12" cy="12" r="8.6"/>'
    + '<path d="M12 3.4a8.6 8.6 0 0 1 0 17.2z" fill="currentColor" stroke="none" opacity=".85"/>'
    + '<path d="M7.6 12h1.8"/>',
  chip:
    '<circle cx="12" cy="12" r="8.6"/><circle cx="12" cy="12" r="4.4"/>'
    + '<path d="M12 3.4v3.2M12 17.4v3.2M3.4 12h3.2M17.4 12h3.2M5.9 5.9l2.2 2.2M15.9 15.9l2.2 2.2M5.9 18.1l2.2-2.2M15.9 8.1l2.2-2.2"/>',
  clover:
    '<path d="M12 11.5C9.3 9 8.9 5.6 10.4 4.6s3 .3 1.6 2.4c-1.4-2.1.1-3.4 1.6-2.4s1.1 4.4-1.6 6.9"/>'
    + '<path d="M12 11.5c2.5-2.7 5.9-3.1 6.9-1.6s-.3 3-2.4 1.6c2.1 1.4.8 2.9-.7 2.1"/>'
    + '<path d="M12 11.5c-2.5-2.7-5.9-3.1-6.9-1.6s.3 3 2.4 1.6c-2.1 1.4-.8 2.9.7 2.1"/>'
    + '<path d="M12 11.5c0 3.5.6 6.5 2.8 9.5"/>',
  reroll:   // xí ngầu và mũi tên xoay
    '<rect x="6.5" y="6.5" width="11" height="11" rx="2.4"/>' + dot(9.5, 9.5) + dot(14.5, 14.5) + dot(12, 12)
    + '<path d="M3 9.5a9.2 9.2 0 0 1 15.3-5"/><path d="M18.8 1.6v3.6h-3.6"/>'
    + '<path d="M21 14.5a9.2 9.2 0 0 1-15.3 5"/><path d="M5.2 22.4v-3.6h3.6"/>',
  allin:    // ba chồng chip đẩy lên
    '<ellipse cx="9" cy="18" rx="5.5" ry="2"/><path d="M3.5 18v-2.6M14.5 18v-2.6"/>'
    + '<ellipse cx="9" cy="15.4" rx="5.5" ry="2"/><path d="M3.5 15.4v-2.6M14.5 15.4v-2.6"/>'
    + '<ellipse cx="9" cy="12.8" rx="5.5" ry="2"/>'
    + '<path d="M16 8.5 20.5 4M16.5 4h4v4"/>',

  /* ---------------------------------------------------------- Nhà Đầu Cơ */
  broker:   // thẻ giá với dấu phần trăm
    '<path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.6 8.6a1.2 1.2 0 0 1 0 1.7l-7 7a1.2 1.2 0 0 1-1.7 0z"/>'
    + '<circle cx="8" cy="8" r="1.4"/>'
    + '<path d="M11 16.2l5-5"/>' + dot(11.8, 12.2, 1) + dot(15.2, 15.4, 1),
  swap:     // hai mũi tên đổi chủ quanh mái nhà
    '<path d="M9 13.5 12 11l3 2.5v4.5H9z"/>'
    + '<path d="M3.5 9a8.6 8.6 0 0 1 15-3.8"/><path d="M19 1.8v3.8h-3.8"/>'
    + '<path d="M20.5 15a8.6 8.6 0 0 1-15 3.8"/><path d="M5 22.2v-3.8h3.8"/>',
  bricks:   // tường gạch và bay thợ hồ
    '<path d="M2.5 21.5h13v-11h-13z"/><path d="M2.5 14.2h13M2.5 17.8h13"/>'
    + '<path d="M7 10.5v3.7M11 14.2v3.6M7 17.8v3.7"/>'
    + '<path d="M15.5 6.5 19.5 2.5l2 2-4 4z"/><path d="M17.5 8.5 14 12"/>',
  magnet:
    '<path d="M5 3.5h4.2v8a2.8 2.8 0 0 0 5.6 0v-8H19v8a7 7 0 0 1-14 0z"/>'
    + '<path d="M5 7.5h4.2M14.8 7.5H19"/>'
    + '<path d="M9 21.5l.8-1.8M15 21.5l-.8-1.8M12 22v-1.8"/>',
  boom:     // ngọn lửa trên mái nhà
    '<path d="M3.5 21.5h17"/><path d="M6 21.5v-6.3l6-4.7 6 4.7v6.3"/>'
    + '<path d="M12 2.5c2.4 2.2 3.2 3.8 3.2 5.2a3.2 3.2 0 0 1-6.4 0c0-1.2.6-2 1.4-2.8.2 1 .7 1.6 1.4 1.8-.3-1.5-.1-2.9.4-4.2z"/>'
    + '<path d="M10.5 21.5v-3.3h3v3.3"/>',

  /* ---------------------------------------------------------- Thường Dân An Cư */
  hearth:   // mái nhà có ống khói và trái tim
    '<path d="M3 11 12 3.5 21 11"/><path d="M5.5 9v11.5h13V9"/><path d="M16.5 5.5V3.5h2v3.7"/>'
    + '<path d="M12 18c-2.6-1.7-3.6-3-3.6-4.2a1.8 1.8 0 0 1 3.6-.4 1.8 1.8 0 0 1 3.6.4c0 1.2-1 2.5-3.6 4.2z"/>',
  hourglass:
    '<path d="M6 2.5h12M6 21.5h12"/>'
    + '<path d="M7.5 2.5c0 5 4.5 6.3 4.5 9.5s-4.5 4.5-4.5 9.5M16.5 2.5c0 5-4.5 6.3-4.5 9.5s4.5 4.5 4.5 9.5"/>'
    + '<path d="M9.2 19.5 12 17l2.8 2.5z" fill="currentColor" stroke="none"/>',
  palette:  // ba mái nhà khác cỡ
    '<path d="M2 21.5h20"/>'
    + '<path d="M3 21.5v-6l3-2.5 3 2.5v6"/><path d="M9 21.5V11l3.5-3 3.5 3v10.5"/>'
    + '<path d="M16 21.5v-7.5l2.5-2 2.5 2v7.5"/>'
    + dot(12.5, 13, 1) + dot(6, 17.3, .9) + dot(18.5, 16.5, .9),
  heirloom: // khiên che mái nhà
    '<path d="M12 2.5 20 5.6v5.6c0 5-3.4 8.9-8 10.4-4.6-1.5-8-5.4-8-10.4V5.6z"/>'
    + '<path d="M8 12.2 12 9l4 3.2"/><path d="M9.3 11.4v4.8h5.4v-4.8"/>',
  pagoda:   // gác chuông ba tầng mái cong
    '<path d="M12 1.8v2"/>'
    + '<path d="M6.5 7.5c2-.3 3.8-1.4 5.5-3.7 1.7 2.3 3.5 3.4 5.5 3.7"/><path d="M8 7.5v3h8v-3"/>'
    + '<path d="M4.5 13c2.6-.4 5-1 7.5-2.5 2.5 1.5 4.9 2.1 7.5 2.5"/><path d="M6.5 13v3.5h11V13"/>'
    + '<path d="M2.5 19.2c3.2-.4 6.3-1.2 9.5-2.7 3.2 1.5 6.3 2.3 9.5 2.7"/><path d="M5 19v2.5h14V19"/>'
    + '<path d="M10.5 21.5v-2.2h3v2.2"/>',

  /* ---------------------------------------------------------- cấp 2 'c', cấp 3 'b' */
  veteran:  // huy chương treo dải băng
    '<path d="M8 2.5 10.5 9M16 2.5 13.5 9"/><circle cx="12" cy="15" r="5.5"/>'
    + '<path d="m12 12.2.9 1.9 2 .2-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.2z"/>',
  jailbird: // song sắt và đồng xu
    '<rect x="3" y="3.5" width="12" height="17" rx="1.5"/><path d="M7 3.5v17M11 3.5v17"/>'
    + '<circle cx="17.5" cy="15.5" r="3.8"/><path d="M17.5 13.8v3.4"/>',
  twofinger: // hai ngón tay kẹp đồng xu
    '<path d="M7 21v-6.5L5 9.5a1.4 1.4 0 0 1 2.6-1l2 4.3V5a1.4 1.4 0 0 1 2.8 0v7"/>'
    + '<path d="M12.4 12V7.5a1.4 1.4 0 0 1 2.8 0v6.8c0 3.8-2 6.7-5.2 6.7"/>'
    + '<circle cx="18.5" cy="4.5" r="2.4"/>',
  backpack: // ba lô có túi trước
    '<path d="M9 5V3.8A1.3 1.3 0 0 1 10.3 2.5h3.4A1.3 1.3 0 0 1 15 3.8V5"/>'
    + '<rect x="5" y="5" width="14" height="16.5" rx="4"/><path d="M8.5 14.5h7v4h-7z"/><path d="M5 11h14"/>',
  bigsmall: // hai xí ngầu, mũi tên lên và xuống
    '<rect x="2.5" y="8" width="9" height="9" rx="2"/>' + dot(5.5, 11) + dot(8.5, 14)
    + '<path d="M16 3.5v7M13.8 5.7 16 3.5l2.2 2.2"/><path d="M19.5 13.5v7M17.3 18.3l2.2 2.2 2.2-2.2"/>',
  refund:   // chip cược và mũi tên quay về
    '<circle cx="13" cy="13" r="6.5"/><circle cx="13" cy="13" r="2.4"/>'
    + '<path d="M3 8.5A9 9 0 0 1 10.5 3"/><path d="M3 4.2v4.3h4.3"/>',
  ledger:   // sổ nợ và đồng hồ đếm hạn
    '<path d="M4 3.5h9.5a1.5 1.5 0 0 1 1.5 1.5v6"/><path d="M4 3.5v16h7"/><path d="M7 8h5M7 11.5h3"/>'
    + '<circle cx="16.5" cy="16.5" r="4.5"/><path d="M16.5 14.3v2.3l1.6 1.2"/>',
  lifebuoy: // phao cứu sinh
    '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/>'
    + '<path d="m5.6 5.6 3.6 3.6M18.4 5.6l-3.6 3.6M5.6 18.4l3.6-3.6M18.4 18.4l-3.6-3.6"/>',
  receipt:  // hoá đơn mép răng cưa, mũi tên tiền quay về
    '<path d="M5 2.5h11v19l-2.2-1.5-2.2 1.5-2.2-1.5-2.2 1.5L5 20z"/><path d="M8 7h5M8 10.5h5"/>'
    + '<path d="M21 13.5a3.5 3.5 0 0 1-6 2.5"/><path d="M21 11v2.5h-2.5"/>',
  doorstep: // cửa nhà mở, lối đi vào
    '<path d="M4 21.5V4.5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v17"/><path d="M4 21.5h17"/>'
    + '<path d="M15 5.5l4.5 1.5v14.5"/>' + dot(12, 13, 1),

  /* ---------------------------------------------------------- phụ trợ */
  /* ---------------------------------------------------------- tối thượng thứ hai */
  insurance: // chiếc ô che đồng xu
    '<path d="M3 11.5a9 9 0 0 1 18 0z"/><path d="M12 2.5v9"/>'
    + '<path d="M12 11.5v6.2a2 2 0 0 1-4 0"/>'
    + '<circle cx="17.5" cy="18" r="2.6"/>',
  tollgate: // chòi gác và thanh chắn ngang đường
    '<path d="M3.5 21V9.5h5V21"/><path d="M2.5 9.5 6 6l3.5 3.5"/>'
    + '<path d="M8.5 14h12.5" stroke-width="2.4"/><path d="M12 14v0M16 14v0" stroke-dasharray="1 3"/>'
    + '<path d="M2 21h20"/>',
  lottery:  // tờ vé số có hai con số và mép xé
    '<path d="M4 4.5h16v15H4z"/><path d="M4 9h16" stroke-dasharray="1.4 1.8"/>'
    + '<path d="M7.5 12.5h2.6l-2.3 4.5M13.5 13.2a1.5 1.5 0 1 1 2.7.9l-2.7 2.9h3.1"/>',
  foreclose: // ổ khoá móc vào mái nhà
    '<path d="M3 12 12 4l9 8"/><path d="M5.5 10v10.5h13V10"/>'
    + '<rect x="9" y="14" width="6" height="5" rx="1"/><path d="M10.2 14v-1.6a1.8 1.8 0 0 1 3.6 0V14"/>',
  storefront: // mái hiên sọc trên cửa hàng
    '<path d="M4 9.5 5.5 4h13L20 9.5"/>'
    + '<path d="M4 9.5a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0"/>'
    + '<path d="M5.5 12v8.5h13V12"/><path d="M10 20.5v-5h4v5"/>',

  /* ---------------------------------------------------------- nhánh phụ */
  helmet:   // mũ bảo hộ có vành
    '<path d="M4 16.5a8 8 0 0 1 16 0"/><path d="M2.5 16.5h19v2.5h-19z"/>'
    + '<path d="M10 8.8V6h4v2.8"/><path d="M8 16.5v-4M16 16.5v-4"/>',
  cell:     // song sắt và đồng xu nằm trong
    '<rect x="3.5" y="3.5" width="17" height="17" rx="1.5"/>'
    + '<path d="M8 3.5v17M12 3.5v4.5M12 16v4.5M16 3.5v17"/><circle cx="12" cy="12" r="2.6"/>',
  bicycle:  // xe đạp hai bánh
    '<circle cx="6" cy="16" r="3.8"/><circle cx="18" cy="16" r="3.8"/>'
    + '<path d="M6 16 9.5 9h6L18 16M9.5 9l3 7h-6.5M15.5 9l-1.2-2.5h-2.3"/>',
  guide:    // lá cờ dẫn đoàn và hai người đi sau
    '<path d="M5 21V3.5l9 3-9 3"/>'
    + '<circle cx="14.5" cy="13" r="1.8"/><path d="M12 21v-2.5a2.5 2.5 0 0 1 5 0V21"/>'
    + '<circle cx="19.5" cy="15" r="1.4"/><path d="M18 21v-1.8a1.6 1.6 0 0 1 3 0V21"/>',
  cards:    // ba lá bài xoè
    '<rect x="8" y="3.5" width="9" height="13" rx="1.4" transform="rotate(12 12.5 10)"/>'
    + '<rect x="5.5" y="5.5" width="9" height="13" rx="1.4"/>'
    + '<path d="M10 9.5l-1.5 2.5 1.5 2.5 1.5-2.5z"/>',
  wheel:    // vòng quay có kim chỉ
    '<circle cx="12" cy="13" r="8"/><path d="M12 5v16M4 13h16M6.3 7.3l11.4 11.4M17.7 7.3 6.3 18.7"/>'
    + '<path d="M10.5 2.5h3L12 5z"/>' + dot(12, 13, 1.4),
  basket:   // giỏ hàng có quai
    '<path d="M3 9.5h18l-2 10.5H5z"/><path d="M8 9.5 11 4M16 9.5 13 4"/>'
    + '<path d="M9 13v4M12 13v4M15 13v4"/>',
  handshake: // hai bàn tay bắt nhau
    '<path d="M2.5 12 6 8.5l3 1.2 3-1.7 3 1.7 3-1.2 3.5 3.5"/>'
    + '<path d="M6 8.5v5.5l4 3.5a1.4 1.4 0 0 0 2-2"/><path d="M18 8.5v5.5l-4 3.5"/><path d="M12 15.5l2 2"/>',
  apartment: // khối nhà nhiều tầng đứng một mình
    '<path d="M6 21V4h12v17"/><path d="M3.5 21h17"/>'
    + '<path d="M9 7.5h2M13 7.5h2M9 11h2M13 11h2M9 14.5h2M13 14.5h2"/><path d="M10.5 21v-3h3v3"/>',
  neighbors: // hai mái nhà sát vách
    '<path d="M2.5 12 7 7.5l4.5 4.5M12.5 12 17 7.5l4.5 4.5"/>'
    + '<path d="M4 11v9.5h6.5V11M13.5 11v9.5H20V11"/><path d="M11.5 20.5h2"/>',

  lock:
    '<rect x="5" y="10.5" width="14" height="10.5" rx="2.2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>'
    + '<path d="M12 14.5v2.5"/>',
  check: '<path d="M4.5 12.5 9.8 17.8 19.5 6.5"/>',
  root:     // gốc cây — ô Bắt Đầu
    '<path d="M12 3v11"/><path d="M12 14c-1.5 2.8-4 4.5-7.5 5M12 14c1.5 2.8 4 4.5 7.5 5M12 14v7.5"/>'
    + '<path d="M8.5 6.5 12 3l3.5 3.5"/>',
};

/** @param {string} name khoá trong ICONS (id nhánh hoặc trường `icon` của kỹ năng) */
export const skillIcon = (name, cls = '') => svg(ICONS[name] ?? ICONS.lock, cls);
