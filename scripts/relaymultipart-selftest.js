// ファイル付き POST の検査（src/lib/relayMultipart.ts）の自己点検（第106便）。
//
// ★★★ この点検の芯は【VPS を「任意のURLを取りに行く道具」にしない】ことを数で固定すること。
//   ・取り先は fukues.com の /api/relay/file だけ（★ 前方一致・後方一致で通らない）
//   ・種類は jpg / png だけ・ファイル名は英数字だけ（★ curl の -F に ; や " を渡さない）
//   ・fields の名前は英数字だけ・値に NUL を入れない
//
//   使い方:  npm run check:relaymultipart

const s = require(require('path').join(__dirname, '..', '_tmpcheck', 'relayMultipart.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};
const throws = (fn) => { try { fn(); return null; } catch (e) { return String(e.message); } };
const GOOD_URL = 'https://fukues.com/api/relay/file?bucket=therapist-photos&path=6/abc.jpg';
const good = (o) => Object.assign({
  fields: { image_set_id: '8', id: '5535450', edt_table: 'girls', shopid: '37168', fuel_csrf_token: 'x' },
  files: [{ field: 'upfile', url: GOOD_URL, filename: 'photo_1.jpg', contentType: 'image/jpeg' }],
}, o || {});

console.log('── 1. 通る形 ──');
{
  const m = s.assertRelayMultipart(good());
  eq('★ 駅ちかの画像登録の形が通る', Object.keys(m.fields).length, 5);
  eq('★ files が1つ', m.files.length, 1);
  eq('★ 値をそのまま持っていく', m.files[0], { field: 'upfile', url: GOOD_URL, filename: 'photo_1.jpg', contentType: 'image/jpeg' });
  eq('png も通る', s.assertRelayMultipart(good({ files: [{ field: 'upfile', url: GOOD_URL, filename: 'a.png', contentType: 'image/png' }] })).files[0].contentType, 'image/png');
  eq('★ 角括弧つきの項目名も通る（girl_work[1][x] の形）', s.assertRelayMultipart(good({ fields: { 'a[1][x]': '1' } })).fields['a[1][x]'], '1');
}

console.log('\n── 2. ★★★ 取り先を fukues.com の口だけに限る ──');
const withUrl = (u) => throws(() => s.assertRelayMultipart(good({ files: [{ field: 'upfile', url: u, filename: 'a.jpg', contentType: 'image/jpeg' }] })));
eq('★★★ 別のホストは断る', /取りに行ってよい先ではない/.test(withUrl('https://example.com/api/relay/file')), true);
eq('★★★ 後方一致で通らない（fukues.com.evil.com）', /取りに行ってよい先ではない/.test(withUrl('https://fukues.com.evil.com/api/relay/file')), true);
eq('★★★ 前方一致で通らない（evil-fukues.com）', /取りに行ってよい先ではない/.test(withUrl('https://evil-fukues.com/api/relay/file')), true);
eq('★★ 駅ちか（宛先の表にある）からも取らない（表を混ぜない）', /取りに行ってよい先ではない/.test(withUrl('https://ranking-deli.jp/api/relay/file')), true);
eq('★★ supabase の直リンクからも取らない', /取りに行ってよい先ではない/.test(withUrl('https://abc.supabase.co/storage/v1/object/public/x.jpg')), true);
eq('★ http は断る', /https 以外/.test(withUrl('http://fukues.com/api/relay/file')), true);
eq('★ ポート指定は断る', /ポート/.test(withUrl('https://fukues.com:8443/api/relay/file')), true);
eq('★ ユーザー情報つきは断る', /ユーザー情報/.test(withUrl('https://a:b@fukues.com/api/relay/file')), true);
eq('★★ fukues.com でも別のパスは断る', /取りに行く口ではない/.test(withUrl('https://fukues.com/api/admin/diary-import')), true);
eq('★ 口の下のパスも断る（/api/relay/file/x）', /取りに行く口ではない/.test(withUrl('https://fukues.com/api/relay/file/x')), true);
eq('★ url として読めないものは断る', /読めない/.test(withUrl('not a url')), true);
eq('★ 取り先の表は fukues.com だけ', s.RELAY_FILE_HOSTS, ['fukues.com']);
eq('★ 口は /api/relay/file', s.RELAY_FILE_PATH_PREFIX, '/api/relay/file');

console.log('\n── 3. ★★ curl の -F に危ないものを渡さない ──');
const withFile = (f) => throws(() => s.assertRelayMultipart(good({ files: [Object.assign({ field: 'upfile', url: GOOD_URL, filename: 'a.jpg', contentType: 'image/jpeg' }, f)] })));
eq('★ ファイル名に ; は入れない', /ファイル名/.test(withFile({ filename: 'a;type=text/html.jpg' })), true);
eq('★ ファイル名に " は入れない', /ファイル名/.test(withFile({ filename: 'a".jpg' })), true);
eq('★ ファイル名に / は入れない', /ファイル名/.test(withFile({ filename: '../a.jpg' })), true);
eq('★ ファイル名に日本語は入れない（英数字だけ）', /ファイル名/.test(withFile({ filename: '写真.jpg' })), true);
eq('★ 拡張子は jpg/jpeg/png だけ', /ファイル名/.test(withFile({ filename: 'a.gif' })), true);
eq('★ 種類は image/jpeg か image/png', /送れない種類/.test(withFile({ contentType: 'text/html' })), true);
eq('★ 種類に ; を混ぜられない', /送れない種類/.test(withFile({ contentType: 'image/jpeg;filename=x' })), true);
eq('★ ファイルの項目名も英数字だけ', /項目名/.test(withFile({ field: 'up file' })), true);
eq('★ ファイルの項目名が fields と重なったら断る', /重なって/.test(throws(() => s.assertRelayMultipart(good({ files: [{ field: 'id', url: GOOD_URL, filename: 'a.jpg', contentType: 'image/jpeg' }] })))), true);

console.log('\n── 4. fields の守り ──');
eq('★ 項目名に空白は入れない', /項目名が不正/.test(throws(() => s.assertRelayMultipart(good({ fields: { 'a b': '1' } })))), true);
eq('★ 値が文字でなければ断る', /文字ではない/.test(throws(() => s.assertRelayMultipart(good({ fields: { a: 1 } })))), true);
eq('★ 値に NUL は入れない', /NUL/.test(throws(() => s.assertRelayMultipart(good({ fields: { a: 'x\0y' } })))), true);
eq('★ 値が長すぎれば断る', /長すぎる/.test(throws(() => s.assertRelayMultipart(good({ fields: { a: 'x'.repeat(4001) } })))), true);
{
  const many = {}; for (let i = 0; i < 31; i++) many['f' + i] = '1';
  eq('★ 項目が多すぎれば断る（31）', /多すぎる/.test(throws(() => s.assertRelayMultipart(good({ fields: many })))), true);
}
eq('★ fields が無ければ断る', /fields が無い/.test(throws(() => s.assertRelayMultipart({ files: [] }))), true);
eq('★ files が空なら断る（ファイル無しなら multipart にしない）', /files が空/.test(throws(() => s.assertRelayMultipart(good({ files: [] })))), true);
eq('★ files が2つなら断る（1枠1枚）', /多すぎる/.test(throws(() => s.assertRelayMultipart(good({ files: [good().files[0], good().files[0]] })))), true);
eq('★ オブジェクトでなければ断る', /オブジェクトではない/.test(throws(() => s.assertRelayMultipart('x'))), true);
eq('★ 上限の数はそのまま（1枚・30項目）', [s.RELAY_FILE_MAX_COUNT, s.RELAY_FIELD_MAX_COUNT], [1, 30]);


console.log('\n── ★★★ JPEG へ直してもらう口（第165便） ──');
//
// ★★★ 駅ちかの記事の画像は【JPEG のみ】（2026-09-05 実測。PNG は「画像ファイル形式が…」で断られた）。
//   ★★ 店舗様に「JPEGにしてから登録し直してください」と言わせない。★ 取りに来た口で直す。
//   ★ 中継役（relay.sh）は pathname だけを見ているので、クエリが増えても規則は変わらない。
{
  const plain = s.relayFileUrl('therapist-photos', 'a/b.png');
  const asJpg = s.relayFileUrl('therapist-photos', 'a/b.png', 'jpeg');
  eq('★ いままでどおりの形は変わらない', plain,
     'https://fukues.com/api/relay/file?bucket=therapist-photos&path=a%2Fb.png');
  eq('★★ 直してもらうときだけ as=jpeg が付く', asJpg, plain + '&as=jpeg');
  eq('★★★ 取りに行く口（pathname）は変わらない', new URL(asJpg).pathname, s.RELAY_FILE_PATH_PREFIX);
  eq('★★★ 取り先も変わらない', new URL(asJpg).hostname, s.RELAY_FILE_HOSTS[0]);
  eq('★ https のまま', new URL(asJpg).protocol, 'https:');
}
eq('★★★ as=jpeg 付きでも検査を通る（★ ここが通らないと中継に載らない）',
   withUrl(s.relayFileUrl('therapist-photos', 'a/b.png', 'jpeg')), null);
eq('★★★ 知らない値は受け付けない（★ 任意の変換を頼める口にしない）',
   /jpeg/.test(throws(() => s.relayFileUrl('therapist-photos', 'a/b.png', 'webp'))), true);
eq('★★ path の検査はそのまま',
   /path/.test(throws(() => s.relayFileUrl('therapist-photos', '../x.png', 'jpeg'))), true);
eq('★★ bucket の検査もそのまま',
   /bucket/.test(throws(() => s.relayFileUrl('BAD', 'a/b.png', 'jpeg'))), true);

console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
