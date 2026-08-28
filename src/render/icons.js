/**
 * Biểu tượng vector cho các ô đặc biệt.
 * Mỗi icon vẽ trong hộp đơn vị tâm gốc toạ độ (−0.5 … 0.5) rồi được
 * scale theo `size` — dùng nét vẽ tay thay cho emoji để giữ đúng phong cách.
 */

export function icon(ctx, kind, x, y, size, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.075;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  (DRAW[kind] ?? DRAW.star)(ctx);
  ctx.restore();
}

/**
 * Tô một dải thon chạy dọc đường tâm `pts`, bề rộng lấy từ `halfW(t)` với
 * t = 0 ở đầu dải, 1 ở cuối. Dùng để dựng thân rồng, lông đuôi phụng — những
 * nét vuốt thon dần vốn là xương sống của lối chạm khắc Việt.
 */
function ribbon(ctx, pts, halfW) {
  const n = pts.length;
  const left = [], right = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const hw = halfW(i / (n - 1));
    left.push({ x: pts[i].x - (dy / len) * hw, y: pts[i].y + (dx / len) * hw });
    right.push({ x: pts[i].x + (dy / len) * hw, y: pts[i].y - (dx / len) * hw });
  }
  ctx.beginPath();
  ctx.moveTo(left[0].x, left[0].y);
  for (const p of left) ctx.lineTo(p.x, p.y);
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
  ctx.closePath();
  ctx.fill();
}

/** Đường tâm lấy mẫu từ một hàm tham số t ∈ [0, 1]. */
const sample = (n, f) => Array.from({ length: n + 1 }, (_, i) => f(i / n));

/** Đường tâm là một cung Bézier bậc ba, lấy mẫu thành điểm cho `ribbon`. */
const bez = (p0, p1, p2, p3, n = 26) => sample(n, (t) => {
  const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return {
    x: a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
    y: a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
  };
});

/**
 * Ngọn lửa / túm bờm: một nét vuốt cong nhọn dần, mọc từ (x, y) theo hướng
 * `ang`, dài `len`, cong về một bên theo `bend`.
 */
function flame(ctx, x, y, ang, len, bend, wide) {
  const cos = Math.cos(ang), sin = Math.sin(ang);
  ribbon(ctx, sample(14, (t) => {
    const u = t * len, v = bend * t * t * len;
    return { x: x + cos * u - sin * v, y: y + sin * u + cos * v };
  }), (t) => wide * (1 - t) ** 1.1 + 0.004);
}

