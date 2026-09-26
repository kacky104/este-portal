-- 第898便: Resend の1日の送信数を数える（2026-09-26・カッキーさん）。
-- ★ 無料プランは1日100通まで。★ 80通を超えたら運営へ知らせる（→ PRO プランへ上げる合図）。
-- ★ 数え方: Resend の Webhook「email.sent」を受けるたびに、その日（日本時間）の数を1つ増やす。
--   ★ アプリからの送信も、Supabase の認証メール（Resend 経由）も、Resend が送ったものは全部数える。
-- ★ 読み書きはサーバー（service role）だけ。

create table if not exists public.email_send_daily (
  day        date primary key,          -- 日本時間の日付
  sent       integer not null default 0,
  warned_at  timestamptz                -- 80通を超えて運営へ知らせた時刻（★ 1日1回だけ）
);
alter table public.email_send_daily enable row level security;
revoke all on public.email_send_daily from anon, authenticated;

-- ★ 1つ増やして、増えたあとの数を返す（同時に来ても数え漏れない）
create or replace function public.bump_email_send_daily(p_day date)
returns integer
language sql
security definer
set search_path = public
as $$
  insert into public.email_send_daily (day, sent) values (p_day, 1)
  on conflict (day) do update set sent = public.email_send_daily.sent + 1
  returning sent;
$$;
revoke execute on function public.bump_email_send_daily(date) from public, anon, authenticated;

-- 確認用（流したあとに）。1行返れば成功。
-- select public.bump_email_send_daily('2000-01-01'); delete from public.email_send_daily where day = '2000-01-01';
