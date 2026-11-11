-- 第1384便（2026-10-10・カッキーさん）: コネックエフのセラピストの並び順（つまんで並べ替え）を覚える表
--
-- ★ 何のため: コネックエフのセラピスト一覧で、よく操作する方を上に置きたい（店舗様のご要望）。
--   セラピスト登録状況一覧・週間スケジュールも同じ順で出す。
-- ★ 作り: 店ごとに1行。therapist_ids に、公開中の方の id を【上から順に】入れる。
--   ・この並びに入っていない公開中の方（＝新しく登録した方）は、いちばん上に出す（カッキーさんの決定）。
--   ・非公開の方は今までどおり下にまとめる（あいうえお順）。
--   ・行が無い店（まだ並べ替えたことが無い店）は、今までどおり あいうえお順。
-- ★ therapists の表には触らない（列も足さない）。
--   therapists の行を書き換えると updated_at が動き、サイトマップの更新日などに響くため、別の表にした。
-- ★ 変わるのはコネックエフの中の並びだけ。フクエスの店舗ページ・駅ちか・エステ魂の並びには関係しない。
-- ★ service_role 専用（画面からは直接読めない・書けない。サーバーの受け口だけが使う）。
-- ★ このSQLを流す前にコード（第1384便）を push しても壊れない
--   （表が無ければ今までどおり あいうえお順で出る。並べ替えたときだけ「追加SQLがまだ」と出る）。
-- ★ 何度流しても同じ結果（if not exists）。

create table if not exists public.conecf_girl_order (
  salon_id      bigint      primary key references public.salons(id) on delete cascade,
  therapist_ids bigint[]    not null default '{}',
  updated_at    timestamptz not null default now()
);

comment on table public.conecf_girl_order is
  E'コネックエフ: セラピストの並び順（第1384便）。店ごとに1行。therapist_ids ＝ 公開中の方の id を上から順に。★ 入っていない公開中の方はいちばん上・非公開の方は下。★ 行が無ければ あいうえお順。★ service_role 専用';

alter table public.conecf_girl_order enable row level security;
revoke all on public.conecf_girl_order from anon, authenticated;

-- 確認（適用後に別途流す）。1行出て rls が true なら OK。
-- select relname, relrowsecurity as rls from pg_class where relname = 'conecf_girl_order';
-- 中身（並べ替えたあと）:
-- select salon_id, array_length(therapist_ids, 1) as 人数, updated_at from public.conecf_girl_order;
