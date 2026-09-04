// エステ魂の写メ日記フォーム（src/lib/esutamaDiaryPost.ts）の自己点検（第129便・2026-09-04）。
//
// ★★★ ここで守りたいのは3つ。
//   ① 上限で切ったことを【黙らせない】（落ちた字数を返す）
//   ② 空の記事を【本人のアカウントから出さない】
//   ③ 知らないカテゴリで送らない（当たり障りのない「日常」へ倒す）
//
//   使い方:  npm run check:esutamadiary

const path = require('path');
const D = require(path.join(__dirname, '..', '_tmpcheck', 'esutamaDiaryPost.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};
const get = (built, k) => (built.fields.find(([n]) => n === k) ?? [])[1];

console.log('── 1. ★★★ 切ったことを黙らせない ──');
eq('★ 上限内なら切らない', D.clampText('あいう', 30), { text: 'あいう', dropped: 0 });
eq('★★★ 超えたら切って、落ちた字数を返す',
   D.clampText('あ'.repeat(35), 30), { text: 'あ'.repeat(30), dropped: 5 });
// ★★ 絵文字（サロゲートペア）を2文字と数えない。★ 相手の数え方に合わせる
eq('★★ 絵文字は1文字と数える', D.clampText('😀😀😀', 2), { text: '😀😀', dropped: 1 });
eq('★ 空でも落ちない', D.clampText('', 30), { text: '', dropped: 0 });
eq('★ null でも落ちない', D.clampText(null, 30), { text: '', dropped: 0 });
// ★ 上限は実測値（画面の注意書き）
eq('★ 題名は30文字', D.ESUTAMA_TITLE_MAX, 30);
eq('★ 本文は2000文字', D.ESUTAMA_CONTENT_MAX, 2000);

console.log('\n── 2. ★★★ 空の記事を出さない ──');
eq('★★★ 本文が空なら empty', D.buildEsutamaDiaryPost({ title: 'あ', content: '' }, 'x').empty, true);
eq('★★★ 本文が空白だけでも empty',
   D.buildEsutamaDiaryPost({ title: 'あ', content: '  \n ' }, 'x').empty, true);
eq('★ 本文があれば empty ではない',
   D.buildEsutamaDiaryPost({ title: 'あ', content: 'こんにちは' }, 'x').empty, false);
// ★ 題名が空でも本文があれば送れる（題名の必須は相手の判断に任せる）
eq('★ 題名が空でも empty にはしない',
   D.buildEsutamaDiaryPost({ title: '', content: 'こんにちは' }, 'x').empty, false);

console.log('\n── 3. ★★ カテゴリ ──');
eq('★ 既定は 日常（1）',
   get(D.buildEsutamaDiaryPost({ title: 'a', content: 'b' }, 'x'), 'category_id'), '1');
eq('★★ 知らない値は 日常 へ倒す',
   get(D.buildEsutamaDiaryPost({ title: 'a', content: 'b', categoryId: '99' }, 'x'), 'category_id'), '1');
eq('★ 指定があればそれを使う',
   get(D.buildEsutamaDiaryPost({ title: 'a', content: 'b', categoryId: '3' }, 'x'), 'category_id'), '3');
eq('★ カテゴリは6つ', D.ESUTAMA_DIARY_CATEGORIES.length, 6);
eq('★ 判定は id だけ通す',
   [D.isEsutamaCategory('1'), D.isEsutamaCategory('6'), D.isEsutamaCategory('7'), D.isEsutamaCategory(1)],
   [true, true, false, false]);

console.log('\n── 4. ★★★ フォームに無い項目を送らない ──');
// ★★★ 実物のフォームを読んで確定（2026-09-04）。★ 設計メモにあった schedule-date/-hour/-minute は
//   form.elements に【入っていなかった】。★ 送らない。
eq('★★★ 送る組は実物のフォームと同じ7つ',
   D.buildEsutamaDiaryPost({ title: 'a', content: 'b' }, 'x').fields.map(([n]) => n),
   ['ctk', 'photo_data', 'title', 'category_id', 'content', 'published_date', 'schedule_mode']);
eq('★★ 一覧と食い違わない',
   D.buildEsutamaDiaryPost({ title: 'a', content: 'b' }, 'x').fields.map(([n]) => n),
   [...D.ESUTAMA_DIARY_FIELD_NAMES]);
// ★ 予約投稿は第129便では作らない。★ 常に即時
eq('★★ いつでも now（予約はまだ作らない）',
   get(D.buildEsutamaDiaryPost({ title: 'a', content: 'b' }, 'x'), 'schedule_mode'), 'now');
eq('★ published_date は空で送る',
   get(D.buildEsutamaDiaryPost({ title: 'a', content: 'b' }, 'x'), 'published_date'), '');

console.log('\n── 5. ★ 組み立て ──');
const b = D.buildEsutamaDiaryPost({ title: 'あ'.repeat(35), content: 'い'.repeat(2100) }, 'CTK123');
eq('★ ctk はそのまま入る', get(b, 'ctk'), 'CTK123');
eq('★★ 題名は30文字に切られる', [...get(b, 'title')].length, 30);
eq('★★ 本文は2000文字に切られる', [...get(b, 'content')].length, 2000);
eq('★★★ 切った字数が読める', [b.titleDropped, b.contentDropped], [5, 100]);
// ★ 画像は第129便では送らない（photo_data の中身が未確認）
eq('★ photo_data は空で送る', get(b, 'photo_data'), '');
// ★ 画像は送らない（photo_data は空・required でないことを実測で確認）
eq('★ photo_data は空のまま', get(b, 'photo_data'), '');

console.log(fail === 0 ? '\n★ すべて通りました' : '\n' + fail + ' 件 通りませんでした');
process.exit(fail === 0 ? 0 : 1);
