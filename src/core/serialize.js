/**
 * Đóng gói `GameState` thành JSON và dựng lại.
 *
 * Cần đến vì `JSON.stringify` nuốt sạch mấy kiểu dữ liệu mà luật chơi đang dùng:
 * `owner` và `houses` là `Map`, `mortgaged` là `Set`, hai bộ thẻ là `Deck` —
 * tất cả ra `{}` nếu gửi thẳng.
 *
 * Ảnh chụp cố tình **không mang nội dung thẻ bài**, chỉ mang thứ tự đã xáo
 * (`pile` là mảng chỉ số). Nội dung thẻ là hằng số, máy nào cũng có sẵn.
 */
import { GameState, TOKENS } from './state.js';

export function snapshot(st) {
  return {
    players: st.players.map((p) => ({
      id: p.id,
      name: p.name,
      token: p.token.key,
      money: p.money,
      pos: p.pos,
      inJail: p.inJail,
      jailTurns: p.jailTurns,
      bankrupt: p.bankrupt,
      doubles: p.doubles,
      cards: p.cards.map((c) => ({ ...c })),
    })),
    turn: st.turn,
    order: st.order ? [...st.order] : null,
    /* Số thứ tự ảnh chụp — người nhận dựa vào đây để bỏ ảnh về trễ. */
    rev: st.rev,
    owner: [...st.owner],
    houses: [...st.houses],
    mortgaged: [...st.mortgaged],
    bankHouses: st.bankHouses,
    bankHotels: st.bankHotels,
    piles: { chance: [...st.decks.chance.pile], chest: [...st.decks.chest.pile] },
    /* Mấy lá đang nằm trong túi người chơi. Thiếu chỗ này thì máy vào lại giữa
       ván sẽ xáo chúng trở vào bộ — cả bàn ai cũng rút được một tấm mà đáng lẽ
       nó đang nằm trong tay người khác. */
    gone: { chance: [...st.decks.chance.gone], chest: [...st.decks.chest.gone] },
    over: st.over,
    /* Thẻ Thời Cuộc: nấc luật, thanh áp lực, hiệu ứng đang chạy và hai chồng
       bài. Thiếu bất cứ thứ nào ở đây là người vào lại giữa ván sẽ chơi bằng
       một bộ luật khác cả bàn — giá thuê tính sai, sự kiện nổ lệch nhịp. */
    settings: { ...st.settings },
    pressure: st.pressure,
    eventsFired: st.eventsFired,
    laps: st.laps,
    pot: st.pot,
    dryTurn: st.dryTurn,
    mods: st.mods.map((m) => ({ ...m })),
    eventPiles: { 1: [...st.eventPiles[1]], 2: [...st.eventPiles[2]] },
  };
}

/** Dựng một `GameState` mới từ ảnh chụp. */
export function fromSnapshot(snap) {
  const st = new GameState(
    snap.players.map((p) => p.name),
    snap.players.map((p) => Math.max(0, TOKENS.findIndex((t) => t.key === p.token))),
    snap.settings ?? null,
  );
  applySnapshot(st, snap);
  return st;
}

/**
 * Ghi đè ảnh chụp lên một `GameState` **đã có sẵn**.
 * Dùng cách này thay vì dựng đối tượng mới để HUD, bảng xem nhanh và scene
 * đang giữ tham chiếu tới `state` không phải nối lại từ đầu sau mỗi lần đồng bộ.
 */
export function applySnapshot(st, snap) {
  snap.players.forEach((s, i) => {
    const p = st.players[i];
    p.name = s.name;
    p.money = s.money;
    p.pos = s.pos;
    p.inJail = s.inJail;
    p.jailTurns = s.jailTurns;
    p.bankrupt = s.bankrupt;
    p.doubles = s.doubles;
    // `jailCards` là tên cũ hồi túi thẻ mới chỉ đựng vé ra tù
    p.cards = (s.cards ?? s.jailCards ?? []).map((c) => ({ ...c }));
  });
  st.turn = snap.turn;
  st.order = snap.order ? [...snap.order] : null;
  st.rev = snap.rev ?? st.rev;
  st.owner = new Map(snap.owner);
  st.houses = new Map(snap.houses);
  st.mortgaged = new Set(snap.mortgaged);
  st.bankHouses = snap.bankHouses;
  st.bankHotels = snap.bankHotels;
  st.decks.chance.pile = [...snap.piles.chance];
  st.decks.chest.pile = [...snap.piles.chest];
  st.decks.chance.gone = new Set(snap.gone?.chance ?? []);
  st.decks.chest.gone = new Set(snap.gone?.chest ?? []);
  st.over = snap.over;

  /* Ảnh chụp của bản cũ (hay của ván mở trước khi có thẻ Thời Cuộc) không mang
     mấy trường này — giữ nguyên cái đang có thay vì ghi `undefined` đè lên. */
  if (snap.settings) st.settings = { ...st.settings, ...snap.settings };
  st.pressure = snap.pressure ?? st.pressure;
  st.eventsFired = snap.eventsFired ?? st.eventsFired;
  st.laps = snap.laps ?? st.laps;
  st.pot = snap.pot ?? st.pot;
  st.dryTurn = snap.dryTurn ?? st.dryTurn;
  st.mods = (snap.mods ?? st.mods).map((m) => ({ ...m }));
  if (snap.eventPiles) st.eventPiles = { 1: [...snap.eventPiles[1]], 2: [...snap.eventPiles[2]] };
  return st;
}
