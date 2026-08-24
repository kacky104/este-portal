-- AI紹介文生成の枠を一本化＋運営代行の無制限化（第30便・2026-08-24 オーナー確定）
--
-- 変更点:
--   1) 写真あり／なしで枠を分けるのをやめ、合算で1つの枠にする。
--      → 使うのは salons.ai_copy_quota_text のみ（既定20 / フクエスワーク契約店は40）。
--      → ai_copy_quota_image は使わなくなるが、将来「画像だけ別枠」に戻せるよう列は残す。
--   2) 運営（ADMIN_UUID）が代行で作った分は枠を消費しない。
--      新店舗の初期設定を運営が代行する場面（enjuの53名と同じやり方）で必要。
--      ただし原価の把握のためログには残すので、集計から外す印として by_admin を持たせる。

alter table ai_copy_usage
  add column if not exists by_admin boolean not null default false;

comment on column ai_copy_usage.by_admin is
  '運営（ADMIN_UUID）が代行生成した行。原価把握のため記録は残すが、店舗の月間枠には数えない。';

-- 枠の集計は by_admin = false の行だけを見るので、その索引に寄せる。
drop index if exists ai_copy_usage_salon_created_idx;
create index if not exists ai_copy_usage_quota_idx
  on ai_copy_usage (salon_id, created_at desc)
  where by_admin = false;

comment on column salons.ai_copy_quota_text is
  'AI紹介文生成の月間上限（写真あり・なしの合算）。既定20。フクエスワーク契約店は40に引き上げる。0で機能停止。';
comment on column salons.ai_copy_quota_image is
  '【現在未使用】第30便で枠を合算方式に変更したため参照していない。将来「写真ありだけ別枠」に戻す場合に使う。';

-- フクエスワーク契約店の枠を40にする例（対象店舗のidを入れて実行する）:
--   update salons set ai_copy_quota_text = 40 where id in (1, 6);
-- 新店舗の初期登録を店舗自身にやってもらう場合の一時的な引き上げ例:
--   update salons set ai_copy_quota_text = 60 where id = 7;   -- 埋め終わったら 20 に戻す
