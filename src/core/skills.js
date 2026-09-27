/**
 * Luật học kỹ năng — thuần dữ liệu như state.js, chạy được dưới Node.
 *
 * Người chơi cần mang `skillPoints` (số điểm chưa tiêu), `skills` (mảng id đã
 * học) và `money` (trả phí tẩy điểm). Mảng chứ không Set để còn đi thẳng vào
 * ảnh chụp JSON phát cho các máy khác.
 */
import {
  SKILLS, BRANCHES, TIER_COST, LEVEL_COST, MAX_LEVEL, RESPEC_FEE, ULT_MIX, ULT_SPECIAL,
  FEATS, BROKE_LINE, WAYS,
} from '../data/skills.js';
import { BOARD, money } from '../data/board.js';

const BY_ID = new Map(SKILLS.map((s) => [s.id, s]));

export const skillById = (id) => BY_ID.get(id) ?? null;
export const branchByKey = (key) => BRANCHES.find((b) => b.key === key) ?? null;
/** Giá mở ô (level 1). */
export const skillCost = (s) => TIER_COST[s.tier];
export const branchSkills = (key) => SKILLS.filter((s) => s.branch === key);

/**
 * Level đang có: 0 là chưa học. `skillLv` chỉ ghi ô từ level 2 trở lên — ô
 * học rồi mà không có trong đó là level 1, nên ảnh chụp cũ (trước khi có
 * level) dựng lại vẫn đúng.
 */
export const levelOf = (p, id) => (p?.skills?.includes(id) ? (p.skillLv?.[id] ?? 1) : 0);

/** Bộ số của một level (1..3). */
export const lvParams = (s, lv) => s.levels[Math.min(MAX_LEVEL, Math.max(1, lv)) - 1];

/* ------------------------------------------------------------ tiến độ */

/** Số đếm hiện tại của một thành tựu. */
export function featValue(p, key) {
  if (key === 'laps') return p?.laps ?? 0;
  if (key === 'jails') return p?.jails ?? 0;
  return p?.feats?.[key] ?? 0;
}

/** Kỹ năng thành tựu đã đủ điều kiện mở khoá chưa. Ô thường luôn là true. */
export const featMet = (p, s) => !s.feat || featValue(p, s.feat.key) >= s.feat.n;

/** Cộng vào một bộ đếm thành tựu. `laps`, `jails` tự tăng ở chỗ khác. */
export function bumpFeat(p, key, n = 1) {
  if (!p || p.bankrupt || !n) return;
  p.feats = { ...p.feats, [key]: (p.feats?.[key] ?? 0) + n };
}

/**
 * Tiền mặt vừa đổi: tụt xuống dưới `BROKE_LINE` từ trên đó thì tính một lần
 * cho thành tựu `broke`. `low` nhớ đang ở dưới vạch — nằm lì dưới vạch nhiều
 * lượt vẫn chỉ là một lần, phải lên lại rồi tụt nữa mới đếm tiếp.
 */
export function watchCash(p) {
  if (!p || p.bankrupt) return;
  const low = p.money < BROKE_LINE;
  if (low && !p.feats?.low) p.feats = { ...p.feats, low: true, broke: (p.feats?.broke ?? 0) + 1 };
  else if (!low && p.feats?.low) p.feats = { ...p.feats, low: false };
}

/** Tiến độ của một kỹ năng đã học: số lần đã chạy và số tiền đã mang về. */
export const usage = (p, id) => ({ uses: p?.skillUse?.[id]?.n ?? 0, gain: p?.skillUse?.[id]?.gain ?? 0 });

/**
 * Kỹ năng vừa chạy một lần, mang về `gain` tiền (được nhận thêm, hoặc được
 * bớt khi phải trả). Mọi chỗ kỹ năng phát huy tác dụng đều gọi hàm này — đó là
 * số liệu cho điều kiện lên level.
 *
 * Không ghi gì nếu người này không học kỹ năng đó, nên bên gọi khỏi phải hỏi
 * `has` lần nữa.
 */
