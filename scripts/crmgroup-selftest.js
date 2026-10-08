// フクエスCRM「グループ・提携店で共有するNG・要注意リスト」の決まり（src/lib/crmGroup.ts）の自己点検（第1324便）。
//   使い方:  npm run check:crmgroup
const path = require('path'), fs = require('fs');
const v = require(path.join(__dirname, '..', '_tmpcheck', 'crmGroup.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};
const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8').replace(/\r/g, '');

console.log('── 1. 分類と段（★ 危害だけ。無断キャンセル・料金のもめごとは共有しない）──');
eq('段は NG と要注意の2つ', v.CRM_GROUP_LEVELS.map((x) => x.key), ['ng', 'caution']);
eq('分類は7つ', v.CRM_GROUP_KINDS.map((x) => x.key), ['violence', 'theft', 'stalking', 'voyeur', 'coercion', 'intoxicated', 'other']);
eq('★★★ 分類に、キャンセル・料金が入っていない', v.CRM_GROUP_KINDS.some((x) => /キャンセル|料金|未払い/.test(x.label) || /cancel|no_show|money|unpaid/.test(x.key)), false);
eq('知らない分類は通さない', [v.isCrmGroupKind('theft'), v.isCrmGroupKind('no_show'), v.isCrmGroupKind(''), v.isCrmGroupKind(null)], [true, false, false, false]);
eq('知らない段は通さない', [v.isCrmGroupLevel('ng'), v.isCrmGroupLevel('caution'), v.isCrmGroupLevel('vip')], [true, true, false]);
{
  // ★ DB の check と、コードの並びが同じこと（片方だけ直して、保存で断られるのを防ぐ）
  const sql = read('追加SQL_第1324便_CRMのグループ共有の表_2026-10-09.sql');
  const kinds = /kind\s+text\s+not null check \(kind in \(([^)]*)\)\)/.exec(sql);
  const levels = /level\s+text\s+not null check \(level in \(([^)]*)\)\)/.exec(sql);
  const list = (m) => (m ? m[1].split(',').map((x) => x.trim().replace(/'/g, '')) : []);
  eq('★★★ 追加SQL の分類の check と同じ並び', list(kinds), v.CRM_GROUP_KINDS.map((x) => x.key));
  eq('★★★ 追加SQL の段の check と同じ並び', list(levels), v.CRM_GROUP_LEVELS.map((x) => x.key));
  eq('★★★ 1店が入れるグループは1つだけ（入っている行に一意の索引）', /create unique index if not exists crm_group_members_one_active\s+on public\.crm_group_members \(salon_id\) where left_at is null;/.test(sql), true);
  const tables = ['crm_groups', 'crm_group_members', 'crm_group_alerts', 'crm_group_alert_phones', 'crm_group_logs'];
  eq('★★★ 5つの表とも RLS を有効にする', tables.map((t) => new RegExp('alter table public\\.' + t + '\\s+enable row level security;').test(sql)), [true, true, true, true, true]);
  eq('★★★ 5つの表とも anon・authenticated から外す', tables.map((t) => new RegExp('revoke all on public\\.' + t + '\\s+from anon, authenticated;').test(sql)), [true, true, true, true, true]);
}

console.log('\n── 2. お客様・店舗様に見える呼び方（★ 店の名前を出さない）──');
eq('お客様に見える相手の呼び方', v.CRM_GROUP_PUBLIC_LABEL, '当店のグループ店舗・提携店舗');
eq('店舗様の画面での呼び方', v.CRM_GROUP_ALERT_SOURCE_LABEL, 'グループ・提携店');

console.log('\n── 3. グループの名前 ──');
eq('空は断る', v.checkCrmGroupName('  ').ok, false);
eq('40文字まで', [v.checkCrmGroupName('あ'.repeat(40)).ok, v.checkCrmGroupName('あ'.repeat(41)).ok], [true, false]);
eq('文字でなければ断る', [v.checkCrmGroupName(null).ok, v.checkCrmGroupName(12).ok], [false, false]);

console.log('\n── 4. 店を入れるとき（★ 契約書を受け取ってから）──');
const T = '2026-10-09';
const m = (o) => v.checkCrmGroupMember(Object.assign({ salonId: 101, corpName: 'テスト合同会社', agreedOn: '2026-10-09' }, o), T);
eq('そろっていれば入れられる', m({}), { ok: true });
eq('★★★ 契約書を受け取った日が無ければ入れない', [m({ agreedOn: '' }).ok, m({ agreedOn: null }).ok, m({ agreedOn: '2026/10/09' }).ok], [false, false, false]);
eq('★★★ 受け取った日が今日より先なら入れない', m({ agreedOn: '2026-10-10' }).ok, false);
eq('★ 実在しない日付は断る', m({ agreedOn: '2026-02-30' }).ok, false);
eq('★★★ 法人名が無ければ入れない', [m({ corpName: '' }).ok, m({ corpName: '   ' }).ok, m({ corpName: null }).ok], [false, false, false]);
eq('法人名は80文字まで', [m({ corpName: 'あ'.repeat(80) }).ok, m({ corpName: 'あ'.repeat(81) }).ok], [true, false]);
eq('店舗が選ばれていなければ断る', [m({ salonId: 0 }).ok, m({ salonId: '' }).ok, m({ salonId: 1.5 }).ok], [false, false, false]);

console.log('\n── 5. 運営の口（★ 運営だけ・service_role）──');
{
  const act = read('src/app/actions/crmGroupAdmin.ts');
  const fns = act.split(/\nexport async function /).slice(1);
  eq('運営の口が5つ以上ある', fns.length >= 5, true);
  eq('★★★ どの口も、最初に requireAdmin を通す', fns.every((f) => /const (a|auth) = await requireAdmin\(\);\s*\n\s*if \(!(a|auth)\.ok\) return (a|auth);/.test(f.slice(0, 600))), true);
  eq('★★★ 店を入れるときは、純粋関数の検査（契約書の日・法人名）を通す', /checkCrmGroupMember\(/.test(act), true);
  eq('★★ 外した店・終わらせたグループの共有は、その場で取り下げる（定義1＋外す1＋終わらせる1）', (act.match(/withdrawSalonAlerts\(/g) || []).length, 3);
  eq('★★ 取り下げは、消さずに印を付けるだけ', /withdrawn_reason: 'left'/.test(act) && !/from\('crm_group_alerts'\)\s*\.delete\(/.test(act), true);
  {
    // ★ 外す: 先に共有を取り下げてから、店を外す（外したのに共有だけ見え続ける瞬間を作らない）
    const f = act.slice(act.indexOf('export async function adminRemoveCrmGroupMember'), act.indexOf('export async function adminEndCrmGroup'));
    eq('★★★ 店を外すときは、共有の取り下げが先', f.indexOf('withdrawSalonAlerts(') > 0 && f.indexOf('withdrawSalonAlerts(') < f.indexOf("update({ left_at:"), true);
  }
  eq('★★ 記録（crm_group_logs）に、法人名や店の名前を入れない', /crm_group_logs'\)\.insert\([^)]*(corp_name|corpName|salonName)/.test(act), false);
}

console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
