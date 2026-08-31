-- 連携の設定行に、エステラブを入れられるようにする（第80便）。
-- ※ Supabase SQL Editor で実行してください（★ コード push より先に適用）。冪等。
--
-- ★★★ いまの制約
--   salon_import_sources.provider は check (provider in ('ekichika')) だった。
--   → エステラブの行を作ろうとすると、この制約で弾かれる。
--
-- ★★★ この適用だけでは何も変わらない。
--   エステラブの行はまだ1つも無い。★ 制約が広がるだけで、挙動は不変。
--   ★ 行を作るのは店舗が /mypage/media/login でログイン情報を登録したとき。
--
-- ★★ 増やす順は「制約 → コード」。逆にすると、コードが先に行を作ろうとして弾かれる。
--   ★ 弾かれたときのエラーは店舗の画面に出る（そして原因が分かりにくい）。

do $$
begin
  if exists (
    select 1 from pg_constraint
     where conname = 'salon_import_sources_provider_check'
       and conrelid = 'public.salon_import_sources'::regclass
  ) then
    alter table public.salon_import_sources
      drop constraint salon_import_sources_provider_check;
  end if;

  alter table public.salon_import_sources
    add constraint salon_import_sources_provider_check
    check (provider in ('ekichika', 'esulove'));
end $$;

comment on column public.salon_import_sources.provider is
  E'連携先の媒体。ekichika=駅ちか / esulove=エステラブ（第80便で追加）。★ 増やすときは src/lib/mediaSites.ts と、この制約の両方を直す。片方だけ直すと、画面には出るのに行が作れない状態になる。';

-- 確認用（適用後に別途流す）
-- ★ 制約が広がったこと（エラーにならないのが正しい。★ 実際には行を作らないので rollback する）:
-- begin;
--   insert into public.salon_import_sources (salon_id, provider, slot, is_enabled)
--   values ((select id from public.salons limit 1), 'esulove', 1, false);
-- rollback;
--
-- ★ 知らない媒体は弾かれること（これはエラーになるのが正しい）:
-- begin;
--   insert into public.salon_import_sources (salon_id, provider, slot, is_enabled)
--   values ((select id from public.salons limit 1), 'nanika', 1, false);
-- rollback;
--
-- ★ いまエステラブの行が0件であること:
-- select provider, count(*) from public.salon_import_sources group by provider;
