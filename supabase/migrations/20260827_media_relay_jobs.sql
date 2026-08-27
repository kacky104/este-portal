-- 他媒体への中継ジョブ（第38便・論点② C-2「引き取り型」）。
--
-- ★★★ 何のためか（設計メモ §18-3）
--   駅ちかへ到達できるのは VPS だけ（禁則189）。だが VPS には認証情報もロジックも置かない。
--     [Vercel] 認証情報を復号 → ジョブを1件積む
--        ↓ VPSが CRON_SECRET で引き取る（外向き・ポートを開けない）
--     [VPS]    宛先を allowlist で検査 → 駅ちかへ投げる → 結果を返す（外向き）
--        ↓
--     [Vercel] 結果をパース（ekichikaWorkParse）→ 次のジョブを積む
--   ★ VPSは中身を理解しない。だからVPS側のコードは変更頻度がほぼゼロになり、
--     第36便の「版管理されないコード」問題が構造的に起きない。
--
-- ★★★ このテーブルには秘密が載る
--   ログインのボディにはパスワード、以降のリクエストにはセッションCookieが入る。
--   → request_enc / response_enc は【暗号化してから入れる】（src/lib/relayJob.ts）。
--     暗号文は job id に紐づいている（AAD）ので、別の行へ貼り替えても復号できない。
--   → 終わったジョブの中身は消す（purged_at）。★ 秘密が残り続ける場所を作らない。

create table if not exists public.media_relay_jobs (
  id           uuid        primary key default gen_random_uuid(),
  salon_id     bigint      not null references public.salons(id) on delete cascade,
  provider     text        not null,                    -- 'ekichika' | …
  slot         integer     not null default 1,          -- ★ 掲載枠。枠が増えても行が増えるだけ
  purpose      text        not null,                    -- 'login' | 'read_work' | 'write_work' | 'verify_work'

  status       text        not null default 'queued'
               check (status in ('queued', 'leased', 'done', 'failed', 'expired')),

  -- ★ 暗号化済み。中身は {method,url,headers,body} / {status,headers,bodyPacked} の JSON
  request_enc  text        not null,
  response_enc text,

  -- ★ 復号せずに様子を見るための、秘密ではない値。ログや画面に出してよい
  http_status  integer,
  bytes        integer,

  -- ★ 二重送信の防止（第37便の再送と同じ作法）。attempts を版番号にした compare-and-swap で掴む
  attempts     integer     not null default 0,
  leased_at    timestamptz,
  leased_until timestamptz,

  error        text,                                    -- ★ 平文の秘密を入れないこと
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  purged_at    timestamptz                              -- request_enc/response_enc を消した時刻
);

-- 引き取り（lease）で使う。古いものから1件。
create index if not exists media_relay_jobs_pickup
  on public.media_relay_jobs (status, created_at);

-- ★★★ 同じ店舗×媒体×枠で、走っているジョブは同時に1件だけ。
--   出勤の更新は read → 変更 → write → 再read の順番が崩れると壊れる。
--   「Vercelは次の1件しか積まない」という約束を、DB側でも守らせる。
--   ★ これが無いと、cron の周が重なったときに順序が入れ替わる形の事故が起きうる。
create unique index if not exists media_relay_jobs_one_active
  on public.media_relay_jobs (salon_id, provider, slot)
  where status in ('queued', 'leased');

-- 掃除の対象を引くため（中身がまだ残っている終了済みジョブ）
create index if not exists media_relay_jobs_purge
  on public.media_relay_jobs (updated_at)
  where purged_at is null and status in ('done', 'failed', 'expired');

-- ★ therapist_diary_mail / salon_media_credentials と同じ扱い。
--   RLS 有効・ポリシーなし・anon/authenticated に GRANT なし ＝ service_role からのみ。
alter table public.media_relay_jobs enable row level security;
revoke all on public.media_relay_jobs from anon, authenticated;

comment on table public.media_relay_jobs is
  '他媒体への中継ジョブ（第38便）。request_enc/response_enc は job id に紐づけて暗号化してある。終了後は中身を消す（purged_at）。anon/authenticated には一切開けない。';

comment on column public.media_relay_jobs.request_enc is
  E'{method,url,headers,body} の JSON を暗号化したもの。★ ログインのボディにはパスワード、以降にはセッションCookieが入る。平文で置かない。';

comment on column public.media_relay_jobs.response_enc is
  E'{status,headers,bodyPacked} の JSON を暗号化したもの。bodyPacked は gzip+base64（出勤ページは実測2.3MB）。';

comment on column public.media_relay_jobs.attempts is
  E'版番号。lease は attempts の compare-and-swap で掴む（第37便の再送と同じ作法）。cron の周が重なっても2回投げない。';

comment on column public.media_relay_jobs.leased_until is
  E'この時刻を過ぎたら、落ちた VPS が掴んだままとみなして拾い直してよい。';

comment on column public.media_relay_jobs.purged_at is
  E'request_enc/response_enc を消した時刻。★ 監査のためにメタ（誰の・いつ・どのpurpose・httpステータス）は残し、中身だけ消す。';

comment on column public.media_relay_jobs.error is
  E'失敗理由。★ 平文のパスワード・Cookie・暗号文を入れないこと（ログや画面に出る）。';

-- ★ 次に作るもの（第38便では作っていない）:
--   ・/api/relay/lease   … VPS が1件引き取る（CRON_SECRET）
--   ・/api/relay/result  … VPS が結果を返す。★ ここで次のジョブを積む＝状態遷移の場所
--   ・scripts/relay.sh   … VPS 側。★ リポジトリが正本・VPSがコピー（import.sh と同じ作法）
--   ・掃除の周（purge）

-- 確認用（適用後に別途流す）
-- select column_name, data_type from information_schema.columns
--  where table_schema='public' and table_name='media_relay_jobs' order by ordinal_position;
