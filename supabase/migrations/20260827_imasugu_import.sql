-- 駅ちかの「即ヒメ」をフクエスの「今すぐ」へ取り込む（第39便・第1弾の拡張）。
--
-- ★★★ 3つ目の枠を足す理由（2026-08-27 の決定）
--   いまの「今すぐ」は2枠の和集合:
--     is_available_now      / available_until        … オーナーが押した枠
--     is_available_now_cast / available_until_cast   … キャスト本人が押した枠
--   ここへ駅ちか由来を混ぜると、どちらに書いても事故になる:
--     店舗がフクエスで消す   → 次の周で駅ちかから復活する
--     店舗がフクエスで付ける → 駅ちかが normal なので消される
--   どちらも「操作したのに戻る」形で、第36便の
--   ★「迷ったら、間違った値を書くより何も書かないほうを選ぶ」に反する。
--   → 取り込み専用の3枠目を足し、【店舗の2枠には一切触らない】。
--
-- ★★★ 正本の切り替え（diary_source のようなスイッチ）は作らない
--   写メ日記は受信と送信が同じ経路を通るので、正本を決めないと二重投稿になった。
--   今すぐは3枠の和集合で、両方立っていても矛盾しない。
--   ★ 問題が起きない構造にスイッチを足さない。スイッチ自体が「保存したつもり」の事故を生む。
--   店舗が要るのは「駅ちかから取り込むか否か」だけなので、それは salon_import_sources に1列。
--
-- ★★★ available_until_import は「保険」であって「寿命」ではない
--   即ヒメの残り時間は公開ページに出ていない（管理画面にしか出ない・第39便で実測）。
--   → 実際に消すのは【次の取り込みの周】。駅ちかが即ヒメを外せば、最大15分後に落ちる。
--     この列は「取り込みが止まったとき」に自動で消えるための保険なので、短くてよい（20分）。
--   ★ 45分（駅ちか側の枠のクールダウン）を入れてはいけない。
--     即ヒメが何分前に始まったかは公開ページから読めないので、
--     45分を入れると「切れた直後に押されたもの」を最大45分ぶん誤って表示する。

alter table public.therapists
  add column if not exists is_available_now_import boolean not null default false,
  add column if not exists available_until_import  timestamptz;

comment on column public.therapists.is_available_now_import is
  E'駅ちかの「即ヒメ」から取り込んだ今すぐ枠（第39便）。★ 店舗もキャストも操作しない。取り込みだけが書く。';

comment on column public.therapists.available_until_import is
  E'取り込み枠の期限。★ 寿命ではなく保険（取り込みが止まったときに自動で消えるため）。実際は次の周で消える。';

-- 店舗ごとの取り込み設定。★ 既定 false ＝ 既存店には勝手に効かない。
alter table public.salon_import_sources
  add column if not exists import_imasugu boolean not null default false;

comment on column public.salon_import_sources.import_imasugu is
  E'駅ちかの「即ヒメ」を今すぐとして取り込む（第39便）。★ 既定 false。店舗の同意なく有効にしないこと。';

-- 確認用（適用後に別途流す）
-- select column_name, data_type, column_default from information_schema.columns
--  where table_schema='public' and table_name='therapists'
--    and column_name in ('is_available_now_import','available_until_import');
-- select column_name from information_schema.columns
--  where table_schema='public' and table_name='salon_import_sources' and column_name='import_imasugu';
