// 中継のジョブの順番待ち（src/lib/relayWait.ts）の自己点検（第1296便・2026-10-08）。
//
// ★★★ ここで見張っているのは:
//   ① 順番待ちにするのは、人が押した【削除・プロフィール更新・新規登録】だけ（自動の周・読み取りを順番待ちにしない）
//   ② 待ちすぎた操作（15分）は、繰り上げより【先に】取りやめる（中継が止まっていた間の操作を、何時間もあとで送らない）
//   ③ 押した順（店・サイト・枠ごとにいちばん古い1件から）・3件まで
//   ④ 順番待ちの行を、走っているジョブとして数えない／引き取らない（ソースをそのまま読んで確かめる）
//
//   使い方:  npm run check:relaywait

const fs = require('fs');
const path = require('path');
const m = require(path.join(__dirname, '..', '_tmpcheck', 'relayWait.js'));

let fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { console.log('NG ' + name + '\n   got  ' + g + '\n   want ' + w); fail++; }
  else console.log('ok ' + name);
};
const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

console.log('── 1. ★★★ 決まり（カッキーさんの OK・10/8）──');
{
  eq('★ 待つのは15分まで', m.WAIT_MAX_MINUTES, 15);
  eq('★ 同じ店・サイト・枠で待てるのは3件まで', m.WAIT_MAX_PER_SLOT, 3);
  eq('★ status の綴り', m.WAIT_STATUS, 'waiting');
  eq('★★★ 順番待ちにしてよい流れは、削除・プロフィール更新・新規登録の6つだけ',
    [...m.WAIT_INTENTS].sort(), ['cast_create', 'cast_edit', 'cast_hide', 'girl_create', 'girl_delete', 'girl_edit']);
  const never = ['work_push', 'work_auto', 'work_dryrun', 'connect_test', 'roster_read', 'sokuhime_read', 'sokuhime_push', 'sokuhime_auto',
    'sokusera_push', 'sokusera_auto', 'diary_push', 'diary_auto', 'diary_read', 'mail_apply', 'mail_dryrun', 'article_slots', 'photo_push', 'cast_photo', ''];
  eq('★★★ 出勤・即ヒメ・即セラ・写メ日記・新着情報・読み取りは、順番待ちにしない', never.filter((i) => m.canWaitIntent(i)), []);

  // 流れの名前の打ち間違いを見張る（lib/relayFlow.ts の RelayFlowIntent に在ること）
  const flow = read('src', 'lib', 'relayFlow.ts');
  eq('★★ 6つとも、流れの名前の一覧（RelayFlowIntent）に在る', m.WAIT_INTENTS.filter((i) => !flow.includes("| '" + i + "'")), []);
}

console.log('\n── 2. ★★★ 積むときの判断 ──');
{
  const d = (wantWait, slotBusy, waitingCount) => m.enqueueDecision({ wantWait, slotBusy, waitingCount });
  eq('頼んでいない・空いている → ふつうに積む', d(false, false, 0), 'queue');
  eq('★★★ 頼んでいない・動いている → 断る（今までどおり。自動の周・読み取り）', d(false, true, 0), 'busy');
  eq('★★★ 頼んでいない流れは、待っている操作があっても並ばない（今までどおり積む）', d(false, false, 2), 'queue');
  eq('頼んだ・空いている・誰も待っていない → ふつうに積む', d(true, false, 0), 'queue');
  eq('★★★ 頼んだ・動いている → 順番待ち', d(true, true, 0), 'wait');
  eq('★★ 頼んだ・空いているが先に待っている操作がある → 後ろに並ぶ（押した順）', d(true, false, 1), 'wait');
  eq('頼んだ・2件待っている → 3件目として並ぶ', d(true, true, 2), 'wait');
  eq('★★★ 頼んだ・3件待っている → 断る（4件目は今までどおり）', [d(true, true, 3), d(true, false, 3), d(true, true, 9)], ['busy', 'busy', 'busy']);
  eq('件数が変な値 → 0件として扱う', [d(true, true, NaN), d(true, true, -1)], ['wait', 'wait']);
}

