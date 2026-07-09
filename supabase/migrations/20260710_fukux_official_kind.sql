-- fukuX: 新種別 'official'（フクエス運営事務局）追加
-- 2026-07-10 に Supabase SQL Editor で直接適用済み。本ファイルは記録用（再実行しても安全な形で記載）。
-- コード側: 5b3dc8b（XKind追加・公式バッジ・投稿可否・フォロー対象化 ほか）

-- 1) kind enum に 'official' を追加
--    ※ enum の新値は同一トランザクション内では使用不可のため、単独で実行すること
alter type public.x_profile_kind add value if not exists 'official';

-- 2) x_posts の INSERT ポリシー: トップレベル投稿可能な kind に official を追加
--    （リプライ側の x_post_accepts_reply 判定は従来どおり）
alter policy x_posts_insert on public.x_posts
with check (
  (author_profile_id = x_my_profile_id()) and x_me_can_act() and (
    ((parent_post_id is null) and (x_my_kind() = any (array['therapist'::x_profile_kind, 'shop'::x_profile_kind, 'official'::x_profile_kind])))
    or ((parent_post_id is not null) and x_post_accepts_reply(parent_post_id))
  )
);

-- 3) リプライ不可トグルのDBガード: official にも許可
create or replace function public.x_posts_replies_disabled_guard()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_kind public.x_profile_kind;
begin
  if (new.replies_disabled = true) then
    select kind into v_kind
      from public.x_profiles
      where id = new.author_profile_id;
    if (v_kind is null or v_kind not in ('therapist', 'shop', 'official')) then
      raise exception 'replies_disabled can only be set by therapist/shop/official accounts';
    end if;
  end if;
  return new;
end;
$$;

-- 4) x_follows の INSERT ポリシー: フォローされる側の kind に official を追加
--    （フォローする側は従来どおり user/shop のみ。本人性・BAN・凍結チェックは維持）
alter policy x_follows_insert on public.x_follows
with check (
  (follower_profile_id = x_my_profile_id())
  and (x_my_kind() = any (array['user'::x_profile_kind, 'shop'::x_profile_kind]))
  and x_me_can_act()
  and (x_kind_of(followee_profile_id) = any (array['therapist'::x_profile_kind, 'shop'::x_profile_kind, 'official'::x_profile_kind]))
  and (x_status_of(followee_profile_id) <> 'rejected'::x_profile_status)
);

-- 【記録】運営事務局アカウント本体はデータのため本ファイル対象外。
-- auth.users に専用メールでユーザー作成後、以下で作成済み（handle: fukues_info）:
--   insert into public.x_profiles (auth_user_id, kind, handle, display_name, bio, is_verified)
--   select id, 'official', 'fukues_info', 'フクエス運営事務局', '…', true
--   from auth.users where email = '<専用メール>';
-- ※ is_verified はinsertトリガでfalse化されるが、officialバッジはkind判定のため影響なし。
