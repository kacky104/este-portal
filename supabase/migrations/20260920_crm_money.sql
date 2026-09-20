-- フクエスCRM：金銭授受（女子とお店のお金のやりとり）（2026-09-20）
-- ※ Supabase SQL Editor で実行してください。冪等（再実行しても安全）。★ PUSH より前に実行。
--
-- ★ 何のため（風俗CTIv2 の「金銭授受履歴」「精算」にあたる）
--   女子がお客さんから受け取った料金（受領＝女子）から自分の報酬を引き、残りをお店に渡す。
--   逆に、お店が受け取った料金（受領＝お店・カード等）のぶんは、お店が女子に報酬を払う。
--   その「渡した／払った」を1件ずつ残し、女子ごとの残高（まだ精算していない額）を出す。
-- ★ 残高の考え方（画面で計算する・この表には「動き」だけを持つ）
--   女子の残高 ＝ 女子が受領した料金 − 女子の報酬（確定した日の分・手当込み）
--               − 女子→お店に渡した額 ＋ お店→女子に払った額
--   ＋ならお店が受け取る側、−ならお店が払う側。0 で精算済み。
-- ★ 取り消しは消さずに cancelled_at を入れる（履歴を残す・CTIv2 の「ｷｬﾝｾﾙ時刻」と同じ）。
-- ★ お店の内部情報。RLS で全部閉じる（service_role だけ）。

create table if not exists public.crm_money_moves (
  id            bigint generated always as identity primary key,
  salon_id      integer not null references public.salons(id) on delete cascade,
  therapist_id  bigint  not null references public.therapists(id) on delete cascade,
  business_date date    not null,                     -- どの営業日の分か（朝6時区切り）
  direction     text    not null check (direction in ('to_shop', 'to_therapist')), -- 女子→お店／お店→女子
  category      text    not null default 'settle'
                check (category in ('settle', 'change', 'advance', 'other')),     -- 精算／釣銭／前借り／その他
  amount        integer not null check (amount between 1 and 10000000),
  memo          text    not null default '' check (char_length(memo) <= 200),
  created_at    timestamptz not null default now(),
  created_by    uuid,
  cancelled_at  timestamptz                            -- 取り消した時刻（null＝有効）
);
create index if not exists crm_money_moves_salon_date_idx on public.crm_money_moves (salon_id, business_date);
create index if not exists crm_money_moves_salon_therapist_idx on public.crm_money_moves (salon_id, therapist_id);

comment on table public.crm_money_moves is
  E'フクエスCRMの金銭授受（女子⇄お店のお金の動き）。★ service_role 専用。取り消しは cancelled_at。';

alter table public.crm_money_moves enable row level security;
revoke all on public.crm_money_moves from anon, authenticated;

notify pgrst, 'reload schema';

-- ★ 確認
-- select count(*) from public.crm_money_moves;