export function credit(p, id, gain = 0) {
  if (!has(p, id)) return;
  const u = usage(p, id);
  p.skillUse = { ...p.skillUse, [id]: { ...p.skillUse?.[id], n: u.uses + 1, gain: u.gain + Math.max(0, Math.round(gain)) } };
}

/**
 * Còn thiếu gì để lên level `lv` (2 hoặc 3). `null` là đủ rồi.
 * @returns {?{by:string, need:number, have:number}}
 */
export function growNeed(p, s, lv) {
  if (!s.grow || lv < 2) return null;
  const need = s.grow.at[lv - 2];
  const have = usage(p, s.id)[s.grow.by];
  return have >= need ? null : { by: s.grow.by, need, have };
}

/** Chữ cho điều kiện lên level `lv`: "Kiếm được 150$ từ kỹ năng này". */
export function growText(s, lv) {
  const need = s.grow.at[lv - 2];
  return s.grow.by === 'gain'
    ? `Kiếm được ${money(need)} từ kỹ năng này`
    : (s.grow.say ?? 'Kỹ năng chạy {n} lần').replace('{n}', need);
}

/** Chữ tiến độ của một điều kiện: "120/150$", "3/5 lần". */
export function progressText(have, need, isMoney, unit = 'lần') {
  return isMoney ? `${money(Math.min(have, need)).replace(/\$$/, '')}/${money(need)}` : `${Math.min(have, need)}/${need} ${unit}`;
}

/** Chữ điều kiện mở khoá của kỹ năng thành tựu kèm tiến độ. */
export function featText(p, s) {
  const f = FEATS[s.feat.key];
  const have = featValue(p, s.feat.key);
  return `${f.text}: ${progressText(have, s.feat.n, !!f.money, f.unit)}`;
}

/** Giá bước kế tiếp của ô này với người này: mở ô, hay lên một level. */
export const nextCost = (p, s) => (levelOf(p, s.id) ? LEVEL_COST : skillCost(s));

/** Tổng điểm đã đổ vào một ô: giá mở + mỗi level thêm. */
const sunk = (p, s) => {
  const lv = levelOf(p, s.id);
  return lv ? skillCost(s) + (lv - 1) * LEVEL_COST : 0;
};

/**
 * Tình trạng một ô trên cây, theo thứ tự ưu tiên:
 *  - `learned` đã học (level bao nhiêu thì hỏi `levelOf`)
 *  - `locked`  chưa học ô đứng trước
 *  - `poor`    đủ điều kiện nhưng thiếu điểm
 *  - `ready`   học được ngay
 */
export function skillState(player, id) {
  const s = skillById(id);
  if (player.skills.includes(id)) return 'learned';
  if (!prereqMet(player, s) || !featMet(player, s) || rivalUlt(player, s)) return 'locked';
  return player.skillPoints >= skillCost(s) ? 'ready' : 'poor';
}

/** Ô đã học, chưa tới level tối đa, đã đạt điều kiện và đang đủ điểm để lên. */
export const canLevelUp = (player, id) => {
  const lv = levelOf(player, id);
  return lv > 0 && lv < MAX_LEVEL && player.skillPoints >= LEVEL_COST
    && !growNeed(player, skillById(id), lv + 1);
};

/**
 * Không có `requires` là mọc từ gốc; có thì học một ô trong danh sách là đủ.
 * Ô đứng trước chỉ cần level 1 — level là để làm mạnh thêm, không phải cửa ải.
 */
function prereqMet(player, s) {
  return !s.requires?.length || s.requires.some((r) => player.skills.includes(r));
}

/**
 * Tối thượng còn lại của nhánh này mà người chơi đã học, nếu có. Mỗi nhánh
 * hai tối thượng, chỉ được giữ một: hai cái phục vụ hai tình huống khác nhau
 * của ván (đang thắng / đang thua, có bến / không có bến…), cho giữ cả hai thì
 * không còn phải chọn. Muốn đổi thì tẩy điểm.
 * @returns {?object}
 */
export function rivalUlt(player, s) {
  if (s.tier !== 4) return null;
  return SKILLS.find((x) => x.tier === 4 && x.branch === s.branch && x.id !== s.id
    && player.skills.includes(x.id)) ?? null;
}

