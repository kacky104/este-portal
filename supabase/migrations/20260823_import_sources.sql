-- 外部媒体取り込み（オートシンクロ）(2026-08-23 第28便)
--
-- 背景: 駅ちか等の他媒体に店舗が入力した出勤・女性情報を、フクエスへ自動で取り込む。
-- 駅ちかは AWS WAF でデータセンターIP（Vercel・クラウド）を 403 で弾くため、
-- 住宅用IPに見える ConoHa VPS が「取ってきてフクエスへ送る」中継役をやる。
-- 解析・照合・DB反映はフクエス側（/api/import/ingest）で行う。
--
-- 構成:
--   salon_import_sources … 店舗ごとの取り込み設定（どの媒体のどの店舗番号を、何を取り込むか）
--   salon_import_runs    … 実行ログ（何を変えたか・店舗問い合わせ対応用）
-- どちらも therapist_diary_mail と同じく anon/authenticated に一切開けない（service_role専用）。
-- 運営(/admin)への表示は server action 経由でのみ返す。

-- 1. 取り込み設定
create table if not exists public.salon_import_sources (
  id                 bigserial primary key,
  salon_id           bigint not null references public.salons(id) on delete cascade,
  provider           text   not null default 'ekichika' check (provider in ('ekichika')),
  external_id        text   not null,            -- 駅ちかの shop_id（例 '46440'）
  shop_url           text   not null,            -- 店舗ページURL（表示・中継役の取得元）
  import_schedule    boolean not null default true,   -- 出勤を取り込む
  import_profile     boolean not null default true,   -- 年齢・サイズを取り込む
  create_missing     boolean not null default false,  -- 駅ちかにいてフクエスにいない子を新規作成
  is_enabled         boolean not null default true,
  last_run_at        timestamptz,
  last_status        text,                        -- 'ok' | 'error'
  last_error         text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (salon_id, provider)
);

comment on table public.salon_import_sources is
  '外部媒体取り込みの店舗別設定。service_role専用（RLS有効・ポリシーなし）。';

-- 2. 実行ログ
create table if not exists public.salon_import_runs (
  id                  bigserial primary key,
  source_id           bigint not null references public.salon_import_sources(id) on delete cascade,
  started_at          timestamptz not null default now(),
  finished_at         timestamptz,
  status              text not null default 'running',  -- 'running' | 'ok' | 'error'
  fetched             int  not null default 0,          -- 受け取った個人ページ数
  matched             int  not null default 0,          -- 名前で照合できた数
  unmatched           text[] not null default '{}',     -- 照合できなかった名前
  schedules_upserted  int  not null default 0,
  profiles_updated    int  not null default 0,
  created             int  not null default 0,          -- 新規作成した数
  error               text
);

comment on table public.salon_import_runs is
  '外部媒体取り込みの実行ログ。service_role専用。';

create index if not exists idx_salon_import_runs_source_started
  on public.salon_import_runs (source_id, started_at desc);

-- 3. RLS（両テーブルとも service_role のみ・anon/authenticated には開けない）
alter table public.salon_import_sources enable row level security;
alter table public.salon_import_runs    enable row level security;
revoke all on public.salon_import_sources from anon, authenticated;
revoke all on public.salon_import_runs    from anon, authenticated;

-- 確認用（適用後に別途流す）。2行返れば成功。
-- select table_name from information_schema.tables
--   where table_schema='public' and table_name in ('salon_import_sources','salon_import_runs');
