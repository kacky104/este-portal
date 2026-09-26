-- 第887便: セラピストページ連携の「リンク・QRで招待」（2026-09-26・カッキーさんの指示）。
-- ★ オーナーがセラピスト1人ごとに招待リンクを作る → 本人がリンクを開いて自分のメールを入れる
--   → 今までと同じ招待メール（inviteUserByEmail）が届く → パスワードを決めると連携。
-- ★ リンクの文字列そのものは保存しない（sha256 のハッシュだけ）。★ 有効は24時間・1回だけ。
-- ★ 読み書きはサーバー（service role）だけ。★ anon / authenticated には一切見せない（ポリシーを作らない）。

create table if not exists public.cast_invite_links (
  id            bigserial primary key,
  therapist_id  bigint not null references public.therapists(id) on delete cascade,
  salon_id      bigint not null references public.salons(id) on delete cascade,
  token_hash    text not null unique,                      -- sha256(リンクの文字列) の16進
  expires_at    timestamptz not null,                      -- 作ってから24時間
  used_at       timestamptz,                               -- 本人がメールを入れた時刻（★ 入ったら使えない）
  revoked_at    timestamptz,                               -- 作り直し・取り消しで無効にした時刻
  created_by    uuid,                                      -- 作ったオーナー（auth.users.id）
  created_at    timestamptz not null default now()
);
create index if not exists idx_cast_invite_links_therapist on public.cast_invite_links (therapist_id, created_at desc);

alter table public.cast_invite_links enable row level security;
revoke all on public.cast_invite_links from anon, authenticated;

-- 確認用（流したあとに）。1行返れば成功。
-- select table_name from information_schema.tables where table_schema='public' and table_name='cast_invite_links';
