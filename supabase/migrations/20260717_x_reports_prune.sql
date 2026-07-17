-- fukuX 通報（x_reports）の保持ルール変更（2026-07-17）:
-- 1) 保持は最新200件まで。新しい通報が入るたびに、古い分（201件目以降）を対応/未対応に関係なく自動削除。
--    運営パネルの表示上限（200件）と実データの保持件数を一致させる。
-- 2) 通報された投稿が削除されたら、その投稿への通報も全て自動削除（FK を set null → cascade に変更）。
--    投稿の削除元（運営パネル・投稿者本人）を問わず効く。
-- ※ Supabase SQL Editor で適用する記録用マイグレーション（冪等）。

-- ── 1. 200件超の自動削除トリガー ──
-- security definer（関数所有者権限）で RLS に関係なく古い行を削除する。
create or replace function public.x_reports_prune()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.x_reports
  where id in (
    select id from public.x_reports
    order by created_at desc, id desc
    offset 200
  );
  return null;
end;
$$;

drop trigger if exists trg_x_reports_prune on public.x_reports;
create trigger trg_x_reports_prune
  after insert on public.x_reports
  for each statement execute function public.x_reports_prune();

-- ── 2. 投稿削除で通報も連動削除（set null → cascade） ──
alter table public.x_reports drop constraint if exists x_reports_post_id_fkey;
alter table public.x_reports
  add constraint x_reports_post_id_fkey
  foreign key (post_id) references public.x_posts(id) on delete cascade;
