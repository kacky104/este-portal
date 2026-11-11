-- 追加SQL_第1363便: 予約の支払いの内訳（カード 20,000＋現金 5,000 のように分ける）2026-10-10（店舗様の要望・カッキーさん）
-- ★ salon_bookings に payment_split jsonb を1列足すだけ。例: [{"method":"カード","amount":20000},{"method":"現金","amount":5000}]
-- ★ 今の payment_method（文字）は残す。1つの方法なら今までどおりその名前、分けたときは「カード＋現金」が入る（既存の表示・CSV・日報の「うち現金」はそのまま動く）。
-- ★ 先に push されても壊れない（列が無いと読み取りは null → 内訳なし扱い。書き込みは「分けた」ときだけ列に触る）。
-- ★ 何度流しても同じ結果。戻し方: alter table public.salon_bookings drop column if exists payment_split;

-- 1) 足す
alter table public.salon_bookings add column if not exists payment_split jsonb;
comment on column public.salon_bookings.payment_split is 'フクエスCRM: 支払いの内訳（第1363便）。[{"method":"カード","amount":20000},...]。1つの方法のときは null（payment_method で足りる）';

-- 2) 確認（1行出れば OK）
select column_name, data_type from information_schema.columns
 where table_schema = 'public' and table_name = 'salon_bookings' and column_name = 'payment_split';

notify pgrst, 'reload schema';
