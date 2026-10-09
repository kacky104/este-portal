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

console.log('\n── 6. 共有を登録するときの検査（第1325便）──');
{
  const a = (o) => v.checkCrmGroupAlert(Object.assign({ level: 'ng', kind: 'theft', certainty: 'confirmed', happenedOn: '2026-10-08', what: ' 財布から現金がなくなっていた ', checkedHow: ' 申告 ', phones: ['09012345678'] }, o), T);
  eq('そろっていれば通る（前後の空白は落とす）', a({}), { ok: true, value: { level: 'ng', kind: 'theft', certainty: 'confirmed', happenedOn: '2026-10-08', what: '財布から現金がなくなっていた', checkedHow: '申告', phones: ['09012345678'] } });
  eq('★★★ 無断キャンセル・料金のもめごとは、分類に無いので断る', [a({ kind: 'no_show' }).ok, a({ kind: 'money' }).ok, a({ kind: '' }).ok], [false, false, false]);
  eq('段・確かさが決まった値でなければ断る', [a({ level: 'vip' }).ok, a({ certainty: 'maybe' }).ok], [false, false]);
  eq('★ 起きた日が今日より先なら断る／今日は通る', [a({ happenedOn: '2026-10-10' }).ok, a({ happenedOn: T }).ok, a({ happenedOn: '' }).ok], [false, true, false]);
  eq('★★ 何をされたかが空なら断る・300字まで', [a({ what: '   ' }).ok, a({ what: 'あ'.repeat(300) }).ok, a({ what: 'あ'.repeat(301) }).ok], [false, true, false]);
  eq('確かめ方は100字まで（空でもよい）', [a({ checkedHow: '' }).ok, a({ checkedHow: 'あ'.repeat(101) }).ok], [true, false]);
  eq('★★★ 電話番号が1つも無ければ断る（番号で照らし合わせるので、当たらない共有を作らない）', [a({ phones: [] }).ok, a({ phones: null }).ok], [false, false]);
  eq('★ 電話番号は数字10〜13桁だけ（ハイフン入り・短い番号は断る）', [a({ phones: ['090-1234-5678'] }).ok, a({ phones: ['1234'] }).ok, a({ phones: [9012345678] }).ok], [false, false, false]);
  eq('同じ番号は1つにまとめる・5件まで', [a({ phones: ['09012345678', '09012345678'] }).value.phones, a({ phones: ['09000000001', '09000000002', '09000000003', '09000000004', '09000000005', '09000000006'] }).ok], [['09012345678'], false]);
}

