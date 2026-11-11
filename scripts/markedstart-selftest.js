// 5分ごとの周の「印を書く → 始める → だめなら戻す」（src/lib/markedStart.ts）の自己点検（第1958便）。
const path = require('path');
const { runMarked } = require(path.join(__dirname, '..', '_tmpcheck', 'markedStart.js'));
let fail = 0;
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log((ok ? 'ok ' : 'NG ') + name); if (!ok) console.log('   got  ' + JSON.stringify(got) + '\n   want ' + JSON.stringify(want)); };
const base = { salonId: 7, provider: 'esutama:x', slot: 1 };
const mk = (o) => { const log = []; return { log, args: Object.assign({ tag: 't', base, undoOn: 'any',
  mark: async () => { log.push('mark'); return { error: null }; }, undo: async () => { log.push('undo'); },
  start: async () => { log.push('start'); return { ok: true, note: 'n' }; }, afterStart: () => { log.push('after'); } }, o) }; };
(async () => {
  const origErr = console.error; console.error = () => {};
  let t = mk({}); let r = await runMarked(t.args);
  eq('★ 始められた: 印 → 始める → あと・戻さない', [t.log, r], [['mark', 'start', 'after'], { ...base, reason: 'ok', started: true, note: 'n' }]);
  t = mk({ mark: async () => ({ error: { message: 'db' } }) }); r = await runMarked(t.args);
  eq('★★★ 印を書けなければ始めない', [t.log, r], [[], { ...base, reason: 'mark_failed', note: 'db' }]);
  t = mk({ start: async () => ({ ok: false, reason: 'busy', note: 'b' }) }); r = await runMarked(t.args);
  eq('★★ any: ぶつかったら戻す', [t.log, r.started, r.reason], [['mark', 'after', 'undo'], false, 'ok']);
  t = mk({ start: async () => ({ ok: false, reason: 'disabled', note: 'd' }) }); r = await runMarked(t.args);
  eq('★★ any: ぶつかった以外でも戻す', t.log, ['mark', 'after', 'undo']);
  t = mk({ undoOn: 'busy', start: async () => ({ ok: false, reason: 'busy', note: 'b' }) }); await runMarked(t.args);
  eq('★★★ busy: ぶつかったら戻す（第1954便）', t.log, ['mark', 'after', 'undo']);
  t = mk({ undoOn: 'busy', start: async () => ({ ok: false, reason: 'disabled', note: 'd' }) }); await runMarked(t.args);
  eq('★★ busy: ぶつかった以外は戻さない', t.log, ['mark', 'after']);
  t = mk({ undoOn: 'busy', start: async () => { throw new Error('x'); }, failNote: 'L' }); r = await runMarked(t.args);
  eq('★★★ 例外のときは必ず戻す・あとは呼ばない', [t.log, r], [['mark', 'undo'], { ...base, reason: 'start_failed', note: 'L' }]);
  t = mk({ note: (f) => 'L／' + f.note }); r = await runMarked(t.args);
  eq('★ 結果の文を足せる', r.note, 'L／n');
  console.error = origErr;
  console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
  process.exit(fail === 0 ? 0 : 1);
})();
