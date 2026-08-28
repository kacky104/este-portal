-- 取り込みを「店舗 × 媒体 × 枠」に拡張する（第42便・第3弾の下ごしらえ）
--
-- ★★★ なぜ要るか（設計メモ_第3弾書き込み画面_2026-08-28 §7）
--   カッキーさんの決定①「掲載Bはフクエスが枠2として書く。中身はA・Bで同じでよい」。
--   中身が同じでよいので差分は作らなくてよいが、★ 番号だけは枠ごとに違う。
--
--     さら（同一人物）
--       掲載A（46440 / shopid 37168） … girl_id = castId 5232208
--       掲載B（29218 / shopid 17010） … girl_id = castId 4624191
--
--   いまのスキーマは、この2枠を持てない場所が2つある:
--     salon_import_sources … unique (salon_id, provider)  ＝ 1店舗1媒体1掲載しか読めない
--     therapists.import_cast_id … text 1本                ＝ 枠2の castId を置く場所が無い
--
--   ★ salon_media_credentials は最初から (salon_id, provider, slot) にしてある（第38便）。
--     therapist_diary_forward も第37便で (therapist_id, provider, slot) に揃えてある。
--     ここだけが取り残されているので、同じ形にそろえる。
--
-- ★★ 方針は第37便と同じ:「媒体は割らない。枠が増えても行が増えるだけ」。
--   'ekichika_b' のようにラベルを増やすと3枠目で破綻する。
--
-- ★ 当ててあっても空でも安全に通る（冪等）。既存行はすべて slot=1 に落ちる。

-- ────────────────────────────────────────────────────────────
-- 1. 取り込み設定に枠を足す
-- ────────────────────────────────────────────────────────────
alter table public.salon_import_sources
  add column if not exists slot smallint not null default 1;

comment on column public.salon_import_sources.slot is
  E'同一媒体の何枠目か（1,2,3…）。駅ちかは同じ店舗が別エリア・別IDで複数掲載を持つ（博多駅周辺＋中洲・天神など）。枠ごとに shopid も castId も別（第38便§17-11・第42便）。';

-- ★ unique (salon_id, provider) → unique (salon_id, provider, slot) へ張り替える。
--   制約名は create table のインライン unique から機械的に付いた名前（既定は
--   salon_import_sources_salon_id_provider_key）だが、環境で違いうるので定義から引く。
do $$
declare
  c text;
begin
  select con.conname into c
    from pg_constraint con
   where con.conrelid = 'public.salon_import_sources'::regclass
     and con.contype  = 'u'
     and pg_get_constraintdef(con.oid) = 'UNIQUE (salon_id, provider)';
  if c is not null then
    execute format('alter table public.salon_import_sources drop constraint %I', c);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.salon_import_sources'::regclass
       and conname  = 'salon_import_sources_salon_provider_slot_key'
  ) then
    alter table public.salon_import_sources
      add constraint salon_import_sources_salon_provider_slot_key
      unique (salon_id, provider, slot);
  end if;
end $$;

-- ────────────────────────────────────────────────────────────
-- 2. セラピストの媒体IDを「枠ごと」に持てる箱
-- ────────────────────────────────────────────────────────────
-- ★★★ therapists.import_cast_id は消さない（当面は併存）。
--   理由: 取り込みの照合はいま毎周この列を読んでいる。列を落として同時に読み替えると、
--   もし新しい経路に穴があったとき【全店の照合が一度に壊れる】。
--   第40便§7「マイグレーション → デプロイの順序依存」と同じ危険を、列の削除でも作らない。
--   → この便は「足して・埋めて・両方に書く」まで。落とすのは読み替えが実地で1周まわってから。
create table if not exists public.therapist_media_ids (
  therapist_id     bigint      not null references public.therapists(id) on delete cascade,
  provider         text        not null,               -- 'ekichika' | 'esulove' | …
  slot             smallint    not null default 1,     -- ★ 同一媒体の何枠目か。1始まり
  external_cast_id text        not null,               -- 駅ちかの castId（= 管理画面の girl_id）
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (therapist_id, provider, slot)
);

comment on table public.therapist_media_ids is
  'セラピストの媒体側ID（セラピスト×媒体×枠）。駅ちかでは castId ＝ 管理画面の girl_id。同一人物でも枠が違えば別番号（第38便§17-11）。service_role専用（第42便）。';

comment on column public.therapist_media_ids.external_cast_id is
  E'媒体側の番号。駅ちかの castId は公開URLに出ている値なので秘密ではないが、公開表示には使わない。';

-- 照合は「その店の在籍（therapist_id の集合）× provider × slot」で引くので主キーで足りる。
-- 逆引き（この castId は誰か）を枠横断でやりたくなったときのために1本だけ足しておく。
create index if not exists idx_therapist_media_ids_lookup
  on public.therapist_media_ids (provider, slot, external_cast_id);

-- ★ RLS。therapist_diary_forward / salon_media_credentials と同じ扱い。
--   anon/authenticated には開けない（公開ページが読む必要がまったく無い）。
alter table public.therapist_media_ids enable row level security;
revoke all on public.therapist_media_ids from anon, authenticated;

-- ────────────────────────────────────────────────────────────
-- 3. いまの import_cast_id を枠1として写す（冪等）
-- ────────────────────────────────────────────────────────────
-- ★ 既存の import_cast_id はすべて駅ちかの枠1（いま読んでいるのは1掲載だけ）。
insert into public.therapist_media_ids (therapist_id, provider, slot, external_cast_id)
select t.id, 'ekichika', 1, t.import_cast_id
  from public.therapists t
 where t.import_cast_id is not null
   and t.import_cast_id <> ''
on conflict (therapist_id, provider, slot) do nothing;

-- ────────────────────────────────────────────────────────────
-- 確認用（適用後に別途 SQL Editor で流す）
-- ────────────────────────────────────────────────────────────
-- ① 列と制約
-- select column_name from information_schema.columns
--  where table_schema='public' and table_name='salon_import_sources' and column_name='slot';
-- select conname, pg_get_constraintdef(oid) from pg_constraint
--  where conrelid='public.salon_import_sources'::regclass and contype='u';
--   → salon_import_sources_salon_provider_slot_key | UNIQUE (salon_id, provider, slot)  の1行だけ
--
-- ② 写しの件数が一致すること（★ ここが合わないと照合が減る）
-- select
--   (select count(*) from public.therapists where import_cast_id is not null and import_cast_id <> '') as 旧,
--   (select count(*) from public.therapist_media_ids where provider='ekichika' and slot=1) as 新;
