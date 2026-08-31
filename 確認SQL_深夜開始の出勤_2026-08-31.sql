-- §272 の宿題：開始が 00:00〜05:59 の出勤が実データに何件あるか。
-- ★ SELECT だけ。1行も書き替えません。
-- ★★ Supabase の SQL Editor は【最後の1本の結果しか出さない】ので、1本にまとめました。
--    まず【A】を丸ごと流し、必要なら【B】を別に流してください。

-- ══════════════ A：これだけ流せば全部わかる ══════════════
with base as (
  select *
  from public.therapist_schedules
  where is_active = true
),
ok as (  -- 時刻の形が読める行だけ
  select *,
         split_part(start_time, ':', 1)::int as h,
         split_part(start_time, ':', 2)::int as mi
  from base
  where start_time ~ '^\d{1,2}:\d{2}'
)
select * from (
  -- ⓪ 時刻の「形」（★ ここが揃っていないと、以下の数が信用できない）
  select 1 as 並び, '⓪ 全件'                as 項目, count(*)::text as 値 from base
  union all
  select 1, '⓪ 形が読める（H:MM / HH:MM）', count(*)::text from ok
  union all
  select 1, '⓪ ★ 形が読めない・空',
         ((select count(*) from base) - (select count(*) from ok))::text
  union all
  -- ① 深夜開始（00:00〜05:59）
  select 2, '① 深夜開始の枠（全期間）',   count(*)::text from ok where h < 6
  union all
  select 2, '① 深夜開始（今日以降）',     count(*)::text from ok where h < 6 and schedule_date >= current_date
  union all
  select 2, '① 深夜開始（人数）',         count(distinct therapist_id)::text from ok where h < 6
  union all
  -- ③ 開始の「時」の分布（直近30日）
  select 3, '③ 開始 ' || lpad(h::text, 2, '0') || '時台', count(*)::text
  from ok where schedule_date >= current_date - 30 group by h
  union all
  -- ④ 開始の「分」の分布（直近30日）★ 第73便の「寄せる」が効く件数
  select 4, '④ 開始 ' || lpad(mi::text, 2, '0') || '分', count(*)::text
  from ok where schedule_date >= current_date - 30 group by mi
  union all
  -- ⑤ ★ 終了の「分」の分布（直近30日）。★ 開始が0/30でも終了が15/45なら寄せは効く
  select 5, '⑤ 終了 ' || lpad(split_part(end_time, ':', 2)::int::text, 2, '0') || '分', count(*)::text
  from ok
  where schedule_date >= current_date - 30
    and end_time ~ '^\d{1,2}:\d{2}'
  group by split_part(end_time, ':', 2)::int
  union all
  -- ⑥ ★ 営業時間（salons.hours）に15分・45分があるか。
  --    ★ 出勤と同じピッカーを使っているので、30分刻みにすると営業時間にも効く
  select 6, '⑥ 営業時間に :15 か :45 を含む店', count(*)::text
  from public.salons where hours ~ ':(15|45)'
  union all
  select 6, '⑥ 営業時間が入っている店', count(*)::text
  from public.salons where hours is not null and hours <> ''
) t
order by 並び, 項目;

-- ══════════════ B：深夜開始の中身を見る（Aで①が0件なら不要） ══════════════
-- select ts.schedule_date, ts.start_time, ts.end_time, th.name as セラピスト, s.name as 店舗
-- from public.therapist_schedules ts
-- join public.therapists th on th.id = ts.therapist_id
-- join public.salons     s  on s.id  = th.salon_id
-- where ts.is_active = true
--   and ts.start_time ~ '^\d{1,2}:\d{2}'
--   and split_part(ts.start_time, ':', 1)::int < 6
-- order by ts.schedule_date desc, ts.start_time
-- limit 50;
