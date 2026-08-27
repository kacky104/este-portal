// 本物の girlslist HTML を ekichikaListParse に通して、目で確かめるための道具（第39便）。
//
//   node tools-check-ekichika-list-html.mjs _tmp/girlslist-sokuhime.html 46440
//   （第2引数は掲載の externalId。castId をリンクから抜くのに要る）
//
// ★★★ なぜ要るか（第38便 §8-2 の禁則候補）
//   fixture は自分が理解した形しか再現しない。理解が間違っている部分は fixture にも入らない。
//   ★ 本物を1回通すまで、パーサは未検証と扱う。
//   第39便では実際に、外側 <div class="waiting sokuiku"> が【休みの子にも付いている】ことが
//   本物を通して分かった。fixture だけ書いていたら全員が即ヒメになっていた。
//
// ★ 即ヒメは営業時間中にしか出ない（第36便 4-4）。営業前のHTMLで「例外ゼロ」と結論しないこと。

import { readFileSync } from 'node:fs';
import { register } from 'node:module';

register('./tools-ts-resolve.mjs', import.meta.url);

const path = process.argv[2];
const externalId = process.argv[3];
if (!path || !externalId) {
  console.error('使い方: node tools-check-ekichika-list-html.mjs <girlslist.html> <externalId>');
  process.exit(1);
}

const { parseEkichikaList } = await import('./src/lib/ekichikaListParse.ts');
const html = readFileSync(path, 'utf8');
const casts = parseEkichikaList(html, externalId);

const work = casts.filter((c) => c.status === 'work');
const off = casts.filter((c) => c.status === 'off');
const unknown = casts.filter((c) => c.status === 'unknown');
const sokuhime = casts.filter((c) => c.sokuhime);

console.log('ファイル      ' + path + '（' + html.length.toLocaleString() + ' 文字）');
console.log('在籍          ' + casts.length + ' 人');
console.log('出勤          ' + work.length + ' 人');
console.log('休み          ' + off.length + ' 人');
console.log('判定不能      ' + unknown.length + ' 人   ★ 0 でなければレイアウト変更を疑う');
console.log('★ 即ヒメ      ' + sokuhime.length + ' 人   ★ 5人を超えたら読み方が違う（枠は5つまで）');
console.log('');

for (const c of sokuhime) {
  console.log('  即ヒメ  castId=' + c.castId + '  ' + (c.name ?? '?') + '  ' + (c.start ?? '?') + '〜' + (c.end ?? '?')
    + '  status=' + c.status);
}
console.log('');

// ★ 即ヒメなのに出勤と判定できていない子がいたら、それは矛盾（即ヒメは出勤中の子にしか付かない）
const 矛盾 = sokuhime.filter((c) => c.status !== 'work');
if (矛盾.length) {
  console.log('★★★ 矛盾: 即ヒメなのに出勤ではない子が ' + 矛盾.length + ' 人いる');
  for (const c of 矛盾) console.log('   ' + c.castId + ' ' + c.name + ' status=' + c.status);
} else {
  console.log('◎ 即ヒメの子はすべて出勤と判定できている（駅ちかの仕様と一致）');
}

if (unknown.length) {
  console.log('');
  console.log('判定不能の castId: ' + unknown.map((c) => c.castId).join(', '));
}
