-- 料金表の備考欄（2026-08-20 / 第26便・オーナー要望）。
--
-- /mypage の「コースメニュー・料金表」の一番下で入力し、
--   ・フクエス側 … /salon/{id}/price と、店舗詳細ページの折り畳みブロック
--   ・公式HP     … トップの「コース料金」ブロックと /system
-- の「※ 表示料金はすべて税込み価格です。」の【上】に表示する。
-- 空欄（null または空文字）のときは欄ごと出さない。改行はそのまま保持する。
--
-- ★ Supabase ダッシュボードの SQL Editor で実行してください（コード push より先に適用推奨）。
--   先にコードが出ても、列が無い間は select が失敗して料金ページが 500 になり得ます。
--   逆にこの SQL だけ先に流しても、表示側は何も変わりません（安全側）。
-- 冪等（if not exists）なので、何度流しても問題ありません。

alter table public.salons
  add column if not exists course_note text;

comment on column public.salons.course_note is
  '料金表の備考（改行保持・税込注記の上に表示）。空なら非表示。/mypage で店舗オーナーが編集する。';

-- salons は列単位ではなくテーブル単位で権限を出しているため、通常この2行は不要（no-op）。
-- 将来 salons が列単位 grant に切り替わった場合の取りこぼし防止として明示しておく。
grant select (course_note) on public.salons to anon, authenticated;
grant update (course_note) on public.salons to authenticated;

-- 確認用（適用後に別途流す）。
-- select column_name, data_type from information_schema.columns
--  where table_schema='public' and table_name='salons' and column_name='course_note';
