-- 新着情報の自動投稿（第166便・2026-09-05）
--
-- ★★★ 「出した本数」と「出そうとした回数」を分ける。
--
--   last_count      … ★ 実際に駅ちかへ**送れた**本数（push_article: ok のときだけ進む）
--                      ★ 画面の「今日はここまで◯本出しました」はこちら
--   last_try_count  … ★ 今日この枠で**出そうとした**回数（手動＋自動）★ 新設
--                      ★★ 自動の「次は何本目か」の判定に使う
--
-- ★★★ なぜ分けるか
--   1つにすると、**送れなかった日に自動が延々と撃ち続ける**。
--   ★ 5分ごとの周が「まだ今日ぶんを出していない」と判断し続けるため。★ 相手に迷惑をかける。
--   → ★ 試行で数えて上限で止める。★ そのうえで、店舗様には「出た本数」を見せる。
--
-- ★ 区切りは営業日（朝6時）。★ 暦の0時ではない（announceAuto の dayKeyJST）。

alter table public.salon_article_settings
  add column if not exists last_try_day   text,
  add column if not exists last_try_count smallint not null default 0;

comment on column public.salon_article_settings.last_try_count is
  E'今日この枠で出そうとした回数（手動＋自動）。★ 送れなくても進む。★ 自動の「次は何本目か」の判定に使う。★ last_count（実際に送れた本数）とは別物。';

comment on column public.salon_article_settings.last_try_day is
  E'last_try_count を数えている営業日（YYYY-MM-DD・朝6時区切り）。★ 変わったら1から数え直す。';

-- ★ 自動の周が「回す対象の店舗」を引くため
create index if not exists salon_article_settings_auto_idx
  on public.salon_article_settings (auto_enabled, provider, slot)
  where auto_enabled = true;

-- ★ 確かめ方（適用後に別途流す）
--   select column_name from information_schema.columns
--    where table_schema='public' and table_name='salon_article_settings'
--      and column_name in ('last_try_day','last_try_count');
--   ★ 2行返れば成功
