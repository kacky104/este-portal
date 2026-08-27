-- 写メ日記の転送先を「媒体×枠」に拡張（第37便・第2弾の続き）
--
-- ★★★ なぜ枠が要るか（2026-08-26 ベンリー実挙動より）
--   駅ちか・エスラブは「同じ店を複数の掲載枠に載せる」運用がある。
--   例）駅ちかは ranking-deli 基盤の上に別ブランドの姉妹サイト（menesth.jp 等）を持ち、
--       同じ写メ日記を本枠とB枠の両方へ流す＝露出を倍にする。
--   ベンリーの「転送先設定」も『エステラブ / エステラブ-B / 駅ちか-B』と枠で行が並んでいた。
--   ★ 中身は同じ日記。別コンテンツではなく「同一店・同一女性の露出倍増」。
--
--   → だから provider（媒体）は 'ekichika' | 'esulove' のまま割らず、
--     同一媒体の何枠目かを slot で持つ。枠が増えても行が増えるだけで済む
--     （メモの「媒体を増やすときは1行足すだけ」を枠にも効かせる）。
--
-- ★ 当ててあっても空でも安全に通る:
--   既存行は slot=1 に落ちる。主キーを (therapist_id, provider) → (therapist_id, provider, slot) へ。

alter table public.therapist_diary_forward
  add column if not exists slot smallint not null default 1;

-- 主キーの張り替え（既定名は <table>_pkey）
alter table public.therapist_diary_forward
  drop constraint if exists therapist_diary_forward_pkey;
alter table public.therapist_diary_forward
  add constraint therapist_diary_forward_pkey primary key (therapist_id, provider, slot);

comment on column public.therapist_diary_forward.slot is
  E'同一媒体の何枠目か（1,2,3…）。駅ちか/エスラブの本枠+B枠のように、同じ日記を複数枠へ送るための識別（第37便）。';

-- 送信ログにも枠を残す（同一媒体の2枠を区別して「送ったつもり」を作らない・第35便の反省）
alter table public.diary_forward_log
  add column if not exists slot smallint;

comment on column public.diary_forward_log.slot is
  E'転送先の枠番号。skip系（provider="-"）では null（第37便）。';

-- 確認用（適用後に別途流す）。
-- select therapist_id, provider, slot, address from public.therapist_diary_forward order by 1,2,3;
