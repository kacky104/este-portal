-- 新着情報：自動投稿を【枠（カテゴリー）ごとに1日1回】へ（第376便・2026-09-15）
--
-- ★★★ 決めたこと（カッキーさん・2026-09-15）
--   「各カテゴリー自動投稿は1日1回にします。手動投稿はなんどでもOK」
--   「1カテゴリーにつき最大5投稿、自動更新用に用意できる仕様で」
--
--   last_auto_day   … ★ この文章を【自動で】出した営業日（YYYY-MM-DD・朝6時区切り）
--                      ★★ 枠の中の1本でも今日になっていれば、その枠は今日ぶんを出し終えている
--                      ★ 手で出したときは**入らない**（★ 手動と自動は別・カッキーさんの判断）
--   last_posted_at  … ★ 最後に出した時刻（自動・手動どちらでも入る）
--                      ★★ ローテの順番はこれで決まる（★ いちばん古い1本を次に出す）
--                      ★ 画面にも「9/14 15:50」として出す
--
-- ★★★ なぜ rotation_index（位置の数字）をやめたか
--   ★ 位置を数字で持つと、本数が変わったときにずれる（★ 5本→3本で飛ぶ）。
--   ★ 「最後に出したのが古い順」なら、本数が変わっても順番が壊れない。
--   → ★ salon_article_settings.rotation_index は**残すが、もう読まない**。
--
-- ★★ salon_article_settings.posts_per_day / last_try_day / last_try_count も残すが読まない。
--   ★ 「1日に出す本数」の設定そのものが無くなった（★ 枠ごと1日1回に固定）。

alter table public.salon_article_templates
  add column if not exists last_auto_day  text,
  add column if not exists last_posted_at timestamptz;

comment on column public.salon_article_templates.last_auto_day is
  E'この文章を自動で出した営業日（YYYY-MM-DD・朝6時区切り）。★ 枠ごとに1日1回の判定に使う。★ 手で出したときは入らない。第376便。';

comment on column public.salon_article_templates.last_posted_at is
  E'最後に駅ちかへ出した時刻（自動・手動とも）。★ ローテはこれが古い順。★ null はまだ一度も出していない。第376便。';

-- ★ 枠ごとに「次に出す1本」を引くため（★ 古い順・null が先）
create index if not exists salon_article_templates_rotation_idx
  on public.salon_article_templates (salon_id, provider, slot, article_slot, is_active, last_posted_at);

-- ★ 確かめ方（適用後に別途流す）
--   select column_name, data_type from information_schema.columns
--    where table_schema='public' and table_name='salon_article_templates'
--      and column_name in ('last_auto_day','last_posted_at');
--   ★ 2行返れば成功
