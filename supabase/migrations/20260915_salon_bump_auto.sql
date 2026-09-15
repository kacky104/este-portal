-- 上位表示（bump）の【自動実行】（第385便・2026-09-15・カッキーさんの指示）
-- ※ Supabase SQL Editor で実行してください（コード push より先に適用）。冪等（再実行しても安全）。
--
-- ★★★ この適用だけでは何も変わりません。
--   bump_auto_enabled は既定 false ＝ 対象0店。★ 店舗様が自分で入れるまで、周が回っても0件です。
--   ★ 先に当てておくのは、画面側が列の有無で落ちないようにするため（第274便と同じ順番）。
--
-- ★★ 決めたこと（2026-09-15・カッキーさん）
--   ・時間帯 〇〇:〇〇〜〇〇:〇〇 のあいだ、〇〇分ごとに自動で上位表示する
--   ・間隔はプリセット（10 / 15 / 20 / 30 / 60 分）から選ぶ
--   ・時間帯は日をまたいでよい（22:00〜翌2:00）。★ 回数の区切り（朝6時）と噛み合う
--   ・手動のボタンは今までどおり、いつでも押せる
--   ・残り回数が0になったらその日は終わり。★ 翌朝6時に回復するまで何もしない
--   ・使えるのは上位表示が使える店すべて（回数の上限は今までどおり 20回／ワーク掲載店40回）
--
-- ★★★ 回数は【手動と自動で同じ財布】。★ 別枠を作らない（作ると「40回」の意味が2つになる）。

-- ============================================================
-- 1. 列 —— 設定4つ（店舗様が書ける）＋ 足あと1つ（RPCだけが書ける）
-- ============================================================
alter table public.salons
  add column if not exists bump_auto_enabled      boolean not null default false,
  add column if not exists bump_auto_start_min    integer not null default 600,   -- 10:00
  add column if not exists bump_auto_end_min      integer not null default 1380,  -- 23:00
  add column if not exists bump_auto_interval_min integer not null default 30,
  add column if not exists bump_auto_at           timestamptz;

comment on column public.salons.bump_auto_enabled is
  E'上位表示の自動実行の元栓（第385便）。★ 既定 false ＝ 既存の店には勝手に効かない。★ 店舗様が /mypage の「今すぐ」で自分で入れる。';
comment on column public.salons.bump_auto_start_min is
  E'自動実行の開始時刻。0時からの経過分（0〜1439・JST）。★ 600 = 10:00。';
comment on column public.salons.bump_auto_end_min is
  E'自動実行の終了時刻。0時からの経過分（0〜1439・JST）。★ 開始 > 終了 なら日をまたぐ（22:00〜翌2:00）。★ 開始と同じ値は「1日中」ではなく「ほぼ0分」＝実質止まる、と読む（判定は src/lib/bumpAuto.ts）。';
comment on column public.salons.bump_auto_interval_min is
  E'自動実行の間隔（分）。★ 10 / 15 / 20 / 30 / 60 のどれか（check 制約）。★ 選択肢は src/lib/bumpAuto.ts の BUMP_AUTO_INTERVALS と揃える。';
comment on column public.salons.bump_auto_at is
  E'最後に【自動で】上位表示した時刻（第385便）。★ 手動では入らない。★ 間隔の判定そのものは bumped_at（手動・自動の両方が入る最後の1回）で行う——手で押した直後に自動が重ならないようにするため。この列は「自動が動いているか」を人が見るための足あと。';

-- 壊れた値を入れさせない（冪等に足す）
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'salons_bump_auto_range' and conrelid = 'public.salons'::regclass
  ) then
    alter table public.salons add constraint salons_bump_auto_range check (
      bump_auto_start_min    between 0 and 1439
      and bump_auto_end_min  between 0 and 1439
      and bump_auto_interval_min in (10, 15, 20, 30, 60)
    );
  end if;
end $$;

-- 周が「元栓の入った店」だけを引くため
create index if not exists salons_bump_auto_idx
  on public.salons (id)
  where bump_auto_enabled = true;

-- ============================================================
-- 2. 直接UPDATE防止トリガに bump_auto_at を足す
-- ============================================================
-- ★ 設定4列（enabled / start / end / interval）は【店舗様が書いてよい】のでガードに入れない。
--   ★ 間隔を短くしても、回数の上限は RPC が守る＝早く使い切るだけで、すり抜けにはならない。
-- ★★ bump_auto_at は「いつ自動が動いたか」の証拠。★ 手で書き換えられると調べがつかなくなる。
create or replace function public.salons_bump_guard()
returns trigger
language plpgsql
as $$
begin
  if (new.bumped_at    is distinct from old.bumped_at
      or new.bump_day  is distinct from old.bump_day
      or new.bump_used is distinct from old.bump_used
      or new.bump_auto_at is distinct from old.bump_auto_at)
     and coalesce(current_setting('app.salon_bump_rpc', true), '') <> '1' then
    raise exception '上位表示は専用ボタンからのみ操作できます';
  end if;
  return new;
end;
$$;

