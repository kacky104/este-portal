'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  adminListCrmGroups, adminCreateCrmGroup, adminUpdateCrmGroup, adminEndCrmGroup,
  adminAddCrmGroupMember, adminRemoveCrmGroupMember, type CrmGroupRow,
  adminInviteCrmGroupMember, adminCancelCrmGroupInvite, adminListCrmGroupSignatures,
  type CrmGroupInviteAdminRow, type CrmGroupSignatureRow,
} from '@/app/actions/crmGroupAdmin';

// /admin「フクエスCRM：グループ・提携店」（第1324便・2026-10-09・カッキーさん）。
//   ★ グループを作る → 店を入れる（法人名・契約書を受け取った日が要る）／外す／終わらせる。
//   ★ 店舗様の画面には、グループを作る・店を誘う口を置かない。入れる・外すは、ここ（運営）だけ。
//   ★ 読み書きは server action（requireAdmin ＋ service_role）。
// ★★★ どの店とどの店が同じグループか（提携しているか）は秘密の情報。この画面は運営だけが見る。
//   ★ 共有リストの中身（電話番号・内容）は、運営にも出さない。件数だけ。
// ★ 第1328便（カッキーさん）: 店の入れ方が2つになった。
//   ・画面で申し込んでもらう（署名待ちで入れる）… 店の CRM の画面に申込書が出る。全部の署名・承認がそろった時に、グループに入る。
//     あとから足す店は、今いる全部の店が認めてから、その店に申込書が出る（先に出すと、足す店に顔ぶれが知られる）。
//   ・紙で受け取った（すぐ入れる）… 今までどおり。
//   ★ 署名・承認の記録（申込書の文の写し・その時の顔ぶれ・名前・日時）は、ここで見られる。

type SalonOption = { id: number; name: string };

function ymd(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10) || '—';
  return new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'Asia/Tokyo' }).format(d);
}
function todayJST(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
}
function ymdhm(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' }).format(d);
}
/** 署名待ちの、いまの状況（運営向けの言葉） */
function inviteStatus(i: CrmGroupInviteAdminRow): string {
  if (i.status === 'declined') return `今いる店が認めませんでした（${ymd(i.closedAt)}）`;
  if (i.approvals) {
    if (i.approvals.done < i.approvals.total) return `今いる店の承認待ち（${i.approvals.total}店のうち${i.approvals.done}店が承認）。この店の画面には、まだ何も出ていません`;
    return i.applied ? '署名済み（入る処理を待っています）' : '今いる店は全部承認。この店の署名待ち（店の画面に申込書が出ています）';
  }
  if (i.applied) return '署名済み（ほかの店の署名待ち）';
  return i.shown ? '署名待ち（店の画面に申込書が出ています）' : '署名待ち（2店以上そろうと、店の画面に申込書が出ます）';
}
const SIG_KIND: Record<CrmGroupSignatureRow['kind'], string> = { apply: '申込書に署名', approve: '加わることを承認', decline: '加わることを認めない' };

const INPUT = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white';
const LABEL = 'text-[11px] font-bold text-gray-500';

