-- 追加SQL_第1331便（2026-10-09）: フクエスCRM「グループ・提携店で共有するNG・要注意リスト」の、古い行を消す。
--
-- ★ 足すもの: 関数 public.crm_group_purge() と、毎日 3:10（日本時間）にそれを動かす予定（pg_cron の 'crm-group-purge'）。
--     今ある表・今ある関数（crm_purge_old_data・毎日 3:00）は変えない。
--
-- ★ 消す決まり（設計メモ §4・フクエスCRM の今の決まりに合わせる）
--   ① フクエスCRM を解約して90日たった店 → グループから外し、その店が出していた共有を取り下げる。署名待ちなら取りやめる。
--        （解約して90日までは、行は残す。画面の側が「解約した店の共有は見せない」をしている＝第1331便のコード。
--          90日以内に再契約すれば、また見える。CRM 利用規約「契約が終わってから90日は残す。再契約すれば元どおり」と同じ）
--   ② 取り下げて90日たった共有 → 行ごと消す（電話番号の行も一緒に消える）。
--        取り下げ＝店が自分で取り下げた／グループから外れた・グループが終わった／お客様を台帳から消した／①。
--   ③ 作ってから8年たった共有 → 取り下げていなくても消す（フクエスCRM の保存期間・一律8年と同じ）。
--
-- ★ 消さないもの: グループ・入っていた店の行（crm_groups・crm_group_members）、署名・承認の記録（crm_group_signatures）、
--     操作の記録（crm_group_logs。電話番号・名前・内容は入っていない）。
-- ★ 消したことは crm_group_logs に残す（どの共有を・いつ・なぜ。中身は残さない）。
-- ★ 何度流しても同じ結果になる。★ 第1324便・第1328便の SQL を先に流してあること。pg_cron が ON であること（今の片づけで使っている）。
-- ★ 流す順番: push の前でも後でもよい。

create or replace function public.crm_group_purge()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'Asia/Tokyo')::date;
  m record;
  n integer;
  n_left integer := 0;
  n_withdrawn integer := 0;
  n_invites integer := 0;
  n_purged integer := 0;
  n_expired integer := 0;
begin
  -- ① 解約して90日たった店を、グループから外す（★ 条件は crm_purge_ended_salons と同じ）
  for m in
    select gm.id, gm.group_id, gm.salon_id
      from public.crm_group_members gm
      join public.salons s on s.id = gm.salon_id
     where gm.left_at is null
       and (
         (s.crm_until is null and s.crm_ended_on is not null and s.crm_ended_on <= today - 90)
         or (s.crm_until is not null and s.crm_until <= today - 90)
       )
  loop
    -- 先に共有を取り下げてから、店を外す（外したのに、共有だけ残さない）
    update public.crm_group_alerts
       set withdrawn_at = now(), withdrawn_reason = 'left'
     where group_id = m.group_id and salon_id = m.salon_id and withdrawn_at is null;
    get diagnostics n = row_count;
    n_withdrawn := n_withdrawn + n;
    update public.crm_group_members set left_at = now() where id = m.id and left_at is null;
    insert into public.crm_group_logs (group_id, salon_id, actor, action, detail)
      values (m.group_id, m.salon_id, 'system', 'member_leave', jsonb_build_object('reason', 'crm_ended_90d', 'withdrawn', n));
    n_left := n_left + 1;
  end loop;

  -- ①' 署名待ちのまま、解約して90日たった店 → 取りやめる
  update public.crm_group_invites i
     set status = 'cancelled', closed_at = now()
    from public.salons s
   where s.id = i.salon_id and i.status = 'pending'
     and (
       (s.crm_until is null and s.crm_ended_on is not null and s.crm_ended_on <= today - 90)
       or (s.crm_until is not null and s.crm_until <= today - 90)
     );
  get diagnostics n_invites = row_count;

  -- ② 取り下げて90日たった共有を、行ごと消す（電話番号の行は on delete cascade で一緒に消える）
  with gone as (
    delete from public.crm_group_alerts
     where withdrawn_at is not null and withdrawn_at < now() - interval '90 days'
    returning id, group_id, salon_id, withdrawn_reason
  )
  insert into public.crm_group_logs (group_id, salon_id, alert_id, actor, action, detail)
    select group_id, salon_id, id, 'system', 'alert_purge', jsonb_build_object('reason', 'withdrawn_90d', 'withdrawn_reason', withdrawn_reason)
      from gone;
  get diagnostics n_purged = row_count;

  -- ③ 作ってから8年たった共有を消す（取り下げていなくても）
  with gone as (
    delete from public.crm_group_alerts
     where created_at < now() - interval '8 years'
    returning id, group_id, salon_id
  )
  insert into public.crm_group_logs (group_id, salon_id, alert_id, actor, action, detail)
    select group_id, salon_id, id, 'system', 'alert_purge', jsonb_build_object('reason', 'expired_8y')
      from gone;
  get diagnostics n_expired = row_count;

  return jsonb_build_object('left', n_left, 'withdrawn', n_withdrawn, 'invites_cancelled', n_invites, 'purged_90d', n_purged, 'expired_8y', n_expired);
end $$;
revoke all on function public.crm_group_purge() from public, anon, authenticated;
comment on function public.crm_group_purge() is
  E'フクエスCRM: グループ・提携店の共有の片づけ（第1331便）。解約90日の店を外す／取り下げて90日の共有を消す／8年たった共有を消す。毎日 3:10 JST（pg_cron）。';

-- 毎日 3:10（日本時間）＝ 18:10 UTC。今の片づけ（crm-purge-old-data・3:00）の少しあと。対象が無ければ一瞬で終わる。
select cron.schedule('crm-group-purge', '10 18 * * *', $$select public.crm_group_purge();$$);

notify pgrst, 'reload schema';

-- ★ 確認 1: 予定が入ったこと（1行。schedule が 10 18 * * * ・active が true）
select jobname, schedule, active from cron.job where jobname = 'crm-group-purge';

-- ★ 確認 2: いま動かしたら、何がいくつ対象になるか（★ 見るだけ。消さない。全部 0 のはず）
select
  (select count(*) from public.crm_group_members gm join public.salons s on s.id = gm.salon_id
    where gm.left_at is null
      and ((s.crm_until is null and s.crm_ended_on is not null and s.crm_ended_on <= (now() at time zone 'Asia/Tokyo')::date - 90)
        or (s.crm_until is not null and s.crm_until <= (now() at time zone 'Asia/Tokyo')::date - 90))) as members_to_leave,
  (select count(*) from public.crm_group_alerts where withdrawn_at is not null and withdrawn_at < now() - interval '90 days') as alerts_to_purge_90d,
  (select count(*) from public.crm_group_alerts where created_at < now() - interval '8 years') as alerts_to_purge_8y;
