-- 店舗のキャッチフレーズ（TOP・地域ページの店舗カードに表示。最大30文字はアプリ側で制御）。
-- Supabase SQL Editor で実行してください（コード push より先に適用）。
alter table public.salons add column if not exists catchphrase text;
