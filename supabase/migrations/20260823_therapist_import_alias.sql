-- 外部媒体取り込みの照合用別名 (2026-08-23 第28便続き)
--
-- 背景: 名前照合（normalizeName）はカタカナ→ひらがな変換まで。漢字は変換できないため、
-- 駅ちか側だけ表記が違う子（例: 駅ちか「愛」⇔フクエス「アイ」）が unmatched になる。
-- フクエスの公開名を変えずに結びつけるため、取り込み専用の別名を持たせる。
-- /api/import/ingest は name と import_aliases の両方を正規化して索引に載せる。
--
-- 注意: therapists は公開側が読むテーブルなので、この列も anon から select できる。
-- 中身は他媒体で既に公開されている源氏名の別表記のみを入れること（秘密情報は不可）。
alter table public.therapists
  add column if not exists import_aliases text[] not null default '{}';

comment on column public.therapists.import_aliases is
  '外部媒体取り込みの照合用別名（例: 駅ちか側の漢字表記）。公開表示には使わない。';

-- 適用後の使い方（例: ラビリンスのアイに駅ちか表記「愛」を結びつける）:
-- update therapists set import_aliases = array['愛'] where salon_id = 6 and name = 'アイ';
