-- 試し打ちの結果（駅ちかへ反映したらこう変わる、という計画）を置く箱（第44便）。
--
-- ★★★ なぜ要るか
--   第43便で試し打ちは動いたが、残していたのは監査ログの【件数だけ】だった。
--   「変更12件」と言われても、人は承認できない。**どの子のどの日がどう変わるか**が要る。
--   設計メモ §11-3:「切り替え直後の1回目は、必ず試し打ち（差分を見せる）→ 人が承認」。
--   ★ この便は「見せる」まで。承認と送信は次便。
--
-- ★★★ なぜ監査ログ（salon_media_audit.detail）に入れないか
--   detail は【件数を入れる自由な入れ物】で、scrubAuditDetail が長い値や秘密らしきものを落とす。
--   差分には女性の名前と出勤時刻が並ぶ。落とされるか、落とされずに監査ログが太るかのどちらかで、
--   ★ どちらも良くない。**監査ログは「何が起きたか」、計画は「これから何をするか」。別の箱にする。**
--
-- ★★ 1店舗1媒体1枠につき【最新の1件だけ】持つ（主キーがそのまま (salon_id, provider, slot)）。
--   ・送っていない計画を貯める意味が無い（履歴が要るのは「送った結果」＝監査ログのほう）
--   ・★ 女性の名前と出勤が並ぶ表を、何十件も残さない。上書きなら常に1件で済む
--   ・第38便の「終わったジョブの中身は消す」と同じ考え方
--
-- ★ 枠は他の媒体テーブルと同じ (salon_id, provider, slot)（第37便・第38便・第42便）。

create table if not exists public.media_work_plans (
  salon_id      bigint      not null references public.salons(id) on delete cascade,
  provider      text        not null,
  slot          smallint    not null default 1,

  -- いつ・どの一連の処理で作った計画か（監査ログと突き合わせるため）
  flow_id       uuid,
  created_at    timestamptz not null default now(),

  -- ── 見出しに使う要約（画面が jsonb を開かずに済むように列で持つ）──
  sendable      boolean     not null,               -- 止める理由が無いか
  targets       integer     not null,               -- ★ 突き合わせた人数。0なら「比較できていない」
  active_shifts integer     not null,               -- フクエス側で出勤になっている行の数
  change_count  integer     not null,
  field_count   integer     not null,
  date_labels   text[]      not null default '{}',  -- 駅ちかの7日ぶんの日付見出し
  counts_before integer[]   not null default '{}',  -- 日別の出勤人数（いまの駅ちか）
  counts_after  integer[]   not null default '{}',  -- 日別の出勤人数（送ったあと）

  -- ── 中身 ──
  -- diff:     [{ girlId, name, dayIndex, before, after }]
  -- blockers: [{ kind, detail, count? }]  ★ 送らない理由
  -- notes:    [{ kind, detail, count? }]  ★ 送るが伝えること
  diff          jsonb       not null default '[]'::jsonb,
  blockers      jsonb       not null default '[]'::jsonb,
  notes         jsonb       not null default '[]'::jsonb,

  primary key (salon_id, provider, slot)
);

-- ★★ salon_media_credentials / therapist_diary_forward と同じ扱い。
--   RLS 有効・ポリシーなし・anon/authenticated に GRANT なし ＝ service_role からのみ読める。
--   画面へは Server Action（オーナー検証つき）を通してしか出さない。
alter table public.media_work_plans enable row level security;
revoke all on public.media_work_plans from anon, authenticated;

comment on table public.media_work_plans is
  '試し打ちの結果（媒体へ反映したらどう変わるか）。店舗×媒体×枠につき最新1件だけを上書きで持つ。★ まだ送っていない計画であって、送った記録ではない（送った記録は salon_media_audit・第44便）。';

comment on column public.media_work_plans.targets is
  E'突き合わせた人数。★ 0のときは「一致した」ではなく「比較できていない」。change_count=0 の意味がこの列でしか読めない（第43便-b）。';

comment on column public.media_work_plans.diff is
  E'変わるセルの一覧 [{girlId,name,dayIndex,before,after}]。dayIndex は date_labels の添え字。★ 送信前の計画なので、実際に送った内容の記録ではない。';

comment on column public.media_work_plans.blockers is
  E'送らない理由。空なら sendable=true。★ 画面ではここを最初に出すこと（人が承認する前に見るべきものだから）。';

-- 確認用（適用後に別途流す）
-- select count(*) as ok from information_schema.tables
--  where table_schema='public' and table_name='media_work_plans';
-- select salon_id, provider, slot, sendable, targets, change_count, created_at
--   from public.media_work_plans order by created_at desc;
