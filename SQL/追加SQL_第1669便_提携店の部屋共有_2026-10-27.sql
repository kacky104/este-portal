-- 第1669便（2026-10-27・カッキーさんの決定）: フクエスCRM「提携店の部屋共有」。
--   例: ラビリンスの「きほ」＝ enju の「かるあ」。enju の予約のお客様がラビリンスの部屋Aに入る。
--   ★ 考え方: 同じ日に同じ部屋を登録している出勤は、どの店のものでも「その部屋の予定」として扱う（人のつながりは持たない）。
--   ★ 2列足すだけ。今ある行は何も変わらない（room_salon_id は null＝自店の部屋のまま）。
--   ★ 2026-10-27 15:44 に Supabase SQL Editor で実行済み（Success）。冪等。

-- crm_work_days: 借りた部屋の店（null＝自店の部屋）
alter table public.crm_work_days
  add column if not exists room_salon_id integer references public.salons(id) on delete set null;
create index if not exists crm_work_days_room_idx
  on public.crm_work_days (business_date, room_salon_id, room) where room_salon_id is not null;

-- crm_groups: 部屋共有を使うグループか（NG 共有だけのグループは false のまま）
alter table public.crm_groups
  add column if not exists room_share boolean not null default false;

notify pgrst, 'reload schema';
