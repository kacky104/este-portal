-- 第1844便（2026-11-09・カッキーさん OK）駅ちかのプラチナムマガジンをコネックエフから（ベンリーから移す）
-- ★ 店 × 駅ちかの枠 = 1行。schedule = [{"min":735, "title":"☆マガジン限定割引☆", "body":"<div>…</div>"}, …]
--   min … 朝6時はじまりの分（12:15 = 735・22:15 = 1335）。★ 配信は送った時刻を10分単位に切り上げた時刻。本文は駅ちかのエディタと同じ HTML
-- ★ 受け取るのは駅ちかの会員（マイショップ登録者）。コネックエフはメールを送らない・宛先を持たない
-- ★ service_role のサーバーだけが読み書き（RLS は閉じる）
create table if not exists public.conecf_ekichika_magazines (
  salon_id      bigint      not null references public.salons(id) on delete cascade,
  slot          smallint    not null default 1 check (slot between 1 and 5),
  admin_enabled boolean     not null default false,
  auto          boolean     not null default false,
  schedule      jsonb       not null default '[]'::jsonb,
  last_due_at   timestamptz,
  last_at       timestamptz,
  last_outcome  text,
  updated_at    timestamptz not null default now(),
  primary key (salon_id, slot)
);
alter table public.conecf_ekichika_magazines enable row level security;
revoke all on public.conecf_ekichika_magazines from anon, authenticated;

-- ★ オイルクエスト様（salon_id=5・駅ちか枠1）: 12:15・22:15 に送る2行 → 駅ちかの配信は 12:20・22:20（ベンリーと同じ）。本文は画面で貼る。自動は OFF
insert into public.conecf_ekichika_magazines (salon_id, slot, admin_enabled, schedule)
values (5, 1, true, '[{"min":735,"title":"☆マガジン限定割引☆","body":""},{"min":1335,"title":"☆マガジン限定割引☆","body":""}]'::jsonb)
on conflict (salon_id, slot) do nothing;

-- 確認: select salon_id, slot, admin_enabled, auto, jsonb_array_length(schedule) from public.conecf_ekichika_magazines;
