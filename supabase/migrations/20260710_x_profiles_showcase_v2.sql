-- fukuX お店カード改修: 上限6→8枚、認証済みショップのみ設定可のガード。
alter table public.x_profiles drop constraint if exists x_profiles_showcase_images_max6;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'x_profiles_showcase_images_max8') then
    alter table public.x_profiles
      add constraint x_profiles_showcase_images_max8
      check (coalesce(array_length(showcase_images, 1), 0) <= 8);
  end if;
end $$;

create or replace function public.x_showcase_verified_guard()
returns trigger
language plpgsql
as $$
begin
  -- 値が変わる時だけ検査（認証解除後の既存行の他項目更新は妨げない）
  if (tg_op = 'INSERT' or new.showcase_images is distinct from old.showcase_images)
     and coalesce(array_length(new.showcase_images, 1), 0) > 0
     and not (new.kind = 'shop' and new.is_verified) then
    raise exception 'showcase_images can only be set by verified shops';
  end if;
  return new;
end;
$$;

drop trigger if exists x_profiles_showcase_verified_guard on public.x_profiles;
create trigger x_profiles_showcase_verified_guard
  before insert or update on public.x_profiles
  for each row execute function public.x_showcase_verified_guard();
