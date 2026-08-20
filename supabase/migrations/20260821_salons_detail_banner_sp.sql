-- 詳細ページバナーの SP（スマホ）用画像（2026-08-21 / 第27便・オーナー要望）。
--
-- /mypage「店舗装飾」タブの「詳細ページ バナー（最大3）」で、
-- 各スロットに PC用（横長）と SP用（スマホ向け）の2枚を登録できるようにする。
--   ・PC（640px以上） … 従来どおり detail_banner_image_url / 2 / 3
--   ・SP（640px未満） … このマイグレーションで追加する _sp 列
--   ・SP用が未設定のスロットは、従来どおり PC用画像をそのまま表示する（フォールバック）
-- 列名は既存の page_heroes.image_url_sp / header_slides.image_url_sp と同じ「_sp」方式。
--
-- ★ Supabase ダッシュボードの SQL Editor で実行してください（コード push より先に適用が必須）。
--   /mypage の店舗取得はこの3列を select に含めるため、列が無い状態でコードだけ本番に出ると
--   すべてのオーナーが「店舗情報が見つかりません」になります（禁則174）。
--   逆にこの SQL だけ先に流しても表示は何も変わりません（安全側）。
-- 冪等（if not exists）なので、何度流しても問題ありません。

alter table public.salons
  add column if not exists detail_banner_image_url_sp  text,
  add column if not exists detail_banner_image_url2_sp text,
  add column if not exists detail_banner_image_url3_sp text;

comment on column public.salons.detail_banner_image_url_sp is
  '詳細ページバナー1のSP用画像URL（640px未満で表示）。null なら detail_banner_image_url を流用。';
comment on column public.salons.detail_banner_image_url2_sp is
  '詳細ページバナー2のSP用画像URL（640px未満で表示）。null なら detail_banner_image_url2 を流用。';
comment on column public.salons.detail_banner_image_url3_sp is
  '詳細ページバナー3のSP用画像URL（640px未満で表示）。null なら detail_banner_image_url3 を流用。';

-- salons は列単位ではなくテーブル単位で権限を出しているため、通常この2行は不要（no-op）。
-- 将来 salons が列単位 grant に切り替わった場合の取りこぼし防止として明示しておく。
grant select (detail_banner_image_url_sp, detail_banner_image_url2_sp, detail_banner_image_url3_sp)
  on public.salons to anon, authenticated;
grant update (detail_banner_image_url_sp, detail_banner_image_url2_sp, detail_banner_image_url3_sp)
  on public.salons to authenticated;

-- 確認用（適用後に別途流す）。3行返れば成功。
-- select column_name, data_type from information_schema.columns
--  where table_schema='public' and table_name='salons' and column_name like 'detail_banner_image_url%_sp';
