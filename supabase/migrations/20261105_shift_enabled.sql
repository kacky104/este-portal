-- シフト提出の「使う／使わない」をお店ごとに（2026-11-05・カッキーさん「店舗によっては使わないところもあるので選べるように」）
-- ※ Supabase SQL Editor で実行してください。冪等（再実行しても安全）。★ PUSH より前に実行。
--
-- ★ enabled ＝ お店がシフト提出を使うか。オンの店だけ、セラピストページに「シフト提出」タブが出て希望を出せる。
--   切り替えるのはお店（と運営の代行）が、シフト希望管理表の上の設定の枠で。既定はオフ。
-- ★ 運営の外枠は今までどおり環境変数 SHIFT_SALON_IDS（11/5 から all＝全店で選べる）。
-- ★ オフに戻しても、それまでの希望・確定（shift_requests）は消さない。
-- ★ いま使っているラビリンス様（salon 6）だけオンにしておく。

alter table public.shift_settings add column if not exists enabled boolean not null default false;

comment on column public.shift_settings.enabled is
  'シフト提出を使うか（お店ごと・既定オフ）。オンの店だけセラピストページに「シフト提出」タブが出る。';

insert into public.shift_settings (salon_id, enabled)
select 6, true
where exists (select 1 from public.salons where id = 6)
  and not exists (select 1 from public.shift_settings where salon_id = 6);
update public.shift_settings set enabled = true where salon_id = 6;

notify pgrst, 'reload schema';

-- ★ 確認
-- select salon_id, enabled, period, room_count from public.shift_settings order by salon_id;