export default function CrmGroupManager({ allSalons, onToast }: {
  allSalons: SalonOption[];
  onToast: (msg: string) => void;
}) {
  const [groups, setGroups] = useState<CrmGroupRow[]>([]);
  const [ready, setReady] = useState(true);
  /** 追加SQL_第1328便（画面での申込みの表）が流れているか */
  const [invitesReady, setInvitesReady] = useState(false);
  const [applyVersion, setApplyVersion] = useState('');
  /** 署名・承認の記録（開いたグループだけ） */
  const [sigs, setSigs] = useState<Record<number, CrmGroupSignatureRow[]>>({});
  const [openSig, setOpenSig] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [newName, setNewName] = useState('');
  const [newNote, setNewNote] = useState('');
  /** 店を入れる欄（グループごと） */
  const [add, setAdd] = useState<Record<number, { salonId: number | ''; corpName: string; agreedOn: string }>>({});
  /** 名前・覚え書きを直している欄（グループごと） */
  const [edit, setEdit] = useState<Record<number, { name: string; note: string }>>({});

  const load = useCallback(async () => {
    const res = await adminListCrmGroups();
    if (res.ok) { setGroups(res.groups); setReady(res.ready); setInvitesReady(res.invitesReady); setApplyVersion(res.applyVersion); } else onToast(res.error);
    setLoading(false);
  }, [onToast]);
  useEffect(() => { void load(); }, [load]);

  /** いまどこかのグループに入っている店（★ 1店が入れるグループは1つだけ） */
  const inGroup = new Map<number, string>();
  for (const g of groups) for (const m of g.members) if (!m.leftAt && !g.endedAt) inGroup.set(m.salonId, g.name);
  /** いま署名待ちの店（★ 1店が署名待ちでいられるのは1つだけ） */
  const pendingIn = new Map<number, string>();
  for (const g of groups) for (const i of g.invites) if (i.status === 'pending') pendingIn.set(i.salonId, g.name);

  const onInvite = async (g: CrmGroupRow) => {
    const a = add[g.id] ?? { salonId: '', corpName: '', agreedOn: todayJST() };
    if (a.salonId === '') { onToast('店舗を選んでください'); return; }
    const name = allSalons.find((s) => s.id === a.salonId)?.name ?? '';
    const members = g.members.filter((m) => !m.leftAt).length;
    const msg = members > 0
      ? `${name} を「${g.name}」に、署名待ちで入れます。\n\nまず、今いる${members}店の画面に「${name} が加わることを認めますか？」と出ます（${name} の名前が、今いる店に見えます）。\n全部の店が認めたあとで、${name} の画面に申込書が出ます（今いる店の名前が、${name} に見えます）。`
      : `${name} を「${g.name}」に、署名待ちで入れます。\n\n署名待ちの店が2店以上になると、それぞれの店の画面に申込書が出ます（お互いの店の名前が見えます）。\n全部の店が署名した時に、共有が使えるようになります。`;
    if (!window.confirm(msg)) return;
    setBusy('invite-' + g.id);
    const res = await adminInviteCrmGroupMember({ groupId: g.id, salonId: Number(a.salonId), corpName: a.corpName });
    setBusy('');
    if (!res.ok) { onToast(res.error); return; }
    onToast(`${name} を署名待ちで入れました`);
    setAdd((p) => { const n = { ...p }; delete n[g.id]; return n; });
    await load();
  };

  const onCancelInvite = async (i: CrmGroupInviteAdminRow) => {
    const name = i.salonName || `店舗${i.salonId}`;
    if (!window.confirm(i.status === 'pending' ? `${name} の署名待ちを取りやめます。\n\nこの店の画面から申込書が消えます。済んだ署名・承認の記録は残ります。` : `${name} の行を片づけます（記録は残ります）。`)) return;
    setBusy('cancel-' + i.id);
    const res = await adminCancelCrmGroupInvite({ inviteId: i.id });
    setBusy('');
    if (!res.ok) { onToast(res.error); return; }
    onToast(i.status === 'pending' ? `${name} の署名待ちを取りやめました` : '片づけました');
    await load();
  };

  const onToggleSigs = async (g: CrmGroupRow) => {
    if (openSig === g.id) { setOpenSig(null); return; }
    setBusy('sig-' + g.id);
    const res = await adminListCrmGroupSignatures({ groupId: g.id });
    setBusy('');
    if (!res.ok) { onToast(res.error); return; }
    setSigs((p) => ({ ...p, [g.id]: res.rows }));
    setOpenSig(g.id);
  };

  const onCreate = async () => {
    setBusy('create');
    const res = await adminCreateCrmGroup({ name: newName, note: newNote });
    setBusy('');
    if (!res.ok) { onToast(res.error); return; }
    onToast('グループを作りました。店を入れると、その店どうしで共有できるようになります');
    setNewName(''); setNewNote('');
    await load();
  };

  const onSaveEdit = async (g: CrmGroupRow) => {
    const e = edit[g.id];
    if (!e) return;
    setBusy('edit-' + g.id);
    const res = await adminUpdateCrmGroup({ id: g.id, name: e.name, note: e.note });
    setBusy('');
    if (!res.ok) { onToast(res.error); return; }
    onToast('直しました');
    setEdit((p) => { const n = { ...p }; delete n[g.id]; return n; });
    await load();
  };

  const onAdd = async (g: CrmGroupRow) => {
    const a = add[g.id] ?? { salonId: '', corpName: '', agreedOn: todayJST() };
    if (a.salonId === '') { onToast('店舗を選んでください'); return; }
    const name = allSalons.find((s) => s.id === a.salonId)?.name ?? '';
    if (!window.confirm(`${name} を「${g.name}」に入れます。\n\n全部の店のサインがそろった契約書を、受け取っていますか？\n入れると、このグループの店どうしで NG・要注意の共有が見えるようになります。`)) return;
    setBusy('add-' + g.id);
    const res = await adminAddCrmGroupMember({ groupId: g.id, salonId: Number(a.salonId), corpName: a.corpName, agreedOn: a.agreedOn });
    setBusy('');
    if (!res.ok) { onToast(res.error); return; }
    onToast(`${name} を入れました`);
    setAdd((p) => { const n = { ...p }; delete n[g.id]; return n; });
    await load();
  };

  const onRemove = async (g: CrmGroupRow, memberId: number, salonName: string) => {
    if (!window.confirm(`${salonName} を「${g.name}」から外します。\n\nこの店が出していた共有は、ほかの店から見えなくなります。この店からも、グループの共有は見えなくなります。`)) return;
    setBusy('rm-' + memberId);
    const res = await adminRemoveCrmGroupMember({ memberId });
    setBusy('');
    if (!res.ok) { onToast(res.error); return; }
    onToast(`${salonName} を外しました（取り下げた共有 ${res.withdrawn}件）`);
    await load();
  };

  const onEnd = async (g: CrmGroupRow) => {
    if (!window.confirm(`「${g.name}」を終わらせます。\n\n入っている店を全部外し、出ていた共有を全部取り下げます。元には戻せません（もう一度作り直すことはできます）。`)) return;
    setBusy('end-' + g.id);
    const res = await adminEndCrmGroup({ id: g.id });
    setBusy('');
    if (!res.ok) { onToast(res.error); return; }
    onToast(`終わらせました（外した店 ${res.left}・取り下げた共有 ${res.withdrawn}件）`);
    await load();
  };

  if (loading) return <p className="text-xs text-gray-400">読み込み中…</p>;
  if (!ready) {
    return (
      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-relaxed">
        追加SQL_第1324便（CRMのグループ共有の表）がまだ流れていません。流すと、ここでグループを作れるようになります。
      </p>
    );
  }

  const active = groups.filter((g) => !g.endedAt);
  const ended = groups.filter((g) => g.endedAt);

  return (
    <div className="space-y-5">
      <p className="text-xs text-gray-500 leading-relaxed">
        フクエスCRM の「NG・要注意のお客様」を、グループ店・提携店のあいだで共有するための入れ物です。
        グループを作って店を入れると、その店どうしだけで共有できるようになります（知らない店どうしでは共有しません）。
店の入れ方は2つです。<b>画面で申し込んでもらう</b>（店の画面に申込書が出て、全部の署名・承認がそろった時に入ります）か、<b>紙で受け取った</b>（全部の店のサインがそろった契約書を受け取ってから、すぐ入れる）。1店が入れるグループは1つだけです。
        <br />★ どの店とどの店が同じグループかは、外に出さない情報です。この画面は運営だけが見ます。共有の中身は運営にも出しません（件数だけ）。
      </p>

      {/* ── グループを作る ── */}
      <div className="grid gap-3 md:grid-cols-[1fr_2fr_auto] items-end border border-gray-200 rounded-xl p-4 bg-gray-50">
        <label className="block">
          <span className={LABEL}>グループの名前（運営の覚え書き・店舗様には見せません）</span>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={40} className={`mt-1 ${INPUT}`} placeholder="例）○○グループ" />
        </label>
        <label className="block">
          <span className={LABEL}>覚え書き（任意）</span>
          <input value={newNote} onChange={(e) => setNewNote(e.target.value)} maxLength={500} className={`mt-1 ${INPUT}`} placeholder="契約書の保管場所など" />
        </label>
        <button type="button" onClick={() => void onCreate()} disabled={busy !== '' || newName.trim() === ''}
          className="px-5 py-2 rounded-xl bg-gradient-to-r from-pink-500 to-fuchsia-500 text-white font-bold text-xs shadow-sm disabled:opacity-50 hover:opacity-90">
          {busy === 'create' ? '作っています…' : 'グループを作る'}
        </button>
      </div>

      {active.length === 0 && <p className="text-xs text-gray-400">まだグループはありません。</p>}

      {active.map((g) => {
        const a = add[g.id] ?? { salonId: '' as number | '', corpName: '', agreedOn: todayJST() };
        const e = edit[g.id];
        const members = g.members.filter((m) => !m.leftAt);
        const left = g.members.filter((m) => m.leftAt);
        const setA = (patch: Partial<typeof a>) => setAdd((p) => ({ ...p, [g.id]: { ...a, ...patch } }));
        return (
          <div key={g.id} className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-200">
              {e ? (
                <>
                  <input value={e.name} onChange={(ev) => setEdit((p) => ({ ...p, [g.id]: { ...e, name: ev.target.value } }))} maxLength={40} className="border border-gray-300 rounded-lg px-2 py-1 text-sm bg-white w-48" />
                  <input value={e.note} onChange={(ev) => setEdit((p) => ({ ...p, [g.id]: { ...e, note: ev.target.value } }))} maxLength={500} className="border border-gray-300 rounded-lg px-2 py-1 text-sm bg-white flex-1 min-w-[160px]" placeholder="覚え書き" />
                  <button type="button" onClick={() => void onSaveEdit(g)} disabled={busy !== ''} className="px-3 py-1 rounded-lg bg-gray-800 text-white text-xs font-bold disabled:opacity-50">保存</button>
                  <button type="button" onClick={() => setEdit((p) => { const n = { ...p }; delete n[g.id]; return n; })} className="text-xs text-gray-500 underline">やめる</button>
                </>
              ) : (
                <>
                  <span className="text-sm font-bold text-gray-800">{g.name}</span>
                  <span className="text-[11px] text-gray-500">入っている店 {members.length}・有効な共有 {g.alertCount}件・作成 {ymd(g.createdAt)}</span>
                  {g.note && <span className="text-[11px] text-gray-400">／{g.note}</span>}
                  <span className="flex-1" />
                  <button type="button" onClick={() => setEdit((p) => ({ ...p, [g.id]: { name: g.name, note: g.note } }))} className="text-xs text-gray-500 underline">名前を直す</button>
                  <button type="button" onClick={() => void onEnd(g)} disabled={busy !== ''} className="text-xs text-rose-600 underline disabled:opacity-50">終わらせる</button>
                </>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-200">
                    <th className="px-4 py-2 font-bold">店舗</th>
                    <th className="px-4 py-2 font-bold">運営者（法人名・屋号）</th>
                    <th className="px-4 py-2 font-bold">契約書を受け取った日</th>
                    <th className="px-4 py-2 font-bold">入れた日</th>
                    <th className="px-4 py-2 font-bold" />
                  </tr>
                </thead>
                <tbody>
                  {members.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-3 text-gray-400">まだ店が入っていません。</td></tr>
                  )}
                  {members.map((m) => (
                    <tr key={m.id} className="border-b border-gray-100">
                      <td className="px-4 py-2 font-bold text-gray-800">
                        {m.salonName || `店舗${m.salonId}`}
                        {!m.crmUntil && <span className="ml-2 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">CRM未契約</span>}
                      </td>
                      <td className="px-4 py-2 text-gray-700">{m.corpName}</td>
                      <td className="px-4 py-2 text-gray-700">{ymd(m.agreedOn)}</td>
                      <td className="px-4 py-2 text-gray-500">{ymd(m.joinedAt)}</td>
                      <td className="px-4 py-2 text-right">
                        <button type="button" onClick={() => void onRemove(g, m.id, m.salonName || `店舗${m.salonId}`)} disabled={busy !== ''} className="text-rose-600 underline disabled:opacity-50">
                          {busy === 'rm-' + m.id ? '外しています…' : '外す'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {left.map((m) => (
                    <tr key={m.id} className="border-b border-gray-100 text-gray-400">
                      <td className="px-4 py-2">{m.salonName || `店舗${m.salonId}`}</td>
                      <td className="px-4 py-2">{m.corpName}</td>
                      <td className="px-4 py-2">{ymd(m.agreedOn)}</td>
                      <td className="px-4 py-2">{ymd(m.joinedAt)}</td>
                      <td className="px-4 py-2 text-right">{ymd(m.leftAt)} に外した</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── 署名待ち（第1328便・画面での申込み）── */}
            {g.invites.length > 0 && (
              <div className="border-t border-gray-200">
                <p className="px-4 pt-3 text-[11px] font-bold text-gray-500">署名待ち（画面で申し込んでもらっている店）</p>
                <table className="w-full text-xs">
                  <tbody>
                    {g.invites.map((i) => (
                      <tr key={i.id} className={`border-b border-gray-100 ${i.status === 'declined' ? 'text-gray-400' : ''}`}>
                        <td className="px-4 py-2 font-bold text-gray-800">
                          {i.salonName || `店舗${i.salonId}`}
                          {!i.crmUntil && <span className="ml-2 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">CRM未契約</span>}
                        </td>
                        <td className="px-4 py-2 text-gray-700">{i.corpName}</td>
                        <td className="px-4 py-2 text-gray-700">{inviteStatus(i)}</td>
                        <td className="px-4 py-2 text-gray-500">{ymd(i.createdAt)} に入れた</td>
                        <td className="px-4 py-2 text-right">
                          <button type="button" onClick={() => void onCancelInvite(i)} disabled={busy !== ''} className="text-rose-600 underline disabled:opacity-50">
                            {busy === 'cancel-' + i.id ? '…' : i.status === 'pending' ? '取りやめる' : '片づける'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── 店を入れる ── */}
            <div className="grid gap-3 md:grid-cols-[1.4fr_1.4fr_1fr_auto] items-end px-4 py-3 bg-gray-50 border-t border-gray-200">
              <label className="block">
                <span className={LABEL}>店舗</span>
                <select value={a.salonId} onChange={(ev) => setA({ salonId: ev.target.value === '' ? '' : Number(ev.target.value) })} className={`mt-1 ${INPUT}`}>
                  <option value="">選んでください</option>
                  {allSalons.map((s) => (
                    <option key={s.id} value={s.id} disabled={inGroup.has(s.id) || pendingIn.has(s.id)}>
                      {s.name}{inGroup.has(s.id) ? `（${inGroup.get(s.id)} に入っています）` : pendingIn.has(s.id) ? `（${pendingIn.get(s.id)} の署名待ち）` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={LABEL}>運営者（法人名。個人なら屋号かお名前）</span>
                <input value={a.corpName} onChange={(ev) => setA({ corpName: ev.target.value })} maxLength={80} className={`mt-1 ${INPUT}`} />
              </label>
              <label className="block">
                <span className={LABEL}>契約書を受け取った日</span>
                <input type="date" value={a.agreedOn} max={todayJST()} onChange={(ev) => setA({ agreedOn: ev.target.value })} className={`mt-1 ${INPUT}`} />
              </label>
              <button type="button" onClick={() => void onAdd(g)} disabled={busy !== '' || a.salonId === '' || a.corpName.trim() === '' || a.agreedOn === ''}
                className="px-5 py-2 rounded-xl bg-gray-800 text-white font-bold text-xs disabled:opacity-50 hover:opacity-90">
                {busy === 'add-' + g.id ? '入れています…' : '紙で受け取った（すぐ入れる）'}
              </button>
            </div>
            {/* ── 画面で申し込んでもらう（第1328便）── */}
            <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-gray-50 border-t border-gray-200">
              {invitesReady ? (
                <>
                  <button type="button" onClick={() => void onInvite(g)} disabled={busy !== '' || a.salonId === '' || a.corpName.trim() === ''}
                    className="px-5 py-2 rounded-xl bg-gradient-to-r from-pink-500 to-fuchsia-500 text-white font-bold text-xs shadow-sm disabled:opacity-50 hover:opacity-90">
                    {busy === 'invite-' + g.id ? '入れています…' : '画面で申し込んでもらう（署名待ちで入れる）'}
                  </button>
                  <span className="text-[11px] text-gray-500 leading-relaxed">
                    上の「店舗」と「運営者」を使います（日付は要りません）。運営者の欄は、申込書で相手の店にも見えます（個人のお店は屋号がおすすめです）。★ 申込書の文は下書きです（版 {applyVersion}・弁護士の確認前）。
                  </span>
                </>
              ) : (
                <span className="text-[11px] text-amber-700">追加SQL_第1328便（画面での申込みの表）を流すと、ここに「画面で申し込んでもらう」が出ます。</span>
              )}
              <span className="flex-1" />
              {invitesReady && (
                <button type="button" onClick={() => void onToggleSigs(g)} disabled={busy !== ''} className="text-xs text-gray-600 underline disabled:opacity-50">
                  {openSig === g.id ? '署名・承認の記録を閉じる' : '署名・承認の記録を見る'}
                </button>
              )}
            </div>
            {openSig === g.id && (
              <div className="px-4 py-3 border-t border-gray-200 space-y-2">
                {(sigs[g.id] ?? []).length === 0 && <p className="text-xs text-gray-400">まだ記録はありません。</p>}
                {(sigs[g.id] ?? []).map((s) => (
                  <details key={s.id} className="border border-gray-200 rounded-lg">
                    <summary className="cursor-pointer px-3 py-2 text-xs text-gray-700">
                      <span className="font-bold text-gray-800">{ymdhm(s.createdAt)}</span>
                      <span className="ml-2">{s.salonName || `店舗${s.salonId}`}</span>
                      <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold ${s.kind === 'decline' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>{SIG_KIND[s.kind]}</span>
                      <span className="ml-2">名前：{s.signerName}</span>
                      <span className="ml-2 text-gray-400">版 {s.docVersion}</span>
                    </summary>
                    <div className="px-3 pb-3 text-xs text-gray-700 space-y-2">
                      <p className="font-bold text-gray-500">その時の参加店</p>
                      <ul className="list-disc pl-5">
                        {s.parties.map((p, idx) => <li key={idx}>{p.name}（{p.corp}）</li>)}
                      </ul>
                      <p className="font-bold text-gray-500">その時の文</p>
                      <div className="whitespace-pre-wrap border border-gray-200 rounded bg-gray-50 px-3 py-2 max-h-[320px] overflow-y-auto leading-relaxed">{s.docBody}</div>
                    </div>
                  </details>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {ended.length > 0 && (
        <div className="text-[11px] text-gray-400 leading-relaxed">
          <p className="font-bold text-gray-500">終わったグループ</p>
          {ended.map((g) => (
            <p key={g.id}>{g.name}（{ymd(g.createdAt)} 〜 {ymd(g.endedAt)}・店 {g.members.length}）</p>
          ))}
        </div>
      )}
    </div>
  );
}
