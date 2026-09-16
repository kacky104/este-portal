-- コネックエフ 第1弾 1c：女性一覧・編集のためのテーブル（第397便・2026-09-17・カッキーさん）
-- ※ Supabase SQL Editor で実行してください（コード push より先に適用）。冪等（再実行しても安全）。
--
-- ★★★ この適用だけでは何も変わりません。
--   ・salons.conecf_enabled_at は既定 null ＝ どの店にも効かない（/mypage の編集はこれまでどおり）。
--   ・新しい2つの表は空。★ 行が無い＝「これまでと同じ」に倒れる作り。
--
-- ★★ 決めたこと（設計メモ_コネックエフ第1弾_テーブルと画面_2026-09-17.md §3・§4・§8）
--   ・親データは今の therapists / therapist_schedules をそのまま使う（フクエスへは送らない＝同じ行を読む）
--   ・ベンリーにあってフクエスに無い項目だけを conecf_therapist_profiles に足す
--   ・案B：コネックエフを使う店（conecf_enabled_at あり）は、他サイトへ送る項目を /mypage で直せなくする
--   ・読み書きはサーバー（service_role）だけ。★ 画面は server action を通す（assertSalonOwner で本人確認）

-- ============================================================
-- 1. salons：コネックエフの元栓と日付変更時刻
-- ============================================================
alter table public.salons
  add column if not exists conecf_enabled_at      timestamptz,
  add column if not exists conecf_day_change_hour smallint not null default 6;

comment on column public.salons.conecf_enabled_at is
  E'コネックエフを使い始めた日時（第397便）。★ null ＝ 使っていない。★ 入っている店は、セラピストの名前・年齢・サイズ・写真・新人・公開・出勤・今すぐを /mypage で編集できなくなる（案B）。★ 入れるのは運営だけ。';
comment on column public.salons.conecf_day_change_hour is
  E'日付を切り替える時刻（時・JST）。★ 既定 6（カッキーさんの決定）。★ 今すぐ一括・当日スケジュールで使う。';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'salons_conecf_day_change_hour_range' and conrelid = 'public.salons'::regclass
  ) then
    alter table public.salons add constraint salons_conecf_day_change_hour_range
      check (conecf_day_change_hour between 0 and 23);
  end if;
end $$;

-- ============================================================
-- 2. conecf_therapist_profiles：フクエスに無い項目（1人1行）
-- ============================================================
create table if not exists public.conecf_therapist_profiles (
  therapist_id  bigint      primary key references public.therapists(id) on delete cascade,
  name_kana     text,
  name_hira     text,
  name_romaji   text,
  joined_on     date,
  birth_date    date,
  height        smallint check (height is null or height between 100 and 230),
  bust          smallint check (bust   is null or bust   between 50 and 150),
  cup           text     check (cup    is null or cup ~ '^[A-Z]$'),
  waist         smallint check (waist  is null or waist  between 40 and 120),
  hip           smallint check (hip    is null or hip    between 50 and 150),
  weight        smallint check (weight is null or weight between 30 and 150),
  blood_type    text     check (blood_type is null or blood_type in ('A','B','O','AB')),
  style         text,
  look_type     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.conecf_therapist_profiles is
  E'コネックエフのセラピストの追加項目（第397便）。★ フクエスに既にある項目（名前・年齢・body_type・写真・新人・公開）は therapists に書く。★ 保存時に therapists.age / body_type も同時に書き、フクエスの表示を合わせる。★ service_role 専用（birth_date を公開側から読ませない）。';

alter table public.conecf_therapist_profiles enable row level security;
revoke all on public.conecf_therapist_profiles from anon, authenticated;

-- ============================================================
-- 3. conecf_therapist_targets：その人をどのサイトへ送るか
-- ============================================================
create table if not exists public.conecf_therapist_targets (
  therapist_id  bigint      not null references public.therapists(id) on delete cascade,
  provider      text        not null,
  slot          smallint    not null default 1,
  enabled       boolean     not null default true,
  updated_at    timestamptz not null default now(),
  primary key (therapist_id, provider, slot)
);

comment on table public.conecf_therapist_targets is
  E'セラピスト×サイト×枠の「送る／送らない」（第397便）。★ 行が無ければ【送る】。★ 外したい人だけ enabled=false の行を作る。★ service_role 専用。';

alter table public.conecf_therapist_targets enable row level security;
revoke all on public.conecf_therapist_targets from anon, authenticated;
