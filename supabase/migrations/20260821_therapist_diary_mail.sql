-- 写メ日記のメール投稿（2026-08-21 第27便）
--
-- 背景: 更新代行システム「ベンリー」等は、サイトごとに発行された投稿用メールアドレスへ
-- メールを送る方式で写メ日記を転送する（件名=タイトル・本文=日記・添付=写真）。
-- フクエスに受け口が無く連携不可と言われたため、Resend Inbound で受信して
-- diary_posts へ自動投稿する経路を新設する。
--
-- 構成:
--   therapist_diary_mail … セラピストごとの投稿用アドレスの秘密トークン。
--     アドレスは d-{token}@diary.fukues.com。トークンが漏れると第三者が投稿できるため、
--     このテーブルは anon / authenticated に一切開けない（RLS有効・ポリシーなし・GRANTなし）。
--     読み書きはサーバー（service_role）のみ。オーナーへの表示は server action
--     （actions/diaryMail.ts）が assertOwner 相当の検証をしてから返す。
--     ※ therapists テーブルに列として持たせないのは、therapists が公開ページから
--       anon で SELECT されるため（トークンが世界に漏れる）。
--   diary_mail_log … 処理済みメールの記録（Webhook再送での二重投稿防止）。
--     email_id の一意制約に「insert できたら初回」で判定する。

-- 1. 投稿用トークン
create table if not exists public.therapist_diary_mail (
  therapist_id bigint primary key references public.therapists(id) on delete cascade,
  token        text not null unique,
  created_at   timestamptz not null default now()
);

alter table public.therapist_diary_mail enable row level security;
-- ポリシーは意図的に作らない（service_role は RLS を通らない）。
revoke all on public.therapist_diary_mail from anon, authenticated;

-- 2. 処理済みメールログ（二重投稿防止）
create table if not exists public.diary_mail_log (
  email_id   text primary key,          -- Resend の email_id
  therapist_id bigint,                  -- 解決できた場合のみ（調査用）
  result     text not null,             -- 'posted' | 'rejected:<理由>'
  created_at timestamptz not null default now()
);

alter table public.diary_mail_log enable row level security;
revoke all on public.diary_mail_log from anon, authenticated;

-- 確認用（適用後に別途流す）。2行返れば成功。
-- select table_name from information_schema.tables
--   where table_schema='public' and table_name in ('therapist_diary_mail','diary_mail_log');
