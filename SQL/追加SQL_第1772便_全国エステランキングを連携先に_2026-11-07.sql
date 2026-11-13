-- 第1772便（2026-11-07）: salon_import_sources.provider に全国エステランキング（'zenkoku'）を許す。
--
-- ★ 20260902_import_sources_esutama.sql と同じやり方。CHECK 制約を外して、'zenkoku' を足した組で付け直す。
-- ★ salon_media_credentials.provider には CHECK が無い（text）。触らない。
-- ★ 実行は Supabase の SQL Editor で、このブロックを1つずつ。

-- ① 制約を付け直す
do $$
begin
  if exists (
    select 1 from pg_constraint
     where conname = 'salon_import_sources_provider_check'
       and conrelid = 'public.salon_import_sources'::regclass
  ) then
    alter table public.salon_import_sources
      drop constraint salon_import_sources_provider_check;
  end if;
  alter table public.salon_import_sources
    add constraint salon_import_sources_provider_check
    check (provider in ('ekichika', 'esulove', 'esutama', 'zenkoku'));
end $$;

comment on column public.salon_import_sources.provider is
  E'媒体。ekichika=駅ちか / esulove=エステラブ / esutama=エステ魂（第109便） / zenkoku=全国エステランキング（第1772便）';

-- ② 確認（4つ並んでいれば OK）
-- select pg_get_constraintdef(oid) from pg_constraint where conname = 'salon_import_sources_provider_check';
