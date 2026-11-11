-- エステラブの「ログインできませんでした」の中身を見る。★ SELECT だけ。
-- ★ Supabase の SQL Editor で【A】を流してください。

-- ══════════════ A：監査ログの detail（ここに理由が入っている）══════════════
select
  to_char(created_at at time zone 'Asia/Tokyo', 'MM/DD HH24:MI:SS') as 時刻,
  event, outcome,
  detail ->> 'reason'     as 理由,
  detail ->> 'httpStatus' as HTTP,
  summary
from public.salon_media_audit
where provider = 'esulove'
order by created_at desc
limit 15;

-- ══════════════ B：中継ジョブの生の結果（Aで足りないときだけ）══════════════
-- ★ http_status と error が入っています。★ 中身（request_enc/response_enc）は見ません
-- select
--   to_char(created_at at time zone 'Asia/Tokyo', 'MM/DD HH24:MI:SS') as 時刻,
--   purpose, status, http_status, bytes, attempts, left(coalesce(error,''), 200) as エラー
-- from public.media_relay_jobs
-- where provider = 'esulove'
-- order by created_at desc
-- limit 15;
