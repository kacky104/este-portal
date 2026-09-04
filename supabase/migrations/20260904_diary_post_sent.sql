-- 写メ日記を「送った印」（第132便・2026-09-04）
--
-- ★★★ なぜログ（diary_forward_log）では足りないか
--   ログは【起きたこと】が並ぶ入れ物。★ 'sent' も 'failed:…' も 'skipped:…' も入る。
--   ★ だから一意にできない。★ 二度送っても2行増えるだけで、送信そのものは止まらない。
--
-- ★★★ 日記は【上書きではなく投稿】。★ 二度送ると記事が2本載る。
--   ★★ しかもエステ魂は **店舗の管理画面から編集・削除ができない**（2026-09-03 実測）。
--     ★ 出勤の綱引き（最後に書いたほうが勝つ）より後始末が重い。★ 消せない。
--   → **DB が二度目を弾く形にする。** ★ アプリの判断だけに頼らない。
--
-- ★★★ 主キーを (diary_id, provider, slot) にしてある。
--   ★ 送る前に insert し、成功したら残す。★ 二度目の insert は主キーで落ちる。
--   ★★ 「送ったつもり」を作らないため、**送信の前後どちらで書くか**は呼び出し側が決める:
--     ・先に書く … 二度送りは確実に防げる。★ 送信が失敗しても印が残る（消す手当てが要る）
--     ・後に書く … 印は正確。★ ただし送信直後に落ちると二度送りの窓が開く
--   → 第132便は【後に書く】。★ 消せない相手なので「送ったのに印が無い」より
--      「送っていないのに印がある」ほうが害が大きい……のではなく、逆。
--      ★★★ **消せない相手には「二度送る」ほうが害が大きい。** ★ だから先に書く。
--      ★ 送信が失敗したら印を消す（呼び出し側の責任）。★ 消し忘れても、次は人が気づける。

-- ★★★ diary_id は【uuid】。★ bigint にしない（2026-09-04・第132便で一度間違えた）
--   ★ diary_posts.id は uuid。第36便でも diary_forward_log.diary_id を bigint にして
--     転送が一度も動かず、第37便で uuid へ直している。★ 同じ穴に二度落ちた。
--   ★★ 今回は外部キーを付けていたので Supabase が実行前に止めてくれた:
--       ERROR 42804: Key columns "diary_id" and "id" are of incompatible types: bigint and uuid.
--   ★ 第36便のときは外部キーが無かったので【何も言わずに通り】、動かないことに気づけなかった。
--   → 教訓: **参照先があるなら外部キーを書く。★ 型の間違いをDBに見つけてもらう。**

create table if not exists public.diary_post_sent (
  -- ★ フクエス側の日記（diary_posts.id・uuid）
  diary_id         uuid        not null references public.diary_posts(id) on delete cascade,
  -- ★ どの媒体の・どの枠へ送ったか（'esutama' / slot 1）
  provider         text        not null,
  slot             smallint    not null default 1,
  -- ★ 誰として送ったか。★ 送ったあとに名簿の結びが変わっても、当時の相手が分かる
  therapist_id     bigint      not null,
  external_cast_id text,
  -- ★ 送った時刻。★ 相手側の投稿日時ではない（こちらが送った時刻）
  sent_at          timestamptz not null default now(),
  -- ★★ 相手が返した手がかり（記事のURLやID）。★ 読み返しで突き合わせるときに使う
  --   ★ 分からないときは null。★ 空文字にしない（「無い」と「空」を混ぜない）
  external_ref     text,
  primary key (diary_id, provider, slot)
);

comment on table public.diary_post_sent is
  E'写メ日記を媒体へ送った印（第132便）。★ 主キーで二度送りを弾く。★ 日記は投稿なので、二度送ると記事が2本載り、エステ魂では店舗側から消せない。';

comment on column public.diary_post_sent.diary_id is
  E'diary_posts.id（uuid）。★ bigint ではない。第36便・第132便で二度間違えた場所。';

comment on column public.diary_post_sent.external_ref is
  E'相手側の手がかり（記事URL・ID等）。★ 分からないときは null。★ 空文字にしない。';

-- ★ その人にどれを送ったかを引く（画面と、次に送るものを決めるとき）
create index if not exists diary_post_sent_therapist_idx
  on public.diary_post_sent (therapist_id, provider, slot);

-- ★★ service_role 専用。★ therapist_diary_forward / therapist_media_consent と同じ扱い
alter table public.diary_post_sent enable row level security;
revoke all on public.diary_post_sent from anon, authenticated;

-- ★ 確かめ方（適用後に別途流す）
--   select count(*) from public.diary_post_sent;
--   select diary_id, provider, slot, therapist_id, sent_at from public.diary_post_sent order by sent_at desc limit 20;
