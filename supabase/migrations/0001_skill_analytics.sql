-- Số liệu cân bằng kỹ năng — bảng, quyền, view và hàm thống kê.
-- Dán nguyên file vào Supabase Dashboard → SQL Editor → Run. Chạy xong thì
-- chạy tiếp 0002_skill_meta.sql (bảng tra 50 ô kỹ năng).
--
-- Nguyên tắc quyền: client chỉ có anon key, nên anon chỉ được INSERT vào ba
-- bảng gốc (ghi số liệu), không SELECT/UPDATE/DELETE. Đọc qua view (chạy quyền
-- chủ sở hữu) và hàm `stats_*` (security definer) — dashboard gọi hàm.

-- ====================================================================== bảng

create table if not exists public.skill_meta (
  skill_id     text primary key,
  branch       text not null,
  branch_name  text not null,
  tier         smallint not null,
  kind         text not null,
  name         text not null
);

-- Một ván hai dòng: 'start' lúc khai cuộc (máy dựng ván), 'end' lúc hạ màn
-- (máy cầm lái). Chỉ thêm, không sửa — anon không cần quyền UPDATE.
create table if not exists public.games (
  game_id      uuid not null,
  phase        text not null check (phase in ('start', 'end')),
  client_id    text not null check (char_length(client_id) <= 40),
  mode         text not null check (mode in ('offline', 'online', 'local')),
  players      smallint not null check (players between 2 and 8),
  theme        text check (char_length(theme) <= 20),
  events_level text check (char_length(events_level) <= 20),
  app_version  text check (char_length(app_version) <= 40),
  started_at   timestamptz not null,
  ended_at     timestamptz,
  win_by       text check (win_by in ('last', 'empire', 'worth')),
  winner_seat  smallint,
  turns        int,
  rounds       int,
  laps         int,
  events_fired int,
  inserted_at  timestamptz not null default now(),
  primary key (game_id, phase)
);
create index if not exists games_started_at on public.games (started_at);

create table if not exists public.game_players (
  game_id        uuid not null,
  seat           smallint not null check (seat between 0 and 7),
  token          text check (char_length(token) <= 20),
  rank           smallint not null,
  won            boolean not null,
  bankrupt       boolean not null,
  out_rank       smallint,
  out_round      int,
  money_end      int not null,
  net_worth_end  int not null,
  laps           int not null,
  jails          int not null,
  turns_taken    int,
  points_left    smallint not null,
  points_spent   smallint not null,
  points_earned  smallint not null,
  skills         jsonb not null,   -- [{id, lv, off}]
  skill_use      jsonb not null,   -- Player.skillUse nguyên văn: {id: {n, gain, tick}}
  inserted_at    timestamptz not null default now(),
  primary key (game_id, seat),
  check (pg_column_size(skills) < 4096 and pg_column_size(skill_use) < 8192)
);

-- Từng sự kiện kỹ năng. Khoá (ván, máy ghi, số thứ tự): gửi lại không trùng.
create table if not exists public.skill_events (
  game_id     uuid not null,
  client_id   text not null check (char_length(client_id) <= 40),
  seq         int not null check (seq >= 0),
  t_ms        int not null check (t_ms >= 0),
  kind        text not null check (kind in ('learn', 'respec', 'use', 'toggle', 'lap', 'points', 'turn', 'bankrupt')),
  seat        smallint,
  skill_id    text check (char_length(skill_id) <= 8),
  delta       int check (abs(delta) < 10000000),
  turn_no     int,
  round       int,
  payload     jsonb not null default '{}'::jsonb check (pg_column_size(payload) < 2048),
  inserted_at timestamptz not null default now(),
  primary key (game_id, client_id, seq)
);
create index if not exists skill_events_game_seat on public.skill_events (game_id, seat, seq);
-- v_hold / v_player_skill dò theo (ván, ghế, loại, thời điểm) — chỉ mục trên có seq, không phủ
create index if not exists skill_events_game_seat_kind on public.skill_events (game_id, seat, kind, t_ms);
create index if not exists skill_events_kind_skill on public.skill_events (kind, skill_id);

-- ====================================================================== quyền

alter table public.games         enable row level security;
alter table public.game_players  enable row level security;
alter table public.skill_events  enable row level security;
alter table public.skill_meta    enable row level security;

