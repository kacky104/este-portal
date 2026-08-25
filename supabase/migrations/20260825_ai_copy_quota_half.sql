-- AI紹介文生成の月間枠を引き下げる（第35便・2026-08-25 オーナー確定）
--
-- 変更:
--   既定（無契約店）      20 → 10
--   フクエスワーク契約店  40 → 20   ※ 2026-08-25 時点の契約店は enju(1) と ラビリンス(6)
--
-- 数え方は第30便から変更なし（写真あり・なしの合算で1枠／1回のボタン押下＝1消費／
-- 失敗した回は消費しない／毎月1日(JST)にリセット／運営(ADMIN_UUID)の代行は消費しない）。
--
-- ★★★ 初版（同日）は【再実行すると壊れる】書き方だった。反省として残す。
--     update ... set = 10 where = 20;   -- 先
--     update ... set = 20 where = 40;   -- 後
--   これは「今いくつか」で判定しているので、2回流すと 40→20 になった行が
--   1文目に拾われて 10 に落ちる。実際にそうなり、enju と ラビリンスが 10 になった。
--   ★ 値の書き換えは「今の値」ではなく【どの店か】で書くこと。そうすれば何度流しても同じ結果になる。
--
-- ★★ 下の2文は冪等（何度実行しても同じ結果）。
--   ただし対象を `in (10, 20, 40)` に絞ってあるので、個別に特別な値を入れた店
--   （例: 新店舗の初期登録用に一時的に 60。v2 のコメント参照）は巻き込まない。

alter table public.salons
  alter column ai_copy_quota_text set default 10;

-- フクエスワーク契約店
update public.salons set ai_copy_quota_text = 20
 where id in (1, 6)
   and ai_copy_quota_text in (10, 20, 40);

-- それ以外
update public.salons set ai_copy_quota_text = 10
 where id not in (1, 6)
   and ai_copy_quota_text in (10, 20, 40);

comment on column public.salons.ai_copy_quota_text is
  'AI紹介文生成の月間上限（写真あり・なしの合算）。既定10。フクエスワーク契約店は20に引き上げる。0で機能停止。';

-- フクエスワーク契約店が増えたとき:
--   update salons set ai_copy_quota_text = 20 where id in (?);
-- 新店舗の初期登録を店舗自身にやってもらう場合の一時的な引き上げ:
--   update salons set ai_copy_quota_text = 60 where id = ?;   -- 埋め終わったら 10 に戻す
--
-- ★ 運営(ADMIN_UUID)の代行生成（/api/admin/therapist-copy-batch を含む）は by_admin=true で
--   記録され、この枠を消費しない。枠10回は「店舗が自分でボタンを押す回数」。

-- 適用後の確認（打つものではありません。別途 SQL Editor で流す）:
-- select id, name, ai_copy_quota_text from public.salons order by id;
--   期待: id 1(enju) と 6(ラビリンス) が 20、それ以外が 10
