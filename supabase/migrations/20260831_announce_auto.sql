-- お知らせの自動配信に要る項目（第67便・設計メモ 追記37 §192〜§193）。
-- ※ Supabase SQL Editor で実行してください（コード push より先に適用）。冪等（再実行しても安全）。
--
-- ★★★ この適用だけでは何も変わらない。
--   auto_rotate は既定 false ＝ 回す対象が1本も無い。自動配信を回す仕組みもまだ無い（§195 の4）。
--   ★ 当てても挙動は不変。先に当てておくのは、画面側が列の有無で落ちないようにするため。
--
-- ★★★ 何を守るための項目か（§191）
--   守り1  新着情報ブロックは 1店舗1件   → コード側（salonNews.ts）。DBは要らない
--   守り2  自動は1日1回だけ             → last_auto_day
--   守り3  押し直しは最短30分に1回       → last_bump_at / last_bump_fingerprint
--   ローテ  次の1本を出して1つ進める      → rotation_index

-- ============================================================
-- 1. announcements 側 ——「自動で回す」の印
-- ============================================================
alter table public.announcements
  add column if not exists auto_rotate boolean     not null default false,
  add column if not exists updated_at  timestamptz not null default now();

comment on column public.announcements.auto_rotate is
  E'自動配信のローテに乗せるか。★ 既定は false（黙って回さない）。季節外れの告知が数か月後に出るのを防ぐ（§192）。有効期限は作らない——この印1つで足りる。';

comment on column public.announcements.updated_at is
  E'最後に本文を直した日時。★ 表示のためだけ。自動配信の判定には使わない（判定は announceAuto.ts の純粋関数）。';

-- 自動配信のとき「この店の、回す対象」を数える／順に取り出すため。
-- ★ ローテの順は created_at 昇順 → id 昇順で固定する（並べ替えない・追記40 §206 と同じ理由）。
create index if not exists announcements_salon_auto_idx
  on public.announcements (salon_id, created_at, id)
  where auto_rotate = true and is_published = true;

-- ★★★ 本文の指紋（fingerprint）の列は【作らない】——§193 からの意図的なずらし。
--   §193 は「お知らせ側：本文の指紋」を項目に挙げていたが、指紋の使い道は
--   §191 守り3「押し直しか、新しく書いたか」の1つだけで、それは
--   「これから出す1本」と「前回フクエスTOPを動かした1本」を比べれば足りる。
--   ★ 列に持つと、オーナー様が本文を直したのに指紋が古いままの行が作れてしまう
--     （＝新しく書いたのに押し直し扱いで30分待たされる）。
--   ★ 保存するのは salon_announce_state.last_bump_fingerprint の1つだけ。
--     計算は src/lib/announceAuto.ts の announceFingerprint（純粋関数・自己点検あり）が正本。

-- ============================================================
-- 2. 店舗側 —— 自動配信の進み具合
-- ============================================================
-- ★★ なぜ salons に列を足さず、別の表にするか
--   salons はオーナー様が RLS で UPDATE できる。ここに last_auto_day を置くと
--   「今日ぶんを出した」を自分で消して、1日1回を破れてしまう。
--   ★ 上位表示（salon_bump）は同じ問題をトリガで塞いだが、守るものが増えるほど
--     トリガの条件が伸びる。★ **触られない場所に置くほうが短い。**
--   → この表には UPDATE / INSERT / DELETE のポリシーを1つも置かない
--     ＝サーバ側（service role）からしか書けない。SELECT だけオーナー様に開ける。
create table if not exists public.salon_announce_state (
  salon_id              bigint      primary key references public.salons(id) on delete cascade,
  last_auto_day         date,                                  -- 守り2：最終自動配信日（朝6時区切りの日・JST）
  rotation_index        integer     not null default 0,         -- ローテの現在位置（0始まり）
  last_manual_at        timestamptz,                            -- 最終手動配信日時（その日の自動スキップ判定）
  last_bump_at          timestamptz,                            -- 守り3：最後にフクエスTOPの並びを動かした時刻
  last_bump_fingerprint text,                                   -- 守り3：そのとき出した本文の指紋
  updated_at            timestamptz not null default now()
);

comment on table public.salon_announce_state is
  E'お知らせ自動配信の進み具合（第67便）。★ オーナー様は読めるが書けない（1日1回・30分の守りをすり抜けさせない）。書けるのはサーバ側だけ。';

comment on column public.salon_announce_state.last_auto_day is
  E'最終自動配信日。朝6:00〜翌5:59（JST）の区切りの日（§192）。★ salon_bump の bump_day と同じ切り方。';

comment on column public.salon_announce_state.rotation_index is
  E'次に出す1本の位置（0始まり）。★ 自動で出したときだけ1つ進む。手動では触らない（§192）。本数が減ったときは剰余で範囲に収める（nextRotationIndex）。';

comment on column public.salon_announce_state.last_manual_at is
  E'最後に手動で配信した日時。★ その日の区切り内に1回でもあれば、その日の自動は出さない・順番も進めない（§192）。★ 押したこと自体を記録する——フクエスTOPが動いたかとは別（動かなくても手動はあった）。';

comment on column public.salon_announce_state.last_bump_at is
  E'最後にフクエスTOPの新着の並びを動かした時刻。★ 守り3の30分はここから測る。押し直しで動かさなかったときは更新しない。';

comment on column public.salon_announce_state.last_bump_fingerprint is
  E'そのとき出した本文の指紋（announceAuto.ts の announceFingerprint）。★ これと違えば「新しく書いた」＝待たせずに出す（§191）。';

-- ★★★ 自動配信の時刻の列は【作らない】——§193 からの意図的なずらし。
--   §192 で決めたのは「店舗IDから割り当て・オーナー様には選ばせない」。
--   ★ 選ばせないものを列に持つと、列の値と計算の値がずれた店が作れてしまい、
--     どちらが本当か分からなくなる。設定項目が1つ増えたようにも読める。
--   → 決め方だけを置く：src/lib/announceAuto.ts の autoPostMinuteOfDay。
--     割り当て方を変えたくなったら、その1か所を直せば全店に効く。

alter table public.salon_announce_state enable row level security;

-- 読む: オーナー（自店）＋管理者。★ 画面に「今日の自動は出した／お休み」を出すため。
drop policy if exists salon_announce_state_select on public.salon_announce_state;
create policy salon_announce_state_select on public.salon_announce_state for select
  using (
    auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid
    or exists (select 1 from public.salons s where s.id = salon_id and s.owner_id = auth.uid())
  );

-- ★ 書くポリシーは置かない（service role のみ）。ここを開けると守り2・守り3が形だけになる。

-- ============================================================
-- 3. 確認用（適用後に別途流す）
-- ============================================================
-- ★ 列が付いたこと・既定が false であること（＝回す対象が0本＝挙動が変わっていない証拠）:
-- select count(*) filter (where auto_rotate) as 回す対象, count(*) as 全件 from public.announcements;
--
-- ★ 進み具合の表がまだ空であること:
-- select count(*) from public.salon_announce_state;
--
-- ★ オーナー様が書けないこと（これはエラーになるのが正しい。流さなくてよい）:
-- update public.salon_announce_state set last_auto_day = null;
