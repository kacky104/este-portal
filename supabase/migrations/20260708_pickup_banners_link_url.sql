-- セラピストピックアップ枠のリンク運用を「URL手動入力」に切り替えるための変更。
-- ・therapist_id を任意化（NOT NULL 解除）：新規はURL手動入力で運用し、セラピスト紐づけは必須にしない。
-- ・link_url（任意）を追加：/therapist/123 等の相対パス、または https:// 絶対URLを保存する。
--   リンク解決の優先順位は link_url → （無ければ）therapist_id からの /therapist/{id} → どちらも無ければ非リンク。
-- ※ 冪等：alter column drop not null / add column if not exists は再適用しても安全。
-- ※ Supabase SQL Editor で適用する。

alter table public.therapist_pickup_banners alter column therapist_id drop not null;
alter table public.therapist_pickup_banners add column if not exists link_url text;
