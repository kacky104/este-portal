-- fukuX お店カード（ショーケース）用: お店が設定する最大6枚の画像URL配列。
-- 対応コード: 指示書_fukuX_お店タブ.md 実装コミット参照。
alter table public.x_profiles
  add column if not exists showcase_images text[] not null default '{}';

-- 6枚上限をDB側でも保証（UI/コードの二重防御）。
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'x_profiles_showcase_images_max6'
  ) then
    alter table public.x_profiles
      add constraint x_profiles_showcase_images_max6
      check (coalesce(array_length(showcase_images, 1), 0) <= 6);
  end if;
end $$;
