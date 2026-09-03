// 同名セラピストの検知（src/lib/therapistDuplicates.ts）の自己点検（第119便・2026-09-03）。
//
// ★★★ ここで危ないのは【別人を「重複です」と言うこと】。
//   ★ 言われた店舗様は、実在する2人のどちらかを消しに行きかねない。
//   → 揃えるのは空白と全角半角だけ。★ 読みでは揃えない。
//
//   使い方:  npm run check:duplicates

const path = require('path');
const v = require(path.join(__dirname, '..', '_tmpcheck', 'therapistDuplicates.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};
const P = (id, name, isActive) => ({ id: String(id), name, isActive: isActive !== false });

console.log('── 1. 見つける ──');
eq('★ 同じ名前が2人なら出る',
   v.findDuplicateNames([P(1, 'サラ'), P(2, 'サラ'), P(3, 'ミキ')]).map((g) => g.name + ':' + g.people.length),
   ['サラ:2']);
eq('★ 1人ずつなら出ない', v.findDuplicateNames([P(1, 'サラ'), P(2, 'ミキ')]), []);
eq('★ 3人でも出る', v.findDuplicateNames([P(1, 'サラ'), P(2, 'サラ'), P(3, 'サラ')])[0].people.length, 3);
eq('★ 誰も居なければ空', v.findDuplicateNames([]), []);

console.log('\n── 2. ★★★ 公開中だけを見る ──');
// ★ 退店した人と同じ名前の新人が入っただけで毎回警告を出さない（出し続けると誰も読まなくなる）
eq('★★★ 非公開の人は数えない',
   v.findDuplicateNames([P(1, 'サラ'), P(2, 'サラ', false)]), []);
eq('★★ 非公開どうしも数えない',
   v.findDuplicateNames([P(1, 'サラ', false), P(2, 'サラ', false)]), []);
eq('★ 公開中が2人なら出る',
   v.findDuplicateNames([P(1, 'サラ'), P(2, 'サラ'), P(3, 'サラ', false)])[0].people.length, 2);

console.log('\n── 3. ★★★ 名前の揃え方（★ 揃えすぎない）──');
eq('★ 前後の空白は同じ名前', v.findDuplicateNames([P(1, ' サラ '), P(2, 'サラ')]).length, 1);
eq('★ 全角英数は揃える', v.findDuplicateNames([P(1, 'Ａｉ'), P(2, 'Ai')]).length, 1);
eq('★ 半角カナも揃える', v.findDuplicateNames([P(1, 'ﾐｷ'), P(2, 'ミキ')]).length, 1);
// ★★★ ここが要。★ 読みが同じでも別人のことがある（媒体の突き合わせと同じ決め）
eq('★★★ カタカナとひらがなは別人（重複と言わない）',
   v.findDuplicateNames([P(1, 'レミ'), P(2, 'れみ')]), []);
eq('★★★ 漢字とかなも別人', v.findDuplicateNames([P(1, '愛'), P(2, 'あい')]), []);
// ★ 名前が空の人は数えない（空同士を「同じ名前」と言わない）
eq('★★ 名前が空なら数えない', v.findDuplicateNames([P(1, ''), P(2, '')]), []);
eq('★ 空白だけの名前も数えない', v.findDuplicateNames([P(1, '  '), P(2, '')]), []);

console.log('\n── 4. 並びと文言 ──');
{
  const g = v.findDuplicateNames([P(1, 'ミキ'), P(2, 'ミキ'), P(3, 'サラ'), P(4, 'サラ'), P(5, 'サラ')]);
  eq('★ 人数の多い順', g.map((x) => x.name), ['サラ', 'ミキ']);
  eq('★ 合計人数（組の数ではない）', v.duplicateCount(g), 5);
  eq('★ 文言に名前と人数が出る', v.duplicateNotice(g),
     '同じ名前で公開中の方がいます：サラ（3名）・ミキ（2名）。同じ方が二重に登録されている場合、公開ページにも2人分が並びます。');
  // ★★★ 原因を決めつけない（外のサービス名を書かない）
  eq('★★★ 文言に他社名を書かない', /ベンリー|Venrey/.test(v.duplicateNotice(g)), false);
  // ★★ 消す・止めるとは言わない（この機能は気づかせるだけ）
  eq('★★ 「削除」と書かない', /削除|消して/.test(v.duplicateNotice(g)), false);
}
eq('★★★ 0件なら空文字（呼び出し側は何も出さない）', v.duplicateNotice([]), '');
eq('★ 0件の合計は0', v.duplicateCount([]), 0);

console.log(fail === 0 ? '\n★ すべて通りました' : '\n' + fail + ' 件 通りませんでした');
process.exit(fail === 0 ? 0 : 1);
