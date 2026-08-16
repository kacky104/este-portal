-- ページ別ヒーロー画像を PC / スマホ で出し分けられるようにする（2026-08-17 / 第19便）。
--
-- ── なぜ入れるか ────────────────────────────────────────────
-- これまで page_heroes は1ページ1枚しか持てず、横長のPC用画像がスマホでも
-- そのまま縮小表示されていた。スマホ向けに縦長の絵を出したい、というオーナー要望。
--
-- ── 決めたこと（2026-08-17 オーナー判断）──────────────────
--   ・対象は12ページ全部（仕組みとして持つ）
--   ・SPが未設定なら PC画像を流用する ＝ いま設定済みの11ページは何もしなくても見え方が変わらない
--   ・PC / SP の切り替えは 768px（公式HPのLP・デザイン一覧と同じ作法）
--
-- ── 適用の順番 ★先にDB → あとからコード（禁則65 と同じ向き）──
-- コードが image_url_sp を読むため、列が無い状態で新コードが動くと select が失敗する。
--   ※ ただし lib/pageHero.ts 側に「列が無ければ従来の1列だけで読み直す」保険を入れてあるので、
--     順番を逆にしても【ヒーローが全ページから消える】事故にはならない。保険であって免罪符ではない。
--
-- ★ Supabase ダッシュボードの SQL Editor で実行してください（冪等）。

-- 1) スマホ用の列を足す。既存行は null＝「SPは未設定＝PCを流用」。
alter table public.page_heroes
  add column if not exists image_url_sp text;

comment on column public.page_heroes.image_url    is 'PC用のヘッダー画像URL（768px以上）。';
comment on column public.page_heroes.image_url_sp is 'スマホ用のヘッダー画像URL（767px以下）。null なら image_url を流用する。';

-- 2) PC/SP を指定して保存する RPC。
--
-- ★ 既存の admin_set_page_hero(p_key, p_url) は【残したまま】にする。
--   デプロイの入れ替わり中に古い画面が呼んでも動くようにするため。
--   古い関数は従来どおり image_url（＝PC）だけを更新する。
--
-- ★ 関数名を分けた理由。
--   同名で引数を増やすオーバーロードにすると、PostgREST が
--   「どちらの関数か決められない」と言って呼び出しごと失敗することがある。
--   名前を分ければその曖昧さは原理的に起きない。
create or replace function public.admin_set_page_hero_image(p_key text, p_variant text, p_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text := nullif(btrim(coalesce(p_url, '')), '');
begin
  if auth.uid() <> '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid then
    raise exception 'forbidden';
  end if;

  -- ★ 対象ページを増やすときは、ここと lib/pageHero.ts の PageHeroKey の両方を直すこと
  --   （既存の admin_set_page_hero も同じ並びを持っている）。
  if p_key not in (
    'therapists','diary','reviews','newface','xshops','news',
    'jobs-matching','salons','reviews-therapist','reviews-hall','join','listing'
  ) then
    raise exception 'invalid page key: %', p_key;
  end if;

  if p_variant not in ('pc','sp') then
    raise exception 'invalid variant: %', p_variant;
  end if;

  if p_variant = 'pc' then
    insert into public.page_heroes (page_key, image_url, updated_at)
      values (p_key, v_url, now())
      on conflict (page_key) do update
        set image_url = excluded.image_url, updated_at = now();
  else
    insert into public.page_heroes (page_key, image_url_sp, updated_at)
      values (p_key, v_url, now())
      on conflict (page_key) do update
        set image_url_sp = excluded.image_url_sp, updated_at = now();
  end if;
end;
$$;

grant execute on function public.admin_set_page_hero_image(text, text, text) to authenticated;

-- 確認用（適用後に別途流す）。
-- select page_key, image_url is not null as pc, image_url_sp is not null as sp, updated_at
--   from public.page_heroes order by page_key;
