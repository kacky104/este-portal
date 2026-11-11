-- 第1833便（2026-11-09・カッキーさん OK）ココア店長ブログを A・B・C の3アカウントに（ベンリーのココア／ココア-B／ココア-C をコネックエフでまとめる）
-- ★ 1店 × アカウント（1=A・2=B・3=C）で1行。テンプレートは今までどおり店で1つのリスト（conecf_cocoa_templates）を共通で使う
-- ★ schedule = 投稿する時刻とテンプレート [{"min":720,"templateId":12}, {"min":1230,"templateId":null}]
--     min … 朝6時はじまりの分（12:00 = 720、翌1:00 = 1500）。templateId が null なら「順番に」（最後に投稿したのが古いものから）
--     ★ 空なら今までどおり「1日1回・店ごとに決まった時刻・順番に」
-- ★ last_due_at … 最後に受け持った予定時刻（同じ時刻に二重に送らない）
-- ★ RLS は閉じる（service_role のサーバーだけ）
create table if not exists public.conecf_cocoa_accounts (
  salon_id       bigint      not null references public.salons(id) on delete cascade,
  slot           smallint    not null check (slot between 1 and 3),
  enabled        boolean     not null default false,
  post_email     text,
  schedule       jsonb       not null default '[]'::jsonb,
  last_due_at    timestamptz,
  last_posted_at timestamptz,
  last_result    text,
  updated_at     timestamptz not null default now(),
  primary key (salon_id, slot)
);
alter table public.conecf_cocoa_accounts enable row level security;
revoke all on public.conecf_cocoa_accounts from anon, authenticated;

-- ★ 今の設定（1店1つ）を A（slot=1）に写す。今の表（conecf_cocoa_settings）は消さずに残す
insert into public.conecf_cocoa_accounts (salon_id, slot, enabled, post_email, last_posted_at, last_result)
select salon_id, 1, enabled, post_email, last_posted_at, last_result from public.conecf_cocoa_settings
on conflict (salon_id, slot) do nothing;

-- ★ 今日すでに自動で投稿した店は、今日の分を済んだことにする（切り替えた直後に、もう1本送らない）
update public.conecf_cocoa_accounts a set last_due_at = s.last_posted_at
from public.conecf_cocoa_settings s
where a.salon_id = s.salon_id and a.slot = 1 and a.last_due_at is null and s.last_posted_at is not null;

-- 確認: select salon_id, slot, enabled, post_email, schedule, last_due_at, last_result from public.conecf_cocoa_accounts order by salon_id, slot;