/**
 * Học ô mới hoặc lên level cho ô đã học.
 * @returns {{ok:boolean, reason?:string, cost:number, level:number}}
 *   `level` là level sẽ đạt được nếu bấm.
 */
export function canLearn(player, id) {
  const s = skillById(id);
  if (!s) return { ok: false, reason: 'Không có kỹ năng này.', cost: 0, level: 0 };
  const lv = levelOf(player, id);
  const cost = nextCost(player, s);
  const level = lv + 1;
  if (lv >= MAX_LEVEL) return { ok: false, reason: 'Đã đạt level tối đa.', cost: 0, level: lv };
  if (!lv && !prereqMet(player, s)) {
    const names = s.requires.map((r) => `"${skillById(r).name}"`).join(' hoặc ');
    return { ok: false, reason: `Cần học ${names} trước.`, cost, level };
  }
  const rival = !lv && rivalUlt(player, s);
  if (rival) {
    return { ok: false, reason: `Đã chọn tối thượng "${rival.name}". Mỗi nhánh chỉ một tối thượng; tẩy điểm để đổi.`, cost, level };
  }
  if (!lv && !featMet(player, s)) {
    return { ok: false, reason: `Chưa mở khoá: ${featText(player, s)}.`, cost, level };
  }
  const need = lv ? growNeed(player, s, level) : null;
  if (need) {
    const left = need.need - need.have;
    return {
      ok: false,
      reason: need.by === 'gain'
        ? `Cần kiếm thêm ${money(left)} từ kỹ năng này mới lên được level ${level}.`
        : `Kỹ năng cần chạy thêm ${left} lần mới lên được level ${level}.`,
      cost, level,
    };
  }
  if (player.skillPoints < cost) {
    return { ok: false, reason: `Thiếu ${cost - player.skillPoints} điểm.`, cost, level };
  }
  return { ok: true, cost, level };
}

/** Học ô mới hoặc lên một level: trừ đúng giá bước đó. Không được thì không đổi gì. */
export function learnSkill(player, id) {
  const check = canLearn(player, id);
  if (!check.ok) return check;
  player.skillPoints -= check.cost;
  if (check.level === 1) player.skills.push(id);
  else player.skillLv = { ...player.skillLv, [id]: check.level };
  return check;
}

/** Đi ngang ô Bắt Đầu: +1 điểm. */
export function grantLapPoint(player, n = 1) {
  player.skillPoints += n;
}

/** Tổng điểm đã đổ vào một nhánh — để hiện độ sâu của từng nhánh. */
export function spentIn(player, branchKey) {
  return branchSkills(branchKey).reduce((n, s) => n + sunk(player, s), 0);
}

/** Số điểm để học trọn một nhánh ở level tối đa — mẫu số của thanh độ sâu. */
export const branchMax = (branchKey) => branchSkills(branchKey)
  .reduce((n, s) => n + skillCost(s) + (MAX_LEVEL - 1) * LEVEL_COST, 0);

/** Một số trong chữ mô tả: tiền, phần trăm hay số trơn. */
function fmt(kind, v) {
  if (kind === '$') return money(v);
  if (kind === '%') return `${Math.round(v * 100)}%`;
  return String(v);
}

/**
 * Điền số vào chữ mô tả: `{x}` số trơn, `{$x}` tiền, `{%x}` phần trăm. Số
 * dạng khoảng `[a, b]` hiện thành "a–b$" / "a–b%": đơn vị viết một lần ở cuối
 * cho gọn, người đọc vẫn hiểu cả hai đầu cùng đơn vị.
 */
export function fillText(text, params = {}) {
  return text.replace(/\{([$%]?)(\w+)\}/g, (m, kind, key) => {
    const v = params[key];
    if (v === undefined) return m;
    if (Array.isArray(v)) {
      const [lo, hi] = v.map((x) => fmt(kind, x));
      return `${lo.replace(/[$%]$/, '')}–${hi}`;
    }
    return fmt(kind, v);
  });
}