drop policy if exists anon_insert on public.games;
drop policy if exists anon_insert on public.game_players;
drop policy if exists anon_insert on public.skill_events;
create policy anon_insert on public.games        for insert to anon, authenticated with check (true);
create policy anon_insert on public.game_players for insert to anon, authenticated with check (true);
create policy anon_insert on public.skill_events for insert to anon, authenticated with check (true);

-- Supabase cấp sẵn mọi quyền cho anon trên schema public; thu lại cho rõ ràng.
revoke all on public.games, public.game_players, public.skill_events, public.skill_meta from anon, authenticated;
grant insert on public.games, public.game_players, public.skill_events to anon, authenticated;

-- ====================================================================== view
-- View là *định nghĩa* chỉ số, hạt mịn (ván × ghế × ô). Hàm stats_* bên dưới
-- tổng hợp từ đây theo bộ lọc. Đọc bằng anon được (view chạy quyền chủ sở hữu).

-- Một dòng mỗi ván: dòng 'end' ưu tiên, không có thì 'start' (ván bỏ dở).
create or replace view public.v_games as
select distinct on (game_id)
  game_id, mode, players, theme, events_level, app_version, started_at, ended_at,
  win_by, winner_seat, turns, rounds, laps, events_fired,
  phase = 'end' as finished,
  case when ended_at is not null then extract(epoch from ended_at - started_at) end as duration_s
from public.games
order by game_id, (phase = 'end') desc;

-- Lần học / lên level. Gộp theo (ván, ghế, ô, level, lần học thứ mấy): máy
-- cầm lái mới có thể học lại một lần máy cũ đã ghi, ra hai dòng y hệt.
create or replace view public.v_learn as
select distinct on (game_id, seat, skill_id, (payload->>'level')::int, (payload->>'nth')::int)
  game_id, seat, skill_id,
  (payload->>'level')::int    as level,
  (payload->>'nth')::int      as nth,
  (payload->>'point_no')::int as point_no,
  (payload->>'earned')::int   as earned,
  (payload->>'cost')::int     as cost,
  (payload->>'lap')::int      as lap,
  (payload->>'off_turn')::boolean as off_turn,
  t_ms, seq, turn_no, round, client_id
from public.skill_events
where kind = 'learn'
order by game_id, seat, skill_id, (payload->>'level')::int, (payload->>'nth')::int, t_ms, seq;

-- Ô đầu tiên mỗi người học trong ván.
create or replace view public.v_first_pick as
select distinct on (game_id, seat) game_id, seat, skill_id, t_ms, lap, turn_no
from public.v_learn
order by game_id, seat, t_ms, seq;

-- Tẩy điểm: mỗi ô bị tẩy một dòng.
create or replace view public.v_respec as
select e.game_id, e.seat, e.t_ms, e.turn_no, e.round, e.seq,
  (e.payload->>'refund')::int as refund, (e.payload->>'fee')::int as fee, (e.payload->>'lap')::int as lap,
  w->>'id' as skill_id, (w->>'lv')::int as lv
from public.skill_events e
cross join lateral jsonb_array_elements(e.payload->'wiped') as w
where e.kind = 'respec';

-- Tiền từng ô mang về cho từng người trong ván (có dấu).
create or replace view public.v_use as
select game_id, seat, skill_id,
  count(*) filter (where coalesce((payload->>'counted')::boolean, true)) as uses,
  coalesce(sum(delta), 0)                                   as delta_sum,
  coalesce(sum(delta) filter (where delta > 0), 0)          as gain_sum,
  coalesce(sum(delta) filter (where delta < 0), 0)          as loss_sum
from public.skill_events
where kind = 'use'
group by game_id, seat, skill_id;

-- Khoảng nắm giữ một ô: từ lúc học level 1 tới lần tẩy kế tiếp, lúc vỡ nợ,
-- lúc hạ màn, hay sự kiện cuối cùng còn ghi được (ván bỏ dở).
create or replace view public.v_hold as
select l.game_id, l.seat, l.skill_id, l.nth, l.t_ms as from_ms,
  coalesce(
    (select min(r.t_ms) from public.skill_events r
       where r.game_id = l.game_id and r.seat = l.seat and r.kind = 'respec'
         and (r.t_ms, r.client_id, r.seq) > (l.t_ms, l.client_id, l.seq)),
    (select min(b.t_ms) from public.skill_events b
       where b.game_id = l.game_id and b.seat = l.seat and b.kind = 'bankrupt' and b.t_ms >= l.t_ms),
    (select (g.duration_s * 1000)::bigint from public.v_games g
       where g.game_id = l.game_id and g.ended_at is not null),
    (select max(e.t_ms) from public.skill_events e where e.game_id = l.game_id),
    l.t_ms
  ) as to_ms
