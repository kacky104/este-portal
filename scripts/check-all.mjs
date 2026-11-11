// 自己点検をまとめて回す（第1956便・2026-11-12）。
// ★ 前は「&&」でつないでいたので、1本失敗すると残りが回らなかった（10/28 から1本目で止まっていた）。
//   ★ 1本失敗しても最後まで回し、失敗した名前を最後に並べる。失敗が1本でもあれば終了コード 1。
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const scripts = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).scripts;
const names = Object.keys(scripts).filter((k) => k.startsWith('check:') && k !== 'check:all');
const failed = [];
for (const [i, name] of names.entries()) {
  const r = spawnSync('npm', ['run', '-s', name], { encoding: 'utf8', shell: process.platform === 'win32' });
  const ok = r.status === 0;
  console.log(`${ok ? 'ok ' : 'NG '} ${String(i + 1).padStart(3)}/${names.length} ${name}`);
  if (!ok) { failed.push(name); console.log(((r.stdout ?? '') + (r.stderr ?? '')).split('\n').filter((l) => /^NG|Error|error TS/.test(l)).slice(0, 12).map((l) => '      ' + l).join('\n')); }
}
console.log(failed.length === 0 ? `\n★ ${names.length}本すべて通った` : `\n★ 失敗 ${failed.length}本: ${failed.join(' ')}`);
process.exit(failed.length === 0 ? 0 : 1);
