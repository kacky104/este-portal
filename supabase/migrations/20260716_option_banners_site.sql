-- ══════════════════════════════════════════════════════════════════════
-- ★ 2026-08-18（第21便）に git から復元したファイル。SQL本体は当時のまま（byte 完全一致）。
--
-- ── なぜ消えていたか ──
-- コミット 8a381789（2026-07-26「マイグレーション修正とSP用トップ画像を追加…」）で、
-- 中身が 0バイト（空） になっていた。
-- ターミナルに打つはずのコマンドを、開いていたファイルに貼ってしまった事故。
-- 同じコミットで4本が同時に潰れている（この4本）:
--     20260716_option_banners_site.sql   20260719_salons_catchphrase.sql
--     20260721_salons_line_url.sql       20260724_x_drafts.sql
-- 同種の事故は 9eff9c5f でも起きている（20260809_salon_sites_admin_lock.sql）。
--
-- ── 実行する必要はない ──
-- このSQLは当時すでに本番へ適用済み（アプリが対象の列・テーブルを使って動いている）。
-- ただし中身は冪等（if not exists 系）で revoke も drop table も無いので、
-- うっかり流しても何も壊れない。
-- ★ 例外は 20260809_salon_sites_admin_lock.sql だけ。あれは revoke を含むので
--   いま流すと全店のHPが500になる。あちらのファイル冒頭の注意書きを読むこと。
-- ══════════════════════════════════════════════════════════════════════

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
