-- 公式HP（フクエスサイト）のアクセス解析に「ネット予約タップ」を足す（第1878便・2026-11-10・カッキーさん）
-- ※ Supabase SQL Editor で実行してください。冪等（再実行しても安全）。★ PUSH より前に実行。
--   （先に PUSH すると、解析の画面が列 book を読めずに開けなくなります）
--
-- ★ 第1877便で公式HPの下の帯・メニューに「ネット予約」（フクエスの予約ページへ）を出した。その押された数を数える。
-- ★ 表 hp_stats に列 book を足し、足し算の関数 hp_stat_add も book を足すようにする（ほかは第1792便のまま）。

alter table public.hp_stats add column if not exists book integer not null default 0;

create or replace function public.hp_stat_add(p_salon_id integer, p_day date, p_rows jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.hp_stats as s (salon_id, day, dim, key, pv, sessions, users, new_users, tel, line, contact, book)
  select p_salon_id, p_day, r->>'dim', left(r->>'key', 120),
         coalesce((r->>'pv')::int, 0), coalesce((r->>'sessions')::int, 0), coalesce((r->>'users')::int, 0),
         coalesce((r->>'new_users')::int, 0), coalesce((r->>'tel')::int, 0), coalesce((r->>'line')::int, 0),
         coalesce((r->>'contact')::int, 0), coalesce((r->>'book')::int, 0)
  from jsonb_array_elements(p_rows) r
  where r->>'dim' in ('src','first','page','hour','device') and coalesce(r->>'key', '') <> ''
  on conflict (salon_id, day, dim, key) do update set
    pv        = s.pv        + excluded.pv,
    sessions  = s.sessions  + excluded.sessions,
    users     = s.users     + excluded.users,
    new_users = s.new_users + excluded.new_users,
    tel       = s.tel       + excluded.tel,
    line      = s.line      + excluded.line,
    contact   = s.contact   + excluded.contact,
    book      = s.book      + excluded.book;
$$;

revoke all on function public.hp_stat_add(integer, date, jsonb) from public, anon, authenticated;
grant execute on function public.hp_stat_add(integer, date, jsonb) to service_role;

notify pgrst, 'reload schema';

-- ★ 確認
-- select column_name from information_schema.columns where table_name = 'hp_stats' and column_name = 'book';