console.log('\n── 3. ★★★ 取りやめと繰り上げ ──');
{
  const now = Date.UTC(2026, 9, 8, 3, 0, 0);
  const ago = (min) => new Date(now - min * 60 * 1000).toISOString();
  const row = (id, salonId, provider, slot, min) => ({ id, salonId, provider, slot, createdAt: ago(min) });

  eq('14分59秒は待つ・15分ちょうども待つ・15分1秒は取りやめ', [
    m.isWaitExpired(new Date(now - (15 * 60 - 1) * 1000).toISOString(), now),
    m.isWaitExpired(ago(15), now),
    m.isWaitExpired(new Date(now - (15 * 60 + 1) * 1000).toISOString(), now),
  ], [false, false, true]);
  eq('★★ 時刻が読めない行は取りやめ（始めない側に倒す）', [m.isWaitExpired('', now), m.isWaitExpired('x', now)], [true, true]);

  const p1 = m.planWaiting([row('b', 6, 'ekichika', 1, 2), row('a', 6, 'ekichika', 1, 5), row('c', 6, 'esutama', 1, 1), row('d', 12, 'ekichika', 1, 3)], now);
  eq('★★★ 店・サイト・枠ごとに、いちばん古い1件だけ（押した順）', p1.promote.map((r) => r.id), ['a', 'd', 'c']);
  eq('取りやめは無い', p1.expire, []);

  const p2 = m.planWaiting([row('old', 6, 'ekichika', 1, 16), row('new', 6, 'ekichika', 1, 3)], now);
  eq('★★★ 待ちすぎた1件は取りやめ、その後ろの1件を繰り上げる', [p2.expire.map((r) => r.id), p2.promote.map((r) => r.id)], [['old'], ['new']]);

  // 中継（VPS）が3時間止まっていた → 動き出した最初の引き取り
  const p3 = m.planWaiting([row('x', 6, 'ekichika', 1, 180), row('y', 6, 'ekichika', 1, 170), row('z', 6, 'esutama', 1, 175)], now);
  eq('★★★ 中継が何時間も止まっていた間の操作は、動き出しても1件も送らない', [p3.expire.length, p3.promote.length], [3, 0]);

  eq('枠が違えば別々に並ぶ', m.planWaiting([row('s1', 6, 'ekichika', 1, 2), row('s2', 6, 'ekichika', 2, 1)], now).promote.map((r) => r.id), ['s1', 's2']);
  eq('空なら何もしない', m.planWaiting([], now), { expire: [], promote: [] });
}

console.log('\n── 4. 店舗様に見せる文 ──');
{
  const texts = [];
  for (const i of [...m.WAIT_INTENTS, 'unknown', '']) {
    texts.push(m.waitAcceptedSummary('駅ちか（枠1）', i), m.waitExpiredSummary('駅ちか（枠1）', i));
  }
  texts.push(m.waitToastNote(['駅ちか']), m.waitToastNote(['駅ちか', 'エステ魂（枠2）']));
  eq('★★ 「★」・内部の言葉（waiting / queued / ジョブ / 中継 / intent）を書いていない',
    texts.filter((t) => /★|waiting|queued|ジョブ|中継|intent|undefined|null/.test(t)), []);
  eq('空の文が無い', texts.filter((t) => !t || t.length < 10), []);
  eq('300字に収まる（記録の1行）', texts.filter((t) => t.length > 300), []);
  eq('★ 受け付けの文', m.waitAcceptedSummary('エステ魂（枠1）', 'cast_edit'),
    'エステ魂（枠1）で別の更新が動いているため、プロフィールの更新を順番待ちで受け付けました。前の更新が終わりしだい始めます');
  eq('★★★ 削除を取りやめた文は「非公開のまま残っている」「もう一度削除を押す」を言う',
    [/非公開のまま一覧に残っています/.test(m.waitExpiredSummary('駅ちか（枠1）', 'girl_delete')), /もう一度「削除」/.test(m.waitExpiredSummary('エステ魂（枠1）', 'cast_hide'))], [true, true]);
  eq('★★ 削除でない操作に「非公開」と言わない', ['girl_edit', 'cast_edit', 'girl_create', 'cast_create', ''].filter((i) => /非公開/.test(m.waitExpiredSummary('駅ちか（枠1）', i))), []);
  eq('★ 取りやめの文は上限の分数を言う', /15分/.test(m.waitExpiredSummary('駅ちか（枠1）', 'girl_edit')), true);
  eq('順番待ちが無ければ、足す文は空', [m.waitToastNote([]), m.waitToastNote([''])], ['', '']);
}

