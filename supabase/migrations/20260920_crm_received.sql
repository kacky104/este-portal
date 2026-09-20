-- フクエスCRM：予約の「受領済」（お金を受け取ったか）（2026-09-20）
-- ※ Supabase SQL Editor で実行してください。冪等（再実行しても安全）。★ PUSH より前に実行。
--
-- ★ 何のため（風俗CTIv2 の予約カードの「受領済」／予約詳細の「現金受領(客)・現金受領(女)」にあたる）
--   お客さんの料金を受け取ったか、誰が受け取ったかを予約ごとに残す。
-- ★ 値：received_by
--   ''          ＝ 未受領
--   'therapist' ＝ 女子が受け取った（ルームで現金など）
--   'shop'      ＝ お店が受け取った（受付・カード・事前決済など）
--   received_at は受け取りを付けた時刻（未受領に戻したら null）。
-- ★ 次の段階（金銭授受）で「女子が預かった額 − 女子の報酬 ＝ お店に入れる額」の元にする。
-- ★ salon_bookings は公開SELECTなし（service_role で読み書き）。

alter table public.salon_bookings add column if not exists received_by text not null default '';
alter table public.salon_bookings add column if not exists received_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'salon_bookings_received_by_check') then
    alter table public.salon_bookings
      add constraint salon_bookings_received_by_check check (received_by in ('', 'therapist', 'shop'));
  end if;
end $$;

notify pgrst, 'reload schema';

-- ★ 確認
-- select received_by, count(*) from public.salon_bookings group by 1;