-- ============================================================
-- 3. ★★★ updated_at の除外に bump_auto_at を足す
-- ============================================================
-- ★ 2026-08-06 の決めごと（bump で updated_at を動かさない）をそのまま伸ばす。
--   ★ 入れ忘れると、自動で押すたびに sitemap の lastModified が「たった今」になり、
--     lastModified の信頼性が結局戻らない（★ あのときの理由がそのまま当てはまる）。
-- ★★ 設定4列は除外しない。★ 店舗様が意図して変えたときだけ動く＝それは本当の更新。
create or replace function public.salons_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  if (to_jsonb(new) - 'updated_at' - 'bumped_at' - 'bump_day' - 'bump_used' - 'bump_auto_at')
     is distinct from
     (to_jsonb(old) - 'updated_at' - 'bumped_at' - 'bump_day' - 'bump_used' - 'bump_auto_at') then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

-- ============================================================
-- 4. ★★★ 回数の判定を1本にする（中身は salon_bump_apply だけが持つ）
-- ============================================================
-- ★ これまで salon_bump の中にあった「20回／ワーク掲載店は40回・朝6時区切り・上限で断る」を
--   そのままここへ移した。★ 手動と自動で同じ財布を使うので、2か所に書かない（第150便の1本化）。
-- ★★ 呼ぶ側が「誰か」を確かめる。★ この関数は確かめない（security definer・public から revoke）。
create or replace function public.salon_bump_apply(p_salon_id bigint, p_auto boolean)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_jobs boolean;
  v_day date;
  v_used int;
  v_quota int;
  -- JST の現在時刻から6時間引いた日付＝「朝6時区切りの日」。6時前は前日扱い。
  v_today date := ((now() at time zone 'Asia/Tokyo') - interval '6 hours')::date;
begin
  select coalesce(jobs_enabled, false), bump_day, coalesce(bump_used, 0)
    into v_jobs, v_day, v_used
    from public.salons
    where id = p_salon_id
    for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', '対象店舗が見つかりません');
  end if;

  v_quota := 20 + (case when v_jobs then 20 else 0 end);

  -- 日付が変わっていたら（朝6時を跨いでいたら）カウントをリセット。持ち越しなし。
  if v_day is distinct from v_today then
    v_used := 0;
  end if;

  if v_used >= v_quota then
    return jsonb_build_object('ok', false, 'error', '本日の上位表示回数を使い切りました（毎朝6時にリセットされます）',
      'used', v_used, 'quota', v_quota, 'remaining', 0);
  end if;

  -- ガードトリガの通行証（このトランザクション内のみ有効）。
  perform set_config('app.salon_bump_rpc', '1', true);
  update public.salons
    set bumped_at    = now(),
        bump_day     = v_today,
        bump_used    = v_used + 1,
        -- ★ 自動のときだけ足あとを残す。★ 手動では触らない
        bump_auto_at = case when p_auto then now() else bump_auto_at end
    where id = p_salon_id;
  perform set_config('app.salon_bump_rpc', '', true);

  return jsonb_build_object('ok', true,
    'used', v_used + 1, 'quota', v_quota, 'remaining', v_quota - v_used - 1,
    'auto', p_auto,
    'bumped_at', now());
end;
$$;

revoke all on function public.salon_bump_apply(bigint, boolean) from public;

-- ============================================================
-- 5. 手動（既存のボタン）—— 中身だけ差し替え。★ 名前も引数も返り値も同じ
-- ============================================================
create or replace function public.salon_bump(p_salon_id bigint)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'ログインが必要です');
  end if;

  select owner_id into v_owner from public.salons where id = p_salon_id;
  if not found or v_owner is distinct from v_uid then
    return jsonb_build_object('ok', false, 'error', '対象店舗が見つかりません');
  end if;

  return public.salon_bump_apply(p_salon_id, false);
end;
$$;

revoke all on function public.salon_bump(bigint) from public;
grant execute on function public.salon_bump(bigint) to authenticated;

-- ============================================================
-- 6. 自動（cron の周だけが呼ぶ）
-- ============================================================
-- ★★★ auth.uid() を見ない。★ 見ると service role では常に null で必ず落ちる。
--   ★ そのかわり【authenticated には渡さない】。★ 店舗様のブラウザからは呼べない。
--   ★ 受け口（/api/admin/bump-auto）が CRON_SECRET を確かめ、元栓と時間帯を確かめてから呼ぶ。
create or replace function public.salon_bump_auto_run(p_salon_id bigint)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
begin
  return public.salon_bump_apply(p_salon_id, true);
end;
$$;

revoke all on function public.salon_bump_auto_run(bigint) from public;
revoke all on function public.salon_bump_auto_run(bigint) from authenticated;
grant execute on function public.salon_bump_auto_run(bigint) to service_role;

-- ============================================================
-- 7. 確認用（適用後に別途流す）
-- ============================================================
-- ★ 列が5つ付いたこと・元栓が既定 false であること（＝挙動が変わっていない証拠）:
-- select column_name, data_type, column_default
--   from information_schema.columns
--  where table_schema='public' and table_name='salons' and column_name like 'bump_auto%'
--  order by column_name;
--
-- select count(*) filter (where bump_auto_enabled) as 自動オンの店, count(*) as 全店 from public.salons;
--   → 「自動オンの店 = 0」であること
--
-- ★ 関数が3つ見えること:
-- select proname from pg_proc where proname in ('salon_bump','salon_bump_apply','salon_bump_auto_run') order by proname;
--
-- ★ 手動のボタンが今までどおり動くこと（★ /mypage で1回押して、残りが1つ減るのを見る）。
