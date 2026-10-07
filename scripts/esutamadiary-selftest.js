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

// ══════════════════════════════════════════════════════════════════════════
// ★★★ 第1284便（2026-10-07）: 写真を付ける。
//   ★ 起きたこと: エステ魂への写メ日記は 9/4 から文章だけ。写真が入らないことが画面にも引き継ぎにも出ないまま、
//     店舗様に開放されていた。10/7、なぎささんの日記が駅ちかには写真つき・エステ魂には写真なしで載った。
//   ★ 形は 10/7 に実物の投稿ページと main.min.js から読んだ（src/lib/esutamaDiaryPhoto.ts の頭）。
const P = require(path.join(__dirname, '..', '_tmpcheck', 'esutamaDiaryPhoto.js'));
console.log('\n── 写真: 枠への入れ方（714×1112 の縦長）──');
eq('★ 枠の大きさ・枚数・品質は実物どおり', [P.ESUTAMA_DIARY_PHOTO_W, P.ESUTAMA_DIARY_PHOTO_H, P.ESUTAMA_DIARY_PHOTO_MAX, P.ESUTAMA_DIARY_PHOTO_QUALITIES[0]], [714, 1112, 3, 80]);
eq('★ スマホの縦の写真（3:4）は枠に合わせて切る（端が少し切れるだけ）', P.esutamaDiaryPhotoFit(3024, 4032), 'cover');
eq('★ 9:16 の縦長も切る', P.esutamaDiaryPhotoFit(1080, 1920), 'cover');
eq('★ 枠と同じ形は切る（何も切れない）', P.esutamaDiaryPhotoFit(714, 1112), 'cover');
eq('★★★ 正方形は切らない（切ると3分の1以上が消える）→ 白い余白', P.esutamaDiaryPhotoFit(1200, 1200), 'contain');
eq('★★★ 横長は切らない → 白い余白', P.esutamaDiaryPhotoFit(4032, 3024), 'contain');
eq('★★ 極端に細長い縦（切ると2割を超える）も切らない', P.esutamaDiaryPhotoFit(500, 1200), 'contain');
eq('★★ 大きさが分からなければ切らない側', [P.esutamaDiaryPhotoFit(0, 0), P.esutamaDiaryPhotoFit(NaN, 100)], ['contain', 'contain']);

console.log('\n── 写真: 入れてよい形か ──');
const B64 = 'QUJD'.repeat(80);   // 320文字の base64
const PHOTO = P.esutamaDiaryPhotoDataUrl(B64);
eq('★ 頭は data:image/jpeg;base64,', PHOTO.startsWith('data:image/jpeg;base64,'), true);
eq('★ 正しい形は通る', P.isEsutamaDiaryPhotoDataUrl(PHOTO), true);
eq('★★ PNG の頭は通さない', P.isEsutamaDiaryPhotoDataUrl('data:image/png;base64,' + B64), false);
eq('★★ URL は通さない', P.isEsutamaDiaryPhotoDataUrl('https://example.com/a.jpg'), false);
eq('★★ base64 でない文字が混じっていれば通さない', P.isEsutamaDiaryPhotoDataUrl('data:image/jpeg;base64,' + B64 + '<script>'), false);
eq('★★ 空・短すぎるものは通さない', [P.isEsutamaDiaryPhotoDataUrl('data:image/jpeg;base64,'), P.isEsutamaDiaryPhotoDataUrl('data:image/jpeg;base64,QUJD'), P.isEsutamaDiaryPhotoDataUrl(null)], [false, false, false]);

console.log('\n── 写真: 取りに行ってよい場所だけ・3枚まで ──');
const BASE = 'https://abc.supabase.co';
const U = (n) => BASE + '/storage/v1/object/public/diary-images/41/p' + n + '.jpg';
eq('★ 先頭から3枚まで。4枚目は数だけ', P.pickEsutamaDiaryPhotoUrls([U(1), U(2), U(3), U(4)], BASE), { urls: [U(1), U(2), U(3)], skipped: 1 });
eq('★★★ フクエスの保管庫でない URL は取りに行かない', P.pickEsutamaDiaryPhotoUrls(['https://evil.example/a.jpg', U(1), BASE + '.evil.example/storage/v1/object/public/x.jpg'], BASE), { urls: [U(1)], skipped: 2 });
eq('★★ 保管庫の場所が分からなければ1枚も取りに行かない', P.pickEsutamaDiaryPhotoUrls([U(1)], ''), { urls: [], skipped: 1 });
eq('★ 写真が無い・形が違う', [P.pickEsutamaDiaryPhotoUrls(null, BASE), P.pickEsutamaDiaryPhotoUrls(['', 5, U(1)], BASE)], [{ urls: [], skipped: 0 }, { urls: [U(1)], skipped: 0 }]);

console.log('\n── 写真つきの投稿フォーム ──');
{
  const none = D.buildEsutamaDiaryPost({ title: 'a', content: 'b' }, 'x');
  eq('★★★ 写真が無ければ、今までと同じ項目・同じ並び（9/4 から通っている形に触らない）', none.fields.map(([n]) => n),
    ['ctk', 'photo_data', 'title', 'category_id', 'content', 'published_date', 'schedule_mode']);
  eq('★ 写真 0枚', [none.photoCount, none.photoDropped], [0, 0]);
  const one = D.buildEsutamaDiaryPost({ title: 'a', content: 'b', photos: [PHOTO] }, 'x');
  eq('★★★ 写真つきは、いまの実物のフォーム順（photo_data は送らない）', one.fields.map(([n]) => n), [
    'ctk', 'title', 'category_id', 'content',
    'photos[1][data]', 'photos[1][album_id]', 'photos[2][data]', 'photos[2][album_id]', 'photos[3][data]', 'photos[3][album_id]',
    'published_date', 'schedule_mode',
  ]);
  eq('★★★ 1枚目は photos[1][data] に入る。album_id は空。残りの枠も空', [get(one, 'photos[1][data]') === PHOTO, get(one, 'photos[1][album_id]'), get(one, 'photos[2][data]'), get(one, 'photos[3][data]')], [true, '', '', '']);
  eq('★ 枚数', [one.photoCount, one.photoDropped], [1, 0]);
  const four = D.buildEsutamaDiaryPost({ title: 'a', content: 'b', photos: [PHOTO, 'data:image/png;base64,' + B64, PHOTO, PHOTO, PHOTO] }, 'x');
  eq('★★ 形が違うものは入れず、3枚まで。入れなかった数を返す', [four.photoCount, four.photoDropped, get(four, 'photos[3][data]') === PHOTO], [3, 2, true]);
  const bad = D.buildEsutamaDiaryPost({ title: 'a', content: 'b', photos: ['https://example.com/a.jpg'] }, 'x');
  eq('★★★ 入れてよい写真が1枚も無ければ、文章だけの形に戻る', [bad.fields.map(([n]) => n).includes('photo_data'), bad.photoCount, bad.photoDropped], [true, 0, 1]);
  eq('★ 題名・本文・カテゴリは写真つきでも同じ', [get(one, 'title'), get(one, 'content'), get(one, 'category_id'), get(one, 'schedule_mode')], ['a', 'b', '1', 'now']);
}

console.log(fail === 0 ? '\n★ すべて通りました' : '\n' + fail + ' 件 通りませんでした');
process.exit(fail === 0 ? 0 : 1);
