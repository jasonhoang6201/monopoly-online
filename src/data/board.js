/**
 * Dữ liệu bàn cờ — dựng trên assets/board-info.json của dự án,
 * bổ sung bảng giá thuê đầy đủ (0→4 nhà + khách sạn), giá thế chấp,
 * và nhãn hiển thị cho mặt bàn cờ.
 */
import raw from '../../assets/board-info.json';

export const START_MONEY = 1500;
export const GO_SALARY = 200;
export const JAIL_FINE = 50;
export const JAIL_TILE = 10;
export const GOTO_JAIL_TILE = 30;
export const MAX_JAIL_TURNS = 3;
export const TOTAL_HOUSES = 32;
export const TOTAL_HOTELS = 12;
/** Phí chuộc lại tài sản thế chấp: 10% cho mọi trường hợp. */
export const REDEEM_INTEREST = 0.10;

/** Màu nhóm đất — pha theo bảng màu sơn mài / hoàng cung Huế. */
export const GROUPS = {
  brown:      { name: 'Bến Nghé',    hex: '#6B4A2F', size: 2 },
  light_blue: { name: 'Thanh Thuỷ',  hex: '#79B2C6', size: 3 },
  pink:       { name: 'Hồng Đào',    hex: '#C77BA0', size: 3 },
  orange:     { name: 'Son Cam',     hex: '#D98634', size: 3 },
  red:        { name: 'Sơn Mài',     hex: '#B22F26', size: 3 },
  yellow:     { name: 'Hoàng Kim',   hex: '#E0B93E', size: 3 },
  green:      { name: 'Ngọc Bích',   hex: '#2E7D50', size: 3 },
  dark_blue:  { name: 'Chàm Ngự',    hex: '#27418C', size: 2 },
};

/**
 * Bảng giá thuê chuẩn: [gốc, 1 nhà, 2 nhà, 3 nhà, 4 nhà, khách sạn].
 * Giá gốc khớp với trường `rent` trong board-info.json.
 */
const RENT_TABLE = {
  1:  [2, 10, 30, 90, 160, 250],
  3:  [4, 20, 60, 180, 320, 450],
  6:  [6, 30, 90, 270, 400, 550],
  8:  [6, 30, 90, 270, 400, 550],
  9:  [8, 40, 100, 300, 450, 600],
  11: [10, 50, 150, 450, 625, 750],
  13: [10, 50, 150, 450, 625, 750],
  14: [12, 60, 180, 500, 700, 900],
  16: [14, 70, 200, 550, 750, 950],
  18: [14, 70, 200, 550, 750, 950],
  19: [16, 80, 220, 600, 800, 1000],
  21: [18, 90, 250, 700, 875, 1050],
  23: [18, 90, 250, 700, 875, 1050],
  24: [20, 100, 300, 750, 925, 1100],
  26: [22, 110, 330, 800, 975, 1150],
  27: [22, 110, 330, 800, 975, 1150],
  29: [24, 120, 360, 850, 1025, 1200],
  31: [26, 130, 390, 900, 1100, 1275],
  32: [26, 130, 390, 900, 1100, 1275],
  34: [28, 150, 450, 1000, 1200, 1400],
  37: [35, 175, 500, 1100, 1300, 1500],
  39: [50, 200, 600, 1400, 1700, 2000],
};

/** Nhãn ngắn để vẽ lên ô cờ (tên thời Pháp thuộc — giữ đúng chất Sài Gòn xưa). */
const SHORT = {
  0:  'BẮT ĐẦU',       1:  "Quai de\nl'Arroyo",   2:  'KHÍ VẬN',
  3:  'Quai de\nMytho', 4:  'THUẾ\nTHU NHẬP',      5:  'Gare\nRoutière',
  6:  'Rue\nMac-Mahon', 7:  'CƠ HỘI',              8:  'Rue Paul\nBlanchy',
  9:  "Rue\nd'Ormay",   10: 'KHÁM LỚN',            11: 'Rue\nPellerin',
  12: 'Thuỷ Cục',       13: 'Rue La\nGrandière',   14: "Rue\nd'Espagne",
  15: 'Gare de\nMytho', 16: 'Bd de la\nSomme',     17: 'KHÍ VẬN',
  18: 'Bd\nGallieni',   19: 'Quai de\nBelgique',   20: 'BẾN ĐẬU',
  21: 'Rue\nTaberd',    22: 'CƠ HỘI',              23: 'Rue\nRichaud',
  24: 'Rue\nChasseloup', 25: 'Port de\nCommerce',  26: 'Rue\nTestard',
  27: 'Rue\nGarcerie',  28: 'Nhà Máy\nĐiện',       29: 'Bd\nNorodom',
  30: 'VÀO TÙ',         31: 'Bd\nCharner',         32: 'Bd\nBonard',
  33: 'KHÍ VẬN',        34: 'Place\nRigault',      35: 'Gare de\nSaïgon',
  36: 'CƠ HỘI',         37: 'Rue\nCatinat',        38: 'THUẾ\nXA XỈ',
  39: 'Palais du\nGouverneur',
};

/**
 * Tên hiện nay, viết đầy đủ — mặt ô tự ngắt dòng theo từ nên không viết tắt.
 */
