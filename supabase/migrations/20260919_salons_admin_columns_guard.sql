-- salons の「運営だけが決める列」をオーナーが書き換えられないようにする（2026-09-19）
-- ※ Supabase SQL Editor で実行してください。冪等（再実行しても安全）。★ PUSH より前に実行。
--
-- ★ なぜ要るか
--   salons にはオーナーが自分の店の行を更新できるポリシー salons_update_owner がある（列の制限なし）。
--   そのままだと、オーナーがブラウザから次の列を書き換えられてしまう:
--     crm_until     … フクエスCRM（有料）の利用期限        → 有料機能を自分で有効化
--     jobs_enabled  … フクエスワーク（求人）掲載の契約      → 求人を契約なしで掲載
--     listing_plan  … 掲載プラン（standard / free）        → 無料掲載枠から本契約の見た目へ
--     show_on_top   … TOP・地域ページへの掲載               → 掲載停止中でも自分で再掲載
--     is_hidden     … 非表示                                 → 非表示にした店を自分で再表示
--   どれも /admin（運営）だけが触る列。★ オーナー側の画面・処理はこれらを書かない（2026-09-19 確認）。
-- ★ 何をするか
--   上の列が【実際に変わる】UPDATE のとき、ログイン中のユーザーが運営（ADMIN_UUID）でなければ止める。
--   ・/admin（運営ログイン）→ 通る
--   ・service_role（サーバー処理）・SQL Editor（auth.uid() が null）→ 通る
--   ・オーナーの店舗編集 → これらの列を変えない限り今までどおり通る（同じ値を送るのは可）
-- ★ 20260919_salons_crm_until_guard.sql（crm_until だけの版）をこれで置き換える。
-- ★ ADMIN_UUID は src/app/lib/admin.ts と同じ値。

create or replace function public.salons_guard_admin_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
     or auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid then
    return new;
  end if;
  if new.crm_until    is distinct from old.crm_until
  or new.jobs_enabled is distinct from old.jobs_enabled
  or new.listing_plan is distinct from old.listing_plan
  or new.show_on_top  is distinct from old.show_on_top
  or new.is_hidden    is distinct from old.is_hidden then
    raise exception 'この項目は運営だけが変更できます' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- 古い crm_until だけの見張りを外して、まとめた見張りに置き換える
drop trigger if exists salons_guard_crm_until on public.salons;
drop function if exists public.salons_guard_crm_until();

drop trigger if exists salons_guard_admin_columns on public.salons;
create trigger salons_guard_admin_columns
  before update of crm_until, jobs_enabled, listing_plan, show_on_top, is_hidden on public.salons
  for each row execute function public.salons_guard_admin_columns();

-- ★ 確認（1行出ればOK・salons_guard_crm_until は出なくなる）
-- select tgname from pg_trigger where tgname in ('salons_guard_admin_columns', 'salons_guard_crm_until');
