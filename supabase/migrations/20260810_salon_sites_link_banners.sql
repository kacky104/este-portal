-- 公式ホームページ: 相互リンクのバナー群「LINK」欄（2026-08-10）。
--
-- 掲載サイト・求人サイトから配られる相互リンク用のコードを、店舗が自分で貼って
-- 増やせるようにするための列。1要素 = { image_url, link, label } の配列（最大30）。
--   image_url … 画像バナーのURL（https のみ）。文字だけのリンクは空文字
--   link      … リンク先（http(s) のみ・空文字ならリンクなし）
--   label     … 文字リンクの表示文字／画像バナーの alt（省略可）
-- 貼られたHTMLをそのまま出すのではなく、上の3つを抜き出して保存する
-- （店舗の独自ドメインは管理画面と同じオリジンなので、自由HTMLは許可しない）。
--
-- Supabase SQL Editor で実行してください（コード push より先に適用。
-- 実行しないと公開ページが link_banners を SELECT できず 404 になる）。

alter table public.salon_sites
  add column if not exists link_banners jsonb not null default '[]'::jsonb;

-- 公開ページ（anon）が読めるように列単位の SELECT を追加。
-- （20260809_salon_sites_admin_lock.sql でテーブル単位の select を revoke し
--   列単位で grant し直しているため、新しい列は明示的に grant が必要）
grant select (link_banners) on public.salon_sites to anon, authenticated;
