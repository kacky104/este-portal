// 「今すぐ」3枠の列名と、3枠の和集合判定の見張り（第40便 §7-1）。
//
//   node --test tools-test-imasugu-columns.mjs
//
// ★★★ このテストの役目
//   Supabase の生成型（database.types.ts）が無いので、.select('…') の列名は【ただの文字列】。
//   1列書き忘れても TypeScript は何も言わず、読み出しが undefined になるだけ。
//   その結果は「駅ちかで即ヒメなのにフクエスに出ない」という★気づきにくい形で出る。
//   → DB境界の書き忘れを止められるのは、型ではなくこのテストだけ。
//
// ★★ このテストで止められないこと（正直に書く）
//   「therapists を引く新しい select を書いたが、今すぐ列を最初から1つも書かなかった」場合は
//   検出できない。★ 今すぐ列を【一部だけ】書いた場合を止めるテストである。
//   新しい一覧を足すときは src/lib/therapistColumns.ts の定数を使うこと。

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { register } from 'node:module';

register('./tools-ts-resolve.mjs', import.meta.url);

const COLS = await import('./src/lib/therapistColumns.ts');
const IM = await import('./src/lib/imasugu.ts');
const BADGE = await import('./src/lib/therapistStatusBadge.ts');

const REQUIRED = [
  'is_available_now',
  'available_until',
  'is_available_now_cast',
  'available_until_cast',
  'is_available_now_import',
  'available_until_import',
];

// ★ 除外は【1件ずつ理由を書く】。「なんとなく通す」入れ物を作らない。
const EXCLUDED = [
  {
    file: 'src/app/actions/castImasugu.ts',
    reason:
      'キャストが自分の枠を押すときの排他制御で、オーナー枠がライブかだけを見る。' +
      '★ 3枠は和集合であって排他ではないので、取り込み枠を混ぜてはいけない（第40便の決定）。',
  },
];

function listSourceFiles(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.next') continue;
      listSourceFiles(p, acc);
    } else if (/\.(ts|tsx)$/.test(e.name)) {
      acc.push(p);
    }
  }
  return acc;
}

