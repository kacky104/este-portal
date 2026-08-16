-- hp_inquiries: 公式ホームページ制作の【お申し込み・お問い合わせフォーム】の受け皿。
-- （/hp/templates/contact・2026-08-16 新設）
--
-- 未ログインの一般公開フォームなので、INSERT はサーバーアクション（service_role）経由のみで行い、
-- 公開INSERTポリシーは作らない（PostgREST直叩きのスパムを遮断）。閲覧・管理は運営のみ。
-- listing_inquiries（/listing の掲載お問い合わせ）とまったく同じ作法。
-- 送信時に notifyAdmin で運営宛メールも飛ぶ（テーブルは記録・バックアップ用）。
-- ※ Supabase SQL Editor で適用する記録用マイグレーション（冪等）。
--
-- ★ listing_status（フクエス掲載状況）は運営の優先度判断に使う。値の意味:
--     listed      … すでにフクエスに掲載中
--     applied     … 掲載を申し込み済み・準備中
--     considering … 掲載を検討中（未掲載）
--     none        … 掲載はせず、ホームページだけ希望
--   ★ 値を増やすときは ① この CHECK ② actions/hpInquiry.ts の HP_LISTING_STATUS
--      ③ フォームの選択肢 ④ 管理画面のラベル の4か所を同時に直すこと。
--
-- ★ template_key / color_key には CHECK を付けない。
--   これは「申し込み時点でお客様が選んだ配色」の記録であり、
--   HP_COLOR_VARIANTS は今後も増減する（実際 6色→4色に減らした経緯がある）。
--   DB側で縛ると、色を入れ替えたときに過去の申し込みが読めなくなる。
--   入力値の妥当性はサーバーアクション側で HP_TEMPLATES / HP_COLOR_VARIANTS と突き合わせる。

create table if not exists public.hp_inquiries (
  id uuid primary key default gen_random_uuid(),
  shop_name text not null,          -- 店舗名
  contact_name text not null,       -- ご担当者名
  email text not null,              -- 連絡先メール
  phone text,                       -- 電話（任意）
  listing_status text not null check (listing_status in ('listed', 'applied', 'considering', 'none')),
  template_key text,                -- 希望ひな形 s/a/b/c（任意・未選択は null）
  color_key text,                   -- 希望カラーのキー（任意・未選択は null）
  note text,                        -- 備考（任意）
  status text not null default 'open' check (status in ('open', 'done')),
  created_at timestamptz not null default now()
);
create index if not exists idx_hp_inquiries_created on public.hp_inquiries (created_at desc);

alter table public.hp_inquiries enable row level security;

-- 運営のみ全操作可（公開ポリシーは作らない）。listing_inquiries と同じ管理者UUID。
drop policy if exists "admin_all_hp_inquiries" on public.hp_inquiries;
create policy "admin_all_hp_inquiries"
  on public.hp_inquiries for all
  using (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid)
  with check (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid);
