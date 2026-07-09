-- fukuX: DM受付オフ設定（全アカウント種別共通）
-- 2026-07-10 に Supabase SQL Editor で直接適用済み。本ファイルは記録用（再実行しても安全な形で記載）。
-- コード側: 80b339e（/x/settings トグル・メッセージボタン非表示・スレッド送信フォーム差し替え）
-- 仕様: どちらか一方でも dm_disabled=true なら、新規会話の開始・既存スレッドへの送信とも不可（閲覧は可）。

-- 1) カラム追加（※ コードが select するため、コードのデプロイ前に適用が必須だった）
alter table public.x_profiles add column if not exists dm_disabled boolean not null default false;

-- 2) 新規会話ガード: 参加者のどちらかが dm_disabled なら会話を作成できない
--    （x_start_conversation RPC の中身には触れず、INSERT トリガで最終防御する方式）
create or replace function public.x_dm_disabled_guard_conversations()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
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

-- 3) 既存スレッド送信ガード: 会話参加者のどちらかが dm_disabled なら送信不可
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
