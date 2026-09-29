-- ★★ 第994便（2026-09-30・カッキーさん）: セラピストページ連携済みのセラピストが fukuX アカウントを作ったら、
--   そのお店の fukuX アカウント（認証済み）に【自動で所属】させる関数。
--
-- 条件（カッキーさん決定・2026-09-30）
--   ・お店: fukuX のお店アカウント（kind='shop'）が is_verified（認証済み）・凍結でない
--   ・セラピスト: 本体（therapists）で公開中（is_active が false でない）
--   ・すでに所属先がある人は何もしない（今の所属を上書きしない）
--
-- たどり方: ログイン中の本人（auth.uid()）→ x_profiles（kind='therapist'）
--           → therapists.user_id = 本人 → salons.owner_id → x_profiles（kind='shop', auth_user_id = owner_id）
--
-- ★ 所属先（affiliated_shop_id）は trg_x_profiles_affiliation_guard により、x.affiliation_op='on' の中でしか変えられない。
--   既存の x_affiliation_respond と同じ合図を使う。
-- ★ 呼べるのはログイン済み（authenticated）の本人だけ。本人の行しか変えない。
-- ★ 戻り値: 所属した（または既に所属している）お店の x_profiles.id。条件に合わなければ null。
--
-- ★ Supabase ダッシュボードの SQL Editor で実行してください。

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
  select id, kind, status, auth_user_id, affiliated_shop_id into v_me
    from public.x_profiles where auth_user_id = auth.uid();
  if v_me.id is null then return null; end if;
  if v_me.kind <> 'therapist' then return null; end if;
  if v_me.status = 'rejected' then return null; end if;
  -- すでに所属している人はそのまま
  if v_me.affiliated_shop_id is not null then return v_me.affiliated_shop_id; end if;

  -- 本体のセラピスト（連携済み・公開中）
  select t.id, t.salon_id into v_therapist
    from public.therapists t
    where t.user_id = v_me.auth_user_id
      and coalesce(t.is_active, true)
    limit 1;
  if v_therapist.id is null then return null; end if;

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

revoke all on function public.x_affiliation_auto_link() from public;
grant execute on function public.x_affiliation_auto_link() to authenticated;

-- ── 確認用（別に実行）──
-- select proname, prosecdef from pg_proc where proname = 'x_affiliation_auto_link';
