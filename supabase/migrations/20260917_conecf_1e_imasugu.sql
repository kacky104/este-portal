-- コネックエフ 第1弾 1e：今すぐ一括（第401便・2026-09-17）
-- ※ Supabase SQL Editor で実行してください（コード push より先に適用）。冪等（再実行しても安全）。
--
-- ★★★ この適用だけでは何も変わりません。
--   ・どちらの表も空。★ 自動更新は店舗様が画面で入れるまで動かない（enabled 既定 false）。
--
-- ★★ しくみ（ベンリーの「即姫・接客一括更新」に寄せた）
--   ・対象：その日の出勤で【いま出勤時間中】の人（therapist_schedules）。★ 除外にした人は外す
--   ・自動更新：10分ごとの周が、決めた人数ずつ therapists の「今すぐ（店舗の枠）」を入れる
--     ★ 期限は今までどおり45分（lib/imasugu.ts）。★ 上限も今までどおり5名／ワーク掲載店10名
--   ・順番：優先順（手で並べた順／先に出勤した人／後から出勤した人）かランダム。★ 最後に出した時刻の古い人から回す
--   ・駅ちかの即ヒメ・エステ魂の即セラへは、今の周（sokuhime-push / sokusera-push）がそのまま送る
--   ・読み書きはサーバー（service_role）だけ

-- ============================================================
-- 1. conecf_imasugu_settings：店舗ごとの設定（1店1行）
-- ============================================================
create table if not exists public.conecf_imasugu_settings (
  salon_id       bigint      primary key references public.salons(id) on delete cascade,
  enabled        boolean     not null default false,
  order_mode     text        not null default 'priority' check (order_mode in ('priority', 'random')),
  batch_size     smallint    not null default 1 check (batch_size between 0 and 10),   -- 0 = 上限まで全員
  priority_rule  text        not null default 'list' check (priority_rule in ('list', 'earlier', 'later')),
  last_run_at    timestamptz,
  updated_at     timestamptz not null default now()
);

comment on table public.conecf_imasugu_settings is
  E'コネックエフの今すぐ一括の設定（第401便）。★ enabled 既定 false。★ batch_size 0 は上限（5名／ワーク掲載店10名）まで。★ priority_rule: list=手で並べた順 / earlier=先に出勤した人 / later=後から出勤した人。★ service_role 専用。';

alter table public.conecf_imasugu_settings enable row level security;
revoke all on public.conecf_imasugu_settings from anon, authenticated;

-- ============================================================
-- 2. conecf_imasugu_members：人ごとの並び・除外・最後に出した時刻
-- ============================================================
create table if not exists public.conecf_imasugu_members (
  therapist_id   bigint      primary key references public.therapists(id) on delete cascade,
  salon_id       bigint      not null references public.salons(id) on delete cascade,
  priority       integer,
  excluded       boolean     not null default false,
  last_on_at     timestamptz,
  updated_at     timestamptz not null default now()
);

comment on table public.conecf_imasugu_members is
  E'今すぐ一括の人ごとの設定（第401便）。★ 行が無い人＝除外なし・並びは名前順。★ last_on_at は自動更新が最後に今すぐにした時刻（古い人から回す）。★ service_role 専用。';

create index if not exists conecf_imasugu_members_salon_idx on public.conecf_imasugu_members (salon_id);

alter table public.conecf_imasugu_members enable row level security;
revoke all on public.conecf_imasugu_members from anon, authenticated;
