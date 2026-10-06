// 出勤の自動反映の「フクエス側の材料の指紋」の番人（第1245便）。
//   npm run check:workinputhash
const path = require('path');
const W = require(path.join(__dirname, '..', '_tmpcheck', 'workInputHash.js'));

let bad = 0;
const eq = (name, a, b) => { const ok = a === b; console.log((ok ? 'ok ' : 'NG ') + name); if (!ok) { bad++; console.log('   got', a, 'want', b); } };

const base = {
  todayISO: '2026-10-06',
  therapists: [
    { id: 2, active: true, castId: 'c2', off: false },
    { id: 1, active: true, castId: 'c1', off: false },
  ],
  shifts: [
    { therapistId: 1, dateISO: '2026-10-07', active: true, start: '12:00', end: '18:00' },
    { therapistId: 1, dateISO: '2026-10-06', active: true, start: '10:00', end: '17:00' },
    { therapistId: 2, dateISO: '2026-10-06', active: false, start: null, end: null },
  ],
};
const h = W.workInputFingerprint(base);
console.log('── 1. 指紋 ──');
eq('★ 同じ材料なら同じ指紋', W.workInputFingerprint(base), h);
eq('★ 並びが違っても同じ指紋', W.workInputFingerprint({ ...base, therapists: [...base.therapists].reverse(), shifts: [...base.shifts].reverse() }), h);
eq('★ 営業日が変わると違う指紋', W.workInputFingerprint({ ...base, todayISO: '2026-10-07' }) === h, false);
eq('★ 出勤の時間が変わると違う指紋', W.workInputFingerprint({ ...base, shifts: [{ ...base.shifts[0], end: '19:00' }, base.shifts[1], base.shifts[2]] }) === h, false);
eq('★ 出勤→休みで違う指紋', W.workInputFingerprint({ ...base, shifts: [{ ...base.shifts[0], active: false }, base.shifts[1], base.shifts[2]] }) === h, false);
eq('★ 名簿の結びが変わると違う指紋', W.workInputFingerprint({ ...base, therapists: [base.therapists[0], { ...base.therapists[1], castId: 'c9' }] }) === h, false);
eq('★ 送らない（off）が変わると違う指紋', W.workInputFingerprint({ ...base, therapists: [{ ...base.therapists[0], off: true }, base.therapists[1]] }) === h, false);
eq('★ 非公開にすると違う指紋', W.workInputFingerprint({ ...base, therapists: [{ ...base.therapists[0], active: false }, base.therapists[1]] }) === h, false);
eq('★ 行が増えると違う指紋', W.workInputFingerprint({ ...base, shifts: [...base.shifts, { therapistId: 2, dateISO: '2026-10-08', active: true, start: '10:00', end: '12:00' }] }) === h, false);
eq('★ 指紋は40桁の16進', /^[0-9a-f]{40}$/.test(h), true);

console.log('── 2. 周を飛ばしてよいか ──');
const now = new Date('2026-10-06T10:00:00+09:00');
const iso = (h) => new Date(now.getTime() - h * 3600_000).toISOString();
eq('★ 同じ指紋・1時間前に同期 → 飛ばす', W.canSkipAutoPush({ hash: h, syncedHash: h, syncedAt: iso(1), now }), true);
eq('★ 同じ指紋・23時間前 → 飛ばす', W.canSkipAutoPush({ hash: h, syncedHash: h, syncedAt: iso(23), now }), true);
eq('★★ 同じ指紋でも24時間たてば行く', W.canSkipAutoPush({ hash: h, syncedHash: h, syncedAt: iso(24), now }), false);
eq('★ 指紋が違えば行く', W.canSkipAutoPush({ hash: h, syncedHash: 'x', syncedAt: iso(1), now }), false);
eq('★ 記録が無ければ行く', W.canSkipAutoPush({ hash: h, syncedHash: null, syncedAt: null, now }), false);
eq('★ 時刻が壊れていれば行く', W.canSkipAutoPush({ hash: h, syncedHash: h, syncedAt: 'broken', now }), false);
eq('★ 未来の時刻（時計のずれ）なら行く', W.canSkipAutoPush({ hash: h, syncedHash: h, syncedAt: iso(-1), now }), false);
eq('★ 24時間の定数', W.WORK_SYNC_MAX_AGE_MS, 24 * 60 * 60 * 1000);

if (bad) { console.log('\n★★ ' + bad + ' 件 NG'); process.exit(1); }
console.log('\n全部 ok');
