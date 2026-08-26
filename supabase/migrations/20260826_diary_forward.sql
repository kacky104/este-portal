-- 写メ日記の他媒体転送（第36便・第2弾）
--
-- ★★★ 何のために作るか
--   ベンリーの月額値上げを受けた店舗からの「フクエスで同じことができないか」という依頼が起点。
--   ★ 勝ち筋は【即時反映】。ベンリー経由だと他媒体への反映が10分後、フクエス正本なら即時。
--     「フクエスに日記が載ること」は価値ではない（9/6からベンリー経由で実現する）。
--     「フクエスを正本にする理由」を店舗に渡すのが目的。
--
-- ★ 対象は2媒体だけ（2026-08-26 調査）。フォーム操作は要らない。
--     駅ちか   … メール投稿あり・セラピストごとにアドレス発行 → 対象
--     エスラブ … メール投稿あり・セラピストごとにアドレス発行 → 対象
--     エステ魂 … メール投稿なし → 対象外
--     全国メンズエステランキング … 写メ日記機能そのものが無い → 対象外
--
-- 既にあるもの（作らなくてよい）:
--   受信 … /api/webhooks/resend-inbound ＋ therapist_diary_mail（第27便）
--   送信 … Resend（予約通知・求人応募など8か所で稼働）
--   日記 … diary_posts（therapist_id, salon_id, images text[], title, content）
--          images には Storage の【公開URL】が入っている＝取得して添付できる

-- 1. 転送先アドレス（セラピスト × 媒体）
--
-- ★★★ therapist_diary_mail と同じ扱いにすること（第27便の判断を踏襲）。
--   アドレスを知っている者は誰でもその媒体に投稿できる。公開ページから引ける場所に置かない。
--   RLS 有効・ポリシーなし・anon/authenticated に GRANT なし＝service_role からのみ読める。
--   ★ therapists に列として持たせてはいけない（公開ページが anon で SELECT するため）。
create table if not exists public.therapist_diary_forward (
  therapist_id bigint      not null references public.therapists(id) on delete cascade,
  provider     text        not null,                    -- 'ekichika' | 'esulove'
  address      text        not null,                    -- 媒体側が発行した投稿用メールアドレス
  is_enabled   boolean     not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (therapist_id, provider)
);

alter table public.therapist_diary_forward enable row level security;
revoke all on public.therapist_diary_forward from anon, authenticated;

comment on table public.therapist_diary_forward is
  'フクエスで書いた写メ日記の転送先（セラピスト×媒体）。アドレスは秘密値なので anon/authenticated には一切開けない（第36便）。';

-- 2. 正本の選択（店舗ごと）
--
-- ★★★ これが二重投稿を防ぐ唯一の仕掛け。
--   'fukues' に切り替えた店舗でベンリー側の転送が生きたままだと、
--   自分が上げた日記がフクエスに戻ってきて2つ並ぶ。
--   /api/webhooks/resend-inbound は diary_source='fukues' の店舗宛のメールを
--   【受け取らずに捨てる】こと。受け取ってから重複判定する形にすると、判定は必ずどこかで外れる。
alter table public.salons
  add column if not exists diary_source text not null default 'benry';

comment on column public.salons.diary_source is
  E'写メ日記の正本（第36便）。benry=他媒体で書いてベンリー経由で受け取る（受信ON・送信OFF）。fukues=フクエスで書いて各媒体へ送る（受信OFF・送信ON）。既定はbenry。';

-- 3. 送信ログ
--
-- ★ 受信側の diary_mail_log と対になる。「送ったつもり」を作らないための記録。
-- ★★ status には理由まで入れること（第35便の反省6・「0を報告するときは0の理由が読み取れる形に」）。
--     'sent' / 'failed:<理由>' / 'skipped:source_is_benry' / 'skipped:no_address' / 'skipped:disabled'
create table if not exists public.diary_forward_log (
  id           bigserial primary key,
  diary_id     bigint,
  therapist_id bigint,
  provider     text        not null,
  status       text        not null,
  error        text,
  attempts     integer     not null default 1,
  created_at   timestamptz not null default now()
);

create index if not exists diary_forward_log_diary_idx on public.diary_forward_log (diary_id);

alter table public.diary_forward_log enable row level security;
revoke all on public.diary_forward_log from anon, authenticated;

-- 確認用（適用後に別途流す）。3行返れば成功。
-- select table_name from information_schema.tables
--   where table_schema='public' and table_name in ('therapist_diary_forward','diary_forward_log')
-- union all
-- select 'salons.diary_source' from information_schema.columns
--   where table_schema='public' and table_name='salons' and column_name='diary_source';
