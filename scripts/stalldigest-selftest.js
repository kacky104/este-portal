// 全店の「止まっているもの」の一覧（src/lib/stallDigest.ts）の自己点検（第1340便）。
//
// ★ この点検の芯
//   ① 0件のとき、「見ていない」と「止まっていない」を混ぜない（見た数を必ず出す）
//   ② 読めなかった店を、だまって消さない
//   ③ 見るだけの口が、DB に書かない・メールを出さない
//   ④ 新しい基準を作らない（今ある見張りの関数を呼ぶ）
//
//   使い方:  npm run check:stalldigest

const fs = require('fs');
const path = require('path');
const m = require(path.join(__dirname, '..', '_tmpcheck', 'stallDigest.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};
const item = (o) => {
  const base = Object.assign({ watch: 'import', salonId: 3, provider: 'ekichika', slot: 1, reason: 'list_stale' }, o);
  return Object.assign({ key: m.stallKey(base), salonName: '作り物の店', siteLabel: '駅ちか（枠1）', elapsedHours: 5.4, message: '取り込みが止まっています' }, base, o);
};
const checked = { salons: 12, credentials: 4, diarySlots: 3, diaryQuiet: 1 };

console.log('── 1. 名前（同じ止まりを、次の回にも同じものと分かる） ──');
eq('key の形', m.stallKey({ watch: 'write', salonId: 3, provider: 'esutama', slot: 2, reason: 'never_sent' }), 'write:3:esutama:2:never_sent');
eq('★ 見張りが違えば別のもの（同じ枠で2つ鳴ることがある）',
  m.stallKey({ watch: 'import', salonId: 3, provider: 'ekichika', slot: 1, reason: 'x' }) !== m.stallKey({ watch: 'write', salonId: 3, provider: 'ekichika', slot: 1, reason: 'x' }), true);

console.log('\n── 2. 0件のとき ──');
{
  const lines = m.formatStallOverview({ items: [], checked, errors: [] });
  eq('★★★ 0件でも、見た数を出す', lines, ['止まっているもの・うまくいっていないもの: 0 件（見た数: 店 12・ログイン情報 4・写メ日記の枠 3〔うち見張っていない枠 1〕）']);
  const none = m.formatStallOverview({ items: [], checked: { salons: 0, credentials: 0, diarySlots: 0, diaryQuiet: 0 }, errors: [] });
  eq('★ 何も見ていないときは、見た数が 0 と読める', none[0], '止まっているもの・うまくいっていないもの: 0 件（見た数: 店 0・ログイン情報 0・写メ日記の枠 0）');
}

console.log('\n── 3. 並べ方 ──');
{
  const lines = m.formatStallOverview({
    items: [
      item({ salonId: 9, salonName: 'うしろの店', watch: 'problem', reason: 'login', message: 'ログインできていません', elapsedHours: null }),
      item({ watch: 'diary', reason: 'listed_stale', message: '巡回が止まっています', elapsedHours: 6 }),
      item({}),
    ],
    checked, errors: [],
  });
  eq('店の番号の小さい順・同じ店の中は見張りの順', lines.slice(1), [
    '',
    '■ 作り物の店（店 3）',
    '  ・駅ちか（枠1）［出勤の取り込み］取り込みが止まっています〔約5時間〕  <list_stale>',
    '  ・駅ちか（枠1）［写メ日記の巡回］巡回が止まっています〔約6時間〕  <listed_stale>',
    '',
    '■ うしろの店（店 9）',
    '  ・駅ちか（枠1）［うまくいっていないこと］ログインできていません  <login>',
  ]);
  eq('★ 時間が分からないものに「0時間」と書かない', lines[lines.length - 1].includes('時間'), false);
  const noName = m.formatStallOverview({ items: [item({ salonName: '' })], checked, errors: [] });
  eq('★ 名前が引けなかった店も、番号で出す', noName[2], '■ （名前なし）（店 3）');
}

console.log('\n── 4. 読めなかったもの ──');
{
  const lines = m.formatStallOverview({ items: [], checked, errors: ['店 5 の取り込み・書き込みを調べられなかった: x'] });
  eq('★★★ 読めなかった店を、だまって消さない', lines.slice(1), ['', '★ 読めなかったもの（止まっていない、とは言えない）: 1 件', '  ・店 5 の取り込み・書き込みを調べられなかった: x']);
}

console.log('\n── 5. つなぎ（作り） ──');
{
  const root = path.join(__dirname, '..');
  const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
  const code = (s) => s.replace(/^\s*\/\/.*$/gm, '');
  const col = code(read('src/app/lib/media/stallOverview.ts'));
  eq('★★ 見るだけ: DB に書かない', /\.(insert|update|upsert|delete)\(/.test(col), false);
  eq('★ 見るだけ: メールを出さない', /notifyAdmin|resend/i.test(col), false);
  eq('★★★ 取り込み・書き込みは、店の画面の赤い帯と同じ関数', /computeMediaLinkAlerts\(svc, salonId\)/.test(col), true);
  eq('★★★ 写メ日記は、前からある見張りと同じ関数', /collectDiaryStall\(svc, now\)/.test(col), true);
  eq('★★★ うまくいっていないことは、ホームと同じ関数', /workProblemOf\(merged\)/.test(col), true);
  eq('★ 記録の引き方は getMediaOverview と同じ（出勤 40・ログイン 8）', /\.limit\(40\)/.test(col) && /\.limit\(8\)/.test(col), true);
  eq('★★ パスワードの中身を出さない（あるかだけ見る）', (col.match(/password_enc/g) || []).length, 3);
  eq('★ 読めなかったら errors に入れる', (col.match(/errors\.push\(/g) || []).length >= 7, true);
  const route = code(read('src/app/api/admin/stall-overview/route.ts'));
  eq('★ 口は鍵つき', /authorization'\) !== `Bearer \$\{secret\}`/.test(route), true);
  eq('★ 口も DB に書かない・メールを出さない', /\.(insert|update|upsert|delete)\(|notifyAdmin/.test(route), false);
  const dr = code(read('src/app/api/admin/diary-stall/route.ts'));
  eq('★ 前からある写メ日記の口も、同じ集め方を呼ぶ（判定を2か所に書かない）', /collectDiaryStall\(/.test(dr) && !/judgeDiaryStall\(/.test(dr), true);
}

console.log('\n── 6. メールにつなぐ（第1341便・カッキーさん決定 10/9） ──');
{
  const NOW = '2026-10-09T11:03:00.000Z';                       // 日本時間 10/9 20:03
  const ago = (min) => new Date(Date.parse(NOW) - min * 60000).toISOString();
  const ov = (items, errors) => ({ items, checked, errors: errors || [] });
  const kinds = (p) => p.mails.map((x) => x.kind);
  const plan = (items, known, opt) => m.planStallAlerts(Object.assign({ overview: ov(items, opt && opt.errors), known: known || [], lastDigestAt: ago(60), nowIso: NOW }, (opt && opt.over) || {}));
  const knownOf = (it, o) => Object.assign({ key: it.key, firstSeenAt: ago(60), seenCount: 2, alertedAt: ago(60) }, o);

  eq('決まりの数字', [m.STALL_PROBLEM_MIN_SEEN, m.STALL_DIGEST_HOUR_JST], [2, 9]);

  const p0 = plan([], []);
  eq('★ 何も無い → 何もしない', [kinds(p0), p0.upserts, p0.deleteKeys, p0.digestAt], [[], [], [], null]);

  const imp = item({});
  const p1 = plan([imp], []);
  eq('★★★ 新しく止まった → すぐ1通・知らせた印が付く', [kinds(p1), p1.upserts.length, p1.upserts[0].alerted_at, p1.upserts[0].seen_count, p1.upserts[0].first_seen_at], [['new'], 1, NOW, 1, NOW]);
  eq('件名に件数', p1.mails[0].subject, '【フクエス】連携が止まっています（新しく 1件）');
  eq('本文に、店・サイト・何が・何時間', p1.mails[0].lines.slice(0, 4), ['新しく見つかった、止まっているもの・うまくいっていないもの: 1 件', '', '■ 作り物の店（店 3）', '  ・駅ちか（枠1）［出勤の取り込み］取り込みが止まっています〔約5時間〕  <list_stale>']);
  eq('★ 表に書くのは番号と名前と時刻だけ（店の名前・文は入れない）', Object.keys(p1.upserts[0]).sort(), ['alerted_at', 'first_seen_at', 'key', 'last_seen_at', 'provider', 'reason', 'salon_id', 'seen_count', 'slot', 'watch']);

  const p2 = plan([imp], [knownOf(imp)]);
  eq('★★★ 次の回は出さない（30分ごとに同じメールを出さない）', [kinds(p2), p2.upserts[0].alerted_at, p2.upserts[0].seen_count, p2.upserts[0].first_seen_at], [[], ago(60), 3, ago(60)]);

  const prob = item({ watch: 'problem', reason: 'not_reflected', message: '出勤の更新が反映できていません' });
  const q1 = plan([prob], []);
  eq('★★★ 「うまくいっていないこと」は、1回目では知らせない（覚えるだけ）', [kinds(q1), q1.upserts[0].alerted_at, q1.upserts[0].seen_count], [[], null, 1]);
  const q2 = plan([prob], [knownOf(prob, { seenCount: 1, alertedAt: null })]);
  eq('★★★ 2回続けて見えたら知らせる', [kinds(q2), q2.upserts[0].alerted_at, q2.upserts[0].seen_count], [['new'], NOW, 2]);
  const q3 = plan([], [knownOf(prob, { seenCount: 1, alertedAt: null })]);
  eq('★★ 次の周で直ったものは、知らせない・行を消す・「直りました」も出さない', [kinds(q3), q3.deleteKeys], [[], [prob.key]]);
  const q4 = plan([prob], []);
  eq('★ 消えてからまた出たら、数え直す（続けて、の意味）', q4.upserts[0].seen_count, 1);

  const p3 = plan([], [knownOf(imp)]);
  eq('★★★ 知らせていたものが全部なくなった → 「全部直りました」を1通・行を消す', [kinds(p3), p3.deleteKeys, p3.upserts], [['cleared'], [imp.key], []]);
  const wr = item({ watch: 'write', provider: 'esutama', reason: 'stale', siteLabel: 'エステ魂（枠1）' });
  const p4 = plan([wr], [knownOf(imp), knownOf(wr)]);
  eq('★ 1つ直っても、ほかが残っていれば「直りました」は出さない', [kinds(p4), p4.deleteKeys], [[], [imp.key]]);
  const p5 = plan([imp, wr], [knownOf(imp)]);
  eq('新しいものだけを知らせ、前からあるものの数を添える', [kinds(p5), p5.mails[0].subject, p5.mails[0].lines.includes('前から知らせているもの: 1 件（毎朝9時にまとめて知らせます）')], [['new'], '【フクエス】連携が止まっています（新しく 1件）', true]);

  console.log('  ─ 読めなかった店がある回 ─');
  const b1 = plan([], [knownOf(imp)], { errors: ['店 3 の取り込み・書き込みを調べられなかった: x'] });
  eq('★★★ 読めなかっただけで「直りました」を出さない・行を消さない', [kinds(b1), b1.deleteKeys], [[], []]);
  const b2 = plan([wr], [knownOf(imp)], { errors: ['x'] });
  eq('★ 読めなかった回でも、新しいものは知らせる（本文に読めなかったものを添える）', [kinds(b2), b2.deleteKeys, b2.mails[0].lines.some((l) => l.indexOf('読めなかったもの') >= 0)], [['new'], [], true]);

  console.log('  ─ 毎朝のまとめ ─');
  const MORNING = '2026-10-10T00:03:00.000Z';                   // 日本時間 10/10 9:03
  const YDAY = '2026-10-09T00:03:00.000Z';                      // 日本時間 10/9 9:03
  const d1 = plan([imp], [knownOf(imp)], { over: { nowIso: MORNING, lastDigestAt: YDAY } });
  eq('★★★ 朝9時を過ぎた最初の回に、残っているものを1通', [kinds(d1), d1.digestAt, d1.mails[0].subject], [['digest'], MORNING, '【フクエス】止まったままの連携が 1件 あります（毎朝のまとめ）']);
  const d2 = plan([imp], [knownOf(imp)], { over: { nowIso: '2026-10-10T00:33:00.000Z', lastDigestAt: MORNING } });
  eq('★★★ その日はもう出さない', [kinds(d2), d2.digestAt], [[], null]);
  const d3 = plan([imp], [knownOf(imp)], { over: { nowIso: '2026-10-09T23:33:00.000Z', lastDigestAt: YDAY } });
  eq('★ 朝9時より前（8:33）は出さない', [kinds(d3), d3.digestAt], [[], null]);
  const d4 = plan([], [], { over: { nowIso: MORNING, lastDigestAt: YDAY } });
  eq('★★ 残っているものが無い朝は、メールなし。でもその日の印は付ける', [kinds(d4), d4.digestAt], [[], MORNING]);
  const d5 = plan([imp], [], { over: { nowIso: MORNING, lastDigestAt: YDAY } });
  eq('★ その回で初めて知らせるものは、まとめには入れない（新しいメールだけ）', [kinds(d5), d5.digestAt], [['new'], MORNING]);
  const d6 = plan([imp], [knownOf(imp)], { over: { nowIso: '2026-10-10T03:03:00.000Z', lastDigestAt: YDAY } });
  eq('★ 9時の回が抜けても、次の回（12:03）で出す', [kinds(d6), d6.digestAt], [['digest'], '2026-10-10T03:03:00.000Z']);
  const d7 = plan([imp], [knownOf(imp)], { over: { nowIso: MORNING, lastDigestAt: null } });
  eq('★ 印がまだ無い（初めて）でも落ちない', [kinds(d7), d7.digestAt], [['digest'], MORNING]);
  const d8 = plan([], [knownOf(imp)], { over: { nowIso: MORNING, lastDigestAt: YDAY } });
  eq('朝に全部直っていたら「全部直りました」だけ', [kinds(d8), d8.digestAt], [['cleared'], MORNING]);

  eq('★ 同じ名前のものが2つ来ても、1つとして書く', plan([imp, imp], []).upserts.length, 1);
}

console.log('\n── 7. メールの口のつなぎ（作り） ──');
{
  const root = path.join(__dirname, '..');
  const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
  const code = (s) => s.replace(/^\s*\/\/.*$/gm, '');
  const vj = JSON.parse(read('vercel.json'));
  const cron = (vj.crons || []).filter((c) => c.path === '/api/cron/stall-watch');
  eq('★★★ Vercel の定期実行から動く（VPS が止まっていても見られる）', cron.length, 1);
  eq('30分ごと', cron[0] && cron[0].schedule, '3,33 * * * *');
  const r = code(read('src/app/api/cron/stall-watch/route.ts'));
  eq('★ GET・鍵つき', /export async function GET\(/.test(r) && /authorization'\) !== `Bearer \$\{secret\}`/.test(r), true);
  eq('★ 決めるのは lib/stallDigest.ts（口の中で条件を書き直さない）', /planStallAlerts\(\{ overview, known, lastDigestAt/.test(r), true);
  eq('★★ 覚えている行が読めないときは、メールを出す前に 500 で帰る', r.indexOf('覚えている行を読めなかった: ') > 0 && r.indexOf('覚えている行を読めなかった: ') < r.indexOf('notifyAdmin(m.subject'), true);
  eq('★ dry は、メールと DB の前に帰る', r.indexOf('dry: true') < r.indexOf('notifyAdmin(m.subject') && r.indexOf('dry: true') < r.indexOf('.upsert('), true);
  eq('★ メールを出してから、表に書く', r.indexOf('notifyAdmin(m.subject') < r.indexOf('.upsert('), true);
}

console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
