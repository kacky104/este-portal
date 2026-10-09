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
  eq('★ タブと欄は、グループに入っている店にだけ（サーバーが判定）', /const grp = active \? await readCrmGroupAccess\(svc, Number\(data\.id\)\) : \{ inGroup: false, groupPending: false, groupTodo: 0 \};/.test(access) && /inGroup: grp\.inGroup,/.test(access), true);

  const shell = read('src/app/mypage/crm/CrmShell.tsx');
  eq('★ 「グループ共有」のタブは、入っている店と、申込みの途中の店にだけ', /access\.inGroup \|\| access\.groupPending \? \[\.\.\.NAV\.slice\(0, 2\), NAV_GROUP, \.\.\.NAV\.slice\(2\)\] : NAV/.test(shell), true);
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

console.log('\n── 12. 画面での申込み・承認の決まり（第1328便）──');
{
  const j = require(path.join(__dirname, '..', '_tmpcheck', 'crmGroupApply.js'));
  const V = j.CRM_GROUP_APPLY_VERSION;
  const sig = (id, inviteId, salonId, kind, partyIds, version) => ({ id, inviteId, salonId, kind, version: version || V, partyIds: partyIds || [] });
  const I = (id, salonId) => ({ id, salonId });

  eq('名前: 空は断る・前後の空白は落とす・40字まで', [j.checkCrmGroupSignerName('  ').ok, j.checkCrmGroupSignerName(' 山田　太郎 '), j.checkCrmGroupSignerName('あ'.repeat(41)).ok, j.checkCrmGroupSignerName(null).ok], [false, { ok: true, name: '山田 太郎' }, false, false]);
  eq('顔ぶれが同じか（順番は見ない）', [j.sameCrmGroupParties([1, 2], [2, 1]), j.sameCrmGroupParties([1, 2], [1, 2, 3]), j.sameCrmGroupParties([], [])], [true, false, true]);

  // ── 最初の顔ぶれ（まだだれも入っていない）
  const inv2 = [I(10, 1), I(11, 2)];
  eq('最初: 署名待ちが1店だけなら、申込書を出さない', j.crmGroupInviteeCanSign([], [], [I(10, 1)], I(10, 1)), false);
  eq('最初: 2店そろえば、申込書を出す', j.crmGroupInviteeCanSign([], [], inv2, I(10, 1)), true);
  eq('最初: 1店だけ署名 → だれも入れない', j.planCrmGroupJoins({ memberIds: [], invites: inv2, sigs: [sig(1, 10, 1, 'apply', [1, 2])], version: V }), []);
  eq('★★★ 最初: 全部の店が署名 → 全部いっしょに入れる', j.planCrmGroupJoins({ memberIds: [], invites: inv2, sigs: [sig(1, 10, 1, 'apply', [1, 2]), sig(2, 11, 2, 'apply', [2, 1])], version: V }), [10, 11]);
  {
    // 2店が署名したあとで、運営が3店めを足した → 顔ぶれが変わったので、前の署名は効かない
    const inv3 = [I(10, 1), I(11, 2), I(12, 3)];
    const old = [sig(1, 10, 1, 'apply', [1, 2]), sig(2, 11, 2, 'apply', [1, 2])];
    eq('★★★ 最初: 署名のあとで顔ぶれが変わったら、署名し直し（知らない店が混じったまま入れない）', [j.crmGroupApplyValid(old, [], inv3, I(10, 1), V), j.planCrmGroupJoins({ memberIds: [], invites: inv3, sigs: old, version: V })], [false, []]);
    const redo = old.concat([sig(3, 10, 1, 'apply', [1, 2, 3]), sig(4, 11, 2, 'apply', [1, 2, 3]), sig(5, 12, 3, 'apply', [1, 2, 3])]);
    eq('最初: 3店とも新しい顔ぶれで署名 → 3店いっしょに入れる', j.planCrmGroupJoins({ memberIds: [], invites: inv3, sigs: redo, version: V }), [10, 11, 12]);
  }
  eq('★★ 申込書の版が変わったら、前の署名は効かない', j.crmGroupApplyValid([sig(1, 10, 1, 'apply', [1, 2], '古い版')], [], inv2, I(10, 1), V), false);
  eq('★ ほかの店の署名を、自分の署名として数えない', j.crmGroupApplyValid([sig(1, 10, 2, 'apply', [1, 2])], [], inv2, I(10, 1), V), false);

  // ── あとから足す（1・2 が入っていて、3 を足す）
  const mem = [1, 2], c = I(20, 3);
  eq('★★★ 足す: 今いる店がまだ認めていなければ、足す店に申込書を出さない', j.crmGroupInviteeCanSign([], mem, [c], c), false);
  eq('★★★ 足す: 1店だけ認めても、まだ出さない', j.crmGroupInviteeCanSign([sig(1, 20, 1, 'approve')], mem, [c], c), false);
  const ok2 = [sig(1, 20, 1, 'approve'), sig(2, 20, 2, 'approve')];
  eq('足す: 全部の店が認めたら、足す店に申込書を出す', j.crmGroupInviteeCanSign(ok2, mem, [c], c), true);
  eq('足す: 認めただけでは、まだ入れない（足す店の署名が要る）', j.planCrmGroupJoins({ memberIds: mem, invites: [c], sigs: ok2, version: V }), []);
  eq('★★★ 足す: 全部の店が認め、足す店が署名 → 入れる', j.planCrmGroupJoins({ memberIds: mem, invites: [c], sigs: ok2.concat([sig(3, 20, 3, 'apply', [1, 2, 3])]), version: V }), [20]);
  eq('★★★ 足す: 1店でも「認めない」なら、足す店が署名していても入れない', j.planCrmGroupJoins({ memberIds: mem, invites: [c], sigs: [sig(1, 20, 1, 'approve'), sig(2, 20, 2, 'decline'), sig(3, 20, 3, 'apply', [1, 2, 3])], version: V }), []);
  eq('★★★ 足す: 足す店の署名だけでは入れない（今いる店の承認が無い）', j.planCrmGroupJoins({ memberIds: mem, invites: [c], sigs: [sig(3, 20, 3, 'apply', [1, 2, 3])], version: V }), []);
  eq('今いる店の返事', [j.crmGroupMemberAnswer(ok2, 20, 1), j.crmGroupMemberAnswer([sig(1, 20, 1, 'decline')], 20, 1), j.crmGroupMemberAnswer(ok2, 20, 9)], ['approve', 'decline', null]);
  eq('★ ほかの署名待ちへの承認を、この署名待ちの承認として数えない', j.crmGroupInviteeCanSign([sig(1, 99, 1, 'approve'), sig(2, 99, 2, 'approve')], mem, [c], c), false);
  {
    // 3 と 4 を同時に足す: 3 が入ったら、4 には 3 の承認も要る
    const d = I(21, 4);
    const sigs = [
      sig(1, 20, 1, 'approve'), sig(2, 20, 2, 'approve'), sig(3, 20, 3, 'apply', [1, 2, 3]),
      sig(4, 21, 1, 'approve'), sig(5, 21, 2, 'approve'), sig(6, 21, 4, 'apply', [1, 2, 4]),
    ];
    eq('★★★ 2店を同時に足す: 先の店が入ったら、次の店は、先の店の承認と、新しい顔ぶれでの署名が要る', j.planCrmGroupJoins({ memberIds: mem, invites: [c, d], sigs, version: V }), [20]);
    eq('（3 が入ったあと: 3 がまだ認めていない → 4 には申込書を出さない）', j.crmGroupInviteeCanSign(sigs, [1, 2, 3], [d], d), false);
    const later = sigs.concat([sig(7, 21, 3, 'approve'), sig(8, 21, 4, 'apply', [1, 2, 3, 4])]);
    eq('（3 も認め、4 が新しい顔ぶれで署名 → 入れる）', j.planCrmGroupJoins({ memberIds: [1, 2, 3], invites: [d], sigs: later, version: V }), [21]);
    eq('（4 の古い署名＝顔ぶれ 1・2・4 は、3 が入ったあとは効かない）', j.crmGroupApplyValid(sigs.concat([sig(7, 21, 3, 'approve')]), [1, 2, 3], [d], d, V), false);
  }

  // ── 申込書の文
  eq('★★★ 申込書の文に、実在の店の名前を入れる所が無い', /\$\{|○○店/.test(j.CRM_GROUP_APPLY_BODY), false);
  eq('★★ 申込書に、要る項目がある（関係の表明・目的・共有できる内容・知らせ・秘密・運営の立場・加わるとき）', ['第1　関係についての表明', '第2　利用の目的と、してはいけないこと', '第3　共有できる内容', '第4　お客様への知らせ', '第6　秘密の扱い', '第8　運営の立場', '第9　店舗が加わるとき・抜けるとき・終わるとき'].every((h) => j.CRM_GROUP_APPLY_BODY.includes(h)), true);
  eq('★★★ 申込書: 無断キャンセルと料金のもめごとは共有できない、と書いてある', j.CRM_GROUP_APPLY_BODY.includes('無断キャンセルと、料金のもめごとは、共有できません。'), true);
  eq('★★ 申込書: 公式HPを使っていない店は、自分のサイトと店頭に出す、と書いてある', /フクエスの公式ホームページを使っていない店舗は、[\s\S]{0,140}自分のサイトの利用規約（または個人情報の取り扱い）に載せ、店頭にも掲示します。/.test(j.CRM_GROUP_APPLY_BODY), true);
  eq('★★ 申込書: あとから加わる店は、全部の参加店舗が画面で認める・それまでの共有も見える、と書いてある', j.CRM_GROUP_APPLY_BODY.includes('あとから店舗が加わるときは、そのときの全部の参加店舗が、画面で認めます。加わった店舗には、それまでに共有された内容も見えるようになります。'), true);
  eq('★★ 申込書: 「店舗」は、運営する法人または個人事業主のこと、と決めてある（個人のお店でも、責任を負う人がはっきりする）', j.CRM_GROUP_APPLY_BODY.includes('この申込書で「店舗」とは、その店舗を運営する法人、または個人事業主をいいます。'), true);
  eq('承認の記録に残す文（加わる店・件数・版）', j.crmGroupApproveBody({ name: 'テスト店', corp: 'テスト法人' }, 3).split('\n').slice(0, 3), ['次の店舗が、グループ・提携店の共有に加わることを認めます。', '　テスト店（テスト法人）', '加わると、この店舗にも、今までに共有した内容（3件）が見えるようになります。この店舗が共有した内容も、当店に見えるようになります。']);
}

console.log('\n── 13. 画面での申込み・承認の口（第1328便）──');
{
  const act = read('src/app/actions/crmGroupJoin.ts');
  const lib = read('src/app/lib/crm/groupJoin.ts');
  const fns = act.split(/\nexport async function /).slice(1);
  eq('店舗様の口が3つ', fns.map((f) => f.slice(0, f.indexOf('('))), ['getCrmGroupJoinTodo', 'signCrmGroupApply', 'answerCrmGroupJoin']);
  eq('★★★ どの口も、最初に本人確認（オーナー本人か・契約中か）を通す', fns.every((f) => /const a = await assertOwner\(/.test(f.slice(0, 500))), true);
  const sign = act.slice(act.indexOf('export async function signCrmGroupApply'), act.indexOf('export async function answerCrmGroupJoin'));
  const ans = act.slice(act.indexOf('export async function answerCrmGroupJoin'));
  eq('★★★ 運営のアカウントでは、署名・承認できない（本人が押していない同意の記録を作らない）', [/if \(a\.isAdmin\) return \{ ok: false, error: ADMIN_CANNOT_SIGN \};/.test(sign), /if \(a\.isAdmin\) return \{ ok: false, error: ADMIN_CANNOT_SIGN \};/.test(ans)], [true, true]);
  eq('★★★ 署名: 同意のチェックと名前が無ければ断る', /if \(input\.agree !== true\) return/.test(sign) && /checkCrmGroupSignerName\(input\.signerName\)/.test(sign), true);
  eq('★★★ 署名: 自分の店の署名待ちにだけ・申込書を出してよいときだけ', /const inv = await pendingInviteOf\(svc, salonId\);\s*\n\s*if \(!inv \|\| inv\.id !== Number\(input\.inviteId\)\) return/.test(sign) && /if \(!crmGroupInviteeCanSign\(st\.state\.sigs, memberIds, st\.state\.invites, mine\)\) return/.test(sign), true);
  eq('★★ 署名: 申込書の文の写し・版・その時の顔ぶれを残す', /kind: 'apply', signer_name: nm\.name,\s*\n\s*doc_version: CRM_GROUP_APPLY_VERSION, doc_body: CRM_GROUP_APPLY_BODY, parties,/.test(sign), true);
  eq('★★★ 承認: いまそのグループに入っている店だけ・返事は1回', /if \(m\.state !== 'in'\) return/.test(ans) && /if \(crmGroupMemberAnswer\(st\.state\.sigs, inviteId, salonId\) !== null\) return/.test(ans), true);
  eq('★★★ 「認めない」なら、その場で取りやめ（加わる店には何も出ないまま）', /if \(!approve\) \{\s*\n\s*const up = await svc\.from\('crm_group_invites'\)\.update\(\{ status: 'declined'/.test(ans), true);
  const todo = act.slice(act.indexOf('export async function getCrmGroupJoinTodo'), act.indexOf('async function userAgent'));
  eq('★★★ あとから足される店には、今いる全部の店が認めるまで、何も返さない', /if \(!crmGroupInviteeCanSign\(st\.state\.sigs, memberIds, st\.state\.invites, mine\)\) return none;/.test(todo), true);
  eq('★★★ 署名が済んだあとは、店の名前を返さない', /const parties = signed \? \[\] : await crmGroupPartiesOf\(/.test(todo), true);
  eq('★★★ 入れるかどうかは、純粋関数（planCrmGroupJoins）が決める', /const plan = planCrmGroupJoins\(\{ memberIds: members\.map\(\(m\) => m\.salonId\), invites, sigs, version: CRM_GROUP_APPLY_VERSION \}\);/.test(lib), true);
  eq('★★ 同時に押されても二重に入れない（23505 は「もう入った」）', /if \(ins\.error\.code === '23505'\) return \{ joined, error: null \};/.test(lib), true);
  eq('★★★ 入口でも、足される店には、全員が認めるまでタブを出さない', /if \(!crmGroupInviteeCanSign\(st\.state\.sigs, memberIds, st\.state\.invites, mine\)\) return none;/.test(lib), true);
  // ★★★ 店の名前が、共有リスト・受付の口へ流れていない
  eq('★★★ 共有リスト・受付の口は、参加店の名前を読む道具を使っていない', /crmGroupPartiesOf|groupJoin'/.test(read('src/app/actions/crmGroupShare.ts') + read('src/app/lib/crm/groupAlerts.ts')), false);
  const admin = read('src/app/actions/crmGroupAdmin.ts');
  eq('★★★ 署名待ちで入れる・取りやめる・記録を見るのは、運営だけ', ['adminInviteCrmGroupMember', 'adminCancelCrmGroupInvite', 'adminListCrmGroupSignatures'].map((n) => { const f = admin.slice(admin.indexOf('export async function ' + n)); return /const a = await requireAdmin\(\);\s*\n\s*if \(!a\.ok\) return a;/.test(f.slice(0, 500)); }), [true, true, true]);
  eq('★★ グループを終わらせるとき、署名待ちも取りやめる', /update\(\{ status: 'cancelled', closed_at: nowIso \}\)\.eq\('group_id', id\)\.eq\('status', 'pending'\)/.test(admin), true);
  const sql = read('追加SQL_第1328便_CRMのグループ共有の画面での申込み_2026-10-09.sql');
  eq('★★★ 追加SQL: 2つの表とも RLS を有効にし、anon・authenticated から外す', ['crm_group_invites', 'crm_group_signatures'].map((t) => new RegExp('alter table public\\.' + t + '\\s+enable row level security;').test(sql) && new RegExp('revoke all on public\\.' + t + '\\s+from anon, authenticated;').test(sql)), [true, true]);
  eq('★★★ 追加SQL: 署名の記録は追記専用（直せない・消せない）', /create trigger crm_group_signatures_no_update\s+before update or delete on public\.crm_group_signatures\s+for each row execute function public\.crm_group_logs_append_only\(\);/.test(sql), true);
  eq('★★ 追加SQL: 1店が署名待ちでいられるのは1つだけ', /create unique index if not exists crm_group_invites_one_pending\s+on public\.crm_group_invites \(salon_id\) where status = 'pending';/.test(sql), true);
  {
    const kinds = /kind\s+text\s+not null check \(kind in \(([^)]*)\)\)/.exec(sql);
    eq('追加SQL の署名の種類', kinds ? kinds[1].split(',').map((x) => x.trim().replace(/'/g, '')) : [], ['apply', 'approve', 'decline']);
  }
  // ★★★ 番人・コード・SQL に、実在の店の組み合わせを書いていない（見本は「テスト店」だけ）
  const ui = read('src/app/mypage/crm/GroupJoin.tsx');
  eq('★ 画面: 運営で表示中は押せない', /readOnly=\{todo\.isAdmin\}/.test(ui), true);
}

console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
