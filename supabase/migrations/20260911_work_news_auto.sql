-- 求人の新着情報（work_news）の自動配信に要る項目（第274便・2026-09-11・カッキーさんの指示）。
-- ※ Supabase SQL Editor で実行してください（コード push より先に適用）。冪等（再実行しても安全）。
--
-- ★★★ この適用だけでは何も変わらない。
--   auto_rotate は既定 false ＝ 回す対象が1本も無い。★ 店舗が印を付けるまで、周が回っても0件。
--   ★ 先に当てておくのは、画面側が列の有無で落ちないようにするため。
--
-- ★★ 形はフクエス側のお知らせ（20260831_announce_auto.sql）とまったく同じにしてある。
--   ★ 判定も同じ純粋関数（src/lib/announceAuto.ts）を使う。★ 2つの仕組みを持たない。
--   守り  自動は1日1回だけ        → last_auto_day
--   ローテ 次の1本を出して1つ進める → rotation_index

-- ============================================================
-- 1. work_news 側 ——「自動で回す」の印
-- ============================================================
alter table public.work_news
  add column if not exists auto_rotate boolean not null default false;

comment on column public.work_news.auto_rotate is
  E'自動配信のローテに乗せるか。★ 既定は false（黙って回さない）。季節外れの告知が数か月後に出るのを防ぐ。有効期限は作らない——この印1つで足りる。';

-- 自動配信のとき「この店の、回す対象」を数える／順に取り出すため。
-- ★ ローテの順は created_at 昇順 → id 昇順で固定する（並べ替えない）。
create index if not exists work_news_salon_auto_idx
  on public.work_news (salon_id, created_at, id)
  where auto_rotate = true and is_published = true;

-- ============================================================
-- 2. 店舗側 —— 自動配信の進み具合
-- ============================================================
-- ★★ なぜ salons に列を足さず、別の表にするか
--   salons はオーナー様が RLS で UPDATE できる。ここに last_auto_day を置くと
--   「今日ぶんを出した」を自分で消して、1日1回を破れてしまう。
--   → この表には UPDATE / INSERT / DELETE のポリシーを1つも置かない
--     ＝サーバ側（service role）からしか書けない。SELECT だけオーナー様に開ける。
create table if not exists public.salon_work_news_state (
  salon_id              bigint      primary key references public.salons(id) on delete cascade,
  last_auto_day         date,                                  -- 最終自動配信日（朝6時区切りの日・JST）
  rotation_index        integer     not null default 0,        -- ローテの現在位置（0始まり）
  last_manual_at        timestamptz,                           -- 最終手動配信日時（その日の自動スキップ判定）
  last_bump_at          timestamptz,                           -- 最後に求人ページの並びを動かした時刻
  last_bump_fingerprint text,                                  -- そのとき出した本文の指紋
  updated_at            timestamptz not null default now()
);

comment on table public.salon_work_news_state is
  E'求人の新着情報（work_news）の自動配信の進み具合（第274便）。★ オーナー様は読めるが書けない（1日1回の守りをすり抜けさせない）。書けるのはサーバ側だけ。★ フクエス側は salon_announce_state・こちらは別表（2つの新着は別物）。';

comment on column public.salon_work_news_state.last_auto_day is
  E'最終自動配信日。朝6:00〜翌5:59（JST）の区切りの日。★ salon_announce_state と同じ切り方（announceAuto.ts の dayKeyJST）。';

comment on column public.salon_work_news_state.rotation_index is
  E'次に出す1本の位置（0始まり）。★ 自動で出したときだけ1つ進む。★ 本数が減ったときは剰余で範囲に収める（nextRotationIndex）。';

comment on column public.salon_work_news_state.last_manual_at is
  E'最後に手動で配信した日時。★ その日の区切り内に1回でもあれば、その日の自動は出さない・順番も進めない。';

alter table public.salon_work_news_state enable row level security;

-- 読む: オーナー（自店）＋管理者。
drop policy if exists salon_work_news_state_select on public.salon_work_news_state;
create policy salon_work_news_state_select on public.salon_work_news_state for select
  using (
    auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid
    or exists (select 1 from public.salons s where s.id = salon_id and s.owner_id = auth.uid())
  );

-- ★ 書くポリシーは置かない（service role のみ）。ここを開けると1日1回の守りが形だけになる。

-- ============================================================
-- 3. 確認用（適用後に別途流す）
-- ============================================================
-- ★ 列が付いたこと・既定が false であること（＝回す対象が0本＝挙動が変わっていない証拠）:
-- select count(*) filter (where auto_rotate) as 回す対象, count(*) as 全件 from public.work_news;
--
-- ★ 進み具合の表がまだ空であること:
-- select count(*) from public.salon_work_news_state;
