-- AI紹介文生成の月間利用枠（第30便・2026-08-24）
--
-- 目的:
--   /mypage の「AIで下書き」を店舗ごとに月間回数で制限する。
--   フクエスワーク契約店には多い枠を出し、契約の付加価値にする（オーナー判断・2026-08-24）。
--
-- 数え方（オーナー確定）:
--   - 写真なしで生成 → text 枠を1消費
--   - 写真ありで生成 → image 枠を1消費（text 枠は減らない）
--   - リセットは毎月1日（カレンダー月・JST）に一斉
--   - 1回のボタン押下＝1消費。150字未満の作り直し（最大2回）でAPIを複数回叩いても消費は1
--   - 生成が失敗した回は記録しない＝消費しない
--
-- ★ 枠の値は salons に直接持たせる。プラン表を別テーブルにすると
--   「この店だけ特別に増やす」がやりにくく、実務で必ず出る要望に応えられないため。
--   既定値（無契約店の枠）はここで決め、フクエスワーク契約店は運営が個別に引き上げる。

-- 1) 店舗ごとの月間枠。null ではなく既定値を入れておき、アプリ側の分岐を減らす。
alter table salons
  add column if not exists ai_copy_quota_text  integer not null default 20,
  add column if not exists ai_copy_quota_image integer not null default 5;

comment on column salons.ai_copy_quota_text  is
  'AI紹介文生成の月間上限（写真なし）。0で機能停止。フクエスワーク契約店は運営が引き上げる。';
comment on column salons.ai_copy_quota_image is
  'AI紹介文生成の月間上限（写真あり）。0にすると写真ありの生成だけ止まる。';

-- 2) 利用ログ。件数を数える台帳であり、監査（どの店がいつ誰の分を作ったか）も兼ねる。
create table if not exists ai_copy_usage (
  id            bigint generated always as identity primary key,
  -- ★ therapists.id は integer（uuid ではない）。既存FKと型を揃える。
  salon_id      bigint  not null references public.salons(id) on delete cascade,
  therapist_id  integer not null references public.therapists(id) on delete cascade,
  -- 'text' = 写真なし / 'image' = 写真あり。どちらの枠を消費したか。
  kind          text   not null check (kind in ('text', 'image')),
  -- 実際にAnthropic APIを叩いた回数（作り直しを含む）。課金額の把握用で、枠の計算には使わない。
  api_calls     integer not null default 1,
  created_at    timestamptz not null default now()
);

-- 月次集計のための索引。(salon_id, created_at) で「今月の件数」を引く。
create index if not exists ai_copy_usage_salon_created_idx
  on ai_copy_usage (salon_id, created_at desc);

comment on table ai_copy_usage is
  'AI紹介文生成の利用ログ（第30便）。月間枠の消費計算と監査に使う。行の削除はしない。';

-- 3) RLS。書き込みは server action（service_role）だけが行う。
--    店舗オーナーは自店の行を読めるようにして、/mypage の残り回数表示に使えるようにする。
alter table ai_copy_usage enable row level security;

drop policy if exists ai_copy_usage_select_own on ai_copy_usage;
create policy ai_copy_usage_select_own on ai_copy_usage
  for select
  using (
    exists (
      select 1 from salons s
      where s.id = ai_copy_usage.salon_id
        and s.owner_id = auth.uid()
    )
  );

-- insert / update / delete のポリシーは作らない＝anon・authenticated からは書けない。
-- service_role は RLS を迂回するので server action からは書ける。
