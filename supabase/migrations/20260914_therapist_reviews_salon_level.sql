-- therapist_reviews に「店舗宛て」を入れられるようにする（第368便・無料掲載枠の口コミ）。
-- セラピスト宛て（既存の全行）= therapist_id あり・salon_id NULL（既存行は触らない）。
-- 店舗宛て（無料掲載店だけ）= therapist_id NULL・salon_id あり。
-- ※ Supabase SQL Editor で適用する。冪等。
-- ★ salon_id は bigint（salons.id が bigint であることを 0-1-r で確認済み）。integer にすると型が合わない。

alter table public.therapist_reviews alter column therapist_id drop not null;

alter table public.therapist_reviews
  add column if not exists salon_id bigint references public.salons(id) on delete cascade;

alter table public.therapist_reviews drop constraint if exists therapist_reviews_target_check;
alter table public.therapist_reviews
  add constraint therapist_reviews_target_check check (therapist_id is not null or salon_id is not null);

create index if not exists idx_therapist_reviews_salon_id
  on public.therapist_reviews (salon_id) where salon_id is not null;
