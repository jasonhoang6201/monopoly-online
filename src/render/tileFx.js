/**
 * Hoạt cảnh trên một ô đất: xây nhà, động đất, hoả hoạn, thế chấp, chuộc lại.
 *
 * Module này chỉ vẽ canvas 2D, không đụng Phaser. `BoardScene` cấp cho mỗi
 * hoạt cảnh hai tấm canvas — `under` nằm dưới quân cờ (vết nứt, vết sém, bản
 * sao ô đang rung), `over` nằm trên quân cờ (búa, biển, lửa, bụi) — rồi mỗi
 * khung hình gọi `draw` và dán hai tấm ấy lên đúng ô, xoay theo `tileAngle`.
 *
 * Toạ độ vẽ là **hệ của ô**: gốc ở tâm ô, trục −Y chỉ vào lòng bàn cờ (mép
 * trong, chỗ có cổng và vệt đèn nhà). Đơn vị đo sao cho ô rộng đúng
 * `FX_TILE_W`; nửa chiều cao `hh` tuỳ ô. Nhờ vậy ô ở cạnh nào cũng dùng chung
 * một bộ số, và búa hay biển đổ theo đúng chiều chữ trên ô ấy.
 *
 * Không vẽ chữ nổi hay huy hiệu sự kiện — Jason chỉ muốn chuyển động của đất
 * và nhà, còn chữ đã có dòng thông báo lo.
 */

const TAU = Math.PI * 2;

/** Bề ngang ô trong hệ đơn vị hoạt cảnh. */
export const FX_TILE_W = 124;
const HW = FX_TILE_W / 2;

/**
 * Căn nhà và biển vẽ to hơn tỉ lệ thật so với ô: ô trên bàn chỉ rộng chừng
 * 80px, đúng tỉ lệ thì máy khác dễ bỏ sót. Búa thì không — búa phải nằm gọn
 * trong bề ngang ô, xem `build`.
 */
const PROP = 1.3;

/** Khoảng chừa quanh ô cho búa, biển, mảnh vụn văng ra. */
const PAD_X = 96, PAD_TOP = 160, PAD_BOTTOM = 96;

