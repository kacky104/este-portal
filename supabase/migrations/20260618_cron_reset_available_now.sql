-- ============================================================
-- 「今すぐ」フラグの自動リセット（pg_cron）
-- Supabase ダッシュボードの SQL Editor で実行してください
-- ============================================================
--
-- 目的:
--   available_until が過去になった is_available_now=true のセラピストを
--   定期的に is_available_now=false / available_until=NULL へ戻す。
--   アプリ側の保存ロジックでも制御しているが、誰も保存しないまま放置された
--   期限切れフラグを確実に落とすための保険。
--
-- 実行頻度: 5分ごと
-- 備考: cronジョブは postgres 権限で実行されるため RLS をバイパスして更新できる。

-- 1. pg_cron 拡張を有効化（Supabaseでは extensions スキーマに作成）
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. リセット用の関数（SECURITY DEFINER で確実に更新）
CREATE OR REPLACE FUNCTION public.reset_expired_available_now()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.therapists
  SET is_available_now = false,
      available_until  = NULL
  WHERE is_available_now = true
    AND (available_until IS NULL OR available_until <= now());
$$;

-- 3. 既存の同名ジョブがあれば解除（再実行時の重複登録を防ぐ）
DO $$
BEGIN
  PERFORM cron.unschedule('reset-expired-available-now');
EXCEPTION WHEN OTHERS THEN
  -- ジョブが存在しない場合は無視
  NULL;
END $$;

-- 4. 5分ごとにリセット関数を実行するジョブを登録
SELECT cron.schedule(
  'reset-expired-available-now',
  '*/5 * * * *',
  $$ SELECT public.reset_expired_available_now(); $$
);

-- 確認用:
--   登録済みジョブ      … SELECT * FROM cron.job;
--   直近の実行履歴      … SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
--   手動で1回実行       … SELECT public.reset_expired_available_now();
--   ジョブの解除        … SELECT cron.unschedule('reset-expired-available-now');
