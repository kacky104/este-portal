-- セラピストピックアップバナー：キャプションの1段下・右端に薄グレーで表示する「店舗名（任意）」。
-- 表示は TherapistPickupBanner、編集は /admin のセラピストピックアップ設定（TherapistPickupBannerManager）で手入力。
-- 長さ制限（30文字）はフロント側（input maxLength=30 ＋ 保存時 slice(0,30)）で担保。DBは任意テキスト列として追加。
-- 既存の RLS（is_active=true の公開SELECT・管理者UPDATE）は行単位のためカラム追加で変更不要。
ALTER TABLE public.therapist_pickup_banners
  ADD COLUMN IF NOT EXISTS shop_name text;
