-- AI紹介文生成の月間枠を引き下げる（第35便・2026-08-25 オーナー確定）
--
-- 変更:
--   既定（無契約店）      20 → 10
--   フクエスワーク契約店  40 → 20
--
-- 数え方は第30便から変更なし（写真あり・なしの合算で1枠／1回のボタン押下＝1消費／
-- 失敗した回は消費しない／毎月1日(JST)にリセット／運営(ADMIN_UUID)の代行は消費しない）。
--
-- ★★★ 既存行は「20 だったものを 10」「40 だったものを 20」に限って動かす。
--   倍率で一律に半分にしてはいけない。新店舗の初期登録用に一時的に 60 を入れる運用が
--   あり（v2 のコメント参照）、それを巻き込むと登録作業が途中で止まる。
--
-- ★★ 2つの update は【この順番でなければならない】。
--   40→20 を先に流すと、その行が次の 20→10 に巻き込まれて 10 になってしまう。
--   20→10 を先に済ませてから 40→20 を流すこと。

alter table public.salons
  alter column ai_copy_quota_text set default 10;

update public.salons set ai_copy_quota_text = 10 where ai_copy_quota_text = 20;  -- 先
update public.salons set ai_copy_quota_text = 20 where ai_copy_quota_text = 40;  -- 後

comment on column public.salons.ai_copy_quota_text is
  'AI紹介文生成の月間上限（写真あり・なしの合算）。既定10。フクエスワーク契約店は20に引き上げる。0で機能停止。';

-- フクエスワーク契約店の枠を20にする例（対象店舗のidを入れて実行する）:
--   update salons set ai_copy_quota_text = 20 where id in (1, 6);
-- 新店舗の初期登録を店舗自身にやってもらう場合の一時的な引き上げ例:
--   update salons set ai_copy_quota_text = 60 where id = 7;   -- 埋め終わったら 10 に戻す

-- 適用後の確認（打つものではありません。別途 SQL Editor で流す）:
-- select id, name, ai_copy_quota_text from public.salons order by id;
