-- 第1324便（2026-10-09・カッキーさんの決定）: フクエスCRM「グループ・提携店で共有するNG・要注意リスト」の表（1段目）。
--   設計は 設計メモ_グループで共有するNG・要注意リスト_2026-10-09.md（§4・§11）。
--
--   ★ 新しい表を5つ足すだけ。今ある表・列は1つも変えない。
--   ★ この便で使うのは crm_groups と crm_group_members（/admin のグループ管理）だけ。
--     共有リストの表（alerts・phones・logs）は、あとの便で使う。先に作っておく（表だけあっても、何も起きない）。
--   ★ 5つとも service_role 専用（RLS 有効・anon／authenticated からは revoke all）。salon_customers と同じ作法。
--     読み書きはサーバー側だけ（運営は ADMIN_UUID、店舗様は店の本人確認のあと）。
--   ★★ どの店とどの店が同じグループか（提携しているか）は秘密の情報。この表の中にだけ持つ。
--   ★ 順番: push の前でも後でもよい。
--       ・SQL が先 … 表が増えるだけ。古いコードは見ない。
--       ・push が先 … /admin の「フクエスCRM：グループ・提携店」に「追加SQL がまだです」と出るだけ。
--   ★ Supabase ダッシュボードの SQL Editor で実行してください。冪等（何度流しても同じ）。

-- ── 1. グループ（運営だけが作る）──
create table if not exists public.crm_groups (
  id              bigint generated always as identity primary key,
  name            text        not null check (char_length(name) between 1 and 40),      -- 運営の覚え書きの名前（お客様・店舗様には見せない）
  public_label    text        not null default '当店のグループ店舗・提携店舗' check (char_length(public_label) between 1 and 40),
  manager_name    text        not null default '' check (char_length(manager_name) <= 80),
  manager_address text        not null default '' check (char_length(manager_address) <= 120),
  note            text        not null default '' check (char_length(note) <= 500),
  created_at      timestamptz not null default now(),
  ended_at        timestamptz                                                            -- 終わらせた時刻（null＝続いている）
);
comment on table public.crm_groups is
  E'フクエスCRM: NG・要注意リストを共有するグループ（第1324便）。★ 運営だけが作る。service_role 専用。';
comment on column public.crm_groups.public_label is
  E'お客様に見える所（公式HPの規約など）で、共有の相手をどう呼ぶか。★ 店の名前は入れない。';

-- ── 2. グループに入っている店 ──
create table if not exists public.crm_group_members (
  id         bigint generated always as identity primary key,
  group_id   bigint      not null references public.crm_groups(id) on delete cascade,
  salon_id   integer     not null references public.salons(id) on delete cascade,
  corp_name  text        not null check (char_length(corp_name) between 1 and 80),       -- 法人名（個人なら屋号・氏名）
  agreed_on  date        not null,                                                       -- 契約書を受け取った日
  joined_at  timestamptz not null default now(),
  left_at    timestamptz                                                                 -- 外した時刻（null＝入っている）
);
-- ★★ 1店が入れるグループは1つだけ（入っている行は、店ごとに1つ）
create unique index if not exists crm_group_members_one_active
  on public.crm_group_members (salon_id) where left_at is null;
create index if not exists crm_group_members_group_idx on public.crm_group_members (group_id);
comment on table public.crm_group_members is
  E'グループに入っている店（第1324便）。★ 全部の店のサインがそろった契約書を受け取ってから、運営が入れる。service_role 専用。';

