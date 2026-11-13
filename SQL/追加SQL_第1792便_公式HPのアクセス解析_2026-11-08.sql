-- 公式HP（フクエスサイト）のアクセス解析（第1792便・2026-11-08・カッキーさん／オイルクエスト様のご要望）
-- ※ Supabase SQL Editor で実行してください。冪等（再実行しても安全）。★ PUSH より前に実行。
--
-- ★ 何を数えるか（公式HPの各ページに入れた小さな計測から /api/hp/track に届く）
--   ・閲覧（PV）・訪問（セッション）・人数（その日はじめて見た端末）・はじめての人
--   ・電話タップ・LINEタップ・お問い合わせ送信
-- ★ 生の記録（1閲覧1行）は持たない。「日 × 切り口 × 値」ごとに数を足すだけ（Disk IO を増やさないため）。
--   切り口（dim）:
--     src    … その訪問の流入元（google・yahoo・(direct)・esthe-ranking.jp など）。閲覧・訪問・人数・成果
--     first  … その人が最初に来た流入元。成果（電話・LINE・お問い合わせ）だけ
--     page   … ページ（/・/therapist/123 など）。閲覧と、そのページで押された成果
--     hour   … 時間帯（0〜23・日本時間）。閲覧と成果（曜日は日付から出す）
--     device … sp / pc。訪問・人数
-- ★ お店の内部情報 → RLS で全部閉じる（service_role だけ）。足し算は関数 hp_stat_add で1回にまとめる。

create table if not exists public.hp_stats (
  salon_id   integer not null references public.salons(id) on delete cascade,
  day        date    not null,                 -- 日本時間の日付
  dim        text    not null check (dim in ('src','first','page','hour','device')),
  key        text    not null check (char_length(key) between 1 and 120),
  pv         integer not null default 0,
  sessions   integer not null default 0,
  users      integer not null default 0,
  new_users  integer not null default 0,
  tel        integer not null default 0,
  line       integer not null default 0,
  contact    integer not null default 0,
  primary key (salon_id, day, dim, key)
);

comment on table public.hp_stats is
  E'公式HPのアクセス解析（日ごと・切り口ごとの数）。生の記録は持たない。★ お店の内部情報・service_role 専用。第1792便。';

alter table public.hp_stats enable row level security;
revoke all on public.hp_stats from anon, authenticated;

-- 足し算（行が無ければ作る）。p_rows = [{dim, key, pv, sessions, users, new_users, tel, line, contact}, ...]
create or replace function public.hp_stat_add(p_salon_id integer, p_day date, p_rows jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.hp_stats as s (salon_id, day, dim, key, pv, sessions, users, new_users, tel, line, contact)
  select p_salon_id, p_day, r->>'dim', left(r->>'key', 120),
         coalesce((r->>'pv')::int, 0), coalesce((r->>'sessions')::int, 0), coalesce((r->>'users')::int, 0),
         coalesce((r->>'new_users')::int, 0), coalesce((r->>'tel')::int, 0), coalesce((r->>'line')::int, 0),
         coalesce((r->>'contact')::int, 0)
  from jsonb_array_elements(p_rows) r
  where r->>'dim' in ('src','first','page','hour','device') and coalesce(r->>'key', '') <> ''
  on conflict (salon_id, day, dim, key) do update set
    pv        = s.pv        + excluded.pv,
    sessions  = s.sessions  + excluded.sessions,
    users     = s.users     + excluded.users,
    new_users = s.new_users + excluded.new_users,
    tel       = s.tel       + excluded.tel,
    line      = s.line      + excluded.line,
    contact   = s.contact   + excluded.contact;
$$;

revoke all on function public.hp_stat_add(integer, date, jsonb) from public, anon, authenticated;
grant execute on function public.hp_stat_add(integer, date, jsonb) to service_role;

notify pgrst, 'reload schema';

-- ★ 確認
-- select dim, count(*), sum(pv) from public.hp_stats group by dim;