/** .select( に渡している文字列リテラルを（ファイル, 行, 中身）で拾う。 */
function collectSelectLiterals() {
  const re = /\.select\s*\(\s*(`[\s\S]*?`|'[\s\S]*?'|"[\s\S]*?")/g;
  const found = [];
  for (const abs of listSourceFiles('src')) {
    const rel = abs.split(path.sep).join('/');
    const src = fs.readFileSync(abs, 'utf8');
    let m;
    while ((m = re.exec(src))) {
      found.push({
        file: rel,
        line: src.slice(0, m.index).split('\n').length,
        text: m[1].slice(1, -1),
      });
    }
  }
  return found;
}

test('IMASUGU_COLUMNS に3枠6列がすべて入っている', () => {
  for (const c of REQUIRED) {
    assert.ok(COLS.IMASUGU_COLUMNS.includes(c), `IMASUGU_COLUMNS に ${c} が無い`);
  }
});

test('派生の列定数が IMASUGU_COLUMNS を素通しにしている（手で書き直されていない）', () => {
  for (const name of ['THERAPIST_CARD_COLUMNS', 'SALON_THERAPIST_COLUMNS']) {
    const v = COLS[name];
    assert.ok(typeof v === 'string' && v.length > 0, `${name} が無い`);
    for (const c of REQUIRED) {
      assert.ok(v.includes(c), `${name} に ${c} が無い（IMASUGU_COLUMNS を埋め込んでいない可能性）`);
    }
  }
});

test('★ 今すぐ列を一部だけ書いた .select( が残っていない', () => {
  const bad = [];
  for (const s of collectSelectLiterals()) {
    if (EXCLUDED.some(x => x.file === s.file)) continue;
    // 定数を埋め込んでいる形（`${IMASUGU_COLUMNS}` など）は素通し。
    if (/IMASUGU_COLUMNS|THERAPIST_CARD_COLUMNS|SALON_THERAPIST_COLUMNS/.test(s.text)) continue;
    if (!s.text.includes('is_available_now')) continue;
    const missing = REQUIRED.filter(c => !s.text.includes(c));
    if (missing.length > 0) bad.push(`${s.file}:${s.line} … 欠け: ${missing.join(', ')}`);
  }
  assert.deepEqual(
    bad,
    [],
    '今すぐ列の書き漏らし。src/lib/therapistColumns.ts の定数を使うこと:\n  ' + bad.join('\n  '),
  );
});

test('除外リストのファイルが実在する（消えた除外を残さない）', () => {
  for (const x of EXCLUDED) {
    assert.ok(fs.existsSync(x.file), `除外リストの ${x.file} が存在しない。理由ごと消すこと`);
    assert.ok(x.reason.length > 20, `${x.file} の除外理由が薄い`);
  }
});


// ── 3枠の和集合そのものの見張り ───────────────────────────────────
// ★ 列名が合っていても、判定が2枠のままなら「駅ちかで即ヒメなのに出ない」は直らない。

const NOW = new Date('2026-08-27T12:20:00Z');
const FUTURE = '2026-08-27T12:30:00Z';
const PAST = '2026-08-27T12:10:00Z';

const row = (o = {}) => ({
  is_available_now: false, available_until: null,
  is_available_now_cast: false, available_until_cast: null,
  is_available_now_import: false, available_until_import: null,
  ...o,
});
const camel = (o = {}) => ({
  isAvailableNow: false, availableUntil: null,
  isAvailableNowCast: false, availableUntilCast: null,
  isAvailableNowImport: false, availableUntilImport: null,
  ...o,
});

test('★ 取り込み枠だけが立っていても「今すぐ」になる（これが第40便の目的）', () => {
  assert.equal(IM.isImasuguLiveRow(row({ is_available_now_import: true, available_until_import: FUTURE }), NOW), true);
  assert.equal(IM.isImasuguLiveCamel(camel({ isAvailableNowImport: true, availableUntilImport: FUTURE }), NOW), true);
});

test('取り込み枠の期限が過ぎていれば「今すぐ」にならない', () => {
  assert.equal(IM.isImasuguLiveRow(row({ is_available_now_import: true, available_until_import: PAST }), NOW), false);
});

test('3枠すべて落ちていれば「今すぐ」にならない', () => {
  assert.equal(IM.isImasuguLiveRow(row(), NOW), false);
  assert.equal(IM.isImasuguLiveCamel(camel(), NOW), false);
});

test('並び順は3枠のうち一番早く切れる枠の期限で決まる', () => {
  const t = camel({
    isAvailableNow: true, availableUntil: '2026-08-27T12:40:00Z',
    isAvailableNowImport: true, availableUntilImport: FUTURE,
  });
  assert.equal(IM.imasuguUntilCamel(t, NOW), new Date(FUTURE).getTime());
});

test('★ isImportLiveRow は取り込み枠だけを見る（オーナー枠が立っていても false）', () => {
  // ★ /mypage の「駅ちか連動中」表示に使う。ここがオーナー枠を拾うと、
  //   店舗が自分で押した枠まで「駅ちか由来」と表示してしまう。
  const t = row({ is_available_now: true, available_until: FUTURE });
  assert.equal(IM.isImportLiveRow(t, NOW), false);
  assert.equal(IM.isOwnerLiveRow(t, NOW), true);
});

test('★ ステータスバッジも取り込み枠だけで「今すぐ」になる', () => {
  const badge = BADGE.deriveTherapistStatusBadge({
    ownerOn: false, ownerUntil: null,
    castOn: false, castUntil: null,
    importOn: true, importUntil: FUTURE,
    todayIsActive: true, todayStart: null, todayEnd: null,
    now: NOW,
  });
  assert.equal(badge.label, '今すぐ');
});


// ── 取り込み間隔と取り込み枠の期限の整合（第40便 §10）─────────────────
// ★ available_until_import は「直近の周 + IMASUGU_IMPORT_MINUTES」。
//   公開側は until > now を見るので、【取り込み間隔がこの分数を越えると途切れる】。
//   例: 間隔60分・期限20分 → 20分出て40分消える（エラーは出ない）。
// ★ DB側は check (import_imasugu = false or import_interval_min <= 20) で止めている
//   （supabase/migrations/20260827_import_interval_default.sql）。
//   ★ 片方だけ動かすと静かにちらつくので、ここで両者が揃っていることを見張る。

const DB_MAX_INTERVAL_MIN = 20; // ★ 上記マイグレーションの CHECK 制約の値

test('★ IMASUGU_IMPORT_MINUTES が DB の間隔上限を下回っていない', () => {
  const src = fs.readFileSync('src/app/api/import/ingest-list/route.ts', 'utf8');
  const m = src.match(/const\s+IMASUGU_IMPORT_MINUTES\s*=\s*(\d+)/);
  assert.ok(m, 'IMASUGU_IMPORT_MINUTES が見つからない（名前を変えたなら DB 制約も見直すこと）');
  const minutes = Number(m[1]);
  assert.ok(
    minutes >= DB_MAX_INTERVAL_MIN,
    `IMASUGU_IMPORT_MINUTES=${minutes} が DB の上限 ${DB_MAX_INTERVAL_MIN} 分を下回っている。` +
    'この状態だと、上限ぎりぎりの間隔の店で「今すぐ」が途切れる。' +
    '期限を縮めるなら supabase/migrations の CHECK 制約も同じ値へ下げること。',
  );
});
