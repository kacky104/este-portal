-- 追加SQL_第1328便（2026-10-09）: フクエスCRM「グループ・提携店で共有するNG・要注意リスト」を、画面で申し込む・承認するための表。
--
-- ★ カッキーさんの決定（10/9）
--   ・申込書は、CRM の画面で署名する（代表者の名前の入力 ＋ 同意のチェック。手書きサイン・パスワードの入れ直しは無し）。
--   ・最初の店どうしが署名して始まり、あとから店を足していく。
--   ・店を足すときは、今いる全部の店が「この店が加わることを認める」を押す。全員が認めてから、足す店に申込書を出す。
--
-- ★ 足す表は2つ。今ある表（第1324便の5つ）は変えない。
--   crm_group_invites     … 運営が「署名待ち」で入れた店（全部そろったら crm_group_members に入る）
--   crm_group_signatures  … 店の署名・承認の記録（署名した時の申込書の文の写し・その時の参加店の一覧・名前・日時）
--
-- ★ どちらも service_role 専用（RLS 有効・ポリシーなし・anon／authenticated から revoke all）。第1324便の表と同じ作法。
-- ★ crm_group_signatures は追記専用（直せない・消せない）。あとで「同意していない」と言われたときの証拠になるため。
--     店を消しても残す（外部キーを付けていない）。
-- ★ 何度流しても同じ結果になる。★ 第1324便の SQL を先に流してあること（crm_groups・crm_group_logs_append_only を使う）。
-- ★ 流す順番: push の前でも後でもよい（表が無いあいだ、画面は「署名待ち」の口を出さないだけ）。

create table if not exists public.crm_group_invites (
  id         bigint generated always as identity primary key,
  group_id   bigint      not null references public.crm_groups(id) on delete cascade,
  salon_id   integer     not null references public.salons(id) on delete cascade,
  corp_name  text        not null check (char_length(corp_name) between 1 and 80),          -- 申込書に出す法人名（個人なら屋号・氏名）
  status     text        not null default 'pending' check (status in ('pending', 'joined', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  closed_at  timestamptz,                                                                    -- 入った・断られた・取りやめた時刻
  member_id  bigint                                                                          -- 入ったときの crm_group_members.id
);
-- 1店が「署名待ち」でいられるのは1つだけ（1店が入れるグループは1つだけ、に合わせる）
create unique index if not exists crm_group_invites_one_pending
  on public.crm_group_invites (salon_id) where status = 'pending';
create index if not exists crm_group_invites_group_idx on public.crm_group_invites (group_id, status);
comment on table public.crm_group_invites is
  E'フクエスCRM: グループ・提携店の共有に「署名待ち」で入れた店（第1328便）。★ 運営だけが入れる。service_role 専用。';

create table if not exists public.crm_group_signatures (
  id          bigint generated always as identity primary key,
  group_id    bigint      not null,
  invite_id   bigint      not null,                                                           -- どの「署名待ち」への返事か
  salon_id    integer     not null,                                                           -- 署名・承認した店
  kind        text        not null check (kind in ('apply', 'approve', 'decline')),           -- apply＝申込書に署名／approve＝ほかの店が加わることを認める／decline＝認めない
  signer_name text        not null check (char_length(signer_name) between 1 and 40),         -- 入力してもらった名前（代表者か、任された人）
  doc_version text        not null check (char_length(doc_version) between 1 and 40),         -- 申込書の版
  doc_body    text        not null check (char_length(doc_body) between 1 and 20000),         -- 署名した時の文の写し
  parties     jsonb       not null,                                                           -- その時の参加店の一覧 [{salonId, name, corp}]
  signed_by   uuid        not null,                                                           -- ログインしていたアカウント
  user_agent  text        not null default '' check (char_length(user_agent) <= 300),
  created_at  timestamptz not null default now()
);
create index if not exists crm_group_signatures_invite_idx on public.crm_group_signatures (invite_id, salon_id, id desc);
create index if not exists crm_group_signatures_group_idx on public.crm_group_signatures (group_id, id desc);
comment on table public.crm_group_signatures is
  E'フクエスCRM: グループ・提携店の共有の申込み・承認の記録（第1328便）。★ 追記専用。service_role 専用。';

-- 追記専用（第1324便の関数を使う）
drop trigger if exists crm_group_signatures_no_update on public.crm_group_signatures;
create trigger crm_group_signatures_no_update
  before update or delete on public.crm_group_signatures
  for each row execute function public.crm_group_logs_append_only();

alter table public.crm_group_invites    enable row level security;
alter table public.crm_group_signatures enable row level security;
revoke all on public.crm_group_invites    from anon, authenticated;
revoke all on public.crm_group_signatures from anon, authenticated;

notify pgrst, 'reload schema';

-- ★ 確認（2行。rls が true・anon_can と authed_can が false なら OK）
select c.relname as tbl,
       c.relrowsecurity as rls,
       has_table_privilege('anon', c.oid, 'select') as anon_can,
       has_table_privilege('authenticated', c.oid, 'select') as authed_can
  from pg_class c
 where c.relnamespace = 'public'::regnamespace
   and c.relname in ('crm_group_invites', 'crm_group_signatures')
 order by 1;
