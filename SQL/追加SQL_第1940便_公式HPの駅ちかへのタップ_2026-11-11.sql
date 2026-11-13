-- 公式HP（フクエスサイト）のアクセス解析に「駅ちかへのタップ」を足す（第1940便・2026-11-11・カッキーさん）
-- ※ Supabase SQL Editor で実行してください。冪等（再実行しても安全）。
--   ★ PUSH の前でも後でもかまいません（画面は列が無い間は今までどおり動く・数え始めるのはこの SQL を流してから）
--
-- ★ 公式HP管理でリンク先を「駅ちか」にした項目（セラピスト・出勤・写メ日記・口コミ）が押された数を、項目ごとに数える。
--   トップの写メ日記・口コミの欄（埋め込み）の中で押した分も入る。
-- ★ 表 hp_stats に列 ek_therapist・ek_schedule・ek_diary・ek_review を足し、
--   足し算の関数 hp_stat_add もその4つを足すようにする（ほかは第1792便・第1878便のまま）。

alter table public.hp_stats add column if not exists ek_therapist integer not null default 0;
alter table public.hp_stats add column if not exists ek_schedule  integer not null default 0;
alter table public.hp_stats add column if not exists ek_diary     integer not null default 0;
alter table public.hp_stats add column if not exists ek_review    integer not null default 0;

create or replace function public.hp_stat_add(p_salon_id integer, p_day date, p_rows jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.hp_stats as s (salon_id, day, dim, key, pv, sessions, users, new_users, tel, line, contact, book,
                                    ek_therapist, ek_schedule, ek_diary, ek_review)
  select p_salon_id, p_day, r->>'dim', left(r->>'key', 120),
         coalesce((r->>'pv')::int, 0), coalesce((r->>'sessions')::int, 0), coalesce((r->>'users')::int, 0),
         coalesce((r->>'new_users')::int, 0), coalesce((r->>'tel')::int, 0), coalesce((r->>'line')::int, 0),
         coalesce((r->>'contact')::int, 0), coalesce((r->>'book')::int, 0),
         coalesce((r->>'ek_therapist')::int, 0), coalesce((r->>'ek_schedule')::int, 0),
         coalesce((r->>'ek_diary')::int, 0), coalesce((r->>'ek_review')::int, 0)
  from jsonb_array_elements(p_rows) r
  where r->>'dim' in ('src','first','page','hour','device') and coalesce(r->>'key', '') <> ''
  on conflict (salon_id, day, dim, key) do update set
    pv           = s.pv           + excluded.pv,
    sessions     = s.sessions     + excluded.sessions,
    users        = s.users        + excluded.users,
    new_users    = s.new_users    + excluded.new_users,
    tel          = s.tel          + excluded.tel,
    line         = s.line         + excluded.line,
    contact      = s.contact      + excluded.contact,
    book         = s.book         + excluded.book,
    ek_therapist = s.ek_therapist + excluded.ek_therapist,
    ek_schedule  = s.ek_schedule  + excluded.ek_schedule,
    ek_diary     = s.ek_diary     + excluded.ek_diary,
    ek_review    = s.ek_review    + excluded.ek_review;
$$;

revoke all on function public.hp_stat_add(integer, date, jsonb) from public, anon, authenticated;
grant execute on function public.hp_stat_add(integer, date, jsonb) to service_role;

notify pgrst, 'reload schema';

-- ★ 確認（4 と出れば OK）
-- select count(*) from information_schema.columns where table_name = 'hp_stats' and column_name like 'ek\_%';
