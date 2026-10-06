/**
 * Scene Phaser: vẽ bàn cờ, quân cờ, nhà cửa, xí ngầu và toàn bộ hiệu ứng.
 * Mọi phương thức animation trả về Promise để controller `await` tuần tự.
 *
 * Lưu ý toạ độ: scene làm việc bằng ĐIỂM ẢNH VẬT LÝ (đã nhân DPR),
 * còn DOM dùng điểm ảnh CSS — chỗ nào bắc cầu giữa hai bên phải quy đổi.
 */
import Phaser from 'phaser';
import {
  TEX, DEPTH, EDGE, tileCenter, tokenSpot, tileEdgePoint, tileSize, tileAngle, isCorner,
} from '../render/geometry.js';
import { paintBoard, nameBand, P } from '../render/boardArt.js';
import {
  paintToken, paintCoin, paintAura, paintGhost, auraPad, paintSkeletonToken, WALK_FRAMES,
} from '../render/pieces.js';
import { ultColors, ultColor } from '../core/skills.js';
import { makeTileFx, fxBox, FX_TILE_W } from '../render/tileFx.js';
import {
  paintHouseGlyph, paintHotelGlyph, paintEdgeGlow, paintEdgeSpill, SPILL_ROOT,
} from '../render/glyphs.js';
import {
  makeDieCanvas, drawDie, paintDieShadow, supportFactor,
  qRandom, qAxis, qMul, qNorm, qSlerp, qForValue,
} from '../render/dice3d.js';
import { BOARD, money } from '../data/board.js';
import { audio } from '../audio/audio.js';
import { DPR, px } from '../dpr.js';
import { onTheme } from '../theme/theme.js';
import {
  ledBulbs, LEDS_PER_TILE, paintBulbGlow, paintSnowflake, snowLevel,
} from '../render/xmasDeco.js';
import {
  paintHalloweenIcon, paintWebCorner, paintBatFrame, paintTombstone,
  paintHauntedHouse, paintHauntedCastle, drawSkeleton,
} from '../render/halloweenArt.js';
import { graveLayout, pumpkinSpots, pumpkinSize } from '../render/halloweenDeco.js';
import { MOVES, movePose, danceAt, STILL_AT } from '../render/dance.js';
import { batSwarm } from '../ui/batSwarm.js';

/* Người dùng xin bớt chuyển động thì ô đổi trạng thái ngay, không diễn */
/** Ảnh khung nhảy của bộ xương nghĩa địa: bề rộng, bề cao, cỡ bộ xương, chỗ bàn chân (tỉ lệ bề cao). */
const DANCE_S = 80, DANCE_W = 136, DANCE_H = 112, DANCE_FOOT = 0.94;
const REDUCED_MOTION = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/* Khoảng thở quanh bàn cờ, tính bằng điểm ảnh CSS */
const GUTTER = 12;

/**
 * Khoảng thở trên màn thấp — điện thoại nằm ngang cao chừng 400px, ở đó cạnh
 * bàn cờ bị chiều cao chặn chứ không phải bề ngang, nên mỗi điểm ảnh khoảng
 * thở nhường ra là một điểm ảnh cạnh bàn.
 */
const GUTTER_SHORT = 5;
const gutterCss = () => (window.innerHeight <= 500 ? GUTTER_SHORT : GUTTER);

/**
 * Bề ngang cột trái — đọc thẳng từ DOM để CSS là nguồn duy nhất.
 *
 * Điện thoại nằm ngang: `#sidebar` ra `position: fixed` và nổi đè lên bàn cờ,
 * nên chỗ phải chừa là bề ngang thanh hẹp `#side-strip`. Màn hình rộng thì
 * thanh hẹp `display: none` (bề ngang 0) và cột lại là `#sidebar` như cũ.
 */
function railWidthCss() {
  const strip = document.getElementById('side-strip');
  const w = strip ? strip.getBoundingClientRect().width : 0;
  if (w > 0) return w;
  const el = document.getElementById('sidebar');
  return el ? el.getBoundingClientRect().width : 292;
}

/**
 * Bề ngang cột phải — chỗ thanh nút hành động dạt ra khi điện thoại nằm ngang.
 * Màn hình rộng thì `#right-rail` rộng 0 (CSS để `display:none`), nên bàn cờ
 * vẫn ăn hết phần bên phải như cũ.
 */
function actRailWidthCss() {
  const el = document.getElementById('right-rail');
  return el ? el.getBoundingClientRect().width : 0;
}

/**
 * Xí ngầu: cạnh texture, và hệ số nới ảnh cho khối quay tự do.
 * Khối chiếm chừng 57% bề ngang khung vẽ khi một mặt ngửa thẳng lên,
 * nên ảnh phải to hơn cạnh nhìn thấy đúng chừng ấy lần.
 */
const DIE_TEX = 256;
const DIE_PAD = 1.75;

/* Màu nền hiệu ứng ô cờ (vẽ ở chế độ blend cộng nên càng sáng càng đậm) */
const HOVER_TINT = 0xC9A24A;      // rê chuột: ánh vàng ấm
/* Giáng Sinh: mặt ô gần trắng nên cộng thêm sáng chỉ làm chữ trên ô bạc đi.
   Rê chuột ở đây nhuộm nhân (MULTIPLY) một lớp xanh băng: ô tối xuống và ngả
   xanh, chữ vẫn giữ độ đậm. */
const HOVER_TINT_XMAS = 0x8FB8DC;
/* Halloween: mặt ô tím đêm, cộng thêm ánh tím hoa cà như bản gốc cộng ánh vàng */
const HOVER_TINT_SPOOKY = 0x8C5CC8;
const POS_TINT = 0xA87C28;        // quân đang đứng: màu dự phòng khi không rõ người chơi

/* Lúc bắt chọn ô: cả khung vẽ tối đi bằng nấy, chỉ mấy ô chọn được là khoét
   thủng ra. Sáng lên vài ô giữa một bàn cờ vốn đã lắm màu thì khó dò; tối phần
   còn lại đi thì chỗ sáng là chỗ duy nhất còn đọc được.
   Kiểu chỉ trỏ (`pick: false`) tối nhẹ tay hơn — hộp thoại vẫn đang che nửa
   bàn, tối quá thì phần bàn ngó qua kẽ hộp cũng không nhìn ra gì. */
const VEIL_PICK = 0.68;
const VEIL_HINT = 0.52;

/* Hạn sống của một vệt chỉ trỏ (`pick: false`) khi người gọi không nói rõ.
   Mọi vệt chỉ trỏ đều phải có hạn: nó chỉ đi kèm một hộp thoại hay một nước cờ
   vừa xảy ra, mà cả hai đều có thể bị nước sau chen ngang — không đặt hạn thì
   màn tối nằm lại trên bàn cho tới hết ván. */
const MARK_HINT_MS = 12000;

/** Tông giấy trung bình của mặt ô — mốc đo độ nổi của màu chủ đất. */
const PAPER_TINT = 0xE4D2AC;

/**
 * Độ dày nước màu chủ đất phủ lên mặt ô. Sắc càng chìm vào nền giấy thì phủ
 * càng dày, nhưng có chặn trên: dày quá thì tên đường và giá tiền in trên ô
 * chìm theo.
 */
const OWNER_WASH = (own) => Phaser.Math.Clamp(0.20 / paperContrast(own), 0.34, 0.48);

/**
 * Phần nước màu còn giữ lại trên dải tên ô. Để trắng hẳn thì ô nhìn như chưa
 * ai mua; một lớp mỏng đủ nối dải tên vào mảng màu của chủ đất mà chữ vẫn rõ.
 */
const BAND_WASH = 0.34;

/**
 * Độ sáng của vệt đèn trên mép ô theo mức xây dựng (1…4 nhà, 5 = khách sạn).
 * Nhà càng nhiều đèn càng tỏ — nhìn lướt qua bàn cờ là đọc được ngay ô nào
 * đang được đầu tư nặng tay nhất mà không cần đếm từng nóc nhà.
 */
const GLOW_BY_HOUSES = [0, 0.42, 0.54, 0.68, 0.82, 1.00];

/**
 * Tâm nhãn "THẾ CHẤP" tính từ tâm ô, theo tỉ lệ chiều cao ô: đè lên dòng giá
 * mua ở chân ô (ô đất 0.885h, bến/ga và công ty 0.9h tính từ đầu ô). Ô đã có
 * chủ thì giá mua không ai cần đọc, và mọi loại ô cùng một chỗ thì liếc qua
 * hàng ô là thấy ngay ô nào đang thế chấp.
 */
const MORT_TAG_Y = 0.39;

/**
 * Sắc chỉ dấu chủ đất: màu quân cờ nắn lại cho chịu được lớp phủ mờ.
 * Nước màu loãng bao giờ cũng bị nền giấy kéo về phía nhợt, nên phải bơm
 * độ tươi lên và ghìm độ sáng xuống thì phủ xong mới còn ra màu người chơi —
 * nếu không sáu quân sẽ thành sáu sắc phấn na ná nhau.
 */
function ownerTint(color) {
  const c = Phaser.Display.Color.ValueToColor(color);
  const { h, s, v } = Phaser.Display.Color.RGBToHSV(c.red, c.green, c.blue);
  let out = Phaser.Display.Color.HSVToRGB(h, Math.max(s, 0.55), Math.min(v, 0.78)).color;

  /* Sắc nào nằm sát tông giấy — hoàng kim — thì dìm sáng dần cho tách hẳn ra.
     Không dìm thì phủ dày cỡ nào ô cũng chỉ ra một sắc ngà ngà, trông y như ô
     chưa ai mua; dìm xuống là thành hổ phách, nhìn biết ngay của ai. */
  for (let i = 0; i < 8 && paperContrast(out) < 0.34; i++) {
    const o = Phaser.Display.Color.ValueToColor(out);
    const hsv = Phaser.Display.Color.RGBToHSV(o.red, o.green, o.blue);
    out = Phaser.Display.Color.HSVToRGB(hsv.h, hsv.s, Math.max(0.18, hsv.v - 0.07)).color;
  }
  return out;
}

/**
 * Sắc dùng cho vệt đèn trên mép ô. Vệt sáng vẽ ở chế độ blend cộng nên màu
 * trầm cộng vào gần như không thấy gì — phải kéo màu người chơi lên đủ tươi
 * và đủ sáng thì ngọn đèn mới ra đúng màu chủ đất.
 */
function glowTint(color, v = 1) {
  const c = Phaser.Display.Color.ValueToColor(color);
  const { h, s } = Phaser.Display.Color.RGBToHSV(c.red, c.green, c.blue);
  /* Trắng ngà gần như không có sắc: ép độ tươi lên 0,66 thì nó thành cam đất,
     trùng với quân cam. Giữ nó trắng. */
  const sat = s < 0.2 ? s : Phaser.Math.Clamp(s, 0.66, 0.95);
  return Phaser.Display.Color.HSVToRGB(h, sat, v).color;
}

/**
 * Độ nổi của một màu trên nền giấy ô cờ, 0…1. Màu càng gần tông giấy thì lớp
 * nhuộm càng phải dày tay, nếu không sắc nhạt như hoàng kim sẽ chìm mất.
 */
function paperContrast(color) {
  const a = Phaser.Display.Color.ValueToColor(color);
  const b = Phaser.Display.Color.ValueToColor(PAPER_TINT);
  return Math.hypot(a.red - b.red, a.green - b.green, a.blue - b.blue) / 441;
}

/** Quay thêm `ang` radian quanh một trục cố định của không gian. */
function spinBy(q, axis, ang) {
  return qNorm(qMul(qAxis(axis[0], axis[1], axis[2], ang), q));
}

/**
 * Độ phân giải texture bàn cờ — bám theo cạnh ngắn của màn hình để
 * bàn cờ luôn sắc nét kể cả khi bật toàn màn hình.
 */
function boardTextureSize() {
  const shortSide = Math.min(
    window.screen?.width ?? window.innerWidth,
    window.screen?.height ?? window.innerHeight,
  );
  const target = shortSide * DPR * 1.06;
  return Phaser.Math.Clamp(Math.ceil(target / 128) * 128, 1600, 3200);
}

export default class BoardScene extends Phaser.Scene {
  constructor() {
    super('board');
    this.tokens = [];
  }

  // ------------------------------------------------------------- khởi tạo

