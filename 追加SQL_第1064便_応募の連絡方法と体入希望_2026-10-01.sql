-- 第1064便（2026-10-01）: 求人応募に「希望の連絡方法」「体験入店希望」を足す
--
-- ★ カッキーさん決定: 電話番号は必須のまま。体入は希望の有無だけ（希望日は聞かない）。
-- ★ 既存の応募行は contact_method='tel'・wants_trial=false になる（今までどおり電話で連絡、の意味）。
-- ★ このSQLを流してから、コード（第1064便）を push すること。逆順だと応募の保存が失敗する。

alter table public.job_applications
  add column if not exists contact_method text not null default 'tel',
  add column if not exists contact_value  text,
  add column if not exists wants_trial    boolean not null default false;

alter table public.job_applications
  drop constraint if exists job_applications_contact_method_check;
alter table public.job_applications
  add constraint job_applications_contact_method_check
  check (contact_method in ('tel', 'sms', 'line', 'email'));

comment on column public.job_applications.contact_method is
  '希望の連絡方法: tel=電話 / sms=SMS（ショートメール）/ line=LINE / email=メール（第1064便）';
comment on column public.job_applications.contact_value is
  'LINE ID またはメールアドレス（contact_method が line / email のときだけ入る）。tel / sms は tel 列を使うので null';
comment on column public.job_applications.wants_trial is
  '体験入店を希望する（第1064便）';

-- 確認（3列が出れば OK）
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'job_applications'
  and column_name in ('contact_method', 'contact_value', 'wants_trial');
