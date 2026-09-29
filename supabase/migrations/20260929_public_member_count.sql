-- ★ 第963便（2026-09-29・カッキーさん）: フクエスTOPの「数字の帯」に出す【会員数】。
-- ★ 数えるのはログインできるアカウントの合計（auth.users）＝ 一般会員・店舗オーナー・連携セラピスト・fukuX アカウント・運営をすべて含む。
--   ★ fukuX のアカウントもセラピストもオーナーも、1人＝auth.users の1行なので二重には数えない。
--   ★ 削除済み（deleted_at あり）は数えない。
-- ★ 返すのは【件数だけ】。メールアドレスなどの中身は一切外に出さない。
-- ★ auth スキーマは公開用の鍵（anon）では読めないので security definer で数える。search_path は空にして固定。

create or replace function public.public_member_count()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::bigint from auth.users where deleted_at is null;
$$;

revoke all on function public.public_member_count() from public;
grant execute on function public.public_member_count() to anon, authenticated;
