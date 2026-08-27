-- 写メ日記の転送ログの diary_id を uuid へ（第37便）
--
-- ★★★ なぜ必要か
--   diary_posts.id は uuid だが、第36便で作った diary_forward_log.diary_id は bigint だった。
--   さらに API 側（/api/diary/forward・/api/admin/diary-forward）が
--   `Number(body.diaryId)` で数値化していたため、uuid は必ず NaN になり 400 で弾かれていた。
--   ＝【写メ日記を投稿しても転送処理が一度も動かず、画面上も無言】という状態だった。
--   第35便の反省（「送ったつもり」を作らない）が、まさにこの経路で起きていた。
--
-- ★ 転送が一度も成功していないため、このテーブルは空のはず。
--   念のため行があれば中断して、手で確認できるようにする（黙って壊さない）。

do $$
begin
  if exists (select 1 from public.diary_forward_log) then
    raise exception 'diary_forward_log に行があります。型変換で失われるため、中身を確認してから手動で対応してください。';
  end if;
end $$;

alter table public.diary_forward_log
  alter column diary_id type uuid using null;

comment on column public.diary_forward_log.diary_id is
  E'diary_posts.id（uuid）。第36便では bigint だったため記録できていなかった（第37便で修正）。';

-- 確認用（適用後に別途流す）。data_type が uuid なら成功。
-- select column_name, data_type from information_schema.columns
--  where table_schema='public' and table_name='diary_forward_log' and column_name='diary_id';
