-- work_match_entries: フクエスワークの「求職マッチング」エントリー（女の子＝求職者が入力する公開フォームの受け皿）。
-- 女の子が 年齢・経験の有無・現在の職業・希望エリア・送迎希望・その他の希望条件・連絡先 を入力して送信 →
-- 運営が条件に合う掲載店舗を数店選び、本人の連絡先へ連絡して斡旋する（掲載店舗への就業斡旋）。
-- 未ログインの一般公開フォームのため INSERT はサーバーアクション（service_role・src/app/actions/workMatch.ts）
-- 経由のみで行い、公開INSERTポリシーは作らない（PostgREST直叩きのスパム遮断）。閲覧・管理は運営のみ。
-- 送信時に notifyAdmin で運営宛メールも飛ぶ（テーブルは記録・バックアップ用）。
-- ※ Supabase ダッシュボードの SQL Editor で適用する記録用マイグレーション（冪等・再実行可）。

create table if not exists public.work_match_entries (
  id uuid primary key default gen_random_uuid(),
  display_name text,                              -- お名前・ニックネーム（任意）
  age integer not null,                           -- 年齢（18〜99・アプリ側で範囲検証）
  experience text not null default 'none'         -- 経験: 'none'（未経験） / 'has'（経験あり）
    check (experience in ('none', 'has')),
  current_job text,                               -- 現在の職業（任意・自由記載）
  desired_areas text[] not null default '{}',     -- 希望エリア（AREA_ORDER のDB値・複数可・空=こだわらない）
  wants_pickup text not null default 'either'     -- 送迎希望: 'want'（あり希望） / 'no'（不要） / 'either'（どちらでも）
    check (wants_pickup in ('want', 'no', 'either')),
  desired_features text[] not null default '{}',  -- その他の希望（JOB_FEATURES の slug・複数）
  -- 連絡先：電話 / LINE / メール。アプリ側 validate で「最低どれか1つは入力」を担保する。
  contact_phone text,
  contact_line text,
  contact_email text,
  note text,                                      -- その他ご希望・自由記入（任意）
  status text not null default 'open'             -- 対応状況: 'open'（未対応） / 'done'（対応済み）
    check (status in ('open', 'done')),
  created_at timestamptz not null default now()
);

create index if not exists idx_work_match_entries_created on public.work_match_entries (created_at desc);

alter table public.work_match_entries enable row level security;

-- 運営（ADMIN_UUID＝src/app/lib/admin.ts と同一値）のみ全操作可。公開ポリシーは作らない
-- （INSERT は service_role のサーバーアクション経由・anon/一般authenticated は不可）。
drop policy if exists "admin_all_work_match_entries" on public.work_match_entries;
create policy "admin_all_work_match_entries"
  on public.work_match_entries for all
  using (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid)
  with check (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid);
