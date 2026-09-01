-- 写メ日記の入口を1つに絞る（第99便）
--
-- ★★★ なぜ要るか
--   第92〜98便で【駅ちかからの取り込み】という3つ目の入口を足したが、
--   既にあるメールの入口（/api/webhooks/resend-inbound）との線を引いていなかった。
--   両方が生きている店舗では、同じ日記が diary_posts に2件並ぶ。
--   ★ ベンリーの転送設定を入れた瞬間に始まる。★ 2026-09-01 時点では未設定なので起きていないだけ。
--
-- ★★★ 直し方は「入口を1つに絞る一本線」。重複判定は【入れない】（本物が黙って落ちるため）。
--   出勤の「駅ちかとフクエスのどちらか一方」とまったく同じ形にする。
--
--   benry    受け取る（メール）… 駅ちかの取り込みは回さない
--   ekichika 取り込む（駅ちか）… メールは受け取らない  ★ 今回足す3つ目
--   fukues   フクエスが正本    … どちらも受け取らない
--
-- ★★ 判定は src/lib/diarySource.ts に集約してある。SQL 側は【3値以外を保存させない】だけ。

-- 1. 説明文を3値に更新する
comment on column public.salons.diary_source is
  E'写メ日記の正本（第36便・第99便で3値化）。benry=他媒体で書いて代行システム経由でメールで受け取る。ekichika=駅ちかの管理画面から取り込む（受信OFF）。fukues=フクエスで書いて各媒体へ送る（どちらも受信OFF）。既定はbenry。★ 入口は常に1つだけ。';

-- 2. ★★★ 3値以外を保存させない
--
--   ★ 先に確認すること（0行なら下がそのまま通る）:
--     select id, name, diary_source from public.salons
--       where diary_source not in ('benry','ekichika','fukues');
--
--   ★ 制約名が既にある場合は落としてから足す（何度流しても同じ結果になるように）。
alter table public.salons drop constraint if exists salons_diary_source_check;
alter table public.salons
  add constraint salons_diary_source_check
  check (diary_source in ('benry', 'ekichika', 'fukues'));

-- 3. 確認用（適用後に別途流す）
--   ★ 制約が1行返れば成功。
-- select conname from pg_constraint where conname = 'salons_diary_source_check';
--
--   ★ 店舗ごとの入口の一覧（★ 数えるだけ。書き換えない）
-- select id, name, diary_source from public.salons order by id;
--
-- ★★ ラビリンス様（salon_id 6）の切り替えは【別に流す】。
--   実際に動いているのは駅ちかの取り込みなので:
--     update public.salons set diary_source = 'ekichika' where id = 6;
--   ★ 切り替えるまで取り込みの口は0件を返す（＝安全側に止まる）。