console.log('\n── 5. ★★★ ソースの見張り ──');
{
  const queue = read('src', 'app', 'lib', 'media', 'relayQueue.ts');
  const flowApp = read('src', 'app', 'lib', 'media', 'relayFlow.ts');

  // 引き取りは、順番待ちの行をそのまま渡さない
  const a = queue.indexOf('export async function leaseRelayJob');
  const b = queue.indexOf('export async function completeRelayJob');
  const lease = queue.slice(a, b);
  eq('★★★ 引き取りが拾うのは queued と、期限の切れた leased だけ（順番待ちを直接渡さない）',
    lease.includes(".or('status.eq.queued,and(status.eq.leased,leased_until.lt.' + nowISO + ')')") && !/status\.eq\.waiting|WAIT_STATUS/.test(lease), true);
  eq('★★★ 引き取りの前に、順番待ちの片づけを呼んでいる（失敗しても引き取りは続ける）',
    lease.indexOf('await promoteWaitingRelayJobs()') > 0 && lease.indexOf('await promoteWaitingRelayJobs()') < lease.indexOf('for (let tries = 0'), true);

  const c = queue.indexOf('export async function promoteWaitingRelayJobs');
  const promote = queue.slice(c, a);
  eq('★★★ 取りやめを、繰り上げより先にやる', promote.indexOf('for (const r of plan.expire)') > 0 && promote.indexOf('for (const r of plan.expire)') < promote.indexOf('for (const r of plan.promote)'), true);
  eq('★★ 取りやめ・繰り上げは、まだ順番待ちの行だけ（読んでから更新までの間に変わっていたら触らない）', (promote.match(/\.eq\('status', WAIT_STATUS\)/g) || []).length >= 3, true);
  eq('★★ 取りやめた行は expired（中身の掃除・90日掃除に乗る）', /status: 'expired'/.test(promote), true);

  // 終わったジョブの掃除の対象に、順番待ちを入れていない（待っている最中に中身を消さない）
  const purge = queue.slice(queue.indexOf('export async function purgeRelayJobs'));
  eq('★★ 中身の掃除は done / failed / expired だけ', (purge.match(/\.in\('status', \['done', 'failed', 'expired'\]\)/g) || []).length, 2);

  // 入口のふるい
  eq('★★★ startRelayFlow は、対象の流れ・人が押した操作のときだけ順番待ちを頼む',
    flowApp.includes("params.whenBusy === 'wait' && canWaitIntent(params.intent) && !isAutomaticActor(params.actor)"), true);
  eq('★★ 次の段（流れの途中）は順番待ちにしない', (flowApp.match(/whenBusy: 'wait'/g) || []).length, 1);

  // 頼んでいるのは、決めた3つの操作の入口だけ
  const walk = (dir, out = []) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, out);
      else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
    }
    return out;
  };
  const root = path.join(__dirname, '..', 'src');
  const users = walk(root)
    .filter((p) => /whenBusy: 'wait'/.test(fs.readFileSync(p, 'utf8')))
    .map((p) => path.relative(root, p).split(path.sep).join('/'))
    .sort();
  eq('★★★ 順番待ちを頼むのは、削除（conecfGirls）・プロフィール更新（conecfGirlEdit）・新規登録（mediaCredentials）と、入口の2ファイルだけ', users, [
    'app/actions/conecfGirlEdit.ts',
    'app/actions/conecfGirls.ts',
    'app/actions/mediaCredentials.ts',
    'app/lib/media/relayFlow.ts',
    'app/lib/media/relayQueue.ts',
  ].sort());
  eq('★★★ 自動の周・運営の口（app/api）は頼んでいない', users.filter((p) => p.startsWith('app/api/')), []);
  const cred = read('src', 'app', 'actions', 'mediaCredentials.ts');
  eq('★★ mediaCredentials で頼むのは新規登録の1か所だけ', [(cred.match(/whenBusy: 'wait'/g) || []).length, cred.includes("startRelayFlow({ ...m.flow, whenBusy: 'wait' })")], [1, true]);

  // 記録の理由の綴りと、flow_stalled を出している画面
  eq('★ 順番待ちの記録かどうか', [m.isWaitAuditReason('waiting'), m.isWaitAuditReason('wait_expired'), m.isWaitAuditReason('busy'), m.isWaitAuditReason(undefined), m.isWaitAuditReason(null)], [true, true, false, false, false]);
  const audit = read('src', 'lib', 'mediaAudit.ts');
  eq('★★ 記録の文（lib/mediaAudit.ts）が、同じ綴りの理由を見ている',
    [audit.includes("why === '" + m.WAIT_REASON_ACCEPTED + "'"), audit.includes("why === '" + m.WAIT_REASON_EXPIRED + "'")], [true, true]);
  eq('★★ 書く側（relayFlow）は、綴りを書き写さず定数を使う', [flowApp.includes('reason: WAIT_REASON_ACCEPTED'), flowApp.includes('reason: WAIT_REASON_EXPIRED'), /reason: 'wait/.test(flowApp)], [true, true, false]);
  eq('★★★ 新着情報の「直近の記録」は、順番待ちの行を混ぜない（種類が同じ flow_stalled なので、ここで外す）',
    read('src', 'app', 'actions', 'articleTemplates.ts').includes("!(r.event === 'flow_stalled' && isWaitAuditReason(r.detail?.['reason']))"), true);
  eq('★★ 記録の種類は足していない（古い画面が知らない種類を出さない）', /'flow_waiting'|'wait_expired',\s*\/\//.test(audit), false);

  // SQL
  const sql = read('追加SQL_第1296便_中継ジョブに順番待ち_2026-10-08.sql');
  eq('★★★ SQL の check 制約に、同じ綴りの値が入っている', sql.includes("check (status in ('queued', 'leased', 'done', 'failed', 'expired', '" + m.WAIT_STATUS + "'))"), true);
  eq('★★★ 走っているジョブを1件に限る索引には触らない（順番待ちを数えない）', /media_relay_jobs_one_active/.test(sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')), false);
  const mig = read('supabase', 'migrations', '20260827_media_relay_jobs.sql');
  eq('（元の索引は queued / leased だけ）', /media_relay_jobs_one_active[\s\S]{0,120}where status in \('queued', 'leased'\)/.test(mig), true);

  // relay.sh との間合い
  const sh = read('scripts', 'relay.sh');
  const idle = Number((/IDLE_SLEEP = (\d+)/.exec(sh) || [])[1]);
  eq('★★ 繰り上げを控える秒数は、relay.sh の空振りの待ち（IDLE_SLEEP）以下（長いと、繰り上げが必ず次の分の周になる）', idle > 0 && m.WAIT_SETTLE_SECONDS <= idle, true);
  eq('★★★ relay.sh は status を見ない（引き取りと結果の口だけ）', /waiting|queued|leased/.test(sh.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n')), false);
}

console.log(fail === 0 ? '\n全部 ok' : '\nNG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
