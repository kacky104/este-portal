-- 中継フローの「段と段のあいだの状態」を持つ列（第41便）。
--
-- ★★★ なぜ要るか
--   出勤の更新は login → read_work → write_work → verify_work の4段。
--   段をまたいで持ち回すものがある:
--     ・セッション Cookie（login で受け取り、以降のすべてに付ける）
--     ・このフローが何をしに来たか（intent）
--     ・同じフローの段を束ねる id（監査ログを1回の処理として読めるようにする）
--   ★ これを持つ場所が無いと、read_work のジョブは「自分が誰のセッションか」を知らない。
--
-- ★★★ なぜ新しいテーブルにしなかったか
--   `(salon_id, provider, slot)` の部分ユニーク索引（status in ('queued','leased')）が
--   すでに「走っているフローは同時に1つだけ」を守っている。
--   ★ フローの行を別に作ると、その索引と新テーブルの整合を【自分で】守ることになる。
--     いまはDBが守ってくれている。守ってくれているものを手放さない。
--   ★ purge の対象も1か所のままで済む（秘密が残る場所を増やさない）。
--
-- ★★★ 中身は秘密（Cookie が入る）
--   request_enc / response_enc と同じく暗号化して入れる。AAD は 'relay|<job id>|context'。
--   → 別の行へ貼り替えても復号できない。
--   → 終わったジョブの purge で request_enc / response_enc と一緒に消すこと。

alter table public.media_relay_jobs
  add column if not exists context_enc text;

comment on column public.media_relay_jobs.context_enc is
  E'中継フローの持ち回り状態（{v,flowId,intent,cookie,startedAt}）を暗号化したもの。★ セッションCookieが入る＝秘密。purge の対象。';
