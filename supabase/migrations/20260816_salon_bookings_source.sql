-- 予約の【入り口】を記録する source 列（2026-08-16 / 第17便）
--
-- ── なぜ入れるか ────────────────────────────────────────────
-- /mypage「ネット予約」タブの予約一覧を、お客様がフォームから入れた予約（＝店に通知メールが
-- 飛んだ予約）だけに絞りたい。予約ボードでオーナーが手入力した電話予約は一覧に出さない。
--
-- ところが、これまでの列だけでは【両者を確実に区別できなかった】。
--   ・status    … 作成時は new / confirmed で分かれるが、オーナーが確定・キャンセルすると変わる
--   ・callback_pref … ネット予約でも未選択なら 'none'。手入力も 'none'。同じ値になる
--   ・course_name   … 手入力でコース名を入れれば、ネット予約と見分けがつかない
--   ・therapist_id IS NULL（フリー客）は手入力限定だが、手入力のうちの一部でしかない
-- src/app/actions/booking.ts の旧コメントにも「callback_pref では区別を付けない」と書いてあった。
-- 推測で判定する仕組みを増やすより、入り口そのものを1列で持たせるほうが壊れない。
--
-- ── 値 ──────────────────────────────────────────────────────
--   'web'    … src/app/actions/booking.ts の createBooking()
--              ＝お客様が /salon/[id]/book のフォームから入れた予約。通知メールが飛ぶ。
--   'manual' … 同 createManualBooking()
--              ＝オーナーが /mypage の予約ボードに直接書いた予約（電話予約など）。メールは飛ばない。
--
-- ── 既存データ（バックフィル）────────────────────────────────
-- 適用前に本番を実測したところ salon_bookings は【0件】だった（2026-08-16）。
--   select count(*) from salon_bookings;  -- → 0
-- よってバックフィルは不要。既存行があるうちに流す場合は、下の「注意」を読むこと。
--
-- ★ 注意：default を 'web' にしてあるので、既存行はすべて 'web'（＝一覧に出る）になる。
--   これは意図的。取りこぼして【ネット予約が一覧から消える】ほうが、
--   手入力が数件混ざって見えるより害が大きいため（店が予約を見落とす）。
--
-- ── 適用の順番 ★第16便の禁則60とは逆 ────────────────────────
-- 制約を足すときは「コードを先にデプロイ → あとから制約」だった。これは
-- 制約が書き込みを弾く側だから。今回は【追加列】で、新しいコードが列の存在に依存する。
--   ・先に列 → 古いコードのままでも INSERT は通る（default 'web' が入るだけ）
--   ・先にコード → source 列が無いので INSERT が全部失敗する（予約が取れなくなる）
-- したがって【この SQL を先に流し、そのあとコードをデプロイする】。
--
-- ★ Supabase ダッシュボードの SQL Editor で実行してください。

alter table public.salon_bookings
  add column if not exists source text not null default 'web';

alter table public.salon_bookings
  drop constraint if exists salon_bookings_source_check;

alter table public.salon_bookings
  add constraint salon_bookings_source_check
  check (source in ('web', 'manual'));

comment on column public.salon_bookings.source is
  '予約の入り口。web＝お客様のネット予約(createBooking・通知メールあり) / manual＝予約ボードへの手入力(createManualBooking)。/mypage の予約一覧は web のみ表示する。';

-- 予約一覧は (salon_id, source) で絞って slot_start の降順に読む。
create index if not exists salon_bookings_salon_source_slot_idx
  on public.salon_bookings (salon_id, source, slot_start desc);

-- 確認用（実行後に別途流す）。
-- select source, count(*) from public.salon_bookings group by source order by source;
