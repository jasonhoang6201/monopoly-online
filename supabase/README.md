# Số liệu cân bằng kỹ năng trên Supabase

Ván cờ chỉ dùng Realtime (không cần bảng). Riêng phần **ghi lại lượt dùng kỹ
năng** để cân bằng game cần vài bảng Postgres — thư mục này là mọi thứ phía
database. Phía client xem `src/core/telemetry.js` (bộ đệm sự kiện trong luật)
và `src/net/analytics.js` (gom batch, gửi REST). Trang xem: `/stats.html`.

## Dựng lần đầu

1. Supabase Dashboard → **SQL Editor** → dán nguyên `migrations/0001_skill_analytics.sql` → Run.
2. Dán tiếp `migrations/0002_skill_meta.sql` → Run (bảng tra 50 ô kỹ năng).
3. Deploy lại game (không cần đổi `.env`: dùng cùng `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`).

Chạy lại migration bao nhiêu lần cũng được (`create … if not exists`,
`create or replace`, upsert).

## Quyền

- Client chỉ có **anon key**. Anon chỉ được `INSERT` vào `games`,
  `game_players`, `skill_events`; **không** `SELECT` / `UPDATE` / `DELETE`.
- Đọc qua **view** `v_*` (chạy quyền chủ sở hữu) và **hàm** `stats_*`
  (`security definer`) — dashboard gọi hàm qua `supabase.rpc`.
- Ai có anon key cũng chèn được dòng rác: bảng có `check` biên độ / độ dài,
  và đây là gói free cho bàn cờ bạn bè — chấp nhận.

Kiểm nhanh sau khi chạy migration (thay URL và KEY):

```bash
# 1. anon chèn được (mong 201)
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$URL/rest/v1/skill_events" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -H "Prefer: return=minimal" \
  -d '[{"game_id":"00000000-0000-4000-8000-000000000000","client_id":"curl","seq":1,"t_ms":0,"kind":"lap","payload":{}}]'
# 2. anon không đọc được bảng gốc (mong 401/403 hoặc lỗi permission)
curl -s "$URL/rest/v1/skill_events?select=count" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
# 3. hàm thống kê trả JSON
curl -s -X POST "$URL/rest/v1/rpc/stats_overview" -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" -d '{}'
```

Xoá dòng thử: SQL Editor → `delete from skill_events where client_id = 'curl';`

## Khi nào client ghi

- Chỉ **máy cầm lái** (người tới lượt; offline là chính máy đó) ghi, nên mỗi
  sự kiện chỉ có một bản. Khoá `(game_id, client_id, seq)` chặn gửi trùng.
- **Không ghi** khi: thiếu khoá Supabase; Chrome do Playwright cầm
  (`navigator.webdriver`, tức ván bot của bộ kiểm thử); chạy trên
  `localhost` / `127.0.0.1`; URL có `?telemetry=0`.
- `?telemetry=1` ép bật (kể cả localhost) để kiểm tay. Mở
  `http://localhost:5174/?telemetry=1`, chơi một ván, rồi SQL Editor:
  `select * from v_games order by started_at desc limit 5;`

## Dữ liệu

| Bảng | Một dòng là | Ghi lúc |
|---|---|---|
| `games` | một ván × giai đoạn (`start` / `end`) | khai cuộc (máy dựng ván) / hạ màn (máy cầm lái) |
| `game_players` | một ghế của một ván: hạng, tiền, tài sản, điểm, cây kỹ năng cuối ván | hạ màn |
| `skill_events` | một sự kiện: `learn`, `respec`, `use` (kèm `delta` có dấu), `toggle`, `lap`, `points`, `turn`, `bankrupt` | cuối mỗi lượt |

Ý nghĩa vài cột của `learn` (trong `payload`): `nth` = lần học / nâng thứ mấy
của người đó trong ván; `earned` = tổng điểm đã nhận tới lúc đó; `point_no` =
điểm kỹ năng thứ mấy vừa tiêu vào bước này (ô giá 2 là điểm `point_no-1` và
`point_no`); `lap` = lần qua ô Bắt Đầu thứ mấy.

`delta` của `use` là tiền **có dấu** mà kỹ năng mang về cho người giữ nó
(âm khi thua cược, ra lẻ…). Ô mua đất / xây nhà miễn phí (Nhặt Hàng Thừa, Siết
Nợ, Thâu Tóm, Phố Cổ) để `delta` 0: tiền bỏ ra mua đất là đổi dạng tài sản,
không phải lời lỗ — nhìn hiệu quả của chúng qua `net_worth_end` và tỉ lệ thắng.

## View và hàm

- `v_games`, `v_learn`, `v_first_pick`, `v_respec`, `v_use`, `v_hold`,
  `v_player_skill` (hạt chính: người-ván × ô đã học), `v_points`.
- `stats_overview`, `stats_skills` (50 dòng, mỗi ô một dòng), `stats_branches`,
  `stats_respec`, `stats_points` — cùng bộ lọc
  `(p_from, p_to, p_mode, p_players, p_finished)`. Công thức ghi trong comment SQL.

## Khi thêm / đổi ô kỹ năng

```bash
node scripts/skill-meta-sql.mjs > supabase/migrations/0002_skill_meta.sql
```
rồi dán file mới vào SQL Editor. Ô không có trong `skill_meta` sẽ không hiện ở
`stats_skills` (view hạt vẫn có).

## Kiểm thử phía database

`tests/analytics-sql.mjs` mô phỏng hai ván bằng chính luật, bơm vào một
Postgres **dev** đã chạy migration, rồi soi `stats_*`. Cần `MONO_PG` (chuỗi
nối psql) và `psql`; thiếu thì bỏ qua. Ví dụ với Postgres cài bằng Homebrew:

```bash
createdb mono && psql mono -c "create role anon nologin; create role authenticated nologin;"
psql mono -f supabase/migrations/0001_skill_analytics.sql -f supabase/migrations/0002_skill_meta.sql
MONO_PG=postgresql://localhost/mono node tests/analytics-sql.mjs
```
Bài này xoá mọi ván có `started_at` trong ngày 2026-10-01 (ngày mẫu) — đừng
trỏ vào database thật.