  create() {
    this.boardPx = boardTextureSize();
    /** Nấc gờ tuyết đang vẽ trên ảnh bàn cờ (chủ đề Giáng Sinh). */
    this.snowLevel = 0;
    this.textures.addCanvas('board', paintBoard(this.boardPx));

    /* Quân cờ vẽ dư độ phân giải để không bị rỗ khi bàn cờ lớn, nhưng chỉ vẽ
       khi biết ván này gồm những màu nào (xem `setPlayers`) — bảng có 18 sắc mà
       một ván nhiều nhất 6 người, dựng cả 18 tấm là phí bộ nhớ ảnh. */
    this.textures.addCanvas('die-shadow', paintDieShadow(128));
    this.paintHouseTextures();
    this.textures.addCanvas('bulb-glow', paintBulbGlow(64));
    this.textures.addCanvas('snowflake', paintSnowflake(24));
    this.textures.addCanvas('edge-glow', paintEdgeGlow(512, 256));
    this.textures.addCanvas('edge-spill', paintEdgeSpill(512, 512));
    this.textures.addCanvas('coin', paintCoin(96));

    this.bg = this.add.graphics().setDepth(-10);
    this.board = this.add.image(0, 0, 'board').setOrigin(0.5).setDepth(0);

    /* Ô đang rê chuột & ô quân đang đứng: tô nền sáng lên (blend cộng)
       thay vì kẻ viền — nền ô đổi màu mượt nên không cắt vụn nét vẽ bàn cờ */
    this.hoverGfx = this.add.rectangle(0, 0, 1, 1, HOVER_TINT, 1)
      .setDepth(1).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setVisible(false);
    this.tileHighlight = this.add.rectangle(0, 0, 1, 1, POS_TINT, 1)
      .setDepth(1.5).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    /* Ô đang sáng trong lúc bốc thăm — lớp riêng để không giẫm lên vệt ô quân
       đang đứng, quay xong là tắt và bàn cờ trở lại y như cũ. */
    this.spinGfx = this.add.rectangle(0, 0, 1, 1, 0xC8A048, 1)
      .setDepth(1.6).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    /* Các ô đang được phép chọn trong lúc một thẻ bắt chỉ mục tiêu ngay trên
       bàn cờ (xem `ui/tilePicker.js`). Nằm trên cả nước màu chủ đất lẫn vệt
       đèn nhà cửa (depth 2 và 3), vì lúc ấy hai thứ kia đã bị màn tối phủ mờ —
       vệt sáng phải là lớp trên cùng của mặt bàn thì mới đọc ra ngay. Vẫn dưới
       quân cờ (depth 6) để quân không bị vệt sáng nuốt mất.
       `markVeil` là màn tối khoét thủng đúng mấy ô ấy. */
    this.markVeil = null;
    this.markLayer = this.add.container(0, 0).setDepth(5.5);
    this.marked = null;
    this.markSet = null;
    this.markGuard = null;
    /* Ngăn xếp người nhận cú bấm ô. Trước đây mỗi phiên chọn ô tự cất
       `onTileClick` cũ rồi ghi đè, xong việc thì ghi trả — cách ấy chỉ đúng khi
       các phiên đóng ngược thứ tự mở. Mà `onAsk('ev-pick')` mở phiên thẳng từ
       tin mạng, chồng lên phiên đang mở tại máy, rồi phiên mở trước hết giờ
       trước: lúc ấy phiên sau ghi trả một hàm đã chết (`done` đã true) và bàn
       cờ ngừng nhận bấm tới hết ván. Xếp chồng ở đây thì gỡ ai ra cũng được. */
    this.clickStack = [];
    this.baseTileClick = null;
    /* Phiên cho bấm vào xí ngầu (xem `armDicePick`), null nếu không có */
    this.dicePick = null;
    this.overlay = this.add.container(0, 0).setDepth(2);
    /* Vệt đèn báo ô đã có nhà — nằm trên nước màu chủ đất, dưới quân cờ */
    this.glowLayer = this.add.container(0, 0).setDepth(3);
    /* Hào quang tối thượng và bóng mờ khi đi nằm ngay dưới lớp quân: vầng
       sáng không bao giờ che thân quân nào, kể cả quân đứng chung ô. */
    this.auraLayer = this.add.container(0, 0).setDepth(5.9);
    /** Mỗi ghế: `{img, key}` hoặc null. @type {Array<?{img:Phaser.GameObjects.Image, key:string}>} */
    this.auras = [];
    /** Mỗi ghế: màu hào quang (`ultColor`) hoặc null — bóng mờ khi đi lấy màu ở đây. */
    this.auraColor = [];
    this.events.on('update', (time) => this.tickAuras(time));
    this.tokenLayer = this.add.container(0, 0).setDepth(6);
    this.fxLayer = this.add.container(0, 0).setDepth(20);
    /* Hoạt cảnh ô đất (`render/tileFx.js`): phần mặt ô (vết nứt, vết sém, ô
       rung) nằm trên nước màu chủ đất nhưng dưới vệt đèn và quân cờ; phần nổi
       (búa, biển, lửa) nằm chung `fxLayer`, trên quân cờ. */
    this.fxUnder = this.add.container(0, 0).setDepth(2.5);
    this.fxRuns = new Map();
    this.fxSeq = 0;
    /* Hoạt cảnh đang chạy được quyền giữ vệt đèn nhà và lớp thế chấp của ô ấy
       ở một độ hiện riêng — `refresh` dựng lại lớp phủ bất cứ lúc nào, nên độ
       hiện phải nằm ở đây chứ không nằm trên đối tượng vừa bị huỷ. */
    this.glowVis = new Map();
    this.mortVis = new Map();
    this.mortParts = new Map();
    this.fxView = null;
    this.fxState = null;
    this.events.on(Phaser.Scenes.Events.UPDATE, (_t, delta) => this.stepTileFx(delta / 1000));

    /* Một nhịp thở duy nhất cho mọi vệt đèn: đèn hơi tỏ hơi mờ như ánh nến,
       rẻ hơn hẳn việc mỗi ô nuôi một tween riêng. */
    this.glowFx = [];
    this.glowBeat = { t: 0 };
    this.tweens.add({
      targets: this.glowBeat, t: 1,
      duration: 1900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      onUpdate: () => {
        const k = 0.80 + this.glowBeat.t * 0.28;
        for (const f of this.glowFx) {
          f.img.setAlpha(Math.min(1, f.base * (f.beat === false ? 1 : k) * (this.glowVis.get(f.id) ?? 1)));
        }
      },
    });

    /* Xí ngầu 3D: mỗi con một khung vẽ riêng, dựng lại từng khung hình lúc lăn */
    this.diceQ = [qRandom(), qRandom()];
    this.diceTex = [0, 1].map((i) => {
      const tex = this.textures.addCanvas(`die3d-${i}`, makeDieCanvas(DIE_TEX));
      drawDie(tex.getSourceImage(), this.diceQ[i]);
      tex.refresh();
      return tex;
    });
    this.diceShadow = [0, 1].map(() => this.add.image(0, 0, 'die-shadow')
      .setDepth(29).setVisible(false));
    this.dice = [0, 1].map((i) => this.add.image(0, 0, `die3d-${i}`)
      .setDepth(30).setVisible(false));
    this.diceHome = [{ x: 0, y: 0 }, { x: 0, y: 0 }];

    /* Chủ đề Giáng Sinh: tuyết rơi (depth 0.5 — ngay trên mặt bàn, dưới mọi
       thứ khác). Dây đèn LED vẽ sẵn trên ảnh bàn cờ, bóng nào cũng tắt; ô có
       nhà mới bật bóng, xem `addTileGlow`. Rỗng khi chơi chủ đề mặc định. */
    this.snowLayer = this.add.container(0, 0).setDepth(0.5);
    this.flakes = [];
    this.events.on(Phaser.Scenes.Events.UPDATE, (time, delta) => this.tickXmas(time, delta / 1000));

    /* Chủ đề Halloween: nghĩa địa giữa bàn có hàng bộ xương nhảy, dơi bay, sương trôi,
       trăng đổi đỏ lúc Trăng Máu (depth 0.5, cùng chỗ tuyết rơi). Bia mộ người
       phá sản mọc ở mép trong ô họ ngã xuống — depth 5.8, ngay dưới quân cờ.
       Rỗng ở chủ đề khác. */
    this.graveLayer = this.add.container(0, 0).setDepth(0.5);
    this.tombLayer = this.add.container(0, 0).setDepth(5.8);
    this.walkers = [];
    this.bats = [];
    this.fogs = [];
    this.moonRed = null;
    this.walkKey = '';
    /** Bia mộ đang dựng: khoá `ghế:ô` → ảnh. */
    this.tombs = new Map();
    this.tombState = null;
    this.events.on(Phaser.Scenes.Events.UPDATE, (time, delta) => this.tickSpooky(time, delta / 1000));
    onTheme(() => this.retheme());

    this.setupTileInput();
    this.layout();
    // Đổi cỡ cửa sổ hay bật toàn màn hình đều phải dựng lại bố cục
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.relayout());
    this.game.events.emit('scene-ready', this);
  }

  /** Đang chơi chủ đề Giáng Sinh — đọc từ bảng màu bàn cờ, `theme.js` giữ nó đúng. */
  get xmas() { return P.theme === 'christmas'; }

  /** Đang chơi chủ đề Halloween. */
  get spooky() { return P.theme === 'halloween'; }

  /** Hình nhà và khách sạn của bảng nhà bật lên khi rê chuột, theo chủ đề. */
  paintHouseTextures() {
    for (const key of ['house', 'hotel']) if (this.textures.exists(key)) this.textures.remove(key);
    if (this.spooky) {
      this.textures.addCanvas('house', paintHauntedHouse(192));
      this.textures.addCanvas('hotel', paintHauntedCastle(192));
      return;
    }
    this.textures.addCanvas('house', paintHouseGlyph(192, this.xmas));
    this.textures.addCanvas('hotel', paintHotelGlyph(192, this.xmas));
  }

  /**
   * Sắc chủ đất phủ lên mặt ô. Mặt ô Halloween tối, nên thay vì dìm màu người
   * chơi cho tách khỏi nền giấy (`ownerTint`) thì kéo nó lên tươi và sáng,
   * phủ một lớp cố định.
   */
  ownTint(color) { return this.spooky ? glowTint(color, 0.86) : ownerTint(color); }
  washOf(own) { return this.spooky ? 0.36 : OWNER_WASH(own); }

  /**
   * Đổi chủ đề: vẽ lại mọi texture có màu theo chủ đề (bàn cờ, nhà, xí ngầu,
   * quân cờ) rồi dựng lại bố cục. Chỉ xảy ra ngoài ván hoặc lúc vừa vào ván —
   * xem `theme/theme.js` — nên vẽ lại cả bàn một lần là chấp nhận được.
   */
  retheme() {
    this.snowLevel = this.state && this.xmas ? snowLevel(this.state.laps ?? 0, this.state.players.length) : 0;
    this.repaintBoard();
    this.paintHouseTextures();
    // Bia mộ và bộ xương vẽ theo chủ đề — dựng lại từ đầu
    this.clearTombs();
    this.walkKey = '';
    this.diceTex.forEach((tex, i) => { drawDie(tex.getSourceImage(), this.diceQ[i]); tex.refresh(); });
    this.hideHousePlaque();
    if (this.players) this.setPlayers(this.players);
    this.layout();
  }

  /** Vẽ lại ảnh bàn cờ ở độ phân giải hiện tại, theo chủ đề và nấc tuyết hiện tại. */
  repaintBoard() {
    if (this.textures.exists('board')) this.textures.remove('board');
    this.textures.addCanvas('board', paintBoard(this.boardPx, { snowLevel: this.snowLevel }));
    this.board.setTexture('board');
    // Bản xám dựng theo ảnh cũ — bỏ đi, lần sau cần sẽ dựng lại
    if (this.textures.exists('board-gray')) this.textures.remove('board-gray');
  }

  /**
   * Dựng lại hạt tuyết theo bố cục hiện tại. Gọi từ `layout()`; chủ đề mặc
   * định thì dọn sạch lớp tuyết.
   */
  layoutXmas() {
    this.snowLayer.removeAll(true);
    this.flakes = [];
    if (!this.xmas) return;

    /* Tuyết rơi trên mặt bàn: thưa và chậm, chỉ để có không khí. Người dùng
       xin bớt chuyển động thì không có. */
    if (REDUCED_MOTION()) return;
    const W = this.scale.width, H = this.scale.height;
    const n = Math.round(Math.min(90, (W * H) / (px(1) * px(1)) / 14000));
    for (let i = 0; i < n; i++) {
      const img = this.add.image(Math.random() * W, Math.random() * H, 'snowflake');
      const k = 0.4 + Math.random() * 0.6;          // gần to và nhanh, xa nhỏ và chậm
      img.setDisplaySize(px(3 + 5 * k), px(3 + 5 * k)).setAlpha(0.45 + 0.4 * k);
      this.snowLayer.add(img);
      this.flakes.push({ img, k, ph: Math.random() * Math.PI * 2 });
    }
  }

  /** Mỗi khung hình: tuyết rơi. */
  tickXmas(time, dt) {
    if (this.flakes.length) {
      const W = this.scale.width, H = this.scale.height;
      const fall = px(26), drift = px(10);
      for (const f of this.flakes) {
        f.ph += dt * (0.6 + f.k);
        f.img.y += fall * (0.5 + f.k) * dt;
        f.img.x += Math.sin(f.ph) * drift * dt;
        if (f.img.y > H + 8) { f.img.y = -8; f.img.x = Math.random() * W; }
      }
    }
  }

  // ---------------------------------------------------------------- layout

  /**
   * Dựng lại bàn cờ sau khi khung vẽ đổi cỡ: nếu khoảng trống mới đòi hỏi
   * nhiều điểm ảnh hơn texture đang có (thường là lúc vào toàn màn hình)
   * thì vẽ lại mặt bàn ở độ phân giải cao hơn cho khỏi rỗ.
   */
  relayout() {
    this.layout();
    const need = Math.min(3200, Math.ceil((this.size * 1.06) / 128) * 128);
    if (need > this.boardPx) {
      this.boardPx = need;
      this.repaintBoard();
      this.layout();
    }
  }

  /**
   * Bàn cờ ăn hết khoảng trống giữa hai cột — cạnh của nó chỉ bị giới hạn
   * bởi chiều cao màn hình hoặc bề ngang còn lại sau khi trừ hai cột.
   */
  layout() {
    const W = this.scale.width, H = this.scale.height;
    const railW = px(railWidthCss());
    const actW = px(actRailWidthCss());
    const g = px(gutterCss());
    const availW = Math.max(px(240), W - railW - actW - g * 2);
    const availH = Math.max(px(240), H - g * 2);
    this.size = Math.max(px(300), Math.min(availW, availH));
    this.scaleF = this.size / TEX;
    this.originX = railW + g + (availW - this.size) / 2;
    this.originY = g + (availH - this.size) / 2;

    this.board.setPosition(this.originX + this.size / 2, this.originY + this.size / 2);
    this.board.setDisplaySize(this.size, this.size);

    // Phông nền cùng tông sơn mài với bàn cờ, hai vầng sáng ấm hắt từ giữa ra.
    // Giáng Sinh: trời đêm xanh đậm, vầng sáng xanh lạnh quanh bàn cờ.
    this.bg.clear();
    const c = this.boardCenter();
    if (this.xmas) {
      this.bg.fillStyle(0x0A1628, 1).fillRect(0, 0, W, H);
      this.bg.fillStyle(0x15305A, 0.6).fillCircle(c.x, c.y, this.size * 0.78);
      this.bg.fillStyle(0x3D6FA3, 0.16).fillCircle(c.x, c.y, this.size * 0.55);
    } else if (this.spooky) {
      this.bg.fillStyle(0x0E0A16, 1).fillRect(0, 0, W, H);
      this.bg.fillStyle(0x2C1A47, 0.6).fillCircle(c.x, c.y, this.size * 0.78);
      this.bg.fillStyle(0x6B3FA0, 0.14).fillCircle(c.x, c.y, this.size * 0.55);
    } else {
      this.bg.fillStyle(0x150a06, 1).fillRect(0, 0, W, H);
      this.bg.fillStyle(0x30150f, 0.6).fillCircle(c.x, c.y, this.size * 0.78);
      this.bg.fillStyle(0x7c1e14, 0.18).fillCircle(c.x, c.y, this.size * 0.55);
    }
    this.layoutXmas();
    this.layoutSpooky();

    this.dieSize = this.size * 0.086;
    this.dice.forEach((d, i) => {
      this.diceHome[i] = {
        x: c.x + (i === 0 ? -this.dieSize * 0.78 : this.dieSize * 0.78),
        y: this.originY + this.size * 0.735,
      };
      d.setDisplaySize(this.dieSize * DIE_PAD, this.dieSize * DIE_PAD);
      d.setPosition(this.diceHome[i].x, this.diceHome[i].y);
      this.diceShadow[i]
        .setDisplaySize(this.dieSize * 1.55, this.dieSize * 1.55)
        .setPosition(this.diceHome[i].x, this.diceHome[i].y + this.dieSize * 0.34)
        .setAlpha(0.34)
        .setVisible(d.visible);
    });

    this.syncBoardHud();
    // Hoạt cảnh dựng theo toạ độ cũ — đổi cỡ bàn thì bỏ, ô về đúng trạng thái
    this.stopAllTileFx();
    if (this.state) this.refresh(this.state);
    this.placeTokens();
    if (this.highlightedTile != null) this.highlightTile(this.highlightedTile, this.highlightColor);
    if (this.marked) this.markTiles(this.marked.ids, this.marked);
    if (this.hoverTile != null) this.coverTile(this.hoverGfx, this.hoverTile);
  }

  /**
   * Dán lớp phủ HTML trùng khít ô vuông bàn cờ.
   * Nhờ vậy thanh nút hành động và bảng thông báo neo theo % cạnh bàn cờ,
   * tự chạy theo bàn khi đổi cỡ cửa sổ hay bật toàn màn hình.
   */
  syncBoardHud() {
    const el = document.getElementById('board-hud');
    if (!el) return;
    // Scene tính bằng điểm ảnh vật lý, DOM dùng điểm ảnh CSS
    el.style.left = `${this.originX / DPR}px`;
    el.style.top = `${this.originY / DPR}px`;
    el.style.width = `${this.size / DPR}px`;
    el.style.height = `${this.size / DPR}px`;
  }

  toScreen(pxx, pyy) {
    return { x: this.originX + pxx * this.scaleF, y: this.originY + pyy * this.scaleF };
  }

  boardCenter() {
    return { x: this.originX + this.size / 2, y: this.originY + this.size / 2 };
  }

  // -------------------------------------------------------- bấm chọn ô cờ

  /** Ô cờ nằm dưới điểm (toạ độ khung vẽ), hoặc null nếu ở ngoài vành. */
  tileAt(sx, sy) {
    const bx = (sx - this.originX) / this.scaleF;
    const by = (sy - this.originY) / this.scaleF;
    if (bx < 0 || by < 0 || bx > TEX || by > TEX) return null;

    const d = DEPTH(TEX), e = EDGE(TEX);
    const L = bx <= d, R = bx >= TEX - d, T = by <= d, B = by >= TEX - d;
    if (!L && !R && !T && !B) return null;          // lòng bàn cờ

    if (R && B) return 0;
    if (L && B) return 10;
    if (L && T) return 20;
    if (R && T) return 30;

    const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
    if (B) return clamp(Math.floor((TEX - d - bx) / e) + 1, 1, 9);
    if (L) return clamp(Math.floor((TEX - d - by) / e) + 11, 11, 19);
    if (T) return clamp(Math.floor((bx - d) / e) + 21, 21, 29);
    return clamp(Math.floor((by - d) / e) + 31, 31, 39);
  }

  setupTileInput() {
    const setHover = (id) => {
      if (id === this.hoverTile) return;
      this.hoverTile = id;
      this.drawHover(id);
      this.showHousePlaque(id);
      this.input.setDefaultCursor(id == null ? 'default'
        : this.markSet && !this.markSet.has(id) ? 'not-allowed' : 'pointer');
      // Bảng xem nhanh bên cột trái bám theo ô đang rê chuột
      this.onTileHover?.(id);
    };

    this.input.on('pointermove', (p) => {
      setHover(this.tileAt(p.x, p.y));
      // Xí ngầu nằm giữa lòng bàn, không đè lên ô nào, nên con trỏ tính riêng
      if (this.dicePick && this.hoverTile == null) {
        this.input.setDefaultCursor(this.dieAt(p.x, p.y) == null ? 'default' : 'pointer');
      }
    });
    // Chuột đi khỏi khung vẽ (sang cột điều khiển hay ra ngoài cửa sổ)
    // thì không còn nhận pointermove nữa — phải tự tắt nền ô đang sáng
    this.input.on(Phaser.Input.Events.GAME_OUT, () => setHover(null));

    this.input.on('pointerdown', (p) => {
      const die = this.dicePick ? this.dieAt(p.x, p.y) : null;
      if (die != null) { this.dicePick.fn(die); return; }
      const id = this.tileAt(p.x, p.y);
      if (id != null) this.onTileClick?.(id);
    });
  }

  /**
   * Đặt người nhận cú bấm ô lúc không có phiên chọn nào, và bỏ mọi phiên còn
   * treo lại. Controller gọi ở đầu mỗi ván: ván trước có thể tàn lúc một phiên
   * chọn đang mở, phiên ấy không bao giờ gọi `popTileClick` nữa.
   *
   * @param {(id:number)=>void} fn
   */
  setBaseTileClick(fn) {
    this.clickStack.length = 0;
    this.baseTileClick = fn;
    this.onTileClick = fn;
  }

  /**
   * Giao cú bấm ô cho một phiên chọn.
   *
   * @param {(id:number)=>void} fn
   * @returns {(id:number)=>void} chính `fn` — cầm lấy mà trả ở `popTileClick`
   */
  pushTileClick(fn) {
    this.clickStack.push(fn);
    this.onTileClick = fn;
    return fn;
  }

  /**
   * Phiên chọn trả lại cú bấm ô.
   *
   * Gỡ đúng `fn` khỏi ngăn xếp rồi trao cho phiên còn lại trên cùng; hết phiên
   * thì về `baseTileClick` (controller đặt: bấm ô là mở bảng xem ô). Gỡ một
   * phiên nằm giữa cũng không đụng tới phiên đang cầm.
   */
  popTileClick(fn) {
    const i = this.clickStack.lastIndexOf(fn);
    if (i >= 0) this.clickStack.splice(i, 1);
    this.onTileClick = this.clickStack[this.clickStack.length - 1] ?? this.baseTileClick;
  }

  drawHover(id) {
    this.tweens.killTweensOf(this.hoverGfx);
    if (id == null) {
      // Rời ô: nền tắt dần thay vì biến mất đột ngột
      this.tweens.add({
        targets: this.hoverGfx, alpha: 0, duration: 130, ease: 'Sine.easeOut',
        onComplete: () => this.hoverGfx.setVisible(false),
      });
      return;
    }
    // Sang ô mới thì nền loé lại từ mức thấp, nhìn ra được nhịp chuyển ô
    const from = this.hoverGfx.visible ? Math.min(this.hoverGfx.alpha, 0.14) : 0;
    this.coverTile(this.hoverGfx, id);
    this.hoverGfx
      .setFillStyle(this.xmas ? HOVER_TINT_XMAS : this.spooky ? HOVER_TINT_SPOOKY : HOVER_TINT, 1)
      .setBlendMode(this.xmas ? Phaser.BlendModes.MULTIPLY : Phaser.BlendModes.ADD)
      .setVisible(true);
    this.tweens.add({
      targets: this.hoverGfx,
      alpha: { from, to: this.xmas ? 0.62 : 0.34 },
      duration: 170, ease: 'Sine.easeOut',
    });
  }

  /** Trải một hình chữ nhật trùng khít lên ô, có tính tới việc ô góc không xoay. */
  coverTile(rect, id) {
    const c = tileCenter(id, TEX);
    const { w, h } = tileSize(id, TEX);
    const sc = this.toScreen(c.x, c.y);
    rect.setPosition(sc.x, sc.y);
    rect.setSize(w * this.scaleF, h * this.scaleF);
    rect.setRotation(isCorner(id) ? 0 : tileAngle(id));
  }

  /**
   * Bốn góc của ô, tính sẵn ra toạ độ màn hình.
   *
   * `coverTile` xoay được cả hình chữ nhật nên không cần tới toạ độ góc, nhưng
   * hình vẽ mặt nạ (`Graphics.fillPoints`) thì phải nhận từng điểm một.
   *
   * @param {number} id
   * @param {number} [pad] nới thêm mỗi cạnh bấy nhiêu điểm ảnh — dùng để lỗ
   *   khoét trên màn tối trùm hết đường viền ô, không để lại vệt tối ở mép.
   */
  tileQuad(id, pad = 0) {
    const c = tileCenter(id, TEX);
    const { w, h } = tileSize(id, TEX);
    const sc = this.toScreen(c.x, c.y);
    const a = isCorner(id) ? 0 : tileAngle(id);
    const hw = (w * this.scaleF) / 2 + pad;
    const hh = (h * this.scaleF) / 2 + pad;
    const cos = Math.cos(a), sin = Math.sin(a);
    return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]
      .map(([x, y]) => ({ x: sc.x + x * cos - y * sin, y: sc.y + x * sin + y * cos }));
  }

  // ----------------------------------------------------------- quân cờ

  setPlayers(players) {
    this.players = players;
    this.tokenLayer.removeAll(true);
    this.auraLayer.removeAll(true);
    this.auras = [];
    this.auraColor = [];
    this.tokens = players.map((p) => {
      // Quân đội mũ theo chủ đề, nên chủ đề nằm trong tên texture
      const key = `tok-${P.theme}-${p.token.key}`;
      if (!this.textures.exists(key)) this.textures.addCanvas(key, paintToken(p.token.css, 288));
      // Bộ xương có thêm mấy khung bước đi cho `moveToken`
      if (this.spooky) {
        for (let k = 0; k < WALK_FRAMES; k++) {
          if (!this.textures.exists(`${key}-w${k}`)) {
            this.textures.addCanvas(`${key}-w${k}`, paintSkeletonToken(p.token.css, 288, { frame: k }));
          }
        }
      }
      const spr = this.add.image(0, 0, key).setOrigin(0.5, 0.86);
      this.tokenLayer.add(spr);
      return spr;
    });
    this.placeTokens();
  }

  /**
   * Bàn đông (5–6 người) thì quân nhỏ lại để sáu quân cùng đứng vừa một ô.
   *
   * Ô thường rộng đúng `size/12`, mà lưới đứng dàn 3 cột cách nhau `0.33` bề
   * ngang ô — nên hàng ba quân chỉ nằm gọn trong ô khi thân quân không quá
   * `1 − 2×0.33 ≈ 0.34` bề ngang ô, tức `0.34/12 ≈ 0.028` cạnh bàn cờ. Lấy
   * 0.030 cho quân còn đủ to để nhận ra màu, mép ngoài cùng thò ra chưa tới
   * hai điểm ảnh. Ô góc rộng gấp rưỡi nên không phải lo.
   */
  tokenSize() {
    return this.size * ((this.players?.length ?? 0) > 4 ? 0.030 : 0.055);
  }

  placeTokens() {
    if (!this.players) return;
    this.players.forEach((p, i) => {
      const spr = this.tokens[i];
      if (!spr) return;
      spr.setVisible(!p.bankrupt);
      const s = this.tokenSize();
      spr.setDisplaySize(s, s * 1.12);
      const spot = tokenSpot(p.pos, i, TEX);
      const sc = this.toScreen(spot.x, spot.y);
      spr.setPosition(sc.x, sc.y);
      spr.setDepth(6 + p.pos * 0.01 + i * 0.001);
    });
  }

  tokenTarget(playerIndex, pos) {
    const spot = tokenSpot(pos, playerIndex, TEX);
    return this.toScreen(spot.x, spot.y);
  }

  /**
   * Chỗ đứng của quân cờ trên màn hình, đổi sẵn sang điểm ảnh CSS.
   *
   * Scene tính bằng điểm ảnh khung vẽ (đã nhân DPR), còn lớp phủ HTML đặt theo
   * điểm ảnh CSS — bong bóng meme (`ui/memes.js`) neo theo quân nên phải hỏi
   * qua đây, đừng đọc thẳng `spr.x`. `top` là đỉnh đầu quân: gốc của sprite đặt
   * ở (0.5, 0.86) nên `spr.y` là chỗ chân đứng, không phải giữa thân.
   *
   * @returns {?{x:number,y:number,top:number,board:number}}
   */
  tokenScreenPos(seat) {
    const spr = this.tokens?.[seat];
    if (!spr || !spr.visible) return null;
    return {
      x: spr.x / DPR,
      y: spr.y / DPR,
      top: (spr.y - spr.displayHeight * spr.originY) / DPR,
      board: this.size / DPR,
    };
  }

  /**
   * Quân nhảy từng ô một tới đích, mỗi ô `STEP_MS`. Trước đây 190ms một ô: một
   * bước lắc trung bình 7 ô mất 1,3 giây, cộng thêm thẻ di chuyển và Tàu Tốc
   * Hành thì cả bàn ngồi nhìn quân đi. 120ms còn chừng 0,85 giây mà vẫn đếm
   * được từng ô qua tiếng gõ.
   */
  moveToken(playerIndex, fromPos, steps, onPass) {
    const STEP_MS = 120;
    const HALF = STEP_MS / 2;
    const spr = this.tokens[playerIndex];
    if (!spr || steps === 0) return Promise.resolve();
    const dir = Math.sign(steps);
    const n = Math.abs(steps);
    /* Halloween: quân là bộ xương đi bộ — không nhảy, chỉ nhún nhẹ theo bước
       chân, mỗi ô hai khung hình bước. Ô kế nằm bên trái thì quay mặt sang trái. */
    const walk = this.spooky && this.textures.exists(`${spr.texture.key.replace(/-w\d$/, '')}-w0`);
    const standKey = spr.texture.key.replace(/-w\d$/, '');
    const hop = this.size * (walk ? 0.008 : 0.038);
    const stopTrail = this.trail(playerIndex);

    return new Promise((resolve) => {
      let i = 0;
      const step = () => {
        if (i >= n) {
          if (walk) spr.setTexture(standKey);
          stopTrail(); resolve(); return;
        }
        i++;
        const pos = ((fromPos + dir * i) % 40 + 40) % 40;
        const t = this.tokenTarget(playerIndex, pos);
        spr.setDepth(9);
        this.tweens.add({
          targets: spr,
          x: t.x,
          duration: STEP_MS,
          ease: walk ? 'Linear' : 'Sine.easeInOut',
          onStart: () => {
            // Mỗi nhịp nhảy một tiếng gõ gỗ — nghe rõ quân đang đếm mấy ô
            audio.sfx('step', { i });
            if (walk) {
              if (Math.abs(t.x - spr.x) > 1) spr.setFlipX(t.x < spr.x);
              spr.setTexture(`${standKey}-w${(i * 2) % WALK_FRAMES}`);
              this.time.delayedCall(HALF, () => {
                if (i <= n) spr.setTexture(`${standKey}-w${(i * 2 + 1) % WALK_FRAMES}`);
              });
            }
            this.tweens.add({
              targets: spr, y: t.y - hop, duration: HALF, ease: 'Quad.easeOut',
              onComplete: () => {
                this.tweens.add({ targets: spr, y: t.y, duration: HALF, ease: 'Quad.easeIn' });
              },
            });
            if (!walk) {
              this.tweens.add({
                targets: spr,
                scaleX: spr.scaleX * 1.08, scaleY: spr.scaleY * 1.08,
                duration: HALF, yoyo: true, ease: 'Sine.easeOut',
              });
            }
          },
          onComplete: () => {
            // Halloween: qua ô Bắt Đầu thì đàn dơi vụt ra khắp màn hình
            if (this.spooky && dir > 0 && pos === 0) this.batsFromGo();
            if (onPass) onPass(pos, i === n);
            step();
          },
        });
      };
      step();
    });
  }

  jumpToken(playerIndex, pos) {
    const spr = this.tokens[playerIndex];
    if (!spr) return Promise.resolve();
    const t = this.tokenTarget(playerIndex, pos);
    const stopTrail = this.trail(playerIndex);
    return new Promise((resolve) => {
      this.tweens.add({
        targets: spr, x: t.x, y: t.y, duration: 520, ease: 'Cubic.easeInOut',
        onComplete: () => { stopTrail(); resolve(); },
      });
      this.tweens.add({
        targets: spr, angle: { from: 0, to: 720 }, duration: 520, ease: 'Cubic.easeInOut',
        onComplete: () => spr.setAngle(0),
      });
    });
  }

  // ---------------------------------------------------- hào quang tối thượng

  /**
   * Dựng lại vầng sáng của từng quân theo các nhánh đã học tối thượng. Gọi mỗi
   * lần `refresh` — máy ngồi xem dựng lại từ ảnh chụp nên cũng thấy hào quang
   * ngay khi người kia học xong. Màu không đổi thì giữ nguyên tấm cũ.
   */
  syncAuras(state) {
    state.players.forEach((p, i) => {
      // `key` giữ danh sách màu nhánh để biết khi nào phải dựng lại; màu vẽ lên là `ultColor`
      const key = ultColors(p).join(',');
      const color = ultColor(p);
      this.auraColor[i] = color;
      const cur = this.auras[i];
      if ((cur?.key ?? '') === key) return;
      cur?.img.destroy();
      this.auras[i] = null;
      const spr = this.tokens?.[i];
      if (!color || !spr) return;
      // Vầng sáng lấy dáng từ texture quân nên mỗi cặp (quân, màu) một tấm
      const tex = `aura-${spr.texture.key}-${color}`;
      const src = spr.texture.getSourceImage();
      const pad = auraPad(src.width);
      if (!this.textures.exists(tex)) this.textures.addCanvas(tex, paintAura(src, color).cv);
      // Canvas vầng sáng rộng hơn quân `pad` mỗi phía: dời gốc cho điểm neo
      // của quân (chân quân) trùng đúng điểm neo tương ứng trên vầng sáng
      const img = this.add.image(0, 0, tex).setAlpha(0).setOrigin(
        (spr.originX * src.width + pad) / (src.width + pad * 2),
        (spr.originY * src.height + pad) / (src.height + pad * 2),
      );
      this.auraLayer.add(img);
      this.auras[i] = {
        img, key,
        kx: (src.width + pad * 2) / src.width,
        ky: (src.height + pad * 2) / src.height,
      };
    });
  }

  /**
   * Mỗi khung hình: vầng sáng bám theo quân (cả lúc đang nhảy, nảy, xoay),
   * cùng cỡ và góc với quân, thở nhẹ theo nhịp sin.
   */
  tickAuras(time) {
    this.auras.forEach((a, i) => {
      if (!a) return;
      const spr = this.tokens[i];
      if (!spr?.visible) { a.img.setVisible(false); return; }
      a.img.setVisible(true)
        .setPosition(spr.x, spr.y)
        .setDisplaySize(spr.displayWidth * a.kx, spr.displayHeight * a.ky)
        .setAngle(spr.angle)
        .setAlpha(0.72 + 0.2 * Math.sin(time * 0.0028 + i * 1.7));
    });
  }

  /**
   * Bóng mờ khi quân của người có tối thượng di chuyển: mỗi khung hình ghi lại
   * vị trí, góc, cỡ của quân; bóng thứ k đặt ở chỗ quân đã đứng `(k+1)·GAP` ms
   * trước (nội suy giữa hai khung hình). `GAP` xấp xỉ một khung hình nên các
   * bóng đè lên nhau thành một vệt liền; 7 bóng × 18ms, đuôi chừng nửa ô.
   * Độ đậm giảm nhanh dần: sát quân đặc, đuôi tắt nhanh — giảm đều thì cả vệt
   * một màu, nhìn chói. Mỗi bóng là chính hình quân phủ màu hào quang.
   *
   * Quân dừng thì vẫn ghi tiếp: các bóng đuổi kịp về đúng chỗ quân đứng (bị
   * thân quân che) rồi mới gỡ bỏ, không tắt cái rụp giữa đường.
   * @returns {()=>void} gọi khi quân đã tới nơi để bắt đầu thu bóng
   */
  trail(playerIndex) {
    const color = this.auraColor[playerIndex];
    const spr = this.tokens[playerIndex];
    if (!color || !spr) return () => {};
    const N = 7;
    const GAP = 18;            // ms giữa hai bóng liền nhau; quân đi một ô mất ~190ms
    const src = spr.texture.getSourceImage();
    const tex = `ghost-${spr.texture.key}-${color}`;
    if (!this.textures.exists(tex)) this.textures.addCanvas(tex, paintGhost(src, color));
    const ghosts = Array.from({ length: N }, () => {
      const g = this.add.image(spr.x, spr.y, tex)
        .setOrigin(spr.originX, spr.originY).setVisible(false);
      this.auraLayer.add(g);
      return g;
    });
    /** Các lần ghi, cũ trước mới sau. */
    const hist = [];
    /** Quân ở đâu vào thời điểm `t`; trước lần ghi đầu tiên thì chưa có bóng. */
    const at = (t) => {
      for (let i = hist.length - 1; i > 0; i--) {
        const a = hist[i - 1], b = hist[i];
        if (a.t > t) continue;
        const f = b.t === a.t ? 1 : (t - a.t) / (b.t - a.t);
        return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, a: a.a + (b.a - a.a) * f,
          w: a.w + (b.w - a.w) * f, h: a.h + (b.h - a.h) * f };
      }
      return null;
    };
    let stopping = false;
    let stopAt = 0;
    const tick = (time) => {
      hist.push({ t: time, x: spr.x, y: spr.y, a: spr.angle, w: spr.displayWidth, h: spr.displayHeight });
      while (hist.length > 2 && hist[1].t < time - N * GAP) hist.shift();
      ghosts.forEach((g, k) => {
        const h = at(time - (k + 1) * GAP);
        if (!h) { g.setVisible(false); return; }
        g.setVisible(true).setPosition(h.x, h.y).setAngle(h.a).setDisplaySize(h.w, h.h)
          .setAlpha(0.75 * (1 - k / N) ** 1.5);
      });
      if (stopping && !stopAt) stopAt = time;
      if (stopAt && time - stopAt > N * GAP + 40) {
        this.events.off('update', tick);
        ghosts.forEach((g) => g.destroy());
      }
    };
    this.events.on('update', tick);
    return () => { stopping = true; };
  }

  // ------------------------------------------------------------- xí ngầu

  /** Vẽ lại khung hình của con xí ngầu thứ `i` theo hướng đang giữ. */
  paintDieFrame(i) {
    const tex = this.diceTex[i];
    drawDie(tex.getSourceImage(), this.diceQ[i]);
    tex.refresh();
  }

  /**
   * Lắc xí ngầu: hai con rơi từ trên cao xuống, nảy vài nhịp trên mặt bàn,
   * lăn lộn thật sự trong không gian rồi mới nằm im ngửa đúng mặt số.
   *
   * Chuyển động chạy bằng vòng cập nhật của scene chứ không bằng tween:
   * có trọng lực, có hệ số nảy, có ma sát hãm vòng quay — nhờ vậy nhịp rơi
   * và nhịp lăn ăn khớp với nhau như xúc xắc thật.
   *
   * @param {number} [only] 0 hoặc 1: chỉ lăn viên này (Xí Ngầu Gian lắc lại
   *   một viên), viên kia nằm yên đúng mặt cũ
   */
  rollDiceAnim(a, b, only = null) {
    const S = this.size;
    const G = S * 9.5;            // trọng lực, điểm ảnh/giây²
    const REST = 0.42;            // hệ số nảy sau mỗi lần chạm bàn
    const SETTLE = 850;           // mốc bắt đầu nắn về mặt số (ms)
    const SNAP = 280;             // thời gian nắn (ms)
    const values = [a, b];
    // Viên đứng yên mà đang ẩn (máy vừa vào giữa chừng) thì cho lăn luôn, khỏi mất một viên
    const lives = this.dice.map((d, i) => only == null || only === i || !d.visible);
    const live = (i) => lives[i];

    // Tiếng lắc trong ống trước, rồi từng cú chạm bàn kêu theo đúng lúc nảy
    audio.sfx('shake', { count: 10, span: 0.5 });

    /* Chỗ nằm cuối đọc thẳng từ `diceHome` mỗi khung hình — đổi cỡ cửa sổ
       giữa chừng thì con xí ngầu vẫn rơi đúng vào chỗ mới */
    const sim = this.diceHome.map((home, i) => {
      const dir = i === 0 ? -1 : 1;
      return {
        x: home.x + dir * S * 0.075 + (Math.random() - 0.5) * S * 0.03,
        vx: -dir * S * (0.09 + Math.random() * 0.07),
        h: S * (0.70 + Math.random() * 0.16),          // độ cao so với mặt bàn
        vh: -S * (0.02 + Math.random() * 0.05),
        axis: (() => {
          const v = [
            (Math.random() < 0.5 ? -1 : 1) * (0.55 + Math.random() * 0.45),
            (Math.random() - 0.5) * 0.7,
            (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.5),
          ];
          const n = Math.hypot(...v);
          return [v[0] / n, v[1] / n, v[2] / n];
        })(),
        spin: 13 + Math.random() * 7,                   // radian/giây
        target: null,
        from: null,
      };
    });

    this.dice.forEach((d, i) => {
      if (!live(i)) return;
      this.diceQ[i] = qRandom();
      d.setVisible(true).setAlpha(0).setAngle(0);
      this.diceShadow[i].setVisible(true).setAlpha(0);
      this.paintDieFrame(i);
    });

    return new Promise((resolve) => {
      /* Bấm giờ bằng đồng hồ thật: máy yếu thì cú lắc nhẹ đi chứ không dài ra */
      const t0 = performance.now();
      let last = t0;
      const onUpdate = () => {
        const now = performance.now();
        const dt = Math.min(now - last, 34) / 1000;
        last = now;
        const t = now - t0;

        for (let i = 0; i < sim.length; i++) {
          if (!live(i)) continue;
          const s = sim[i];
          const home = this.diceHome[i];
          const snapping = t >= SETTLE;

          if (!snapping) {
            /* Rơi tự do + nảy */
            s.vh -= G * dt;
            s.h += s.vh * dt;
            s.x += s.vx * dt;
            if (s.h <= 0 && s.vh < 0) {
              // Cú chạm càng mạnh tiếng càng đanh; những cú nảy vụn cuối thì bỏ
              if (Math.abs(s.vh) > S * 0.15) {
                audio.sfx('diceHit', { gain: Math.min(1, Math.abs(s.vh) / (S * 1.5)) });
              }
              s.h = 0;
              s.vh = -s.vh * REST;
              s.vx *= 0.55;
              s.spin *= 0.5;                            // chạm bàn thì khựng lại
            }
            s.spin *= Math.exp(-1.1 * dt);
            this.diceQ[i] = spinBy(this.diceQ[i], s.axis, s.spin * dt);
          } else {
            /* Nắn về mặt số: xoay ngắn nhất, đồng thời hạ xuống đúng chỗ nằm */
            if (!s.target) {
              s.from = this.diceQ[i];
              s.fromX = s.x;
              s.fromH = s.h;
              s.target = qForValue(values[i], s.from);
            }
            const k = Math.min(1, (t - SETTLE) / SNAP);
            const e = 1 - (1 - k) ** 3;                 // easeOutCubic
            this.diceQ[i] = qSlerp(s.from, s.target, e);
            s.x = s.fromX + (home.x - s.fromX) * e;
            s.h = s.fromH * (1 - e);
          }

          /* Nhổm lên khi đang chống cạnh, hạ xuống khi một mặt áp bàn */
          const lift = (supportFactor(this.diceQ[i]) - 1) * this.dieSize * 0.5;

          /* Càng cao thì khối càng to và bóng càng loang nhạt */
          const rel = (s.h + lift) / S;
          const grow = 1 + rel * 0.30;
          const d = this.dice[i];
          d.setAlpha(Math.min(1, t / 90));
          d.setDisplaySize(this.dieSize * DIE_PAD * grow, this.dieSize * DIE_PAD * grow);
          d.setPosition(s.x, home.y - s.h - lift);

          const sh = this.diceShadow[i];
          const shSize = this.dieSize * 1.55 * (1 + rel * 0.9);
          sh.setDisplaySize(shSize, shSize);
          sh.setPosition(s.x, home.y + this.dieSize * 0.34);
          sh.setAlpha(Math.min(1, t / 90) * Math.max(0.05, 0.38 - rel * 0.55));

          this.paintDieFrame(i);
        }

        if (t < SETTLE + SNAP) return;

        /* Đã nằm yên: chốt đúng hướng mặt số rồi buông tay cho controller */
        this.events.off(Phaser.Scenes.Events.UPDATE, onUpdate);
        this.dice.forEach((d, i) => {
          if (!live(i)) return;
          this.diceQ[i] = sim[i].target ?? qForValue(values[i], this.diceQ[i]);
          this.paintDieFrame(i);
          d.setPosition(this.diceHome[i].x, this.diceHome[i].y);
          d.setDisplaySize(this.dieSize * DIE_PAD, this.dieSize * DIE_PAD);
          this.tweens.add({
            targets: d,
            scaleX: d.scaleX * 1.10, scaleY: d.scaleY * 1.10,
            duration: 130, yoyo: true, ease: 'Back.easeOut',
          });
        });
        const [d1, d2] = this.dice;
        const fx = only == null ? (d1.x + d2.x) / 2 : this.dice[only].x;
        this.flash(fx, d1.y, a === b ? 0xE9CE85 : 0xFFFFFF, a === b ? 1.0 : 0.55);
        this.time.delayedCall(200, resolve);
      };
      this.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);
    });
  }

  hideDice() {
    this.disarmDicePick();
    this.dice.forEach((d) => d.setVisible(false));
    this.diceShadow.forEach((s) => s.setVisible(false));
  }

  /** Viên xí ngầu nằm dưới điểm (toạ độ khung vẽ), hoặc null. */
  dieAt(sx, sy) {
    if (!this.dice[0].visible) return null;
    const r = this.dieSize * 0.62;
    const i = this.diceHome.findIndex((h) => Math.hypot(sx - h.x, sy - h.y) <= r);
    return i < 0 ? null : i;
  }

  /**
   * Cho bấm vào từng viên xí ngầu (Xí Ngầu Gian: bấm viên nào lắc lại viên ấy).
   *
   * Vòng sáng vẽ lại mỗi nhịp theo `diceHome`, nên đổi cỡ cửa sổ giữa chừng thì
   * vòng vẫn bám đúng viên. Depth 29.5: trên màn tối của phiên chọn ô (5.4) để
   * hai viên không bị phủ mờ như phần bàn không bấm được, dưới chính viên xí ngầu.
   *
   * @param {(i:number)=>void} fn nhận 0 (viên trái) hoặc 1 (viên phải)
   */
  armDicePick(fn) {
    this.disarmDicePick();
    const g = this.add.graphics().setDepth(29.5);
    const beat = { t: 0 };
    const draw = () => {
      g.clear();
      const k = 0.55 + beat.t * 0.45;
      for (const h of this.diceHome) {
        const r = this.dieSize * (0.66 + beat.t * 0.05);
        g.fillStyle(0xC8A048, 0.16 * k).fillCircle(h.x, h.y, r);
        g.lineStyle(Math.max(2, this.size * 0.005), 0xFFE9B0, k).strokeCircle(h.x, h.y, r);
      }
    };
    const tween = this.tweens.add({
      targets: beat, t: 1, duration: 880, yoyo: true, repeat: -1,
      ease: 'Sine.easeInOut', onUpdate: draw,
    });
    draw();
    this.dicePick = { fn, g, tween };
  }

  disarmDicePick() {
    const p = this.dicePick;
    if (!p) return;
    this.dicePick = null;
    p.tween.remove();
    p.g.destroy();
    this.input.setDefaultCursor(this.hoverTile == null ? 'default' : 'pointer');
  }

  // -------------------------------------------------- chủ sở hữu & nhà cửa

  refresh(state) {
    this.diffTileFx(state);
    this.state = state;
    /* Gờ tuyết dày dần theo số vòng cả bàn đã đi. Đổi nấc thì vẽ lại ảnh bàn
       cờ — một ván chỉ bốn lần — trước khi dựng lớp phủ, vì dải tên ô dán lại
       từ chính ảnh ấy. */
    if (this.xmas) {
      const lv = snowLevel(state.laps ?? 0, state.players.length);
      if (lv !== this.snowLevel) { this.snowLevel = lv; this.repaintBoard(); }
    }
    this.overlay.removeAll(true);
    this.glowLayer.removeAll(true);
    this.glowFx = [];
    this.mortParts.clear();

    for (const t of BOARD) {
      const ownerId = state.owner.get(t.id);
      if (ownerId === undefined) continue;
      const p = state.players[ownerId];
      const { w, h } = tileSize(t.id, TEX);
      const c = tileCenter(t.id, TEX);
      const a = tileAngle(t.id);

      const g = this.add.graphics();
      const sc = this.toScreen(c.x, c.y);
      g.setPosition(sc.x, sc.y).setRotation(a);
      const sw = w * this.scaleF, sh = h * this.scaleF;

      /* Chủ đất chỉ đánh dấu bằng MỘT nước màu phủ kín mặt ô — nhìn thấy cả
         mảng màu thì rõ hơn hẳn một cái gờ mỏng ở rìa, nên không cần gờ, cũng
         không cần đánh dấu riêng cho ô đủ bộ nữa.
         Độ dày nước màu nương theo độ nổi của sắc đó trên nền giấy: sắc nhạt
         như hoàng kim phải phủ dày tay hơn mới thấy. Chặn trên hạ xuống 0,48
         (trước là 0,62) và dải tên ô được dán lại nguyên bản đè lên — xem
         `addNameBand` — nên đọc tên đất không còn phải nheo mắt. */
      const own = this.ownTint(p.token.color);
      /* Ô thế chấp: mặt ô dán lại từ bản xám của bàn cờ — cùng một cách nhìn
         với thẻ đất trong hộp thoại (`.deedcard.is-mortgaged`: xám + nhãn đỏ).
         Nước màu chủ đất nhạt đi nhưng vẫn giữ, vì đó là thứ duy nhất còn nói
         lên đất của ai. */
      const mort = state.isMortgaged(t.id);
      const grayParts = [];
      if (mort) grayParts.push(this.pasteBoard(t.id, 0, 1, 'board-gray').img);
      const dim = mort ? 0.5 : 1;
      const wash = this.washOf(own) * dim;
      g.fillStyle(own, wash);
      g.fillRect(-sw / 2, -sh / 2, sw, sh);
      /* Không kẻ viền màu chủ đất quanh ô, kể cả ở Halloween: viền đậm bao
         quanh từng ô làm cả bàn cờ rối mắt, Jason đã bỏ. Nước màu phủ mặt ô
         là đủ để biết đất của ai. */
      this.overlay.add(g);

      // Dải tên ô + sắc nhóm đất nổi lên trên nước màu
      const band = this.addNameBand(t, own, wash * BAND_WASH, mort ? 'board-gray' : 'board');

      // Nhãn đỏ vẽ sau dải tên để dải tên dán lại không đè mất nhãn
      if (mort) {
        if (band) grayParts.push(band);
        this.mortParts.set(t.id, { gray: grayParts, tag: this.addMortgageTag(t, sc, a, sw, sh) });
        this.applyMortVis(t.id);
      }

      /* Đất đã xây thì KHÔNG dựng nóc nhà lên mặt ô nữa — mặt ô để trống cho
         tên đất và quân cờ. Thay vào đó mép trong của ô sáng lên một vệt đèn
         màu chủ đất: nhìn cả bàn là thấy ngay dãy nào đang có nhà, mà không có
         hình khối nào che mất chữ. Muốn biết mấy căn thì rê chuột vào. */
      if (!state.isMortgaged(t.id)) this.addTileGlow(t.id, p, state.housesOn(t.id));

      /* Ô bị xác sống chiếm (Halloween): phủ mỏng một lớp xanh độc, đủ để
         nhìn ra mà chữ trên ô vẫn đọc được */
      if (state.isZombied?.(t.id)) {
        const z = this.add.graphics();
        z.setPosition(sc.x, sc.y).setRotation(a);
        z.fillStyle(0x7FB539, 0.26).fillRect(-sw / 2, -sh / 2, sw, sh);
        z.lineStyle(Math.max(1.5, this.size * 0.003), 0x9AD14E, 0.9).strokeRect(-sw / 2, -sh / 2, sw, sh);
        this.overlay.add(z);
      }
    }
    this.syncAuras(state);
    if (this.spooky) {
      this.syncTombs(state);
      this.syncWalkers();
      this.moonRed?.setVisible(state.hasMod('blood-moon'));
    }
    this.placeTokens();
    this.updateHousePlaque();
  }

  /**
   * Dán lại dải tên ô — sắc nhóm đất, biển tên, giá — đè lên nước màu chủ đất.
   *
   * "Vẽ lại" ở đây không vẽ gì cả: mặt bàn là một tấm ảnh dựng sẵn, nên chỉ
   * cần cắt đúng dải ấy trên chính tấm ảnh đó rồi đặt trùng chỗ cũ. Không tốn
   * thêm texture, không dựng lại chữ, mà đổi cỡ bàn cờ vẫn khớp từng điểm ảnh.
   *
   * Cắt được vì mọi ô thường đều xoay theo bội số của 90°: dải tên trong hệ
   * toạ độ ô là hình chữ nhật, xoay xong vẫn nằm thẳng trục của tấm ảnh, đúng
   * dạng vùng cắt mà Phaser nhận.
   *
   * @param {object} t ô cờ
   * @param {number} tint sắc chủ đất, đã nắn qua `ownerTint`
   * @param {number} alpha lớp nước màu mỏng giữ lại trên dải, để dải không
   *   trông như ô chưa ai mua
   */
  addNameBand(t, tint, alpha, key = 'board') {
    if (isCorner(t.id)) return null;
    const band = nameBand(t.type);
    const { rx, ry, rw, rh, img } = this.pasteBoard(t.id, band.top, band.bottom, key);

    const g = this.add.graphics();
    const s = this.toScreen(rx + rw / 2, ry + rh / 2);
    g.setPosition(s.x, s.y);
    g.fillStyle(tint, alpha);
    g.fillRect(-rw * this.scaleF / 2, -rh * this.scaleF / 2, rw * this.scaleF, rh * this.scaleF);
    this.overlay.add(g);
    return img;
  }

  /**
   * Cắt một dải của ô trên ảnh bàn cờ rồi đặt trùng chỗ cũ vào lớp `overlay`.
   * `top`/`bottom` đo theo chiều cao ô tính từ mép trong, như `nameBand`.
   * Trả về vùng cắt theo toạ độ `TEX`.
   */
  pasteBoard(id, top, bottom, key = 'board') {
    if (key === 'board-gray') this.ensureGrayBoard();
    const c = tileCenter(id, TEX);
    const { w, h } = tileSize(id, TEX);
    const a = tileAngle(id);
    const cos = Math.cos(a), sin = Math.sin(a);
    const at = (lx, ly) => ({ x: c.x + lx * cos - ly * sin, y: c.y + lx * sin + ly * cos });

    const p1 = at(-w / 2, -h / 2 + h * top);
    const p2 = at(w / 2, -h / 2 + h * bottom);
    const rx = Math.min(p1.x, p2.x), ry = Math.min(p1.y, p2.y);
    const rw = Math.abs(p2.x - p1.x), rh = Math.abs(p2.y - p1.y);

    // Vùng cắt đo bằng điểm ảnh của tấm ảnh gốc, mà tấm ấy vẽ ở độ phân giải
    // riêng (`boardPx`) chứ không phải hệ toạ độ hình học `TEX`.
    const k = this.boardPx / TEX;
    const strip = this.add.image(this.board.x, this.board.y, key)
      .setOrigin(0.5)
      .setDisplaySize(this.size, this.size)
      .setCrop(rx * k, ry * k, rw * k, rh * k);
    this.overlay.add(strip);
    return { rx, ry, rw, rh, img: strip };
  }

  /**
   * Bản xám của mặt bàn, dựng một lần khi lần đầu có ô thế chấp. Làm bằng
   * vòng lặp điểm ảnh chứ không dùng `ctx.filter`, vì Safari cũ bỏ qua
   * `ctx.filter` mà không báo lỗi. Công thức khớp CSS
   * `grayscale(.62) brightness(.78)` của thẻ đất trong hộp thoại.
   */
  ensureGrayBoard() {
    if (this.textures.exists('board-gray')) return;
    const src = this.textures.get('board').getSourceImage();
    const cv = document.createElement('canvas');
    cv.width = src.width; cv.height = src.height;
    const ctx = cv.getContext('2d');
    ctx.drawImage(src, 0, 0);
    const img = ctx.getImageData(0, 0, cv.width, cv.height);
    const d = img.data;
    const G = 0.62, B = 0.78;
    for (let i = 0; i < d.length; i += 4) {
      const lum = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      d[i]     = (d[i]     * (1 - G) + lum * G) * B;
      d[i + 1] = (d[i + 1] * (1 - G) + lum * G) * B;
      d[i + 2] = (d[i + 2] * (1 - G) + lum * G) * B;
    }
    ctx.putImageData(img, 0, 0);
    this.textures.addCanvas('board-gray', cv);
  }

  /**
   * Nhãn đỏ "THẾ CHẤP" nằm ngang thân ô, xoay theo ô, ở chân ô với mọi loại
   * ô (xem `MORT_TAG_Y`).
   */
  addMortgageTag(t, sc, a, sw, sh) {
    const y = sh * MORT_TAG_Y;
    const txt = this.add.text(0, y, 'THẾ CHẤP', {
      fontFamily: '"Be Vietnam Pro", ui-sans-serif, sans-serif',
      fontStyle: 'bold',
      fontSize: `${Math.max(8, Math.round(sw * 0.15))}px`,
      color: '#FFE6DF',
    }).setOrigin(0.5);
    // Chữ dài hơn bề ngang ô thì thu nhỏ lại, chừa lề hai bên
    const maxW = sw * 0.78;
    if (txt.width > maxW) txt.setScale(maxW / txt.width);
    const bw = txt.displayWidth + sw * 0.12, bh = txt.displayHeight + sw * 0.06;
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.35).fillRoundedRect(-bw / 2, y - bh / 2 + bh * 0.1, bw, bh, bh * 0.22);
    bg.fillStyle(0xB3322A, 0.95).fillRoundedRect(-bw / 2, y - bh / 2, bw, bh, bh * 0.22);
    // Gốc container đặt ngay tâm nhãn để hoạt cảnh thế chấp phóng nhãn tại chỗ
    const tag = this.add.container(sc.x - Math.sin(a) * y, sc.y + Math.cos(a) * y, [bg, txt]).setRotation(a);
    bg.y -= y; txt.y -= y;
    /* Halloween: mạng nhện giăng ở hai góc phía trong của ô. Góc ấy là mái
       cổng, không có chữ; bán kính 0,22 bề ngang ô vẫn chưa chạm tới biển tên
       (biển bắt đầu từ 0,16 bề ngang tính từ mép ô, 0,168 tính từ đầu ô). */
    if (this.spooky) {
      if (!this.textures.exists('web-corner')) this.textures.addCanvas('web-corner', paintWebCorner(128));
      const r = sw * 0.22;
      for (const side of [-1, 1]) {
        const web = this.add.image(-side * 0, 0, 'web-corner')
          .setOrigin(0, 0).setDisplaySize(r, r).setFlipX(side > 0);
        web.x = side < 0 ? -sw / 2 : sw / 2 - r;
        web.y = -sh / 2 - y;
        tag.add(web);
      }
    }
    this.overlay.add(tag);
    return tag;
  }

  // ------------------------------------------------- hoạt cảnh trên ô đất

  /**
   * So trạng thái vừa nhận với lần `refresh` trước để tự chạy hoạt cảnh: nhà
   * tăng thì búa gõ, ô vừa thế chấp thì cắm biển, ô vừa chuộc thì màu tràn lại.
   *
   * Làm ở đây chứ không ở chỗ bấm nút, vì máy ngồi xem chỉ nhận ảnh chụp
   * (`controller.onSync` → `refresh`) — so ảnh chụp thì máy nào cũng thấy cùng
   * hoạt cảnh mà không phải phát thêm tin nào.
   *
   * Không so khi:
   *   - `state` là đối tượng khác lần trước — vào ván, vào lại phòng: mọi thứ
   *     "mới xuất hiện" nhưng chẳng có gì vừa xảy ra;
   *   - ô đổi chủ — giao dịch, đấu giá, phá sản đều mang theo nhà và thế chấp,
   *     không phải xây hay cầm cố.
   * Nhà giảm thì không tự đoán: bán nhà thì im lặng, còn động đất / hoả hoạn
   * được gọi thẳng qua `tileFx` vì chỉ máy cầm lái biết nguyên nhân.
   */
  diffTileFx(state) {
    const view = new Map();
    for (const [id, o] of state.owner) {
      view.set(id, { o, h: state.housesOn(id), m: state.isMortgaged(id) });
    }
    const prev = this.fxState === state ? this.fxView : null;
    this.fxView = view;
    this.fxState = state;
    if (!prev) return;
    const sound = new Set();
    const play = (kind, id, extra) => {
      this.startTileFx(kind, id, { ...extra, sound: !sound.has(kind) });
      sound.add(kind);
    };
    for (const [id, now] of view) {
      const was = prev.get(id);
      if (!was || was.o !== now.o) continue;
      if (now.h > was.h) play('build', id, { from: was.h, to: now.h });
      if (now.m && !was.m) play('mortgage', id);
      else if (!now.m && was.m) play('redeem', id);
    }
  }

  /**
   * Hoạt cảnh có nguyên nhân mà ảnh chụp không nói ra (động đất, hoả hoạn,
   * bão tuyết).
   * Nhiều ô thì chạy so le 150ms, chỉ ô đầu có tiếng.
   * @param {'quake'|'fire'|'blizzard'} kind
   * @param {number[]} ids
   * @param {boolean} [lost] false khi chủ đã chống đỡ / dập lửa kịp: ô vẫn rung,
   *   vẫn cháy, chỉ không có căn nhà văng ra
   */
  tileFx(kind, ids, lost = true) {
    const list = [...new Set(ids ?? [])];
    const go = (id, i) => this.startTileFx(kind, id, { sound: i === 0, house: lost });
    // Ô đầu chạy ngay trong nhịp này, không đợi khung hình sau như `delayedCall(0)`
    return Promise.all(list.map((id, i) => (i === 0 ? go(id, i) : new Promise((resolve) => {
      this.time.delayedCall(i * 150, () => go(id, i).then(resolve));
    }))));
  }

  /** Độ hiện lớp thế chấp của một ô — hoạt cảnh thế chấp giữ nó ẩn tới lúc biển cắm xong. */
  applyMortVis(id) {
    const parts = this.mortParts.get(id);
    if (!parts) return;
    const v = this.mortVis.get(id);
    for (const img of parts.gray) img.setAlpha(v ? v.gray : 1);
    parts.tag.setAlpha(v ? v.tag : 1).setScale(v ? v.tagScale : 1);
  }

  /**
   * Mặt ô trên ảnh bàn cờ, đo sẵn để `tileFx.js` vẽ lại vào hệ của ô: vùng
   * cắt theo điểm ảnh ảnh gốc, cỡ vẽ theo đơn vị hoạt cảnh (trước khi xoay).
   */
  tileSource(id, key, u) {
    if (key === 'board-gray') this.ensureGrayBoard();
    const c = tileCenter(id, TEX);
    const { w, h } = tileSize(id, TEX);
    const a = tileAngle(id);
    // Ô thường xoay bội số 90°: nằm dọc thì hai cạnh đổi chỗ trên ảnh
    const side = Math.abs(Math.sin(a)) > 0.5;
    const bw = side ? h : w, bh = side ? w : h;
    const k = this.boardPx / TEX;
    return {
      img: this.textures.get(key).getSourceImage(),
      sx: (c.x - bw / 2) * k, sy: (c.y - bh / 2) * k, sw: bw * k, sh: bh * k,
      dw: bw * this.scaleF / u, dh: bh * this.scaleF / u,
      angle: a, hh: h * this.scaleF / u / 2,
    };
  }

  /**
   * Chạy một hoạt cảnh trên ô `id`. Ô đang có hoạt cảnh thì hoạt cảnh cũ dừng
   * ngay — bấm xây liền tay thì mỗi căn một nhịp búa mới, không xếp hàng.
   * @returns {Promise<void>} xong khi hoạt cảnh hết
   */
  startTileFx(kind, id, opts = {}) {
    const st = this.state;
    const t = BOARD[id];
    if (!st || !t || isCorner(id) || REDUCED_MOTION()) return Promise.resolve();
    this.stopTileFx(id);

    const { w, h } = tileSize(id, TEX);
    const sw = w * this.scaleF, sh = h * this.scaleF;
    const u = sw / FX_TILE_W;
    const hh = sh / u / 2;
    const box = fxBox(hh);
    const cw = Math.max(2, Math.ceil(box.width * u)), ch = Math.max(2, Math.ceil(box.height * u));

    const owner = st.players[st.owner.get(id)];
    const own = owner ? this.ownTint(owner.token.color) : 0xffffff;
    const mortgaged = st.isMortgaged(id);
    const env = {
      hh,
      headerBottom: nameBand(t.type).bottom,
      tagY: MORT_TAG_Y * hh * 2,
      house: opts.house ?? false,
      hotel: opts.to === 5,
      mortgaged,
      src: this.tileSource(id, 'board', u),
      graySrc: this.tileSource(id, 'board-gray', u),
      wash: {
        css: `#${own.toString(16).padStart(6, '0')}`,
        alpha: owner ? this.washOf(own) * (mortgaged ? 0.5 : 1) : 0,
      },
      glowFrom: opts.from ? GLOW_BY_HOUSES[Math.min(opts.from, 5)] / GLOW_BY_HOUSES[Math.min(opts.to ?? 1, 5)] : 0,
      sfx: (name) => { if (opts.sound !== false) audio.sfx(name); },
      setGlow: (v) => { if (v == null) this.glowVis.delete(id); else this.glowVis.set(id, v); },
      setMort: (v) => { if (v == null) this.mortVis.delete(id); else this.mortVis.set(id, v); this.applyMortVis(id); },
    };
    const fx = makeTileFx(kind, env);
    if (!fx) return Promise.resolve();

    const key = `tilefx-${++this.fxSeq}`;
    const under = this.textures.createCanvas(`${key}-u`, cw, ch);
    const over = this.textures.createCanvas(`${key}-o`, cw, ch);
    const c = tileCenter(id, TEX);
    const sc = this.toScreen(c.x, c.y);
    const a = tileAngle(id);
    const ox = -box.left / box.width, oy = -box.top / box.height;
    const imgU = this.add.image(sc.x, sc.y, `${key}-u`).setOrigin(ox, oy).setRotation(a);
    const imgO = this.add.image(sc.x, sc.y, `${key}-o`).setOrigin(ox, oy).setRotation(a);
    this.fxUnder.add(imgU);
    this.fxLayer.add(imgO);

    return new Promise((resolve) => {
      this.fxRuns.set(id, { id, key, fx, t: 0, u, box, under, over, imgU, imgO, resolve });
    });
  }

  /** Mỗi khung hình: vẽ lại mọi hoạt cảnh đang chạy lên canvas của nó. */
  stepTileFx(dt) {
    for (const run of this.fxRuns.values()) {
      run.t += Math.min(dt, 0.05);
      const t = Math.min(run.t, run.fx.dur);
      const gu = run.under.getContext(), go = run.over.getContext();
      for (const g of [gu, go]) {
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, run.under.width, run.under.height);
        g.setTransform(run.u, 0, 0, run.u, -run.box.left * run.u, -run.box.top * run.u);
      }
      run.fx.draw(t, Math.min(dt, 0.05), gu, go);
      run.under.refresh();
      run.over.refresh();
      if (run.t >= run.fx.dur) this.stopTileFx(run.id);
    }
  }

  stopTileFx(id) {
    const run = this.fxRuns.get(id);
    if (!run) return;
    this.fxRuns.delete(id);
    run.fx.finish();
    run.imgU.destroy();
    run.imgO.destroy();
    this.textures.remove(`${run.key}-u`);
    this.textures.remove(`${run.key}-o`);
    run.resolve();
  }

  stopAllTileFx() {
    for (const id of [...this.fxRuns.keys()]) this.stopTileFx(id);
  }

  /**
   * Đèn hắt ra từ **chân ô đất**: sáng nhất ngay sát mép ô rồi loang một chiều
   * vào lòng bàn cờ và mờ dần, như thể có ngọn đèn giấu dưới gờ ô. Kèm một vũng
   * tối hắt ngược lên mặt ô để ánh sáng có chỗ bám — không có vũng tối thì vệt
   * sáng trông như dán đè lên.
   */
  addTileGlow(id, owner, houses) {
    if (!houses) return;
    const { w, h } = tileSize(id, TEX);
    const sw = w * this.scaleF, sh = h * this.scaleF;
    const edge = tileEdgePoint(id, TEX, 0);
    const s = this.toScreen(edge.x, edge.y);
    const base = GLOW_BY_HOUSES[Math.min(houses, 5)];

    const nx = Math.sin(edge.angle), ny = -Math.cos(edge.angle);

    const tint = glowTint(owner.token.color);

    if (this.xmas) { this.lightBulbs(id, houses, tint); return; }
    if (this.spooky) { this.lightPumpkins(id, houses, tint); return; }

    // Vũng tối lùi vào lòng ô — chân đèn, để vệt sáng không như dán đè lên ô
    const shade = this.add.image(s.x - nx * sh * 0.18, s.y - ny * sh * 0.18, 'edge-glow')
      .setRotation(edge.angle)
      .setDisplaySize(sw * 0.94, sh * 0.44)
      .setTint(0x1B0B07)
      .setAlpha(0.24 + base * 0.14);
    this.glowLayer.add(shade);
    this.glowFx.push({ img: shade, base: 0.24 + base * 0.14, id, beat: false });

    /* Ảnh đèn xoay thêm nửa vòng để trục +Y của nó chỉ vào lòng bàn cờ, gốc
       ảnh đặt đúng mép ô — nhờ vậy chỗ sáng nhất nằm sát ô, còn đuôi sáng thì
       loang ra nền sơn mài tối, chỗ ăn màu tốt nhất. */
    const lamp = (len, wide, alpha) => {
      const img = this.add.image(s.x, s.y, 'edge-spill')
        .setRotation(edge.angle + Math.PI)
        .setOrigin(0.5, SPILL_ROOT)
        .setDisplaySize(wide, len)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(tint)
        .setAlpha(alpha);
      this.glowLayer.add(img);
      this.glowFx.push({ img, base: alpha, id });
    };

    // Quầng loang — cho cảm giác có ánh sáng toả ra giữa bàn
    lamp(sh * (houses === 5 ? 1.10 : 0.92), sw * 1.04, base * 0.72);
    // Gốc đèn — vệt ngắn, đậm ngay chân ô; sắc của người chơi đọc ở đây
    lamp(sh * 0.34, sw * 0.86, base);
  }

  /**
   * Giáng Sinh: thay cho vệt hào quang, bật bóng trên đoạn dây LED trước ô.
   * Cả dây vẽ sẵn ở trạng thái tắt (`drawWire`), nên nhìn qua bàn cờ là thấy
   * ngay đoạn nào sáng: 1–4 nhà bật 1–4 bóng từ giữa ra hai bên, khách sạn bật
   * đủ cả đoạn và quầng to hơn. Màu bóng là màu chủ đất. Nhịp sáng đi theo
   * `glowBeat` như vệt đèn nhà ở chủ đề mặc định.
   */
  lightBulbs(id, houses, tint) {
    const hotel = houses === 5;
    const lit = hotel ? LEDS_PER_TILE : Math.min(houses, LEDS_PER_TILE);
    // Thứ tự bật: bóng giữa trước, rồi lần ra hai bên cho đoạn dây cân
    const order = [2, 1, 3, 0, 4].slice(0, lit);
    const dot = this.size / 12 * (hotel ? 0.24 : 0.2);
    for (const b of ledBulbs(TEX)) {
      if (b.tile !== id || !order.includes(b.slot)) continue;
      const { x, y } = this.toScreen(b.x, b.y);
      const halo = this.add.image(x, y, 'bulb-glow')
        .setDisplaySize(dot * 2.4, dot * 2.4).setTint(tint).setBlendMode(Phaser.BlendModes.ADD);
      const core = this.add.image(x, y, 'bulb-glow')
        .setDisplaySize(dot * 0.7, dot * 0.7).setTint(0xFFFFFF);
      this.glowLayer.add([halo, core]);
      this.glowFx.push({ img: halo, base: hotel ? 1 : 0.9, id }, { img: core, base: 0.9, id, beat: false });
    }
  }

  /* ============================================================ Halloween */

  /** Texture dùng chung của chủ đề Halloween, dựng lần đầu cần tới. */
  ensureSpookyTextures() {
    const add = (key, paint) => { if (!this.textures.exists(key)) this.textures.addCanvas(key, paint()); };
    add('pumpkin-lit', () => paintHalloweenIcon('pumpkinLit', 96));
    add('witch', () => paintHalloweenIcon('witch', 192));
    add('zombie', () => paintHalloweenIcon('zombie', 128));
    for (let k = 0; k < 4; k++) add(`bat-${k}`, () => paintBatFrame(96, k));
    add('moon-blood', () => {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 256;
      const g = cv.getContext('2d');
      const halo = g.createRadialGradient(128, 128, 50, 128, 128, 128);
      halo.addColorStop(0, 'rgba(200,40,50,.55)');
      halo.addColorStop(1, 'rgba(200,40,50,0)');
      g.fillStyle = halo; g.fillRect(0, 0, 256, 256);
      const disc = g.createRadialGradient(112, 112, 6, 128, 128, 56);
      disc.addColorStop(0, '#F07060');
      disc.addColorStop(1, '#A3233A');
      g.fillStyle = disc;
      g.beginPath(); g.arc(128, 128, 56, 0, Math.PI * 2); g.fill();
      return cv;
    });
    add('fog', () => {
      const cv = document.createElement('canvas');
      cv.width = 256; cv.height = 96;
      const g = cv.getContext('2d');
      g.scale(1, 96 / 256);
      const f = g.createRadialGradient(128, 128, 0, 128, 128, 128);
      f.addColorStop(0, 'rgba(198,176,234,.5)');
      f.addColorStop(1, 'rgba(198,176,234,0)');
      g.fillStyle = f; g.fillRect(0, 0, 256, 256);
      return cv;
    });
    add('purple-flame', () => {
      const cv = document.createElement('canvas');
      cv.width = 64; cv.height = 96;
      const g = cv.getContext('2d');
      const f = g.createLinearGradient(0, 96, 0, 0);
      f.addColorStop(0, '#E6D2FF'); f.addColorStop(0.5, '#A66BFF'); f.addColorStop(1, 'rgba(110,50,200,0)');
      g.fillStyle = f;
      g.beginPath(); g.moveTo(32, 2); g.quadraticCurveTo(58, 52, 32, 94); g.quadraticCurveTo(6, 52, 32, 2); g.fill();
      return cv;
    });
  }

  /**
   * Phần chuyển động của nghĩa địa: trăng đỏ (ẩn tới khi Trăng Máu), dơi,
   * bộ xương của từng người còn trụ, sương. Dựng lại sau mỗi lần đổi bố cục
   * hoặc khi số người còn trụ đổi. Toạ độ giữ theo hệ `TEX` rồi quy ra màn
   * hình mỗi khung hình, nên đổi cỡ cửa sổ không làm lệch.
   */
  layoutSpooky() {
    this.graveLayer.removeAll(true);
    this.walkers = [];
    this.bats = [];
    this.fogs = [];
    this.moonRed = null;
    this.walkKey = '';
    if (!this.spooky) return;
    this.ensureSpookyTextures();
    const L = graveLayout(TEX);

    const m = this.toScreen(L.moon.x, L.moon.y);
    const mr = L.moon.r * this.scaleF;
    this.moonRed = this.add.image(m.x, m.y, 'moon-blood')
      .setDisplaySize(256 * mr / 56, 256 * mr / 56)
      .setVisible(!!this.state?.hasMod('blood-moon'));
    this.graveLayer.add(this.moonRed);

    for (let i = 0; i < 4; i++) {
      const img = this.add.image(0, 0, 'bat-0').setAlpha(0.9);
      this.graveLayer.add(img);
      this.bats.push({
        img, x: L.x + L.size * Math.random(), y: L.y + L.size * (0.1 + Math.random() * 0.25),
        sp: L.size * (0.03 + Math.random() * 0.03), ph: Math.random() * 6, s: 0.05 + Math.random() * 0.03,
      });
    }

    /* Bộ xương của người còn trụ đứng một hàng ngang theo thứ tự ghế, nhảy
       đồng loạt theo `danceAt`; người sau trễ người trước một nhịp ngắn nên
       mỗi lần đổi dáng chạy thành làn sóng dọc hàng. Hàng trượt qua lại trong
       hai đoạn moonwalk, `glide` là độ lệch tối đa để người đầu hàng không
       chạm dây bí ngô. */
    const players = (this.state?.players ?? this.players ?? []).filter((p) => !p.bankrupt);
    this.walkKey = players.map((p) => p.token.key).join(',');
    const span = L.walk[1] - L.walk[0];
    const gap = L.size * Math.min(0.12, 0.6 / Math.max(1, players.length));
    const row = gap * (players.length - 1);
    this.danceGlide = Math.max(0, Math.min(L.size * 0.16, (span - row) / 2 - L.size * 0.05));
    players.forEach((p, i) => {
      const img = this.add.image(0, 0, this.danceFrames(p.token).moon[0]).setOrigin(0.5, DANCE_FOOT);
      this.graveLayer.add(img);
      this.walkers.push({
        img, frames: this.danceFrames(p.token),
        x: (L.walk[0] + L.walk[1]) / 2 - row / 2 + gap * i,
        lag: i * 0.07,
        h: L.size * 0.1,
      });
    });

    for (let k = 0; k < 3; k++) {
      const img = this.add.image(0, 0, 'fog').setAlpha(0.55);
      this.graveLayer.add(img);
      this.fogs.push({ img, x: L.x + L.size * Math.random(), y: L.lanes[k], sp: L.size * 0.012 * (k % 2 ? 1 : -0.7) });
    }
    this.tickSpooky(0, 0);
  }

  /**
   * Khung nhảy của bộ xương nghĩa địa, mũ màu người chơi: `{ moon: [key…], … }`.
   * Bàn chân đứng giữa bề ngang ảnh để lật mặt và bóp ngang lúc xoay vẫn xoay
   * quanh chân; ảnh rộng gấp rưỡi bề cao bộ xương vì dáng ngả 45° và đá chân
   * chìa ra xa.
   */
  danceFrames(token) {
    const out = {};
    for (const [name, m] of Object.entries(MOVES)) {
      out[name] = Array.from({ length: m.frames }, (_, k) => {
        const key = `dance-${token.key}-${name}-${k}`;
        if (!this.textures.exists(key)) {
          const cv = document.createElement('canvas');
          cv.width = DANCE_W; cv.height = DANCE_H;
          drawSkeleton(cv.getContext('2d'), DANCE_W / 2, DANCE_H * DANCE_FOOT, DANCE_S, {
            pose: movePose(name, k), hat: token.css, lw: 1.2,
          });
          this.textures.addCanvas(key, cv);
        }
        return key;
      });
    }
    return out;
  }

  /** Số người còn trụ đổi thì dựng lại hàng bộ xương. */
  syncWalkers() {
    const key = (this.state?.players ?? []).filter((p) => !p.bankrupt).map((p) => p.token.key).join(',');
    if (key !== this.walkKey) this.layoutSpooky();
  }

  /** Mỗi khung hình: hàng bộ xương nhảy, dơi bay, sương trôi, trăng máu thở. */
  tickSpooky(time, dt) {
    if (!this.spooky || !this.walkers) return;
    const L = graveLayout(TEX);
    const still = REDUCED_MOTION();
    const step = still ? 0 : dt;
    const sec = still ? STILL_AT : time / 1000;
    // Vị trí cả hàng theo đồng hồ chung, không trễ, để hàng trượt thẳng tắp
    const shift = danceAt(sec).glide * (this.danceGlide ?? 0);
    for (const w of this.walkers) {
      const d = still ? danceAt(sec) : danceAt(sec - w.lag);
      const p = this.toScreen(w.x + shift, L.lanes[1]);
      const hh = w.h * this.scaleF * DANCE_H / DANCE_S;
      const ww = hh * DANCE_W / DANCE_H;
      w.img.setTexture(w.frames[d.move][d.k])
        .setFlipX(d.sx < 0).setPosition(p.x, p.y)
        .setDisplaySize(ww * Math.max(0.12, Math.abs(d.sx)), hh);
    }
    for (const b of this.bats) {
      b.x += b.sp * step;
      if (b.x > L.x + L.size * 1.05) b.x = L.x - L.size * 0.05;
      const p = this.toScreen(b.x, b.y + Math.sin(time * 0.0015 + b.ph) * L.size * 0.02);
      const sw = L.size * b.s * this.scaleF;
      b.img.setTexture(`bat-${still ? 1 : Math.floor(time / 70 + b.ph * 3) % 4}`)
        .setPosition(p.x, p.y).setDisplaySize(sw, sw * 0.7);
    }
    for (const f of this.fogs) {
      f.x += f.sp * step;
      if (f.x > L.x + L.size * 1.2) f.x = L.x - L.size * 0.2;
      if (f.x < L.x - L.size * 0.2) f.x = L.x + L.size * 1.2;
      const p = this.toScreen(f.x, f.y);
      f.img.setPosition(p.x, p.y).setDisplaySize(L.size * 0.55 * this.scaleF, L.size * 0.2 * this.scaleF);
    }
    if (this.moonRed?.visible) this.moonRed.setAlpha(0.82 + 0.18 * Math.sin(time * 0.002));
  }

  /**
   * Bí ngô sáng thay bóng LED: dây bí ngô vẽ sẵn trên ảnh bàn cờ, quả nào
   * cũng tắt; ô có nhà thì đặt bí ngô sáng đè đúng chỗ, quầng màu chủ đất.
   * 1–4 nhà sáng 1–4 quả từ giữa ra, khách sạn sáng đủ năm và quả giữa có
   * thêm ngọn lửa tím.
   */
  lightPumpkins(id, houses, tint) {
    this.ensureSpookyTextures();
    const hotel = houses === 5;
    const lit = hotel ? 5 : Math.min(houses, 5);
    const order = [2, 1, 3, 0, 4].slice(0, lit);
    const ps = pumpkinSize(TEX) * this.scaleF;
    for (const b of pumpkinSpots(TEX)) {
      if (b.tile !== id || !order.includes(b.slot)) continue;
      const { x, y } = this.toScreen(b.x, b.y);
      const halo = this.add.image(x, y, 'bulb-glow')
        .setDisplaySize(ps * 2.8, ps * 2.8).setTint(tint).setBlendMode(Phaser.BlendModes.ADD);
      const pk = this.add.image(x, y, 'pumpkin-lit').setDisplaySize(ps, ps).setRotation(b.rot);
      this.glowLayer.add([halo, pk]);
      this.glowFx.push({ img: halo, base: hotel ? 1 : 0.85, id }, { img: pk, base: 1, id, beat: false });
      if (hotel && b.slot === 2) {
        const up = { x: Math.sin(b.rot), y: -Math.cos(b.rot) };
        const fl = this.add.image(x + up.x * ps * 0.75, y + up.y * ps * 0.75, 'purple-flame')
          .setDisplaySize(ps * 0.5, ps * 0.75).setRotation(b.rot).setBlendMode(Phaser.BlendModes.ADD);
        this.glowLayer.add(fl);
        this.glowFx.push({ img: fl, base: 1, id });
      }
    }
  }

  /** Gỡ hết bia mộ (đổi chủ đề, vào ván mới). */
  clearTombs() {
    this.tombLayer.removeAll(true);
    this.tombs.clear();
    this.tombState = null;
  }

  /**
   * Bia mộ người phá sản, mọc trong ô họ ngã xuống, đúng chỗ quân của họ từng
   * đứng (`tokenSpot` theo số ghế).
   *
   * Bản trước dựng bia ngoài ô, trên mép lòng bàn cờ: ở ô góc hai cạnh gặp
   * nhau nên bia của hai ô sát góc chồng lên nhau. Chỗ đứng của quân thì mỗi
   * ghế một ô lưới riêng, không trùng với ghế khác và đã chừa chữ trên ô, nên
   * bia đặt vào đó không đè quân nào, không che tên đất, ô góc cũng không vướng.
   *
   * Dựng từ ảnh chụp (`outPos`, `outRound`), nên máy nào vào lại giữa ván cũng
   * thấy đủ bia. Chỉ khi cùng một `state` vừa có thêm người phá sản thì bia
   * mới diễn cảnh mọc lên.
   */
  syncTombs(state) {
    const fresh = this.tombState === state;
    this.tombState = state;
    const keys = new Set();
    const dead = [];
    state.players.forEach((p, seat) => {
      if (!p.bankrupt) return;
      const pos = p.outPos ?? p.pos;
      const key = `${p.id}:${pos}`;
      keys.add(key);
      dead.push({ p, seat, pos, key });
    });
    for (const [key, img] of this.tombs) {
      if (!keys.has(key)) { img.destroy(); this.tombs.delete(key); }
    }

    /* Bia cao ngang thân quân: đủ nhìn ra là mộ, không lấn sang chỗ ghế bên.
       Neo gần giữa bia (0,58) chứ không neo chân như quân: hàng ghế ngoài nằm
       sát mép bàn cờ, neo chân thì bia ở hàng trên cùng thò ra khỏi bàn. */
    const w = this.tokenSize() * 0.58;
    for (const { p, seat, pos, key } of dead) {
      const spot = tokenSpot(pos, seat, TEX);
      const at = this.toScreen(spot.x, spot.y);
      let img = this.tombs.get(key);
      const tex = `tomb-${p.id}-${p.outRound ?? 'x'}-${p.name}`;
      if (!this.textures.exists(tex)) this.textures.addCanvas(tex, paintTombstone(p.name, p.outRound, p.token.css, 160));
      if (img) { img.setPosition(at.x, at.y).setDisplaySize(w, w * 1.3); continue; }
      img = this.add.image(at.x, at.y, tex).setOrigin(0.5, 0.58).setDisplaySize(w, w * 1.3);
      this.tombLayer.add(img);
      this.tombs.set(key, img);
      if (fresh && !REDUCED_MOTION()) this.riseTomb(img);
    }
  }

  /** Bia mộ trồi lên khỏi đất, đất bắn ra hai bên. */
  riseTomb(img) {
    const full = img.scaleY;
    img.setScale(img.scaleX, 0.01);
    audio.sfx('grave');
    this.tweens.add({ targets: img, scaleY: full, duration: 950, ease: 'Back.easeOut' });
    const n = 14;
    for (let i = 0; i < n; i++) {
      const d = this.add.circle(img.x, img.y, Math.max(2, this.size * 0.004), i % 2 ? 0x3B2A22 : 0x5A4632, 1).setDepth(55);
      const a = img.rotation - Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const r = this.size * (0.02 + Math.random() * 0.04);
      this.tweens.add({
        targets: d, x: d.x + Math.cos(a) * r, y: d.y + Math.sin(a) * r, alpha: 0,
        duration: 600 + Math.random() * 400, ease: 'Cubic.easeOut', onComplete: () => d.destroy(),
      });
    }
  }

  /** Qua ô Bắt Đầu: đàn dơi bay ra từ ô ấy, phủ cả màn hình. */
  batsFromGo() {
    const c = tileCenter(0, TEX);
    const sc = this.toScreen(c.x, c.y);
    batSwarm(sc.x / DPR, sc.y / DPR);
  }

  /**
   * Phù Thuỷ Cưỡi Chổi: mụ phù thuỷ bay theo đường cong từ ô `a` sang ô `b`,
   * vệt chổi để lại đốm sáng tím.
   * @returns {Promise<void>}
   */
  witchFly(a, b) {
    if (!this.spooky) return Promise.resolve();
    this.ensureSpookyTextures();
    const ca = tileCenter(a, TEX), cb = tileCenter(b, TEX);
    const pa = this.toScreen(ca.x, ca.y), pb = this.toScreen(cb.x, cb.y);
    const c = this.boardCenter();
    const ctrl = { x: (pa.x + pb.x) / 2 * 0.4 + c.x * 0.6, y: Math.min(pa.y, pb.y, c.y) - this.size * 0.25 };
    const sz = this.size * 0.13;
    const img = this.add.image(pa.x, pa.y, 'witch').setDisplaySize(sz, sz).setDepth(46);
    const dur = REDUCED_MOTION() ? 300 : 1900;
    let last = 0;
    return new Promise((resolve) => {
      this.tweens.addCounter({
        from: 0, to: 1, duration: dur, ease: 'Sine.easeInOut',
        onUpdate: (tw) => {
          const t = tw.getValue(), it = 1 - t;
          const x = it * it * pa.x + 2 * it * t * ctrl.x + t * t * pb.x;
          const y = it * it * pa.y + 2 * it * t * ctrl.y + t * t * pb.y;
          if (Math.abs(x - img.x) > 0.5) img.setFlipX(x < img.x);
          img.setPosition(x, y).setAngle(Math.sin(t * Math.PI * 4) * 6);
          if (this.time.now - last > 40) {
            last = this.time.now;
            const dot = this.add.circle(x, y + sz * 0.15, Math.max(2, this.size * 0.005), 0xC9A6FF, 0.9)
              .setDepth(45).setBlendMode(Phaser.BlendModes.ADD);
            this.tweens.add({
              targets: dot, y: dot.y + this.size * 0.03, alpha: 0, scale: 0.3,
              duration: 700, onComplete: () => dot.destroy(),
            });
          }
        },
        onComplete: () => {
          this.flash(pa.x, pa.y, 0xA66BFF, 0.7);
          this.flash(pb.x, pb.y, 0xA66BFF, 0.7);
          this.tweens.add({ targets: img, alpha: 0, duration: 260, onComplete: () => img.destroy() });
          resolve();
        },
      });
    });
  }

  /**
   * Xác Sống Tràn Phố: mỗi ô bị kéo tới có một xác sống lê từ nghĩa địa ra,
   * tới nơi thì tan thành khói xanh. Không chờ — chạy song song với hộp hỏi.
   */
  zombieMarch(ids) {
    if (!this.spooky || REDUCED_MOTION()) return;
    this.ensureSpookyTextures();
    const L = graveLayout(TEX);
    const from = this.toScreen((L.walk[0] + L.walk[1]) / 2, L.lanes[1]);
    ids.forEach((id, i) => {
      const c = tileCenter(id, TEX);
      const to = this.toScreen(c.x, c.y);
      const sz = this.size * 0.07;
      const img = this.add.image(from.x, from.y, 'zombie').setDisplaySize(sz * 0.6, sz * 0.6).setAlpha(0).setDepth(44);
      this.tweens.add({ targets: img, alpha: 1, delay: i * 160, duration: 200 });
      this.tweens.add({
        targets: img, x: to.x, y: to.y, displayWidth: sz, displayHeight: sz,
        delay: i * 160, duration: 1300, ease: 'Sine.easeInOut',
        onUpdate: () => img.setAngle(Math.sin(this.time.now * 0.012 + i) * 9),
        onComplete: () => {
          for (let k = 0; k < 10; k++) {
            const d = this.add.circle(to.x, to.y, Math.max(2, this.size * 0.006), 0x9AD14E, 0.8).setDepth(44);
            const a = Math.random() * Math.PI * 2;
            this.tweens.add({
              targets: d, x: to.x + Math.cos(a) * sz * 0.6, y: to.y + Math.sin(a) * sz * 0.6 - sz * 0.3,
              alpha: 0, scale: 2, duration: 700, onComplete: () => d.destroy(),
            });
          }
          this.tweens.add({ targets: img, alpha: 0, duration: 300, onComplete: () => img.destroy() });
        },
      });
    });
  }

  /**
   * Màn thắng Halloween: bộ xương đội mũ màu người thắng đứng giữa nghĩa địa,
   * cúi chào ba lần trong lúc pháo hoa nổ, rồi lui đi.
   */
  skeletonBow(css) {
    if (!this.spooky) return;
    const keys = [0, 0.5, 1].map((b, k) => {
      const key = `bow-${css}-${k}`;
      if (!this.textures.exists(key)) this.textures.addCanvas(key, paintSkeletonToken(css, 256, { bow: b }));
      return key;
    });
    const L = graveLayout(TEX);
    const at = this.toScreen((L.walk[0] + L.walk[1]) / 2, L.lanes[2]);
    const h = this.size * 0.3;
    const img = this.add.image(at.x, at.y, keys[0]).setOrigin(0.5, 0.9).setDisplaySize(h / 1.12, h).setDepth(48).setAlpha(0);
    this.tweens.add({ targets: img, alpha: 1, duration: 300 });
    const seq = [0, 1, 2, 2, 1, 0];
    let t = 500;
    for (let round = 0; round < 3; round++) {
      for (const f of seq) {
        this.time.delayedCall(t, () => img.active && img.setTexture(keys[f]));
        t += f === 2 ? 320 : 140;
      }
      t += 500;
    }
    this.time.delayedCall(t, () => this.tweens.add({
      targets: img, alpha: 0, duration: 500, onComplete: () => img.destroy(),
    }));
  }

  /* ------------------------------------ bảng nhà bật lên khi rê chuột vào ô */

  /**
   * Dựng lại bảng nhà cho ô đang rê chuột. Gọi sau mỗi lần đổi bố cục hoặc
   * đổi trạng thái — bảng đang mở mà vừa xây thêm một căn thì phải đếm lại.
   */
  updateHousePlaque() {
    this.showHousePlaque(this.hoverTile ?? null);
  }

  /**
   * Ngăn nhà của một ô: một khoang giấy **nối thẳng vào mép trong của ô**, trượt
   * từ dưới ô ra khi rê chuột rồi thụt lại khi rời chuột.
   *
   * Cố ý dựng bằng đúng vật liệu của mặt bàn — nền giấy dó, nước màu chủ đất,
   * nét viền cùng tông với lưới ô — chứ không phải một tấm thẻ tối nổi lên trên
   * bàn cờ: khoang này là phần đất nới thêm của ô, không phải cái nhãn dán đè.
   *
   * Khoang xoay theo ô, và từng hình nhà cũng quay đúng chiều ấy — hệt như tên
   * đất in trên mặt ô. Ô ở cột trái thì khoang nằm dọc và mấy căn nhà cũng
   * nghiêng theo cột trái, xếp thành hàng dọc y như trên bàn cờ thật.
   *
   * Bề ngang khoang đóng cứng bằng bề ngang ô, hình nhà tự co cho vừa: khoang
   * rộng hơn ô thì trông như của ô bên cạnh, mà rê dọc một dãy đất cũng thấy
   * nó giật qua giật lại.
   */
  showHousePlaque(id) {
    const st = this.state;
    const houses = id == null || !st ? 0 : st.housesOn(id);
    const owner = houses ? st.ownerOf(id) : null;
    const key = owner ? `${id}:${houses}:${owner.id}:${Math.round(this.size)}` : null;

    if (this.plaque?.key === key) return;     // vẫn đúng khoang ấy — khỏi diễn lại
    this.hideHousePlaque();
    if (!key) return;

    const u = this.size / 12;                 // bề ngang một ô thường
    const { w } = tileSize(id, TEX);
    const bw = w * this.scaleF;               // khoang rộng đúng bằng ô
    const isHotel = houses === 5;
    const n = isHotel ? 1 : houses;

    const padX = u * 0.09, padY = u * 0.11;
    const gap = u * 0.035;
    // Bốn căn phải nằm lọt trong bề ngang ô, nên cỡ hình do chỗ trống quyết định
    const fit = (bw - padX * 2 - (n - 1) * gap) / n;
    const ih = Math.min(u * 0.40, fit / (isHotel ? 1.10 : 1));
    const iw = ih * (isHotel ? 1.10 : 1);
    const rowW = n * iw + (n - 1) * gap;
    const bh = padY * 2 + ih;
    const r = u * 0.06;

    /* Trục của ô: `n` chỉ vào lòng bàn cờ, `t` chạy dọc bề ngang ô.
       Trong hệ toạ độ của khoang, +Y là phía giáp ô, −Y là phía lòng bàn cờ. */
    const edge = tileEdgePoint(id, TEX, 0);
    const s = this.toScreen(edge.x, edge.y);
    const a = edge.angle;
    const nx = Math.sin(a), ny = -Math.cos(a);
    const tx = Math.cos(a), ty = Math.sin(a);

    const x0 = -bw / 2, y0 = -bh / 2;
    // Hai góc phía lòng bàn cờ bo tròn, hai góc giáp ô để vuông cho liền khối
    const corners = { tl: r, tr: r, bl: 0, br: 0 };

    const g = this.add.graphics();
    g.fillStyle(0x0A0603, 0.42)
      .fillRoundedRect(x0 - u * 0.015, y0 - u * 0.05, bw + u * 0.03, bh + u * 0.05, corners);
    // Nền giấy dó, đậm dần về phía ngoài — cùng cách chuyển sắc với mặt ô.
    // Halloween: mặt ô tím đêm thì khoang cũng tím đêm.
    const spooky = this.spooky;
    g.fillStyle(spooky ? 0x2E2142 : 0xF1E4CA, 1).fillRoundedRect(x0, y0, bw, bh, corners);
    g.fillStyle(spooky ? 0x21172F : 0xE4D2AC, 0.5).fillRect(x0, y0 + bh * 0.45, bw, bh * 0.55);
    // Nước màu chủ đất, đúng công thức đang phủ lên mặt ô (nhạt hơn chút cho
    // hình nhà còn nổi lên được)
    const own = this.ownTint(owner.token.color);
    g.fillStyle(own, this.washOf(own) * 0.8)
      .fillRoundedRect(x0, y0, bw, bh, corners);
    g.lineStyle(Math.max(1, this.size * 0.0016), spooky ? 0xB79BE0 : 0x221A11, 0.62)
      .strokeRoundedRect(x0, y0, bw, bh, corners);

    const kids = [g];
    for (let i = 0; i < n; i++) {
      /* Không xoay ngược: hình nhà quay cùng chiều với ô, y như tên đất in trên
         mặt ô — cột trái thì nhà cũng nằm nghiêng theo cột trái. */
      const img = this.add.image(-rowW / 2 + iw / 2 + i * (iw + gap), 0, isHotel ? 'hotel' : 'house');
      img.setDisplaySize(iw, ih);
      kids.push(img);
    }

    /* Đi từ chỗ nằm gọn trong lòng ô ra tới chỗ giáp đúng mép ô */
    const pl = this.add.container(s.x - nx * (bh / 2), s.y - ny * (bh / 2), kids)
      .setRotation(a).setDepth(12);
    pl.key = key;
    pl.homeX = pl.x;
    pl.homeY = pl.y;

    /* Che nửa nằm trong ô: khoang trượt ra từ dưới mặt bàn cờ chứ không phải
       hiện dần ra giữa không trung. Vùng che là nửa mặt phẳng từ mép ô đi vào. */
    const hw = bw * 0.9, far = bh * 3;
    const c1 = { x: s.x - tx * hw, y: s.y - ty * hw };
    const c2 = { x: s.x + tx * hw, y: s.y + ty * hw };
    const maskG = this.make.graphics({ x: 0, y: 0 }, false);
    maskG.fillStyle(0xffffff).fillPoints([
      c1, c2,
      { x: c2.x + nx * far, y: c2.y + ny * far },
      { x: c1.x + nx * far, y: c1.y + ny * far },
    ], true);
    pl.setMask(maskG.createGeometryMask());
    pl.maskG = maskG;
    this.plaque = pl;

    this.tweens.add({
      targets: pl,
      x: s.x + nx * (bh / 2), y: s.y + ny * (bh / 2),
      duration: 300, ease: 'Cubic.easeOut',
    });
  }

  hideHousePlaque() {
    const pl = this.plaque;
    if (!pl) return;
    this.plaque = null;
    this.tweens.killTweensOf(pl);
    this.tweens.add({
      targets: pl, x: pl.homeX, y: pl.homeY,   // thụt ngược vào lại dưới ô
      duration: 160, ease: 'Cubic.easeIn',
      onComplete: () => {
        pl.clearMask(true);
        pl.maskG.destroy();
        pl.destroy();
      },
    });
  }

  /**
   * Sáng tất cả những ô đang được phép chọn, và chỉ những ô ấy.
   *
   * Dùng lúc một thẻ bắt người chơi chỉ mục tiêu: thay vì đọc tên ô trong một
   * danh sách rồi đoán nó nằm đâu, họ bấm thẳng vào ô trên bàn. `markSet` cũng
   * là thứ đổi con trỏ chuột ở `setupTileInput`, nên ô ngoài danh sách nhìn là
   * biết bấm không ăn.
   *
   * @param {number[]} ids
   * @param {{focus?:number, color?:number, pick?:boolean, sel?:number[],
   *   ms?:number, until?:number, veil?:number}} [o]
   *   `focus` là ô vừa bấm, đang chờ xác nhận — sáng gắt hơn hẳn phần còn lại
   *   cho khỏi lẫn. `sel` là những ô **đã chọn xong** trong một phiên chọn
   *   nhiều ô (dựng đề nghị giao dịch): tô nước ngọc thay vì nước vàng, nhìn
   *   một cái là biết ô nào đã nằm trong giỏ. `pick: false` là kiểu chỉ trỏ:
   *   hộp thoại đang nói tới mấy ô này chứ không mời bấm, nên không đụng tới
   *   `markSet` — con trỏ chuột giữ nguyên. Kiểu chỉ trỏ luôn có hạn: `ms` là
   *   hạn sống (mặc định `MARK_HINT_MS`), `until` là mốc tắt đã tính sẵn của
   *   một vệt đang được dựng lại. `veil` ghi đè độ đậm màn tối.
   */
  markTiles(ids, o = {}) {
    this.markTween?.remove();
    this.markGuard?.remove();
    this.markGuard = null;
    this.markLayer.removeAll(true);
    const pick = o.pick !== false;
    /* Dựng lại bố cục thì `layout()` gọi lại đúng đối tượng đánh dấu đang có;
       giữ nguyên nó chứ đừng dựng cái mới, để `spotTiles` còn nhận ra vệt sáng
       vẫn là của mình mà thu lại lúc hết giờ. */
    this.marked = o === this.marked
      ? o
      : { ids: [...ids], focus: o.focus, color: o.color, pick, until: o.until, veil: o.veil,
          sel: o.sel ? [...o.sel] : undefined };
    this.markSet = pick ? new Set(ids) : null;
    const selSet = new Set(o.sel ?? []);
    if (!pick) this.armMarkGuard(this.marked, o.ms);

    this.drawMarkVeil(ids, o.veil ?? (pick ? VEIL_PICK : VEIL_HINT));

    /* Trên nền đã tối, nước vàng phủ mặt ô chỉ cần mỏng — đủ để ô chọn được ngả
       ấm hơn ô thường, không đủ để lấp mất nước màu chủ đất hay tên đất. Ô đang
       chờ xác nhận (`focus`) dày tay hơn cho khỏi lẫn với phần còn lại. */
    const color = o.color ?? 0xC8A048;
    const marks = ids.map((id) => {
      const focus = id === o.focus;
      const on = selSet.has(id);
      const base = focus || on ? 1 : 0.9;
      const r = this.add.rectangle(0, 0, 1, 1, on ? 0x4E9576 : color, focus || on ? 0.34 : 0.14)
        .setStrokeStyle(Math.max(2, this.size * 0.005),
          on ? 0xBFF0D8 : 0xFFE9B0, base)
        // Đặt đúng độ sáng của nhịp ngay lúc dựng, không chờ `onUpdate` khung sau
        .setAlpha(this.markPulse(base));
      this.coverTile(r, id);
      this.markLayer.add(r);
      return { r, base };
    });

    // Một nhịp chung cho cả tập ô, cùng cách làm với vệt đèn nhà cửa
    const beat = { t: 0 };
    this.markTween = this.tweens.add({
      targets: beat, t: 1,
      duration: 880, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      onUpdate: () => { for (const m of marks) m.r.setAlpha(this.markPulse(m.base)); },
    });
  }

  /**
   * Độ sáng của nhịp thở, tính theo đồng hồ cảnh chứ không theo tuổi của tween.
   *
   * Lúc dựng đề nghị giao dịch, mỗi cú bấm chọn một ô gọi lại `markTiles`, tức là
   * tween nhịp thở bị bỏ đi rồi dựng mới từ đầu. Đọc pha từ tween thì mỗi lần
   * như vậy cả tập ô nhảy về đáy nhịp — đúng cái nháy người chơi thấy. Pha theo
   * `time.now` thì không phụ thuộc tween nào đang chạy, nối liền qua mọi lần dựng lại.
   *
   * @param {number} base độ sáng đỉnh của ô đó
   */
  markPulse(base) {
    const t = 0.5 - 0.5 * Math.cos((this.time.now / 880) * Math.PI);
    return base * (0.72 + t * 0.28);
  }

  /**
   * Hẹn giờ tắt cho một vệt chỉ trỏ.
   *
   * Mốc tắt (`until`) là thời điểm tuyệt đối chứ không phải quãng còn lại, vì
   * `layout()` dựng lại vệt sáng sau mỗi lần khung vẽ đổi cỡ: đếm lại từ đầu ở
   * mỗi lần dựng thì kéo cửa sổ vài cái là vệt sáng không bao giờ hết hạn.
   *
   * @param {object} mark chính `this.marked` — hết giờ mà nó vẫn là vệt đang
   *   hiện thì mới gỡ; đã có vệt khác đè lên thì chuyện của vệt ấy.
   * @param {number} [ms] hạn sống, mặc định `MARK_HINT_MS`
   */
  armMarkGuard(mark, ms) {
    if (mark.until == null) mark.until = this.time.now + (ms ?? MARK_HINT_MS);
    this.markGuard = this.time.delayedCall(Math.max(0, mark.until - this.time.now), () => {
      this.markGuard = null;
      if (this.marked === mark) this.clearMarks();
    });
  }

  /**
   * Nháy sáng mấy ô mà một nước cờ vừa đụng tới, rồi tự thu lại.
   *
   * Xây nhà, dỡ nhà, trưng thu, đấu giá kín, thẻ Thời Cuộc — nước nào cũng đổi
   * một ô nào đó, nhưng người không cầm lái chỉ đọc được dòng thông báo rồi
   * phải tự dò tên ô ấy quanh bàn. Tối phần còn lại đi vài giây thì khỏi dò.
   *
   * Kiểu chỉ trỏ (`pick: false`): không đụng `markSet` nên con trỏ chuột và
   * bảng xem nhanh vẫn như thường.
   *
   * @param {number[]} ids
   * @param {number} [ms] giữ màn tối bấy nhiêu mili giây
   * @returns {Promise<void>} xong lúc màn đã thu lại
   */
  spotTiles(ids, ms = 2000) {
    const list = [...new Set(ids ?? [])].filter((id) => id != null);
    if (list.length === 0) return Promise.resolve();
    /* Đang mời người ta bấm chọn ô thì không chen ngang: đổi vệt sáng giữa
       chừng là đổi luôn tập ô bấm được trong mắt họ. */
    if (this.marked?.pick) return Promise.resolve();

    // Chồng lên một vệt chỉ trỏ có sẵn (hộp thoại đang mở) thì trả lại vệt ấy
    const prev = this.marked;
    const dur = Math.max(700, ms);
    this.markTiles(list, { pick: false, ms: dur });
    const mine = this.marked;

    return new Promise((resolve) => {
      this.time.delayedCall(dur, () => {
        // Đã có vệt sáng khác đè lên trong lúc chờ: chuyện của nó, đừng đụng vào
        if (this.marked === mine) {
          /* Chỉ trả lại vệt cũ khi nó còn hạn. Hai lần `spotTiles` đè nhau thì
             vệt cũ đã hết giờ từ lúc nào — dựng nó lên lại là ghim một màn tối
             không còn ai gỡ. */
          if (prev && prev.until > this.time.now) this.markTiles(prev.ids, prev);
          else this.clearMarks();
        }
        resolve();
      });
    });
  }

  /**
   * Rê chuột lên một người trong danh sách: tối bàn cờ, chừa sáng đúng mấy ô
   * người ấy đang giữ, viền theo màu quân của họ.
   *
   * Vệt này sống tới khi chuột rời đi (`unpeekTiles`), nên hạn đặt rất dài.
   * Đang mời bấm chọn ô thì không chen ngang, cùng lý do với `spotTiles`.
   * Vệt chỉ trỏ có sẵn trước đó (hộp thoại đang nói tới vài ô) được cất lại
   * và trả về lúc rời chuột, nếu nó còn hạn.
   *
   * @param {number[]} ids
   * @param {string} css màu quân dạng `#RRGGBB`
   */
  peekTiles(ids, css) {
    if (this.marked?.pick) return;
    if (!this.peek) this.peek = { prev: this.marked };
    if (!ids.length) {
      // Người chưa có đất: không tối cả bàn chỉ để khoét ra không ô nào
      if (this.marked && this.marked === this.peek.mine) this.clearMarks();
      this.peek.mine = null;
      return;
    }
    const color = Phaser.Display.Color.HexStringToColor(css).color;
    /* Đậm như lúc mời chọn ô: người rê chuột đang chủ động soi, cần thấy
       ngay đất ai nằm đâu, khác với vệt chỉ trỏ nhạt của hộp thoại. */
    this.markTiles(ids, { pick: false, ms: 10 * 60 * 1000, color, veil: VEIL_PICK });
    this.peek.mine = this.marked;
  }

  /** Chuột rời khỏi danh sách: gỡ vệt của `peekTiles`, trả lại vệt cũ nếu còn hạn. */
  unpeekTiles() {
    const pk = this.peek;
    if (!pk) return;
    this.peek = null;
    // Trong lúc rê đã có vệt khác đè lên (mời chọn ô, nháy nước cờ): để yên nó
    if (this.marked !== pk.mine) return;
    if (pk.prev && pk.prev.until > this.time.now) this.markTiles(pk.prev.ids, pk.prev);
    else this.clearMarks();
  }

  /**
   * Màn tối phủ kín khung vẽ, khoét thủng đúng mấy ô đang chọn được.
   *
   * Cách khoét: một `Graphics` vẽ đúng bốn góc của từng ô, dùng làm mặt nạ hình
   * học cho tấm màn với `invertAlpha` — màn chỉ hiện ở chỗ **ngoài** hình vẽ.
   * Mặt nạ kiểu này chạy bằng stencil buffer nên chỉ có ở WebGL; renderer canvas
   * rơi xuống nhánh dự phòng: tô tối từng ô không chọn được, bỏ qua phần bàn
   * ngoài 40 ô.
   *
   * Màn nằm ở depth 5.4: trên nước màu chủ đất (2) và vệt đèn nhà cửa (3) —
   * hai thứ nhiều màu nhất, không phủ thì tối cũng bằng thừa — nhưng dưới quân
   * cờ (6), để người chơi vẫn thấy quân mình đang đứng đâu trong lúc chọn.
   *
   * @param {number[]} ids ô chọn được
   * @param {number} alpha độ đậm của màn
   */
  drawMarkVeil(ids, alpha) {
    /* Cùng tập ô, cùng độ đậm, cùng bố cục thì giữ nguyên màn đang có. Bấm bật/tắt
       một ô lúc dựng đề nghị giao dịch gọi lại `markTiles` sau mỗi cú bấm, mà lỗ
       khoét thì không đổi — dựng lại nghĩa là xoá màn cũ rồi cho màn mới mờ dần vào
       trong 200ms, mắt đọc ra thành cái nháy. */
    const key = `${alpha}|${this.size}|${this.originX}|${this.originY}|${[...ids].sort((a, b) => a - b).join(',')}`;
    if (this.markVeil?.key === key) return;
    this.clearMarkVeil();
    const W = this.scale.width, H = this.scale.height;
    // Nới lỗ khoét ra ngoài đúng nét viền ô, không thì mép ô dính một vệt tối
    const pad = Math.max(1, this.size * 0.0016);
    const set = new Set(ids);

    if (this.renderer.type === Phaser.CANVAS) {
      const g = this.add.graphics().setDepth(5.4).setAlpha(0);
      g.fillStyle(0x000000, alpha);
      for (const t of BOARD) {
        if (!set.has(t.id)) g.fillPoints(this.tileQuad(t.id, pad), true);
      }
      this.markVeil = { veil: g, hole: null, key };
      this.tweens.add({ targets: g, alpha: 1, duration: 200, ease: 'Sine.easeOut' });
      return;
    }

    const hole = this.make.graphics({ x: 0, y: 0 }, false);
    hole.fillStyle(0xffffff, 1);
    for (const id of ids) hole.fillPoints(this.tileQuad(id, pad), true);
    const mask = hole.createGeometryMask();
    mask.invertAlpha = true;

    /* Rộng gấp ba khung vẽ về mọi phía: `shake()` rung máy quay, màn tối chỉ
       vừa đúng khung thì mỗi nhịp rung lại hở ra một dải chưa bị phủ ở mép. */
    const veil = this.add.rectangle(-W, -H, W * 3, H * 3, 0x000000, alpha)
      .setOrigin(0, 0).setDepth(5.4).setAlpha(0);
    veil.setMask(mask);
    this.markVeil = { veil, hole, key };
    this.tweens.add({ targets: veil, alpha: 1, duration: 200, ease: 'Sine.easeOut' });
  }

  /** Gỡ màn tối ngay lập tức — dựng lại bố cục cũng đi qua đây. */
  clearMarkVeil() {
    const v = this.markVeil;
    if (!v) return;
    this.markVeil = null;
    this.tweens.killTweensOf(v.veil);
    v.veil.clearMask(true);
    v.veil.destroy();
    v.hole?.destroy();
  }

  clearMarks() {
    this.markTween?.remove();
    this.markTween = null;
    this.markGuard?.remove();
    this.markGuard = null;
    this.markLayer.removeAll(true);
    this.marked = null;
    this.markSet = null;
    this.fadeOutMarkVeil();
    if (this.hoverTile != null) this.input.setDefaultCursor('pointer');
  }

  /** Chọn xong thì màn tối lui dần chứ không tắt phụt — mắt còn kịp bám ô vừa chốt. */
  fadeOutMarkVeil() {
    const v = this.markVeil;
    if (!v) return;
    this.markVeil = null;
    this.tweens.killTweensOf(v.veil);
    this.tweens.add({
      targets: v.veil, alpha: 0, duration: 220, ease: 'Sine.easeIn',
      onComplete: () => {
        v.veil.clearMask(true);
        v.veil.destroy();
        v.hole?.destroy();
      },
    });
  }

  /**
   * Ô quân đang đứng: nền ô "thở" — màu chạy qua lại giữa sắc trầm và màu
   * quân đang đi, kèm nhịp mờ tỏ. Nhờ đổi màu theo người chơi mà chỉ báo này
   * không lẫn với vệt vàng của ô đang rê chuột.
   */
  highlightTile(id, color = POS_TINT) {
    this.stopHighlightTween();
    this.highlightedTile = id;
    this.highlightColor = color;
    if (id == null) { this.tileHighlight.setVisible(false); return; }

    const hi = Phaser.Display.Color.ValueToColor(color);
    const lo = Phaser.Display.Color.ValueToColor(color).darken(48);
    this.coverTile(this.tileHighlight, id);
    this.tileHighlight.setFillStyle(lo.color, 1).setAlpha(0.32).setVisible(true);

    const beat = { t: 0 };
    this.hlTween = this.tweens.add({
      targets: beat, t: 1,
      duration: 760, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      onUpdate: () => {
        const c = Phaser.Display.Color.Interpolate.ColorWithColor(lo, hi, 100, beat.t * 100);
        this.tileHighlight
          .setFillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 1)
          .setAlpha(0.32 + beat.t * 0.24);
      },
    });
  }

  /**
   * Bốc thăm ngay trên bàn cờ: sáng chạy qua từng ô ứng viên, **chậm dần** rồi
   * dừng hẳn ở ô trúng.
   *
   * Có hoạt cảnh này thì kết quả không rơi từ trên trời xuống — cả bàn thấy
   * vòng quay đi qua đúng những ô nào, nên tin là bốc thật. Ô trúng được nháy
   * thêm mấy nhịp cho khỏi lẫn với những ô vừa chạy qua.
   *
   * @param {number[]} ids  các ô được đem ra bốc, theo đúng vòng bàn cờ
   * @param {number} pickId ô trúng — vòng quay dừng đúng ở đây
   */
  spinTiles(ids, pickId, o = {}) {
    if (!ids.length) return Promise.resolve();
    const at = Math.max(0, ids.indexOf(pickId));
    /* Quay đủ vòng cho mắt kịp bắt nhịp rồi mới thả đuôi dừng ở ô trúng. Bàn
       chỉ còn dăm lô trống thì phải quay nhiều vòng hơn, không thì vừa chớp
       một cái đã xong, chẳng ai kịp thấy nó chạy qua đâu. */
    const rounds = o.rounds ?? Math.max(2, Math.ceil(14 / ids.length));
    const seq = [];
    for (let r = 0; r < rounds; r++) seq.push(...ids);
    seq.push(...ids.slice(0, at + 1));

    this.spinGfx.setFillStyle(o.color ?? 0xC8A048, 1);
    return new Promise((resolve) => {
      let i = 0;
      const step = () => {
        const id = seq[i];
        this.coverTile(this.spinGfx, id);
        this.spinGfx.setVisible(true).setAlpha(0.5);
        const c = tileCenter(id, TEX);
        const sc = this.toScreen(c.x, c.y);
        audio.sfx('step', { i });

        if (i === seq.length - 1) {
          // Ô trúng: sáng hẳn lên rồi nháy vài nhịp trước khi tắt
          this.flash(sc.x, sc.y, o.color ?? 0xC8A048, 0.9);
          this.tweens.add({
            targets: this.spinGfx,
            alpha: { from: 0.72, to: 0.3 },
            duration: 320, yoyo: true, repeat: 2, ease: 'Sine.easeInOut',
            onComplete: () => { this.spinGfx.setVisible(false); resolve(); },
          });
          return;
        }
        // Chậm dần: mấy bước đầu vun vút, mấy bước cuối nhả ra thấy rõ
        const t = i / (seq.length - 1);
        i += 1;
        this.time.delayedCall(38 + 300 * t * t * t, step);
      };
      step();
    });
  }

  clearHighlight() {
    this.stopHighlightTween();
    this.highlightedTile = null;
    this.tileHighlight.setVisible(false);
  }

  stopHighlightTween() {
    this.hlTween?.remove();
    this.hlTween = null;
  }

  // -------------------------------------------------------------- hiệu ứng

  flash(x, y, color = 0xffffff, intensity = 1) {
    const g = this.add.circle(x, y, this.size * 0.02, color, 0.9).setDepth(40);
    this.tweens.add({
      targets: g, scale: 5 * intensity, alpha: 0,
      duration: 420, ease: 'Cubic.easeOut',
      onComplete: () => g.destroy(),
    });
  }

  flyMoney(from, to, amount, opts = {}) {
    const a = resolvePoint(from, this);
    const b = resolvePoint(to, this);
    const n = Math.max(5, Math.min(16, Math.round(Math.abs(amount) / 45) + 5));
    const coinSize = Math.max(px(18), this.size * 0.032);
    audio.sfx('coin');

    return new Promise((resolve) => {
      for (let i = 0; i < n; i++) {
        const delay = i * 42;
        const coin = this.add.image(a.x, a.y, 'coin').setDepth(45);
        coin.setDisplaySize(coinSize, coinSize);
        coin.setAlpha(0);

        const midX = (a.x + b.x) / 2 + (Math.random() - 0.5) * this.size * 0.10;
        const midY = Math.min(a.y, b.y) - this.size * (0.10 + Math.random() * 0.10);
        const dur = 620 + Math.random() * 180;

        this.tweens.add({ targets: coin, alpha: 1, duration: 90, delay });
        this.tweens.add({
          targets: coin,
          angle: (Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 360),
          duration: dur, delay, ease: 'Sine.easeInOut',
        });
        this.tweens.addCounter({
          from: 0, to: 1, duration: dur, delay, ease: 'Sine.easeInOut',
          onUpdate: (tw) => {
            const t = tw.getValue(), it = 1 - t;
            coin.x = it * it * a.x + 2 * it * t * midX + t * t * b.x;
            coin.y = it * it * a.y + 2 * it * t * midY + t * t * b.y;
          },
          onComplete: () => {
            this.flash(b.x, b.y, 0xE9CE85, 0.35);
            coin.destroy();
            if (i === n - 1) resolve();
          },
        });
      }
      if (opts.label !== false) {
        this.floatText(a.x, a.y, opts.text ?? money(amount), opts.color ?? '#E9CE85');
      }
      this.time.delayedCall(n * 42 + 860, resolve);
    });
  }

  floatText(x, y, text, color = '#E9CE85') {
    const t = this.add.text(x, y, text, {
      fontFamily: '"Noto Serif", Georgia, serif',
      fontSize: `${Math.round(this.size * 0.042)}px`,
      color,
      stroke: '#17110C',
      strokeThickness: Math.max(3, this.size * 0.005),
    }).setOrigin(0.5).setDepth(50);
    this.tweens.add({
      targets: t,
      y: y - this.size * 0.11,
      alpha: { from: 1, to: 0 },
      scale: { from: 0.7, to: 1.15 },
      duration: 1150, ease: 'Cubic.easeOut',
      onComplete: () => t.destroy(),
    });
  }

  fireworks(x, y, tint = 0xE9CE85, bursts = 1) {
    for (let b = 0; b < bursts; b++) {
      this.time.delayedCall(b * 260, () => {
        const fx = x + (Math.random() - 0.5) * this.size * 0.5;
        const fy = y + (Math.random() - 0.5) * this.size * 0.34;
        const colors = [tint, 0xE0503C, 0xE9CE85, 0x4E9576, 0xFFFFFF];
        const c = colors[Math.floor(Math.random() * colors.length)];
        audio.sfx('firework');
        const n = 26;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + Math.random() * 0.2;
          const speed = this.size * (0.10 + Math.random() * 0.13);
          const dot = this.add.circle(fx, fy, Math.max(2, this.size * 0.0055), c, 1).setDepth(60);
          this.tweens.add({
            targets: dot,
            x: fx + Math.cos(a) * speed,
            y: fy + Math.sin(a) * speed + this.size * 0.05,
            alpha: 0, scale: 0.3,
            duration: 900 + Math.random() * 420, ease: 'Cubic.easeOut',
            onComplete: () => dot.destroy(),
          });
        }
        this.flash(fx, fy, c, 0.8);
      });
    }
  }

  celebrate(duration = 5200, tint = 0xE9CE85) {
    const c = this.boardCenter();
    const every = 460;
    for (let i = 0; i < Math.floor(duration / every); i++) {
      this.time.delayedCall(i * every, () => this.fireworks(c.x, c.y - this.size * 0.08, tint, 1));
    }
  }

  bankruptFx(playerIndex) {
    const spr = this.tokens[playerIndex];
    if (!spr) return Promise.resolve();
    const c = this.boardCenter();

    for (let i = 0; i < 22; i++) {
      const d = this.add.circle(
        spr.x + (Math.random() - 0.5) * this.size * 0.05,
        spr.y, Math.max(2, this.size * 0.006), 0x6B5842, 0.8,
      ).setDepth(55);
      this.tweens.add({
        targets: d,
        y: d.y - this.size * (0.10 + Math.random() * 0.14),
        x: d.x + (Math.random() - 0.5) * this.size * 0.10,
        alpha: 0, scale: 2.2,
        duration: 900 + Math.random() * 500, ease: 'Cubic.easeOut',
        onComplete: () => d.destroy(),
      });
    }

    return new Promise((resolve) => {
      this.tweens.add({
        targets: spr, angle: 96, y: spr.y + this.size * 0.014,
        duration: 620, ease: 'Bounce.easeOut',
      });
      this.tweens.add({
        targets: spr, alpha: 0, delay: 620, duration: 620, ease: 'Sine.easeIn',
        onComplete: () => { spr.setVisible(false).setAlpha(1).setAngle(0); resolve(); },
      });
      this.cameras.main.shake(320, 0.006);
      this.floatText(c.x, c.y - this.size * 0.2, 'PHÁ SẢN', '#FF8A7A');
    });
  }

  shake(power = 0.005, dur = 260) { this.cameras.main.shake(dur, power); }
}

/**
 * Đổi mốc toạ độ về hệ khung vẽ.
 * Phần tử DOM trả về điểm ảnh CSS nên phải nhân DPR.
 */
function resolvePoint(p, scene) {
  if (!p) return scene.boardCenter();
  if (p instanceof Element) {
    const r = p.getBoundingClientRect();
    return { x: (r.left + r.width / 2) * DPR, y: (r.top + r.height / 2) * DPR };
  }
  if (p === 'bank') {
    const el = document.getElementById('bank-plate');
    if (el) return resolvePoint(el, scene);
    return { x: px(90), y: scene.scale.height - px(40) };
  }
  return p;
}

export { P };