from public.v_learn l
where l.level = 1;

-- Hạt chính: người-ván × ô đã học (kể cả ô học rồi tẩy).
create or replace view public.v_player_skill as
with learned as (
  select game_id, seat, skill_id,
    max(level) as max_lv, min(lap) as lap_learned, min(t_ms) as first_ms,
    sum(cost) as points_in,
    min(nth) filter (where level = 1) as nth_lv1,
    min(point_no) filter (where level = 1) as point_no_lv1,
    min(point_no) filter (where level = 2) as point_no_lv2,
    min(point_no) filter (where level = 3) as point_no_lv3
  from public.v_learn group by game_id, seat, skill_id
),
hold as (
  select h.game_id, h.seat, h.skill_id,
    sum(greatest(0, h.to_ms - h.from_ms)) as held_ms,
    sum((select count(*) from public.skill_events t
         where t.game_id = h.game_id and t.seat = h.seat and t.kind = 'turn'
           and t.t_ms >= h.from_ms and t.t_ms <= h.to_ms)) as turns_held
  from public.v_hold h group by h.game_id, h.seat, h.skill_id
),
toggles as (
  select game_id, seat, skill_id, count(*) as toggles
  from public.skill_events where kind = 'toggle' and coalesce((payload->>'auto')::boolean, false) = false
  group by game_id, seat, skill_id
),
wiped as (
  select game_id, seat, skill_id, count(*) as n_wiped from public.v_respec group by game_id, seat, skill_id
)
select l.game_id, g.started_at, g.mode, g.players, g.finished, g.duration_s,
  l.seat, l.skill_id, m.branch, m.tier, m.kind,
  l.max_lv, l.lap_learned, l.first_ms, l.points_in, l.nth_lv1, l.point_no_lv1, l.point_no_lv2, l.point_no_lv3,
  coalesce(h.held_ms, 0) as held_ms, coalesce(h.turns_held, 0) as turns_held,
  coalesce(u.uses, 0) as uses, coalesce(u.delta_sum, 0) as delta_sum,
  coalesce(u.gain_sum, 0) as gain_sum, coalesce(u.loss_sum, 0) as loss_sum,
  coalesce(t.toggles, 0) as toggles, coalesce(w.n_wiped, 0) as n_wiped,
  p.won, p.rank, p.money_end, p.net_worth_end, p.bankrupt,
  exists (select 1 from jsonb_array_elements(p.skills) s where s->>'id' = l.skill_id) as held_at_end,
  coalesce((select (s->>'off')::boolean from jsonb_array_elements(p.skills) s where s->>'id' = l.skill_id limit 1), false) as off_at_end
from learned l
join public.v_games g on g.game_id = l.game_id
left join public.game_players p on p.game_id = l.game_id and p.seat = l.seat
left join public.skill_meta m on m.skill_id = l.skill_id
left join hold h on h.game_id = l.game_id and h.seat = l.seat and h.skill_id = l.skill_id
left join public.v_use u on u.game_id = l.game_id and u.seat = l.seat and u.skill_id = l.skill_id
left join toggles t on t.game_id = l.game_id and t.seat = l.seat and t.skill_id = l.skill_id
left join wiped w on w.game_id = l.game_id and w.seat = l.seat and w.skill_id = l.skill_id;

-- Điểm kỹ năng của từng người-ván: nhận (qua ô Bắt Đầu + thẻ), tiêu, thừa.
create or replace view public.v_points as
select p.game_id, p.seat, g.started_at, g.mode, g.players, g.finished,
  p.points_earned, p.points_spent, p.points_left, p.won, p.rank,
  (select count(*) from public.skill_events e where e.game_id = p.game_id and e.seat = p.seat and e.kind = 'respec') as respecs