/** Khung canvas của một hoạt cảnh, theo đơn vị hoạt cảnh. */
export function fxBox(hh) {
  return { left: -HW - PAD_X, top: -hh - PAD_TOP, width: FX_TILE_W + PAD_X * 2, height: hh * 2 + PAD_TOP + PAD_BOTTOM };
}

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const eOutCubic = (x) => 1 - Math.pow(1 - x, 3);
const eInQuad = (x) => x * x;
const eOutBack = (x) => { const c = 1.9; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const rnd = (a, b) => a + Math.random() * (b - a);

// ------------------------------------------------------------------ hình phụ

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

function drawHouse(g, x, y, s, hotel, alpha = 1, burnt = 0) {
  g.save();
  g.globalAlpha *= alpha;
  const k = hotel ? s * 1.25 : s;
  g.beginPath();
  g.moveTo(x, y - k * 0.62);
  g.lineTo(x + k * 0.55, y - k * 0.1); g.lineTo(x + k * 0.4, y - k * 0.1);
  g.lineTo(x + k * 0.4, y + k * 0.45); g.lineTo(x - k * 0.4, y + k * 0.45);
  g.lineTo(x - k * 0.4, y - k * 0.1); g.lineTo(x - k * 0.55, y - k * 0.1);
  g.closePath();
  const base = hotel ? [178, 47, 38] : [46, 107, 82];
  const dim = 1 - burnt * 0.8;
  g.fillStyle = `rgb(${base[0] * dim},${base[1] * dim},${base[2] * dim})`;
  g.fill();
  g.lineWidth = 1.6;
  g.strokeStyle = burnt > 0.5 ? '#2A1A12' : '#F4E6C4';
  g.stroke();
  g.restore();
}

/** Nhãn đỏ "THẾ CHẤP", cùng cỡ với nhãn `BoardScene.addMortgageTag` dựng. */
function mortTag(g, x, y, scale = 1, alpha = 1) {
  g.save();
  g.globalAlpha *= alpha;
  g.translate(x, y); g.scale(scale, scale);
  g.font = `700 ${Math.round(FX_TILE_W * 0.15)}px "Be Vietnam Pro", ui-sans-serif, sans-serif`;
  const tw = Math.min(g.measureText('THẾ CHẤP').width, FX_TILE_W * 0.78);
  const w = tw + FX_TILE_W * 0.12, h = FX_TILE_W * 0.15 * 1.2 + FX_TILE_W * 0.06;
  g.fillStyle = 'rgba(0,0,0,.35)'; roundRect(g, -w / 2, -h / 2 + h * 0.1, w, h, h * 0.22); g.fill();
  g.fillStyle = '#B3322A'; roundRect(g, -w / 2, -h / 2, w, h, h * 0.22); g.fill();
  g.fillStyle = '#FFE6DF'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('THẾ CHẤP', 0, 1, tw);
  g.restore();
}

/** Biển gỗ cắm cọc — chân cọc ở (x, y). Mặt bảng có tâm cách chân cọc `SIGN_RISE`. */
const SIGN_RISE = 82;
function signPost(g, x, y, sy = 1, rot = 0, alpha = 1) {
  g.save();
  g.globalAlpha *= alpha;
  g.translate(x, y); g.rotate(rot); g.scale(1, sy);
  g.fillStyle = '#6B4A2F'; g.fillRect(-3.5, -78, 7, 78);
  g.fillStyle = '#4E331E'; g.fillRect(1, -78, 2.5, 78);
  g.beginPath(); g.moveTo(-3.5, 0); g.lineTo(0, 7); g.lineTo(3.5, 0); g.fill();
  const bw = 96, bh = 44, by = -104;
  g.fillStyle = '#3A2414'; roundRect(g, -bw / 2 - 3, by - 3, bw + 6, bh + 6, 5); g.fill();
  g.fillStyle = '#F4E6C4'; roundRect(g, -bw / 2, by, bw, bh, 3); g.fill();
  g.fillStyle = '#B3322A'; g.fillRect(-bw / 2, by, bw, 8);
  g.font = '700 15px "Be Vietnam Pro", ui-sans-serif, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('THẾ CHẤP', 0, by + 22);
  g.fillStyle = '#6B4A2F'; g.font = '600 9px "Be Vietnam Pro", ui-sans-serif, sans-serif';
  g.fillText('NGÂN HÀNG GIỮ', 0, by + 36);
  g.fillStyle = '#3A2414';
  for (const nx of [-bw / 2 + 5, bw / 2 - 5]) { g.beginPath(); g.arc(nx, by + 13, 1.6, 0, TAU); g.fill(); }
  g.restore();
}

/**
 * Vẽ lại mặt ô từ ảnh bàn cờ vào hệ của ô, phủ nước màu chủ đất. Dùng khi phải
 * làm ô chuyển động (động đất) hay che một phần ô (chuộc lại).
 */
function drawTileCopy(g, src, wash) {
  g.save();
  g.rotate(-src.angle);
  g.drawImage(src.img, src.sx, src.sy, src.sw, src.sh, -src.dw / 2, -src.dh / 2, src.dw, src.dh);
  g.restore();
  if (wash) {
    g.save();
    g.globalAlpha = wash.alpha; g.fillStyle = wash.css;
    g.fillRect(-HW, -src.hh, FX_TILE_W, src.hh * 2);
    g.restore();
  }
}

// ------------------------------------------------------------------ hạt

function stepParticles(list, dt) {
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    p.age += dt;
    if (p.age >= p.life) { list.splice(i, 1); continue; }
    p.vy += (p.grav || 0) * dt;
    if (p.drag) { p.vx *= p.drag; p.vy *= p.drag; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.rot = (p.rot || 0) + (p.spin || 0) * dt;
  }
}

function drawParticles(g, list) {
  for (const p of list) {
    const k = p.age / p.life;
    g.save();
    if (p.add) g.globalCompositeOperation = 'lighter';
    if (p.kind === 'dust') {
      g.globalAlpha = (1 - k) * 0.55;
      g.fillStyle = p.color || '#D8C49B';
      g.beginPath(); g.arc(p.x, p.y, p.size * (0.6 + k * 1.2), 0, TAU); g.fill();
    } else if (p.kind === 'spark') {
      g.globalAlpha = 1 - k;
      g.strokeStyle = '#FFE9A8'; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); g.stroke();
    } else if (p.kind === 'chunk') {
      g.globalAlpha = k < 0.8 ? 1 : (1 - k) / 0.2;
      g.translate(p.x, p.y); g.rotate(p.rot);
      g.fillStyle = p.color; g.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7);
    } else if (p.kind === 'flame') {
      const r = p.size * (1 - k * 0.7);
      const col = k < 0.25 ? '255,236,170' : k < 0.6 ? '255,150,46' : '196,52,26';
      const grd = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      grd.addColorStop(0, `rgba(${col},${0.85 * (1 - k)})`);
      grd.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = grd; g.beginPath(); g.arc(p.x, p.y, r, 0, TAU); g.fill();
    } else if (p.kind === 'smoke') {
      g.globalAlpha = (k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8) * 0.42;
      g.fillStyle = '#4A3C34';
      g.beginPath(); g.arc(p.x, p.y, p.size * (0.7 + k * 1.6), 0, TAU); g.fill();
    } else if (p.kind === 'ember') {
      g.globalAlpha = (1 - k) * (0.6 + 0.4 * Math.sin(p.age * 40));
      g.fillStyle = '#FFC45C'; g.beginPath(); g.arc(p.x, p.y, 1.4, 0, TAU); g.fill();
    } else if (p.kind === 'glint') {
      g.globalAlpha = Math.sin(k * Math.PI);
      g.fillStyle = '#FFF1C2';
      g.translate(p.x, p.y); g.rotate(Math.PI / 4);
      g.fillRect(-p.size / 2, -0.8, p.size, 1.6); g.fillRect(-0.8, -p.size / 2, 1.6, p.size);
    }
    g.restore();
  }
}

