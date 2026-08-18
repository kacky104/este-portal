-- ══════════════════════════════════════════════════════════════════════
-- ★★★ 2026-08-18（第21便）に復元したファイル。【もう実行しないこと】★★★
--
-- このファイルは 2026-08-09 に一度だけ適用済み。中身は当時のまま（byte 完全一致で復元）。
--
-- ── なぜ消えていたか ──
-- コミット 9eff9c5f（2026-08-09「公式HP LP: スマホヒーローを4:5に差し替え」）で、
-- 中身が丸ごと `git push origin main` の1行（20バイト）に置き換わっていた。
-- ターミナルに打つはずのコマンドをファイルに貼ってしまった事故。
-- 87ddf27b に無傷で残っていたので、そこから戻した。
--
-- ── ★ いま実行すると本番が落ちる ★ ──
-- 下の grant は【2026-08-09 時点の列一覧】。そのあと4つの列が足されている:
--     favicon_url  … 20260809_salon_sites_favicon.sql
--     logo_url     … 20260810_salon_sites_logo.sql
--     link_banners … 20260810_salon_sites_link_banners.sql
--     hero_slides  … 20260818_salon_sites_hero_slides.sql
-- いまこのファイルを流すと revoke が先に効いて、この4列が anon から読めなくなる。
-- 公開ページ（/hp/*）は列が読めないと data.ts が例外を投げるので【全店のHPが500になる】。
-- 権限を作り直したいときは、下の列一覧に上の4列を足してから流すこと。
--
-- ── ★ このファイルが伝えている一番大事なこと ★ ──
-- 【salon_sites は「テーブル単位の select を revoke して、列単位で grant し直した」テーブル】。
-- なので salon_sites に列を足すマイグレーションには、必ずこの1行がセットで要る:
--     grant select (列名) on public.salon_sites to anon, authenticated;
-- 忘れると /hp/demo だけ無事（デモ店は service_role で読むため）で /hp/test-shop が500になり、
-- ヒーローを描かない /info まで500になるので「表示のバグ」に見えて原因を見誤る。
-- 2026-08-18 に hero_slides でこれを実際にやらかした（このファイルが読めていれば防げた）。
-- ══════════════════════════════════════════════════════════════════════

-- 公式ホームページ 段階3（2026-08-09）。
-- 1) HP管理者アカウント（店舗ドメイン/admin にログインする専用アカウント）を salon_sites に持たせる。
--    キャスト招待（therapists.invited_email / user_id）と同じ「メール招待 → 本人化」方式。
--    オーナー本人（salons.owner_id）も従来どおり管理画面に入れるため、これは「追加の1人」。
-- 2) デザイン（ひな形・カラー）の確定ロック。ギャラリーで選んで確定したら店舗側からは変えられない
--    （変更は運営の有償作業＝運営が design_locked を false に戻して再選択させる）。
-- 3) 運営メモ・招待先メールを公開API（anon）から読めないようにする（列単位のSELECT権限）。
-- Supabase SQL Editor で実行してください（コード push より先に適用）。

alter table public.salon_sites
  add column if not exists admin_email    text,          -- HP管理者の招待先メール（小文字で保存）
  add column if not exists admin_user_id  uuid,          -- 本人化済みの Auth ユーザー
  add column if not exists design_locked  boolean not null default false;  -- true=ひな形/カラー変更不可

-- 1 Auth ユーザーが複数店舗のHP管理者を兼ねないよう一意にする（NULL は複数許容）。
create unique index if not exists salon_sites_admin_user_id_key
  on public.salon_sites (admin_user_id)
  where admin_user_id is not null;

-- 本人化（ログイン中ユーザーのメール一致で探す）用。
create index if not exists salon_sites_admin_email_idx
  on public.salon_sites (admin_email)
  where admin_email is not null;

-- ── 列レベルの秘匿 ─────────────────────────────────────
-- salon_sites の SELECT ポリシーは using(true)（公開HPを anon で読むため）。このままだと
-- 招待先メール（admin_email）や運営メモ（contract_note・ドメイン更新期限）まで
-- 公開APIから誰でも取得できてしまう。列単位のSELECT権限で塞ぐ。
--
-- ※ Postgres ではテーブル単位の GRANT SELECT が効いている間、列単位の REVOKE は無効。
--    いったんテーブル単位を revoke してから、公開してよい列だけ grant し直す。
--    UPDATE/INSERT/DELETE 権限には触れないので、RLS による書き込み制御は現状のまま。
revoke select on public.salon_sites from anon, authenticated;
grant select (
  salon_id, slug, domain, status, template_key, theme_key,
  hero_images, hero_catch, concept_title, concept_text, concept_image_url,
  blocks, banners, design_locked, created_at, updated_at
) on public.salon_sites to anon, authenticated;
-- 非公開のまま（service_role だけが読む）:
--   admin_email / admin_user_id / domain_registrar / domain_expires_at / contract_note

-- ── RLS ────────────────────────────────────────────────
-- 20260808_salon_sites.sql のポリシーをそのまま使う（変更なし）:
--   SELECT = 全員 / INSERT・DELETE = 運営のみ / UPDATE = 運営 or オーナー本人。
-- HP管理者（admin_user_id）の書き込みはポリシーに足さない。
-- 理由: 権限判定は actions/hpAdmin.ts の resolveAccess() が3種類（運営/オーナー/HP管理者）を
--       まとめて行い、実際の更新は service_role クライアントで列を限定して実行するため。
--       キャスト招待（actions/castInvite.ts が therapists を service_role で更新）と同じ作法。

-- ── 動作確認用 ───────────────────────────────────────
-- テスト店舗のロックを外してギャラリーからやり直す:
--   update public.salon_sites set design_locked = false where salon_id = 6;
-- HP管理者を外す（招待からやり直す）:
--   update public.salon_sites set admin_user_id = null, admin_email = null where salon_id = 6;
-- 独自ドメインを繋ぐ（Vercel 側のドメイン追加とセットで）:
--   update public.salon_sites set domain = 'example-shop.com' where salon_id = 6;
