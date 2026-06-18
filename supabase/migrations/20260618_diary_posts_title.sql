-- 写メ日記に題名（タイトル）カラムを追加
-- 既存の content は本文として継続使用、title は題名（最大20文字想定・アプリ側で制限）。
ALTER TABLE public.diary_posts
  ADD COLUMN IF NOT EXISTS title text;
