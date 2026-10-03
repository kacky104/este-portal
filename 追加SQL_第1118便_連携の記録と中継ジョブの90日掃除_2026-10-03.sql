-- 第1118便: コネックエフ／フクエスリンクの「記録」と「中継ジョブ」を 90 日で掃除する（2026-10-03）
-- ※ Supabase SQL Editor で実行してください。冪等（再実行しても安全）。PUSH との順番は問いません（コードは触らない）。
-- ※ pg_cron は第1116便までに ON 済み（crm-purge-old-data が動いている）。
--
-- ★ 対象の2表
--   1) salon_media_audit … 連携の記録（ログイン・読み取り・書き込み…1回ごとに1行）。★ 追記専用で今まで一切消えなかった
--   2) media_relay_jobs  … VPS への中継ジョブ（HTTP 1往復ごとに1行）。中身（暗号文）は終了後に消していたが【行】は残っていた
--
-- ★ 決めごと（カッキーさん「1 → 2 の順で」の 2）
--   ・90 日より古い行を消す。毎月3日 3:10 JST（＝毎月2日 18:10 UTC）に pg_cron で1回。対象が無ければ何もしない。
--   ・【残すもの】（消すと画面や判定が変わるので、古くても消さない）
--       a. 「設定を変えた」記録: consent_agreed（同意）・credential_*（ID/PASS の登録・停止・再開・解除）・link_mode_changed（向き）
--          source_registered・sokuhime_auto_changed・cast_id_linked／unlinked・diary_write_pref・diary_source_synced・diary_backfill_started
--          ★ 同意と ID/PASS の扱いは「いつ預かって、いつ何に使ったか」を店舗に示す根拠なので残す。
--          ★ link_mode_changed は「書く向きをいつ始めたか」（1回目の承認済みか）の判定に使う。消すと承認をやり直させてしまう。
--       b. 店舗×媒体×枠×できごと×結果 ごとの【いちばん新しい1行】
--          ★ 「最後に反映できた時刻」「最後にメールリストを読んだ時刻」のように、画面が「最新の1件」だけ見るものを守る。
--   ・追記専用のトリガーはそのまま。★ この掃除の中だけ通す（取引内の設定 app.audit_purge = 'on' のときだけ DELETE を許す）。
--     手で update/delete しようとすれば今までどおり弾かれる。
--
-- ★ 先に件数を見たいとき（流す前でも後でもよい）:
--   select count(*) filter (where created_at < now() - interval '90 days') as old_rows, count(*) as all_rows,
--          pg_size_pretty(pg_total_relation_size('public.salon_media_audit')) as size from public.salon_media_audit;
--   select status, count(*) from public.media_relay_jobs group by status order by 1;

-- ── 1. 追記専用トリガーに「掃除だけ通す」穴を開ける ───────────────────────────
create or replace function public.salon_media_audit_append_only()
returns trigger
language plpgsql
as $$
begin
  -- ★ 第1118便: 掃除（salon_media_audit_purge）の中だけ DELETE を通す。UPDATE は今までどおり一切不可。
  if tg_op = 'DELETE' and current_setting('app.audit_purge', true) = 'on' then
    return old;
  end if;
  raise exception '監査ログは追記専用です（% は許可されていません）', tg_op;
end;
$$;

-- ── 2. 掃除の本体 ─────────────────────────────────────────────────────────
create or replace function public.salon_media_audit_purge(p_days integer default 90)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cut timestamptz := now() - make_interval(days => p_days);
  n_audit integer;
  n_jobs  integer;
begin
  -- ★ この取引の中だけ、追記専用トリガーが DELETE を通す（is_local = true：取引が終われば元に戻る）
  perform set_config('app.audit_purge', 'on', true);

  -- 1) 連携の記録: 90 日より古く、「設定を変えた」記録ではなく、その 店舗×媒体×枠×できごと×結果 の最新1行でもない行
  delete from public.salon_media_audit a
   using (
     select id
       from (
         select id, event, created_at,
                row_number() over (partition by salon_id, provider, slot, event, outcome order by created_at desc, id desc) as rn
           from public.salon_media_audit
       ) t
      where t.created_at < cut
        and t.rn > 1
        and t.event not in (
          'consent_agreed',
          'credential_saved', 'credential_disabled', 'credential_enabled', 'credential_deleted',
          'link_mode_changed', 'source_registered', 'sokuhime_auto_changed',
          'cast_id_linked', 'cast_id_unlinked', 'diary_write_pref', 'diary_source_synced', 'diary_backfill_started'
        )
   ) d
   where a.id = d.id;
  get diagnostics n_audit = row_count;

  perform set_config('app.audit_purge', 'off', true);

  -- 2) 中継ジョブ: 終わって 90 日より古い行（走っている queued / leased は触らない）
  delete from public.media_relay_jobs
   where status in ('done', 'failed', 'expired')
     and updated_at < cut;
  get diagnostics n_jobs = row_count;

  return jsonb_build_object('audit_deleted', n_audit, 'relay_jobs_deleted', n_jobs, 'cut', cut);
end $$;

revoke all on function public.salon_media_audit_purge(integer) from public, anon, authenticated;

-- ── 3. 毎月1回（毎月3日 3:10 JST ＝ 毎月2日 18:10 UTC）。同じ名前なら上書き ─────────
create extension if not exists pg_cron;

select cron.schedule(
  'media-audit-purge-90d',
  '10 18 2 * *',
  $$select public.salon_media_audit_purge(90);$$
);

-- ── 確認用 ──────────────────────────────────────────────────────────────
-- 登録されたか:
--   select jobid, jobname, schedule, command from cron.job where jobname = 'media-audit-purge-90d';
-- 今すぐ1回流してみる（消した件数が返る。対象が無ければ 0）:
--   select public.salon_media_audit_purge(90);
-- 追記専用がまだ効いているか（エラーになれば成功）:
--   delete from public.salon_media_audit where id = (select min(id) from public.salon_media_audit);
-- 直近の実行結果:
--   select start_time, status, return_message from cron.job_run_details
--    where jobid = (select jobid from cron.job where jobname = 'media-audit-purge-90d') order by start_time desc limit 5;
