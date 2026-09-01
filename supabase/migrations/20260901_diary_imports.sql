-- 駅ちかの写メ日記を取り込む: 取り込み済みの置き場（第92便）
--
-- ★★★ 何のために作るか（設計メモ_駅ちかの写メ日記取り込み_2026-09-01 §369・§6-3）
--   店舗オーナー様からのご依頼。駅ちかに投稿された写メ日記を、フクエスにも入れる。
--   採ったのは【ベンリー方式】＝ 駅ちかの管理画面を15分ごとに読んで、新しい日記だけ拾う。
--
--   ★★★ このテーブルが要る理由はただ1つ。
--     【店舗様がフクエスで消した日記が、次の巡回でまた入ってこないこと。】
--   ★ 「取り込んだ記録」と「日記そのもの」を分ける。★ 記録のほうは消さない。
--   ★ diary_posts を消したら記録も消える形にすると、消した翌15分で必ず戻ってくる。
--
-- ★★ 引き継ぎメモ 作法 3-5「0件と分からないを混ぜない」と同じ形。
--   ここでは【消した】と【まだ取り込んでいない】を混ぜない。
--   ★ 行が無い          … まだ取り込んでいない        → 次の巡回で取りに行く
--   ★ 行がある・post 有 … 取り込んで、いま載っている  → 何もしない
--   ★ 行がある・post 無 … 取り込んだが、店舗様が消した → ★ 二度と入れない
--   ★ status='skipped:private' … 非公開なので入れていない（★ 読めなかったのではない）
--
-- ★ 枠（slot）まで鍵に入れる理由: 同じ店が駅ちかに2掲載持つことがあり、日記IDは掲載ごとに
--   別の採番になる（第42便 20260828_import_slot.sql と同じ考え方）。
--   ★ 媒体は割らない。枠が増えても行が増えるだけ。
--
-- ★ 当ててあっても空でも安全に通る（冪等）。

-- ────────────────────────────────────────────────────────────
-- 1. 取り込み済みの日記
-- ────────────────────────────────────────────────────────────
create table if not exists public.salon_diary_imports (
  salon_id          bigint      not null references public.salons(id) on delete cascade,
  provider          text        not null default 'ekichika',
  slot              smallint    not null default 1,
  -- ★ 媒体側の日記ID（駅ちかは /admin/maildiary/edit/<日記ID>/ の数字）。
  --   ★ 数字だが text で持つ。媒体が変われば採番も変わる（外部の値を数値にしない）。
  external_diary_id text        not null,
  -- ★ 照合の結果。★ 名前ではなく castId（girls_id）で結びつけた相手（§367）。
  therapist_id      bigint      references public.therapists(id) on delete set null,
  -- ★★ フクエス側の日記。★ 店舗様が消したら null になる（on delete set null）。
  --   ★ null は「消された」の意味。★ 行そのものは残るので、二度と取り込まない。
  diary_post_id     uuid        references public.diary_posts(id) on delete set null,
  -- ★ 媒体側の投稿日時（一覧に出ている「2026 08/31 17:12」）。初回40日ぶんの範囲判断に使う。
  posted_at         timestamptz,
  -- ★★ なぜ post が無いのかを、行を見ただけで言えるようにする（3-5）。
  --   'imported'          … 取り込んだ（★ post が null なら店舗様が消した）
  --   'skipped:private'   … 駅ちかで非公開（display_flg=0）なので入れていない
  --   'skipped:no_match'  … castId に当たるセラピストがフクエスに居ない
  status            text        not null default 'imported',
  imported_at       timestamptz not null default now(),
  primary key (salon_id, provider, slot, external_diary_id)
);

comment on table public.salon_diary_imports is
  '媒体から取り込んだ写メ日記の記録（店舗×媒体×枠×日記ID）。★ 日記本体を消してもこの行は消さない（消した日記が次の巡回で戻らないように）。service_role専用（第92便）。';

comment on column public.salon_diary_imports.diary_post_id is
  E'フクエス側の diary_posts.id。★ null は【店舗様が消した】の意味。★「まだ取り込んでいない」は行が無いことで表す（混ぜない）。';

comment on column public.salon_diary_imports.status is
  E'imported / skipped:private / skipped:no_match。★ post が無い理由を行だけで言えるようにするための列。';

comment on column public.salon_diary_imports.posted_at is
  E'媒体側の投稿日時（駅ちかの一覧の「2026 08/31 17:12」・JST）。初回40日ぶんの範囲判断と並べ替えに使う。';

-- ★ 日記本体から逆に引く（消されたときの後始末・画面の「取り込み」の印）。
create index if not exists idx_salon_diary_imports_post
  on public.salon_diary_imports (diary_post_id)
  where diary_post_id is not null;

-- ★ 「この店の直近の取り込み」を出すため（見張り・運営画面）。
create index if not exists idx_salon_diary_imports_recent
  on public.salon_diary_imports (salon_id, provider, slot, imported_at desc);

-- ────────────────────────────────────────────────────────────
-- 2. RLS（service_role のみ）
-- ────────────────────────────────────────────────────────────
-- ★ salon_import_sources / therapist_media_ids と同じ扱い。
--   ★ 公開ページが読む必要がまったく無い。★ ポリシーは作らない＝ service_role からのみ読める。
alter table public.salon_diary_imports enable row level security;
revoke all on public.salon_diary_imports from anon, authenticated;

-- ────────────────────────────────────────────────────────────
-- 確認用（適用後に別途 SQL Editor で流す）
-- ────────────────────────────────────────────────────────────
-- ① テーブルができていること。1行返れば成功
-- select table_name from information_schema.tables
--  where table_schema='public' and table_name='salon_diary_imports';
--
-- ② 主キーが4本であること（★ ここが違うと二重取り込みが起きる）
-- select pg_get_constraintdef(oid) from pg_constraint
--  where conrelid='public.salon_diary_imports'::regclass and contype='p';
--   → PRIMARY KEY (salon_id, provider, slot, external_diary_id)
--
-- ③ ★ 日記を消しても記録が残ること（本番では流さない。検証環境だけ）
--   delete from public.diary_posts where id = '…';
--   select status, diary_post_id from public.salon_diary_imports where external_diary_id='…';
--     → status='imported' / diary_post_id=null  ★ 行は残る
