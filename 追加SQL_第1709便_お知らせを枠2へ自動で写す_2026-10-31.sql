-- 第1709便（2026-10-31・カッキーさん OK）: 駅ちかの新着情報（お知らせ）を、枠2以降へ枠1から自動で写す。
--
-- ★ 枠2以降（別エリアのお店ページ）に ID・PW を入れて「フクエスから反映（自動）」にした店は、
--   自動の周が 枠1 の文章を 枠2 に写し、枠1 → 枠2 の一方向でそろえ続ける（店舗様は何もしない）。
-- ★ mirror_of ＝ 写し元（枠1 の文章の id）。null ＝ 店舗様が書いた文章（今までの行はすべて null のまま）。
-- ★ 枠1 の文章を消したら、写しも一緒に消える（on delete cascade）。
-- ★ 1つの写し元につき、枠ごとに写しは1本だけ（unique）。
-- ★ 今ある行には触らない。何度流しても同じ結果（if not exists）。

alter table public.salon_article_templates
  add column if not exists mirror_of bigint
  references public.salon_article_templates(id) on delete cascade;

comment on column public.salon_article_templates.mirror_of is
  '第1709便: 枠1の文章の写し（枠2以降）のとき、写し元の id。null は店舗様が書いた文章';

create unique index if not exists salon_article_templates_mirror_uniq
  on public.salon_article_templates (mirror_of, slot)
  where mirror_of is not null;

-- 確認（1行・mirror_of が bigint で出れば OK）
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'salon_article_templates' and column_name = 'mirror_of';
