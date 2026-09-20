-- フクエスCRM：部屋のQRを「一つ前に戻せる」ように（2026-09-20）
-- ※ Supabase SQL Editor で実行してください。冪等（再実行しても安全）。★ PUSH より前に実行。
--
-- ★ 何のため（カッキーさん 2026-09-20）
--   お店がアクリル板などで QR を外注で作ることがある。うっかり「作り直す」を押しても、
--   一つ前の QR に戻せば、作ったアクリル板をそのまま使える。
-- ★ 使える QR は【いつも1つだけ】（token）。一つ前のもの（prev_token）は使えないが、戻すことはできる。
--   作り直す：prev_token ← token、token ← 新しい合言葉
--   一つ前に戻す：token と prev_token を入れ替える（もう一度押せば、また戻る）

alter table public.crm_room_tokens add column if not exists prev_token      text;
alter table public.crm_room_tokens add column if not exists prev_created_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'crm_room_tokens_prev_token_key') then
    alter table public.crm_room_tokens add constraint crm_room_tokens_prev_token_key unique (prev_token);
  end if;
end $$;

notify pgrst, 'reload schema';

-- ★ 確認
select salon_id, room, created_at, prev_token is not null as has_prev from public.crm_room_tokens;
