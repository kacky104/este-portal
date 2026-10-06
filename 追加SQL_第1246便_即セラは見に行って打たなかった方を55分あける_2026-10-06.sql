-- 第1246便（2026-10-06・カッキーさん）: エステ魂の即セラで【見に行って打たなかった】方（魂セラピスト未開始・本人がすでにON など）を覚え、
--   55分のあいだはその方のために相手サイトへ行かない。相手サイトへの負荷と目立ち方を抑える（第1244便の続き）。
--   ★ 店舗×媒体×枠×セラピストで1行（上書き）＝行は増え続けない。★ service_role 専用。
--   ★ 順番: push の前でも後でもよい（表が無いあいだはコードが「今までどおり」に倒れる）。表を作るまでは減らない。
--   ★ Supabase ダッシュボードの SQL Editor で実行してください。冪等。

create table if not exists public.conecf_sokusera_checks (
  salon_id      int  not null references public.salons(id) on delete cascade,
  provider      text not null default 'esutama',
  slot          int  not null default 1,
  therapist_id  int  not null,
  cast_id       text,
  checked_at    timestamptz not null default now(),
  reason        text not null default '',
  primary key (salon_id, provider, slot, therapist_id)
);
alter table public.conecf_sokusera_checks enable row level security;
revoke all on public.conecf_sokusera_checks from anon, authenticated;
comment on table public.conecf_sokusera_checks is
  E'即セラ（第1246便）: 見に行って打たなかった方の最後の時刻。55分のあいだは見に行かない。service_role 専用。';

notify pgrst, 'reload schema';

-- ★ 確認（1行出ればOK）
select table_name from information_schema.tables where table_schema = 'public' and table_name = 'conecf_sokusera_checks';
