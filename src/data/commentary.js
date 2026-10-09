/**
 * Lời bình luận viên — mỗi loại khoảnh khắc một nắm câu, rút ngẫu nhiên.
 *
 * Chỗ trống viết trong ngoặc nhọn: `{a}` người gây chuyện, `{b}` người kia,
 * `{tile}` tên ô, `{amount}` số tiền, `{n}` con số đếm (lần vào tù…), `{title}`
 * tên thẻ. Câu nói ra thành tiếng nên viết như người ta nói, không chèn ký
 * hiệu lạ: giọng đọc gặp "$" hay "×" thì đọc vấp.
 *
 * Câu nhiều hơn ở những khoảnh khắc hay gặp (trả thuê, mua đất), để mười lượt
 * liền không nghe lại một câu.
 */
export const LINES = {
  rent: [
    'Ối dồi ôi! {a} vừa dâng {amount} cho {b} ở {tile}!',
    '{a} ghé {tile}, ví nhẹ đi {amount}. {b} cười tủm tỉm.',
    'Một phong bì {amount} từ {a} bay thẳng sang nhà {b}.',
    '{b} thu tô {amount}. {a} nhìn trời một hồi lâu.',
    'Tiền thuê {amount}. {a} đi đúng chỗ không nên đi.',
  ],
  rentBig: [
    'Trời đất quỷ thần ơi! {amount}! {a} vừa đổ cả gia tài vào túi {b}!',
    'Cú đấm thép! {a} trả {amount} ở {tile}. Bàn cờ im phăng phắc.',
    '{tile} nuốt trọn {amount} của {a}. {b} chắc tối nay mở tiệc.',
    'Đau! Rất đau! {amount} tiền thuê, {a} cần một ly trà đá gấp.',
  ],
  rentRival: [
    'Oan gia ngõ hẹp! {a} lại phải nộp {amount} cho kẻ thù truyền kiếp {b}!',
    'Lại là {b}! Lần này {a} mất {amount}. Mối thù này còn dài.',
    '{a} và {b}, chuyện cũ chưa xong, chuyện mới lại tới: {amount}.',
  ],
  bankrupt: [
    '{a} đã phá sản! Một tượng đài vừa sụp đổ.',
    'Vĩnh biệt {a}. Ngân hàng xin nhận lại toàn bộ cơ nghiệp.',
    '{a} rời cuộc chơi, nhưng linh hồn vẫn còn lảng vảng quanh bàn.',
  ],
  jail: [
    '{a} vào Khám Lớn. Cơm tù hôm nay có canh chua.',
    'Còng số tám cho {a}! Mời anh chị theo chúng tôi về đồn.',
    '{a} đi tù. Bàn cờ bỗng thấy yên bình lạ thường.',
  ],
  jailAgain: [
    'Lần thứ {n} vào tù! {a} đã thành khách quen nhà đá.',
    '{a} vào tù lần thứ {n}. Quản giáo đã thuộc tên rồi.',
    'Lại là {a}, lần thứ {n}! Chắc nên làm thẻ thành viên.',
  ],
  jailDoubles: [
    'Ba lần đổ đôi! Hên quá hoá xui, {a} đi tù thẳng!',
    'Đôi, đôi, rồi lại đôi! Luật là luật, mời {a} vào khám.',
  ],
  buy: [
    '{a} tậu {tile}. Giấy đỏ cầm tay, ngủ ngon.',
    '{tile} có chủ mới: {a}.',
    '{a} xuống tiền mua {tile}. Đầu tư dài hạn đây.',
  ],
  buyFull: [
    'Đủ bộ! {a} gom trọn khu {tile}. Cả bàn bắt đầu run!',
    '{a} vừa khép lại cả một dãy phố. Tiền thuê sắp gấp đôi!',
  ],
  nearmiss: [
    'Hú hồn! {a} đứng sát {tile}, chỉ thiếu một bước là mất {amount}!',
    'Thoát rồi! {tile} ngay bên cạnh, {a} vuốt mồ hôi.',
    '{a} lách qua {tile} trong gang tấc. Thần may mắn còn thương!',
  ],
  goland: [
    'Đạp trúng ô Bắt Đầu! {a} lãnh lương thưởng, cười tươi như hoa.',
  ],
  trade: [
    '{a} và {b} bắt tay! Kèo này ai lời ai lỗ, hạ hồi phân giải.',
    'Thương vụ chốt xong giữa {a} và {b}. Chợ Lớn cũng chỉ tới vậy.',
  ],
  rival: [
    'Một mối thù vừa ra đời: {a} và {b}! Từ giờ là oan gia ngõ hẹp.',
    '{a} và {b} đã chính thức thành kẻ thù truyền kiếp. Bàn cờ nóng lên rồi!',
  ],
  event: [
    'Thời cuộc đổi thay: {title}! Cả bàn chuẩn bị tinh thần.',
    'Tin nóng: {title}. Không ai đứng ngoài chuyện này.',
  ],
  ghostVote: [
    'Hội đồng hồn ma đã quyết: {title}!',
    'Các linh hồn đã chọn {title}. Người sống, run lên đi!',
  ],
  win: [
    '{a} thắng! Một đế chế đã được dựng nên giữa Sài Gòn Gia Định.',
    'Hạ màn! {a} là tỷ phú cuối cùng đứng vững. Xin chúc mừng!',
  ],
};

/**
 * Điền chỗ trống. `vars` là chữ thuần; bên hiển thị tự in đậm tên người, bên
 * giọng đọc dùng nguyên chuỗi.
 */
export function fill(line, vars) {
  return line.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
}
