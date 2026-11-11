-- 第1116便（2026-10-03）: フクエスCRM の「変化がないときは読み直さない」ための変更マーク
--
-- ★ それまで: スケジュール画面は60秒ごとに、変化があってもなくても全量（出勤・予約・顧客・同意・メモ…）を読み直していた。
-- ★ これから: 店舗ごとに「最後に何かが変わった時刻」を1行持つ（crm_change_marks）。
--   画面は60秒ごとに【この1行だけ】読み、前回と同じなら全量を読まない。変わっていたときだけ読み直す。
--   → 深夜など誰も触らない時間帯の読み取りがほぼ消える。
-- ★ マークを進めるのは、画面に出るものが変わる表のトリガー:
--   salon_bookings（予約）／therapist_schedules（出勤・therapists を通して店舗を引く）／crm_consents（同意書）／
--   crm_therapist_memos（女子メモ）／crm_pay_confirms（報酬確定）／crm_daily_reports（日報）／
--   crm_work_ends（受まで・上がり）／crm_work_days（出勤情報）／salon_customers（お客様の分類・注意）
-- ★ 設定・料金表・コースは、画面を開き直したときに読む（第1113便の lite と同じ扱い）のでトリガーは付けない。
-- ★ トリガー関数は security definer（★ 店舗様の権限で出勤を書いたときも、マークの行を書けるように。RLS で止めない）。
-- ★ マークの読み取りは【店舗様本人の権限】で RLS を通して読む（★ service_role を使わない＝サーバーの認証の往復を減らす）。
--   運営（別の店舗を見ているとき）は読めない → 今までどおり毎回全量を読む（コード側で自動で戻る）。
-- ★ このSQLを流す前にコード（第1116便）を push しても壊れない（表が無ければ今までどおり毎回読む）。

-- 1) 店舗ごとのマーク
create table if not exists public.crm_change_marks (
  salon_id   integer     primary key references public.salons(id) on delete cascade,
  bumped_at  timestamptz not null default now()
);
comment on table public.crm_change_marks is
  'フクエスCRM: 店舗ごとに「画面に出るものが最後に変わった時刻」（第1116便）。スケジュール画面はこれが変わったときだけ全量を読み直す';

alter table public.crm_change_marks enable row level security;
revoke all on public.crm_change_marks from anon, authenticated;
grant select on public.crm_change_marks to authenticated;

drop policy if exists crm_change_marks_select_own on public.crm_change_marks;
create policy crm_change_marks_select_own on public.crm_change_marks
  for select
  using (
    exists (
      select 1 from public.salons s
      where s.id = crm_change_marks.salon_id
        and s.owner_id = auth.uid()
    )
  );
-- insert / update / delete のポリシーは作らない＝書くのはトリガー（security definer）だけ。

-- 2) マークを進める
create or replace function public.crm_bump_change_mark(p_salon_id integer)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.crm_change_marks (salon_id, bumped_at)
  values (p_salon_id, now())
  on conflict (salon_id) do update set bumped_at = excluded.bumped_at;
$$;
revoke all on function public.crm_bump_change_mark(integer) from public, anon, authenticated;

-- 3) トリガー関数（★ どの表からでも同じ関数。therapist_schedules だけは therapists を通して店舗を引く）
create or replace function public.crm_change_mark_trg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sid integer;
begin
  if tg_table_name = 'therapist_schedules' then
    if tg_op = 'DELETE' then
      select t.salon_id into sid from public.therapists t where t.id = old.therapist_id;
    else
      select t.salon_id into sid from public.therapists t where t.id = new.therapist_id;
    end if;
  else
    if tg_op = 'DELETE' then sid := old.salon_id; else sid := new.salon_id; end if;
  end if;
  if sid is not null then
    perform public.crm_bump_change_mark(sid);
  end if;
  return null;
end;
$$;

-- 4) 画面に出るものが変わる表に付ける（★ after・行ごと。何度流しても二重にならない）
do $$
declare
  t text;
begin
  foreach t in array array[
    'salon_bookings', 'therapist_schedules', 'crm_consents', 'crm_therapist_memos',
    'crm_pay_confirms', 'crm_daily_reports', 'crm_work_ends', 'crm_work_days', 'salon_customers'
  ] loop
    execute format('drop trigger if exists trg_crm_change_mark on public.%I', t);
    execute format(
      'create trigger trg_crm_change_mark after insert or update or delete on public.%I for each row execute function public.crm_change_mark_trg()',
      t
    );
  end loop;
end $$;

-- 確認（適用後に別途流す）。9行出れば OK。
-- select event_object_table, count(*) from information_schema.triggers
--  where trigger_name = 'trg_crm_change_mark' group by event_object_table order by 1;
