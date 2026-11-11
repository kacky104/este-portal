-- 修正SQL 第1336便（2026-10-09・カッキーさん）: 駅ちかから取り込んだ写メ日記のタイトルに残った「&hellip;」「&lrm;」などを、文字に戻す。
--
-- ★ 何が起きたか: 駅ちかは、タイトルの欄に記号を名前つきの文字参照で入れて返す（「…」→ &hellip;、「♦」→ &diams;、
--     「ˆ」→ &circ;、目に見えない向きの印 → &lrm; など）。取り込みは &lt; &gt; &quot; &nbsp; &amp; と番号の形しか戻していなかったので、
--     フクエスの写メ日記に「14:00〜居るよ&lrm;」「遂に気付いてしまいました&hellip;」と、そのまま出ていた。
-- ★ コード側は第1336便で直した（これから取り込む日記）。ここは、すでに取り込んだ分を直すだけ。
-- ★ 流す順番: push の前でも後でもよい（push の前に流すと、push までに取り込まれた日記だけ、もう一度流すことになる）。
--
-- ★ 触るもの: diary_posts の title と content。【駅ちかから取り込んだ日記だけ】（salon_diary_imports に記録がある行）。
--     戻すのは HTML 4.01 の名前 247 個（コードの src/lib/htmlNamedEntities.ts と同じ表。&amp; &lt; &gt; &quot; &nbsp; は前から戻しているので入れていない）。
-- ★ 触らないもの: フクエスで書いた日記・写真・日付・取り込みの記録。行は足さない・消さない。
-- ★ 何度流しても同じ結果になる（2回目は「直した 0 件」）。
-- ★ 結果の見方（最後の表）: 1行目がまとめ（「まだ残っている 0 件」なら OK）。2行目からが、直した日記の前と後。
-- ★ 画面に出るまで: 写メ日記の一覧は約1分、日記のページは約10分で新しい文になる。

-- 0) 道具: 文の中の名前つきの文字参照を戻す（この1回の実行のあいだだけある関数。DB には残らない）
create or replace function pg_temp.fx_1336(t text) returns text
language plpgsql immutable as $$
declare
  r record;
  o text := t;
