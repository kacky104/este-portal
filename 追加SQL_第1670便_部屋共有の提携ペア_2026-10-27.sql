-- 第1670便（2026-10-27・カッキーさんの決定）: フクエスCRM「提携店の部屋共有」を、NG・要注意の共有グループと【切り離す】。
--   ★ 理由: 1店が入れるグループは1つだけ。ラビリンスは「NG共有」（アロマメイと）に入っているので、
--     enju と部屋を貸し借りするためだけに enju を NG 共有へ入れたくない（NG 共有に入るかは enju が選べるようにする）。
--   ★ 部屋共有は「店と店のペア」で持つ（運営だけが作る）。1店が何店とペアを組んでもよい。
--   ★ 第1669便で足した crm_groups.room_share は【使わない】（列は残しても害はない。消すなら: alter table public.crm_groups drop column if exists room_share;）
--   ★ Supabase ダッシュボードの SQL Editor で実行してください。冪等。

create table if not exists public.crm_room_share_pairs (
  id          bigint generated always as identity primary key,
  salon_a     integer     not null references public.salons(id) on delete cascade,
  salon_b     integer     not null references public.salons(id) on delete cascade,
  note        text        not null default '' check (char_length(note) <= 200),
  created_at  timestamptz not null default now(),
  ended_at    timestamptz,                                   -- 終わらせた時刻（null＝続いている）
  check (salon_a < salon_b)                                  -- ★ 同じペアを2行にしない（小さい番号を a に入れる）
);
create unique index if not exists crm_room_share_pairs_active on public.crm_room_share_pairs (salon_a, salon_b) where ended_at is null;
create index if not exists crm_room_share_pairs_a_idx on public.crm_room_share_pairs (salon_a) where ended_at is null;
create index if not exists crm_room_share_pairs_b_idx on public.crm_room_share_pairs (salon_b) where ended_at is null;
comment on table public.crm_room_share_pairs is
  E'フクエスCRM: 提携店の部屋共有のペア（第1670便）。出勤情報で相手の店の部屋を借りる／その部屋のQRで同意書／本日画面の帯／ネット予約の空き枠。★ 運営だけが作る。service_role 専用。';

alter table public.crm_room_share_pairs enable row level security;
revoke all on public.crm_room_share_pairs from anon, authenticated;

notify pgrst, 'reload schema';
