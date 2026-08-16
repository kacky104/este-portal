-- email_events: Resend の Webhook から届く【メール配信トラブル】の受け皿（2026-08-16 / 第19便）
--
-- ── なぜ入れるか ────────────────────────────────────────────
-- これまで、送ったメールが【後から届かなくなった】ことに誰も気づけなかった。
--   ・resend.emails.send() の戻り値は「Resend が受け付けた」までしか分からない
--   ・宛先の打ち間違い・受信箱の満杯・迷惑メール判定は、送信の【あと】に非同期で起きる
--   ・src/app/lib/booking/sendBookingMail.ts のコメントにもそう書いてある
--     （2026-08-16 に実機で確認済み。Resend のログには Bounced が残るが、アプリ側には何も返らない）
-- 店の booking_email が間違っていると、ネット予約は入るのに店には何も届かない＝予約の取りこぼし。
-- 9/1 の稼働前に、ここだけは埋めておく必要がある。
--
-- ── 何を記録するか ──────────────────────────────────────────
-- Resend 側の購読は【トラブル4種だけ】にする（2026-08-16 オーナー判断）:
--   email.bounced          … 宛先に届かなかった（恒久 or 一時）
--   email.complained       … 受信者が迷惑メール報告した
--   email.delivery_delayed … 配信が遅延している（まだ諦めていない）
--   email.failed           … Resend 側で送信そのものが失敗した
-- delivered / sent / opened / clicked は購読しない。送信数と同じだけ行が増えるだけで、
-- 「気づけない」問題の解決には要らないため。あとから購読を足せば、このテーブルはそのまま使える。
--
-- ★ event_type に CHECK を付けない（禁則77 と同じ理由）。
--   Resend のイベント種別は今後も増える。DB で縛ると、購読を1つ足しただけで
--   Webhook が 500 を返し続け、Svix が延々リトライして【他のイベントまで詰まる】。
--   種別の妥当性はアプリ側（lib/email/eventTypes.ts）で見る。
--
-- ★ svix_id に unique を付ける（重複配送の排除）。
--   Svix は「少なくとも1回」配送なので、同じイベントが2回来ることがある。
--   unique 違反（23505）は Webhook 側で「処理済み」として静かに 200 を返す。
--   ※ Postgres の unique は NULL を重複とみなさないので、svix_id が無い経路（手動投入・
--     将来のバックフィル）でも詰まらない。
--
-- ── 適用の順番 ★先にDB → あとからコード（禁則65 と同じ向き）────
-- 新テーブルなので、コードを先に出すとイベントが来ても INSERT が全部失敗する。
-- Svix はリトライしてくれるが、リトライ上限を過ぎたイベントは【永久に失われる】。
--   1. この SQL を Supabase の SQL Editor で流す
--   2. コードをデプロイする
--   3. 最後に Resend のダッシュボードで Webhook を登録する（URL とシークレット）
-- 3 を最後にするのは、登録した瞬間からイベントが飛んでくるため。
--
-- ★ Supabase ダッシュボードの SQL Editor で実行してください（冪等）。

create table if not exists public.email_events (
  id uuid primary key default gen_random_uuid(),

  -- Svix の配送ID。重複配送の排除に使う（unique・下の索引参照）。
  svix_id text,

  -- 'email.bounced' などのイベント名。★CHECK は付けない（上の説明を参照）。
  event_type text not null,

  -- Resend が採番したメールID。Resend のダッシュボード（Logs）と突き合わせるための鍵。
  email_id text,
  -- SMTP の Message-ID。受信側のログと突き合わせたいときに使う。
  message_id text,

  from_email text,                          -- 送信元（yoyaku@ / unei@ の別が分かる）
  to_emails text[] not null default '{}',   -- 宛先。Resend は配列で寄こす
  subject text,

  -- bounce の中身（email.bounced のときだけ入る）。
  --   bounce_type     … 'Permanent'（恒久・宛先が存在しない等）/ 'Transient'（一時）/ 'Undetermined'
  --   bounce_sub_type … 'General' / 'Suppressed' / 'MailboxFull' など
  bounce_type text,
  bounce_sub_type text,
  bounce_message text,

  -- ★ 宛先を salons.booking_email と突き合わせて特定できた店（2026-08-16 追加）。
  --   「どの店の予約通知が届いていないのか」を運営が一目で分かるようにするための列。
  --   突き合わせは Webhook 側で行う（DB のトリガーにはしない。作法を1か所に寄せるため）。
  salon_id bigint references public.salons(id) on delete set null,
  -- 店名のスナップショット。salon_id が消えても「どこ宛だったか」を残すため（履歴の意味を守る）。
  salon_name text,

  -- Resend が「イベントが起きた」と言っている時刻（created_at はこちらの受信時刻）。
  occurred_at timestamptz not null,

  -- 生の JSON をそのまま残す。列に起こしていない情報を後から掘れるようにするための保険。
  payload jsonb not null,

  -- 運営が「対応した」と印を付けたか。未対応の件数を管理画面のバッジに出す。
  resolved boolean not null default false,
  resolved_at timestamptz,

  created_at timestamptz not null default now()
);

-- 重複配送の排除。unique index にしてあるのは、列制約より後から張り直しやすいため。
create unique index if not exists idx_email_events_svix on public.email_events (svix_id);

-- 一覧は新しい順に読む。
create index if not exists idx_email_events_occurred on public.email_events (occurred_at desc);

-- 未対応バッジ用。件数だけ数えるので部分索引にして小さく保つ。
create index if not exists idx_email_events_unresolved
  on public.email_events (occurred_at desc) where resolved = false;

-- 「この店の通知は届いているか」を店ごとに引くため。
create index if not exists idx_email_events_salon
  on public.email_events (salon_id, occurred_at desc) where salon_id is not null;

comment on table public.email_events is
  'Resend Webhook から届くメール配信トラブルの記録（bounced / complained / delivery_delayed / failed）。書き込みはサーバー(service_role)のみ。閲覧は運営のみ。';
comment on column public.email_events.svix_id is
  'Svix の配送ID。同じイベントが2回届いたときの重複排除に使う（unique）。';
comment on column public.email_events.salon_id is
  '宛先が salons.booking_email に一致した店。Webhook 側で突き合わせて入れる。一致しなければ null（運営宛 unei@ の通知など）。';

alter table public.email_events enable row level security;

-- 運営のみ全操作可。公開ポリシーは作らない（INSERT は service_role が RLS を迂回して行う）。
-- 管理者UUIDは listing_inquiries / hp_inquiries と同じものを使う。
drop policy if exists "admin_all_email_events" on public.email_events;
create policy "admin_all_email_events"
  on public.email_events for all
  using (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid)
  with check (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid);

-- 確認用（適用後に別途流す）。
-- select event_type, count(*) from public.email_events group by event_type order by 1;
-- select occurred_at, event_type, to_emails, bounce_type, salon_name from public.email_events order by occurred_at desc limit 20;