from public.game_players p
join public.v_games g on g.game_id = p.game_id;

grant select on public.v_games, public.v_learn, public.v_first_pick, public.v_respec, public.v_use,
  public.v_hold, public.v_player_skill, public.v_points, public.skill_meta to anon, authenticated;

-- ====================================================================== hàm thống kê
-- Bộ lọc chung: khoảng ngày khai cuộc, chế độ, số người, chỉ ván đã xong.
-- `security definer` để anon gọi được dù không đọc được bảng gốc.

create or replace function public.stats_game_ids(
  p_from timestamptz default null, p_to timestamptz default null,
  p_mode text default null, p_players int default null, p_finished boolean default true)
returns table (game_id uuid)
language sql stable security definer set search_path = public as $$
  select g.game_id from v_games g
  where (p_from is null or g.started_at >= p_from)
    and (p_to is null or g.started_at < p_to)
    and (p_mode is null or g.mode = p_mode)
    and (p_players is null or g.players = p_players)
    and (not p_finished or g.finished)
$$;

-- Tổng quan: số ván, thời lượng, số lượt, cửa thắng, số người.
create or replace function public.stats_overview(
  p_from timestamptz default null, p_to timestamptz default null,
  p_mode text default null, p_players int default null, p_finished boolean default true)
returns jsonb
language sql stable security definer set search_path = public as $$
  with g as (select v.* from v_games v join stats_game_ids(p_from, p_to, p_mode, p_players, p_finished) f using (game_id))
  select jsonb_build_object(
    'n_games', (select count(*) from g),
    'n_finished', (select count(*) filter (where finished) from g),
    'n_player_games', (select count(*) from game_players p join g using (game_id)),
    'avg_duration_s', (select round(avg(duration_s)) from g where finished),
    'avg_turns', (select round(avg(turns), 1) from g where finished),
    'avg_rounds', (select round(avg(rounds), 1) from g where finished),
    'avg_laps', (select round(avg(laps), 1) from g where finished),
    'win_by', (select coalesce(jsonb_object_agg(win_by, n), '{}'::jsonb) from (select win_by, count(*) n from g where win_by is not null group by win_by) x),
    'players', (select coalesce(jsonb_object_agg(players, n), '{}'::jsonb) from (select players, count(*) n from g group by players) x),
    'mode', (select coalesce(jsonb_object_agg(mode, n), '{}'::jsonb) from (select mode, count(*) n from g group by mode) x),
    'first_game', (select min(started_at) from g),
    'last_game', (select max(started_at) from g)
  )
$$;

-- Bảng chính: mỗi ô một dòng, ô chưa ai học vẫn có dòng (n = 0).
--   pick_rate        = số người-ván học ô / tổng người-ván
--   first_pick_rate  = số lần là ô đầu tiên / số người-ván có học ít nhất một ô
--   delta_per_game   = Σdelta / số người-ván học ô
--   delta_per_min    = Σdelta / (Σheld_ms / 60000); per_sec tương tự
--   delta_per_use    = Σdelta / Σuses ; delta_per_turn = Σdelta / Σturns_held
--   win_rate_with    = tỉ lệ thắng của người-ván học ô; without = người-ván
--                      không học ô trong cùng tập ván (chỉ ván đã xong có hạng)
--   point_no_hist    = {"1": n, "2": n, …} số lần ô được *học* (level 1) ở điểm thứ k
create or replace function public.stats_skills(
  p_from timestamptz default null, p_to timestamptz default null,
  p_mode text default null, p_players int default null, p_finished boolean default true)
returns table (
  skill_id text, branch text, branch_name text, tier smallint, kind text, name text,
  n_players bigint, n_learned bigint, pick_rate numeric,
  n_first bigint, first_pick_rate numeric, avg_lap_learned numeric,
  lv2_rate numeric, lv3_rate numeric, n_wiped bigint, wipe_rate numeric,
  uses_total bigint, uses_per_game numeric,
  delta_total bigint, delta_per_game numeric, delta_per_min numeric, delta_per_sec numeric,
  delta_per_use numeric, delta_per_turn numeric, gain_total bigint, loss_total bigint,
  held_min_total numeric, turns_held_total bigint,
  n_with bigint, win_rate_with numeric, avg_rank_with numeric,
  n_without bigint, win_rate_without numeric, avg_rank_without numeric,
  avg_worth_with numeric, avg_worth_without numeric,
  off_at_end_rate numeric, toggles_per_game numeric,
  avg_point_no_lv1 numeric, avg_point_no_lv2 numeric, avg_point_no_lv3 numeric, avg_nth_lv1 numeric,
  point_no_hist jsonb)
