-- 追加SQL 第1591便（2026-10-21・カッキーさん）
-- 写メ日記に「グッド」ボタン（親指・枠なし）。
--   ・誰でも押せる（ログイン不要）。1人1回・もう一度押すと取り消し。数字を表示する。
--   ・「1人」はブラウザごとの識別子（localStorage に置くランダムなUUID）で数える。
--   ・表は直接読み書きさせない（RLS ON・ポリシー無し）。読み書きは下の RPC 2本だけ。
--     → 誰がどの日記を押したか（識別子）は外から見えない。数と「自分が押したか」だけ返す。
-- ★ Supabase ダッシュボードの SQL Editor で実行してください（コード push より先に適用）。

create table if not exists public.diary_goods (
  diary_id   uuid        not null references public.diary_posts(id) on delete cascade,
  voter_key  uuid        not null,
  created_at timestamptz not null default now(),
  primary key (diary_id, voter_key)
);

alter table public.diary_goods enable row level security;
-- ポリシーは作らない（anon / authenticated から直接は読めない・書けない）。

-- 押す／取り消す。戻り値：押した状態か・押したあとの数。
create or replace function public.toggle_diary_good(p_diary_id uuid, p_voter_key uuid)
returns table (good boolean, good_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  if p_diary_id is null or p_voter_key is null then
    raise exception 'bad args';
  end if;

  delete from public.diary_goods
   where diary_id = p_diary_id and voter_key = p_voter_key;
  get diagnostics v_deleted = row_count;

  if v_deleted = 0 then
    insert into public.diary_goods (diary_id, voter_key)
    values (p_diary_id, p_voter_key)
    on conflict do nothing;
  end if;

  return query
    select (v_deleted = 0),
           (select count(*)::integer from public.diary_goods g where g.diary_id = p_diary_id);
end;
$$;

-- 表示用：フィードに並ぶ日記の数と「自分が押したか」をまとめて返す（最大100件）。
create or replace function public.get_diary_goods(p_diary_ids uuid[], p_voter_key uuid)
returns table (diary_id uuid, good_count integer, mine boolean)
language sql
stable
security definer
set search_path = public
as $$
  select g.diary_id,
         count(*)::integer,
         coalesce(bool_or(g.voter_key = p_voter_key), false)
    from public.diary_goods g
   where g.diary_id = any (p_diary_ids[1:100])
   group by g.diary_id;
$$;

revoke all on function public.toggle_diary_good(uuid, uuid) from public;
revoke all on function public.get_diary_goods(uuid[], uuid) from public;
grant execute on function public.toggle_diary_good(uuid, uuid) to anon, authenticated;
grant execute on function public.get_diary_goods(uuid[], uuid) to anon, authenticated;
