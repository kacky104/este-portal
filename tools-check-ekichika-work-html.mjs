// 本物の /admin/girlswork/ HTML を1回通して、パーサが本当に読めているかを確かめる道具（第38便）。
//
//   node tools-check-ekichika-work-html.mjs _tmp/girlswork.html
//
// ★★★ この道具のいちばんの価値は【自己採点】ができること。
//   駅ちかの画面には日別の出勤人数が書いてある（<dd> の数字）。
//   こちらがチェックボックスから数えた人数と一致すれば、パーサの
//   いちばん壊れやすい所（selected / checked の読み取り）が実データで裏取りできる。
//
// ★ 出力にトークンやパスワードは出さない（長さだけ出す）。

import fs from 'node:fs';
import {
  WORK_DAYS,
  parseWorkPage,
  checkWorkPage,
  buildPayload,
  countWorkingByDay,
  assertWithinInputVars,
} from './src/lib/ekichikaWorkParse.ts';

const path = process.argv[2];
if (!path) {
  console.error('使い方: node tools-check-ekichika-work-html.mjs <保存したHTMLのパス>');
  process.exit(2);
}

const html = fs.readFileSync(path, 'utf8');
console.log('読み込み: ' + path + '（' + html.length.toLocaleString() + ' 文字）');

const page = parseWorkPage(html);

console.log('');
console.log('── 読めたもの ──');
console.log('  fuel_csrf_token : ' + (page.csrfToken ? page.csrfToken.length + ' 文字' : '★ 取れていない'));
console.log('  action          : ' + (page.action || '★ 取れていない'));
console.log('  日付            : ' + (page.dateLabels.join(' ') || '★ 取れていない'));
console.log('  画面の出勤人数  : ' + page.headerCounts.join(' '));
console.log('  在籍            : ' + page.girls.length + ' 人');
console.log('  先頭の3人       : ' + page.girls.slice(0, 3).map((g) => g.girlId + (g.name ? '(' + g.name + ')' : '')).join(' / '));

const problems = checkWorkPage(page);
console.log('');
console.log('── checkWorkPage ──');
if (problems.length === 0) {
  console.log('  ✓ 空配列。読めている');
} else {
  console.log('  ★ ' + problems.length + ' 件:');
  for (const p of problems.slice(0, 20)) console.log('    - ' + p);
}

// ★★★ 自己採点: 画面が数えた人数と、こちらが数えた人数を突き合わせる
const mine = countWorkingByDay(page.girls);
const theirs = page.headerCounts;
console.log('');
console.log('── 自己採点（画面の人数 vs こちらの集計）──');
let countOk = theirs.length === WORK_DAYS;
for (let d = 0; d < WORK_DAYS; d++) {
  const t = theirs[d];
  const m = mine[d];
  const mark = t === m ? '✓' : '★';
  if (t !== m) countOk = false;
  console.log('  ' + mark + ' ' + (page.dateLabels[d] ?? '?') + '  画面 ' + t + ' 人 / こちら ' + m + ' 人');
}
console.log(countOk ? '  ✓ 全日一致。checked の読み取りは実データで裏取りできた' : '  ★ 食い違い。パーサを直すこと');

console.log('');
console.log('── 送信するとしたときの規模 ──');
const fields = buildPayload(page, page.girls);
console.log('  フィールド数 : ' + fields.length + ' 件');
try {
  assertWithinInputVars(fields);
  console.log('  ✓ max_input_vars の既定(1000)以内');
} catch (e) {
  console.log('  ★ ' + e.message);
}

const ok = problems.length === 0 && countOk;
console.log('');
console.log(ok ? '結果: OK' : '結果: ★ 要修正');
console.log('★ 確認が済んだら、保存したHTMLは消してください（csrfトークンと cocoa-job の平文パスワードが入っています）');
process.exit(ok ? 0 : 1);