/** Dòng tóm tắt của một level, đã điền số. */
export function levelLine(s, lv) {
  const t = Array.isArray(s.lvText) ? s.lvText[lv - 1] : s.lvText;
  return fillText(t, lvParams(s, lv));
}

/* ------------------------------------------------------------ tẩy điểm */

/** Tổng điểm đã tiêu trên cả cây, tính cả level — đây là số điểm được hoàn khi tẩy. */
export const spentTotal = (player) => player.skills
  .reduce((n, id) => n + sunk(player, skillById(id)), 0);

/** @returns {{ok:boolean, reason?:string, refund:number, fee:number}} */
export function canRespec(player) {
  const refund = spentTotal(player);
  const fee = refund * RESPEC_FEE;
  if (!refund) return { ok: false, reason: 'Chưa học kỹ năng nào để tẩy.', refund, fee };
  if (player.money < fee) return { ok: false, reason: `Thiếu ${money(fee - player.money)} tiền mặt để trả phí.`, refund, fee };
  return { ok: true, refund, fee };
}

/**
 * Tẩy cả cây: hoàn đủ số điểm đã tiêu (cả level), trừ phí bằng tiền mặt.
 *
 * Bộ đếm hồi (`cooldowns`) và số lần đã dùng trong vòng (`lapUses`) nằm
 * **ngoài** `skills` và cố ý không bị xoá ở đây — không thì dùng xong tối
 * thượng, tẩy rồi học lại là bấm được ngay lần nữa.
 *
 * Tiến độ lên level (`skillUse`) và bộ đếm thành tựu (`feats`) cũng giữ lại:
 * đó là việc người chơi đã làm trong ván, học lại ô cũ vẫn phải trả đủ điểm
 * cho từng level nên giữ tiến độ không cho không được gì.
 */
export function respec(player) {
  const check = canRespec(player);
  if (!check.ok) return check;
  player.money -= check.fee;
  player.skillPoints += check.refund;
  player.skills = [];
  player.skillLv = {};
  return check;
}

/* ================================================================
   Tác dụng trong ván — những phần tính thuần bằng số, không đụng giao diện.
   Phần cần hỏi người chơi hay diễn hoạt cảnh nằm ở game/skillPlay.js.
   ================================================================ */

/** Người chơi đã học kỹ năng này chưa. Người phá sản thì mọi kỹ năng tắt. */
export const has = (p, id) => !!p && !p.bankrupt && p.skills.includes(id);

/**
 * Bộ số của kỹ năng theo level người này đang có. Chưa học thì trả bộ level 1
 * — biển Di Sản vẫn cần hệ số thuê dù chủ đất đã tẩy mất Phố Cổ.
 * Số dạng khoảng còn nguyên `[a, b]`; chỗ trao tiền phải qua `roll`.
 */
export const param = (p, id) => lvParams(skillById(id), levelOf(p, id));

/**
 * Rút một số trong khoảng `[a, b]`; số thường trả nguyên. Khoảng tiền (hai đầu
 * là số nguyên) rút theo bước 5$ cho giống tiền trên bàn; khoảng tỉ lệ rút tới
 * phần trăm.
 */
export function roll(v) {
  if (!Array.isArray(v)) return v;
  const [a, b] = v;
  const r = Math.random();
  if (Number.isInteger(a) && Number.isInteger(b)) return a + Math.round((r * (b - a)) / 5) * 5;
  return Math.round((a + r * (b - a)) * 100) / 100;
}

/** Bộ số theo level, mọi khoảng đã rút thành một số — dùng ngay lúc trao tiền. */
export const rolled = (p, id) => Object.fromEntries(
  Object.entries(param(p, id)).map(([k, v]) => [k, roll(v)]));

/**
 * Kỹ năng bấm để dùng còn dùng được không: đã học và không đang chờ hồi.
 * `cooldowns[id]` đếm số lần qua ô Bắt Đầu còn phải chờ.
 */
export const ready = (p, id) => has(p, id) && !(p.cooldowns?.[id] > 0);

