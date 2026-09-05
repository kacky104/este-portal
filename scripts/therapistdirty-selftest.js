// セラピスト編集の「まだ保存していない」（src/lib/therapistDirty.ts）の自己点検（第173便・2026-09-06）。
//
// ★★★ ここで危ないのは:
//   ① 保存したのに「未保存」と言い続ける → ★ 店舗様が警告を信じなくなる（★ いちばん危ない）
//   ② 読み込む前に「変更あり」と言う     → ★ 開いただけで警告が出る
//   ③ 空文字と null を別物として数える   → ★ 触っていないのに未保存になる
//   ④ どこが未保存か言わない             → ★ 「変更があります」だけでは思い出せない
//
//   使い方:  npm run check:therapistdirty

const path = require('path');
const D = require(path.join(__dirname, '..', '_tmpcheck', 'therapistDirty.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};

const base = () => ({
  age: '24', bodyType: 'T160 B85(D) W58 H86', profileText: 'よろしくお願いします',
  catchphrase: '癒しの時間', badges: [], images: ['https://x/a.jpg'],
});
const F = (saved, draft, n) => D.therapistDirtyFields(saved, draft, n);

console.log('── 1. ★★★ 触っていなければ、何も言わない ──');
{
  eq('★★★ 同じなら未保存なし', F(base(), base()), []);
  eq('★★ 読み込む前は【分からない】。★ 変更ありに倒さない', F(null, base()), []);
}

console.log('\n── 2. ★★★ 空文字と null を別物にしない ──');
//
// ★ DBは null、画面は '' になりがち。★ ここを分けると、触っていないのに未保存になる。
{
  const s = Object.assign(base(), { age: null, profileText: null, catchphrase: null });
  const d = Object.assign(base(), { age: '', profileText: '', catchphrase: '' });
  eq('★★★ null と 空文字 は同じ', F(s, d), []);
  eq('★ 配列も null と [] は同じ',
     F(Object.assign(base(), { badges: null, images: null }),
       Object.assign(base(), { badges: [], images: [] })), []);
}

console.log('\n── 3. ★★★ 保存されるのと同じ形にしてから比べる ──');
//
// ★★★ キャッチは保存のとき trim して16字で切られる。
//   ★ 比べるときに切らないと、★ 保存したのに「未保存」と言い続ける。
{
  eq('★★★ 前後の空白は差ではない',
     F(base(), Object.assign(base(), { catchphrase: '  癒しの時間  ' })), []);
  const long17 = 'あ'.repeat(17);
  const long20 = 'あ'.repeat(20);
  eq('★★★ 16字で切られたあとが同じなら差ではない',
     F(Object.assign(base(), { catchphrase: long17.slice(0, 16) }),
       Object.assign(base(), { catchphrase: long20 })), []);
  eq('★ 16字までは効く', D.CATCHPHRASE_MAX, 16);
  // ★ バッジも保存のとき正規化される
  eq('★★ 知らないバッジは正規化で落ちる＝差ではない',
     F(Object.assign(base(), { badges: [] }),
       Object.assign(base(), { badges: ['そんなバッジは無い'] })), []);
}

console.log('\n── 4. ★ 変えたところを言う ──');
{
  eq('★ 年齢', F(base(), Object.assign(base(), { age: '25' })), ['年齢']);
  eq('★ 身長・スリーサイズ', F(base(), Object.assign(base(), { bodyType: 'T161' })), ['身長・スリーサイズ']);
  eq('★ キャッチコピー', F(base(), Object.assign(base(), { catchphrase: '別の言葉' })), ['キャッチコピー']);
  eq('★ プロフィール', F(base(), Object.assign(base(), { profileText: '書き直し' })), ['プロフィール']);
  eq('★ 写真を足した', F(base(), Object.assign(base(), { images: ['https://x/a.jpg', 'https://x/b.jpg'] })), ['写真']);
  eq('★★ 写真の並べ替えも変更（★ 1枚目が正面に出る）',
     F(Object.assign(base(), { images: ['a', 'b'] }), Object.assign(base(), { images: ['b', 'a'] })), ['写真']);
  eq('★ 転送先', F(base(), base(), 1), ['写メ日記の転送先']);
  eq('★★ 複数を、画面に出す順で返す',
     F(base(), Object.assign(base(), { age: '25', images: ['z'] }), 2), ['年齢', '写真', '写メ日記の転送先']);
  eq('★ 転送先が0行なら言わない', F(base(), base(), 0), []);
  eq('★ 数でなければ0として扱う', F(base(), base(), NaN), []);
}

console.log('\n── 5. ★ 画面に出す1行 ──');
{
  eq('★★ 未保存が無ければ null（★ 空文字と分ける）', D.therapistDirtyNote([]), null);
  eq('★★★ どこが未保存かを必ず言う',
     D.therapistDirtyNote(['年齢', '写真']), 'まだ保存していない変更があります（年齢・写真）。');
  eq('★ 1つでも同じ形', D.therapistDirtyNote(['写真']), 'まだ保存していない変更があります（写真）。');
  eq('★ 空の名前は混ぜない', D.therapistDirtyNote(['', '写真']), 'まだ保存していない変更があります（写真）。');
  eq('★ 配列でなければ null', D.therapistDirtyNote(null), null);
  eq('★ 文言に「★」を混ぜない', /★/.test(String(D.therapistDirtyNote(['写真']))), false);
  eq('★★ 離れるときの文に「消えます」と書く', /消えます/.test(D.therapistLeaveWarning()), true);
  eq('★ 離れるときの文に「★」を混ぜない', /★/.test(D.therapistLeaveWarning()), false);
}

console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
