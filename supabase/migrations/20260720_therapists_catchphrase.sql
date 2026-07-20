-- セラピストのキャッチフレーズ（店舗詳細の本日出勤カード・在籍一覧カードに表示。最大20文字はアプリ側で制御）。
-- Supabase SQL Editor で実行してください（コード push より先に適用）。
alter table public.therapists add column if not exists catchphrase text;
