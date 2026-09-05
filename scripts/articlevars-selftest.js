// 新着情報の差し込み（src/lib/articleVars.ts）の自己点検（第169便・2026-09-05）。
//
// ★★★ ここで危ないのは:
//   ① 置き換えの【前】に70字を数える → ★ 駅ちかで断られる（★ これは呼ぶ側の順番の話。§5で見る）
//   ② 埋められないのに半端に埋めて送る → ★ 「{セラピスト}」が公開ページに出る
//   ③ 日付が分からないのに「今日」を作る → ★ 嘘の日付が出る
//   ④ 知らない差し込みを消す → ★ 店舗様が書いた文字が黙って消える
//
//   使い方:  npm run check:articlevars

const path = require('path');
const V = require(path.join(__dirname, '..', '_tmpcheck', 'articleVars.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};

// ★ 2026-09-05 は土曜
const ctx = (o) => Object.assign({ dayKey: '2026-09-05', therapistName: 'サクラ' }, o || {});

console.log('── 1. ★ 置き換わる ──');
{
  eq('★ 月・日・曜日', V.fillArticleVars('{月}/{日}({曜日})', ctx()).text, '9/5(土)');
  eq('★★ 0を付けない（★ 09月05日にしない）', V.fillArticleVars('{月}月{日}日', ctx()).text, '9月5日');
  eq('★ セラピスト', V.fillArticleVars('{セラピスト}が出勤中', ctx()).text, 'サクラが出勤中');
  eq('★ 同じ差し込みが2回あっても両方', V.fillArticleVars('{日}日と{日}日', ctx()).text, '5日と5日');
  eq('★ 全部まとめて',
     V.fillArticleVars('{月}/{日}({曜日}) {セラピスト}出勤', ctx()).text, '9/5(土) サクラ出勤');
  eq('★ 差し込みが無ければそのまま', V.fillArticleVars('本日も営業中', ctx()).text, '本日も営業中');
  eq('★ 空でも落ちない', V.fillArticleVars('', ctx()).text, '');
  eq('★ 文字列でなければ空に寄せる', V.fillArticleVars(null, ctx()).text, '');
}

console.log('\n── 2. ★★★ 知らない差し込みは触らない ──');
//
// ★★ 店舗様が「{お客様}」と書いたら、それは**そのまま出す**。
//   ★ こちらで消すと「書いたのに消えた」になる。★ 消すより残すほうが直しやすい。
{
  eq('★★★ 知らない差し込みは残す', V.fillArticleVars('{お客様}へ{日}日', ctx()).text, '{お客様}へ5日');
  eq('★ 使った差し込みだけを数える', V.fillArticleVars('{お客様}へ{日}日', ctx()).used, ['{日}']);
  eq('★ 中かっこだけでも壊れない', V.fillArticleVars('{{日}}', ctx()).text, '{5}');
}

console.log('\n── 3. ★★★ 埋められないときは送らない ──');
{
  const r = V.fillArticleVars('{セラピスト}出勤', ctx({ therapistName: null }));
  eq('★★★ 名前が無ければ ok:false', r.ok, false);
  eq('★ 理由を返す', r.reason, 'no_therapist');
  eq('★★ 「{セラピスト}」のまま送らない（text を返さない）', 'text' in r, false);
  eq('★ 店舗様の言葉で、どうすればよいかを言う', /写真の欄/.test(r.message), true);
  eq('★★ 空文字も「選ばれていない」', V.fillArticleVars('{セラピスト}', ctx({ therapistName: '' })).ok, false);
  eq('★★ 空白だけも「選ばれていない」', V.fillArticleVars('{セラピスト}', ctx({ therapistName: '  ' })).ok, false);

  const d = V.fillArticleVars('{日}日', ctx({ dayKey: null }));
  eq('★★★ 日付が分からなければ ok:false（★ 「今日」を作らない）', d.ok, false);
  eq('★ 理由を返す', d.reason, 'no_day');
  eq('★★ 実在しない日は通さない', V.fillArticleVars('{日}', ctx({ dayKey: '2026-02-31' })).ok, false);
  eq('★ 形が違う日付も通さない', V.fillArticleVars('{日}', ctx({ dayKey: '2026/09/05' })).ok, false);

  // ★★★ 名前が要らない文なら、名前が無くても通る（★ 巻き込んで止めない）
  eq('★★ 名前を使っていなければ、名前が無くても通る',
     V.fillArticleVars('{日}日', ctx({ therapistName: null })).text, '5日');
  eq('★★ 日付を使っていなければ、日付が無くても通る',
     V.fillArticleVars('{セラピスト}', ctx({ dayKey: null })).text, 'サクラ');
}

console.log('\n── 4. ★ 曜日 ──');
{
  const w = (d) => V.fillArticleVars('{曜日}', ctx({ dayKey: d })).text;
  eq('★ 2026-09-05 は土', w('2026-09-05'), '土');
  eq('★ 2026-09-06 は日', w('2026-09-06'), '日');
  eq('★ 2026-09-07 は月', w('2026-09-07'), '月');
  eq('★ うるう年 2028-02-29 は火', w('2028-02-29'), '火');
  eq('★★ うるう年でない年の2/29は通さない', V.fillArticleVars('{曜日}', ctx({ dayKey: '2027-02-29' })).ok, false);
}

console.log('\n── 5. ★★★ 長さの検査に使う「いちばん長くなる日」 ──');
//
// ★★★ 保存のときは【この日】で数える。
//   ★ 9/5 で数えて通しても、12/31 で長くなって駅ちかに断られる、を作らない。
{
  eq('★ 12月31日', V.fillArticleVars('{月}月{日}日', ctx({ dayKey: V.ARTICLE_VAR_WORST_DAY })).text, '12月31日');
  const short = V.fillArticleVars('{月}月{日}日', ctx({ dayKey: '2026-09-05' })).text;
  const long = V.fillArticleVars('{月}月{日}日', ctx({ dayKey: V.ARTICLE_VAR_WORST_DAY })).text;
  eq('★★★ 最長の日のほうが必ず長い（か同じ）', long.length >= short.length, true);
  eq('★ 曜日は必ず1文字', V.fillArticleVars('{曜日}', ctx({ dayKey: V.ARTICLE_VAR_WORST_DAY })).text.length, 1);
}

console.log('\n── 6. ★ 一覧と説明 ──');
{
  eq('★ 使える差し込みは4つ', V.ARTICLE_VARS.length, 4);
  eq('★ 中身', Array.from(V.ARTICLE_VARS), ['{月}', '{日}', '{曜日}', '{セラピスト}']);
  eq('★★ 並びは書いた順ではなく決まった順',
     V.usedArticleVars('{セラピスト}{月}'), ['{月}', '{セラピスト}']);
  eq('★ 入っているかを見る', V.hasArticleVar('{日}'), true);
  eq('★ 入っていない', V.hasArticleVar('本日'), false);
  eq('★ 知らない差し込みは「入っている」に数えない', V.hasArticleVar('{お客様}'), false);
  eq('★★ 説明に「★」を混ぜない', /★/.test(V.articleVarHelp()), false);
  eq('★ 説明に営業日のことを書く', /営業日/.test(V.articleVarHelp()), true);
}

console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
