-- 予約の時間帯の重なりをDB側で禁止する（2026-08-16 / 第16便）
--
-- ── なぜ入れるか ────────────────────────────────────────────
-- これまでの守りは UNIQUE(therapist_id, slot_start) だけだった。これは
-- 【開始時刻が完全に一致した場合】しか止められない。
--
-- アプリ側は「① 重なりを SELECT でチェック → ② INSERT/UPDATE」という2クエリ構成で、
-- 間にトランザクションが無い。①と②の隙間に別の予約が割り込むと、両方が「空いている」と
-- 判断して両方書き込まれる（TOCTOU）。
--   例）13:00-14:00 と 13:30-14:30 が同時に来る
--       → 開始時刻が違うので UNIQUE に引っかからず、二重予約が成立する
--
-- 2026-08-16 に PostgreSQL 16 で実機再現済み。制約なしでは2件とも INSERT され、
-- この制約を入れると2件目が拒否されることを確認した。
--
-- ── なぜ EXCLUDE なのか ─────────────────────────────────────
-- アプリ側をトランザクション化する手もあるが、Supabase の PostgREST 経由では
-- 複数クエリを1トランザクションに束ねられない（RPC を書く必要がある）。
-- DB の制約で表現すれば、ネット予約・手入力・移動・編集の【すべての経路】が
-- 自動的に守られる。経路が増えても入れ忘れが起きない。
--
-- ── 適用前に必ず確認すること ────────────────────────────────
-- 既存データに1組でも重なりがあると、この ALTER は失敗する。先に下のクエリで0件を確認する。
-- （2026-08-16 の適用時は 0件だった）
--
--   select a.id, b.id, a.therapist_id, a.slot_start, a.slot_end, b.slot_start, b.slot_end
--   from salon_bookings a
--   join salon_bookings b
--     on a.therapist_id = b.therapist_id
--    and a.id < b.id
--    and a.status <> 'cancelled' and b.status <> 'cancelled'
--    and a.therapist_id is not null
--    and tstzrange(a.slot_start, a.slot_end, '[)') && tstzrange(b.slot_start, b.slot_end, '[)')
--   order by a.slot_start;
--
-- ── 仕様 ────────────────────────────────────────────────────
--   ・'[)'（半開区間）にしてあるので、14:00 終了の次に 14:00 開始の連続予約は【通る】。
--     '[]' にすると連続予約が弾かれてしまう。ここは変えないこと。
--   ・status='cancelled' は対象外。キャンセル枠の再利用を妨げないため
--     （アプリ側も INSERT 前に cancelled 行を掃除している）。
--   ・therapist_id IS NULL（フリー客レーン）は対象外。担当未定のお客様が
--     同時間帯に複数いてよいかは運用判断なので、いまは塞いでいない。
--     塞ぐ場合は salon_id で同様の EXCLUDE を別途足す。
--   ・slot_end にはインターバル（salons.default_interval_min）が織り込まれている。
--     つまり「コース時間＋インターバル」の範囲で重なりを見る。これは意図どおり。
--
-- ── コード側の対応（同時に入れること）──────────────────────
-- EXCLUDE 制約の違反コードは 23505 ではなく【23P01】。
-- src/app/actions/booking.ts の isSlotConflictError() で両方を拾うようにしてある。
-- これが無いと利用者の画面に生のDBメッセージが出る。
--
-- ★ Supabase ダッシュボードの SQL Editor で実行してください。

-- 整数カラム（therapist_id）を GiST インデックスの = で使うために必要。
create extension if not exists btree_gist with schema extensions;

alter table public.salon_bookings
  drop constraint if exists salon_bookings_no_overlap;

alter table public.salon_bookings
  add constraint salon_bookings_no_overlap
  exclude using gist (
    therapist_id with =,
    tstzrange(slot_start, slot_end, '[)') with &&
  )
  where (status <> 'cancelled' and therapist_id is not null);

comment on constraint salon_bookings_no_overlap on public.salon_bookings is
  '同一セラピストの予約時間帯が重なることを禁止する。半開区間なので連続予約は可。cancelled とフリー客(therapist_id IS NULL)は対象外。違反コードは 23P01。';

-- 確認用（実行後に別途流す）。
-- select conname, pg_get_constraintdef(oid)
-- from pg_constraint
-- where conrelid = 'public.salon_bookings'::regclass and contype = 'x';
