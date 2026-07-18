-- セラピストピックアップバナー：バナー下に表示する「1行キャプション（任意・最大25文字）」。
-- 表示は TherapistPickupBanner、編集は /admin のセラピストピックアップ設定（TherapistPickupBannerManager）。
-- 25文字制限はフロント側（input maxLength=25 ＋ 保存時 slice(0,25)）で担保。DBは任意テキスト列として追加。
-- 既存の RLS（is_active=true の公開SELECT・管理者UPDATE）は行単位のためカラム追加で変更不要。
ALTER TABLE public.therapist_pickup_banners
  ADD COLUMN IF NOT EXISTS caption text;
