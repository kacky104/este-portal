-- 第1846便（2026-11-09・カッキーさん）駅ちかの「店舗メイン／ランキング」の女の子の入れ替えをコネックエフから（ベンリーから移す）
-- ★ 店 × 駅ちかの枠 = 1行。pairs = [{"main":"りな","ranking":"みあ"}, …]（名前は駅ちかの女の子一覧と同じ書き方。片方だけ空も可）
--   interval_min 分おきに、next_index の組を置いて、次の組へ進む（最後まで行ったら最初に戻る）
-- ★ service_role のサーバーだけが読み書き（RLS は閉じる）
create table if not exists public.conecf_ekichika_rankimgs (
  salon_id      bigint      not null references public.salons(id) on delete cascade,
  slot          smallint    not null default 1 check (slot between 1 and 5),
  admin_enabled boolean     not null default false,
  auto          boolean     not null default false,
  interval_min  integer     not null default 60,
  pairs         jsonb       not null default '[]'::jsonb,
  next_index    integer     not null default 0,
  last_due_at   timestamptz,
  last_at       timestamptz,
  last_outcome  text,
  updated_at    timestamptz not null default now(),
  primary key (salon_id, slot)
);
alter table public.conecf_ekichika_rankimgs enable row level security;
revoke all on public.conecf_ekichika_rankimgs from anon, authenticated;

-- ★ オイルクエスト様（salon_id=5）: 枠2（ベンリーの「-B」）は60分おき・3組（ベンリーと同じ）。自動は OFF（画面で確かめてから ON）
--   ★ 枠1（無印）・枠3（-C）は画面で組を入れる（ベンリーの中身を見てから）
insert into public.conecf_ekichika_rankimgs (salon_id, slot, admin_enabled, interval_min, pairs)
values
  (5, 1, true, 60, '[]'::jsonb),
  (5, 2, true, 60, '[{"main":"りな","ranking":"みあ"},{"main":"みみ","ranking":"うる"},{"main":"まゆゆ","ranking":"みかな"}]'::jsonb),
  (5, 3, true, 60, '[]'::jsonb)
on conflict (salon_id, slot) do nothing;

-- 確認: select salon_id, slot, admin_enabled, auto, interval_min, jsonb_array_length(pairs), next_index from public.conecf_ekichika_rankimgs order by slot;
