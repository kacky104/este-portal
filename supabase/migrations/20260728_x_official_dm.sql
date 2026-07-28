-- fukuX: 運営(official)アカウントのDM特例（お問い合わせフォーム導線 ＋ 運営からのフォロー不要DM）
-- コード側: 運営プロフィールの「メッセージ」→ XOfficialContactModal（お問い合わせフォーム）／
--           運営はフォロー関係なしに誰にでもメッセージを送れる。
-- ※ Supabase SQL Editor で適用する。冪等（再実行しても安全）。
-- ※ コードのデプロイ前に適用すること（未適用のまま公開すると、お問い合わせ送信が
--    「follow relationship required to start a conversation」で失敗する）。

-- ── 1) 送り手が運営かどうか（運営 → 誰にでも送れる） ────────────────────────
create or replace function public.x_official_dm_sender(p_sender uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from x_profiles s
    where s.id = p_sender and s.kind = 'official' and s.status = 'approved'
  );
$$;

-- ── 2) 宛先が運営かどうか（誰でも → 運営へ送れる＝お問い合わせフォームの導線） ──
create or replace function public.x_official_dm_target(p_target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from x_profiles t
    where t.id = p_target and t.kind = 'official' and t.status = 'approved'
  );
$$;

-- ── 3) 会話開始RPC: 判定行に運営の2条件を追加（他の部分は 20260710_x_profiles_offer.sql と同一） ──
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
  -- 開始可の条件:
  --   (a) フォロー関係が1本でもある
  --   (b) オファー経由（認証済みshop/official → オファー受付中の未所属セラピスト）
  --   (c) 送り手が運営（運営 → 誰にでも）
  --   (d) 宛先が運営（誰でも → 運営。プロフィールのお問い合わせフォーム）
  if not (
    x_follow_exists_between(v_me, p_other)
    or x_offer_dm_allowed(v_me, p_other)
    or x_official_dm_sender(v_me)
    or x_official_dm_target(p_other)
  ) then
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

-- ── 4) dm_disabled ガードの運営免除（20260710_fukux_dm_disabled.sql の2関数を差し替え） ──
-- 運営が参加する会話は「DM受付オフ」の影響を受けない。
--   ・運営 → DM受付オフのユーザー（規約違反の警告・重要なお知らせを確実に届けるため）
--   ・DM受付オフのユーザー → 運営（自分の設定でお問い合わせが塞がらないようにするため）
create or replace function public.x_dm_disabled_guard_conversations()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- 運営が参加する会話は免除。
  if exists (
    select 1 from public.x_profiles
    where id in (new.participant_a, new.participant_b) and kind = 'official'
  ) then
    return new;
  end if;
  if exists (
    select 1 from public.x_profiles
    where id in (new.participant_a, new.participant_b) and dm_disabled
  ) then
    raise exception 'メッセージを受け付けていないアカウントです';
  end if;
  return new;
end;
$$;

drop trigger if exists x_conversations_dm_disabled_guard on public.x_conversations;
create trigger x_conversations_dm_disabled_guard
  before insert on public.x_conversations
  for each row execute function public.x_dm_disabled_guard_conversations();

create or replace function public.x_dm_disabled_guard_messages()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_a public.x_conversations.participant_a%type;
  v_b public.x_conversations.participant_b%type;
begin
  select participant_a, participant_b into v_a, v_b
    from public.x_conversations where id = new.conversation_id;
  -- 運営が参加する会話は免除。
  if exists (
    select 1 from public.x_profiles
    where id in (v_a, v_b) and kind = 'official'
  ) then
    return new;
  end if;
  if exists (
    select 1 from public.x_profiles
    where id in (v_a, v_b) and dm_disabled
  ) then
    raise exception 'メッセージを受け付けていないアカウントです';
  end if;
  return new;
end;
$$;

drop trigger if exists x_messages_dm_disabled_guard on public.x_messages;
create trigger x_messages_dm_disabled_guard
  before insert on public.x_messages
  for each row execute function public.x_dm_disabled_guard_messages();
