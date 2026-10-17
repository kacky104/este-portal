-- 上位表示の回数を全店 1日40回に統一（第1538便・2026-10-17・カッキーさんの決定）
-- ★ プランが「フクエス＋フクエスワーク」のセットになったため、ワーク契約（jobs_enabled）の有無で回数に差を付けない。
--   これまで: 20回／フクエスワーク掲載店 40回 → これから: 全店 40回（朝6時リセット・持ち越しなし・手動と自動で同じ財布は変わらず）。
-- ★ 変えるのは salon_bump_apply の v_quota の1行だけ（中身は 20260915_salon_bump_auto.sql のものをそのまま写した）。
-- ★ 今日すでに使った回数（bump_used）はそのまま＝今日から上限だけ 40 になる。
-- ★ 画面・周の数字は src/lib/bumpAuto.ts（BUMP_QUOTA_BASE=40）とそろえる。

create or replace function public.salon_bump_apply(p_salon_id bigint, p_auto boolean)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_jobs boolean;
  v_day date;
  v_used int;
  v_quota int;
  -- JST の現在時刻から6時間引いた日付＝「朝6時区切りの日」。6時前は前日扱い。
  v_today date := ((now() at time zone 'Asia/Tokyo') - interval '6 hours')::date;
begin
  select coalesce(jobs_enabled, false), bump_day, coalesce(bump_used, 0)
    into v_jobs, v_day, v_used
    from public.salons
    where id = p_salon_id
    for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', '対象店舗が見つかりません');
  end if;

  -- ★ 第1538便（2026-10-17・カッキーさん）: フクエスとフクエスワークがセットになったので、全店 40回に統一（ワーク契約の有無で差を付けない）。
  --   v_jobs は読むが使わない（列の読み方を変えないため残す）。
  v_quota := 40;

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
    set bumped_at    = now(),
        bump_day     = v_today,
        bump_used    = v_used + 1,
        -- ★ 自動のときだけ足あとを残す。★ 手動では触らない
        bump_auto_at = case when p_auto then now() else bump_auto_at end
    where id = p_salon_id;
  perform set_config('app.salon_bump_rpc', '', true);

  return jsonb_build_object('ok', true,
    'used', v_used + 1, 'quota', v_quota, 'remaining', v_quota - v_used - 1,
    'auto', p_auto,
    'bumped_at', now());
end;
$$;

revoke all on function public.salon_bump_apply(bigint, boolean) from public;

-- 確認（40 が入っていれば OK）:
-- select prosrc like '%v_quota := 40;%' as ok from pg_proc where proname = 'salon_bump_apply';