const MODERN = {
  1: 'Bến Bình Đông', 3: 'Võ Văn Kiệt', 5: 'Chợ Lớn', 6: 'Nam Kỳ Khởi Nghĩa',
  8: 'Hai Bà Trưng', 9: 'Mạc Thị Bưởi', 10: 'Sài Gòn', 11: 'Pasteur',
  13: 'Lý Tự Trọng', 14: 'Lê Thánh Tôn', 15: 'Ga Sài Gòn – Mỹ Tho',
  16: 'Hàm Nghi', 18: 'Trần Hưng Đạo', 19: 'Bến Chương Dương',
  21: 'Nguyễn Du', 23: 'Nguyễn Đình Chiểu', 24: 'Nguyễn Thị Minh Khai',
  25: 'Bến Nhà Rồng', 26: 'Võ Văn Tần', 27: 'Phạm Ngọc Thạch',
  29: 'Lê Duẩn', 31: 'Nguyễn Huệ', 32: 'Lê Lợi',
  34: 'Công Trường Mê Linh', 35: 'Ga Sài Gòn', 37: 'Đồng Khởi',
  39: 'Dinh Độc Lập',
};

/**
 * Tên tiếng Việt dùng trong lời thông báo. Phần lớn ô lấy thẳng tên nay
 * (`MODERN`) hoặc nhãn Việt in trên ô (`SHORT`); chỉ vài ô cần gọi khác đi cho
 * xuôi tai khi đọc thành câu — "mua Bến Xe Lục Tỉnh" nghe rõ hơn "mua Chợ Lớn".
 */
const VI_NAME = {
  5:  'Bến Xe Lục Tỉnh',  10: 'Khám Lớn Sài Gòn', 12: 'Thuỷ Cục',
  20: 'Bến Đậu',          25: 'Bến Nhà Rồng',     28: 'Nhà Máy Điện',
  30: 'Vào Tù',
};

/** Ký hiệu vẽ ở ô đặc biệt. */
const GLYPH = {
  0: '➜', 2: '⚱', 4: '⚖', 5: '🚌', 7: '✦', 10: '⛓', 12: '💧',
  15: '🚂', 17: '⚱', 20: '⛩', 22: '✦', 25: '⚓', 28: '⚡', 30: '👮',
  33: '⚱', 35: '🚂', 36: '✦', 38: '💎',
};

/** Bàn cờ đã được làm giàu dữ liệu — dùng chung cho toàn game. */
export const BOARD = raw.map((t) => {
  const tile = {
    ...t,
    short: SHORT[t.id] ?? t.name,
    modern: MODERN[t.id] ?? null,
    /** Tên tiếng Việt để đọc trong thông báo. */
    vi: VI_NAME[t.id] ?? MODERN[t.id] ?? (SHORT[t.id] ?? t.name).replace(/\n/g, ' '),
    glyph: GLYPH[t.id] ?? null,
    /** Có thể sở hữu được không? */
    ownable: t.type === 'property' || t.type === 'station' || t.type === 'utility',
  };
  if (tile.ownable) {
    tile.mortgage = Math.floor(t.price / 2);
    /**
     * Giá chuộc lại = tiền thế chấp + 10% lãi.
     * Trừ epsilon trước khi làm tròn lên: trong JS `100 * 1.1` ra
     * 110.00000000000001, nếu không sẽ bị tính dư 1$.
     */
    tile.redeem = Math.ceil(tile.mortgage * (1 + REDEEM_INTEREST) - 1e-9);
  }
  if (t.type === 'property') {
    tile.rents = RENT_TABLE[t.id];
    tile.groupHex = GROUPS[t.color_group].hex;
    tile.groupName = GROUPS[t.color_group].name;
  }
  return tile;
});

/** Danh sách id đất theo từng nhóm màu. */
export const GROUP_TILES = {};
for (const key of Object.keys(GROUPS)) {
  GROUP_TILES[key] = BOARD.filter((t) => t.color_group === key).map((t) => t.id);
}

/** Tiền thuê nhà ga theo số ga đang sở hữu. */
export const STATION_RENT = [0, 25, 50, 100, 200];
/** Hệ số nhân xúc xắc cho ô tiện ích theo số ô đang sở hữu. */
export const UTILITY_MULT = [0, 4, 10];

export const tile = (id) => BOARD[id];

/** Định dạng tiền: 1500 → "1.500$" */
export function money(n) {
  const v = Math.round(Math.abs(n));
  const s = v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${n < 0 ? '−' : ''}${s}$`;
}

/**
 * Nhãn để đọc trong thông báo — **chỉ tên tiếng Việt**. Tên Pháp vẫn in trên
 * mặt bàn cờ và trên thẻ đất cho đúng chất Sài Gòn xưa, nhưng câu thông báo
 * thì gọi thẳng tên nay cho dễ theo dõi.
 */
export function tileLabel(id) {
  return BOARD[id].vi;
}

/** Nhãn ngắn cho danh sách tài sản. */
export function tileShortLabel(id) {
  const t = BOARD[id];
  return t.modern ? `${t.short.replace(/\n/g, ' ')} · ${t.modern}` : t.short.replace(/\n/g, ' ');
}
