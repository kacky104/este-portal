// 駅ちかの個人ページの写真（src/lib/ekichikaCastPhotos.ts）の自己点検（第427便）。
//   使い方:  npm run check:ekichikacastphotos
const v = require(require('path').join(__dirname, '..', '_tmpcheck', 'ekichikaCastPhotos.js'));
let fail = 0;
const eq = (name, got, want) => { const a = JSON.stringify(got), b = JSON.stringify(want); if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; } else console.log('ok ' + name); };
const P = 'https://mensesthe-images.ranking-deli.jp/37168/';
const S3 = 'https://s3-ap-northeast-1.amazonaws.com/files.ranking-deli.jp/37168/';
const img = (g, n, ts) => '<img src="' + P + g + '/img' + n + '_' + ts + '.jpg" alt="">';

console.log('── 1. 抜く ──');
const html = '<div class="slider">' + img('5232208', 1, '20260809230626') + img('5232208', 3, '20260809230630')
  + '<img data-src="' + P + '5232208/img1s_20260809230626.jpg">' + img('5232208', 1, '20260809230626')
  + '</div><div class="osusume">' + img('5232190', 1, '20260617204936') + img('5232190', 2, '20260617204937') + '</div>';
const r = v.extractCastPhotos(html, '5232208');
eq('★ 本人の枠1・3だけ（サムネ・重複・ほかの子は拾わない）', r.map((x) => x.n), [1, 3]);
eq('★ 原寸 → 公開 の順', r[1].urls, [S3 + '5232208/img3_20260809230630.jpg', P + '5232208/img3_20260809230630.jpg']);
eq('ファイル名', r[0].name, 'img1_20260809230626.jpg');
eq('★ girlId が無ければ一番多い子', v.extractCastPhotos(html, null).map((x) => x.n), [1, 3]);
eq('★ 原寸の URL がページにあっても拾う', v.extractCastPhotos('<a href="' + S3 + '9/img2_20260101010101.png">', '9').map((x) => [x.n, x.name]), [[2, 'img2_20260101010101.png']]);
eq('写真が無い', v.extractCastPhotos('<img src="https://ranking-deli.jp/noimage2.jpg">', '1'), []);
eq('★ 別のホストは拾わない', v.extractCastPhotos('<img src="https://example.com/37168/1/img1_20260101010101.jpg">', '1'), []);

console.log('── 2. 取り込んでよい人 ──');
eq('0枚 → 取る', v.shouldImportCastPhotos({ profileImages: [], profileImageUrl: null }), true);
eq('null → 取る', v.shouldImportCastPhotos({ profileImages: null, profileImageUrl: '' }), true);
eq('★ 1枚でもある → 触らない', v.shouldImportCastPhotos({ profileImages: ['https://x/1.jpg'], profileImageUrl: 'https://x/1.jpg' }), false);
eq('★ 先頭の列だけある → 触らない', v.shouldImportCastPhotos({ profileImages: null, profileImageUrl: 'https://x/1.jpg' }), false);

console.log('── 3. 詰めて並べる・記録は本当の枠 ──');
eq('★ 枠1・3', v.planCastPhotoSave([{ n: 3, url: 'u3' }, { n: 1, url: 'u1' }]), { profileImages: ['u1', 'u3'], profileImageUrl: 'u1', records: [{ imageSlot: 1, sourceUrl: 'u1' }, { imageSlot: 3, sourceUrl: 'u3' }] });
eq('0枚', v.planCastPhotoSave([]), { profileImages: [], profileImageUrl: null, records: [] });

if (fail) { console.log('\n★ ' + fail + ' 件 NG'); process.exit(1); }
console.log('\nすべて ok');
