-- ★★ 第1010便（2026-09-30・カッキーさん）: fukuX セラピストのアイコンが空なら、フクエスに登録されている本人の写真を使う。
--
-- 1) 自動所属（x_affiliation_auto_link）のときに、avatar_url が空ならフクエスの写真（therapists.profile_image_url）を入れる。
--    ★ 自分で設定した画像がある人は触らない（空のときだけ）。
-- 2) すでに所属済みで空欄の人を、一度だけまとめて埋める（下の update）。
--
-- ★ Supabase ダッシュボードの SQL Editor で実行してください（1と2は別々に実行）。

-- ── 1) 関数を差し替え（第994便の関数に「写真を入れる」を足したもの） ──
create or replace function public.x_affiliation_auto_link()
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_me record;
  v_therapist record;
  v_shop_profile_id uuid;
begin
  select id, kind, status, auth_user_id, affiliated_shop_id, avatar_url into v_me
    from public.x_profiles where auth_user_id = auth.uid();
  if v_me.id is null then return null; end if;
  if v_me.kind <> 'therapist' then return null; end if;
  if v_me.status = 'rejected' then return null; end if;

  -- 本体のセラピスト（連携済み・公開中）
  select t.id, t.salon_id, t.profile_image_url into v_therapist
    from public.therapists t
    where t.user_id = v_me.auth_user_id
      and coalesce(t.is_active, true)
    limit 1;
  if v_therapist.id is null then return v_me.affiliated_shop_id; end if;

  -- ★ 第1010便: アイコンが空ならフクエスの写真を入れる（所属の有無に関わらず・空のときだけ）
  if (v_me.avatar_url is null or v_me.avatar_url = '') and coalesce(v_therapist.profile_image_url, '') <> '' then
    update public.x_profiles set avatar_url = v_therapist.profile_image_url where id = v_me.id;
  end if;

  -- すでに所属している人はそのまま
  if v_me.affiliated_shop_id is not null then return v_me.affiliated_shop_id; end if;

  -- そのお店の fukuX アカウント（認証済み・凍結でない）
  select x.id into v_shop_profile_id
    from public.salons s
    join public.x_profiles x
      on x.auth_user_id = s.owner_id
     and x.kind = 'shop'
     and coalesce(x.is_verified, false)
     and x.status <> 'rejected'
    where s.id = v_therapist.salon_id
    limit 1;
  if v_shop_profile_id is null then return null; end if;

  -- 所属確定（ガードを通すための合図）
  perform set_config('x.affiliation_op', 'on', true);
  update public.x_profiles
     set affiliated_shop_id = v_shop_profile_id
   where id = v_me.id;

  -- 保留中の申請を片付ける（同じお店からの申請は承認扱い・他は却下）
  update public.x_affiliation_requests
     set status = 'accepted', responded_at = now()
   where therapist_profile_id = v_me.id and status = 'pending' and shop_profile_id = v_shop_profile_id;
  update public.x_affiliation_requests
     set status = 'rejected', responded_at = now()
   where therapist_profile_id = v_me.id and status = 'pending';

  return v_shop_profile_id;
end;
$function$;

-- ── 2) すでに連携済みで、アイコンが空のセラピストを一度だけ埋める（自分で設定した人は触らない） ──
-- update public.x_profiles x
--    set avatar_url = t.profile_image_url
--   from public.therapists t
--  where x.kind = 'therapist'
--    and (x.avatar_url is null or x.avatar_url = '')
--    and t.user_id = x.auth_user_id
--    and coalesce(t.is_active, true)
--    and coalesce(t.profile_image_url, '') <> '';
--
-- ── 確認用 ──
-- select handle, avatar_url from public.x_profiles where kind = 'therapist' order by created_at desc;
