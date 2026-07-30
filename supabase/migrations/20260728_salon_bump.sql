-- フクエス: 店舗カード上位表示（bump）機能
-- オーナーが /mypage のボタンで自店カードを TOP・地域ページの先頭に出す。
--   ・押した店を「押した時刻の新しい順」で先頭に並べる（後から押した店が1位、前の店は2位…）
--   ・回数は1日20回。フクエスワーク掲載店（jobs_enabled=true）は＋20回＝40回
--   ・毎朝6時（日本時間）にリセット。未使用分の持ち越しなし。上位表示の効果も翌朝6時に解除
-- ※ Supabase SQL Editor で適用する。冪等（再実行しても安全）。
-- ※ コードのデプロイ前に適用すること（salons.bumped_at を select するが、
--    未適用でも fetchSalons はフォールバックで落ちない。RPC 未適用だとボタンだけエラーになる）。

-- ── 1) 列追加 ─────────────────────────────────────────────
alter table public.salons
  add column if not exists bumped_at timestamptz,          -- 最後に上位表示ボタンを押した時刻
  add column if not exists bump_day date,                  -- 回数カウントの対象日（JST 6時区切り）
  add column if not exists bump_used integer not null default 0; -- その日の使用回数

-- ── 2) 直接UPDATE防止トリガ ───────────────────────────────
-- オーナーは既存RLSで自店の salons を UPDATE できるため、bump系の列だけは
-- 専用RPC（salon_bump）以外から変更できないようにする（回数制限のすり抜け防止）。
create or replace function public.salons_bump_guard()
returns trigger
language plpgsql
as $$
begin
  if (new.bumped_at is distinct from old.bumped_at
      or new.bump_day is distinct from old.bump_day
      or new.bump_used is distinct from old.bump_used)
     and coalesce(current_setting('app.salon_bump_rpc', true), '') <> '1' then
    raise exception '上位表示は専用ボタンからのみ操作できます';
  end if;
  return new;
end;
$$;

drop trigger if exists salons_bump_guard on public.salons;
create trigger salons_bump_guard
  before update on public.salons
  for each row execute function public.salons_bump_guard();

-- ── 3) 上位表示RPC ────────────────────────────────────────
-- オーナー本人の店舗のみ。JST 6時区切りの「日」で回数を管理し、上限内なら bumped_at を now() に更新。
create or replace function public.salon_bump(p_salon_id bigint)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_jobs boolean;
  v_day date;
  v_used int;
  v_quota int;
  -- JST の現在時刻から6時間引いた日付＝「朝6時区切りの日」。6時前は前日扱い。
  v_today date := ((now() at time zone 'Asia/Tokyo') - interval '6 hours')::date;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'ログインが必要です');
  end if;

  select owner_id, coalesce(jobs_enabled, false), bump_day, coalesce(bump_used, 0)
    into v_owner, v_jobs, v_day, v_used
    from public.salons
    where id = p_salon_id
    for update;

  if not found or v_owner is distinct from v_uid then
    return jsonb_build_object('ok', false, 'error', '対象店舗が見つかりません');
  end if;

  v_quota := 20 + (case when v_jobs then 20 else 0 end);

  -- 日付が変わっていたら（朝6時を跨いでいたら）カウントをリセット。持ち越しなし。
  if v_day is distinct from v_today then
    v_used := 0;
  end if;

  if v_used >= v_quota then
    return jsonb_build_object('ok', false, 'error', '本日の上位表示回数を使い切りました（毎朝6時にリセットされます）',
      'used', v_used, 'quota', v_quota, 'remaining', 0);
  end if;

  -- ガードトリガの通行証（このトランザクション内のみ有効）。
  perform set_config('app.salon_bump_rpc', '1', true);
  update public.salons
    set bumped_at = now(), bump_day = v_today, bump_used = v_used + 1
    where id = p_salon_id;
  perform set_config('app.salon_bump_rpc', '', true);

  return jsonb_build_object('ok', true,
    'used', v_used + 1, 'quota', v_quota, 'remaining', v_quota - v_used - 1,
    'bumped_at', now());
end;
$$;

revoke all on function public.salon_bump(bigint) from public;
grant execute on function public.salon_bump(bigint) to authenticated;