/** Còn dùng được mấy lần trước khi phải chờ — để ghi lên nút và hộp hỏi. */
export function usesLeft(p, id) {
  if (!ready(p, id)) return 0;
  return (param(p, id).charges ?? 1) - (p.lapUses?.[id] ?? 0);
}

/**
 * Vừa dùng xong một lần. Kỹ năng có `charges` (Quay Đầu, Xí Ngầu Gian) chỉ
 * bắt chờ khi đã dùng hết số lần của level đang có; còn lại thì chờ ngay.
 */
export function spend(p, id) {
  const { charges = 1, cooldown } = param(p, id);
  const used = (p.lapUses?.[id] ?? 0) + 1;
  if (used < charges) { p.lapUses = { ...p.lapUses, [id]: used }; return; }
  const rest = { ...p.lapUses };
  delete rest[id];
  p.lapUses = rest;
  if (cooldown) p.cooldowns = { ...p.cooldowns, [id]: cooldown };
}

/**
 * Qua ô Bắt Đầu: +1 điểm (thêm 1 nữa nếu tới nhịp Lão Làng), đếm thêm một
 * lần qua, mọi kỹ năng đang chờ hồi nhích một nấc, số lần đã dùng trong vòng về 0.
 * @returns {number} số điểm vừa nhận
 *
 * Bộ đếm hồi nằm ngoài `skills` nên tẩy điểm không xoá được nó — dùng xong
 * tối thượng, tẩy rồi học lại vẫn phải chờ như thường.
 */
export function onLap(p) {
  p.laps = (p.laps ?? 0) + 1;
  grantLapPoint(p);
  /* Lão Làng: `tick` đếm số lần qua từ lúc học tới lần tặng điểm kế tiếp —
     tính từ lúc học chứ không theo tổng `laps`, không thì học muộn được bù
     ngay cả loạt điểm của những vòng trước. */
  let points = 1;
  if (has(p, 'cnX1')) {
    const tick = (p.skillUse?.cnX1?.tick ?? 0) + 1;
    const give = tick >= param(p, 'cnX1').every;
    p.skillUse = { ...p.skillUse, cnX1: { ...p.skillUse?.cnX1, tick: give ? 0 : tick } };
    if (give) { grantLapPoint(p); credit(p, 'cnX1'); points += 1; }
  }
  const next = {};
  for (const [id, n] of Object.entries(p.cooldowns ?? {})) if (n > 1) next[id] = n - 1;
  p.cooldowns = next;
  p.lapUses = {};
  return points;
}

/**
 * Tỉ lệ quỹ Liên Đoàn Lao Động lần qua ô Bắt Đầu này: base + perLap × số lần
 * đã qua − jail × số lần vào tù, chặn trong [0, cap].
 *
 * Học tới tối thượng tốn 7 điểm = đã qua ô Bắt Đầu ít nhất 7 lần, nên lúc vừa
 * học tỉ lệ đã ở quanh 10%; trần 20% của level 3 cần 17 lần qua mà không vào
 * tù. Vào tù trừ 3%, gấp ba một lần qua, vì một vòng bàn cờ chỉ có chừng 0,2–0,3
 * lần vào tù (ô Vào Tù, thẻ, đôi ba lần — đo ở tests/skills-play.mjs).
 */
export function levyRate(p) {
  const { base, perLap, jail, cap } = param(p, 'cnU');
  const x = base + perLap * (p.laps ?? 0) - jail * (p.jails ?? 0);
  return Math.max(0, Math.min(cap, Math.round(x * 100) / 100));
}

/**
 * Số tiền **mỗi** người khác nộp Liên Đoàn lần này: tỉ lệ × tiền mặt của người
 * có kỹ năng, không quá `each` × số lần đã qua ô Bắt Đầu.
 *
 * Trần tiền này mới là chỗ giữ cân bằng, trần tỉ lệ thì không: khoản thu tính
 * trên tiền của chính mình, thu về lại làm tiền mình lớn lên, nên không có trần
 * thì khoản thu tự nhân lên mỗi vòng. Mô hình bàn 4 người, mỗi người 2000$,
 * vào tù 0,2 lần mỗi vòng: không trần thì tới lần qua thứ 13 cả ba đối thủ bị
 * rút sạch tiền mặt mỗi vòng (+1638$/vòng). Trần theo số lần qua giữ khoản thu
 * tăng đều — lần 7 ≈ +250$, lần 13 ≈ +700$, lần 20 ≈ +1080$ mỗi vòng — mà đối
 * thủ vẫn còn tiền để xây nhà, đúng ý "càng farm lâu càng lời".
 */
