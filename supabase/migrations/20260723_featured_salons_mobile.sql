-- ピックアップ店舗（featured_salons）にスマホ用画像（任意）を追加。
-- 未設定なら従来どおり image_url（PC用）をスマホでも表示（object-cover でトリミング）。
-- 設定すると sm 未満はスマホ用・sm 以上はPC用に出し分ける（AdBanner / TherapistPickupBanner と同じ流儀）。
-- 画像は既存の featured-salon-images バケットに salons/{id}/sp-{timestamp}.{ext} で保存する
-- （バケット・ストレージポリシーは 20260616_featured_salon_images.sql で作成済みのため追加不要）。
-- 対応コード: lib/featured.ts・components/FeaturedSalonSlider.tsx・components/FeaturedSalonsManager.tsx
alter table public.featured_salons
  add column if not exists mobile_image_url text;
