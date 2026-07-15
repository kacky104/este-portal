-- =============================================================================
-- 検索正規化（DB正規化カラム方式）
--   対象: salons.name / therapists.name
--   目的: 濁点・長音・半角カナ・ひら/カナ の揺れを吸収し、GIN(trgm) で高速化
--   置換: HomeSearchBar の「両表記生成 + ilike」を search_salons / search_therapists RPC へ
--   実カラム: salons(id, name, area, is_hidden)
--            salon_images(salon_id, image_url, display_order)
--            therapists(id uuid, name, profile_image_url, salon_id, is_active)
-- =============================================================================

-- 1) 拡張 -------------------------------------------------------------------
create extension if not exists pg_trgm;

-- 2) 正規化関数 -------------------------------------------------------------
-- 処理順: NFKD分解(半角→全角/濁点を結合文字へ分解) → 小文字化
--         → ひらがな→カタカナ統一(translateマップ) → 結合文字/長音/中黒/空白を除去
-- ※ translate() は文字範囲を取れないため、ぁ..ゖ / ァ..ヶ の対応文字列を直接埋め込む
create or replace function public.search_normalize(input text)
returns text
language sql
immutable
parallel safe
as $$
  select regexp_replace(
    translate(
      lower(normalize(coalesce(input, ''), NFKD)),
      -- from : ひらがな ぁ..ゖ
      'ぁあぃいぅうぇえぉおかがきぎくぐけげこごさざしじすずせぜそぞただちぢっつづてでとどなにぬねのはばぱひびぴふぶぷへべぺほぼぽまみむめもゃやゅゆょよらりるれろゎわゐゑをんゔゕゖ',
      -- to   : カタカナ ァ..ヶ
      'ァアィイゥウェエォオカガキギクグケゲコゴサザシジスズセゼソゾタダチヂッツヅテデトドナニヌネノハバパヒビピフブプヘベペホボポマミムメモャヤュユョヨラリルレロヮワヰヱヲンヴヵヶ'
    ),
    -- 濁点(U+3099)/半濁点(U+309A)/長音(U+30FC)/中黒(U+30FB)/全角空白(U+3000)/空白類 を削除
    '[゙゚ー・　\s]',
    '',
    'g'
  );
$$;

comment on function public.search_normalize(text) is
  'かな正規化キー生成: NFKD→小文字→ひら/カナ統一→濁点/長音/記号除去。検索一致専用（表示用ではない）。';

-- 3) 生成列（書き込み経路に依存せず自動維持）--------------------------------
alter table salons
  add column if not exists name_search text
  generated always as (public.search_normalize(name)) stored;

alter table therapists
  add column if not exists name_search text
  generated always as (public.search_normalize(name)) stored;

-- 4) 部分一致(like '%q%')高速化の trigram GINインデックス ---------------------
create index if not exists idx_salons_name_search_trgm
  on salons using gin (name_search gin_trgm_ops);

create index if not exists idx_therapists_name_search_trgm
  on therapists using gin (name_search gin_trgm_ops);

-- 5) 検索RPC（公開ルールを関数内に内包） -------------------------------------
-- 店舗検索: 非表示サロン除外、サムネイル(salon_images 先頭)・エリアも返す
create or replace function public.search_salons(q text, max_results int default 12)
returns table (id bigint, name text, area text, image_url text)
language sql
stable
parallel safe
security definer
set search_path = public
as $$
  select
    s.id,
    s.name,
    s.area,
    (select si.image_url from salon_images si
      where si.salon_id = s.id
      order by si.display_order asc
      limit 1) as image_url
  from salons s
  where s.is_hidden = false
    and public.search_normalize(q) <> ''            -- 空入力は全件返さない
    and s.name_search like '%' || public.search_normalize(q) || '%'
  order by s.name asc
  limit greatest(1, least(max_results, 50));
$$;

-- セラピスト検索: 非アクティブ・非表示サロン所属を除外、所属店名も返す
create or replace function public.search_therapists(q text, max_results int default 12)
returns table (id uuid, name text, profile_image_url text, salon_name text)
language sql
stable
parallel safe
security definer
set search_path = public
as $$
  select
    t.id,
    t.name,
    t.profile_image_url,
    s.name as salon_name
  from therapists t
  join salons s on s.id = t.salon_id and s.is_hidden = false
  where t.is_active = true
    and public.search_normalize(q) <> ''
    and t.name_search like '%' || public.search_normalize(q) || '%'
  order by t.name asc
  limit greatest(1, least(max_results, 50));
$$;

-- 6) 匿名(公開)クライアントからの実行権限 ------------------------------------
grant execute on function public.search_salons(text, int)     to anon, authenticated;
grant execute on function public.search_therapists(text, int) to anon, authenticated;

-- =============================================================================
-- 動作確認（任意）
--   select public.search_normalize('サラー');            -- => 'サラ'
--   select public.search_normalize('ざら');              -- => 'サラ'
--   select public.search_normalize('ｻﾗ');                -- => 'サラ'
--   select * from public.search_salons('さら', 12);
--   select * from public.search_therapists('さら', 12);
-- =============================================================================
