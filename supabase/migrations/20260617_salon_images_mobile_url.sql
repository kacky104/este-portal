-- salon_images に mobile_image_url カラムを追加
ALTER TABLE salon_images ADD COLUMN IF NOT EXISTS mobile_image_url text;
