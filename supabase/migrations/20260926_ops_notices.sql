-- 第862便: 運営からのお知らせ（2026-09-26・カッキーさんの指示・案②）。
-- ★ 管理画面 /admin/notices で運営が書く（service role・requireAdmin のあと）。
-- ★ 店舗マイページの上に1行の帯（新しい1件・載せてから14日）＋一覧 /mypage/notices。
-- ★ 読めるのは【店舗のオーナー（salons.owner_id）】で【公開】のものだけ。★ 一般会員（お客様）には見せない。

create table if not exists public.ops_notices (
  id            bigserial primary key,
  notice_date   date not null,                                   -- 帯・一覧に出す日付（例: 10/5 開始）
  title         text not null check (char_length(title) between 1 and 60),
  body          text not null default '',                        -- 押すと開く詳しい説明（改行そのまま）
  is_published  boolean not null default false,                  -- 下書き → 公開
  published_at  timestamptz,                                     -- 公開した時刻（★ 帯に出す14日はここから数える）
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_ops_notices_pub on public.ops_notices (is_published, published_at desc);

alter table public.ops_notices enable row level security;
revoke all on public.ops_notices from anon;

drop policy if exists ops_notices_owner_read on public.ops_notices;
create policy ops_notices_owner_read on public.ops_notices
  for select to authenticated using (
    is_published
    and exists (select 1 from public.salons s where s.owner_id = auth.uid())
  );

-- 確認用（流したあとに）。1行返れば成功。
-- select table_name from information_schema.tables where table_schema='public' and table_name='ops_notices';
