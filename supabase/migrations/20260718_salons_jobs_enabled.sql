-- フクエスワーク（求人）の掲載可否フラグ。別オプション契約制のため既定は false（求人タブ非表示）。
-- /admin のサロン編集で店舗ごとに ON/OFF。ON の店舗だけ /mypage に「求人」タブが出る。
-- Supabase ダッシュボードの SQL Editor で全文を実行してください（冪等・再実行可）。

alter table public.salons add column if not exists jobs_enabled boolean not null default false;

-- 移行措置：既に salon_jobs に求人がある店舗（＝現にフクエスワーク掲載中）は契約済みとみなして自動ON。
-- 既存の掲載店を止めないため。1回実行すればOK（再実行しても結果は同じ）。
update public.salons s
   set jobs_enabled = true
 where s.jobs_enabled = false
   and exists (select 1 from public.salon_jobs j where j.salon_id = s.id);
