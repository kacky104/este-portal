-- 他媒体の管理画面ログイン情報（店舗 × 媒体 × 枠）。第38便・論点②の決定にもとづく。
--
-- ★★★ 何のために作るか
--   第3弾（駅ちかへ出勤をフォームで書く）には、店舗の他媒体アカウントが要る。
--   これは第1弾の「公開ページを読む」とは責任の重さが違う。設計メモ §5-2 論点② の決定:
--
--     C-2「認証情報もロジックもフクエス。VPSは中継のみ。中継は引き取り型」
--
--   → 認証情報はここ（Supabase）にだけ置く。VPSには置かない。
--     VPSは「このリクエストを投げて」というジョブを引き取って中継するだけで、中身を理解しない。
--   ★ これにより、画面から登録・失効ができ、棚卸しと監査ができる。
--     VPSに置くと ssh して消すまで生き続ける（失効できない）。
--
-- ★★ 正直に書いておくこと: **VPSが侵害されれば、通過する認証情報は読める。**
--   この設計で変わるのは「漏れ方」（常時ディスク上か、通過するだけか）と「失効できるか」だけ。
--   「安全になった」と丸めない。
--
-- ★★★ 主キーに slot を入れている理由（第37便 §3 / 第38便 §5-2 と同じ教訓）
--   駅ちかは同じ店舗が複数の掲載枠を持つ。ラビリンス様の実例:
--     掲載A（博多 46440）  shopid 37168  在籍37人   さらの castId 5232208
--     掲載B（中洲 29218）  shopid 17010  在籍64人   さらの castId 4624191
--   ★ 同じ人物でも castId は枠ごとに別。ログインも枠ごとに別。
--   'ekichika_b' のようにラベルを増やす形にすると3枠目で破綻する。
--   **枠が増えても行が増えるだけ**にすること。

create table if not exists public.salon_media_credentials (
  salon_id         bigint      not null references public.salons(id) on delete cascade,
  provider         text        not null,               -- 'ekichika' | 'esulove' | …
  slot             integer     not null default 1,     -- ★ 同一媒体の複数掲載。1始まり

  -- ── ログインフォームの3項目（第38便 §17-9 で実測）──
  --   <form action=".../admin/login" method="post">
  --     name="email"  name="password"  name="shopid"
  -- ★ 2点（IDとパスワード）だと思って作ると1つ落ちる。
  shop_id          text        not null,               -- shopid。ラビリンスAは '37168'
  login_id         text        not null,               -- email 欄に入れる値。★ メールアドレスとは限らない
  password_enc     text        not null,               -- ★ 暗号化済み。src/lib/mediaCredentials.ts

  is_enabled       boolean     not null default true,  -- ★ false で次の周から止まる（失効）
  last_verified_at timestamptz,                        -- 接続テストが最後に成功した時刻
  last_error       text,                               -- 直近の失敗理由（平文の秘密値を入れないこと）
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (salon_id, provider, slot)
);

-- ★★★ therapist_diary_forward / therapist_diary_mail と同じ扱い（第27便・第36便の判断を踏襲）。
--   RLS 有効・ポリシーなし・anon/authenticated に GRANT なし ＝ service_role からのみ読める。
--   ★ salons に列として持たせてはいけない（公開ページが anon で SELECT するため）。
alter table public.salon_media_credentials enable row level security;
revoke all on public.salon_media_credentials from anon, authenticated;

comment on table public.salon_media_credentials is
  '他媒体の管理画面ログイン情報（店舗×媒体×枠）。password_enc は AES-256-GCM で暗号化し、鍵は Vercel 環境変数 MEDIA_CRED_KEY。anon/authenticated には一切開けない（第38便）。';

comment on column public.salon_media_credentials.slot is
  E'同一媒体の複数掲載を区別する枠番号（1始まり）。駅ちかは同じ店舗が複数の掲載を持ち、掲載ごとに shopid も castId も別（第38便）。';

comment on column public.salon_media_credentials.shop_id is
  E'ログインフォームの shopid。駅ちかでは公開ページの画像パス images.ranking-deli.jp/<shopid>/ から機械的に取れる（第38便・ラビリンス1件で確認。2店目で再現したら規則として扱う）。';

comment on column public.salon_media_credentials.login_id is
  E'ログインフォームの email 欄に入れる値。★ メールアドレスとは限らないので email という名前にしない。';

comment on column public.salon_media_credentials.password_enc is
  E'"v1.<iv>.<tag>.<暗号文>"（base64）。暗号文は salon_id|provider|slot に紐づいており（AAD）、別の行へコピーしても復号できない。';

comment on column public.salon_media_credentials.is_enabled is
  E'false にすると次の周から使わない＝失効。VPSに認証情報を置いていないので、これが素直に効く（第38便・論点②）。';

comment on column public.salon_media_credentials.last_error is
  E'直近の失敗理由。★ 平文のパスワードや暗号文を入れないこと（ログや画面に出る）。';

-- ★ 次に足すもの（第38便では作っていない）:
--   ・監査ログ（誰の認証情報を、いつ、何のために使ったか）
--   ・中継ジョブのテーブル（Vercel が積み、VPS が引き取る）

-- 確認用（適用後に別途流す）
-- select column_name, data_type from information_schema.columns
--  where table_schema='public' and table_name='salon_media_credentials' order by ordinal_position;