-- ── 3. 共有リストの1件（＝1人のお客様について、1つの店が出したもの）──
create table if not exists public.crm_group_alerts (
  id               bigint generated always as identity primary key,
  group_id         bigint      not null references public.crm_groups(id) on delete cascade,
  salon_id         integer     not null references public.salons(id) on delete cascade,      -- 出した店
  customer_id      bigint      references public.salon_customers(id) on delete set null,     -- 出した店の台帳の客
  level            text        not null check (level in ('ng', 'caution')),
  kind             text        not null check (kind in ('violence', 'theft', 'stalking', 'voyeur', 'coercion', 'intoxicated', 'other')),
  certainty        text        not null default 'confirmed' check (certainty in ('confirmed', 'suspected')),
  happened_on      date        not null,
  what             text        not null check (char_length(what) between 1 and 300),         -- 何をされたか（事実）
  checked_how      text        not null default '' check (char_length(checked_how) <= 100),  -- 確かめ方
  shown_name       text        not null default '' check (char_length(shown_name) <= 40),    -- 予約のときの名前
  created_by       uuid        not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  withdrawn_at     timestamptz,                                                              -- 取り下げた時刻（null＝有効）
  withdrawn_by     uuid,
  withdrawn_reason text        check (withdrawn_reason is null or withdrawn_reason in ('self', 'left', 'customer_deleted', 'expired'))
);
create index if not exists crm_group_alerts_group_idx on public.crm_group_alerts (group_id, created_at desc) where withdrawn_at is null;
create index if not exists crm_group_alerts_salon_idx on public.crm_group_alerts (salon_id);
create index if not exists crm_group_alerts_customer_idx on public.crm_group_alerts (customer_id);
comment on table public.crm_group_alerts is
  E'グループで共有するNG・要注意リスト（第1324便で表だけ作成）。★ セラピストや店への危害だけ（無断キャンセル・料金のもめごとは入れない）。service_role 専用。';

-- ── 4. 共有リストの電話番号（1件に何本でも）──
create table if not exists public.crm_group_alert_phones (
  id         bigint generated always as identity primary key,
  alert_id   bigint  not null references public.crm_group_alerts(id) on delete cascade,
  group_id   bigint  not null references public.crm_groups(id) on delete cascade,
  phone      text    not null check (phone ~ '^[0-9]{10,13}$'),
  unique (alert_id, phone)
);
create index if not exists crm_group_alert_phones_lookup on public.crm_group_alert_phones (group_id, phone);

-- ── 5. 記録（追記だけ。だれが・いつ・何をしたか）──
--   ★ 電話番号・名前・内容は入れない（共有を消したあとに、ここへ残さないため）。
--   ★ alert_id などに外部キーを付けない（元の行を消しても、記録は残す）。
create table if not exists public.crm_group_logs (
  id         bigint generated always as identity primary key,
  group_id   bigint      not null,
  salon_id   integer,
  alert_id   bigint,
  actor      text        not null default 'system' check (char_length(actor) <= 80),
  action     text        not null check (action in ('group_create', 'group_edit', 'group_end', 'member_join', 'member_leave', 'alert_create', 'alert_edit', 'alert_withdraw', 'alert_purge')),
  detail     jsonb,
  created_at timestamptz not null default now()
);
create index if not exists crm_group_logs_group_idx on public.crm_group_logs (group_id, created_at desc);

create or replace function public.crm_group_logs_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'グループ共有の記録は追記専用です（% は許可されていません）', tg_op;
end;
$$;
drop trigger if exists crm_group_logs_no_update on public.crm_group_logs;
create trigger crm_group_logs_no_update
  before update or delete on public.crm_group_logs
  for each row execute function public.crm_group_logs_append_only();

-- ── 6. 5つとも service_role 専用 ──
alter table public.crm_groups             enable row level security;
alter table public.crm_group_members      enable row level security;
alter table public.crm_group_alerts       enable row level security;
alter table public.crm_group_alert_phones enable row level security;
alter table public.crm_group_logs         enable row level security;
revoke all on public.crm_groups             from anon, authenticated;
revoke all on public.crm_group_members      from anon, authenticated;
revoke all on public.crm_group_alerts       from anon, authenticated;
revoke all on public.crm_group_alert_phones from anon, authenticated;
revoke all on public.crm_group_logs         from anon, authenticated;

notify pgrst, 'reload schema';

-- ★ 確認（5行。rls が true・anon_can と authed_can が false なら OK）
select c.relname as tbl,
       c.relrowsecurity as rls,
       has_table_privilege('anon', c.oid, 'select') as anon_can,
       has_table_privilege('authenticated', c.oid, 'select') as authed_can
  from pg_class c
 where c.relnamespace = 'public'::regnamespace
   and c.relname in ('crm_groups', 'crm_group_members', 'crm_group_alerts', 'crm_group_alert_phones', 'crm_group_logs')
 order by 1;