language sql stable security definer set search_path = public as $$
  with f as (select * from stats_game_ids(p_from, p_to, p_mode, p_players, p_finished)),
  pg as (select p.game_id, p.seat, p.won, p.rank, p.net_worth_end from game_players p join f using (game_id)),
  ps as (select v.* from v_player_skill v join f using (game_id)),
  tot as (
    select (select count(*) from pg) as n_players,
           (select count(distinct (game_id, seat)) from ps) as n_pickers
  ),
  fp as (select skill_id, count(*) n_first from v_first_pick x join f using (game_id) group by skill_id),
  per as (
    select skill_id,
      count(*) as n_learned,
      avg(lap_learned) as avg_lap,
      count(*) filter (where max_lv >= 2) as n_lv2,
      count(*) filter (where max_lv >= 3) as n_lv3,
      sum(n_wiped) as n_wiped,
      sum(uses) as uses_total,
      sum(delta_sum) as delta_total, sum(gain_sum) as gain_total, sum(loss_sum) as loss_total,
      sum(held_ms) as held_ms, sum(turns_held) as turns_held,
      count(*) filter (where won is not null) as n_with,
      avg(case when won then 1 else 0 end) filter (where won is not null) as win_with,
      avg(rank) filter (where rank is not null) as rank_with,
      avg(net_worth_end) filter (where net_worth_end is not null) as worth_with,
      avg(case when off_at_end then 1 else 0 end) filter (where held_at_end) as off_rate,
      sum(toggles) as toggles,
      avg(point_no_lv1) as pn1, avg(point_no_lv2) as pn2, avg(point_no_lv3) as pn3, avg(nth_lv1) as nth1
    from ps group by skill_id
  ),
  without as (
    select m.skill_id,
      count(*) as n_without,
      avg(case when pg.won then 1 else 0 end) as win_without,
      avg(pg.rank) as rank_without,
      avg(pg.net_worth_end) as worth_without
    from skill_meta m
    cross join pg
    where not exists (select 1 from ps where ps.game_id = pg.game_id and ps.seat = pg.seat and ps.skill_id = m.skill_id)
    group by m.skill_id
  ),
  hist as (
    select skill_id, jsonb_object_agg(point_no_lv1, n order by point_no_lv1) as h
    from (select skill_id, point_no_lv1, count(*) n from ps where point_no_lv1 is not null group by skill_id, point_no_lv1) x
    group by skill_id
  )
  select m.skill_id, m.branch, m.branch_name, m.tier, m.kind, m.name,
    t.n_players,
    coalesce(per.n_learned, 0),
    round(coalesce(per.n_learned, 0)::numeric / nullif(t.n_players, 0), 4),
    coalesce(fp.n_first, 0),
    round(coalesce(fp.n_first, 0)::numeric / nullif(t.n_pickers, 0), 4),
    round(per.avg_lap, 2),
    round(per.n_lv2::numeric / nullif(per.n_learned, 0), 4),
    round(per.n_lv3::numeric / nullif(per.n_learned, 0), 4),
    coalesce(per.n_wiped, 0),
    round(coalesce(per.n_wiped, 0)::numeric / nullif(per.n_learned, 0), 4),
    coalesce(per.uses_total, 0),
    round(per.uses_total::numeric / nullif(per.n_learned, 0), 2),
    coalesce(per.delta_total, 0),
    round(per.delta_total::numeric / nullif(per.n_learned, 0), 1),
    round(per.delta_total::numeric / nullif(per.held_ms / 60000.0, 0), 2),
    round(per.delta_total::numeric / nullif(per.held_ms / 1000.0, 0), 4),
    round(per.delta_total::numeric / nullif(per.uses_total, 0), 1),
    round(per.delta_total::numeric / nullif(per.turns_held, 0), 1),
    coalesce(per.gain_total, 0), coalesce(per.loss_total, 0),
    round(coalesce(per.held_ms, 0) / 60000.0, 1), coalesce(per.turns_held, 0),
    coalesce(per.n_with, 0), round(per.win_with, 4), round(per.rank_with, 2),
    coalesce(w.n_without, 0), round(w.win_without, 4), round(w.rank_without, 2),
    round(per.worth_with), round(w.worth_without),
    round(per.off_rate, 4),
    round(per.toggles::numeric / nullif(per.n_learned, 0), 2),
    round(per.pn1, 2), round(per.pn2, 2), round(per.pn3, 2), round(per.nth1, 2),
    coalesce(h.h, '{}'::jsonb)
  from skill_meta m
  cross join tot t
  left join per on per.skill_id = m.skill_id
  left join fp on fp.skill_id = m.skill_id
  left join without w on w.skill_id = m.skill_id
  left join hist h on h.skill_id = m.skill_id
  order by m.branch, m.tier, m.skill_id
