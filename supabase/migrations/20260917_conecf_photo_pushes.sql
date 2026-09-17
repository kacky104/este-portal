-- コネックエフ：写真を枠ごとにサイトへ送った記録（第421便・2026-09-17）
-- ※ Supabase SQL Editor で実行してください。冪等（再実行しても安全）。
-- ★ コードは SQL の前に出ても壊れません（読めないあいだは「写真は送らない」で動きます）。
--
-- ★ 何のため
--   ・「変わった枠だけ送る」… 前に送った写真（source_url）と今の写真を比べる
--   ・「減った枠は消す」    … ここに記録がある枠だけ消す（★ 記録の無い枠＝こちらが送っていない写真には触らない）
-- ★ 1行 ＝ セラピスト×サイト×連携枠×画像の枠。★ 消したら行も消す

create table if not exists public.conecf_photo_pushes (
  therapist_id  bigint      not null references public.therapists(id) on delete cascade,
  provider      text        not null,
  slot          smallint    not null default 1,
  image_slot    smallint    not null check (image_slot between 1 and 8),
  source_url    text        not null,
  pushed_at     timestamptz not null default now(),
  primary key (therapist_id, provider, slot, image_slot)
);

comment on table public.conecf_photo_pushes is
  E'コネックエフから各サイトの画像の枠へ送った写真の記録（第421便）。★ 変わった枠だけ送る・減った枠を消すために使う。★ service_role 専用。';

alter table public.conecf_photo_pushes enable row level security;
revoke all on public.conecf_photo_pushes from anon, authenticated;

-- ★ 確認
-- select count(*) from public.conecf_photo_pushes;
