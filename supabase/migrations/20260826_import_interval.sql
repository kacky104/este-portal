-- 取り込み間隔を店舗ごとに持たせる（第36便・100店規模への備え）
--
-- ★★★ なぜ要るか
--   第36便で crontab を15分間隔に上げた（5,20,35,50）。6店なら1周7リクエスト＝28件/時で
--   今朝の1/12だが、店舗が増えると総量は比例して増える。実測からの見積もり:
--     100店・毎時     … 約110件/時
--     100店・15分ごと … 約440件/時   ← 今朝（343件/時）より重い
--   **守るべきは「頻度」ではなく「総量」**（禁則271）。店舗が増えたら頻度のほうを落とす。
--
-- ★★★ もう1つ、今日の変更で開いた穴を塞ぐ
--   crontab が15分ごとになったので、list_mode=false の店があると
--   【個人ページ330件の巡回が15分ごとに走る】。今朝の4倍の負荷になる。
--   この列で既定を60分にしておけば、そうなっても毎時のままで止まる。
--
-- ★ 判定は /api/import/targets?mode=list で行う。
--   last_run_at（ingest / ingest-list の両方が終了時に更新する）から
--   import_interval_min 経過していない店は、その周では返さない。
--   mode=full（1日1回・03:20）は間隔を無視して全店を回す。
--
-- ★★ 冪等（禁則254）。列を足すだけで、どの店の値も変えない。
--   現行6店を15分にするのは運用の判断なので、SQLで明示的に切り替えること:
--
--     update public.salon_import_sources
--        set import_interval_min = 15, updated_at = now()
--      where provider = 'ekichika' and list_mode = true
--     returning salon_id, import_interval_min;
--
--   ★ このUPDATEを流すまでは全店60分（毎時）で動く。害はないが、
--     せっかく15分にした効果が出ないので、デプロイ後すぐに流すこと。
alter table public.salon_import_sources
  add column if not exists import_interval_min integer not null default 60;

comment on column public.salon_import_sources.import_interval_min is
  '取り込みの最短間隔（分）。/api/import/targets?mode=list が last_run_at と突き合わせて、経過していない店を返さない（第36便）。既定60。mode=full は無視する。プランの差にも使える。';
