-- 第1450便（2026-10-14・カッキーさん）: フクエスポイントのキャンペーン
--   ・会員登録で 50pt（確認メールのリンクで登録が終わったとき。これからの会員だけ＝すでに会員の人には付けない）
--   ・はじめての口コミで 50pt（運営が承認したとき。キャンペーン前に承認された口コミがある人は対象外）
--
-- ★ member_points に種類を2つ足す（signup・review）と、何に対して付けたかの列（ref_id＝口コミの番号など）。
-- ★ 会員登録・口コミのポイントは、1人1回まで（DB の決まりで二重にならない）。
-- ★ 何度流しても同じ結果。今ある行は変えない。
-- ★ 先にこの SQL を流してから第1450便を push してください。

alter table public.member_points drop constraint if exists member_points_kind_check;
alter table public.member_points add constraint member_points_kind_check
  check (kind in ('visit', 'signup', 'review', 'use', 'expire', 'revoke', 'adjust'));

alter table public.member_points add column if not exists ref_id text;
comment on column public.member_points.ref_id is '何に対して付けたか（口コミの番号など・第1450便）';

-- 会員登録のポイントは1人1回・はじめての口コミのポイントは1人1回
create unique index if not exists member_points_signup_uq on public.member_points (user_id) where kind = 'signup';
create unique index if not exists member_points_review_uq on public.member_points (user_id) where kind = 'review';

-- 確認（member_points_kind_check に signup と review が入っていれば OK）
select conname, pg_get_constraintdef(oid) as def from pg_constraint where conname = 'member_points_kind_check';