export function levyEach(p) {
  const { each } = param(p, 'cnU');
  return Math.min(Math.floor(p.money * levyRate(p)), each * (p.laps ?? 0));
}

/** Ô ngay trước hoặc ngay sau `tileId` trên bàn cờ cũng của `seat` — Hàng Xóm Láng Giềng. */
export function hasNeighbor(st, tileId, seat) {
  return [(tileId + 39) % 40, (tileId + 1) % 40].some((id) => st.owner.get(id) === seat);
}

/** Số màu đất khác nhau người chơi có ít nhất một ô — cho Đất Nhiều Màu. */
export function colorsOwned(st, seat) {
  const set = new Set();
  for (const [id, owner] of st.owner) {
    const g = BOARD[id].color_group;
    if (owner === seat && g) set.add(g);
  }
  return set.size;
}

/**
 * Hệ số tiền thuê do kỹ năng của **chủ đất**: Cơn Sốt Đất, Nhà Lâu Năm, Đất
 * Nhiều Màu và biển Di Sản của Phố Cổ. Kỹ năng của **người trả** (Vé Tháng)
 * tính riêng ở `payerRentMult`, vì cùng một ô mỗi người trả một giá.
 */
export function ownerRentMult(st, tileId) {
  return Object.values(ownerRentParts(st, tileId)).reduce((k, f) => k * f, 1);
}

/**
 * Từng hệ số trong `ownerRentMult`, theo id kỹ năng — để tính mỗi kỹ năng
 * mang về cho chủ đất bao nhiêu trong một lần thu thuê (`rentGains`).
 * Biển Di Sản ghi dưới `heritage`: nó thuộc về ô đất, không phải kỹ năng
 * đang học, nên không tính vào tiến độ của ai.
 */
export function ownerRentParts(st, tileId) {
  const owner = st.ownerOf(tileId);
  const out = {};
  if (!owner) return out;
  const houses = st.housesOn(tileId);
  if (houses === 0 && has(owner, 'dcU')) out.dcU = param(owner, 'dcU').mult;
  if (houses > 0 && has(owner, 'ac2a')) {
    const { perLap, cap } = param(owner, 'ac2a');
    out.ac2a = 1 + Math.min(cap, perLap * (owner.laps ?? 0));
  }
  if (has(owner, 'ac2b')) out.ac2b = 1 + param(owner, 'ac2b').perColor * colorsOwned(st, owner.id);
  if (has(owner, 'acS2') && hasNeighbor(st, tileId, owner.id)) out.acS2 = 1 + param(owner, 'acS2').bonus;
  if (st.heritage?.has(tileId)) out.heritage = param(owner, 'acU').mult;
  return out;
}

/**
 * Khoản **cộng thẳng** vào tiền thuê do kỹ năng của chủ đất, theo id kỹ năng:
 * Vé Tháng (mỗi bến/ga đang có) và Mặt Tiền (mỗi màu đất đang có). Cộng sau
 * mọi hệ số nhân — số này nhỏ, nhân lên cùng Cơn Sốt Đất thì người có cả hai
 * lời gấp đôi cho cùng một điểm.
 */
export function ownerRentFlat(st, tileId) {
  const owner = st.ownerOf(tileId);
  const out = {};
  if (!owner) return out;
  if (BOARD[tileId].type === 'station' && has(owner, 'dh1')) {
    out.dh1 = param(owner, 'dh1').own * st.stationCount(owner.id);
  }
  if (has(owner, 'acV')) out.acV = param(owner, 'acV').per * colorsOwned(st, owner.id);
  return out;
}

