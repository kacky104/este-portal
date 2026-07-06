-- salon_jobs に「お祝い金」カラムを追加（サロンオーナーが任意設定・null許容）。
-- フクエスワーク経由の応募で採用が決まった方へ、サロン様から進呈するお祝い金（円）。
-- お金の出所はサロンオーナー。入力は /mypage の求人タブ。null または 0 以下は求人ページで非表示。
-- 実適用は Supabase ダッシュボードの SQL Editor 済み。このファイルは記録用（既存慣例に合わせた追記）。

ALTER TABLE salon_jobs
  ADD COLUMN IF NOT EXISTS celebration_money integer;
