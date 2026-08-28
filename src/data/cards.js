/**
 * Bộ thẻ CƠ HỘI và KHÍ VẬN.
 *
 * Theo yêu cầu luật chơi: mỗi thẻ chỉ có hiệu ứng cộng hoặc trừ tiền
 * (`amount` > 0 là nhận từ ngân hàng, < 0 là trả cho ngân hàng).
 * Lời thoại lấy bối cảnh Sài Gòn – Gia Định xưa.
 */

export const CHANCE = [
  { text: 'Trúng thầu xây cầu Bình Lợi, công trình nghiệm thu sớm.', amount: 150 },
  { text: 'Bán lô cao su Hớn Quản đúng lúc giá lên đỉnh.', amount: 200 },
  { text: 'Tàu buôn từ Hương Cảng cập bến Nhà Rồng, hàng về đúng vụ.', amount: 120 },
  { text: 'Thắng độ ở trường đua Phú Thọ, con ngựa ô về nhất.', amount: 100 },
  { text: 'Hùn vốn hãng xe đò Lục Tỉnh, cuối năm chia lãi.', amount: 90 },
  { text: 'Cứu hoả kịp thời ở chợ Bến Thành, được Toà Đô Chánh khen thưởng.', amount: 75 },
  { text: 'Mở tiệm vàng trên đường Catinat, khách ra vào nườm nượp.', amount: 250 },
  { text: 'Bán bản quyền bài vọng cổ cho hãng dĩa hát.', amount: 130 },
  { text: 'Giá lúa Gò Công tăng vọt, ghe chài đầy khoang.', amount: 180 },
  { text: 'Toà Đô Chánh buộc sửa mặt tiền nhà cho đúng lệ phố.', amount: -100 },
  { text: 'Thuế môn bài quý này tăng, phải đóng bù.', amount: -80 },
  { text: 'Xe kéo gãy càng giữa đường Bonard, phải đền cho phu xe.', amount: -45 },
  { text: 'Đãi tiệc cưới ở nhà hàng Continental, thực đơn Tây.', amount: -160 },
  { text: 'Mưa lớn bất chợt, kho lúa Chợ Lớn bị ẩm phải phơi lại.', amount: -120 },
  { text: 'Góp tiền trùng tu Lăng Ông Bà Chiểu.', amount: -70 },
  { text: 'Bị phạt vì đậu xe trước Nhà Hát Tây giờ cấm.', amount: -50 },
];

export const CHEST = [
  { text: 'Bà con lối xóm góp tiền mừng tân gia.', amount: 100 },
  { text: 'Hội Ái Hữu Gia Định trao học bổng cho con.', amount: 80 },
  { text: 'Được hoàn lại thuế điền thổ nộp dư năm ngoái.', amount: 110 },
  { text: 'Trúng lô an ủi xổ số kiến thiết.', amount: 200 },
  { text: 'Tiền lời sổ tiết kiệm ở Ngân Hàng Đông Dương.', amount: 60 },
  { text: 'Thừa kế mảnh vườn sầu riêng ở Thủ Đức, bán được giá.', amount: 150 },
  { text: 'Bán chiếc ghe tam bản cũ cho lái buôn miệt vườn.', amount: 55 },
  { text: 'Bạn hàng Chợ Lớn biếu quà Tết hậu hĩnh.', amount: 90 },
  { text: 'Tiền công vẽ tranh sơn mài cho Dinh Thượng Thơ.', amount: 140 },
  { text: 'Nằm nhà thương Grall một tuần, viện phí tính theo ngày.', amount: -130 },
  { text: 'Đóng học phí trường Pétrus Ký cho con niên khoá mới.', amount: -100 },
  { text: 'Cúng dường trai tăng ở chùa Giác Lâm.', amount: -60 },
  { text: 'Mùa dịch, cả nhà tốn tiền thuốc thang.', amount: -90 },
  { text: 'Mái ngói nhà rường bị dột, phải gọi thợ lợp lại.', amount: -75 },
  { text: 'Tới ngày giỗ họ, đãi cả xóm một bữa tươm tất.', amount: -110 },
  { text: 'May áo dài gấm cho cả nhà ăn Tết.', amount: -85 },
];

/** Bộ bài rút không lặp lại cho tới khi hết, rồi xáo lại. */
export class Deck {
  constructor(cards, kind) {
    this.cards = cards;
    this.kind = kind; // 'chance' | 'chest'
    this.pile = [];
    this.shuffle();
  }

  shuffle() {
    this.pile = this.cards.map((_, i) => i);
    for (let i = this.pile.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.pile[i], this.pile[j]] = [this.pile[j], this.pile[i]];
    }
  }

  draw() {
    if (this.pile.length === 0) this.shuffle();
    return this.cards[this.pile.pop()];
  }
}

export const DECK_META = {
  chance: { title: 'CƠ HỘI', sigil: '✦', accent: '#C8A048' },
  chest:  { title: 'KHÍ VẬN', sigil: '⚱', accent: '#2E6B52' },
};
