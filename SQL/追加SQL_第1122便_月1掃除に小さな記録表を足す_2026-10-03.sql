-- 第1122便: 第1118便の月1掃除（salon_media_audit_purge）に、小さな記録表を足す（2026-10-03）
-- ※ Supabase SQL Editor で実行してください。冪等（再実行しても安全）。PUSH との順番は問いません（コードは触らない）。
-- ※ 関数の差し替えだけ。pg_cron の登録（media-audit-purge-90d・毎月3日 3:10 JST）はそのまま使う。
--
-- ★ 足した表と、消す条件（90日より古い行のうち、無くても動きが変わらないもの）
--   3) salon_import_runs      … 駅ちか取り込みの実行ログ（1日1行/店）。★ 枠ごとの【最新1行】は残す
--                               （赤帯の「週間の周が走ったか」は最新1行だけ見る・掃除の安全弁は直近1時間だけ見る）
--   4) media_sokuhime_pushes  … 即ヒメを押した記録。★ removed_at が入っている（解除済み）か expires_at が90日より前のものだけ
--                               （読む側は「removed_at が空で 24時間以内」しか見ない）
--   5) diary_post_sent        … 写メ日記を送った印（二度送り防止）。★ 送る側は 14日以内の日記しか見ないので、90日前の印は二度と参照されない
-- ★ 足さない表: conecf_photo_pushes（記録ではなく「いま送ってある写真」の状態。消すと写真を送り直す）。
-- ★ 第1118便の 1)・2)（salon_media_audit・media_relay_jobs）は変えない。

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
  n_runs  integer;
  n_soku  integer;
  n_sent  integer;
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

  -- 3) 取り込みの実行ログ: 90 日より古く、その枠の最新1行ではない行
  delete from public.salon_import_runs r
   using (
     select id
       from (
         select id, started_at,
                row_number() over (partition by source_id order by started_at desc, id desc) as rn
           from public.salon_import_runs
       ) t
      where t.started_at < cut and t.rn > 1
   ) d
   where r.id = d.id;
  get diagnostics n_runs = row_count;

  -- 4) 即ヒメを押した記録: 90 日より古く、解除済みか期限切れのもの
  delete from public.media_sokuhime_pushes
   where pushed_at < cut
     and (removed_at is not null or expires_at < cut);
  get diagnostics n_soku = row_count;

  -- 5) 写メ日記を送った印: 90 日より古いもの
  delete from public.diary_post_sent
   where sent_at < cut;
  get diagnostics n_sent = row_count;

  return jsonb_build_object(
    'audit_deleted', n_audit, 'relay_jobs_deleted', n_jobs,
    'import_runs_deleted', n_runs, 'sokuhime_pushes_deleted', n_soku, 'diary_sent_deleted', n_sent,
    'cut', cut
  );
end $$;

revoke all on function public.salon_media_audit_purge(integer) from public, anon, authenticated;

-- 確認用（適用後に別途流す）。5つの件数が返れば OK（表はどれも 8月末生まれなので、しばらくは 0）:
--   select public.salon_media_audit_purge(90);
