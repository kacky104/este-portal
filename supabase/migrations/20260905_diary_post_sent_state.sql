-- 送った印に【状態】と【試した回数】を持たせる（第137便・2026-09-05）
--
-- ★★★ なぜ要るか（自動化する直前に気づいた）
--   第132〜136便までは「送れなかったら印を消す」だった。★ 手で1発ずつ撃つ間はそれでよかった。
--   ★★ しかし自動の周を回すと、**同じ日記を5分ごとに永遠に送り続ける**ことになる。
--     ★ 相手に迷惑をかけるうえ、直らないものは何度やっても直らない。
--   → **失敗を覚える。** ★ 消すのではなく、状態として残す。
--
-- ★★★ 状態は4つ。★ 2値に潰さない（作法 3-5）
--   pending … 送る直前に立てた。★ まだ結果が返っていない
--   sent    … 送れた（実測: 応答 303）
--   failed  … 送れていない（差し戻し・通信失敗）。★ **これだけ、あとでもう一度試す**
--   unknown … 受け取られたか判定できない。★★ 二度と送らない（消せない相手なので）
--
-- ★ 既存行の既定は 'sent'。★ 2026-09-04 16:42 に実際に載った1件がそれ。
--   ★ default を 'pending' にすると、その1件が「まだ送っていない」に化ける。

alter table public.diary_post_sent
  -- ★ いまどうなっているか
  add column if not exists state text not null default 'sent'
    check (state in ('pending', 'sent', 'failed', 'unknown')),
  -- ★ 何回試したか。★ 上限を超えたらもう試さない（アプリ側で判断）
  add column if not exists attempts smallint not null default 1,
  -- ★★ なぜ失敗したか。★ 人が読む文。★ 秘密は入れない
  add column if not exists last_error text,
  -- ★ 最後に動かした時刻。★ 「しばらく置いてから再挑戦」の判断に使う
  add column if not exists updated_at timestamptz not null default now();

comment on column public.diary_post_sent.state is
  E'pending（送信中）/ sent（送れた）/ failed（送れていない・再挑戦する）/ unknown（判定できない・二度と送らない）。★ 主キーは (diary_id, provider, slot) のままなので、行は1本しかできない＝二度送りは DB が弾く。';

comment on column public.diary_post_sent.attempts is
  E'試した回数。★ 上限に達した failed はもう試さない。★ 消さずに残すのは「何度も試して駄目だった」を人が見られるようにするため。';

-- ★ 自動の周が「次に送るもの」を引くための索引
create index if not exists diary_post_sent_state_idx
  on public.diary_post_sent (state, updated_at);

-- ★ 確かめ方（適用後に別途流す）
--   select state, attempts, count(*) from public.diary_post_sent group by state, attempts;
--     ★ 2026-09-04 の1件が state='sent' / attempts=1 で出れば成功
