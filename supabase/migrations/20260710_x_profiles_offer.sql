-- fukuX: オファー機能（求人スカウト）用カラム・ガードトリガ・DMフォロー免除RPC
-- 2026-07-10 に Supabase SQL Editor で直接適用済み。本ファイルは記録用（再実行しても安全な冪等形式で記載）。
-- コード側: /x/offers 一覧・/x/settings オファー受付トグル・XMessageButton フォロー免除。
-- 仕様: kind=therapist ∧ status=approved ∧ affiliated_shop_id IS NULL ∧ offer_enabled=true のセラピストを
--       認証済みshop・official のみが /x/offers で閲覧でき、フォローなしでDMを開始できる。

-- 1) x_profiles にオファー系カラム追加
--    （※ コードが select するため、コードのデプロイ前に適用が必須だった）
alter table public.x_profiles
  add column if not exists offer_enabled boolean not null default false,
  add column if not exists offer_comment text,
  add column if not exists offer_areas text[] not null default '{}';

alter table public.x_profiles
  drop constraint if exists x_profiles_offer_comment_len;
alter table public.x_profiles
  add constraint x_profiles_offer_comment_len
  check (offer_comment is null or char_length(offer_comment) <= 300);

alter table public.x_profiles
  drop constraint if exists x_profiles_offer_areas_max;
alter table public.x_profiles
  add constraint x_profiles_offer_areas_max
  check (cardinality(offer_areas) <= 8);

-- 2) セラピスト以外は offer 系を設定不可（showcase の x_showcase_verified_guard と同型の二重防御）
create or replace function public.x_offer_therapist_guard()
returns trigger language plpgsql as $$
begin
  if (new.offer_enabled or new.offer_comment is not null or cardinality(new.offer_areas) > 0)
     and new.kind <> 'therapist' then
    raise exception 'offer settings are for therapists only';
  end if;
  return new;
end $$;

drop trigger if exists x_offer_therapist_guard on public.x_profiles;
create trigger x_offer_therapist_guard
  before insert or update on public.x_profiles
  for each row execute function public.x_offer_therapist_guard();

-- 3) DMフォロー免除: sender=認証済みshop or official、target=オファー受付中の未所属セラピスト
--    （x_start_conversation のフォロー判定行のみ変更。dm_disabled/rejected の既存ガードはそのまま効く）
create or replace function public.x_offer_dm_allowed(p_sender uuid, p_target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from x_profiles s, x_profiles t
    where s.id = p_sender and t.id = p_target
      and s.status = 'approved'
      and (s.kind = 'official' or (s.kind = 'shop' and s.is_verified))
      and t.kind = 'therapist' and t.status = 'approved'
      and t.offer_enabled and t.affiliated_shop_id is null
  );
$$;

CREATE OR REPLACE FUNCTION public.x_start_conversation(p_other uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_me uuid;
  v_a uuid;
  v_b uuid;
  v_conv_id bigint;
begin
  v_me := x_my_profile_id();
  if v_me is null then
    raise exception 'not authenticated';
  end if;
  if not x_me_can_act() then
    raise exception 'account cannot act';
  end if;
  if p_other is null or p_other = v_me then
    raise exception 'invalid target';
  end if;
  -- フォロー関係 または オファー経由（認証済みshop/official→オファー受付中の未所属セラピスト）で開始可
  if not (x_follow_exists_between(v_me, p_other) or x_offer_dm_allowed(v_me, p_other)) then
    raise exception 'follow relationship required to start a conversation';
  end if;

  if v_me < p_other then
    v_a := v_me; v_b := p_other;
  else
    v_a := p_other; v_b := v_me;
  end if;

  select id into v_conv_id
  from public.x_conversations
  where participant_a = v_a and participant_b = v_b;

  if v_conv_id is not null then
    return v_conv_id;
  end if;

  insert into public.x_conversations (participant_a, participant_b)
  values (v_a, v_b)
  on conflict (participant_a, participant_b) do nothing
  returning id into v_conv_id;

  if v_conv_id is null then
    select id into v_conv_id
    from public.x_conversations
    where participant_a = v_a and participant_b = v_b;
  end if;

  return v_conv_id;
end;
$function$;
