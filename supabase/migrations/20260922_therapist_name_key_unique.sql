-- 同じ店でかな違いの同名の女性を登録できないようにする（2026-09-22）
-- ★ きっかけ: ベンリーの「女性更新」がひらがな版の重複を19人作った（9/21）。ベンリーは
--   フクエスの画面を通らないので、DB の一意の索引で止める。
-- ★ 鍵: 全角/半角をそろえる（NFKC）→ カタカナをひらがなに → 空白を除く。
--   長音・記号・数字は消さない（「ユーリ」と「ゆり」は別人として登録できる）。
-- ★ 公開・非公開どちらも対象（退店した子が戻ったら非公開の行を公開に戻す）。
-- ★ 事前確認（_tmp/check-kana-dup-names.sql）で重複0件・normalize は immutable を確認済み。

create or replace function public.therapist_name_key(p_name text)
returns text
language sql
immutable
parallel safe
as $$
  select regexp_replace(
    translate(normalize(coalesce(p_name, ''), NFKC),
      'ァアィイゥウェエォオカガキギクグケゲコゴサザシジスズセゼソゾタダチヂッツヅテデトドナニヌネノハバパヒビピフブプヘベペホボポマミムメモャヤュユョヨラリルレロヮワヰヱヲンヴヵヶ',
      'ぁあぃいぅうぇえぉおかがきぎくぐけげこごさざしじすずせぜそぞただちぢっつづてでとどなにぬねのはばぱひびぴふぶぷへべぺほぼぽまみむめもゃやゅゆょよらりるれろゎわゐゑをんゔゕゖ'),
    '\s', '', 'g')
$$;

comment on function public.therapist_name_key(text) is
  '同じ店のかな違い同名を判定する鍵（NFKC・カタカナ→ひらがな・空白除去）。therapists_salon_name_key_uniq で使う';

create unique index if not exists therapists_salon_name_key_uniq
  on public.therapists (salon_id, public.therapist_name_key(name));

-- 確認用（適用後に流す）: 1行返れば成功
-- select indexname from pg_indexes where indexname = 'therapists_salon_name_key_uniq';
