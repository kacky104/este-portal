-- 他媒体連携の監査ログ（第38便の残り物・第39便）
--
-- ★★★ 何のために作るか
--   フクエスは店舗の他媒体アカウントを預かり、店舗の代わりにログインして出勤を書き換える。
--   ★ その射程は駅ちか1つに収まらない（第38便 §6）:
--     駅ちかの管理画面には cocoa-job.jp へ email と password を hidden で埋めた
--     自動ログインフォームが入っている。**駅ちかを開ける＝店舗の他サービスも開ける。**
--   → 「預かった認証情報を、いつ、何のために使ったか」を**店舗に示せる**必要がある。
--     これが無いと、同意文言は「信じてください」以上のことを言えない。
--
-- ★★★ media_relay_jobs との違い（役割が違うので分ける）
--   media_relay_jobs … 【運び方】の記録。HTTP1往復ごと。★ 中身は掃除の周で消える（purged_at）
--   salon_media_audit … 【何をしたか】の記録。業務のできごとごと。★ 消えない
--   ★ 同じ場所に混ぜない。第38便 §「育つログで生存を示さない」と同じ話で、
--     目的が違う2つを1つのテーブルに入れると、片方の都合でもう片方が使えなくなる。
--
-- ★★ 店舗に見せる前提で作る（2026-08-27 の決定）。
--   第38便 §7-2「責任の所在は店舗・気づける仕組みはこちら」。
--   免責だけ置くと、エステラブへの日記が止まったことに何ヶ月も誰も気づかない形になる。
--   ★ summary は【店舗が読んで分かる日本語1行】であること。ここに英語のエラー文字列を入れない。

create table if not exists public.salon_media_audit (
  id         bigserial   primary key,
  salon_id   bigint      not null references public.salons(id) on delete cascade,
  provider   text        not null,                    -- 'ekichika' | 'esulove' | …
  slot       integer     not null default 1,          -- ★ 掲載枠。枠が増えても行が増えるだけ

  -- 何が起きたか。★ 増やすときは src/lib/mediaAudit.ts の MEDIA_AUDIT_EVENTS と揃える
  --   credential_saved    認証情報を登録・更新した
  --   credential_disabled 失効させた（画面OFF）
  --   login               媒体にログインした
  --   read_work           出勤を読んだ
  --   write_work          出勤を書き換えた
  --   verify_work         書き換えた結果を照合した
  --   relay_gave_up       3回失敗したので諦めた
  --   relay_expired       中継役が掴んだまま戻らなかったので打ち切った
  --   relay_rejected      宛先の検査で弾いた
  --   selftest            認証情報を使わない疎通確認
  event      text        not null,

  -- どうなったか。★ 'ok' 以外は理由が summary に出ていること
  outcome    text        not null check (outcome in ('ok', 'failed', 'stopped')),

  -- ★★★ 店舗が読んで分かる日本語1行。ここだけ読めば何が起きたか分かること
  summary    text        not null,

  -- 件数など。★ 秘密を入れない。src/lib/mediaAudit.ts の scrubAuditDetail が落とす
  detail     jsonb,

  -- 誰が引き起こしたか。'system'（cron）/ 'shop:<auth_user_id>' / 'admin:<auth_user_id>'
  -- ★ 生の認証情報とは無関係。「画面から人が押した」のか「自動で回った」のかを分ける
  actor      text        not null default 'system',

  -- どの中継ジョブに由来するか。★ 外部キーにしない：ジョブは掃除で消えても監査は残す
  job_id     uuid,

  created_at timestamptz not null default now()
);

-- 店舗の画面は「新しい順に最近ぶん」を出す
create index if not exists salon_media_audit_salon_idx
  on public.salon_media_audit (salon_id, created_at desc);

-- 媒体側の障害を追うとき（「駅ちかのAだけ失敗している」を引く）
create index if not exists salon_media_audit_target_idx
  on public.salon_media_audit (provider, slot, created_at desc);

-- ★★★ 書き換えも削除もできないようにする。
--   監査ログの値は「後から直せないこと」にある。直せるなら、都合の悪い行が消えていないと
--   誰にも言えない。★ service_role は RLS を越えるので、RLS では止められない。
--   トリガーで止めるのが唯一きく手段。
--   ※ 本当に消す必要が出たら、この関数を drop してから消し、必ず作り直すこと。
create or replace function public.salon_media_audit_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception '監査ログは追記専用です（% は許可されていません）', tg_op;
end;
$$;

drop trigger if exists salon_media_audit_no_update on public.salon_media_audit;
create trigger salon_media_audit_no_update
  before update or delete on public.salon_media_audit
  for each row execute function public.salon_media_audit_append_only();

-- ★ salon_media_credentials / media_relay_jobs と同じ扱い。
--   RLS 有効・ポリシーなし・anon/authenticated に GRANT なし ＝ service_role からのみ。
--   ★ 店舗に見せるのは「画面をサーバー側で組んで渡す」形にすること。
--     anon に開けると、salon_id を変えるだけで他店の記録が読める。
alter table public.salon_media_audit enable row level security;
revoke all on public.salon_media_audit from anon, authenticated;

comment on table public.salon_media_audit is
  '他媒体連携の監査ログ（第39便）。預かった認証情報をいつ何のために使ったかの記録。★ 追記専用（更新・削除はトリガーで拒否）。anon/authenticated には一切開けない。';

comment on column public.salon_media_audit.summary is
  E'★ 店舗が読んで分かる日本語1行。英語のエラー文字列や技術用語をそのまま入れないこと。';

comment on column public.salon_media_audit.detail is
  E'件数など。★ パスワード・Cookie・暗号文・宛先URLを入れないこと（src/lib/mediaAudit.ts の scrubAuditDetail が落とすが、入れない側の責任）。';

comment on column public.salon_media_audit.job_id is
  E'由来した media_relay_jobs.id。★ 外部キーにしない：ジョブは掃除の周で中身を消され、いずれ行ごと整理されても、監査は残す。';

comment on column public.salon_media_audit.actor is
  E'system（cron）/ shop:<auth_user_id> / admin:<auth_user_id>。「自動で回った」のか「人が画面から押した」のかを分ける。';

-- 確認用（適用後に別途流す）
-- select column_name, data_type from information_schema.columns
--  where table_schema='public' and table_name='salon_media_audit' order by ordinal_position;
-- ★ 追記専用が効いているか（エラーになれば成功）:
-- update public.salon_media_audit set summary='x' where id = (select min(id) from public.salon_media_audit);
