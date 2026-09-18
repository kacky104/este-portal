-- /ranking おすすめランキング ＋ お知らせ1日5回まで（第500便・2026-09-18・カッキーさんの指示）
-- ※ Supabase SQL Editor で実行してください（★ コード push より先に適用）。冪等（再実行しても安全）。
--
-- ★ 点数（その週＝月曜0時 JST はじまり）
--   ・手動の上位表示 1回 ＝ 1点（★ 自動実行は点にしない）
--   ・手動のお知らせ 1回 ＝ 5点（新規・再投稿でフクエスTOPが動いた回。★ 自動配信は点にしない）
--   ・店舗アカウントの fukuX 投稿 1件 ＝ 1点（返信は数えない）。★ 1日10点まで（朝6時区切りの日）
-- ★ お知らせは 1日5回まで（朝6時区切り・★ 自動配信も1回に数える）。
-- ★ 上位表示・お知らせの回数は今まで記録が無かった ＝ この SQL を当てた時点から数え始める。fukuX は過去も数えられる。

-- ============================================================
-- 1. 記録の表（★ 店舗様からは読めない・書けない。書くのは RPC とサーバ処理だけ）
-- ============================================================
create table if not exists public.salon_rank_events (
  id          bigint generated always as identity primary key,
  salon_id    bigint      not null references public.salons(id) on delete cascade,
  kind        text        not null,
  created_at  timestamptz not null default now()
);
-- kind の種類（冪等に張り直す）
alter table public.salon_rank_events drop constraint if exists salon_rank_events_kind_check;
alter table public.salon_rank_events add constraint salon_rank_events_kind_check
  check (kind in ('bump_manual', 'announce_manual', 'announce_auto'));

create index if not exists salon_rank_events_created_idx
  on public.salon_rank_events (created_at, salon_id);
create index if not exists salon_rank_events_salon_idx
  on public.salon_rank_events (salon_id, created_at);

comment on table public.salon_rank_events is
  E'おすすめランキング・お知らせ1日5回の材料（第500便）。1行＝手動の上位表示1回／お知らせでTOPが動いた1回（手動・自動）。★ service_role / security definer 専用。';

alter table public.salon_rank_events enable row level security;
revoke all on public.salon_rank_events from anon, authenticated;

-- ============================================================
-- 2. 今日（朝6時区切り）のお知らせ回数 —— 上限の判定に使う（サーバ・トリガ用）
-- ============================================================
create or replace function public.salon_announce_count_today(p_salon_id bigint)
returns integer
language sql
stable
security definer set search_path = public
as $$
  select count(*)::int
    from public.salon_rank_events
   where salon_id = p_salon_id
     and kind in ('announce_manual', 'announce_auto')
     and created_at >= (((((now() at time zone 'Asia/Tokyo') - interval '6 hours')::date)::timestamp + interval '6 hours') at time zone 'Asia/Tokyo');
$$;
revoke all on function public.salon_announce_count_today(bigint) from public;
grant execute on function public.salon_announce_count_today(bigint) to authenticated;

-- ============================================================
-- 3. 新規のお知らせ（画面から直に INSERT）を 1日5回で止める
--    ★ 公開で書くときだけ。★ 非公開の下書きは止めない。★ サーバ（service role）と運営は通す
-- ============================================================
create or replace function public.announcements_daily_limit_guard()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.is_published = true
     and auth.uid() is not null
     and auth.uid() <> '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid
     and public.salon_announce_count_today(new.salon_id) >= 5 then
    raise exception '本日のお知らせ投稿は5回までです（毎朝6時にリセットされます）';
  end if;
  return new;
end;
$$;

drop trigger if exists announcements_daily_limit_guard on public.announcements;
create trigger announcements_daily_limit_guard
  before insert on public.announcements
  for each row execute function public.announcements_daily_limit_guard();

-- ============================================================
-- 4. 手動の上位表示（salon_bump）—— 中身だけ差し替え。★ 名前・引数・返り値は同じ
--    ★ 成功した1回だけ記録する。★ 自動（salon_bump_auto_run）は記録しない
-- ============================================================
create or replace function public.salon_bump(p_salon_id bigint)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_res jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'ログインが必要です');
  end if;

  select owner_id into v_owner from public.salons where id = p_salon_id;
  if not found or v_owner is distinct from v_uid then
    return jsonb_build_object('ok', false, 'error', '対象店舗が見つかりません');
  end if;

  v_res := public.salon_bump_apply(p_salon_id, false);
  if coalesce((v_res->>'ok')::boolean, false) then
    insert into public.salon_rank_events (salon_id, kind) values (p_salon_id, 'bump_manual');
  end if;
  return v_res;
end;
$$;

revoke all on function public.salon_bump(bigint) from public;
grant execute on function public.salon_bump(bigint) to authenticated;

-- ============================================================
-- 5. 週の点数（ランキングページが呼ぶ・集計だけを返す）
-- ============================================================
drop function if exists public.salon_recommend_scores(timestamptz, timestamptz);
create or replace function public.salon_recommend_scores(p_from timestamptz, p_to timestamptz)
returns table (salon_id bigint, bumps integer, announces integer, x_points integer, points integer)
language sql
stable
security definer set search_path = public
as $$
  with ev as (
    select e.salon_id,
           count(*) filter (where e.kind = 'bump_manual')::int     as bumps,
           count(*) filter (where e.kind = 'announce_manual')::int as announces
      from public.salon_rank_events e
     where e.created_at >= p_from and e.created_at < p_to
     group by e.salon_id
  ),
  xday as (
    -- ★ 店舗アカウント＝ x_profiles.kind='shop' かつ auth_user_id = salons.owner_id（xLink.ts と同じつなぎ方）
    -- ★ 朝6時区切りの日ごとに数えて、1日10点で頭打ち
    select s.id as salon_id,
           (((p.created_at at time zone 'Asia/Tokyo') - interval '6 hours')::date) as d,
           least(count(p.id), 10)::int as n
      from public.salons s
      join public.x_profiles xpf on xpf.auth_user_id = s.owner_id and xpf.kind = 'shop' and xpf.status = 'approved'
      join public.x_posts p on p.author_profile_id = xpf.id and p.parent_post_id is null
                           and p.created_at >= p_from and p.created_at < p_to
     group by s.id, d
  ),
  xp as (
    select xday.salon_id, sum(xday.n)::int as x_points from xday group by xday.salon_id
  )
  select s.id,
         coalesce(ev.bumps, 0),
         coalesce(ev.announces, 0),
         coalesce(xp.x_points, 0),
         (coalesce(ev.bumps, 0) + coalesce(ev.announces, 0) * 5 + coalesce(xp.x_points, 0))::int
    from public.salons s
    left join ev on ev.salon_id = s.id
    left join xp on xp.salon_id = s.id
   where s.is_hidden = false
     and s.listing_plan = 'standard';
$$;

revoke all on function public.salon_recommend_scores(timestamptz, timestamptz) from public;
grant execute on function public.salon_recommend_scores(timestamptz, timestamptz) to anon, authenticated;

-- ★ 確認
-- select * from public.salon_recommend_scores(now() - interval '7 days', now()) order by points desc limit 10;
-- select public.salon_announce_count_today(6);
