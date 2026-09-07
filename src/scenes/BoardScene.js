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
import { paintToken, paintCoin } from '../render/pieces.js';
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

/* Khoảng thở quanh bàn cờ, tính bằng điểm ảnh CSS */
const GUTTER = 12;

/** Bề ngang cột điều khiển — đọc thẳng từ DOM để CSS là nguồn duy nhất. */
function railWidthCss() {
  const el = document.getElementById('sidebar');
  return el ? el.getBoundingClientRect().width : 292;
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
const POS_TINT = 0xA87C28;        // quân đang đứng: màu dự phòng khi không rõ người chơi

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
  return Phaser.Display.Color.HSVToRGB(h, Phaser.Math.Clamp(s, 0.66, 0.95), v).color;
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
    this.textures.addCanvas('board', paintBoard(this.boardPx));

    /* Quân cờ vẽ dư độ phân giải để không bị rỗ khi bàn cờ lớn, nhưng chỉ vẽ
       khi biết ván này gồm những màu nào (xem `setPlayers`) — bảng có 18 sắc mà
       một ván nhiều nhất 6 người, dựng cả 18 tấm là phí bộ nhớ ảnh. */
    this.textures.addCanvas('die-shadow', paintDieShadow(128));
    this.textures.addCanvas('house', paintHouseGlyph(192));
    this.textures.addCanvas('hotel', paintHotelGlyph(192));
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
       bàn cờ (xem `ui/tilePicker.js`). Lớp riêng vì vệt ô quân đang đứng vẫn
       phải sáng suốt lúc ấy — hai vệt không được giẫm lên nhau. */
    this.markLayer = this.add.container(0, 0).setDepth(1.4);
    this.marked = null;
    this.markSet = null;
    this.overlay = this.add.container(0, 0).setDepth(2);
    /* Vệt đèn báo ô đã có nhà — nằm trên nước màu chủ đất, dưới quân cờ */
    this.glowLayer = this.add.container(0, 0).setDepth(3);
    this.tokenLayer = this.add.container(0, 0).setDepth(6);
    this.fxLayer = this.add.container(0, 0).setDepth(20);

    /* Một nhịp thở duy nhất cho mọi vệt đèn: đèn hơi tỏ hơi mờ như ánh nến,
       rẻ hơn hẳn việc mỗi ô nuôi một tween riêng. */
    this.glowFx = [];
    this.glowBeat = { t: 0 };
    this.tweens.add({
      targets: this.glowBeat, t: 1,
      duration: 1900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      onUpdate: () => {
        const k = 0.80 + this.glowBeat.t * 0.28;
        for (const f of this.glowFx) f.img.setAlpha(f.base * k);
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

    this.setupTileInput();
    this.layout();
    // Đổi cỡ cửa sổ hay bật toàn màn hình đều phải dựng lại bố cục
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.relayout());
    this.game.events.emit('scene-ready', this);
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
      this.textures.remove('board');
      this.textures.addCanvas('board', paintBoard(need));
      this.board.setTexture('board');
      this.layout();
    }
  }

  /**
   * Bàn cờ ăn hết khoảng trống bên phải cột điều khiển — cạnh của nó
   * chỉ bị giới hạn bởi chiều cao màn hình hoặc bề ngang còn lại.
   */
  layout() {
    const W = this.scale.width, H = this.scale.height;
    const railW = px(railWidthCss());
    const g = px(GUTTER);
    const availW = Math.max(px(240), W - railW - g * 2);
    const availH = Math.max(px(240), H - g * 2);
    this.size = Math.max(px(300), Math.min(availW, availH));
    this.scaleF = this.size / TEX;
    this.originX = railW + g + (availW - this.size) / 2;
    this.originY = g + (availH - this.size) / 2;

    this.board.setPosition(this.originX + this.size / 2, this.originY + this.size / 2);
    this.board.setDisplaySize(this.size, this.size);

    // Phông nền cùng tông sơn mài với bàn cờ, hai vầng sáng ấm hắt từ giữa ra
    this.bg.clear();
    this.bg.fillStyle(0x150a06, 1).fillRect(0, 0, W, H);
    const c = this.boardCenter();
    this.bg.fillStyle(0x30150f, 0.6).fillCircle(c.x, c.y, this.size * 0.78);
    this.bg.fillStyle(0x7c1e14, 0.18).fillCircle(c.x, c.y, this.size * 0.55);

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

    this.input.on('pointermove', (p) => setHover(this.tileAt(p.x, p.y)));
    // Chuột đi khỏi khung vẽ (sang cột điều khiển hay ra ngoài cửa sổ)
    // thì không còn nhận pointermove nữa — phải tự tắt nền ô đang sáng
    this.input.on(Phaser.Input.Events.GAME_OUT, () => setHover(null));

    this.input.on('pointerdown', (p) => {
      const id = this.tileAt(p.x, p.y);
      if (id != null) this.onTileClick?.(id);
    });
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
    this.hoverGfx.setVisible(true);
    this.tweens.add({
      targets: this.hoverGfx,
      alpha: { from, to: 0.34 },
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

  // ----------------------------------------------------------- quân cờ

  setPlayers(players) {
    this.players = players;
    this.tokenLayer.removeAll(true);
    this.tokens = players.map((p) => {
      const key = `tok-${p.token.key}`;
      if (!this.textures.exists(key)) this.textures.addCanvas(key, paintToken(p.token.css, 288));
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

  /** Quân nhảy từng ô một tới đích. */
  moveToken(playerIndex, fromPos, steps, onPass) {
    const spr = this.tokens[playerIndex];
    if (!spr || steps === 0) return Promise.resolve();
    const dir = Math.sign(steps);
    const n = Math.abs(steps);
    const hop = this.size * 0.038;

    return new Promise((resolve) => {
      let i = 0;
      const step = () => {
        if (i >= n) { resolve(); return; }
        i++;
        const pos = ((fromPos + dir * i) % 40 + 40) % 40;
        const t = this.tokenTarget(playerIndex, pos);
        spr.setDepth(9);
        this.tweens.add({
          targets: spr,
          x: t.x,
          duration: 190,
          ease: 'Sine.easeInOut',
          onStart: () => {
            // Mỗi nhịp nhảy một tiếng gõ gỗ — nghe rõ quân đang đếm mấy ô
            audio.sfx('step', { i });
            this.tweens.add({
              targets: spr, y: t.y - hop, duration: 95, ease: 'Quad.easeOut',
              onComplete: () => {
                this.tweens.add({ targets: spr, y: t.y, duration: 95, ease: 'Quad.easeIn' });
              },
            });
            this.tweens.add({
              targets: spr,
              scaleX: spr.scaleX * 1.08, scaleY: spr.scaleY * 1.08,
              duration: 95, yoyo: true, ease: 'Sine.easeOut',
            });
          },
          onComplete: () => {
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
    return new Promise((resolve) => {
      this.tweens.add({
        targets: spr, x: t.x, y: t.y, duration: 520, ease: 'Cubic.easeInOut', onComplete: resolve,
      });
      this.tweens.add({
        targets: spr, angle: { from: 0, to: 720 }, duration: 520, ease: 'Cubic.easeInOut',
        onComplete: () => spr.setAngle(0),
      });
    });
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
   */
  rollDiceAnim(a, b) {
    const S = this.size;
    const G = S * 9.5;            // trọng lực, điểm ảnh/giây²
    const REST = 0.42;            // hệ số nảy sau mỗi lần chạm bàn
    const SETTLE = 850;           // mốc bắt đầu nắn về mặt số (ms)
    const SNAP = 280;             // thời gian nắn (ms)
    const values = [a, b];

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
        this.flash((d1.x + d2.x) / 2, d1.y, a === b ? 0xE9CE85 : 0xFFFFFF, a === b ? 1.0 : 0.55);
        this.time.delayedCall(200, resolve);
      };
      this.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);
    });
  }

  hideDice() {
    this.dice.forEach((d) => d.setVisible(false));
    this.diceShadow.forEach((s) => s.setVisible(false));
  }

  // -------------------------------------------------- chủ sở hữu & nhà cửa

  refresh(state) {
    this.state = state;
    this.overlay.removeAll(true);
    this.glowLayer.removeAll(true);
    this.glowFx = [];

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
      const own = ownerTint(p.token.color);
      // Ô thế chấp nhạt đi để thấy ngay là đất đang cầm, nhưng đừng nhạt quá —
      // nước màu là thứ duy nhất còn nói lên đất của ai
      const dim = state.isMortgaged(t.id) ? 0.5 : 1;
      const wash = OWNER_WASH(own) * dim;
      g.fillStyle(own, wash);
      g.fillRect(-sw / 2, -sh / 2, sw, sh);
      this.overlay.add(g);

      // Dải tên ô + sắc nhóm đất nổi lên trên nước màu
      this.addNameBand(t, own, wash * BAND_WASH);

      if (state.isMortgaged(t.id)) {
        // Vẽ sau dải tên: gạch chéo báo đất đang cầm phải nằm trên cùng, không
        // thì dải tên dán đè lên làm mất một nửa nét gạch.
        const x = this.add.graphics();
        x.setPosition(sc.x, sc.y).setRotation(a);
        x.lineStyle(Math.max(1.5, sw * 0.045), 0xB3322A, 0.85);
        x.beginPath();
        x.moveTo(-sw * 0.34, -sh * 0.28); x.lineTo(sw * 0.34, sh * 0.28);
        x.moveTo(sw * 0.34, -sh * 0.28); x.lineTo(-sw * 0.34, sh * 0.28);
        x.strokePath();
        this.overlay.add(x);
      }

      /* Đất đã xây thì KHÔNG dựng nóc nhà lên mặt ô nữa — mặt ô để trống cho
         tên đất và quân cờ. Thay vào đó mép trong của ô sáng lên một vệt đèn
         màu chủ đất: nhìn cả bàn là thấy ngay dãy nào đang có nhà, mà không có
         hình khối nào che mất chữ. Muốn biết mấy căn thì rê chuột vào. */
      if (!state.isMortgaged(t.id)) this.addTileGlow(t.id, p, state.housesOn(t.id));
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
  addNameBand(t, tint, alpha) {
    if (isCorner(t.id)) return;
    const band = nameBand(t.type);
    const c = tileCenter(t.id, TEX);
    const { w, h } = tileSize(t.id, TEX);
    const a = tileAngle(t.id);
    const cos = Math.cos(a), sin = Math.sin(a);
    const at = (lx, ly) => ({ x: c.x + lx * cos - ly * sin, y: c.y + lx * sin + ly * cos });

    const p1 = at(-w / 2, -h / 2 + h * band.top);
    const p2 = at(w / 2, -h / 2 + h * band.bottom);
    const rx = Math.min(p1.x, p2.x), ry = Math.min(p1.y, p2.y);
    const rw = Math.abs(p2.x - p1.x), rh = Math.abs(p2.y - p1.y);

    // Vùng cắt đo bằng điểm ảnh của tấm ảnh gốc, mà tấm ấy vẽ ở độ phân giải
    // riêng (`boardPx`) chứ không phải hệ toạ độ hình học `TEX`.
    const k = this.boardPx / TEX;
    const strip = this.add.image(this.board.x, this.board.y, 'board')
      .setOrigin(0.5)
      .setDisplaySize(this.size, this.size)
      .setCrop(rx * k, ry * k, rw * k, rh * k);
    this.overlay.add(strip);

    const g = this.add.graphics();
    const s = this.toScreen(rx + rw / 2, ry + rh / 2);
    g.setPosition(s.x, s.y);
    g.fillStyle(tint, alpha);
    g.fillRect(-rw * this.scaleF / 2, -rh * this.scaleF / 2, rw * this.scaleF, rh * this.scaleF);
    this.overlay.add(g);
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

    // Vũng tối lùi vào lòng ô — chân đèn, để vệt sáng không như dán đè lên ô
    const shade = this.add.image(s.x - nx * sh * 0.18, s.y - ny * sh * 0.18, 'edge-glow')
      .setRotation(edge.angle)
      .setDisplaySize(sw * 0.94, sh * 0.44)
      .setTint(0x1B0B07)
      .setAlpha(0.24 + base * 0.14);
    this.glowLayer.add(shade);

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
      this.glowFx.push({ img, base: alpha });
    };

    // Quầng loang — cho cảm giác có ánh sáng toả ra giữa bàn
    lamp(sh * (houses === 5 ? 1.10 : 0.92), sw * 1.04, base * 0.72);
    // Gốc đèn — vệt ngắn, đậm ngay chân ô; sắc của người chơi đọc ở đây
    lamp(sh * 0.34, sw * 0.86, base);
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
    // Nền giấy dó, đậm dần về phía ngoài — cùng cách chuyển sắc với mặt ô
    g.fillStyle(0xF1E4CA, 1).fillRoundedRect(x0, y0, bw, bh, corners);
    g.fillStyle(0xE4D2AC, 0.5).fillRect(x0, y0 + bh * 0.45, bw, bh * 0.55);
    // Nước màu chủ đất, đúng công thức đang phủ lên mặt ô (nhạt hơn chút cho
    // hình nhà còn nổi lên được)
    const own = ownerTint(owner.token.color);
    g.fillStyle(own, OWNER_WASH(own) * 0.8)
      .fillRoundedRect(x0, y0, bw, bh, corners);
    g.lineStyle(Math.max(1, this.size * 0.0016), 0x221A11, 0.62)
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
   * @param {{focus?:number, color?:number}} [o] `focus` là ô vừa bấm, đang chờ
   *   xác nhận — sáng gắt hơn hẳn phần còn lại cho khỏi lẫn.
   */
  markTiles(ids, o = {}) {
    this.markTween?.remove();
    this.markLayer.removeAll(true);
    this.marked = { ids: [...ids], focus: o.focus, color: o.color };
    this.markSet = new Set(ids);

    /* Tô đè bằng nước vàng **thường**, không phải blend cộng: mặt ô đã sáng màu
       giấy, cộng thêm sáng nữa thì gần như không thấy gì. Viền vàng nhạt kẻ
       quanh ô là thứ đọc ra ngay cả trên ô góc lẫn ô sẫm màu. */
    const color = o.color ?? 0xC8A048;
    const marks = ids.map((id) => {
      const focus = id === o.focus;
      const r = this.add.rectangle(0, 0, 1, 1, color, focus ? 0.52 : 0.30)
        .setStrokeStyle(Math.max(2, this.size * 0.004), 0xFFE9B0, focus ? 1 : 0.85);
      this.coverTile(r, id);
      this.markLayer.add(r);
      return { r, base: focus ? 1 : 0.9 };
    });

    // Một nhịp chung cho cả tập ô, cùng cách làm với vệt đèn nhà cửa
    const beat = { t: 0 };
    this.markTween = this.tweens.add({
      targets: beat, t: 1,
      duration: 880, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      onUpdate: () => { for (const m of marks) m.r.setAlpha(m.base * (0.72 + beat.t * 0.28)); },
    });
  }

  clearMarks() {
    this.markTween?.remove();
    this.markTween = null;
    this.markLayer.removeAll(true);
    this.marked = null;
    this.markSet = null;
    if (this.hoverTile != null) this.input.setDefaultCursor('pointer');
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
