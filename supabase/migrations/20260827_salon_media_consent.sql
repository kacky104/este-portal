-- 他媒体連携の同意（第39便）。salon_media_credentials に3列足すだけ。
--
-- ★★★ なぜ「監査ログに残す」だけでは足りないか
--   監査ログは【履歴】。「いつ同意したか」は残るが、
--   「★ いま同意済みか」を書き込みの直前に確かめる場所にはならない。
--   → 現在の状態は行に持たせ、履歴は salon_media_audit に残す。役割が違う。
--
-- ★★ 版番号を持つ理由
--   文言は必ず直る。直したあとに古い版でしか同意していない店舗が残ると、
--   「どの文言に同意したのか」が誰にも分からなくなる。
--   → 版番号を保存し、いまの版と違えば【同意を取り直す】。
--     src/lib/mediaConsent.ts の MEDIA_CONSENT_VERSION が正本。
--
-- ★ 同意の対象は「媒体×枠」ではなく実質「媒体」だが、行は (salon_id, provider, slot) 単位。
--   枠ごとに預かる認証情報が別なので、★ 枠ごとに同意を取る形でよい。
--   （枠Bを足すときに、Bのアカウントについて改めて同意する形になる）

alter table public.salon_media_credentials
  add column if not exists consent_version   text,
  add column if not exists consent_agreed_at timestamptz,
  add column if not exists consent_agreed_by uuid;

comment on column public.salon_media_credentials.consent_version is
  E'同意した文言の版（src/lib/mediaConsent.ts の MEDIA_CONSENT_VERSION）。★ いまの版と違えば同意を取り直す。null は未同意。';

comment on column public.salon_media_credentials.consent_agreed_at is
  E'同意した日時。★ 履歴は salon_media_audit の consent_agreed イベントにも残る（あちらは追記専用）。';

comment on column public.salon_media_credentials.consent_agreed_by is
  E'同意した人の auth.users.id。★ 外部キーにしない（利用者が退会しても、同意した事実の記録は残す）。';

-- 確認用（適用後に別途流す）
-- select column_name, data_type from information_schema.columns
--  where table_schema='public' and table_name='salon_media_credentials'
--    and column_name like 'consent%' order by ordinal_position;
