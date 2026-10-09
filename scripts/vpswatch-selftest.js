// VPS の見張り（src/lib/vpsWatch.ts）の自己点検（第1339便）。
//
// ★ この点検の芯
//   ① 止まっていないのに鳴らさない（まだ1回も来ていない・再起動の数分・DB の値が読めない）
//   ② 止まったら1回だけ鳴らし、戻ったら1回だけ知らせる（10分ごとに同じメールを出さない）
//   ③ 止まっているあいだの古いディスクの数字で鳴らさない
//   ④ 見張りを VPS に置かない（vercel.json の定期実行から動くこと）
//
//   使い方:  npm run check:vpswatch

const fs = require('fs');
const path = require('path');
const m = require(path.join(__dirname, '..', '_tmpcheck', 'vpsWatch.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};
const kinds = (p) => p.mails.map((x) => x.kind);
const NOW = '2026-10-09T10:00:00.000Z'; // 日本時間 19:00
const ago = (min) => new Date(Date.parse(NOW) - min * 60000).toISOString();
const row = (o) => Object.assign({ lastSeenAt: ago(3), diskPct: 7, memAvailMb: 578, downAlertedAt: null, diskAlertedAt: null }, o);

console.log('── 1. 決まりの数字（カッキーさん決定・10/9） ──');
eq('20分で知らせる', m.VPS_DOWN_MINUTES, 20);
eq('24時間ごとにもう一度', m.VPS_REMIND_HOURS, 24);
eq('ディスクは80%から', m.VPS_DISK_ALERT_PCT, 80);

console.log('\n── 2. 鳴らさないとき ──');
{
  const p = m.planVpsWatch(null, NOW);
  eq('★ 行が無い（crontab の行を足す前）は何も知らせない', [p.state, kinds(p), p.patch], ['never', [], {}]);
  const q = m.planVpsWatch(row({ lastSeenAt: null }), NOW);
  eq('★ 時刻が空でも何も知らせない', [q.state, kinds(q), q.patch], ['never', [], {}]);
  const r = m.planVpsWatch(row({ lastSeenAt: 'こわれた時刻' }), NOW);
  eq('★ 時刻が読めないとき「止まっている」と決めつけない', [r.state, kinds(r)], ['never', []]);
  const a = m.planVpsWatch(row({}), NOW);
  eq('来ている・ディスクも低い → 何もしない', [a.state, a.silentMinutes, kinds(a), a.patch], ['alive', 3, [], {}]);
  const b = m.planVpsWatch(row({ lastSeenAt: ago(19) }), NOW);
  eq('★ 19分はまだ鳴らさない（再起動や一時的な乱れ）', [b.state, kinds(b)], ['alive', []]);
  const c = m.planVpsWatch(row({ lastSeenAt: ago(-5) }), NOW);
  eq('★ 時計のずれで先の時刻でも落ちない・鳴らさない', [c.state, c.silentMinutes, kinds(c)], ['alive', 0, []]);
}

console.log('\n── 3. 止まった → 1回だけ知らせる → 戻ったら1回だけ ──');
{
  const p = m.planVpsWatch(row({ lastSeenAt: ago(20) }), NOW);
  eq('★★★ 20分で知らせる', [p.state, p.silentMinutes, kinds(p), p.patch], ['down', 20, ['down'], { down_alerted_at: NOW }]);
  eq('件名に、最後に来た時刻（日本時間）', p.mails[0].subject, '【フクエス】VPS から連絡がありません（最後は 10/09 18:40）');
  eq('本文に、止まっている分数と、そのときのディスク・メモリ', [p.mails[0].lines[0], p.mails[0].lines[1]],
    ['VPS（取り込み・中継）からの連絡が、20分 止まっています。', '最後に来たのは 10/09 18:40（そのとき: ディスク 7%・メモリ残り 578MB）。']);
  const q = m.planVpsWatch(row({ lastSeenAt: ago(30), downAlertedAt: ago(10) }), NOW);
  eq('★★★ 知らせたあとは、10分ごとに同じメールを出さない', [q.state, kinds(q), q.patch], ['down', [], {}]);
  const r = m.planVpsWatch(row({ lastSeenAt: ago(24 * 60 + 25), downAlertedAt: ago(24 * 60) }), NOW);
  eq('★ 止まったまま24時間 → もう一度', [kinds(r), r.patch], [['down_reminder'], { down_alerted_at: NOW }]);
  eq('2回目の件名は「まだ止まっています」', /※まだ止まっています$/.test(r.mails[0].subject), true);
  const s = m.planVpsWatch(row({ lastSeenAt: ago(23 * 60 + 59 + 20), downAlertedAt: ago(23 * 60 + 59) }), NOW);
  eq('★ 24時間たつ前は出さない', kinds(s), []);
  const t = m.planVpsWatch(row({ lastSeenAt: ago(2), downAlertedAt: ago(45) }), NOW);
  eq('★★★ 戻ったら1回知らせて、印を外す', [t.state, kinds(t), t.patch], ['alive', ['recovered'], { down_alerted_at: null }]);
  const u = m.planVpsWatch(row({ lastSeenAt: ago(2), downAlertedAt: null }), NOW);
  eq('★ 知らせていない停止（20分未満）から戻っても、戻ったメールは出さない', kinds(u), []);
}

console.log('\n── 4. ディスク ──');
{
  const p = m.planVpsWatch(row({ diskPct: 80 }), NOW);
  eq('★★ 80% で知らせる', [kinds(p), p.patch], [['disk'], { disk_alerted_at: NOW }]);
  eq('件名に%', p.mails[0].subject, '【フクエス】VPS のディスクが 80% です');
  eq('79% は知らせない', kinds(m.planVpsWatch(row({ diskPct: 79 }), NOW)), []);
  const q = m.planVpsWatch(row({ diskPct: 91, diskAlertedAt: ago(60) }), NOW);
  eq('★ 知らせたあとは、24時間たつまで出さない', [kinds(q), q.patch], [[], {}]);
  eq('★ 24時間たったらもう一度', kinds(m.planVpsWatch(row({ diskPct: 91, diskAlertedAt: ago(24 * 60) }), NOW)), ['disk']);
  const r = m.planVpsWatch(row({ diskPct: 60, diskAlertedAt: ago(60) }), NOW);
  eq('★ 下回ったら印を外す（メールは出さない）', [kinds(r), r.patch], [[], { disk_alerted_at: null }]);
  const s = m.planVpsWatch(row({ diskPct: null, diskAlertedAt: ago(60) }), NOW);
  eq('★ 数字が読めないときは、印を外さない・鳴らさない', [kinds(s), s.patch], [[], {}]);
  const t = m.planVpsWatch(row({ lastSeenAt: ago(40), diskPct: 95 }), NOW);
  eq('★★★ 止まっているあいだは、古いディスクの数字で鳴らさない（止まった知らせだけ）', kinds(t), ['down']);
  const u = m.planVpsWatch(row({ lastSeenAt: ago(2), downAlertedAt: ago(45), diskPct: 100 }), NOW);
  eq('★ 戻った＋ディスクが高い → 2通', [kinds(u), u.patch], [['recovered', 'disk'], { down_alerted_at: null, disk_alerted_at: NOW }]);
}

console.log('\n── 5. VPS から届いた体を読む ──');
eq('ふつう', m.parseHeartbeatBody({ diskPct: 7, memAvailMb: 578 }), { diskPct: 7, memAvailMb: 578 });
eq('★ 文字の数字は読まない（null）', m.parseHeartbeatBody({ diskPct: '7', memAvailMb: '578' }), { diskPct: null, memAvailMb: null });
eq('★ 範囲の外は null（100 や 0 のふりをさせない）', m.parseHeartbeatBody({ diskPct: 101, memAvailMb: -1 }), { diskPct: null, memAvailMb: null });
eq('★ 空・null・配列でも落ちない', [m.parseHeartbeatBody(null), m.parseHeartbeatBody({}), m.parseHeartbeatBody([1])],
  [{ diskPct: null, memAvailMb: null }, { diskPct: null, memAvailMb: null }, { diskPct: null, memAvailMb: null }]);
eq('小数は丸める', m.parseHeartbeatBody({ diskPct: 7.6, memAvailMb: 100.2 }), { diskPct: 8, memAvailMb: 100 });

console.log('\n── 6. 日本時間 ──');
eq('UTC 10:00 → 19:00', m.jstStamp('2026-10-09T10:00:00Z'), '10/09 19:00');
eq('日付をまたぐ', m.jstStamp('2026-10-09T15:30:00Z'), '10/10 00:30');
eq('★ 読めない時刻は「不明」', [m.jstStamp(null), m.jstStamp('x')], ['不明', '不明']);

console.log('\n── 7. つなぎ（作り） ──');
{
  const root = path.join(__dirname, '..');
  const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
  const vj = JSON.parse(read('vercel.json'));
  const cron = (vj.crons || []).filter((c) => c.path === '/api/cron/vps-watch');
  eq('★★★ 見張りは Vercel の定期実行から動く（VPS に置かない）', cron.length, 1);
  eq('10分ごと', cron[0] && cron[0].schedule, '*/10 * * * *');
  const watch = read('src/app/api/cron/vps-watch/route.ts');
  eq('★ Vercel の定期実行は GET で来る', /export async function GET\(/.test(watch), true);
  eq('★ 鍵（CRON_SECRET）を確かめている', /authorization'\) !== `Bearer \$\{secret\}`/.test(watch), true);
  eq('★ 決めるのは lib/vpsWatch.ts（口の中で条件を書き直さない）', /planVpsWatch\(row, nowIso\)/.test(watch), true);
  eq('★ 読めないときは 500 を返して、メールを出さない', /読めなかった: /.test(watch) && watch.indexOf('読めなかった: ') < watch.indexOf('notifyAdmin(m.subject'), true);
  const hb = read('src/app/api/relay/heartbeat/route.ts');
  eq('★ 連絡を受ける口は POST・鍵つき', /export async function POST\(/.test(hb) && /authorization'\) !== `Bearer \$\{secret\}`/.test(hb), true);
  eq('★★ 連絡を受ける口は、知らせた印に触らない', /down_alerted_at|disk_alerted_at/.test(hb.replace(/^\s*\/\/.*$/gm, '')), false);
  eq('★ 連絡を受ける口はメールを出さない', /notifyAdmin/.test(hb), false);
  // ★ crontab では % が改行の意味になる。コメントに書いた見本の行に % が無いこと
  const sample = (hb.match(/^\/\/\s+(\*\/5 \* \* \* \* .*)$/m) || [])[1] || '';
  eq('crontab の見本の行がある', sample.length > 50, true);
  eq('★★ crontab の見本の行に % が無い', sample.includes('%'), false);
}

console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