/**
 * Chủ đất vừa thu `rent`: mỗi kỹ năng nhân tiền thuê mang về phần chênh giữa
 * số thu được và số sẽ thu nếu thiếu đúng hệ số của kỹ năng ấy; kỹ năng cộng
 * thẳng mang về đúng số nó cộng, nhưng không quá số thực thu (người trả có Vé
 * Tháng, Sống Sót thì số thu nhỏ lại).
 * @returns {Array<[string, number]>}
 */
export function rentGains(st, tileId, rent) {
  const flat = Object.entries(ownerRentFlat(st, tileId)).filter(([, n]) => n > 0);
  const flatSum = flat.reduce((n, [, x]) => n + x, 0);
  const core = Math.max(0, rent - flatSum);
  return [
    ...Object.entries(ownerRentParts(st, tileId))
      .filter(([id, f]) => id !== 'heritage' && f > 1)
      .map(([id, f]) => [id, core - core / f]),
    ...flat.map(([id, n]) => [id, Math.min(n, rent)]),
  ];
}

/** Hệ số tiền thuê do kỹ năng của **người trả**. */
export function payerRentMult(st, payer, tileId) {
  let k = 1;
  if (BOARD[tileId].type === 'station' && has(payer, 'dh1')) k *= param(payer, 'dh1').pay;
  if (has(payer, 'acX1') && payer.money < param(payer, 'acX1').under) k *= param(payer, 'acX1').pay;
  return k;
}

/**
 * Chủ Nợ: người trả thuê đang có ô thế chấp ở ngân hàng thì trả thêm. Tính
 * **sau** các hệ số của người trả — Sống Sót bớt trước, phần thêm tính trên
 * số còn lại.
 */
export function lateFee(st, payer, tileId, rent) {
  const owner = st.ownerOf(tileId);
  if (!has(owner, 'dcX1') || owner.id === payer.id || rent <= 0) return 0;
  if (!st.propertiesOf(payer.id).some((id) => st.isMortgaged(id))) return 0;
  return Math.round(rent * param(owner, 'dcX1').late);
}

/**
 * Nhà trên ô này có bị thẻ dỡ nhà / thiên tai đụng tới được không: chủ đất có
 * Sổ Hồng, hoặc ô mang biển Di Sản.
 */
export const houseImmune = (st, tileId) =>
  has(st.ownerOf(tileId), 'ac3') || !!st.heritage?.has(tileId);

/**
 * Phố Cổ chọn ô nào để xây thêm một căn miễn phí: ô ít nhà nhất trong các bộ
 * đang xây được, hoà thì ô đắt hơn — thuê cao hơn thì căn nhà tặng mới đáng.
 * @returns {?number}
 */
export function freeHouseTarget(st, seat) {
  const picks = st.propertiesOf(seat)
    .filter((id) => BOARD[id].type === 'property' && st.housesOn(id) < 5)
    .filter((id) => st.canBuild(seat, id, { free: true }).ok);
  picks.sort((a, b) => st.housesOn(a) - st.housesOn(b) || BOARD[b].price - BOARD[a].price);
  return picks[0] ?? null;
}

/**
 * Xổ Số Kiến Thiết: tiền người lắc ra tổng `n` phải trả người đã chọn số ấy.
 * Kỳ vọng như nhau cho mọi số (xem `lotto` trong data/skills.js).
 */
export function lottoPrize(p, n) {
  if (n < 2 || n > 12) return 0;
  return Math.round((param(p, 'ddV').ev * 36) / WAYS(n) / 5) * 5;
}

/**
 * Trạm Thu Phí BOT: những ô người này đi **ngang** (không tính ô xuất phát và
 * ô dừng) mà là bến/ga hoặc công ty của người khác có kỹ năng, còn thu thuê
 * được. Gom theo chủ để mỗi chủ thu một lần cho cả chuyến.
 *
 * Tính bằng số học trên `from` và `steps` chứ không nghe từng bước của hoạt
 * cảnh: bản online và các bài test đi quân không qua hoạt cảnh.
 * @returns {Array<{owner:object, tiles:number[], amount:number}>}
 */
