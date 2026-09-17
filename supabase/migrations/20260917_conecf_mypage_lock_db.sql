-- コネックエフ：/mypage のロックを DB 側でも守る（第407便・2026-09-17）
-- ※ Supabase SQL Editor で実行してください（★ コード push より先でも後でもよい。冪等）。
--
-- ★★ 何を守るか
--   コネックエフに切り替えた店（salons.conecf_enabled_at あり）では、/mypage の画面でロックしているが、
--   ★ 切り替え前から開きっぱなしの古いタブからは保存できてしまう（画面だけのロック）。→ DB で断る。
--
-- ★ 断るのは【ブラウザから直接書く】とき（auth.role() = 'authenticated' / 'anon'）だけ。
--   ★ service_role（コネックエフの受け口・取り込み・cron）と SQL Editor（role なし）は今までどおり通る。
--
--   therapists           … 追加（insert）／写真・年齢・サイズ・公開・今すぐ（店舗枠）の変更
--                          ★ 紹介文・キャッチ・特徴バッジ・並び順などは今までどおり /mypage で直せる
--   therapist_schedules  … 追加・変更・削除すべて（★ 出勤はコネックエフの週間スケジュールで）
--   salons               … conecf_enabled_at と conecf_import_* をブラウザから変えられない（★ 戻すのは運営だけ）
--
-- ★ エラーの文言は 'CONECF_LOCKED' で始まる（画面はこれを見て「コネックエフで編集してください」と出す）。

create or replace function public.conecf_is_browser_role()
returns boolean
language sql
stable
as $$
  select coalesce(auth.role(), '') in ('authenticated', 'anon');
$$;

-- ── therapists ────────────────────────────────────────────────
create or replace function public.conecf_guard_therapists()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  locked boolean;
begin
  if not public.conecf_is_browser_role() then
    return new;
  end if;
  select (s.conecf_enabled_at is not null) into locked from public.salons s where s.id = new.salon_id;
  if not coalesce(locked, false) then
    -- ★ 店を移す update（salon_id の変更）で、元の店がロック中なら断る
    if tg_op = 'UPDATE' and old.salon_id is distinct from new.salon_id then
      select (s.conecf_enabled_at is not null) into locked from public.salons s where s.id = old.salon_id;
      if coalesce(locked, false) then
        raise exception 'CONECF_LOCKED: この店舗はコネックエフで編集します';
      end if;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'CONECF_LOCKED: セラピストの追加はコネックエフで行ってください';
  end if;

  if new.profile_image_url is distinct from old.profile_image_url
     or new.profile_images   is distinct from old.profile_images
     or new.age              is distinct from old.age
     or new.body_type        is distinct from old.body_type
     or new.is_active        is distinct from old.is_active
     or new.is_available_now is distinct from old.is_available_now
     or new.available_until  is distinct from old.available_until
     or new.salon_id         is distinct from old.salon_id then
    raise exception 'CONECF_LOCKED: 写真・年齢・サイズ・公開・今すぐはコネックエフで編集してください';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_conecf_guard_therapists on public.therapists;
create trigger trg_conecf_guard_therapists
  before insert or update on public.therapists
  for each row execute function public.conecf_guard_therapists();

-- ── therapist_schedules ───────────────────────────────────────
create or replace function public.conecf_guard_therapist_schedules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tid bigint;
  locked boolean;
begin
  if not public.conecf_is_browser_role() then
    return coalesce(new, old);
  end if;
  tid := case when tg_op = 'DELETE' then old.therapist_id else new.therapist_id end;
  select (s.conecf_enabled_at is not null) into locked
    from public.therapists t join public.salons s on s.id = t.salon_id
   where t.id = tid;
  if coalesce(locked, false) then
    raise exception 'CONECF_LOCKED: 出勤はコネックエフの週間スケジュールで編集してください';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_conecf_guard_therapist_schedules on public.therapist_schedules;
create trigger trg_conecf_guard_therapist_schedules
  before insert or update or delete on public.therapist_schedules
  for each row execute function public.conecf_guard_therapist_schedules();

-- ── salons（切り替えの列をブラウザから変えさせない）──────────
create or replace function public.conecf_guard_salons()
returns trigger
language plpgsql
as $$
begin
  if not public.conecf_is_browser_role() then
    return new;
  end if;
  if new.conecf_enabled_at          is distinct from old.conecf_enabled_at
     or new.conecf_import_requested_at is distinct from old.conecf_import_requested_at
     or new.conecf_import_started_at   is distinct from old.conecf_import_started_at
     or new.conecf_import_done_at      is distinct from old.conecf_import_done_at then
    raise exception 'CONECF_LOCKED: コネックエフの切り替えはこの画面からは変更できません';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_conecf_guard_salons on public.salons;
create trigger trg_conecf_guard_salons
  before update on public.salons
  for each row execute function public.conecf_guard_salons();

-- ★ 確認（トリガーが3本あること）
-- select tgname, tgrelid::regclass from pg_trigger where tgname like 'trg_conecf_guard_%';

-- ★ 外す（問題が出たとき）
-- drop trigger if exists trg_conecf_guard_therapists on public.therapists;
-- drop trigger if exists trg_conecf_guard_therapist_schedules on public.therapist_schedules;
-- drop trigger if exists trg_conecf_guard_salons on public.salons;
