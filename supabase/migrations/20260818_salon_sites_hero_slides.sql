-- 公式ホームページのトップ画像をスライダー化する（2026-08-18・第21便）。
-- Supabase SQL Editor で実行してください（★コード push より先に適用・禁則65）。
--
-- ── なぜ列を足すのか ───────────────────────────────
-- いまの salon_sites.hero_images は「3枚の写真の配列」ではなく、位置に意味のある
--   hero_images[0] … パソコン用（横長 2400×960）
--   hero_images[1] … スマートフォン用（1080×760・省略可）
-- という2枠だった（禁則110）。ここを3枚のスライドに読み替えると
-- 「スマホ用画像の指定」が行き場を失って壊れる。
-- そこで「スライド1枚 = { pc, sp } のオブジェクト」を並べた別の列を新しく作る。
--
-- hero_slides = [
--   { "pc": "https://…/1-pc.webp", "sp": "https://…/1-sp.webp" },  -- 1枚目（sp は省略可）
--   { "pc": "https://…/2-pc.webp" },                               -- 2枚目
--   { "pc": "https://…/3-pc.webp" }                                -- 3枚目（最大3）
-- ]
--
-- ── CHECK 制約を付けない理由 ───────────────────────
-- 同じテーブルの blocks / banners / hero_images にも CHECK は無く、
-- 「形はアプリ側 lib/hpSite.ts が正」（20260808_salon_sites.sql のコメント）という
-- 家のルールに合わせてある。形の検証は sanitizeHpHeroSlides() が読み書き両方で行う。
-- ここに CHECK を足すと、既存の壊れた行が1つでもあるとマイグレーション自体が止まる。
--
-- ── hero_images はそのまま残す ─────────────────────
-- アプリは今後 hero_slides と hero_images の両方に書く（1枚目 = hero_images[0]/[1]）。
-- 万が一コードを前の版に戻しても、トップ画像が空になって全店のHPが崩れることはない。
-- 落とすとしても 9/1 のオープンを越えて、しばらく様子を見てから。

alter table public.salon_sites
  add column if not exists hero_slides jsonb not null default '[]'::jsonb;

comment on column public.salon_sites.hero_slides is
  'トップ画像のスライド。{pc, sp} の配列・最大3。sp は省略可（省略時は pc をスマホでも使う）。形の正は lib/hpSite.ts';

-- ── 既存行の移行（hero_images → hero_slides の1枚目）──
-- ★ 何度流しても安全: すでにスライドが入っている行（hero_slides <> '[]'）には触らない。
-- ★ hero_images[0] が文字列でない壊れた行は空のまま残す（アプリ側が既定画像に落とす）。
-- ★ hero_images[1] が文字列でなければ sp を付けない（PCのみのスライド1枚になる）。
update public.salon_sites
set hero_slides = case
  when jsonb_typeof(hero_images) = 'array'
   and jsonb_array_length(hero_images) >= 1
   and jsonb_typeof(hero_images -> 0) = 'string'
  then jsonb_build_array(
         case when jsonb_array_length(hero_images) >= 2
               and jsonb_typeof(hero_images -> 1) = 'string'
              then jsonb_build_object('pc', hero_images -> 0, 'sp', hero_images -> 1)
              else jsonb_build_object('pc', hero_images -> 0)
         end)
  else '[]'::jsonb
end
where hero_slides = '[]'::jsonb;

-- ── RLS ──
-- 列を足しただけなのでポリシーの変更は不要（salon_sites の update ポリシーが
-- そのまま新しい列にも効く。20260808_salon_sites.sql 参照）。

-- ── 適用後の確認（実行して目視すること）──
-- select salon_id, slug, hero_images, hero_slides from public.salon_sites order by salon_id;
--   → test-shop / demo の hero_slides に、hero_images と同じURLが1枚ぶん入っていること。
--   → hero_images 側が消えていないこと。