console.log('\n── 7. 帯の見出しと、予約カードの印（★ 出した店の名前を出さない）──');
{
  const h = (o) => Object.assign({ id: 1, level: 'ng', kind: 'theft', certainty: 'confirmed', happenedOn: '2026-10-08', what: 'x', shownName: '', mine: false }, o);
  eq('ほかの店が出した分', v.crmGroupHitTitle(h({})), 'グループ・提携店でNG（盗み・2026/10/8・確認済み）');
  eq('要注意・疑い', v.crmGroupHitTitle(h({ level: 'caution', kind: 'stalking', certainty: 'suspected' })), 'グループ・提携店で要注意（つきまとい・待ち伏せ・2026/10/8・疑い）');
  eq('「そのほか（…）」は短く', v.crmGroupHitTitle(h({ kind: 'other' })), 'グループ・提携店でNG（そのほか・2026/10/8・確認済み）');
  eq('自店が出した分', v.crmGroupHitTitle(h({ mine: true })), '自店からグループ・提携店に共有中：NG（盗み・2026/10/8・確認済み）');
  eq('★ 印: NG が1件でもあれば NG', v.crmGroupBadge([h({ level: 'caution' }), h({ id: 2 })]), 'ng');
  eq('★ 印: 要注意だけなら要注意', v.crmGroupBadge([h({ level: 'caution' })]), 'caution');
  eq('★ 印: 自店の分だけなら出さない（自店の台帳の分類で分かる）', v.crmGroupBadge([h({ mine: true })]), null);
  eq('印: 当たりが無ければ出さない', [v.crmGroupBadge([]), v.crmGroupBadge(null), v.crmGroupBadge(undefined)], [null, null, null]);
  eq('並び: NG が先・同じ段なら新しい日付が先', v.sortCrmGroupHits([h({ id: 1, level: 'caution', happenedOn: '2026-10-09' }), h({ id: 2, happenedOn: '2026-09-01' }), h({ id: 3, happenedOn: '2026-10-01' })]).map((x) => x.id), [3, 2, 1]);
  {
    const sql = read('追加SQL_第1324便_CRMのグループ共有の表_2026-10-09.sql');
    const cs = /certainty\s+text\s+not null default 'confirmed' check \(certainty in \(([^)]*)\)\)/.exec(sql);
    eq('★★★ 追加SQL の確かさの check と同じ並び', cs ? cs[1].split(',').map((x) => x.trim().replace(/'/g, '')) : [], v.CRM_GROUP_CERTAINTIES.map((x) => x.key));
  }
}

console.log('\n── 8. 店舗様の口（第1325便）★ 本人確認・グループの確認・店の名前を返さない ──');
{
  const act = read('src/app/actions/crmGroupShare.ts');
  const lib = read('src/app/lib/crm/groupAlerts.ts');
  const fns = act.split(/\nexport async function /).slice(1);
  eq('店舗様の口が4つ', fns.map((f) => f.slice(0, f.indexOf('('))), ['getCrmCustomerGroupShare', 'saveCrmGroupAlert', 'withdrawCrmGroupAlert', 'listCrmGroupAlerts']);
  eq('★★★ どの口も、最初に assertMember（本人確認＋グループに入っているか）を通す', fns.every((f) => /const a = await assertMember\(/.test(f.slice(0, 700))), true);
  eq('★★★ assertMember は、オーナー本人か（assertOwner）と、いまグループに入っているか（DB）を確かめる', /async function assertMember[\s\S]{0,300}await assertOwner\(salonId\)[\s\S]{0,200}await readCrmGroupMembership\(/.test(act), true);
  eq('★★★ オーナー本人でなければ断る・契約期間外なら断る', /salon\.owner_id as string \| null\) !== user\.id/.test(act) && /ご契約期間外/.test(act), true);
  eq('★★★ 入っているかは、外していない行（left_at が null）で見る', /from\('crm_group_members'\)\s*\.select\('group_id'\)\.eq\('salon_id', salonId\)\.is\('left_at', null\)/.test(lib), true);
  eq('★★★ 当たりは、取り下げていない分（withdrawn_at が null）で、自分のグループの中だけ', /from\('crm_group_alerts'\)\s*\.select\(CRM_GROUP_HIT_COLS\)\.eq\('group_id', groupId\)\.is\('withdrawn_at', null\)/.test(lib), true);
  eq('★★★ 電話番号は完全一致（途中一致の like を使わない）', /\.in\('phone', want\.slice/.test(lib) && !/like\(/.test(lib), true);
  // ★★★ 店の名前を、店舗様の画面へ返さない（カッキーさんの決定: どこにも出さない）
  eq('★★★ 店舗様の口は、店の名前・法人名・グループの名前を読まない', /salons'\)\.select\('[^']*\bname\b/.test(act) || /corp_name|crm_groups'\)|salonName/.test(act), false);
  eq('★★★ 下請けも、店の名前・法人名・グループの名前を読まない', /from\('salons'\)|corp_name|from\('crm_groups'\)|salonName/.test(lib), false);
  {
    const fn = lib.slice(lib.indexOf('export function toCrmGroupHit'), lib.indexOf('export type CrmGroupHitsResult'));
    const hit = fn.slice(fn.indexOf('return {')); // 返す中身だけを見る（引数の salonId は「自店か」を決めるのに使う）
    eq('★★★ 画面へ返す形に、出した店の番号を入れない（自店か、だけ）', /mine: Number\(r\.salon_id\) === salonId/.test(hit) && !/salonId:|salon_id:/.test(hit), true);
    const ty = read('src/lib/crmGroup.ts');
    const hitType = ty.slice(ty.indexOf('export type CrmGroupHit = {'), ty.indexOf('export function crmGroupLevelLabel'));
    eq('★★★ CrmGroupHit の型に、店の番号・名前の欄が無い', /salon/i.test(hitType), false);
    const rowType = act.slice(act.indexOf('export type CrmGroupListRow'), act.indexOf('export async function listCrmGroupAlerts'));
    eq('★★★ 共有リストの行の型に、店の番号・名前の欄が無い', /salonId|salonName|salon_id/.test(rowType), false);
  }
  {
    const save = act.slice(act.indexOf('export async function saveCrmGroupAlert'), act.indexOf('export async function withdrawCrmGroupAlert'));
    eq('★★★ 登録は、純粋関数の検査を通す', /checkCrmGroupAlert\(input, getCalendarDateJST\(\)\)/.test(save), true);
    eq('★★★ 共有できるのは、自店の台帳のお客様の、台帳に載っている番号だけ', /from\('salon_customers'\)\.select\('id, name'\)\.eq\('salon_id', salonId\)\.eq\('id', customerId\)/.test(save) && /v\.phones\.some\(\(p\) => !own\.includes\(p\)\)/.test(save), true);
    eq('★★ 直せるのは、自店が出している有効な共有だけ', /if \(!curIds\.includes\(alertId\)\) return/.test(save) && /\.eq\('id', alertId\)\.eq\('salon_id', salonId\)\.eq\('group_id', a\.groupId\)\.is\('withdrawn_at', null\)/.test(save), true);
    eq('★★ 電話番号を入れられなかった共有は残さない', /if \(pErr\) \{[\s\S]{0,300}from\('crm_group_alerts'\)\.delete\(\)\.eq\('id', alertId\)/.test(save), true);
    const wd = act.slice(act.indexOf('export async function withdrawCrmGroupAlert'), act.indexOf('export type CrmGroupListRow'));
    eq('★★★ 取り下げられるのは、自店の分だけ（消さずに印）', /withdrawn_reason: 'self'/.test(wd) && /\.eq\('id', id\)\.eq\('salon_id', Number\(salonId\)\)\.eq\('group_id', a\.groupId\)\.is\('withdrawn_at', null\)/.test(wd) && !/\.delete\(/.test(wd), true);
  }
  eq('★★ 記録に、電話番号・名前・内容を入れない', /crm_group_logs'\)\.insert\(\{[^}]*(phone:|what:|shown_name|name:)/.test(act), false);
  eq('★★ 記録の detail に入れるのは、段・分類・確かさ・番号の数だけ', (act.match(/detail: \{ level: v\.level, kind: v\.kind, certainty: v\.certainty, phones: v\.phones\.length \}/g) || []).length, 2);
}

console.log('\n── 9. 受付・スケジュール・台帳へのつなぎ（第1325便）──');
{
  const crm = read('src/app/actions/crm.ts');
  const lookup = crm.slice(crm.indexOf('export async function lookupCrmCustomerByPhone'), crm.indexOf('export async function saveCrmTherapistMemo'));
  eq('★★★ 受付で電話番号を引くとき、共有リストも引く（本人確認のあと）', lookup.indexOf('await assertCrm(salonId)') > 0 && lookup.indexOf('await assertCrm(salonId)') < lookup.indexOf('crmGroupHitsForSalon(svc, salonId, [phone])'), true);
  eq('★★★ 自店の台帳にいなくても、当たりを返す（初めての電話）', /if \(!ph\) return \{ ok: true, customer: null, groupHits, groupFailed: group\.failed \};/.test(lookup), true);
  const sched = crm.slice(crm.indexOf('export async function getCrmSchedule'), crm.indexOf('export async function lookupCrmCustomerByPhone'));
  eq('★★★ スケジュールの予約に、当たりを付ける（予約の電話番号で）', /crmGroupHitsForSalon\(svc, salonId, bookings\.map\(/.test(sched) && /groupHits: groupHits\.byPhone\.get\(normalizePhone\(String\(b\.customerTel \?\? ''\)\)\) \?\? \[\]/.test(sched), true);
  eq('★★ 読めなかったことを画面へ知らせる（黙って「当たりなし」にしない）', /groupFailed: groupHits\.failed/.test(sched) && /groupFailed: group\.failed/.test(lookup), true);
  eq('★★★ 当たっても、予約を断る・止める処理を足していない（出すだけ）', /groupHits[\s\S]{0,80}return \{ ok: false/.test(sched + lookup), false);
  const del = crm.slice(crm.indexOf('export async function deleteCrmCustomer'), crm.indexOf('function displayTel'));
  eq('★★★ お客様を台帳から消すときは、先に共有を取り下げる', del.indexOf("withdrawn_reason: 'customer_deleted'") > 0 && del.indexOf("withdrawn_reason: 'customer_deleted'") < del.indexOf("from('salon_customers').delete()"), true);
  eq('★★ 取り下げられなかったら、消さない', /共有を取り下げられなかったので、削除していません/.test(del), true);
  // ★★★ 表がまだ無い（追加SQL の前）ときに、お客様の削除を止めない。★ 書く前に読んで確かめる（書くときのエラーは、版によって見分けられない）
  eq('★★★ 取り下げの前に、読んで確かめる（表が無ければ、そのまま消す）', del.indexOf(".select('id, group_id')") > 0 && del.indexOf(".select('id, group_id')") < del.indexOf("withdrawn_reason: 'customer_deleted'") && /if \(shared\.error && !crmGroupTableMissing\(shared\.error, shared\.status\)\)/.test(del) && /const alive = shared\.error \? \[\] : /.test(del), true);
  const access = crm.slice(crm.indexOf('export async function getCrmAccess'), crm.indexOf('async function assertCrm'));
  eq('★ タブと欄は、グループに入っている店にだけ（サーバーが判定）', /inGroup = active \? \(await readCrmGroupMembership\(svc, Number\(data\.id\)\)\)\.state === 'in' : false/.test(access), true);

  const shell = read('src/app/mypage/crm/CrmShell.tsx');
  eq('★ 「グループ共有」のタブは、入っている店にだけ', /access\.inGroup \? \[\.\.\.NAV\.slice\(0, 2\), NAV_GROUP, \.\.\.NAV\.slice\(2\)\] : NAV/.test(shell), true);
  const cust = read('src/app/mypage/crm/customers/page.tsx');
  eq('★ 顧客台帳の共有の欄は、入っている店にだけ', /\{inGroup && <GroupShareBox /.test(cust), true);
  const page = read('src/app/mypage/crm/page.tsx');
  eq('★★★ 受付フォーム・予約の詳細・予約カードに出す', [/<GroupHitBand hits=\{group\.hits\} failed=\{group\.failed\}/.test(page), /<GroupHitBand hits=\{b\.groupHits\}/.test(page), /CRM_GROUP_BADGE_LABEL\[groupBadge\]/.test(page)], [true, true, true]);
  // ★★★ 画面の部品に、店の名前を出す道が無い
  const ui = read('src/app/mypage/crm/GroupShare.tsx') + read('src/app/mypage/crm/group/page.tsx');
  eq('★★★ 画面の部品が、店の名前を受け取っていない', /salonName|corpName|groupName/.test(ui), false);
  // ★★★ セラピストの画面（/cast）には出さない（今も電話番号を見せていない）
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]);
  const castDir = path.join(__dirname, '..', 'src', 'app', 'cast');
  const castFiles = fs.existsSync(castDir) ? walk(castDir).filter((f) => /\.(ts|tsx)$/.test(f)) : [];
  eq('★★★ セラピストの画面（/cast）は、共有リストに触れない', castFiles.some((f) => /crmGroup|crm_group|GroupHitBand/.test(fs.readFileSync(f, 'utf8'))), false);
}


console.log('\n── 10. お客様の同意書に足す文（第1327便）──');
{
  const types = read('src/app/lib/crm/types.ts');
  const m = /export const CRM_CONSENT_DEFAULT_BODY = `([\s\S]*?)`;/.exec(types);
  const def = m ? m[1] : '';
  eq('（ひな形を読めた）', def.includes('10. お預かりした個人情報は'), true);
  const r = v.addCrmGroupConsentClause(def);
  eq('ひな形: 11番として足す', [r.ok, r.number, r.fixedPurpose], [true, 11, true]);
  eq('★★ ひな形: 10番の「のみ使用します」を、食い違わない文に直す', [r.body.includes('10. お預かりした個人情報は、ご予約とご来店の管理のため、および次の11の目的のために使用します。'), r.body.includes('のためにのみ使用します')], [true, false]);
  eq('ひな形: 11番は10番のあと・結びの「以上…」の前', r.body.indexOf('\n\n11. ' + v.CRM_GROUP_CONSENT_CLAUSE + '\n\n以上をご確認のうえ') > r.body.indexOf('10. お預かり'), true);
  eq('★ ひな形: ほかの項目は変えない（1〜9番がそのまま）', def.split('\n').filter((l) => /^[1-9]\. /.test(l)).every((l) => r.body.includes(l)), true);
  eq('★★ もう入っていれば、二重に足さない', v.addCrmGroupConsentClause(r.body), { ok: false, reason: 'already' });
  eq('★★★ 足す文に、店の名前を入れる所が無い（相手は「グループ店舗・提携店舗」とだけ）', [v.CRM_GROUP_CONSENT_CLAUSE.includes('当店のグループ店舗・提携店舗'), /\{|\$|○○/.test(v.CRM_GROUP_CONSENT_CLAUSE)], [true, false]);
  eq('★★ 足す文に、共有する項目（名前・電話番号・日と内容）と目的が書いてある', ['お名前', '電話番号', 'その行為のあった日と内容', 'セラピストの安全を守り'].every((w) => v.CRM_GROUP_CONSENT_CLAUSE.includes(w)), true);
  eq('★★★ 足す文に、無断キャンセル・料金のことは書かない（共有しないので）', /キャンセル|料金|未払い/.test(v.CRM_GROUP_CONSENT_CLAUSE), false);
  {
    const own = '・18歳未満の方はお断りします\n・撮影は禁止です\n\n以上、ご了承ください。';
    const o = v.addCrmGroupConsentClause(own);
    eq('番号の無い同意書: 結びの「以上…」の前に足す', [o.ok, o.number, o.fixedPurpose, o.body], [true, null, false, '・18歳未満の方はお断りします\n・撮影は禁止です\n\n' + v.CRM_GROUP_CONSENT_CLAUSE + '\n\n以上、ご了承ください。']);
    const plain = v.addCrmGroupConsentClause('ご利用ありがとうございます。');
    eq('番号も結びも無い同意書: 最後に足す', plain.body, 'ご利用ありがとうございます。\n\n' + v.CRM_GROUP_CONSENT_CLAUSE);
    eq('空の同意書: 文だけになる', v.addCrmGroupConsentClause('').body, v.CRM_GROUP_CONSENT_CLAUSE);
    const multi = v.addCrmGroupConsentClause('1. あ\n2. い\n   続きの行\n\n結びの文');
    eq('番号の項目が2行にわたるとき: 項目の終わりに足す', multi.body, '1. あ\n2. い\n   続きの行\n\n3. ' + v.CRM_GROUP_CONSENT_CLAUSE + '\n\n結びの文');
    const zen = v.addCrmGroupConsentClause('１．あ\n２．い');
    eq('全角の番号でも続きの番号になる', [zen.number, zen.body.endsWith('\n\n3. ' + v.CRM_GROUP_CONSENT_CLAUSE)], [3, true]);
    eq('★ 長さの上限をこえるなら足さない', v.addCrmGroupConsentClause('あ'.repeat(7990)), { ok: false, reason: 'too_long' });
    eq('文字でないものは、空として扱う', v.addCrmGroupConsentClause(null).ok, true);
  }
  const page = read('src/app/mypage/crm/settings/page.tsx');
  eq('★ 設定の画面: 文を足す欄は、グループに入っている店にだけ', /\{inGroup && <GroupConsentBox /.test(page), true);
  eq('★★ 設定の画面: 押したときだけ足す（開いただけ・保存しただけでは、同意書を書き換えない）', (page.match(/addCrmGroupConsentClause\(/g) || []).length === 1 && /const add = \(\) => \{\s*const r = addCrmGroupConsentClause\(body\);/.test(page), true);
  eq('★★★ サーバー側は、同意書を自動で書き換えない', /addCrmGroupConsentClause|CRM_GROUP_CONSENT_CLAUSE/.test(read('src/app/actions/crm.ts') + read('src/app/actions/crmGroupShare.ts') + read('src/app/actions/crmGroupAdmin.ts') + read('src/app/actions/consent.ts')), false);
}

console.log('\n── 11. 公式HPの利用規約（第1327便）★ 全店に同じ文で足す ──');
{
  const t = read('src/app/hp/_lib/terms.ts');
  eq('★★★ 規約は店の名前だけを受け取る（グループに入っているかで、文を出し分けない）', /export function buildHpTerms\(salonName: string\): HpTermsSection\[\]/.test(t) && !/inGroup|crm_group|crmGroup/.test(t), true);
  eq('★★★ 規約のページも、グループの表を読まない', /crm_group|crmGroup|inGroup/.test(read('src/app/hp/_templates/subpages.tsx') + read('src/app/hp/[slug]/terms/page.tsx') + read('src/app/hp/_lib/data.ts')), false);
  eq('★★ 条件つきで書く（グループ・提携店が無い店にも、うそにならない）', [/当店にグループ店舗・提携店舗があるときは、それらの店舗でも以後のご利用をお断りすることがあります。/.test(t), /当店のグループ店舗・提携店舗（ある場合）との間で共有することがあります。/.test(t)], [true, true]);
  eq('★★ 「同意なく第三者に提供しません」に、例外があることを書く（実際と食い違わせない）', [/次に定める場合および法令に基づく場合を除き、ご本人の同意なく第三者に提供することはありません。/.test(t), /目的にのみ使用し、法令に基づく場合を除き/.test(t)], [true, false]);
  eq('★ 共有する項目・目的・窓口が書いてある', ['お名前・電話番号・行為のあった日と内容', 'セラピストの安全を守り、同じ被害を防ぐ目的', 'この目的のほかには使用しません', '確認・訂正・削除のお求めは、当店までご連絡ください'].every((w) => t.includes(w)), true);
}

console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
