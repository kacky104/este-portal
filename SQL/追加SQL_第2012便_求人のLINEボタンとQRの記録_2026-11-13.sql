-- 求人ページの「LINEで応募する」ボタンと LINE の QR コードが押された・読み取られた記録（第2012便・2026-11-13・カッキーさん）
-- ※ Supabase SQL Editor で実行してください。冪等（再実行しても安全）。
--   ★ 新しい表を1つ作るだけ。今ある表・データには触りません。
--   ★ PUSH の前でも後でもかまいません（表が無い間は、ボタンも QR も今までどおり LINE へ飛ぶ・記録だけ残らない）。
--
-- ★ きっかけ: オイルクエスト様のご要望（エステラブワークの「電話・LINE履歴」と同じものがほしい）。全店で使える。
-- ★ ボタンも QR も、いったん https://fukues.com/jobs/<求人番号>/line を通ってから、お店の LINE（apply_line_url）へ飛ぶ。
--   通ったときに1行ずつ残す（via: 'btn' ＝ボタン・'qr' ＝ QR の読み取り）。マイページ → フクエスワーク → LINE の履歴 で見る。
-- ★ 中身は「いつ・どの求人・ボタンか QR か」だけ。押した人の情報（IP・端末など）は持たない。
-- ★ 読み書きはサーバー（service_role）だけ。RLS を有効にして、ポリシーは作らない（画面からは直接読めない）。

create table if not exists public.job_line_taps (
  id         bigserial   primary key,
  salon_id   bigint      not null,
  job_id     bigint      not null,
  via        text        not null check (via in ('btn', 'qr')),
  created_at timestamptz not null default now()
);

create index if not exists job_line_taps_salon_created_idx
  on public.job_line_taps (salon_id, created_at desc);

alter table public.job_line_taps enable row level security;

-- 確かめ（0 件で正常）
select count(*) as rows_now from public.job_line_taps;
