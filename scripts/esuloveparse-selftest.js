// エステラブ「セラピスト一覧」パーサ（src/lib/esuloveTherapistParse.ts）の自己点検（第76便）。
//
// ★★★ なぜ要るか
//   ここが出す castId は、そのまま「誰の出勤か」を決める番号になる。
//   ★ 取り違えると、他人の欄に出勤を入れる。★ しかも店舗もこちらも気づけない。
//   → 「読めた」ことより、**食い違いを見つけて言えること**を重点的に点検する。
//
// ★★ HTMLは全部この場で組んだ作り物。実在の名前は入れていない
//   （実データを点検スクリプトに焼き込まない＝girlsparse-selftest と同じ理由）。
//
//   使い方:  npm run check:esuloveparse

const p = require(require('path').join(__dirname, '..', '_tmpcheck', 'esuloveTherapistParse.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};

// 実測の形をそのまま写した1人ぶん。★ 編集リンクは【2本】（名前＋鉛筆）
const cell = (id, name) =>
  '<div class="leftCol"><div class="therapistBlock">' +
  '<a class="thumbBlock" href="/admin/shop/therapist_image/' + id + '"><div class="thumb"><img></div></a>' +
  '<div class="nameBlock"><div class="statusBlock"><div class="status status -show">表示</div></div>' +
  '<a class="castName" href="/admin/shop/therapist/edit/' + id + '">' + name + '</a>' +
  '</div></div></div>' +
  '<a class="editBtn" href="/admin/shop/therapist/edit/' + id + '"><span>edit</span></a>';

const page = (...cells) => '<html><body>' + cells.join('') + '</body></html>';

// ── ふつうに読める ──
{
  const r = p.parseEsuloveTherapists(page(cell('696449', 'さら'), cell('696450', 'るい')));
  eq('2人読める', r.rows.length, 2);
  eq('castId と名前が対で取れる', r.rows.map(x => [x.castId, x.name]), [['696449', 'さら'], ['696450', 'るい']]);
  eq('出てきた順のまま（並べ替えない）', r.rows[0].castId, '696449');
  eq('怪しいことは無い', r.warnings, []);
  // ★ 見ていない値は決めつけない
  eq('表示かどうかは分からないままにする', r.rows[0].visible, null);
}

// ── ★★★ 編集リンクは1人2本。ここで数えると2倍になる ──
{
  const r = p.parseEsuloveTherapists(page(cell('1', 'あ'), cell('2', 'い'), cell('3', 'う')));
  eq('★ 人数は castName で数える（編集リンクではない）', r.rows.length, 3);
  eq('2倍のままなら怪しいと言わない', r.warnings.length, 0);
}
{
  // 鉛筆リンクが1本欠けている＝画面の作りが変わった合図
  const broken = page(cell('1', 'あ')).replace('<a class="editBtn" href="/admin/shop/therapist/edit/1"><span>edit</span></a>', '');
  const r = p.parseEsuloveTherapists(broken);
  eq('★ 作りが変わったら黙らない', r.warnings.length, 1);
  eq('★ それでも読めた分は返す', r.rows.length, 1);
}

// ── ★★★ 同じ名前が2人（㉟ で実際に起きた形）──
{
  const r = p.parseEsuloveTherapists(page(cell('696449', 'てすら'), cell('696450', 'てすら'), cell('3', 'さら')));
  // ★ まとめない。まとめたら二重登録に気づけない
  eq('同名でも2人として返す', r.rows.length, 3);
  eq('同名の組を見つける', p.duplicateNames(r.rows), [{ name: 'てすら', castIds: ['696449', '696450'] }]);
  eq('★ 1行で人に伝える', p.parseSummary(r),
    'エステラブに 3人 登録されています（★ 同じ名前が 1組 あります: てすら）');
}
{
  const r = p.parseEsuloveTherapists(page(cell('1', 'あ'), cell('2', 'い')));
  eq('重複が無ければ言わない', p.duplicateNames(r.rows), []);
  eq('その1行', p.parseSummary(r), 'エステラブに 2人 登録されています');
}

// ── 読めないときは「読めない」と言う（0人と混ぜない）──
eq('空のHTMLは読めない', p.parseEsuloveTherapists('').rows.length, 0);
eq('空のHTMLはそう言う', p.parseEsuloveTherapists('').warnings.length, 1);
eq('中身が違うHTMLもそう言う',
  p.parseEsuloveTherapists('<html><body><p>ログインしてください</p></body></html>').warnings[0],
  'セラピストを1人も読み取れませんでした');
eq('★ 0人のときに「登録されています」と言わない',
  p.parseSummary(p.parseEsuloveTherapists('')), 'エステラブのセラピストを読み取れませんでした');

// ── 名前まわりの細かいこと ──
{
  const r = p.parseEsuloveTherapists(page(cell('1', '  さら  ')));
  eq('前後の空白は落とす', r.rows[0].name, 'さら');
}
{
  const r = p.parseEsuloveTherapists(page(cell('1', 'A&amp;B')));
  eq('実体参照は戻す', r.rows[0].name, 'A&B');
}
{
  const r = p.parseEsuloveTherapists(page(cell('1', '<span>さら</span>')));
  eq('中のタグは落とす', r.rows[0].name, 'さら');
}
{
  // ★ 名前が空の行は、黙って捨てずに数える
  const r = p.parseEsuloveTherapists(page(cell('1', ''), cell('2', 'るい')));
  eq('名前が空の行は返さない', r.rows.length, 1);
  eq('★ 捨てたことを言う', r.warnings.some(w => /名前が空/.test(w)), true);
}
{
  // 引用符がシングルでも読む
  const single = page(cell('1', 'あ')).replace(/"/g, "'");
  eq('シングル引用符でも読む', p.parseEsuloveTherapists(single).rows[0].castId, '1');
}

console.log(fail === 0 ? '\nすべて通りました' : '\n' + fail + '件 失敗');
process.exit(fail === 0 ? 0 : 1);