$$;

-- Theo nhánh: ai đi nhánh nào, chạm tối thượng bao nhiêu, nhánh mang về bao nhiêu.
--   pick_rate = người-ván học ≥ 1 ô của nhánh / tổng người-ván
--   ult_rate  = người-ván có ô tầng 4 của nhánh / tổng người-ván
--   delta_share = Σdelta nhánh / Σmoney_end của những người ấy
create or replace function public.stats_branches(
  p_from timestamptz default null, p_to timestamptz default null,
  p_mode text default null, p_players int default null, p_finished boolean default true)
returns table (
  branch text, branch_name text, n_players bigint, n_picked bigint, pick_rate numeric,
  n_ult bigint, ult_rate numeric, avg_points_in numeric,
  delta_total bigint, delta_per_player numeric, delta_share numeric,
  n_with bigint, win_rate_with numeric, avg_rank_with numeric, win_rate_without numeric, avg_rank_without numeric,
  n_main bigint, win_rate_main numeric)
language sql stable security definer set search_path = public as $$
  with f as (select * from stats_game_ids(p_from, p_to, p_mode, p_players, p_finished)),
  pg as (select p.* from game_players p join f using (game_id)),
  ps as (select v.* from v_player_skill v join f using (game_id)),
  tot as (select count(*) as n_players from pg),
  br as (select distinct branch, branch_name from skill_meta),
  per_pb as (  -- người-ván × nhánh
    select ps.game_id, ps.seat, ps.branch,
      count(*) as n_skills,
      bool_or(ps.tier = 4 and ps.held_at_end) as has_ult,
      sum(case when ps.held_at_end then ps.points_in else 0 end) as points_in,
      sum(ps.delta_sum) as delta,
      max(ps.money_end) as money_end, bool_or(ps.won) as won, max(ps.rank) as rank
    from ps group by ps.game_id, ps.seat, ps.branch
  ),
  main as (  -- nhánh đổ nhiều điểm nhất của mỗi người-ván
    select distinct on (game_id, seat) game_id, seat, branch, won from per_pb order by game_id, seat, points_in desc, n_skills desc
  )
  select b.branch, b.branch_name, t.n_players,
    count(p.*) as n_picked,
    round(count(p.*)::numeric / nullif(t.n_players, 0), 4),
    count(*) filter (where p.has_ult),
    round(count(*) filter (where p.has_ult)::numeric / nullif(t.n_players, 0), 4),
    round(avg(p.points_in), 2),
    coalesce(sum(p.delta), 0),
    round(sum(p.delta)::numeric / nullif(count(p.*), 0), 1),
    round(sum(p.delta)::numeric / nullif(sum(p.money_end), 0), 4),
    count(*) filter (where p.won is not null),
    -- avg bỏ qua null: người-ván chưa có hạng (ván bỏ dở) không bị tính là thua
    round(avg(p.won::int), 4),
    round(avg(p.rank), 2),
    (select round(avg(g.won::int), 4) from pg g
       where not exists (select 1 from per_pb x where x.game_id = g.game_id and x.seat = g.seat and x.branch = b.branch)),
    (select round(avg(g.rank), 2) from pg g
       where not exists (select 1 from per_pb x where x.game_id = g.game_id and x.seat = g.seat and x.branch = b.branch)),
    (select count(*) from main m where m.branch = b.branch),
    (select round(avg(m.won::int), 4) from main m where m.branch = b.branch)
  from br b
  cross join tot t
  left join per_pb p on p.branch = b.branch
  group by b.branch, b.branch_name, t.n_players
  order by b.branch
