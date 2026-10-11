// コネックエフ: 運営が店舗様の代わりに操作する（src/lib/conecfActing.ts）の自己点検（第1399便・2026-10-11）。
//
// ★★★ ここで守りたいこと
//   ① 店を選べる・選んだ店が効くのは、運営アカウントだけ（店舗様のブラウザに同じ cookie があっても何も起きない）
//   ② cookie の中身は店の番号だけ（数字以外は「選んでいない」）
//   ③ 説明への同意は、運営が代わりに入れられない（同意済みの枠の ID・パスワードの変更はできる）
//   ④ コネックエフの「自分の店を読む」所が、ぜんぶ同じ決まり（scopeConecfSalon）を通っている
//   ⑤ 画面とサーバーの店が食い違ったら、画面を読み直す
//
//   使い方:  npm run check:conecfacting

const path = require('path');
const fs = require('fs');
const A = require(path.join(__dirname, '..', '_tmpcheck', 'conecfActing.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};

const ADMIN = 'aaaaaaaa-0000-0000-0000-000000000001';
const SHOP = 'bbbbbbbb-0000-0000-0000-000000000002';

console.log('── 1. ★★★ cookie の読み方 ──');
eq('数字だけの正の整数は通る', [A.parseActingSalonId('12'), A.parseActingSalonId(' 7 '), A.parseActingSalonId('999999')], [12, 7, 999999]);
eq('★★★ 数字以外・0・負・小数・先頭0・長すぎは「選んでいない」',
  ['', '0', '-3', '1.5', '012', '12abc', '1 OR 1=1', '9999999999999', 'null', 'undefined'].map(A.parseActingSalonId),
  [null, null, null, null, null, null, null, null, null, null]);
eq('文字列でないものは null', [A.parseActingSalonId(12), A.parseActingSalonId(null), A.parseActingSalonId(undefined), A.parseActingSalonId({}), A.parseActingSalonId(['12'])], [null, null, null, null, null]);

console.log('\n── 2. ★★★ 効くのは運営アカウントだけ ──');
eq('運営＋cookie あり → その店', A.actingSalonIdFor({ userId: ADMIN, adminUuid: ADMIN, cookie: '12' }), 12);
eq('★★★ 店舗様は、cookie があっても null', A.actingSalonIdFor({ userId: SHOP, adminUuid: ADMIN, cookie: '12' }), null);
eq('★★★ ログインしていない（null・undefined・空）は null', [null, undefined, ''].map((u) => A.actingSalonIdFor({ userId: u, adminUuid: ADMIN, cookie: '12' })), [null, null, null]);
eq('★★★ 運営の番号が読めていない（空・null）ときは、誰にも通さない',
  [A.actingSalonIdFor({ userId: '', adminUuid: '', cookie: '12' }), A.actingSalonIdFor({ userId: SHOP, adminUuid: null, cookie: '12' }), A.actingSalonIdFor({ userId: undefined, adminUuid: undefined, cookie: '12' })], [null, null, null]);
eq('運営でも cookie が無い・変なら null（＝今までどおり自分の店）', [undefined, '', 'abc'].map((c) => A.actingSalonIdFor({ userId: ADMIN, adminUuid: ADMIN, cookie: c })), [null, null, null]);

console.log('\n── 3. ★★★ 同意は代わりに入れられない ──');
eq('★★★ 運営がほかの人の店で、新しく同意を記録する保存 → 止める', A.operatorConsentBlocked({ isOwner: false, newlyAgreed: true }), true);
eq('★★ 運営がほかの人の店で、同意済みの枠の変更 → 通す', A.operatorConsentBlocked({ isOwner: false, newlyAgreed: false }), false);
eq('★★ 持ち主本人は今までどおり（はじめての登録も通す）', [A.operatorConsentBlocked({ isOwner: true, newlyAgreed: true }), A.operatorConsentBlocked({ isOwner: true, newlyAgreed: false })], [false, false]);
eq('断る文に、誰がやるか・運営ができることが入っている', [/店舗様ご本人のログイン/.test(A.OPERATOR_FIRST_CONSENT_MESSAGE), /ID・パスワードの変更だけ/.test(A.OPERATOR_FIRST_CONSENT_MESSAGE)], [true, true]);

console.log('\n── 4. 画面とサーバーの店の食い違い ──');
eq('同じなら読み直さない', A.actingScreenIsStale({ salonId: 12, acting: true }, { salonId: 12, acting: true }), false);
eq('★★★ 別のタブで店を変えた → 読み直す', A.actingScreenIsStale({ salonId: 12, acting: true }, { salonId: 5, acting: true }), true);
eq('★★★ 別のタブでやめた → 読み直す', [A.actingScreenIsStale({ salonId: 12, acting: true }, { salonId: 1, acting: false }), A.actingScreenIsStale({ salonId: 12, acting: true }, { salonId: null, acting: false })], [true, true]);
eq('一覧の説明', [A.operatorSalonNote({ switched: true, contract: true, hidden: false }), A.operatorSalonNote({ switched: false, contract: false, hidden: true })], ['切り替え済み・契約あり', '切り替え前・契約なし・非表示']);

console.log('\n── 5. ★★★ コードが同じ決まりを通っている ──');
const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const actionsDir = path.join(__dirname, '..', 'src', 'app', 'actions');
const conecfActions = fs.readdirSync(actionsDir).filter((f) => /^conecf.*\.ts$/.test(f));
// ★ 「自分の店を読む」所を、じかに owner_id = 自分 で書いているファイル（conecf.ts の getConecfAccess の1か所だけは別＝下で見る）
const raw = conecfActions.filter((f) => /\.eq\('owner_id', user\.id\)/.test(read('src', 'app', 'actions', f)));
eq('★★★ コネックエフの actions に、じかに owner_id = 自分 で店を読む所が残っていない（conecf.ts の1か所を除く）', raw, ['conecf.ts']);
const scoped = conecfActions.filter((f) => /scopeConecfSalon\(svc\.from\('salons'\)\.select\(/.test(read('src', 'app', 'actions', f)));
eq('★★★ 8つのファイルが scopeConecfSalon を通っている',
  scoped.sort(), ['conecfBump.ts', 'conecfCocoa.ts', 'conecfDiaryMixed.ts', 'conecfFirstImport.ts', 'conecfGirlEdit.ts', 'conecfGirls.ts', 'conecfImasugu.ts', 'conecfSchedule.ts']);
eq('★★★ どれも、その直前で operatorActingSalonId(user.id) を読んでいる',
  scoped.map((f) => { const s = read('src', 'app', 'actions', f); return (s.match(/const actingId = await operatorActingSalonId\(user\.id\);/g) || []).length === (s.match(/scopeConecfSalon\(/g) || []).length; }), scoped.map(() => true));
const lib = read('src', 'app', 'lib', 'conecf', 'actingSalon.ts');
eq('★★★ cookie を読む前に、運営アカウントかを見ている', /if \(!userId \|\| userId !== ADMIN_UUID\) return null;[\s\S]*cookies\(\)/.test(lib), true);
eq('★★ 店舗様のときの読み方は今までと同じ並び（非表示でない店を先・id の若い順）', /q\.eq\('owner_id', userId\)\.order\('is_hidden', \{ ascending: true \}\)\.order\('id', \{ ascending: true \}\)/.test(lib), true);
const conecf = read('src', 'app', 'actions', 'conecf.ts');
eq('★★★ 店を選ぶ・一覧を読むのは運営だけ（先頭で確かめる）',
  [/export async function setConecfActingSalon[\s\S]{0,200}if \(!\(await operatorUserId\(\)\)\) return/.test(conecf), /export async function listConecfOperatorSalons[\s\S]{0,200}if \(!\(await operatorUserId\(\)\)\) return/.test(conecf), /return user && user\.id === ADMIN_UUID \? user\.id : null;/.test(conecf)], [true, true, true]);
eq('★★ cookie は httpOnly・期限なし（画面とサーバーの食い違いを作らない）', [/httpOnly: true/.test(conecf), /maxAge/.test(conecf)], [true, false]);
eq('★★ 入口（getConecfAccess）も同じ cookie を見て、acting を返す', [/const actingId = await operatorActingSalonId\(user\.id\);/.test(conecf), /acting: \(\(picked\.owner_id as string \| null\) \?\? null\) !== user\.id/.test(conecf)], [true, true]);
const cred = read('src', 'app', 'actions', 'mediaCredentials.ts');
eq('★★★ ID・パスワードの保存が、同意の代行を止めている（チェックの有無に関係なく）',
  [/if \(!guard\.data\.isOwner\) \{[\s\S]{0,300}agreed: true,[\s\S]{0,200}operatorConsentBlocked\(/.test(cred), /return \{ ok: false, error: OPERATOR_FIRST_CONSENT_MESSAGE \};/.test(cred)], [true, true]);
eq('★★ 止めるのは、同意の検査（!consent.ok）より前', cred.indexOf('OPERATOR_FIRST_CONSENT_MESSAGE };') < cred.indexOf('if (!consent.ok) {') && cred.indexOf('OPERATOR_FIRST_CONSENT_MESSAGE };') > 0, true);
const shell = read('src', 'app', 'conecf', 'ConecfShell.tsx');
eq('★★ 帯は運営にだけ出す', /access\.role === 'operator' && <OperatorBar access=\{access\} \/>/.test(shell), true);
eq('★ まだ使えない所（お知らせ・フクエスの上位表示・写真）は、運営として操作中だけ案内に替える',
  [/a\.acting\s*\? <OperatorNotYet what="フクエスお知らせ" \/>/.test(read('src', 'app', 'conecf', 'announce', 'page.tsx')),
   /acting \? <OperatorNotYet what="フクエスの上位表示" \/> : <SalonBumpButton/.test(read('src', 'app', 'conecf', 'bump', 'page.tsx')),
   /if \(acting\) \{ onToast\(OPERATOR_NOT_YET_MESSAGE\); return; \}/.test(read('src', 'app', 'conecf', 'cocoa', 'page.tsx')),
   /if \(acting\) \{ onToast\(OPERATOR_NOT_YET_MESSAGE\); return; \}/.test(read('src', 'app', 'conecf', 'girls', '[id]', 'page.tsx'))], [true, true, true, true]);

console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
