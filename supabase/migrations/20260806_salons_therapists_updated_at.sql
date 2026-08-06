-- フクエス: salons / therapists に updated_at を追加（sitemap の lastModified 実データ化用）
-- 2026-08-06
--
-- 目的: sitemap.xml の lastModified に実際の更新日時を出せるようにする
--       （従来は列が無かったため、サロン・セラピストのエントリでは lastModified を省略していた）。
--
-- ★重要: bump（上位表示ボタン・1日最大40回）や「今すぐ案内」ON/OFF のような高頻度・軽微な
--   列の変更で updated_at が動くと「ほぼ常にたった今更新された」状態になり、lastModified の
--   信頼性が結局戻らない。そこで汎用の set_updated_at() は使わず、これらの列**だけ**の変更では
--   updated_at を動かさない専用トリガにする（jsonb 差分から対象列を除外して比較）。
--
-- 適用後の確認（pg_catalog でなくてよい。列の存在確認のみ）:
--   select table_name, column_name from information_schema.columns
--    where table_schema = 'public'
--      and table_name in ('salons', 'therapists')
--      and column_name = 'updated_at';
--   → 2行返ればOK。
--
-- ※ コードのデプロイ前に適用すること（sitemap.ts が updated_at を select するため。
--    先にコードが出ると select がエラーになり、サロン・セラピストが sitemap から一時的に消える）。

alter table public.salons     add column if not exists updated_at timestamptz not null default now();
alter table public.therapists add column if not exists updated_at timestamptz not null default now();

-- ── salons: bump系（bumped_at / bump_day / bump_used）だけの変更では updated_at を動かさない ──
create or replace function public.salons_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  if (to_jsonb(new) - 'updated_at' - 'bumped_at' - 'bump_day' - 'bump_used')
     is distinct from
     (to_jsonb(old) - 'updated_at' - 'bumped_at' - 'bump_day' - 'bump_used') then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_salons_updated_at on public.salons;
create trigger trg_salons_updated_at
  before update on public.salons
  for each row execute function public.salons_set_updated_at();

-- ── therapists: 「今すぐ案内」系だけの変更では updated_at を動かさない ──
-- （is_available_now / available_until はオーナー側、_cast はセラピスト本人側のライブ枠。
--   出勤スケジュールは別テーブル（therapist_schedules）なのでここには影響しない）
create or replace function public.therapists_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  if (to_jsonb(new) - 'updated_at' - 'is_available_now' - 'available_until'
                    - 'is_available_now_cast' - 'available_until_cast')
     is distinct from
     (to_jsonb(old) - 'updated_at' - 'is_available_now' - 'available_until'
                    - 'is_available_now_cast' - 'available_until_cast') then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_therapists_updated_at on public.therapists;
create trigger trg_therapists_updated_at
  before update on public.therapists
  for each row execute function public.therapists_set_updated_at();
