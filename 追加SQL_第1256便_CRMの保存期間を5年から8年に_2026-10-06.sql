-- 追加SQL 第1256便（2026-10-06・カッキーさんの決定）: フクエスCRM の個人情報の保存期間を 一律5年 → 一律8年 に。
--
-- ★ 変えるもの: 毎日 3:00（JST）に動く片づけの関数 public.crm_purge_old_data の「何年前より古いものを消すか」だけ。
--     同意書（crm_consents）・顧客台帳（salon_customers）・予約の名前／電話／備考（salon_bookings）の3つとも同じ線を使っている。
-- ★ 変えないもの: 解約した店を90日後に消す決まり（crm_purge_ended_salons）・毎日 3:00 の予定（cron）・関数の権限・表。
-- ★ 作り: いま DB に入っている関数の中身をそのまま読み、interval '5 years' の1か所だけを '8 years' に置き換えて入れ直す。
--     （リポジトリの写しから作り直さない＝もし DB 側があとで直されていても、その直しを消さない）
--     5 years が見つからないときは何も変えずにエラーで止まる。すでに 8 years なら何もしない。
-- ★ 順番: push の前でも後でもよい。いま 5年より古いデータは無いので、流すまでのあいだに消えるものは無い。
-- ★ 戻し方: 下の 2) の '5 years' と '8 years' を入れ替えて流す。

-- 1) 流す前の確認（has_5_years が true なら想定どおり）
select position('interval ''5 years''' in pg_get_functiondef('public.crm_purge_old_data()'::regprocedure)) > 0 as has_5_years;

-- 2) 変更
do $$
declare
  d text;
begin
  d := pg_get_functiondef('public.crm_purge_old_data()'::regprocedure);
  if position('interval ''8 years''' in d) > 0 then
    raise notice 'すでに 8年です（何もしません）';
    return;
  end if;
  if position('interval ''5 years''' in d) = 0 then
    raise exception '関数の中に interval ''5 years'' が見つかりません（中身が想定と違うので変えません）';
  end if;
  execute replace(d, 'interval ''5 years''', 'interval ''8 years''');
end $$;

-- 3) 流したあとの確認（now_8_years が true・cron は 0 18 * * * ・ active = true のまま）
select position('interval ''8 years''' in pg_get_functiondef('public.crm_purge_old_data()'::regprocedure)) > 0 as now_8_years;
select jobname, schedule, active from cron.job where jobname = 'crm-purge-old-data';
