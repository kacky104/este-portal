-- 媒体側の名簿を、読んだそのままの形で置く箱（第50便）。
--
-- ★★★ なぜ要るか（設計メモ 追記18 §81 の1番目）
--   いま「駅ちかにいてフクエスにいない人」は、1日1回の取り込みの未照合からしか分からない:
--     ・最大24時間古い（追記17 §72）
--     ・★ 公開ページ経由なので、駅ちかに登録されていても公開ページに出ていない子は見えない
--   → 管理画面の一覧（/admin/girls/）を直接読めば、駅ちかの名簿そのものが取れる。
--
-- ★★★ この箱に入るのは【読んだ事実】であって、これから何かをする計画ではない。
--   media_work_plans（第44便）… これから送る計画
--   salon_media_audit（第39便）… 何が起きたかの記録（追記専用）
--   ここ                        … 相手側がいまどうなっているかの写し
--   ★ 3つを混ぜないこと。混ぜると「読んだ」と「送った」が同じ列に並ぶ。
--
-- ★★ 店舗×媒体×枠につき【最新1件だけ】上書きで持つ（media_work_plans と同じ考え方）。
--   ・名前が並ぶ表を何十件も残さない
--   ・履歴が要るのは「何をしたか」＝監査ログのほう
--   ・★ 名簿は「いまどうなっているか」だけが意味を持つ。古い写しに用は無い
--
-- ★ 枠は他の媒体テーブルと同じ (salon_id, provider, slot)（第37・38・42便）。

create table if not exists public.media_roster_snapshots (
  salon_id   bigint      not null references public.salons(id) on delete cascade,
  provider   text        not null,
  slot       smallint    not null default 1,

  -- いつ・どの一連の処理で読んだか（監査ログと突き合わせるため）
  flow_id    uuid,
  read_at    timestamptz not null default now(),

  -- ★ 人数は列で持つ。画面が jsonb を開かずに件数を出せるように（media_work_plans と同じ）
  total      integer     not null,

  -- entries: [{ castId, name, workState }]
  --   castId    … 駅ちかの番号。★ 管理画面の girl_id ＝ 公開ページの番号（追記18 §77 で3か所一致）
  --   workState … 'today' | 'unknown' | null
  --     ★★ これは【出勤の状態】であって公開/非公開ではない。
  --       一覧の凡例（実測）:「赤：即ヒメ!! ピンク：現在出勤中 ブルー：本日出勤」
  --       ★ 駅ちかの管理画面に「公開/非公開」に当たるものは見当たらない（追記18 §78-3）。
  entries    jsonb       not null default '[]'::jsonb,

  primary key (salon_id, provider, slot)
);

-- ★★ salon_media_credentials / media_work_plans と同じ扱い。
--   RLS 有効・ポリシーなし・anon/authenticated に GRANT なし ＝ service_role からのみ読める。
--   画面へは Server Action（オーナー検証つき）を通してしか出さない。
alter table public.media_roster_snapshots enable row level security;
revoke all on public.media_roster_snapshots from anon, authenticated;

comment on table public.media_roster_snapshots is
  '媒体側の名簿の写し（店舗×媒体×枠につき最新1件を上書き）。★ 読んだ事実であって、送る計画でも送った記録でもない（第50便）。';

comment on column public.media_roster_snapshots.total is
  E'読んだ時点で媒体側にいた人数。★ 0は入らない（0人なら読み取りを失敗として扱い、この行を書かない）。';

comment on column public.media_roster_snapshots.entries is
  E'[{castId,name,workState}]。castId は管理画面の girl_id（=公開ページの番号）。workState は出勤の状態であって公開/非公開ではない。';

-- 確認用（適用後に別途流す）
-- select count(*) as ok from information_schema.tables
--  where table_schema='public' and table_name='media_roster_snapshots';
-- select salon_id, provider, slot, total, read_at from public.media_roster_snapshots
--  order by read_at desc;