function puff(list, x, y, n, spread, color) {
  for (let i = 0; i < n; i++) {
    const a = rnd(Math.PI * 1.05, Math.PI * 1.95);
    const v = rnd(30, 90);
    list.push({
      kind: 'dust', x: x + rnd(-spread / 2, spread / 2), y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6,
      drag: 0.94, life: rnd(0.45, 0.8), age: 0, size: rnd(4, 8), color,
    });
  }
}

// ------------------------------------------------------------------ hoạt cảnh

/**
 * Mỗi hoạt cảnh là `{ dur, draw(t, dt, under, over), finish() }`. `draw` nhận
 * t tính bằng giây; hai context đã đặt sẵn phép biến đổi về hệ của ô.
 *
 * `env` do `BoardScene` dựng:
 *   hh            nửa chiều cao ô (đơn vị hoạt cảnh)
 *   headerBottom  mép dưới cổng đầu ô, tính theo tỉ lệ chiều cao ô
 *   tagY          tâm nhãn "THẾ CHẤP" trên ô
 *   house, hotel  ô có nhà bị mất / căn vừa xây là khách sạn
 *   src, graySrc  ảnh mặt ô (màu / xám) để `drawTileCopy`
 *   wash          nước màu chủ đất { css, alpha }
 *   sfx(name)     phát tiếng — hàm rỗng nếu hoạt cảnh này không được kêu
 *   setGlow(v)    độ tỏ vệt đèn nhà của ô (null = trả về bình thường)
 *   setMort(v)    độ hiện bản xám và nhãn đỏ của ô (null = trả về bình thường)
 */
