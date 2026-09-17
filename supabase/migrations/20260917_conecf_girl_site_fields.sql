-- コネックエフ：女性プロフィールのコメント・Q&A・各サイト項目（第414便・2026-09-17）
-- ※ Supabase SQL Editor で実行してください。冪等（再実行しても安全）。
-- ★ コードは SQL の前に出ても壊れません（読めないあいだは空で出し、保存だけ「SQL がまだ」と断ります）。
--
-- ★★★ この適用だけでは何も変わりません（入れる器を足すだけ・どのサイトにもまだ送りません）。
--
-- ★ 何を持つか（ベンリーの「コメント／各サイト項目／Q&A」に当たる）
--   ・キャッチコピー・お店コメントは フクエスの therapists.catchphrase / profile_text をそのまま使う（★ 列は足さない）
--   ・お店からのメッセージのタイトル・女の子コメント・Q&A は conecf_therapist_profiles に足す
--   ・サイトごとの項目（駅ちかのジャンル・優先タグ・オプション・新人…／エステ魂の特徴・質問・SNS…）は
--     conecf_therapist_site_fields（人×サイト×枠・jsonb）。★ 形は src/lib/conecfSiteFields.ts が決める

alter table public.conecf_therapist_profiles add column if not exists shop_title   text;
alter table public.conecf_therapist_profiles add column if not exists girl_comment text;
alter table public.conecf_therapist_profiles add column if not exists qa           jsonb not null default '[]'::jsonb;

create table if not exists public.conecf_therapist_site_fields (
  therapist_id  bigint      not null references public.therapists(id) on delete cascade,
  provider      text        not null,
  slot          smallint    not null default 1,
  fields        jsonb       not null default '{}'::jsonb,
  updated_at    timestamptz not null default now(),
  primary key (therapist_id, provider, slot)
);

comment on table public.conecf_therapist_site_fields is
  E'セラピスト×サイト×枠の「各サイト項目」（第414便）。★ 中身の形は src/lib/conecfSiteFields.ts（駅ちか：pGenres/genres/options/rookie/constellation、エステ魂：types/experience/qualified/bodyStyle/answers/sns）。★ service_role 専用。';

alter table public.conecf_therapist_site_fields enable row level security;
revoke all on public.conecf_therapist_site_fields from anon, authenticated;

-- ★ 確認
-- select column_name from information_schema.columns where table_name = 'conecf_therapist_profiles' and column_name in ('shop_title','girl_comment','qa');
-- select count(*) from public.conecf_therapist_site_fields;
