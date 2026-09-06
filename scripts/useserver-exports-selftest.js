// 'use server' のファイルは【async関数だけ】を export できる、の見張り（第178便）。
//
// ★★★ なぜ要るか（2026-09-06・実際に起きた事故）
//   src/app/actions/vipLetters.ts に
//       export const SENT_LETTERS_WINDOW_DAYS = 30;
//   と【定数】を1行足しただけで、そのファイルの **サーバーアクションが全部呼べなくなった**。
//   画面では
//     ・「対象人数を確認中…」のまま止まる
//     ・「送信済みVIPレター」が「通信に失敗しました」になる
//     ・VIPレターが実際には届かない
//   となり、原因がコードのどこにも書いていないので見つけるのに時間がかかった。
//
//   ★ Next.js の決まり：'use server' を先頭に書いたファイルからは、
//     async関数（と、消えてなくなる type / interface）しか export してはいけない。
//   ★ 定数を画面に出したいときは、素のファイル（例 src/lib/vipLetterWindow.ts）に置いて
//     画面側がそこから直接読む。
//
//   使い方:  npm run check:useserver

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');

// ── ここから下は「判断」。★ 純関数にして下で自己点検する ──────────────

/** ファイルの先頭が 'use server' か（★ 関数の中に書いた 'use server' は対象外）。 */
function isUseServerFile(source) {
  const lines = String(source).split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (line === '') continue;
    if (line.startsWith('//')) continue;
    if (line.startsWith('/*') || line.startsWith('*')) continue;
    return /^['"]use server['"];?$/.test(line);
  }
  return false;
}

/** そのファイルの「してはいけない export」を行番号つきで返す（★ 無ければ空） */
function badExports(source) {
  const out = [];
  const lines = String(source).split('\n');
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line.startsWith('export')) return;
    // ★ 許すのはこの3つだけ
    if (/^export\s+async\s+function\s/.test(line)) return;          // サーバーアクション本体
    if (/^export\s+default\s+async\s+function\b/.test(line)) return; // 既定の書き出し
    if (/^export\s+(type|interface)\s/.test(line)) return;           // 型は消えてなくなるのでOK
    if (/^export\s+type\s*\{/.test(line)) return;                    // export type { ... }
    out.push({ line: i + 1, text: line });
  });
  return out;
}

// ── 自己点検（★ この見張り自体が正しく落ちるかを先に確かめる）─────────

let fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { console.log('NG ' + name + '\n   got  ' + g + '\n   want ' + w); fail++; }
  else console.log('ok ' + name);
};

eq("先頭の 'use server' を見つける", isUseServerFile("'use server';\n\nexport async function a() {}"), true);
eq('コメントの後でも見つける', isUseServerFile("// メモ\n\n'use server';\n"), true);
eq('ダブルクォートでも見つける', isUseServerFile('"use server";\n'), true);
eq("'use client' は対象外", isUseServerFile("'use client';\nexport const X = 1;\n"), false);
eq('ただのファイルは対象外', isUseServerFile('export const X = 1;\n'), false);
eq('関数の中の use server は対象外', isUseServerFile("export function f() {\n  'use server';\n}\n"), false);

eq('async関数のexportは通る', badExports("export async function send() {}\n"), []);
eq('type のexportは通る', badExports('export type A = { a: number };\n'), []);
eq('interface のexportは通る', badExports('export interface A { a: number }\n'), []);
// ★★ ここが落ちなければ、この見張りは意味がない
eq('★★ const のexportは落とす', badExports('export const DAYS = 30;\n').map(b => b.line), [1]);
eq('★★ 同期functionのexportは落とす', badExports('export function calc() {}\n').map(b => b.line), [1]);
eq('★★ let のexportは落とす', badExports('export let n = 0;\n').map(b => b.line), [1]);
eq('★★ default のexportは落とす', badExports('export default 30;\n').map(b => b.line), [1]);
eq('★★ 値の再export は落とす', badExports("export { DAYS } from './x';\n").map(b => b.line), [1]);
eq('行番号を返す', badExports("export async function a() {}\nexport const X = 1;\n").map(b => b.line), [2]);

if (fail > 0) {
  console.log('\n★ 見張り自体がおかしい（NG ' + fail + ' 件）');
  process.exit(1);
}

// ── 本番のファイルを全部見る ───────────────────────────────

function walk(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) { walk(p, out); continue; }
    if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

if (!fs.existsSync(SRC)) {
  // ★ 「読めなかった」を「0件」と書かない
  console.log('\n★ src が見つからない（' + SRC + '）。確かめられなかった');
  process.exit(1);
}

const files = walk(SRC, []);
const serverFiles = files.filter((p) => isUseServerFile(fs.readFileSync(p, 'utf8')));
console.log('\n見た use server のファイル: ' + serverFiles.length + ' 件（src全体 ' + files.length + ' 件）');

let ng = 0;
for (const p of serverFiles) {
  const bad = badExports(fs.readFileSync(p, 'utf8'));
  const rel = path.relative(ROOT, p);
  if (bad.length === 0) { console.log('ok ' + rel); continue; }
  ng += bad.length;
  for (const b of bad) {
    console.log('NG ' + rel + ':' + b.line + '  ' + b.text);
    console.log('   → async関数以外は export できない。定数は src/lib/ の素のファイルへ移して、画面側がそこから読む。');
  }
}

console.log(ng === 0 ? '\n★ すべて通った' : '\n★ NG ' + ng + ' 件');
process.exit(ng === 0 ? 0 : 1);
