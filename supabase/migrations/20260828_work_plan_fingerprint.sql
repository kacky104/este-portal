-- 承認した内容の指紋を計画に持たせる（第46便）。
--
-- ★★★ なぜ要るか
--   人が画面で見て承認したのは【そのときの差分】。実際に送るのは
--   【送る直前に読み直して作った差分】。あいだに駅ちか側やフクエス側が変われば、
--   ★ **承認していない内容を送る**ことになる。出勤フォームは全件上書きなので、
--     これは設計メモ §11-3 の事故そのもの。
--   → 承認ボタンを押すときに「この指紋の内容を承認した」を持たせ、
--     送る直前に組み直した計画の指紋と突き合わせて、違えば送らない。
--
-- ★ 指紋には「何をどう変えるか」だけを入れる（girlId・日・変更後）。
--   変更前の値は入れない＝駅ちか側が別の理由で変わっただけのときに無用に止めない。
--   組み立ては src/lib/workPlan.ts の planFingerprint（純粋関数・自己点検あり）。
--
-- ★ 既存行は '' に落ちる。空の指紋で承認はできない（送信側が空を弾く）ので安全。

alter table public.media_work_plans
  add column if not exists fingerprint text not null default '';

comment on column public.media_work_plans.fingerprint is
  E'この計画の指紋。承認ボタンはこの値を「承認した内容」として送信側へ渡し、送る直前に組み直した計画の指紋と一致しなければ送らない（第46便）。';

-- 確認用（適用後に別途流す）
-- select salon_id, provider, slot, change_count, fingerprint, created_at
--   from public.media_work_plans;
