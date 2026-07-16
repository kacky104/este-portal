-- option_banners に対象サイト（site）を追加。オプションがどのサイト向けかを識別バッジで表示するため。
--   'fukues' … フクエス（本体）      … ピンク系バッジ
--   'work'   … フクエスワーク（求人）… エメラルド系バッジ
--   'fukux'  … フクエックス（SNS）   … インディゴ系バッジ
-- 既存行は default 'fukues' で埋まる（現行の商品はすべて本体向けのため）。
-- ※ Supabase SQL Editor で適用する記録用マイグレーション（add column if not exists で冪等）。
-- ※ 値は管理画面のプルダウンで上記3種に制限。将来のためチェック制約も付与（存在時はスキップ）。

alter table public.option_banners
  add column if not exists site text not null default 'fukues';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'option_banners_site_check'
  ) then
    alter table public.option_banners
      add constraint option_banners_site_check
      check (site in ('fukues', 'work', 'fukux'));
  end if;
end $$;
