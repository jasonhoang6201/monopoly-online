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
    })),
    turn: st.turn,
    order: st.order ? [...st.order] : null,
    owner: [...st.owner],
    houses: [...st.houses],
    mortgaged: [...st.mortgaged],
    bankHouses: st.bankHouses,
    bankHotels: st.bankHotels,
    piles: { chance: [...st.decks.chance.pile], chest: [...st.decks.chest.pile] },
    over: st.over,
  };
}

/** Dựng một `GameState` mới từ ảnh chụp. */
export function fromSnapshot(snap) {
  const st = new GameState(
    snap.players.map((p) => p.name),
    snap.players.map((p) => Math.max(0, TOKENS.findIndex((t) => t.key === p.token))),
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
  });
  st.turn = snap.turn;
  st.order = snap.order ? [...snap.order] : null;
  st.owner = new Map(snap.owner);
  st.houses = new Map(snap.houses);
  st.mortgaged = new Set(snap.mortgaged);
  st.bankHouses = snap.bankHouses;
  st.bankHotels = snap.bankHotels;
  st.decks.chance.pile = [...snap.piles.chance];
  st.decks.chest.pile = [...snap.piles.chest];
  st.over = snap.over;
  return st;
}
