-- ★ 第1663便（2026-10-26・カッキーさん）: ユーザーアカウント（kind = 'user'）の URL 止めを DB でも効かせる。
--   第1647便はアプリのサーバー処理（actions/xPost.ts・x/xDmActions.ts）で止めているだけで、
--   Supabase の API を直接叩かれると抜けられる。このトリガーが最後の砦。
--   ・x_posts: 本文（body）に URL があるか link_url が入っていれば拒否（INSERT と、body/link_url の UPDATE）
--   ・x_messages: 本文に URL があれば拒否。ただし相手が運営（official）の会話＝お問い合わせは免除
--   ・判定の正規表現はアプリ側 x/xUrlGuard.ts と同じ内容（片方を変えたらもう片方も）
--   ・既存の行は触らない。戻すときは最後の「drop trigger」2行だけ実行。
--   ★ 適用はカッキーさんが Supabase の SQL エディタで実行（慎重モード）。

create or replace function public.x_text_has_url(p_text text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_text, '') ~* '(https?://|www\.)\S+'
      or coalesce(p_text, '') ~* '\m[a-z0-9][a-z0-9-]*(\.[a-z0-9-]+)*\.(com|net|org|jp|info|biz|io|me|co|xyz|link|ly|to|app|site|online|top|cc|tv|page|club|shop|store|blog|tokyo|fukuoka)\M';
$$;

-- x_posts（投稿・コメント・編集）
create or replace function public.x_posts_user_url_guard()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if exists (select 1 from public.x_profiles where id = new.author_profile_id and kind = 'user')
     and (public.x_text_has_url(new.body) or new.link_url is not null) then
    raise exception 'ユーザーアカウントは、URL（リンク）を書き込めません。URL を消してから送ってください。';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_x_posts_user_url_guard on public.x_posts;
create trigger trg_x_posts_user_url_guard
  before insert or update of body, link_url on public.x_posts
  for each row execute function public.x_posts_user_url_guard();

-- x_messages（DM）。相手が運営（official）の会話は免除
create or replace function public.x_messages_user_url_guard()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_a public.x_conversations.participant_a%type;
  v_b public.x_conversations.participant_b%type;
begin
  if not exists (select 1 from public.x_profiles where id = new.sender_profile_id and kind = 'user') then
    return new;
  end if;
  if not public.x_text_has_url(new.body) then
    return new;
  end if;
  select participant_a, participant_b into v_a, v_b
    from public.x_conversations where id = new.conversation_id;
  if exists (select 1 from public.x_profiles where id in (v_a, v_b) and kind = 'official') then
    return new;
  end if;
  raise exception 'ユーザーアカウントは、URL（リンク）を書き込めません。URL を消してから送ってください。';
end;
$$;

drop trigger if exists trg_x_messages_user_url_guard on public.x_messages;
create trigger trg_x_messages_user_url_guard
  before insert or update of body on public.x_messages
  for each row execute function public.x_messages_user_url_guard();

-- 戻すとき（必要になったら、この2行だけ実行）:
-- drop trigger if exists trg_x_posts_user_url_guard on public.x_posts;
-- drop trigger if exists trg_x_messages_user_url_guard on public.x_messages;
