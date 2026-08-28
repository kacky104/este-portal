-- 連携の向きを「1つの決定」にする（第45便・設計メモ §11-2）。
--
-- ★★★ カッキーさんの決定（2026-08-28）: 読み取りと書き込みは【排他】。
--
--     ① none  … 連携しない
--     ② read  … 駅ちかから読む（出勤・プロフィール・即ヒメ）★ いまの全店
--     ③ write … フクエスから駅ちかへ書く
--
--   ★★ ②と③は同時に立たない。
--   ★★★ それを **CHECK 制約ではなく「1つの列に3つの値」** で表す。
--     2つのフラグ（read_enabled / write_enabled）にして CHECK で禁じることもできるが、
--     それは「立ちうる状態を作ってから禁じる」形。1列3値なら **そもそも同時に立てられない。**
--     第39便 §5「問題が起きない構造にする。スイッチで回避しない」。
--
-- ★★ 機能ごとに向きを変えられるようにしない（出勤だけ書く／プロフィールは読む、等）。
--   やると8通りの組み合わせ問題が戻ってくる（第40便 §11-1）。だから列は1本だけ。
--
-- ★★★ なぜ排他が要るか（§9 → §11-1）
--   「今すぐ」は3枠の和集合で、取り込み枠を含む。読みながら書くと
--   【自分が読んだものを書き戻す輪】ができる（エコーバック）。
--   ★ 排他にすれば輪がそもそも成立しない（読んでいないので書き戻す材料が無い）。
--
-- ★ 既定は 'read'。既存6店はすべて 'read' に落ちる ＝ **この適用で挙動は何も変わらない。**
--   （第40便 §10 の既定値変更と同じ作法。当てただけでは何も起きない）

alter table public.salon_import_sources
  add column if not exists link_mode text not null default 'read';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'salon_import_sources_link_mode_check'
       and conrelid = 'public.salon_import_sources'::regclass
  ) then
    alter table public.salon_import_sources
      add constraint salon_import_sources_link_mode_check
      check (link_mode in ('none', 'read', 'write'));
  end if;
end $$;

comment on column public.salon_import_sources.link_mode is
  E'連携の向き。none=連携しない / read=駅ちかから読む / write=フクエスから書く。★ read と write は【1つの列の別の値】なので同時に立てられない（第45便・設計メモ §11-2）。機能ごとに向きを分けないこと。';

-- ★ is_enabled との関係（消さない理由）
--   is_enabled は「その連携をいま動かすか」の一時停止スイッチ。link_mode は「向き」。
--   ★ 別のことなので両方残す。読み取りが走る条件は
--       is_enabled = true かつ link_mode = 'read'
--     の2つがそろったときだけ（/api/import/targets）。
comment on column public.salon_import_sources.is_enabled is
  E'この連携をいま動かすか（一時停止スイッチ）。★ 向き（link_mode）とは別の話。読み取りが走るのは is_enabled=true かつ link_mode=''read'' のときだけ（第45便）。';

-- 確認用（適用後に別途流す）
-- ★ 既存6店が全部 read になっていること（挙動が変わっていない証拠）:
-- select id, salon_id, provider, slot, link_mode, is_enabled, import_imasugu
--   from public.salon_import_sources order by id;
--
-- ★ 制約が効いていること（これはエラーになるのが正しい。流さなくてよい）:
-- update public.salon_import_sources set link_mode = 'both' where id = 1;
