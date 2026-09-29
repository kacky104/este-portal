-- ★★ 第1000便（2026-09-30・カッキーさん）: フクエスに掲載中のお店が fukuX のお店アカウントを作ったら【自動で認証バッジ】を付ける関数。
--
-- 条件
--   ・ログイン中の本人の x_profiles が kind='shop' で、凍結（rejected）でない
--   ・本人（auth.uid()）が owner_id の salons が【掲載中（is_hidden = false）】に1件以上ある
--   ・すでに認証済みなら何もしない
-- ★ フクエス側の掲載審査で確認済みのお店だけが対象＝二重審査にはならない。
-- ★ is_verified は trg_x_profiles_guard により、運営（x_is_admin）か x.allow_auto_verified='on' の中でしか変えられない。
--   ここではその合図を立てて変える（合図は既存の仕組み）。
-- ★ 呼べるのはログイン済み（authenticated）の本人だけ。本人の行しか変えない。
-- ★ 戻り値: true=今回認証した／すでに認証済み、false=条件に合わない。
--
-- ★ Supabase ダッシュボードの SQL Editor で実行してください。

create or replace function public.x_shop_auto_verify()
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_me record;
  v_listed boolean;
begin
  select id, kind, status, auth_user_id, is_verified into v_me
    from public.x_profiles where auth_user_id = auth.uid();
  if v_me.id is null then return false; end if;
  if v_me.kind <> 'shop' then return false; end if;
  if v_me.status = 'rejected' then return false; end if;
  if coalesce(v_me.is_verified, false) then return true; end if;

  -- フクエスに掲載中のお店を持っているか
  select exists (
    select 1 from public.salons s
     where s.owner_id = v_me.auth_user_id
       and coalesce(s.is_hidden, false) = false
  ) into v_listed;
  if not v_listed then return false; end if;

  perform set_config('x.allow_auto_verified', 'on', true);
  update public.x_profiles set is_verified = true where id = v_me.id;
  return true;
end;
$function$;

revoke all on function public.x_shop_auto_verify() from public;
grant execute on function public.x_shop_auto_verify() to authenticated;

-- ── 確認用（別に実行）──
-- select proname, prosecdef from pg_proc where proname = 'x_shop_auto_verify';
