-- 掲載店舗向け「公式ホームページ」機能 段階1（2026-08-08 設計メモどおり）。
-- 1店舗1サイト。行の作成＝契約成立時に運営が行う（店舗は編集のみ・行が無い店舗には
-- /mypage に「公式HP」タブ自体が表示されない）。
-- Supabase SQL Editor で実行してください（コード push より先に適用）。

create table if not exists public.salon_sites (
  salon_id          bigint primary key references public.salons(id) on delete cascade,
  slug              text unique not null,           -- 暫定URL用（独自ドメイン設定前）。半角英数とハイフン
  domain            text unique,                    -- 独自ドメイン（例 example-shop.com）。取得後に運営が設定
  status            text not null default 'draft'   -- draft=非公開 / live=公開 / suspended=運営による停止
                    check (status in ('draft', 'live', 'suspended')),
  template_key      text not null default 'a'       -- ひな形（タイプA/B/C）
                    check (template_key in ('a', 'b', 'c')),
  theme_key         text not null default 'white',  -- 既存 SALON_THEMES（themes.ts）のキーを流用
  hero_images       jsonb not null default '[]'::jsonb,  -- 文字列URLの配列・最大3
  hero_catch        text  not null default '',
  concept_title     text  not null default '',
  concept_text      text  not null default '',      -- ★HP専用の書き下ろし（掲載ページの description をコピーしない）
  concept_image_url text,
  blocks            jsonb not null default '{}'::jsonb,  -- 各ブロックのON/OFFと件数（形はアプリ側 lib/hpSite.ts が正）
  banners           jsonb not null default '[]'::jsonb,  -- { image_url, link } の配列・最大3
  domain_registrar  text,                           -- 取得先レジストラ（運営メモ・1社に統一する運用）
  domain_expires_at date,                           -- ドメイン更新期限。/admin の期限監視で使用（段階4）
  contract_note     text  not null default '',      -- 運営メモ（契約状況・特記事項）
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.salon_sites enable row level security;

-- 公開: 誰でも閲覧可（公開HPページは anon クライアント＋ISRで読むため必須。
-- draft の行も SELECT 自体は可能だが、公開ページ側で status='live' のみ表示する）。
drop policy if exists salon_sites_select on public.salon_sites;
create policy salon_sites_select on public.salon_sites for select using (true);

-- 追加: 管理者のみ（契約成立時に運営が行を作る。店舗は自分で作れない）。
drop policy if exists salon_sites_insert on public.salon_sites;
create policy salon_sites_insert on public.salon_sites for insert
  with check (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid);

-- 更新: オーナー（自店）＋管理者。
drop policy if exists salon_sites_update on public.salon_sites;
create policy salon_sites_update on public.salon_sites for update
  using (
    auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid
    or exists (select 1 from public.salons s where s.id = salon_id and s.owner_id = auth.uid())
  )
  with check (
    auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid
    or exists (select 1 from public.salons s where s.id = salon_id and s.owner_id = auth.uid())
  );

-- 削除: 管理者のみ（解約処理）。
drop policy if exists salon_sites_delete on public.salon_sites;
create policy salon_sites_delete on public.salon_sites for delete
  using (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid);

-- ── 動作確認用（管理者アカウントで実行・salon_id と slug は実在の値に置き換え） ──
-- insert into public.salon_sites (salon_id, slug) values (1, 'test-shop');
-- ※ 行を入れた店舗のオーナーで /mypage を開くと「公式HP」タブが現れる。
--    削除は delete from public.salon_sites where salon_id = 1;
