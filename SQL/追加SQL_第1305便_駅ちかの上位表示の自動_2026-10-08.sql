-- 第1305便（2026-10-08・カッキーさんの決定）: 駅ちかの「上位表示する」ボタンを、コネックエフから自動で押す。
--   ★ フクエスの自動上位表示（第385便）と同じ形: ON/OFF・時間帯・間隔（10/15/20/30/60分）。店舗様がコネックエフで設定する。
--   ★ 列は salon_import_sources（店舗×サイト×枠の行）に足す。★ 使うのは provider = 'ekichika' の行だけ。新しい表は無い。
--   ★ 既定は OFF（bump_auto = false）＝ラビリンス様のほかは、店舗様が入れるまで何も起きない。
--   ★ 順番: push の前でも後でもよい（列が無いあいだ、画面は「準備中」・周は何もしない）。
--   ★ Supabase ダッシュボードの SQL Editor で実行してください。冪等（何度流しても同じ）。

-- ── 1. 設定（店舗様がコネックエフで変える）──
alter table public.salon_import_sources
  add column if not exists bump_auto         boolean not null default false,
  add column if not exists bump_start_min    integer not null default 600,    -- 10:00（0時からの分）
  add column if not exists bump_end_min      integer not null default 1380,   -- 23:00
  add column if not exists bump_interval_min integer not null default 20,
  -- ── 2. 状態（中継の流れが、駅ちかの管理画面トップを読んで書く）──
  add column if not exists bump_last_at      timestamptz,   -- 駅ちかの「最終更新日」＝最後に上位表示された時刻（手で押した分も入る）
  add column if not exists bump_remaining    integer,       -- 駅ちかの「本日の上位表示 残り回数」
  add column if not exists bump_quota        integer,       -- 1日の回数（ラビリンス様は40）
  add column if not exists bump_read_at      timestamptz,   -- 上の3つを読んだ時刻
  add column if not exists bump_auto_at      timestamptz;   -- 周が最後に流れを始めた時刻（同じ枠を立て続けに始めない）

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'salon_import_sources_bump_range' and conrelid = 'public.salon_import_sources'::regclass
  ) then
    alter table public.salon_import_sources add constraint salon_import_sources_bump_range check (
      bump_start_min    between 0 and 1439
      and bump_end_min  between 0 and 1439
      and bump_interval_min in (10, 15, 20, 30, 60)
    );
  end if;
end $$;

comment on column public.salon_import_sources.bump_auto is
  E'第1305便: 駅ちかの上位表示を自動で押すか（provider=ekichika の行だけ使う）。★ 既定 false。店舗様がコネックエフ「駅ちか上位表示」で入れる。';
comment on column public.salon_import_sources.bump_interval_min is
  E'第1305便: 自動で押す間隔（分）。★ 10 / 15 / 20 / 30 / 60（src/lib/bumpAuto.ts の BUMP_AUTO_INTERVALS と同じ）。';
comment on column public.salon_import_sources.bump_last_at is
  E'第1305便: 駅ちかの管理画面トップの「最終更新日」。★ 店舗様が駅ちかで手で押した分も入る（自動の間隔はここから数える）。';

-- 周が見る行を引くため（ON の行だけ＝ふだんは数行）
create index if not exists salon_import_sources_bump_auto_idx
  on public.salon_import_sources (salon_id)
  where bump_auto = true;

notify pgrst, 'reload schema';

-- ── 3. ラビリンス様（salon 6）の最初の設定: 10:00〜23:00・20分ごと・ON（カッキーさんの決定・10/8）──
--   ★ 1日40回ちょうど（10:00 に1回、あとは20分ごと）。★ 枠1の駅ちかの行だけ。
update public.salon_import_sources
   set bump_auto = true, bump_start_min = 600, bump_end_min = 1380, bump_interval_min = 20
 where salon_id = 6 and provider = 'ekichika' and slot = 1;

-- ★ 確認（ラビリンス様の行が1行。bump_auto が true・600・1380・20 ならOK）
select salon_id, provider, slot, bump_auto, bump_start_min, bump_end_min, bump_interval_min, bump_remaining, bump_last_at
  from public.salon_import_sources
 where provider = 'ekichika' and (bump_auto = true or salon_id = 6);
