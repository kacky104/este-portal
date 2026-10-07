// 保管庫のファイルが「そのセラピスト自身のもの」かの見分け（src/lib/storageOwnPath.ts）の自己点検（第1285便・2026-10-07）。
//
// ★★★ ここで守りたいこと: 運営の権限で消すファイルは、【そのセラピスト自身のもの】だけ。
//   ★ 見つけた経路（調査メモ 2-6）: 他店の写真の URL を自店の方に保存 → その方を削除 → 他店のファイルが消える。
//
//   使い方:  npm run check:storageownpath

const path = require('path');
const fs = require('fs');
const S = require(path.join(__dirname, '..', '_tmpcheck', 'storageOwnPath.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};
const BASE = 'https://abc.supabase.co';
const PHOTO = (p) => BASE + '/storage/v1/object/public/therapist-photos/' + p;
const DIARY = (p) => BASE + '/storage/v1/object/public/diary-images/' + p;

console.log('── 1. プロフィール写真（therapist-photos・名前が「番号-」で始まる）──');
eq('★ 自分の写真', S.isOwnTherapistPhotoPath('41-1783435524379.jpg', 41), true);
eq('★ 駅ちかから取り込んだ自分の写真', S.isOwnTherapistPhotoPath('41-ekichika1-20261007.jpg', '41'), true);
eq('★★★ 他のセラピストの写真は違う', S.isOwnTherapistPhotoPath('42-1783435524379.jpg', 41), false);
eq('★★★ 番号が前だけ同じ（4 と 41）を取り違えない', [S.isOwnTherapistPhotoPath('41-1.jpg', 4), S.isOwnTherapistPhotoPath('4-1.jpg', 41)], [false, false]);
eq('★★ フォルダを挟んだ場所・上へ戻る場所は通さない', [S.isOwnTherapistPhotoPath('41-x/../42-1.jpg', 41), S.isOwnTherapistPhotoPath('41-a/b.jpg', 41), S.isOwnTherapistPhotoPath('/41-1.jpg', 41)], [false, false, false]);
eq('★★ 番号だけ・空・形が違うものは通さない', [S.isOwnTherapistPhotoPath('41-', 41), S.isOwnTherapistPhotoPath('', 41), S.isOwnTherapistPhotoPath(null, 41), S.isOwnTherapistPhotoPath('41-1.jpg', ''), S.isOwnTherapistPhotoPath('41-1.jpg', 'abc')], [false, false, false, false, false]);

console.log('\n── 2. 写メ日記の写真（diary-images・フォルダが「番号/」）──');
eq('★ 自分の日記の写真（本人投稿・取り込み・メール）', ['41/1783435524379.jpg', '41/ekichika_123.jpg', '41/mail_1783_0.png'].map((p) => S.isOwnDiaryImagePath(p, 41)), [true, true, true]);
eq('★★★ 他のセラピストのフォルダは違う', [S.isOwnDiaryImagePath('42/1.jpg', 41), S.isOwnDiaryImagePath('410/1.jpg', 41), S.isOwnDiaryImagePath('4/1.jpg', 41)], [false, false, false]);
eq('★★ 上へ戻る場所は通さない', S.isOwnDiaryImagePath('41/../42/1.jpg', 41), false);
eq('★★ フォルダだけ・空は通さない', [S.isOwnDiaryImagePath('41/', 41), S.isOwnDiaryImagePath('', 41)], [false, false]);

console.log('\n── 3. URL から場所を取り出す（フクエスの保管庫の、その箱だけ）──');
eq('★ 取り出せる', S.storagePathFromPublicUrl(PHOTO('41-1.jpg'), 'therapist-photos', BASE), '41-1.jpg');
eq('★ うしろの ?… は落とす', S.storagePathFromPublicUrl(PHOTO('41-1.jpg') + '?t=1', 'therapist-photos', BASE), '41-1.jpg');
eq('★★★ ほかのサイトの URL は null（箱の名前が途中に入っていても）', S.storagePathFromPublicUrl('https://evil.example/x/therapist-photos/42-1.jpg', 'therapist-photos', BASE), null);
eq('★★ 別の箱の URL は null', S.storagePathFromPublicUrl(DIARY('41/1.jpg'), 'therapist-photos', BASE), null);
eq('★★ 保管庫の場所が分からなければ null', S.storagePathFromPublicUrl(PHOTO('41-1.jpg'), 'therapist-photos', ''), null);
eq('★★ 似た名前のサイト（前が同じ）は null', S.storagePathFromPublicUrl(BASE + '.evil.example/storage/v1/object/public/therapist-photos/41-1.jpg', 'therapist-photos', BASE), null);
eq('★★ %2e%2e で上へ戻る場所は null', S.storagePathFromPublicUrl(PHOTO('41-x%2F%2e%2e%2F42-1.jpg'), 'therapist-photos', BASE), null);

console.log('\n── 4. ★★★ コネックエフの写真の保存で受け付ける URL ──');
{
  const mine = PHOTO('41-1.jpg'), mine2 = PHOTO('41-2.jpg'), others = PHOTO('42-9.jpg');
  const legacy = 'https://files.ranking-deli.jp/37168/5232208/img1.jpg';
  eq('★ 自分の写真（新しく上げたもの）は通る', S.splitSavableTherapistPhotos([mine, mine2], [], 41, BASE), { ok: [mine, mine2], rejected: [] });
  eq('★★★ 他店・他の方の写真の URL は断る', S.splitSavableTherapistPhotos([mine, others], [mine], 41, BASE), { ok: [mine], rejected: [others] });
  eq('★★★ 外部の URL を新しく入れるのも断る', S.splitSavableTherapistPhotos([legacy], [], 41, BASE).rejected, [legacy]);
  eq('★★ いますでに入っている URL は、外部のものでもそのまま通す（保存のたびに消さない）', S.splitSavableTherapistPhotos([legacy, mine2], [legacy, mine], 41, BASE), { ok: [legacy, mine2], rejected: [] });
  eq('★ 並べ替え・削除（いまある写真だけ）は通る', S.splitSavableTherapistPhotos([mine2, mine], [mine, mine2], 41, BASE).rejected, []);
  eq('★ 0枚にするのも通る', S.splitSavableTherapistPhotos([], [mine], 41, BASE), { ok: [], rejected: [] });
}

console.log('\n── 5. ★★★ 使う側が、この見分けを通していること ──');
{
  const src = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
  const del = src('src/app/lib/therapistDelete.ts');
  eq('★★★ 削除の掃除: プロフィール写真は、自分のファイルだけ消す', /bucketPathFromPublicUrl\(u, THERAPIST_BUCKET\)\)[\s\S]{0,700}isOwnTherapistPhotoPath\(p, String\(t\.id\)\)/.test(del), true);
  eq('★★★ 削除の掃除: 写メ日記の写真も、自分のファイルだけ消す', /bucketPathFromPublicUrl\(u, DIARY_BUCKET\)\)[\s\S]{0,300}isOwnDiaryImagePath\(p, String\(t\.id\)\)/.test(del), true);
  eq('★★ 削除の掃除で保管庫を消すのは2か所だけ（足したら、ここにも見分けを通すこと）', (del.match(/\.remove\(/g) || []).length, 2);
  const adm = src('src/app/actions/therapistAdmin.ts');
  eq('★★ 入れ替えのときの掃除は、もとから「番号-」で絞っている（外さない）', /p\.startsWith\(`\$\{therapistId\}-`\)/.test(adm), true);
  const girls = src('src/app/actions/conecfGirls.ts');
  eq('★★★ コネックエフの写真の保存が、受け付ける URL を絞っている', /splitSavableTherapistPhotos\(given, current, Number\(t\.id\)/.test(girls) && /split\.rejected\.length > 0/.test(girls), true);
}

console.log(fail === 0 ? '\n全部 ok' : '\nNG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