const FX = {
  /** Búa gõ 3 nhịp vào đầu ô, căn nhà bật lên rồi chìm vào vệt đèn mép trong. */
  build(env) {
    const parts = [];
    const { hh } = env;
    const ix = 0, iy = -hh + hh * 2 * env.headerBottom * 0.5;
    const cycle = 0.26, hitAt = 0.19, popT = 0.05 + 3 * cycle;
    let hits = 0;
    env.setGlow(env.glowFrom);
    return {
      dur: 1.35,
      draw(t, dt, under, over) {
        let lift = 0;
        for (let i = 0; i < 3; i++) {
          const c0 = 0.05 + i * cycle;
          const k = t - c0;
          if (k >= 0 && k < cycle) {
            lift = k < hitAt * 0.7 ? eOutCubic(k / (hitAt * 0.7)) * 1.05
              : k < hitAt ? 1.05 * (1 - eInQuad((k - hitAt * 0.7) / (hitAt * 0.3)))
                : -0.06 * (1 - (k - hitAt) / (cycle - hitAt));
          }
          if (t >= c0 + hitAt && hits <= i) {
            hits = i + 1;
            puff(parts, ix - 6, iy + 6, 6, 18);
            for (let j = 0; j < 7; j++) {
              // Tia lửa bắn chếch lên, đủ ngắn để rơi lại trong bề ngang ô
              const a = rnd(-Math.PI * 0.85, -Math.PI * 0.15), v = rnd(70, 140);
              parts.push({ kind: 'spark', x: ix - 8, y: iy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, grav: 500, life: rnd(0.2, 0.35), age: 0 });
            }
            env.sfx('knock');
          }
        }
        // Vệt đèn lên một nấc lúc căn nhà chìm vào mép trong, loé lên rồi dịu lại
        if (t >= popT + 0.35) {
          const up = seg(t, popT + 0.35, popT + 0.55), down = seg(t, popT + 0.55, 1.35);
          env.setGlow(env.glowFrom + (1.35 - env.glowFrom) * up - 0.35 * down);
        }

        if (t >= popT) {
          const up = eOutBack(seg(t, popT, popT + 0.22));
          const sink = eInQuad(seg(t, popT + 0.3, popT + 0.5));
          const y = iy - 30 * PROP * up + sink * (-hh - (iy - 30 * PROP) + 2);
          const sc = (0.2 + 0.8 * up) * (1 - sink * 0.6);
          drawHouse(over, ix, y, 26 * PROP * sc, env.hotel, 1 - sink * 0.9);
        }

        /* Búa: tay cầm quay quanh chỗ nắm tay. Chỗ nắm nằm trong mép phải của
           ô và cán ngắn vừa tới giữa ô, nên cả lúc giơ lên lẫn lúc gõ xuống búa
           vẫn nằm trong bề ngang ô (x từ −HW tới HW) — không lấn sang ô bên.
           Giơ lên thì đầu búa vượt qua mép trong, vào lòng bàn cờ trống. */
        if (t < popT + 0.1) {
          const hand = { x: HW - 12, y: iy - 6 };
          const aim = { x: ix, y: iy - 12 };
          const ang = Math.atan2(aim.y - hand.y, aim.x - hand.x) + lift;
          const L = Math.hypot(aim.x - hand.x, aim.y - hand.y) - 2;
          const alpha = t < 0.05 ? t / 0.05 : 1 - seg(t, popT - 0.02, popT + 0.1);
          over.save();
          over.globalAlpha = alpha;
          over.translate(hand.x, hand.y); over.rotate(ang);
          over.fillStyle = 'rgba(0,0,0,.3)'; over.fillRect(0, 1, L, 6);
          over.fillStyle = '#8A5A34'; over.fillRect(0, -3, L, 6);
          over.fillStyle = '#6B4225'; over.fillRect(0, 1, L, 2);
          over.fillStyle = '#5C5550'; roundRect(over, L - 6, -15, 16, 30, 2.5); over.fill();
          over.fillStyle = '#8E8680'; over.fillRect(L - 6, -15, 4, 30);
          over.restore();
        }
        stepParticles(parts, dt); drawParticles(over, parts);
      },
      finish() { env.setGlow(null); },
    };
  },

  /** Ô rung tắt dần, vết nứt lan từ tâm, mảnh vụn rơi, một căn nhà lăn khỏi vệt đèn. */
  quake(env) {
    const parts = [];
    const { hh } = env;
    const cracks = [];
    const root = { x: 4, y: hh * 0.16 };
    for (let b = 0; b < 4; b++) {
      const pts = [{ ...root }];
      let a = b * (TAU / 4) + rnd(-0.5, 0.5);
      let p = { ...root };
      for (let i = 0; i < 5 + (b % 2); i++) {
        a += rnd(-0.7, 0.7);
        p = {
          x: clamp(p.x + Math.cos(a) * rnd(10, 18), -HW + 3, HW - 3),
          y: clamp(p.y + Math.sin(a) * rnd(10, 18), -hh + hh * 2 * env.headerBottom, hh - 3),
        };
        pts.push(p);
      }
      cracks.push(pts);
    }
    let debris = 0, dust = false;
    env.sfx('rumble');
    return {
      dur: 2.2,
      draw(t, dt, under, over) {
        const shakeK = seg(t, 0.25, 0.4) * (1 - seg(t, 0.4, 1.7));
        const sx = Math.sin(t * 58) * 6 * shakeK;
        const sy = Math.cos(t * 43) * 2.5 * shakeK;
        const rot = Math.sin(t * 37) * 0.025 * shakeK;
        const fade = 1 - seg(t, 1.7, 2.2);

        // Ô rung trong "hốc" của nó: tô tối chỗ ô, rồi dựng bản sao ô lệch đi
        under.save();
        under.globalAlpha = fade;
        under.fillStyle = '#140906';
        under.fillRect(-HW, -hh, FX_TILE_W, hh * 2);
        under.translate(sx, sy); under.rotate(rot);
        drawTileCopy(under, env.mortgaged ? env.graySrc : env.src, env.wash);
        const reveal = eOutCubic(seg(t, 0.35, 1.1));
        if (reveal > 0) {
          under.lineJoin = 'round';
          for (const pts of cracks) {
            const n = (pts.length - 1) * reveal;
            const path = () => {
              under.beginPath(); under.moveTo(pts[0].x, pts[0].y);
              for (let i = 1; i <= Math.ceil(n); i++) {
                const k = Math.min(1, n - (i - 1));
                under.lineTo(pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k, pts[i - 1].y + (pts[i].y - pts[i - 1].y) * k);
              }
            };
            path(); under.lineWidth = 3.2; under.strokeStyle = 'rgba(255,245,220,.55)'; under.stroke();
            path(); under.lineWidth = 1.8; under.strokeStyle = '#2A170D'; under.stroke();
          }
        }
        under.restore();

        if (t > 0.45 && t < 1.4 && debris < 22 && Math.random() < 0.55) {
          debris++;
          const x = Math.random() < 0.5 ? -HW + rnd(0, 6) : HW - rnd(0, 6);
          parts.push({
            kind: 'chunk', x, y: rnd(-hh * 0.4, hh), vx: rnd(-40, 40), vy: rnd(-60, 0), grav: 700,
            spin: rnd(-10, 10), life: 0.9, age: 0, size: rnd(3, 6), color: Math.random() < 0.5 ? '#CDB78C' : '#8A6A48',
          });
        }
        if (t > 0.35 && !dust) { dust = true; puff(parts, 0, hh + 2, 10, FX_TILE_W, '#9C8466'); }

        if (env.house) {
          const hp = seg(t, 0.8, 1.7);
          if (hp > 0 && hp < 1) {
            over.save();
            over.translate(hp * 70, -hh - 16 - Math.sin(hp * Math.PI) * 26 + eInQuad(hp) * 150);
            over.rotate(hp * 4);
            drawHouse(over, 0, 0, 22 * PROP, false, 1 - seg(hp, 0.6, 1));
            over.restore();
          }
        }
        stepParticles(parts, dt); drawParticles(over, parts);
      },
      finish() {},
    };
  },

  /** Lửa bốc từ chân ô, khói, tàn lửa; mặt ô sém dần rồi nhạt lại; căn nhà đen đi rồi mất. */
  fire(env) {
    const parts = [];
    const { hh } = env;
    let acc = 0;
    env.sfx('crackle');
    return {
      dur: 2.3,
      draw(t, dt, under, over) {
        const burn = seg(t, 0.15, 0.5) * (1 - seg(t, 1.5, 2.1));
        acc += dt * 90 * burn;
        while (acc > 1) {
          acc--;
          parts.push({
            kind: 'flame', add: true, x: rnd(-HW + 6, HW - 6), y: hh - rnd(0, hh * 0.9),
            vx: rnd(-12, 12), vy: rnd(-110, -60), life: rnd(0.4, 0.8), age: 0, size: rnd(9, 17),
          });
          if (Math.random() < 0.3) parts.push({
            kind: 'smoke', x: rnd(-HW + 10, HW - 10), y: -hh + hh * 2 * rnd(0.2, 0.5),
            vx: rnd(-10, 14), vy: rnd(-50, -30), life: rnd(1.0, 1.6), age: 0, size: rnd(8, 13),
          });
          if (Math.random() < 0.15) parts.push({
            kind: 'ember', add: true, x: rnd(-HW, HW), y: -hh + hh * 2 * rnd(0.3, 0.9),
            vx: rnd(-30, 30), vy: rnd(-120, -60), drag: 0.985, life: rnd(0.7, 1.2), age: 0,
          });
        }

        // Sém: nâu đen phủ từ chân ô lên, rồi nhạt về lại lúc lửa tắt
        const scorch = seg(t, 0.2, 1.2) * (1 - seg(t, 1.7, 2.3));
        if (scorch > 0) {
          const top = hh - hh * 1.8 * scorch;
          const grd = under.createLinearGradient(0, hh, 0, top);
          grd.addColorStop(0, `rgba(30,12,4,${0.72 * scorch})`);
          grd.addColorStop(1, 'rgba(30,12,4,0)');
          under.fillStyle = grd; under.fillRect(-HW, top, FX_TILE_W, hh - top);
        }
        // Ánh lửa hắt ra quanh ô, chập chờn
        if (burn > 0) {
          const fl = 0.75 + 0.25 * Math.sin(t * 31) * Math.sin(t * 17);
          const grd = under.createRadialGradient(0, hh * 0.6, 10, 0, hh * 0.6, 150);
          grd.addColorStop(0, `rgba(255,120,30,${0.35 * burn * fl})`);
          grd.addColorStop(1, 'rgba(255,120,30,0)');
          under.save(); under.globalCompositeOperation = 'lighter';
          under.fillStyle = grd; under.fillRect(-HW - 60, -hh - 60, FX_TILE_W + 120, hh * 2 + 120);
          under.restore();
        }
        if (env.house) {
          const hp = seg(t, 0.4, 1.3);
          if (hp > 0 && hp < 1) drawHouse(over, 0, -hh - 18 * PROP - hp * 6, 22 * PROP, false, 1 - seg(hp, 0.7, 1), seg(hp, 0, 0.6));
        }
        stepParticles(parts, dt); drawParticles(over, parts);
      },
      finish() {},
    };
  },

  /** Biển gỗ cắm xuống giữa ô, ô phai xám, biển thu nhỏ thành nhãn đỏ ở chân ô. */
  mortgage(env) {
    const parts = [];
    const { hh } = env;
    const hitT = 0.34;
    const py = hh * 0.24;
    let hit = false;
    env.setMort({ gray: 0, tag: 0, tagScale: 0.5 });
    return {
      dur: 1.45,
      draw(t, dt, under, over) {
        if (t >= hitT && !hit) {
          hit = true;
          env.sfx('thud');
          puff(parts, 0, py + 2, 12, 20, '#E4D3AE');
          for (let j = 0; j < 5; j++) parts.push({
            kind: 'chunk', x: rnd(-6, 6), y: py, vx: rnd(-80, 80), vy: rnd(-140, -60), grav: 600,
            spin: rnd(-12, 12), life: 0.5, age: 0, size: rnd(2, 4), color: '#8A6A48',
          });
        }
        env.setMort({
          gray: eOutCubic(seg(t, hitT + 0.05, hitT + 0.5)),
          tag: seg(t, 1.05, 1.2),
          tagScale: 0.5 + 0.5 * eOutBack(seg(t, 1.1, 1.45)),
        });

        const shrink = eInQuad(seg(t, 1.0, 1.35));
        if (shrink < 1) {
          const fall = eInQuad(seg(t, 0, hitT));
          const y0 = -hh - 110 + (py + hh + 110) * fall;
          const squash = t < hitT ? 1
            : 1 - 0.14 * Math.sin(seg(t, hitT, hitT + 0.28) * Math.PI) * (1 - seg(t, hitT, hitT + 0.28));
          const sway = t < hitT ? -0.12 * (1 - fall)
            : Math.sin((t - hitT) * 22) * 0.06 * (1 - seg(t, hitT, hitT + 0.5));
          const s = (1 - shrink * 0.6) * PROP;
          // Chân cọc trượt sao cho tâm mặt bảng về đúng chỗ nhãn đỏ
          const baseY = y0 + (env.tagY + SIGN_RISE * 0.4 * PROP - y0) * shrink;
          over.save();
          over.translate(0, baseY); over.scale(s, s);
          signPost(over, 0, 0, squash, sway, 1 - shrink);
          over.restore();
        }
        stepParticles(parts, dt); drawParticles(over, parts);
      },
      finish() { env.setMort(null); },
    };
  },

  /** Nhãn đỏ bật khỏi ô, màu thật tràn lại từ chân ô lên đầu ô. */
  redeem(env) {
    const parts = [];
    const { hh } = env;
    let rang = false;
    return {
      dur: 1.3,
      draw(t, dt, under, over) {
        if (!rang && t > 0.3) { rang = true; env.sfx('redeem'); }
        const wipe = eOutCubic(seg(t, 0.3, 0.95));
        const line = hh - hh * 2 * wipe;
        if (wipe < 1) {
          // Phần phía trên vạch màu vẫn là ô xám của lúc còn thế chấp
          under.save();
          under.beginPath(); under.rect(-HW, -hh, FX_TILE_W, line + hh); under.clip();
          drawTileCopy(under, env.graySrc, { css: env.wash.css, alpha: env.wash.alpha * 0.5 });
          under.restore();
          if (wipe > 0) {
            const grd = under.createLinearGradient(0, line - 8, 0, line + 8);
            grd.addColorStop(0, 'rgba(233,206,133,0)');
            grd.addColorStop(0.5, 'rgba(233,206,133,.8)');
            grd.addColorStop(1, 'rgba(233,206,133,0)');
            under.fillStyle = grd; under.fillRect(-HW - 4, line - 8, FX_TILE_W + 8, 16);
            if (Math.random() < 0.7) parts.push({
              kind: 'glint', x: rnd(-HW, HW), y: line + rnd(-3, 3), vx: 0, vy: rnd(-20, -5), life: 0.45, age: 0, size: rnd(5, 9),
            });
          }
        }
        const off = seg(t, 0, 0.55);
        if (off < 1) {
          over.save();
          over.translate(eInQuad(off) * 90, env.tagY - Math.sin(off * Math.PI) * 30 - eInQuad(off) * 120);
          over.rotate(eInQuad(off) * 1.2);
          mortTag(over, 0, 0, 1 + off * 0.2, 1 - seg(off, 0.6, 1));
          over.restore();
        }
        stepParticles(parts, dt); drawParticles(over, parts);
      },
      finish() {},
    };
  },
};

/** Dựng một hoạt cảnh. Trả về null nếu `kind` lạ. */
export function makeTileFx(kind, env) {
  return FX[kind] ? FX[kind](env) : null;
}
