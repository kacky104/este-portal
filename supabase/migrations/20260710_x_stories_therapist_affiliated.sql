-- ストーリー投稿を「セラピストはお店所属中のみ」に制限（shop/official は従来どおり）。
-- UI側は XStoryBar の canPost に同条件を追加済み。こちらはRLSでの強制。

-- 1) 自分が所属中かを返すヘルパー（security definer・x_profiles のRLSに依存しない）
create or replace function public.x_me_affiliated()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from x_profiles
    where id = x_my_profile_id() and affiliated_shop_id is not null
  );
$$;

-- 2) insert ポリシー差し替え: 従来条件 ＋（therapist なら所属必須）
drop policy if exists x_stories_insert on public.x_stories;
create policy x_stories_insert on public.x_stories
  for insert to authenticated
  with check (
    author_profile_id = x_my_profile_id()
    and x_me_can_act()
    and x_my_kind() in ('therapist','shop','official')
    and (x_my_kind() <> 'therapist' or x_me_affiliated())
  );
