-- フクエスCRM：予約の「プレイ状況」（2026-09-19）
-- ※ Supabase SQL Editor で実行してください。冪等（再実行しても安全）。★ PUSH より前に実行。
--
-- ★ 何のため（風俗CTIv2 の予約カードのバッジにあたる（フクエスでの呼び名は「住所送済」「入室済」））
--   予約 → 住所送った → 入室済み、と今どこまで進んだかを予約カードに出す。
-- ★ 値：'' ＝ まだ（予約だけ）／ 'address_sent' ＝ 住所送済 ／ 'entered' ＝ 入室済（画面の呼び名・カッキーさん 2026-09-19）
--   既存の status（new / confirmed / cancelled）とは別の列（status は予約の確定・キャンセル用のまま）。
-- ★ salon_bookings は公開SELECTなし（service_role で読み書き）。

alter table public.salon_bookings add column if not exists play_status text not null default '';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'salon_bookings_play_status_check') then
    alter table public.salon_bookings
      add constraint salon_bookings_play_status_check check (play_status in ('', 'address_sent', 'entered'));
  end if;
end $$;

notify pgrst, 'reload schema';

-- ★ 確認
-- select play_status, count(*) from public.salon_bookings group by 1;
