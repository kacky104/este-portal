-- 取り込み間隔の既定を60→15にし、即ヒメを使う店には上限を強制する（第40便）。
--
-- ★★★ なぜ要るか（第40便の最後に見つけた罠）
--   salon_import_sources.import_interval_min の既定は 60 だった（20260826_import_interval.sql）。
--   一方、取り込み枠の期限は 20分（ingest-list/route.ts の IMASUGU_IMPORT_MINUTES）で、
--   公開側は available_until_import > now() を見て「今すぐ」を出す。
--
--     15分の店: 00:00 周（until 00:20）→ 00:15 周（until 00:35）… 期限前に更新 → 途切れない
--     60分の店: 00:00 周（until 00:20）→ 00:20 期限切れ →★40分消える→ 01:00 次の周
--
--   ★ つまり既定のままの店は【20分出て40分消える】。エラーは出ない。
--     「駅ちかで即ヒメなのに、フクエスで出たり消えたりする」という気づきにくい形で壊れる。
--   ★ IMASUGU_IMPORT_MINUTES = 20 は「次の周（15分間隔）を少し越える」ように選ばれた数字で、
--     15分間隔を前提にしている。間隔が20分を越えた瞬間、「保険」が「寿命」に変わる。
--
--   ★ 有効6店はすべて手で15分に揃えてあるので、既定60は【誰も使っていない値】だった。
--     つまり新しく足す店舗だけが踏む罠。9月1日オープンで店舗が増えるので先に塞ぐ。
--
-- ★★★ 禁則271（総量で決める）との関係
--   禁則271の「100店・15分＝約440件/時は今朝（343件/時）より重い」は、
--   ★ 6店と100店を比べていて、方式の比較になっていない。同じ100店で揃えると:
--       旧方式・毎時 … 約5,700件/時 ／ 新方式・15分 … 約440件/時（★ 13分の1）
--   「1周343件・12分 → 7件・約19秒」の効果は、店舗数を16倍にしても飲み込める。
--   ★ 総量に上限を持つこと自体は正しいが、その道具は【既定値の不平等】ではなく【全体の上限】。
--     同じ料金の店舗で更新頻度が違う理由がなく（公平性）、しかも60分は即ヒメを壊す。
--   ★ 総量の懸念は本物: 駅ちかは AWS WAF でデータセンターIPを弾き（禁則189）、
--     いま通っているのは ConoHa VPS のIP 1本だけ。店舗が増えたら【全店一律に】間隔を上げること。
--   ★ まだ測っていない: 相手にとっての重さは件数ではなく転送量かもしれない
--     （駅ちかのHTMLは 250〜345KB・アイリスは512KB。100店・15分で約130MB/時）。
--
-- ★★ 冪等（禁則254）。既定値を変えるだけで、【既存のどの行の値も変えない】。
--    いまの6店はすでに15分なので、この適用で挙動は変わらない。

-- ① 既定を15に
alter table public.salon_import_sources
  alter column import_interval_min set default 15;

comment on column public.salon_import_sources.import_interval_min is
  '取り込みの最短間隔（分）。/api/import/targets?mode=list が last_run_at と突き合わせて、経過していない店を返さない（第36便）。既定15（第40便で60から変更）。mode=full は無視する。★ import_imasugu=true の店は20分以下でなければならない（下の CHECK 制約・理由は第40便 §10）。';

-- ② 即ヒメを使う店には上限を強制する
--
-- ★★ なぜ「テスト」ではなく「DB制約」か
--   この列は運用の SQL（管理画面ではなく Supabase の SQL エディタ）で直接いじる。
--   アプリを通らない更新でも効かせたいので、止められるのは制約だけ。
--   第39便 §3 の「service_role は RLS を越えるのでトリガーが唯一きく手段」と同じ考え方。
--
-- ★ 20 という数字は ingest-list/route.ts の IMASUGU_IMPORT_MINUTES と揃っている。
--   ★ 片方だけ変えると即ヒメがちらつく。tools-test-imasugu-columns.mjs が両者の整合を見張っている。
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'salon_import_sources_imasugu_interval_check'
       and conrelid = 'public.salon_import_sources'::regclass
  ) then
    alter table public.salon_import_sources
      add constraint salon_import_sources_imasugu_interval_check
      check (import_imasugu = false or import_interval_min <= 20);
  end if;
end $$;

-- 確認用（適用後に別途流す）
-- ★ 既定が15になっていること:
--   select column_name, column_default from information_schema.columns
--    where table_schema='public' and table_name='salon_import_sources'
--      and column_name='import_interval_min';
-- ★ 既存6店の値が変わっていないこと（全部15のまま）:
--   select salon_id, import_imasugu, import_interval_min
--     from public.salon_import_sources where is_enabled = true order by salon_id;
-- ★ 制約が効くこと（★ これはエラーになるのが正しい。試したらロールバックすること）:
--   begin;
--   update public.salon_import_sources set import_interval_min = 60 where import_imasugu = true;
--   rollback;