const DRAW = {
  /** Mũi tên BẮT ĐẦU */
  arrow(ctx) {
    ctx.beginPath();
    ctx.moveTo(-0.45, -0.16); ctx.lineTo(0.10, -0.16); ctx.lineTo(0.10, -0.38);
    ctx.lineTo(0.48, 0.0); ctx.lineTo(0.10, 0.38); ctx.lineTo(0.10, 0.16);
    ctx.lineTo(-0.45, 0.16); ctx.closePath(); ctx.fill();
  },

  /** Sao bốn cánh — CƠ HỘI */
  star(ctx) {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? 0.5 : 0.14;
      const px = Math.cos(a) * r, py = Math.sin(a) * r;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill();
  },

  /** Bình gốm — KHÍ VẬN */
  urn(ctx) {
    ctx.beginPath();
    ctx.moveTo(-0.17, -0.42); ctx.lineTo(0.17, -0.42);
    ctx.lineTo(0.13, -0.30);
    ctx.bezierCurveTo(0.42, -0.16, 0.42, 0.24, 0.16, 0.36);
    ctx.lineTo(-0.16, 0.36);
    ctx.bezierCurveTo(-0.42, 0.24, -0.42, -0.16, -0.13, -0.30);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-0.24, 0.42); ctx.lineTo(0.24, 0.42);
    ctx.lineWidth = 0.1; ctx.stroke();
  },

  /** Đầu máy xe lửa — nhà ga */
  train(ctx) {
    ctx.beginPath();
    ctx.rect(-0.42, -0.10, 0.58, 0.40); ctx.fill();
    ctx.beginPath();
    ctx.rect(-0.30, -0.36, 0.30, 0.26); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0.16, 0.06); ctx.lineTo(0.44, 0.06); ctx.lineTo(0.44, 0.30); ctx.lineTo(0.16, 0.30);
    ctx.closePath(); ctx.fill();
    // ống khói
    ctx.beginPath(); ctx.rect(0.24, -0.26, 0.13, 0.20); ctx.fill();
    // bánh
    for (const wx of [-0.26, -0.02, 0.30]) {
      ctx.beginPath(); ctx.arc(wx, 0.38, 0.11, 0, Math.PI * 2); ctx.fill();
    }
  },

  /** Xe đò — bến xe */
  bus(ctx) {
    ctx.beginPath();
    ctx.moveTo(-0.44, -0.28); ctx.lineTo(0.36, -0.28);
    ctx.quadraticCurveTo(0.46, -0.28, 0.46, -0.16);
    ctx.lineTo(0.46, 0.26); ctx.lineTo(-0.44, 0.26); ctx.closePath(); ctx.fill();
    ctx.save(); ctx.globalCompositeOperation = 'destination-out';
    for (const wx of [-0.34, -0.12, 0.10]) { ctx.beginPath(); ctx.rect(wx, -0.20, 0.17, 0.18); ctx.fill(); }
    ctx.restore();
    for (const wx of [-0.26, 0.28]) { ctx.beginPath(); ctx.arc(wx, 0.33, 0.11, 0, Math.PI * 2); ctx.fill(); }
  },

  /** Mỏ neo — cảng thương mại */
  anchor(ctx) {
    ctx.beginPath(); ctx.arc(0, -0.34, 0.11, 0, Math.PI * 2);
    ctx.lineWidth = 0.085; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -0.22); ctx.lineTo(0, 0.40); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-0.22, -0.10); ctx.lineTo(0.22, -0.10); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-0.40, 0.12);
    ctx.quadraticCurveTo(-0.36, 0.44, 0, 0.46);
    ctx.quadraticCurveTo(0.36, 0.44, 0.40, 0.12);
    ctx.stroke();
  },

  /** Giọt nước — thuỷ cục */
  drop(ctx) {
    ctx.beginPath();
    ctx.moveTo(0, -0.46);
    ctx.bezierCurveTo(0.30, -0.08, 0.38, 0.10, 0.30, 0.26);
    ctx.bezierCurveTo(0.18, 0.48, -0.18, 0.48, -0.30, 0.26);
    ctx.bezierCurveTo(-0.38, 0.10, -0.30, -0.08, 0, -0.46);
    ctx.closePath(); ctx.fill();
  },

  /** Tia sét — nhà máy điện */
  bolt(ctx) {
    ctx.beginPath();
    ctx.moveTo(0.14, -0.48); ctx.lineTo(-0.28, 0.06); ctx.lineTo(-0.02, 0.06);
    ctx.lineTo(-0.14, 0.48); ctx.lineTo(0.30, -0.08); ctx.lineTo(0.03, -0.08);
    ctx.closePath(); ctx.fill();
  },

  /** Cân — thuế thu nhập */
  scales(ctx) {
    ctx.beginPath(); ctx.moveTo(0, -0.44); ctx.lineTo(0, 0.34); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-0.40, -0.30); ctx.lineTo(0.40, -0.30); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-0.20, 0.40); ctx.lineTo(0.20, 0.40); ctx.stroke();
    for (const sx of [-0.40, 0.40]) {
      ctx.beginPath();
      ctx.moveTo(sx - 0.17, -0.06);
      ctx.quadraticCurveTo(sx, 0.16, sx + 0.17, -0.06);
      ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(sx, -0.30); ctx.lineTo(sx, -0.06);
      ctx.lineWidth = 0.045; ctx.stroke();
    }
  },

  /** Viên ngọc — thuế xa xỉ */
  gem(ctx) {
    ctx.beginPath();
    ctx.moveTo(-0.30, -0.20); ctx.lineTo(0.30, -0.20); ctx.lineTo(0.46, -0.02);
    ctx.lineTo(0, 0.44); ctx.lineTo(-0.46, -0.02); ctx.closePath(); ctx.fill();
    ctx.save(); ctx.globalCompositeOperation = 'destination-out';
    ctx.lineWidth = 0.04;
    ctx.beginPath();
    ctx.moveTo(-0.30, -0.20); ctx.lineTo(-0.16, -0.02); ctx.lineTo(0.16, -0.02); ctx.lineTo(0.30, -0.20);
    ctx.moveTo(-0.46, -0.02); ctx.lineTo(0.46, -0.02);
    ctx.moveTo(-0.16, -0.02); ctx.lineTo(0, 0.44); ctx.lineTo(0.16, -0.02);
    ctx.stroke(); ctx.restore();
  },

  /** Cổng tam quan — bến đậu */
  gate(ctx) {
    // mái cong
    ctx.beginPath();
    ctx.moveTo(-0.50, -0.20);
    ctx.quadraticCurveTo(0, -0.46, 0.50, -0.20);
    ctx.lineTo(0.42, -0.10);
    ctx.quadraticCurveTo(0, -0.32, -0.42, -0.10);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-0.38, 0.04);
    ctx.quadraticCurveTo(0, -0.16, 0.38, 0.04);
    ctx.lineTo(0.32, 0.12);
    ctx.quadraticCurveTo(0, -0.06, -0.32, 0.12);
    ctx.closePath(); ctx.fill();
    // cột
    for (const cx of [-0.28, 0.22]) { ctx.beginPath(); ctx.rect(cx, 0.10, 0.07, 0.34); ctx.fill(); }
    ctx.beginPath(); ctx.rect(-0.04, 0.10, 0.07, 0.34); ctx.fill();
  },

  /** Song sắt — khám lớn */
  bars(ctx) {
    ctx.lineWidth = 0.085;
    ctx.beginPath(); ctx.rect(-0.40, -0.36, 0.80, 0.72); ctx.stroke();
    for (const bx of [-0.13, 0.13]) {
      ctx.beginPath(); ctx.moveTo(bx, -0.36); ctx.lineTo(bx, 0.36); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(-0.40, 0.0); ctx.lineTo(0.40, 0.0);
    ctx.lineWidth = 0.05; ctx.stroke();
  },

  /**
   * Rồng cuộn — KHÍ VẬN.
   * Dáng rồng thời Lý: thân là một dải tròn lẳn thon dần, uốn thành xoáy ốc
   * gần hai vòng; đầu ngẩng ở mép ngoài với mõm dài, sừng và bờm lửa vuốt
   * ngược, sống lưng mọc vây lửa nhỏ dần về đuôi.
   */
  dragon(ctx) {
    const N = 90;
    const hw = (t) => 0.068 * (1 - t) ** 0.45 + 0.004;
    // Trục thân chạy chéo từ vai xuống đuôi, kèm sóng lượn tắt dần
    const body = sample(N, (t) => {
      const bx = -0.11 + t * 0.44, by = -0.15 + t * 0.44;
      const amp = 0.205 * (1 - t * 0.42) * Math.sin(t * 2.0 * Math.PI);
      return { x: bx - 0.749 * amp, y: by + 0.663 * amp };
    });
    ribbon(ctx, body, hw);

    /* Pháp tuyến trái của thân tại một điểm — dùng để mọc vây lưng về cùng
       một phía, đúng như sống lưng chạy suốt dọc con rồng. */
    const spineNormal = (i) => {
      const p = body[i], q = body[Math.min(N, i + 2)];
      const dx = q.x - p.x, dy = q.y - p.y, L = Math.hypot(dx, dy) || 1;
      return { p, nx: -dy / L, ny: dx / L };
    };

    // Vây lửa dọc sống lưng, ngắn dần về phía đuôi
    for (const [t, len] of [[0.13, 0.17], [0.31, 0.14], [0.51, 0.11], [0.71, 0.08]]) {
      const { p, nx, ny } = spineNormal(Math.round(t * N));
      flame(ctx, p.x + nx * hw(t) * 0.7, p.y + ny * hw(t) * 0.7,
        Math.atan2(ny, nx) - 0.70, len, 0.50, len * 0.26);
    }

    // Chót đuôi xoè thành ngọn lửa
    const tail = spineNormal(N - 3);
    flame(ctx, body[N].x, body[N].y, Math.atan2(tail.ny, tail.nx) - 1.35, 0.15, -0.55, 0.030);
    flame(ctx, body[N].x, body[N].y, Math.atan2(tail.ny, tail.nx) - 1.90, 0.12, 0.55, 0.026);

    // Đầu rồng ngẩng ở đầu dải, quay theo hướng cổ vươn ra
    const head = body[0], next = body[3];
    ctx.save();
    ctx.translate(head.x, head.y);
    ctx.rotate(Math.atan2(head.y - next.y, head.x - next.x));
    ctx.scale(0.36, 0.36);

    ctx.beginPath();
    ctx.moveTo(0, -0.30);
    ctx.bezierCurveTo(0.32, -0.42, 0.60, -0.38, 0.80, -0.20);   // sống mũi
    ctx.lineTo(1.06, -0.30);                                    // mũi hếch
    ctx.bezierCurveTo(1.10, -0.04, 0.94, 0.02, 0.78, 0.00);     // môi trên
    ctx.lineTo(1.08, 0.26);                                     // hàm dưới nhô
    ctx.bezierCurveTo(0.68, 0.36, 0.28, 0.36, 0, 0.30);
    ctx.closePath();
    ctx.fill();

    flame(ctx, 0.10, -0.30, 3.52, 1.15, 0.42, 0.105);           // sừng
    flame(ctx, -0.04, -0.16, 3.28, 0.85, 0.52, 0.078);          // bờm trên
    flame(ctx, -0.06, 0.20, 2.82, 0.62, -0.48, 0.066);          // bờm dưới
    flame(ctx, 0.98, -0.14, 3.44, 1.30, -0.36, 0.046);          // râu mép
    ctx.restore();
  },

  /**
   * Chim phụng — CƠ HỘI.
   * Lối tạo hình dân gian Việt: mào ba ngọn vuốt ngược, cổ vươn cong, cánh
   * xoè thành ba chiếc lông vũ, đuôi ba dải dài vút xuống rồi cuộn ngược lên.
   */
  phoenix(ctx) {
    // Đuôi — vẽ trước để nằm dưới mình chim
    for (const [a, b, c, d, wide] of [
      [[0.02, 0.10], [0.34, 0.34], [0.58, 0.12], [0.42, -0.26], 0.036],
      [[0.00, 0.14], [0.26, 0.44], [0.50, 0.32], [0.46, 0.02], 0.031],
      [[-0.03, 0.17], [0.14, 0.46], [0.36, 0.52], [0.22, 0.42], 0.026],
    ]) {
      ribbon(ctx, bez(a, b, c, d), (t) => wide * (1 - t) ** 0.75 + 0.003);
    }

    // Cánh xoè: một khối cánh liền, mép ngoài xoè ra hai chiếc lông vũ
    ctx.beginPath();
    ctx.moveTo(-0.14, -0.02);
    ctx.bezierCurveTo(-0.02, -0.26, 0.16, -0.38, 0.34, -0.40);
    ctx.bezierCurveTo(0.24, -0.22, 0.14, -0.08, 0.04, 0.06);
    ctx.closePath();
    ctx.fill();
    flame(ctx, -0.05, -0.10, -0.86, 0.40, 0.24, 0.034);
    flame(ctx, 0.01, -0.02, -0.60, 0.32, 0.30, 0.028);

    // Mình chim
    ctx.beginPath();
    ctx.moveTo(-0.19, -0.07);
    ctx.bezierCurveTo(-0.05, -0.16, 0.10, -0.03, 0.06, 0.14);
    ctx.bezierCurveTo(0.01, 0.27, -0.17, 0.25, -0.23, 0.11);
    ctx.bezierCurveTo(-0.28, 0.02, -0.26, -0.03, -0.19, -0.07);
    ctx.closePath();
    ctx.fill();

    // Cổ vươn
    ribbon(ctx, bez([-0.18, -0.01], [-0.29, -0.09], [-0.28, -0.23], [-0.32, -0.31]),
      (t) => 0.048 - t * 0.016);

    // Đầu + mỏ nhọn
    ctx.beginPath();
    ctx.moveTo(-0.28, -0.28);
    ctx.bezierCurveTo(-0.35, -0.42, -0.46, -0.42, -0.48, -0.33);
    ctx.lineTo(-0.60, -0.28);
    ctx.lineTo(-0.46, -0.22);
    ctx.bezierCurveTo(-0.40, -0.18, -0.30, -0.20, -0.28, -0.28);
    ctx.closePath();
    ctx.fill();

    // Mào ba ngọn vuốt ngược ra sau gáy
    flame(ctx, -0.38, -0.39, -0.30, 0.28, 0.60, 0.030);
    flame(ctx, -0.32, -0.37, -0.02, 0.24, 0.62, 0.026);
    flame(ctx, -0.27, -0.24, 0.42, 0.20, 0.55, 0.024);
  },

  /** Còng tay — vào tù */
  cuffs(ctx) {
    ctx.lineWidth = 0.10;
    ctx.beginPath(); ctx.arc(-0.22, 0.06, 0.24, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(0.22, 0.06, 0.24, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.rect(-0.06, -0.06, 0.12, 0.13); ctx.fill();
  },
};

/**
 * Ô nào dùng icon nào.
 * Khí Vận mang hình rồng, Cơ Hội mang hình phụng — long chầu phụng múa, cặp
 * linh vật quen thuộc trên đình chùa và tranh dân gian.
 */
export const TILE_ICON = {
  0: 'arrow', 2: 'dragon', 4: 'scales', 5: 'bus', 7: 'phoenix', 10: 'bars',
  12: 'drop', 15: 'train', 17: 'dragon', 20: 'gate', 22: 'phoenix', 25: 'anchor',
  28: 'bolt', 30: 'cuffs', 33: 'dragon', 35: 'train', 36: 'phoenix', 38: 'gem',
};
