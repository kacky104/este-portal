// 中継のジョブを送り直してよいか（src/lib/relayRetry.ts）の自己点検（第1278便・2026-10-07）。
//
// ★★★ ここで見張っているのは:
//   ① 相手を書き換える段を、返事が無いからといって送り直さないこと（同じ写メ日記が2本載る・同じ方が二重に登録される）
//   ② 段を新しく足したのに、ここへ分類し忘れること（★ 忘れたら落とす。実行時は「送り直さない」側に倒れる）
//
//   使い方:  npm run check:relayretry

const fs = require('fs');
const path = require('path');
const m = require(path.join(__dirname, '..', '_tmpcheck', 'relayRetry.js'));

let fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { console.log('NG ' + name + '\n   got  ' + g + '\n   want ' + w); fail++; }
  else console.log('ok ' + name);
};

console.log('── 1. ★★★ 段の名前が、すべて分類されている ──');
{
  // relayQueue.ts の RelayPurpose（段の名前の一覧）を、ソースからそのまま読む
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'app', 'lib', 'media', 'relayQueue.ts'), 'utf8');
  const a = src.indexOf('export type RelayPurpose =');
  const b = src.indexOf('export type LeasedJob');
  const block = src.slice(a, b).split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
  const purposes = [...block.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
  eq('★ 段の名前を読めた（60前後）', purposes.length > 50 && purposes.length < 90, true);
  const safe = new Set(m.RETRY_SAFE_PURPOSES), no = new Set(m.NO_RETRY_PURPOSES);
  eq('★★★ どちらにも入っていない段は無い（足したら lib/relayRetry.ts に分類を書くこと）', purposes.filter((p) => !safe.has(p) && !no.has(p)), []);
  eq('★★★ 両方に入っている段は無い', purposes.filter((p) => safe.has(p) && no.has(p)), []);
  eq('★★ 一覧に無い名前を分類に書いていない（打ち間違い）', [...m.RETRY_SAFE_PURPOSES, ...m.NO_RETRY_PURPOSES].filter((p) => !purposes.includes(p)), []);
  eq('★ 重複なし', [m.RETRY_SAFE_PURPOSES.length, m.NO_RETRY_PURPOSES.length], [safe.size, no.size]);
}

console.log('\n── 2. ★★★ 相手を書き換える段は、送り直さない ──');
{
  const writes = ['write_work', 'esutama_work_save', 'girl_create', 'esutama_cast_create', 'esutama_diary_post', 'girl_delete', 'girl_edit', 'esutama_edit_save',
    'upload_photo', 'crop_photo', 'delete_photo', 'esutama_photo_save', 'article_save', 'article_image', 'sokuhime_set', 'sokuhime_del', 'esutama_sokusera_start', 'esutama_cast_hide'];
  eq('★★★ 出勤の保存・登録・削除・写真・写メ日記の投稿・新着・即ヒメ・即セラ', writes.filter((p) => m.isRetrySafePurpose(p)), []);
  eq('★★★ 知らない段（分類し忘れ）は、送り直さない側に倒れる', [m.isRetrySafePurpose('something_new'), m.isRetrySafePurpose('')], [false, false]);
  const reads = ['login', 'esutama_login', 'read_work', 'verify_work', 'esutama_work_read', 'esutama_work_verify', 'read_girls', 'article_verify', 'read_diary_list'];
  eq('★★ 読むだけ・ログインは送り直してよい', reads.filter((p) => !m.isRetrySafePurpose(p)), []);
  eq('★★ 代理ログインを閉じる段（本人のセッションを残さない）は、もう一度閉じに行く', [m.isRetrySafePurpose('esutama_diary_end'), m.isRetrySafePurpose('esutama_sokusera_end')], [true, true]);
}

console.log('\n── 3. 返事が無かったとき ──');
{
  const act = (purpose, attempts) => m.noResponseAction({ purpose, attempts, maxAttempts: 3 });
  eq('★★★ 書き換える段は、1回目で打ち切る', [act('write_work', 1), act('esutama_diary_post', 1), act('girl_create', 1)], ['stop_write', 'stop_write', 'stop_write']);
  eq('★★ 読むだけの段は、3回まで', [act('read_work', 1), act('read_work', 2), act('read_work', 3)], ['retry', 'retry', 'give_up']);
  eq('★★ 読み直し（照合）も読むだけ', [act('verify_work', 1), act('verify_work', 3)], ['retry', 'give_up']);
  eq('★ 知らない段は打ち切る', act('something_new', 1), 'stop_write');
}

console.log('\n── 4. 掴んだまま戻らなかったとき ──');
eq('★★★ 書き換える段は、もう一度渡さない', [m.reLeaseAction('write_work'), m.reLeaseAction('esutama_cast_create'), m.reLeaseAction('something_new')], ['stop_write', 'stop_write', 'stop_write']);
eq('★★ 読むだけの段は、今までどおり渡す', [m.reLeaseAction('read_work'), m.reLeaseAction('login')], ['resend', 'resend']);

console.log('\n── 5. 掃除は5分に1回 ──');
{
  const at = (min) => Date.UTC(2026, 9, 7, 7, min, 30);
  eq('★ 0・5・10…分にやる', [0, 5, 10, 55].map((x) => m.isStuckSweepMinute(at(x))), [true, true, true, true]);
  eq('★ それ以外の分はやらない', [1, 4, 6, 59].map((x) => m.isStuckSweepMinute(at(x))), [false, false, false, false]);
  let n = 0; for (let i = 0; i < 1440; i++) if (m.isStuckSweepMinute(Date.UTC(2026, 9, 7, 0, i, 0))) n++;
  eq('★★ 1日に288回（毎分の1440回ではない）', n, 288);
}

console.log(fail === 0 ? '\n全部 ok' : '\nNG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
