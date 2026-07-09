-- サロンの第2エリア（任意）。未設定は NULL。値は area と同じエリアキー文字列。
alter table public.salons add column if not exists area2 text;
