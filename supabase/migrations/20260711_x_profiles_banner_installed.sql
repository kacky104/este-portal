-- fukuX お店カード画像（ショーケース）の上限を「認証＋リンクバナー設置」連動に変更（0/4/8）。
-- 仕様: 上限 = (認証 is_verified ? 4 : 0) + (リンクバナー設置 banner_installed ? 4 : 0)
--   未認証×未設置: 0枚 / 未認証×設置: 4枚 / 認証×未設置: 4枚 / 認証×設置: 8枚
-- banner_installed は運営が /x/admin「認証」タブで、相手サイトへのバナー設置を確認して手動トグルする。
-- 対応コード: src/app/x/xShowcase.ts（同じ式）・XSettingsForm・XAdmin・xShops.ts

-- 1) 列追加
alter table public.x_profiles
  add column if not exists banner_installed boolean not null default false;

-- 2) banner_installed の変更ガード: 運営（ADMIN_UUID＝src/app/lib/admin.ts と同一値）のみ変更可。
--    auth.uid() が null（SQL Editor・service role 等）は許可（anon の書き込みは RLS で到達しない）。
--    INSERT は is_verified と同方針で一般ユーザーなら強制 false（例外にせず矯正）。
create or replace function public.x_banner_installed_guard()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null
     and auth.uid() <> '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid then
    if tg_op = 'INSERT' then
      new.banner_installed := false;
    elsif new.banner_installed is distinct from old.banner_installed then
      raise exception 'banner_installed can only be changed by admin';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists x_profiles_banner_installed_guard on public.x_profiles;
create trigger x_profiles_banner_installed_guard
  before insert or update on public.x_profiles
  for each row execute function public.x_banner_installed_guard();
-- ※ トリガ実行はアルファベット順＝ banner_installed_guard → showcase_verified_guard の順で走る
--   （INSERT時の強制false が上限式の評価より先に効く）。

-- 3) showcase ガードを枚数上限式に差し替え（20260710_x_profiles_showcase_v2.sql の関数を上書き。
--    関数名・トリガ名は既存のまま流用＝トリガの再作成不要）。
--    枚数が減る変更は上限超過中でも許可（上限引き下げ後も既存データは温存し、削除だけはできるように）。
create or replace function public.x_showcase_verified_guard()
returns trigger
language plpgsql
as $$
declare
  lim int;
  new_count int;
  old_count int;
begin
  if tg_op = 'INSERT' or new.showcase_images is distinct from old.showcase_images then
    lim := case
      when new.kind = 'shop'
        then (case when new.is_verified then 4 else 0 end)
           + (case when new.banner_installed then 4 else 0 end)
      else 0
    end;
    new_count := coalesce(array_length(new.showcase_images, 1), 0);
    old_count := case when tg_op = 'INSERT' then 0 else coalesce(array_length(old.showcase_images, 1), 0) end;
    if new_count > lim and new_count >= old_count then
      raise exception 'showcase_images exceeds limit (max % images for this shop)', lim;
    end if;
  end if;
  return new;
end;
$$;
