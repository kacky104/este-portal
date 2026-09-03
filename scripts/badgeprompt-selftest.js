// 特徴バッジの選び方（src/lib/therapistBadgePrompt.ts）の自己点検（第113便・2026-09-03）。
//
// ★★★ この判定で危ないのは【分からないことを付けること】。
//   写真から「女子大生」「NO.1」「リンパ得意」は分からない。
//   ★ 分からないときは【付けない側】に倒す。★ ここが守りの本体なので、点検で固定する。
//
//   使い方:  npm run check:badgeprompt

const path = require('path');
const v = require(path.join(__dirname, '..', '_tmpcheck', 'therapistBadgePrompt.js'));
const B = require(path.join(__dirname, '..', '_tmpcheck', 'therapistBadges.js'));
const A = require(path.join(__dirname, '..', '_tmpcheck', 'adminBody.js'));
// ★ 紹介文のプロンプト。★ 戒めがバッジ側に持ち込まれているかを見る（第114便）
const C = require(path.join(__dirname, '..', '_tmpcheck', 'therapistCopyPrompt.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};

console.log('── 1. ★★★ AIに選ばせない語（いちばん大事）──');
// ★★★ 実績・経験・施術は写真から分からない。★ 選択肢に入っていないこと自体が守り
const forbidden = [
  ...B.BADGES_BY_CATEGORY.rank,     // NO.1 プレミア 殿堂入り 人気急上昇 指名多数 リピーター多数
  ...B.BADGES_BY_CATEGORY.career,   // 未経験 経験者 新人 ベテラン 女子大生 OL お嬢様
  ...B.BADGES_BY_CATEGORY.skill,    // 丁寧な施術 アロマ得意 施術上手 密着施術 リンパ得意 サービス抜群
];
eq('★★★ ランク・経験・スキルは1語も入らない',
   forbidden.filter((b) => v.PHOTO_BADGES.includes(b)), []);
// ★★ 会話を見ていないので性格の断定はしない
eq('★★ トーク上手・天然・ツンデレは入らない',
   ['トーク上手', '天然', 'ツンデレ'].filter((b) => v.PHOTO_BADGES.includes(b)), []);
// ★★ 何歳からかを誰も決めていない語は、こちらから付けない
eq('★★ 熟女は入らない', v.PHOTO_BADGES.includes('熟女'), false);
// ★★★ 数値で決まる語はAIに聞かない（二重に決めると食い違う）
eq('★★★ 低身長・高身長・巨乳は入らない',
   v.NUMERIC_BADGES.filter((b) => v.PHOTO_BADGES.includes(b)), []);

console.log('\n── 1-2. ★ 選ばせる語は、必ずフクエスの語彙の中にある ──');
// ★★ AIに存在しない語を見せない。★ 見せると、それを選んで sanitizeBadges に落とされる
eq('★★ PHOTO_BADGES は全部 sanitizeBadges を通る',
   v.PHOTO_BADGES.filter((b) => B.sanitizeBadges([b]).length === 0), []);
eq('★ NUMERIC_BADGES も全部通る',
   v.NUMERIC_BADGES.filter((b) => B.sanitizeBadges([b]).length === 0), []);
eq('★ 写真から言える語が1つ以上ある', v.PHOTO_BADGES.length > 0, true);

console.log('\n── 2. サイズの読み取り。★ 読めない部分は null（推測で埋めない）──');
eq('取り込みが入れる形', v.parseBodyType('T149 B86(E) W55 H84'), { heightCm: 149, cup: 'E' });
eq('カップ無し', v.parseBodyType('T160 B85 W58 H86'), { heightCm: 160, cup: null });
eq('★ 空文字は両方 null', v.parseBodyType(''), { heightCm: null, cup: null });
eq('★ null も両方 null', v.parseBodyType(null), { heightCm: null, cup: null });
eq('★ 形が違っても落ちない', v.parseBodyType('身長160cm'), { heightCm: null, cup: null });
// ★★ ありえない身長は読まない。★ 「T5」を5cmとして扱わない
eq('★★ 小さすぎる身長は null', v.parseBodyType('T50 B80(C) W55 H85').heightCm, null);
eq('★★ 大きすぎる身長は null', v.parseBodyType('T250 B80(C) W55 H85').heightCm, null);
eq('★ 小文字の t でも読む', v.parseBodyType('t164 B87(d) W54 H85'), { heightCm: 164, cup: 'D' });

console.log('\n── 3. ★★★ 数値だけで決まるバッジ。★ AIを通さない＝毎回同じ答え ──');
eq('149cm → 低身長', v.badgesFromNumbers('T149 B86(C) W55 H84'), ['低身長']);
eq('165cm → 高身長', v.badgesFromNumbers('T165 B86(C) W55 H84'), ['高身長']);
eq('Gカップ → 巨乳', v.badgesFromNumbers('T160 B95(G) W55 H84'), ['巨乳']);
// ★★★ 2026-09-03: E以上は101人中62人（61.4%）だった。★ 6割に付く語はバッジの役に立たない
eq('★★★ Eカップは巨乳にしない（実データで61.4%だった）', v.badgesFromNumbers('T160 B90(E) W55 H84'), []);
eq('★★ Fカップも巨乳にしない（36.6%）', v.badgesFromNumbers('T160 B92(F) W55 H84'), []);
eq('★ Hカップは巨乳', v.badgesFromNumbers('T160 B98(H) W55 H84'), ['巨乳']);
eq('低身長＋巨乳は両方', v.badgesFromNumbers('T149 B95(G) W55 H84'), ['低身長', '巨乳']);
// ★★★ 線引きは【ここ1か所】。★ 境目をまたいだ瞬間に変わることを固定する
eq('★★★ 線引きの境目（低身長）', [v.SHORT_CM, v.badgesFromNumbers('T' + v.SHORT_CM + ' B80(C) W55 H84')],
   [150, []]);
eq('★★★ 線引きの境目（高身長）', [v.TALL_CM, v.badgesFromNumbers('T' + (v.TALL_CM - 1) + ' B80(C) W55 H84')],
   [165, []]);
eq('★ 境目ちょうどは高身長に入る', v.badgesFromNumbers('T165 B80(C) W55 H84'), ['高身長']);
eq('★ Dカップは巨乳にしない', v.badgesFromNumbers('T160 B88(D) W55 H84'), []);
// ★★★ 線引きは【何人に付くか】で決めた。★ 3つとも 5〜12% に収まっている（101人で6〜12人）
eq('★★★ 巨乳の線は G', v.BUST_CUP_FROM, 'G');
eq('★★★ 低身長 150 / 高身長 165', [v.SHORT_CM, v.TALL_CM], [150, 165]);
// ★★ 読めないときは何も出さない（分からないときは付けない側へ倒す）
eq('★★ 読めないサイズからは何も出さない', v.badgesFromNumbers('サイズ非公開'), []);
eq('★★ null からも何も出さない', v.badgesFromNumbers(null), []);
// ★ 低身長と高身長が同時に出ない
eq('★ 低身長と高身長は同時に出ない',
   [140, 150, 167, 168, 175].every((h) => {
     const r = v.badgesFromNumbers('T' + h + ' B80(C) W55 H84');
     return !(r.includes('低身長') && r.includes('高身長'));
   }), true);

console.log('\n── 4. system プロンプト ──');
eq('★ 選べる語が全部書いてある',
   v.PHOTO_BADGES.filter((b) => !v.SYSTEM_PROMPT_BADGE.includes(b)), []);
// ★★★ 選ばせない語を、うっかり一覧に混ぜていないこと
eq('★★★ ランクの語が一覧に出ていない',
   B.BADGES_BY_CATEGORY.rank.filter((b) => v.SYSTEM_PROMPT_BADGE.split('## 守ること')[0].includes(b)), []);
eq('★★ 上限の数が書いてある', v.SYSTEM_PROMPT_BADGE.includes(String(v.MAX_PICK)), true);
// ★★ 「無理に埋めない」と「空でよい」の両方を書く。★ 片方だけだと6個埋めにくる
eq('★★ 無理に埋めないと書いてある', v.SYSTEM_PROMPT_BADGE.includes('無理に'), true);
eq('★★ 空でよいと書いてある', v.SYSTEM_PROMPT_BADGE.includes('空の配列'), true);

console.log('\n── 4-2. ★★★ ありふれた語の戒め（第114便・2026-09-03）──');
// ★★★ 第113便の失敗そのもの: copyPrompt にあった戒めを badgePrompt に写し忘れた。
//   ★ 実測でスレンダー59%・かわいい54%・お姉さん系48%。★ 半数に付く語は見分けの役に立たない。
//   ★★ 手で写すのをやめて import した。★ ここが「写し忘れ」を毎回見張る点検。
eq('★★★ copyPrompt の決まり文句のうちバッジにある語は、必ず戒めに入る',
   C.CLICHE_WORDS.filter((w) => v.PHOTO_BADGES.includes(w) && !v.COMMON_BADGES.includes(w)), []);
eq('★★ 色白・透明感はバッジの語彙に無いので入らない',
   ['色白', '透明感'].filter((w) => v.COMMON_BADGES.includes(w)), []);
eq('★★ ありふれた語は全部 PHOTO_BADGES の中にある（AIに見せない語を戒めても意味がない）',
   v.COMMON_BADGES.filter((b) => !v.PHOTO_BADGES.includes(b)), []);
eq('★★ 数値で決まる語は入らない', v.COMMON_BADGES.filter((b) => v.NUMERIC_BADGES.includes(b)), []);
eq('★ 重複していない', v.COMMON_BADGES.length, new Set(v.COMMON_BADGES).size);
// ★★★ 線引きは【何人に付くか】で決めた（2026-09-03・AROMAMay 様101人）
eq('★★★ 実測3割以上の6語', [...v.OVERUSED_BADGES],
   ['スレンダー', 'かわいい', 'お姉さん系', '清楚', '美脚', '癒し系']);
eq('★★ キレイ（27%）は入れていない', v.OVERUSED_BADGES.includes('キレイ'), false);
// ★★ 禁止ではない。★ 全部を戒めると、確かに言える人からも語が消える
eq('★★ 戒めていない語のほうが多い',
   v.PHOTO_BADGES.filter((b) => !v.COMMON_BADGES.includes(b)).length > v.COMMON_BADGES.length, true);
// ★★ プロンプトに書かれていなければ、定数だけ直しても何も変わらない
eq('★★★ 戒めの語が system プロンプトに全部書いてある',
   v.COMMON_BADGES.filter((b) => !v.SYSTEM_PROMPT_BADGE.includes(b)), []);
eq('★★ 何個までかが書いてある',
   v.SYSTEM_PROMPT_BADGE.includes(String(v.MAX_COMMON_PICK) + '個まで'), true);
eq('★ 上限は選べる数（6）より少ない', v.MAX_COMMON_PICK < v.MAX_PICK, true);

console.log('\n── 5. user プロンプト ──');
const inp = { name: 'ありな', age: '23', bodyType: 'T149 B86(E) W55 H84', salonName: 'AROMA-May-' };
eq('★ 素材が入る',
   ['ありな', '23', 'T149 B86(E) W55 H84', 'AROMA-May-']
     .every((s) => v.buildBadgeUserPrompt(inp, { hasImage: true }).includes(s)), true);
// ★★★ 写真の有無で書き方を変える。★ 無いのに「写真を見て」と書かない
eq('★★★ 写真ありのときは添付と書く',
   v.buildBadgeUserPrompt(inp, { hasImage: true }).includes('添付'), true);
eq('★★★ 写真なしのときは「なし」と書く',
   v.buildBadgeUserPrompt(inp, { hasImage: false }).includes('なし'), true);
eq('★★ 写真なしのときは控えめにと書く',
   v.buildBadgeUserPrompt(inp, { hasImage: false }).includes('無理なら空'), true);
// ★ 空の素材は行ごと落とす（「年齢: 歳」と出さない）
eq('★ 年齢が無ければ行を出さない',
   v.buildBadgeUserPrompt({ name: 'x', age: null, bodyType: null, salonName: null }, {}).includes('年齢'), false);

console.log('\n── 6. 返答の読み取り ──');
eq('素直なJSON', v.parseBadgeResponse('{"badges":["かわいい","癒し系"]}'), ['かわいい', '癒し系']);
eq('★ コードフェンス付きでも読む',
   v.parseBadgeResponse('```json\n{"badges":["清楚"]}\n```'), ['清楚']);
eq('★ 前後に説明が付いても読む',
   v.parseBadgeResponse('はい。\n{"badges":["キレイ"]}\n以上です'), ['キレイ']);
eq('★ 空の配列も読む（1個も選ばなかった）', v.parseBadgeResponse('{"badges":[]}'), []);
// ★★★ 「読めなかった」と「0件だった」を混ぜない（引き継ぎメモ 3-5）
eq('★★★ 読めなければ null（空配列と混ぜない）', v.parseBadgeResponse('わかりません'), null);
eq('★★ badges が無い JSON も null', v.parseBadgeResponse('{"tags":["かわいい"]}'), null);
eq('★★ badges が配列でなければ null', v.parseBadgeResponse('{"badges":"かわいい"}'), null);
eq('★ 文字列でない要素は落とす', v.parseBadgeResponse('{"badges":["かわいい",1,null]}'), ['かわいい']);
eq('★ 前後の空白は落とす', v.parseBadgeResponse('{"badges":[" 清楚 "]}'), ['清楚']);
// ★★ ここでは知らない語を落とさない（落とすのは sanitizeBadges の1か所）
eq('★★ 知らない語もそのまま返す（落とすのは呼び出し側）',
   v.parseBadgeResponse('{"badges":["美少女系"]}'), ['美少女系']);

console.log('\n── 7. ★★ 合わせたあと（呼び出し側と同じ手順）──');
// ★ generateBadgesForTherapist の中と同じ: 数値 → AI の順で並べて sanitizeBadges
const merged = B.sanitizeBadges([...v.badgesFromNumbers('T149 B95(G) W55 H84'), ...['かわいい', '美少女系', '癒し系']]);
eq('★★ 知らない語（美少女系）は落ちる', merged.includes('美少女系'), false);
eq('★★ 数値ぶんは残る', merged.includes('低身長') && merged.includes('巨乳'), true);
eq('★★ 上限6を超えない',
   B.sanitizeBadges(['低身長', '巨乳', 'かわいい', '癒し系', '清楚', '美脚', 'モデル系', '明るい']).length <= 6, true);

console.log('\n── 7-2. ★★★ 分布を数える（tallyBadges・第114便）──');
// ★★★ 第113便は【流し切ってから】偏りに気づいた。★ 数えるところをコードに置く
const 実データ風 = [
  ['スレンダー', 'かわいい'], ['スレンダー', 'かわいい'], ['スレンダー', 'かわいい'],
  ['スレンダー', 'かわいい'], ['スレンダー', 'かわいい'], ['スレンダー', '清楚'],
  ['清楚', '童顔'], ['美脚'], ['キレイ'], ['明るい'],
  [],            // ★ バッジが空の人
  null,          // ★ null の人（この列は default '[]' だが、古い行は null のことがある）
];
const t = v.tallyBadges(実データ風);
eq('★★★ 母数は【バッジが入っている人】だけ（空の子で薄めない）', t.母数, 10);
eq('★ 延べ個数', t.延べ, 17);
eq('★ 平均は小数1桁', t.平均, 1.7);
eq('★★★ 多い順に並ぶ', t.語ごと.map((r) => r.語 + ':' + r.人数),
   ['スレンダー:6', 'かわいい:5', '清楚:2', 'キレイ:1', '童顔:1', '美脚:1', '明るい:1']);
eq('★★ 割合は母数ぶんの人数', [t.語ごと[0].割合, t.語ごと[2].割合], [60, 20]);
// ★★★ 一覧（COMMON_BADGES）ではなく、いま数えた結果から出す。★ 直したかどうかはここで分かる
eq('★★★ 3割以上の語を【データから】出す', t.ありふれた語, ['スレンダー', 'かわいい']);
eq('★★ 2割の語は入らない（線は COMMON_RATIO の1か所）', t.ありふれた語.includes('清楚'), false);
// ★ 同じ人に2回入っていても1人と数える（人数が膨らむと線引きを間違える）
eq('★★ 同じ人の重複は1回', v.tallyBadges([['清楚', '清楚']]).語ごと, [{ 語: '清楚', 人数: 1, 割合: 100 }]);
eq('★ 延べも重複を数えない', v.tallyBadges([['清楚', '清楚']]).延べ, 1);
// ★★★ 0件と分からないを混ぜない（引き継ぎメモ 3-5）。★ 誰も居なければ 0 で返す（null にしない）
eq('★★★ 空の名簿は 0（落ちない）', [v.tallyBadges([]).母数, v.tallyBadges([]).平均, v.tallyBadges([]).語ごと],
   [0, 0, []]);
eq('★★ 全員空でも 0', v.tallyBadges([[], null, undefined]).母数, 0);
// ★★ 壊れた値が混ざっても落ちない（jsonb は何でも入る）
eq('★★ 配列でない値は「バッジが無い人」', v.tallyBadges(['清楚', 12, {}]).母数, 0);
eq('★★ 文字列でない要素は数えない', v.tallyBadges([['清楚', 1, null]]).延べ, 1);
eq('★ 前後の空白は落として同じ語にする', v.tallyBadges([[' 清楚 '], ['清楚']]).語ごと[0].人数, 2);
eq('★ 空文字は数えない', v.tallyBadges([['', '清楚']]).延べ, 1);
// ★★ 知らない語も見せる（落とすのは sanitizeBadges の1か所）
eq('★★ 知らない語も数える', v.tallyBadges([['美少女系']]).語ごと[0].語, '美少女系');
// ★ 同数のときの並びが毎回同じ（語彙の順）
eq('★ 同数なら語彙の並び順', v.tallyBadges([['癒し系', '清楚']]).語ごと.map((r) => r.語), ['清楚', '癒し系']);
// ★★★ 線引きは1か所（COMMON_RATIO）。★ 画面にも文言にも焼き付けない
eq('★★★ ありふれた語の線は3割', v.COMMON_RATIO, 30);

console.log('\n── 8. ★★★ 運営の口の受け取り（adminBody・第113便）──');
// ★★★ PowerShell から JSON を渡せない（" が落ちる）。★ フォーム形式で受けられること
const U = 'https://fukues.com/api/admin/therapist-badge-batch';
eq('★★★ フォーム形式で読める', A.parseAdminBody('salonId=12&limit=1', U),
   { salonId: '12', limit: '1' });
eq('★ JSON も読める', A.parseAdminBody('{"salonId":12,"limit":1}', U),
   { salonId: 12, limit: 1 });
eq('★ クエリ文字列も読める', A.parseAdminBody('', U + '?salonId=12'), { salonId: '12' });
// ★ 本文のほうが後から上書きする
eq('★ 本文がクエリを上書きする',
   A.parseAdminBody('salonId=99', U + '?salonId=12'), { salonId: '99' });
eq('★ 空の本文は空の組（null ではない）', A.parseAdminBody('', U), {});
// ★★★ 「読めなかった」と「空だった」を混ぜない（引き継ぎメモ 3-5）
eq('★★★ 壊れたJSONは null', A.parseAdminBody('{"salonId":12', U), null);
eq('★★ 配列は null（名前と値の組ではない）', A.parseAdminBody('[1,2]', U), null);
// ★★ '{' で始まっていたらフォーム形式として読み直さない（黙って別の意味に取らない）
eq('★★ 壊れたJSONをフォームとして読み直さない',
   A.parseAdminBody('{salonId=12}', U), null);
eq('★ URL が壊れていても本文は読める', A.parseAdminBody('salonId=12', 'これはURLではない'), { salonId: '12' });

console.log('\n── 8-2. ★★ 文字列と真偽値のどちらで来ても同じに読む ──');
// ★ フォーム形式は 'true'、JSON は true
eq("★★ 'true' も true も真", [A.truthy('true'), A.truthy(true)], [true, true]);
eq("★ '1' と 'yes' も真", [A.truthy('1'), A.truthy('yes')], [true, true]);
eq('★ 大文字でも読む', A.truthy('TRUE'), true);
// ★★★ 分からない値は false に倒す（実弾を勝手に撃たない）
eq('★★★ 分からない値は false', [A.truthy('maybe'), A.truthy(1), A.truthy(null), A.truthy(undefined)],
   [false, false, false, false]);
eq("★★★ 'false' は false", A.truthy('false'), false);

eq('★ 数は文字列でも数でも読む', [A.num('12'), A.num(12)], [12, 12]);
// ★ 読めなければ null（0 と混ぜない）
eq('★★ 読めなければ null（0 にしない）', [A.num('abc'), A.num(''), A.num(null), A.num(undefined)],
   [null, null, null, null]);
eq('★ 0 は 0（null にしない）', A.num('0'), 0);

console.log(fail === 0 ? '\n★ すべて通りました' : '\n' + fail + ' 件 通りませんでした');
process.exit(fail === 0 ? 0 : 1);