$$;

-- Tẩy điểm: bao nhiêu lần, lúc nào, ô nào hay bị tẩy, tẩy xong học gì.
create or replace function public.stats_respec(
  p_from timestamptz default null, p_to timestamptz default null,
  p_mode text default null, p_players int default null, p_finished boolean default true)
returns jsonb
language sql stable security definer set search_path = public as $$
  with f as (select * from stats_game_ids(p_from, p_to, p_mode, p_players, p_finished)),
  ev as (select e.* from skill_events e join f using (game_id) where e.kind = 'respec'),
  w as (select r.* from v_respec r join f using (game_id)),
  after as (  -- 3 ô học kế tiếp sau mỗi lần tẩy
    select l.skill_id from ev
    cross join lateral (select l.skill_id from v_learn l
      where l.game_id = ev.game_id and l.seat = ev.seat and l.level = 1
        and (l.t_ms, l.client_id, l.seq) > (ev.t_ms, ev.client_id, ev.seq)
      order by l.t_ms, l.seq limit 3) l
  )
  select jsonb_build_object(
    'n_respec', (select count(*) from ev),
    'n_player_games', (select count(*) from game_players p join f using (game_id)),
    'per_player_game', (select round(count(*)::numeric / nullif((select count(*) from game_players p join f using (game_id)), 0), 4) from ev),
    'avg_round', (select round(avg(round), 1) from ev),
    'avg_lap', (select round(avg((payload->>'lap')::int), 1) from ev),
    'avg_refund', (select round(avg((payload->>'refund')::int), 2) from ev),
    'avg_fee', (select round(avg((payload->>'fee')::int)) from ev),
    'wiped', (select coalesce(jsonb_agg(jsonb_build_object('skill_id', skill_id, 'n', n) order by n desc), '[]'::jsonb)
              from (select skill_id, count(*) n from w group by skill_id) x),
    'relearned', (select coalesce(jsonb_agg(jsonb_build_object('skill_id', skill_id, 'n', n) order by n desc), '[]'::jsonb)
                  from (select skill_id, count(*) n from after group by skill_id) x)
  )
$$;

-- Kinh tế điểm: nhận bao nhiêu, tiêu bao nhiêu, thừa bao nhiêu cuối ván.
create or replace function public.stats_points(
  p_from timestamptz default null, p_to timestamptz default null,
  p_mode text default null, p_players int default null, p_finished boolean default true)
returns jsonb
language sql stable security definer set search_path = public as $$
  with f as (select * from stats_game_ids(p_from, p_to, p_mode, p_players, p_finished)),
  v as (select x.* from v_points x join f using (game_id))
  select jsonb_build_object(
    'n', (select count(*) from v),
    'avg_earned', (select round(avg(points_earned), 2) from v),
    'avg_spent', (select round(avg(points_spent), 2) from v),
    'avg_left', (select round(avg(points_left), 2) from v),
    'hoard_rate', (select round(avg(case when points_left >= 2 then 1 else 0 end), 4) from v),
    'left_hist', (select coalesce(jsonb_object_agg(points_left, n order by points_left), '{}'::jsonb) from (select points_left, count(*) n from v group by points_left) x),
    'earned_hist', (select coalesce(jsonb_object_agg(points_earned, n order by points_earned), '{}'::jsonb) from (select points_earned, count(*) n from v group by points_earned) x),
    'avg_earned_winner', (select round(avg(points_earned), 2) from v where won),
    'avg_spent_winner', (select round(avg(points_spent), 2) from v where won),
    'avg_left_winner', (select round(avg(points_left), 2) from v where won)
  )
$$;

grant execute on function
  public.stats_game_ids(timestamptz, timestamptz, text, int, boolean),
  public.stats_overview(timestamptz, timestamptz, text, int, boolean),
  public.stats_skills(timestamptz, timestamptz, text, int, boolean),
  public.stats_branches(timestamptz, timestamptz, text, int, boolean),
  public.stats_respec(timestamptz, timestamptz, text, int, boolean),
  public.stats_points(timestamptz, timestamptz, text, int, boolean)
to anon, authenticated;
