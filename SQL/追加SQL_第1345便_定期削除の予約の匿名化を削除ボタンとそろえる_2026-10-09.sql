-- 追加SQL_第1345便: フクエスCRM の定期削除（crm_purge_old_data）で、古い予約の匿名化を「削除」ボタン（第1220便）とそろえる 2026-10-09
-- ★ 2026-10-09 点検#8:
--   いま: 8年を過ぎた予約を customer_tel = '0000000000' にし、customer_id は残す。条件が「'0000000000' でない行」なので、
--        削除ボタンで '' にした予約（第1220便）を毎晩もう一度 '0000000000' に書き換え続ける（無駄な更新＋CSV 書き出しに '0000000000' が出る）。
--   これから: customer_tel = ''・customer_id = null（削除ボタンと同じ）。条件は「まだ匿名化していない行」。
-- ★ 作り: いま DB に入っている関数の中身をそのまま読み、update の2行だけ置き換えて入れ直す（第1256便と同じ）。
--        想定の文が見つからないときは何も変えずにエラーで止まる。8年・cron・権限はそのまま。
-- ★ 戻し方: 2) の old と new を入れ替えて流す。

-- 1) 流す前の確認（両方 true なら想定どおり）
select
  position('''0000000000''' in d) > 0 as has_0000000000,
  position('interval ''8 years''' in d) > 0 as is_8_years
from (select pg_get_functiondef('public.crm_purge_old_data()'::regprocedure) as d) x;

-- 2) 置き換えて入れ直す
do $$
declare
  d text := pg_get_functiondef('public.crm_purge_old_data()'::regprocedure);
  old1 text := 'set customer_name = ''削除済み'', customer_tel = ''0000000000'', note = null';
  new1 text := 'set customer_name = ''削除済み'', customer_tel = '''', customer_id = null, note = null';
  old2 text := 'where slot_start < cut and customer_tel is distinct from ''0000000000''';
  new2 text := 'where slot_start < cut and (customer_tel <> '''' or customer_id is not null or customer_name is distinct from ''削除済み'' or note is not null)';
begin
  if position(old1 in d) = 0 or position(old2 in d) = 0 then
    raise exception '関数の中に想定の update 文が見つかりません（中身が想定と違うので変えません）';
  end if;
  d := replace(d, old1, new1);
  d := replace(d, old2, new2);
  execute d;
end $$;

-- 3) 流したあとの確認（has_0000000000 = false・sets_customer_id_null = true・is_8_years = true）
select
  position('''0000000000''' in d) > 0 as has_0000000000,
  position('customer_id = null' in d) > 0 as sets_customer_id_null,
  position('interval ''8 years''' in d) > 0 as is_8_years
from (select pg_get_functiondef('public.crm_purge_old_data()'::regprocedure) as d) x;

-- 4) 権限が残っているか（anon/authenticated に出ていなければ空）
select grantee, privilege_type
from information_schema.routine_privileges
where routine_schema = 'public' and routine_name = 'crm_purge_old_data' and grantee in ('anon', 'authenticated', 'PUBLIC');

-- 5) いま '0000000000' のままの予約（過去に定期削除で匿名化した分）を、削除ボタンと同じ形にそろえる
--    ★ 見るだけ → 件数を見てから update。8年前より古い予約は今の時点では無いはずなので 0 件の見込み
select count(*) from public.salon_bookings where customer_tel = '0000000000';
-- update public.salon_bookings set customer_tel = '', customer_id = null where customer_tel = '0000000000';