begin
  if t is null or t !~ '&[A-Za-z][A-Za-z0-9]{1,8};' then
    return t;
  end if;
  for r in
    select v.name, v.cp from (values
      ('iexcl',161),('cent',162),('pound',163),('curren',164),('yen',165),('brvbar',166),('sect',167),('uml',168),
      ('copy',169),('ordf',170),('laquo',171),('not',172),('shy',173),('reg',174),('macr',175),('deg',176),
      ('plusmn',177),('sup2',178),('sup3',179),('acute',180),('micro',181),('para',182),('middot',183),('cedil',184),
      ('sup1',185),('ordm',186),('raquo',187),('frac14',188),('frac12',189),('frac34',190),('iquest',191),('Agrave',192),
      ('Aacute',193),('Acirc',194),('Atilde',195),('Auml',196),('Aring',197),('AElig',198),('Ccedil',199),('Egrave',200),
      ('Eacute',201),('Ecirc',202),('Euml',203),('Igrave',204),('Iacute',205),('Icirc',206),('Iuml',207),('ETH',208),
      ('Ntilde',209),('Ograve',210),('Oacute',211),('Ocirc',212),('Otilde',213),('Ouml',214),('times',215),('Oslash',216),
      ('Ugrave',217),('Uacute',218),('Ucirc',219),('Uuml',220),('Yacute',221),('THORN',222),('szlig',223),('agrave',224),
      ('aacute',225),('acirc',226),('atilde',227),('auml',228),('aring',229),('aelig',230),('ccedil',231),('egrave',232),
      ('eacute',233),('ecirc',234),('euml',235),('igrave',236),('iacute',237),('icirc',238),('iuml',239),('eth',240),
      ('ntilde',241),('ograve',242),('oacute',243),('ocirc',244),('otilde',245),('ouml',246),('divide',247),('oslash',248),
      ('ugrave',249),('uacute',250),('ucirc',251),('uuml',252),('yacute',253),('thorn',254),('yuml',255),('OElig',338),
      ('oelig',339),('Scaron',352),('scaron',353),('Yuml',376),('circ',710),('tilde',732),('ensp',8194),('emsp',8195),
      ('thinsp',8201),('zwnj',8204),('zwj',8205),('lrm',8206),('rlm',8207),('ndash',8211),('mdash',8212),('lsquo',8216),
      ('rsquo',8217),('sbquo',8218),('ldquo',8220),('rdquo',8221),('bdquo',8222),('dagger',8224),('Dagger',8225),('permil',8240),
      ('lsaquo',8249),('rsaquo',8250),('euro',8364),('fnof',402),('Alpha',913),('Beta',914),('Gamma',915),('Delta',916),
      ('Epsilon',917),('Zeta',918),('Eta',919),('Theta',920),('Iota',921),('Kappa',922),('Lambda',923),('Mu',924),
      ('Nu',925),('Xi',926),('Omicron',927),('Pi',928),('Rho',929),('Sigma',931),('Tau',932),('Upsilon',933),
      ('Phi',934),('Chi',935),('Psi',936),('Omega',937),('alpha',945),('beta',946),('gamma',947),('delta',948),
      ('epsilon',949),('zeta',950),('eta',951),('theta',952),('iota',953),('kappa',954),('lambda',955),('mu',956),
      ('nu',957),('xi',958),('omicron',959),('pi',960),('rho',961),('sigmaf',962),('sigma',963),('tau',964),
      ('upsilon',965),('phi',966),('chi',967),('psi',968),('omega',969),('thetasym',977),('upsih',978),('piv',982),
      ('bull',8226),('hellip',8230),('prime',8242),('Prime',8243),('oline',8254),('frasl',8260),('weierp',8472),('image',8465),
      ('real',8476),('trade',8482),('alefsym',8501),('larr',8592),('uarr',8593),('rarr',8594),('darr',8595),('harr',8596),
      ('crarr',8629),('lArr',8656),('uArr',8657),('rArr',8658),('dArr',8659),('hArr',8660),('forall',8704),('part',8706),
      ('exist',8707),('empty',8709),('nabla',8711),('isin',8712),('notin',8713),('ni',8715),('prod',8719),('sum',8721),
      ('minus',8722),('lowast',8727),('radic',8730),('prop',8733),('infin',8734),('ang',8736),('and',8743),('or',8744),
      ('cap',8745),('cup',8746),('int',8747),('there4',8756),('sim',8764),('cong',8773),('asymp',8776),('ne',8800),
      ('equiv',8801),('le',8804),('ge',8805),('sub',8834),('sup',8835),('nsub',8836),('sube',8838),('supe',8839),
      ('oplus',8853),('otimes',8855),('perp',8869),('sdot',8901),('lceil',8968),('rceil',8969),('lfloor',8970),('rfloor',8971),
      ('lang',9001),('rang',9002),('loz',9674),('spades',9824),('clubs',9827),('hearts',9829),('diams',9830)
    ) as v(name, cp)
  loop
    if position('&' || r.name || ';' in o) > 0 then
      o := replace(o, '&' || r.name || ';', chr(r.cp));
    end if;
  end loop;
  return o;
end $$;

-- ① 直す（取り込んだ日記だけ・変わる行だけ）。前の文を控えておく（最後の表に出すため）
drop table if exists pg_temp.fx_1336_done;
create temp table fx_1336_done as
with target as (
  select p.id, p.created_at, p.title as old_title, p.content as old_content
    from public.diary_posts p
   where exists (select 1 from public.salon_diary_imports i where i.diary_post_id = p.id)
     and (p.title   is distinct from pg_temp.fx_1336(p.title)
       or p.content is distinct from pg_temp.fx_1336(p.content))
), upd as (
  update public.diary_posts p
     set title   = pg_temp.fx_1336(p.title),
         content = pg_temp.fx_1336(p.content)
    from target t
   where p.id = t.id
  returning p.id, p.title as new_title, p.content as new_content
)
select t.id, t.created_at, t.old_title, u.new_title,
       (t.old_content is distinct from u.new_content) as content_changed
  from target t join upd u on u.id = t.id;

-- ② 流したあとの確認（1行目: まとめ。2行目から: 直した日記の前と後）
select 0 as "順", '【まとめ】' as "日記の日時",
       '直した ' || (select count(*) from fx_1336_done) || ' 件（うち本文も ' ||
         (select count(*) from fx_1336_done where content_changed) || ' 件）' as "前のタイトル",
       'まだ残っている ' || (
         select count(*) from public.diary_posts p
          where exists (select 1 from public.salon_diary_imports i where i.diary_post_id = p.id)
            and (p.title   is distinct from pg_temp.fx_1336(p.title)
              or p.content is distinct from pg_temp.fx_1336(p.content))
       ) || ' 件（0 なら OK）' as "直したタイトル"
union all
select (row_number() over (order by d.created_at desc))::int,
       to_char(d.created_at at time zone 'Asia/Tokyo', 'YYYY-MM-DD HH24:MI'),
       coalesce(d.old_title, '（タイトルなし）'),
       coalesce(d.new_title, '（タイトルなし）')
  from fx_1336_done d
 order by 1;
