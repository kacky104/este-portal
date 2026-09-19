-- フクエスCRM（有料）の利用期限 salons.crm_until を【運営だけ】が変えられるようにする（2026-09-19）
-- ※ Supabase SQL Editor で実行してください。冪等（再実行しても安全）。★ PUSH より前に実行。
--
-- ★ なぜ要るか
--   salons には「オーナーが自分の店の行を更新できる」ポリシー salons_update_owner がある
--   （20260717_salon_popup.sql）。列の制限は無いので、そのままだとオーナーがブラウザから
--   crm_until を書き換えて、有料のCRMを自分で有効にできてしまう。
-- ★ 何をするか
--   crm_until が変わる UPDATE のとき、ログイン中のユーザーが運営（ADMIN_UUID）でなければ止める。
--   ・/admin の店舗編集（運営ログイン）→ 通る
--   ・service_role（サーバー処理）・SQL Editor（auth.uid() が null）→ 通る
--   ・オーナーの /mypage の店舗編集 → crm_until を触らない限り今までどおり通る
-- ★ ADMIN_UUID は src/app/lib/admin.ts・20260616_salons_rls_update.sql と同じ値。

create or replace function public.salons_guard_crm_until()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.crm_until is distinct from old.crm_until
     and auth.uid() is not null
     and auth.uid() <> '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid then
    raise exception 'crm_until は運営だけが変更できます' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists salons_guard_crm_until on public.salons;
create trigger salons_guard_crm_until
  before update of crm_until on public.salons
  for each row execute function public.salons_guard_crm_until();

-- ★ 確認（trigger が1行出ればOK）
-- select tgname from pg_trigger where tgname = 'salons_guard_crm_until';