export function tollStops(st, payer, from, steps) {
  const dir = Math.sign(steps);
  const byOwner = new Map();
  for (let i = 1; i < Math.abs(steps); i++) {
    const id = ((from + dir * i) % 40 + 40) % 40;
    const t = BOARD[id];
    if (t.type !== 'station' && t.type !== 'utility') continue;
    const owner = st.ownerOf(id);
    if (!owner || owner.id === payer.id || !has(owner, 'dhV')) continue;
    if (st.isMortgaged(id) || st.isFrozen(id)) continue;
    if (!byOwner.has(owner)) byOwner.set(owner, []);
    byOwner.get(owner).push(id);
  }
  return [...byOwner].map(([owner, tiles]) => ({ owner, tiles, amount: tiles.length * param(owner, 'dhV').toll }));
}

/**
 * Dẫn Tour: những người đứng trên ô người này đi **ngang** (không tính ô xuất
 * phát và ô dừng), trừ người đang ngồi tù — họ không đứng trên đường đi.
 * @returns {object[]}
 */
export function tourPassed(st, p, from, steps) {
  if (!has(p, 'dhS2')) return [];
  const dir = Math.sign(steps);
  const cells = new Set();
  for (let i = 1; i < Math.abs(steps); i++) cells.add(((from + dir * i) % 40 + 40) % 40);
  return st.alive().filter((q) => q.id !== p.id && !q.inJail && cells.has(q.pos));
}

/**
 * Nhặt Hàng Thừa: ô chưa có chủ mà **người khác** đã bỏ qua, người này đủ
 * tiền mua với giá kỹ năng.
 * @returns {Array<{id:number, price:number}>}
 */
export function leftoverOffers(st, p) {
  if (!has(p, 'dcS1')) return [];
  const { price } = param(p, 'dcS1');
  return [...st.passedUp]
    .filter(([id, seats]) => !st.owner.has(id) && seats.some((x) => x !== p.id))
    .map(([id]) => ({ id, price: Math.round(BOARD[id].price * price) }))
    .filter((x) => x.price <= p.money);
}

/**
 * Siết Nợ: các ô đang thế chấp của người khác mà người này đủ tiền mua đứt.
 * Giá = số thế chấp trả ngân hàng + `premium` × số đó trả chủ cũ.
 * @returns {Array<{id:number, bank:number, owner:number}>}
 */
export function forecloseOffers(st, p) {
  if (!has(p, 'dcV')) return [];
  const { premium } = param(p, 'dcV');
  return [...st.mortgaged]
    .filter((id) => { const o = st.ownerOf(id); return o && o.id !== p.id && !o.bankrupt; })
    .map((id) => ({ id, bank: BOARD[id].mortgage, owner: Math.round(BOARD[id].mortgage * premium) }))
    .filter((x) => x.bank + x.owner <= p.money);
}

/**
 * Màu các nhánh người này đã học tới tối thượng. BoardScene dùng danh sách này
 * làm khoá để biết khi nào phải dựng lại hào quang; màu vẽ lên là `ultColor`.
 * Người phá sản thì không còn gì.
 */
export const ultColors = (p) => (p?.bankrupt ? [] : SKILLS
  .filter((s) => s.tier === 4 && p.skills.includes(s.id))
  .map((s) => branchByKey(s.branch).color));

/**
 * Một màu duy nhất cho hào quang và bóng mờ: 1 tối thượng thì màu nhánh ấy,
 * 2–3 thì tra `ULT_MIX`, 4 đen, 5 trắng. Chưa có tối thượng thì `null`.
 */
export function ultColor(p) {
  if (p?.bankrupt) return null;
  const keys = BRANCHES.map((b) => b.key)
    .filter((k) => SKILLS.some((s) => s.tier === 4 && s.branch === k && p.skills.includes(s.id)));
  if (!keys.length) return null;
  if (keys.length === 1) return branchByKey(keys[0]).color;
  return ULT_SPECIAL[keys.length] ?? ULT_MIX[keys.join(',')];
}
