-- 第1472便（2026-10-14・カッキーさん）: コネックエフの「週間スケジュール」で入れられる日数を、店舗様が 7〜30日から選べるようにする
--
-- ★ salons に1列足すだけ（既定は今までどおり 7日）。今あるデータは変えない。何度流しても同じ結果。
-- ★ このSQLを流す前に push しても壊れない（列が読めなければ 7日のまま・日数を変えようとすると「準備がまだです」）。

alter table public.salons add column if not exists conecf_schedule_days smallint not null default 7;
alter table public.salons drop constraint if exists salons_conecf_schedule_days_check;
alter table public.salons add constraint salons_conecf_schedule_days_check check (conecf_schedule_days between 7 and 30);
comment on column public.salons.conecf_schedule_days is 'コネックエフ: 週間スケジュールで出勤を入れられる日数（7〜30・既定7）（第1472便）';

notify pgrst, 'reload schema';

-- 確認（1行・default 7 が出れば OK）
select column_name, data_type, column_default from information_schema.columns
 where table_schema = 'public' and table_name = 'salons' and column_name = 'conecf_schedule_days';
