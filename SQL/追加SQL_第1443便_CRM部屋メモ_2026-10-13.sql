-- 第1443便（2026-10-13・カッキーさん／店舗様の要望）: フクエスCRM の「部屋メモ」
--
-- ★ crm_settings に1列足す: room_notes（部屋ごとのメモ）
--   形: { "G401": { "text": "タオルたたむ", "at": "2026-10-13T14:50:00.000Z" }, ... }
--   ・ずっと残るメモ（書き換えるまで残る）。お店だけが見る（/cast には出さない）。
--   ・部屋の名前を変えると、メモも新しい名前へ移る（renameCrmRoom）。部屋を消してもメモは残るが画面には出ない（同じ名前で作り直すと戻る）。
-- ★ 読み書きは今までどおり service_role（RLS は変えない）。
-- ★ 何度流しても同じ結果。
-- ★ 先にこの SQL を流してから第1443便を push してください。
--   （流す前に push しても CRM は壊れない: 部屋メモのタブに「準備中」と出て保存できないだけ）

alter table public.crm_settings add column if not exists room_notes jsonb not null default '{}'::jsonb;
comment on column public.crm_settings.room_notes is '部屋ごとのメモ { 部屋名: { text, at } }（第1443便）';

-- 確認（1行で room_notes が jsonb と出れば OK）
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'crm_settings' and column_name = 'room_notes';
