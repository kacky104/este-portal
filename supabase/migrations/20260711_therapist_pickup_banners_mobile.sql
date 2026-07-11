-- セラピストピックアップ枠にスマホ用画像（任意）を追加。
-- 未設定なら従来どおり image_url（PC用）をスマホでも表示（object-cover でトリミング）。
-- 設定すると sm 未満はスマホ用・sm 以上はPC用に出し分ける（AreaBrowse の sp/pc と同じ流儀）。
-- 対応コード: lib/therapistPickupBanners.ts・components/TherapistPickupBanner.tsx・TherapistPickupBannerManager.tsx
alter table public.therapist_pickup_banners
  add column if not exists mobile_image_url text;
