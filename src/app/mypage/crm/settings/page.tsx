'use client';

import { useEffect, useState } from 'react';
import { getCrmRoomQr, getCrmSettings, saveCrmSettings } from '@/app/actions/crm';
import QRCode from 'qrcode';
import { CRM_ALARM_SOUNDS, CRM_CONSENT_DEFAULT_BODY, CRM_CONSENT_DEFAULT_TITLE, CRM_END_LABEL, CRM_ROOM_COLORS, roomColor, CRM_TOGGLE_MAX, CRM_TOGGLE_OPTION_MAX, CRM_TOGGLE_OPTION_LEN, CRM_TOGGLE_TITLE_LEN, CRM_TOGGLE_COLORS, type CrmToggleColor, type CrmAlarm, type CrmEndType, type CrmSettings, type CrmToggle } from '@/app/lib/crm/types';
import { playAlarmOnce, unlockAlarmAudio } from '@/app/lib/crm/alarmSound';
import { CrmShell, useCrmAccess } from '../CrmShell';
import { ImportDialog } from '../ImportDialog';

// フクエスCRM「設定」（第548便・2026-09-19）。
// ★ スケジュールの時間軸の始まりと終わり・終わりの時刻の既定のバッジ（受まで／上がり）。
// ★ 時間軸は1時間単位。予約が範囲の外にあるときは、スケジュール側で自動で広げる（見落とさないため）。
// ★ 終わりは翌7時まで（予約の読み込み範囲が「その日0時〜翌7時」のため）。

function hourLabel(h: number): string {
  return h >= 24 ? `翌${h - 24}時` : `${h}時`;
}

export default function CrmSettingsPage() {
  const { access, adminSalonQuery } = useCrmAccess();
  return (
    <CrmShell access={access} adminSalonQuery={adminSalonQuery} current="settings">
      {(a) => <SettingsBody salonId={a.salonId} />}
    </CrmShell>
  );
}

const SETTING_TABS = [
  { key: 'display', label: '表示時間' },
  { key: 'endbadge', label: '終わりのバッジ' },
  { key: 'rooms', label: '待機場所（部屋）' },
  { key: 'toggles', label: '出勤情報の項目（追加）' },
  { key: 'alarms', label: '予約アラーム' },
  { key: 'consent', label: '来店時の同意書（QR）' },
  { key: 'cast', label: 'セラピストへの公開' },
  { key: 'import', label: 'データの取り込み' },
] as const;
type SettingTab = (typeof SETTING_TABS)[number]['key'];

function SettingsBody({ salonId }: { salonId: number }) {
  const [st, setSt] = useState<CrmSettings | null>(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [newRoom, setNewRoom] = useState('');
  // 左のサイドバーで選んでいる項目（URL の #rooms などで覚える・第565便）
  const [tab, setTab] = useState<SettingTab>(() => {
    if (typeof window === 'undefined') return 'display';
    const h = window.location.hash.replace('#', '');
    return (SETTING_TABS.some((t) => t.key === h) ? h : 'display') as SettingTab;
  });
  // ★ スマホのドロワー（第635便）。開いている間は本文のスクロールを止める・Esc で閉じる
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawerOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [drawerOpen]);
  const pickTab = (k: SettingTab) => {
    setTab(k);
    try { window.history.replaceState(null, '', `#${k}`); } catch { /* 何もしない */ }
  };

  useEffect(() => {
    let alive = true;
    getCrmSettings(salonId).then((r) => {
      if (!alive) return;
      if (!r.ok) { setErr(r.error); return; }
      // ★ 同意書の題名・本文がどちらも空なら、初期の文面を入れておく（保存するまでは DB は変わらない・第562便）
      const s = r.settings;
      setSt(!s.consentTitle.trim() && !s.consentBody.trim()
        ? { ...s, consentTitle: CRM_CONSENT_DEFAULT_TITLE, consentBody: CRM_CONSENT_DEFAULT_BODY }
        : s);
    });
    return () => { alive = false; };
  }, [salonId]);

  if (!st) return <p className="p-10 text-center text-[14px] text-slate-400">{err || '読み込み中です…'}</p>;

  const startHours: number[] = [];
  for (let h = 6; h <= 30; h++) startHours.push(h);
  const endHours: number[] = [];
  for (let h = 7; h <= 31; h++) endHours.push(h);

  const save = async () => {
    setBusy(true); setErr(''); setMsg('');
    const r = await saveCrmSettings(salonId, st);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setMsg('保存しました');
  };

  const sel = 'border border-slate-300 bg-white px-3 py-2 text-[15px] focus:border-indigo-400 focus:outline-none';

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-3 px-3 py-4 md:flex-row md:items-start md:gap-5">
      {/* ★ スマホ: 三本線＋いま開いている項目名。押すと左からドロワー（第635便・/mypage と同じ動き） */}
      <div className="flex items-center gap-2 border border-slate-200 bg-white px-2 py-2 md:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="設定のメニューを開く"
          aria-expanded={drawerOpen}
          className="p-1 text-indigo-600"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <button type="button" onClick={() => setDrawerOpen(true)} className="min-w-0 flex-1 truncate text-left text-[15px] font-black text-slate-800">
          {SETTING_TABS.find((t) => t.key === tab)?.label}
        </button>
      </div>
      {drawerOpen && (
        <div className="fixed inset-x-0 top-0 z-50 h-dvh md:hidden" role="dialog" aria-modal="true" aria-label="設定のメニュー">
          <button type="button" aria-label="メニューを閉じる" onClick={() => setDrawerOpen(false)} className="absolute inset-0 bg-black/40" />
          <nav
            aria-label="設定の項目"
            className="absolute inset-y-0 left-0 w-[280px] max-w-[85vw] overflow-y-auto overscroll-contain bg-white shadow-2xl [padding-bottom:calc(6rem+env(safe-area-inset-bottom))]"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <span className="text-sm font-black text-slate-700">設定</span>
              <button type="button" onClick={() => setDrawerOpen(false)} aria-label="閉じる" className="p-1 text-slate-400 hover:text-slate-600">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            {SETTING_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => { pickTab(t.key); setDrawerOpen(false); }}
                aria-pressed={tab === t.key}
                className={`block w-full border-b border-l-4 border-b-slate-100 px-4 py-3.5 text-left text-[14px] font-bold ${
                  tab === t.key ? 'border-l-indigo-600 bg-indigo-50 text-indigo-700' : 'border-l-transparent text-slate-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      )}
      {/* 左のサイドバー（第565便・風俗CTIv2 の設定画面にならう）。PC だけ（スマホは上のドロワー・第635便） */}
      <nav className="hidden md:sticky md:top-3 md:flex md:w-[200px] md:flex-none md:flex-col md:gap-0 md:overflow-visible md:border md:border-slate-200 md:bg-white">
        {SETTING_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => pickTab(t.key)}
            className={`whitespace-nowrap px-3 py-2 text-left text-[14px] font-bold md:border-b md:border-slate-100 md:px-5 md:py-4 md:text-[15px] ${
              tab === t.key ? 'bg-indigo-50 text-indigo-700 md:border-l-4 md:border-l-indigo-600' : 'bg-white text-slate-700 hover:bg-slate-50 md:border-l-4 md:border-l-transparent'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div className="min-w-0 flex-1">
      {tab === 'display' && (
      <section className="border border-slate-200 bg-white p-5">
        <h2 className="text-[17px] font-black text-slate-800">スケジュールの表示時間</h2>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <p className="mb-1 text-[12px] font-bold text-slate-500">開始時刻</p>
            <select className={sel} value={Math.floor(st.dayStartMin / 60)} onChange={(e) => setSt({ ...st, dayStartMin: Number(e.target.value) * 60 })}>
              {startHours.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
            </select>
          </div>
          <span className="pb-2 text-slate-400">〜</span>
          <div>
            <p className="mb-1 text-[12px] font-bold text-slate-500">終了時刻</p>
            <select className={sel} value={Math.ceil(st.dayEndMin / 60)} onChange={(e) => setSt({ ...st, dayEndMin: Number(e.target.value) * 60 })}>
              {endHours.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
            </select>
          </div>
        </div>
        <p className="mt-2 text-[12px] text-slate-400">終了時刻は翌7時まで選べます。締め・日報の「その日の分」は、表示時間に関係なく朝6時で区切ります。</p>
      </section>
      )}

      {tab === 'endbadge' && (
      <section className="mt-4 border border-slate-200 bg-white p-5">
        <h2 className="text-[17px] font-black text-slate-800">セラピストの終わりの時刻のバッジ（既定）</h2>
        <div className="mt-3 space-y-2">
          {(['accept', 'finish'] as CrmEndType[]).map((t) => (
            <label key={t} className="flex cursor-pointer items-center gap-2 text-[14px]">
              <input type="radio" className="h-4 w-4 accent-indigo-600" checked={st.defaultEndType === t} onChange={() => setSt({ ...st, defaultEndType: t })} />
              <span className={`border px-1.5 text-[12px] font-bold ${t === 'accept' ? 'border-orange-400 bg-orange-50 text-orange-700' : 'border-pink-400 bg-white text-pink-600'}`}>{CRM_END_LABEL[t]}</span>
              <span className="text-slate-600">{t === 'accept' ? '受付までの時刻（その時刻まで予約を受ける）' : 'この時刻で終わり'}</span>
            </label>
          ))}
        </div>
      </section>
      )}

      {tab === 'rooms' && (
      <section className="mt-4 border border-slate-200 bg-white p-5">
        <h2 className="text-[17px] font-black text-slate-800">待機場所（部屋）</h2>
        <p className="mt-1 text-[13px] text-slate-600">スケジュールで名前を押した「出勤情報」で選べます。選ぶと名前の下にバッジで出ます。色のマスを押すとバッジの色が変わります。</p>
        {st.rooms.length === 0 && <p className="mt-3 text-[13px] text-slate-400">まだありません</p>}
        <div className="mt-3 space-y-2">
          {st.rooms.map((r) => {
            const cur = st.roomColors[r] ?? 'navy';
            const c = roomColor(cur);
            return (
              <div key={r} className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-2">
                <span className="min-w-[64px] px-2 py-1 text-center text-[13px] font-bold" style={{ background: c.bg, color: c.fg, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.25)' }}>{r}</span>
                <div className="flex flex-wrap gap-1">
                  {CRM_ROOM_COLORS.map((col) => (
                    <button
                      key={col.key}
                      type="button"
                      title={col.label}
                      aria-label={`${r}を${col.label}にする`}
                      onClick={() => setSt({ ...st, roomColors: { ...st.roomColors, [r]: col.key } })}
                      className={`h-6 w-6 border ${cur === col.key ? 'ring-2 ring-indigo-500 ring-offset-1' : 'border-slate-300'}`}
                      style={{ background: col.bg }}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const rc = { ...st.roomColors };
                    delete rc[r];
                    setSt({ ...st, rooms: st.rooms.filter((x) => x !== r), roomColors: rc });
                  }}
                  className="ml-auto text-[12px] font-bold text-slate-400 underline"
                >
                  削除
                </button>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex gap-2">
          <input
            value={newRoom}
            maxLength={30}
            onChange={(e) => setNewRoom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newRoom.trim()) {
                e.preventDefault();
                if (!st.rooms.includes(newRoom.trim())) setSt({ ...st, rooms: [...st.rooms, newRoom.trim()] });
                setNewRoom('');
              }
            }}
            placeholder="例）B506"
            className="w-48 border border-slate-300 bg-white px-3 py-2 text-[14px] focus:border-indigo-400 focus:outline-none"
          />
          <button
            type="button"
            disabled={!newRoom.trim()}
            onClick={() => {
              if (!st.rooms.includes(newRoom.trim())) setSt({ ...st, rooms: [...st.rooms, newRoom.trim()] });
              setNewRoom('');
            }}
            className="border border-indigo-300 bg-indigo-50 px-3 text-[13px] font-bold text-indigo-700 disabled:opacity-40"
          >
            追加
          </button>
        </div>
        <p className="mt-2 text-[12px] text-slate-400">追加・削除のあとは、下の「保存する」を押してください。</p>
      </section>
      )}

      {tab === 'alarms' && (
      <section className="mt-4 border border-slate-200 bg-white p-5">
        <h2 className="text-[17px] font-black text-slate-800">予約アラーム</h2>
        <p className="mt-1 text-[13px] text-slate-600">
          予約の開始・終了の○分前に、スケジュール画面で音を鳴らし、その予約のカードを点滅させます。
          スケジュール画面を開いているときだけ鳴ります（開くたびに「アラームの音をONにする」を1回押してください）。キャンセルの予約では鳴りません。
        </p>
        {st.alarms.length === 0 && <p className="mt-3 text-[13px] text-slate-400">アラームはありません（鳴らしません）</p>}
        <div className="mt-3 space-y-2">
          {st.alarms.map((a, i) => {
            const upd = (p: Partial<CrmAlarm>) => setSt({ ...st, alarms: st.alarms.map((x, j) => (j === i ? { ...x, ...p } : x)) });
            return (
              <div key={i} className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-2 text-[14px]">
                <select className="border border-slate-300 bg-white px-2 py-1.5" value={a.on} onChange={(e) => upd({ on: e.target.value === 'end' ? 'end' : 'start' })}>
                  <option value="start">予約開始</option>
                  <option value="end">予約終了</option>
                </select>
                <input className="w-16 border border-slate-300 px-2 py-1.5 text-right" inputMode="numeric" value={a.min} onChange={(e) => upd({ min: Math.min(120, Number(e.target.value.replace(/[^0-9]/g, '')) || 0) })} />
                <span>分前に</span>
                <input className="w-16 border border-slate-300 px-2 py-1.5 text-right" inputMode="numeric" value={a.sec} onChange={(e) => upd({ sec: Math.min(300, Number(e.target.value.replace(/[^0-9]/g, '')) || 0) })} />
                <span>秒</span>
                <select className="border border-slate-300 bg-white px-2 py-1.5" value={a.sound} onChange={(e) => upd({ sound: Number(e.target.value) })}>
                  {CRM_ALARM_SOUNDS.map((n) => <option key={n} value={n}>アラーム{n}</option>)}
                </select>
                <button type="button" onClick={async () => { if (await unlockAlarmAudio()) playAlarmOnce(a.sound); }} className="border border-slate-300 bg-white px-2 py-1 text-[12px] font-bold text-slate-600">▶ 試しに鳴らす</button>
                <button type="button" onClick={() => setSt({ ...st, alarms: st.alarms.filter((_, j) => j !== i) })} className="ml-auto text-[12px] font-bold text-slate-400 underline">削除</button>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          disabled={st.alarms.length >= 10}
          onClick={() => setSt({ ...st, alarms: [...st.alarms, { on: 'start', min: 5, sec: 30, sound: 1 }] })}
          className="mt-3 border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-[13px] font-bold text-indigo-700 disabled:opacity-40"
        >
          ＋ アラームを追加
        </button>
        <p className="mt-2 text-[12px] text-slate-400">「○分前」は0〜120分、鳴らす秒数は5〜300秒です。変えたあとは、下の「保存する」を押してください。</p>
      </section>
      )}

      {tab === 'consent' && (
      <section className="mt-4 border border-slate-200 bg-white p-5">
        <h2 className="text-[17px] font-black text-slate-800">来店時の同意書（ペーパーレス）</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-slate-600">
          各部屋に置いた QR コードをお客様（かセラピスト・お店のタブレット）が読むと、この文面が出ます。
          最後の「上記の内容をすべて了承します」に☑を入れ、指でサインして送信すると、その部屋のいまの予約に「了承済」とサインが記録されます。
          ★ スケジュールで名前を押した「出勤情報」で、その日の待機場所（部屋）を選んでおいてください（部屋から予約を探すため）。
        </p>
        <label className="mt-3 flex cursor-pointer items-center gap-2 text-[14px] font-bold">
          <input type="checkbox" className="h-5 w-5 accent-indigo-600" checked={st.consentEnabled} onChange={(e) => setSt({ ...st, consentEnabled: e.target.checked })} />
          同意書を使う
        </label>
        <p className="mb-1 mt-3 text-[12px] font-bold text-slate-500">題名（任意）</p>
        <input
          value={st.consentTitle}
          maxLength={60}
          onChange={(e) => setSt({ ...st, consentTitle: e.target.value })}
          placeholder="例）ご利用にあたっての注意事項"
          className="w-full border border-slate-300 bg-white px-3 py-2 text-[14px]"
        />
        <p className="mb-1 mt-3 text-[12px] font-bold text-slate-500">本文</p>
        <textarea
          value={st.consentBody}
          maxLength={8000}
          onChange={(e) => setSt({ ...st, consentBody: e.target.value })}
          placeholder={'例）\n・18歳未満の方はご利用いただけません\n・セラピストへの過度な接触は禁止です\n・…'}
          className="min-h-[220px] w-full border border-slate-300 bg-white px-3 py-2 text-[14px] leading-relaxed"
        />
        <div className="mt-1 flex items-center gap-2">
          <ResetConsentButton onReset={() => setSt({ ...st, consentTitle: CRM_CONSENT_DEFAULT_TITLE, consentBody: CRM_CONSENT_DEFAULT_BODY })} />
          <p className="ml-auto text-[11px] text-slate-400">{st.consentBody.length}/8000</p>
        </div>
        <p className="mt-1 text-[12px] leading-relaxed text-slate-400">
          最初に入っている文面はひな形です。お店に合わせて自由に書き換えてください（書き換えたあとは下の「保存する」）。
          内容が法的に十分かどうかは、必要に応じて専門家にご確認ください。
        </p>

        <p className="mt-3 text-[13px] font-bold text-slate-700">部屋ごとの QR コード</p>
        {st.rooms.length === 0 ? (
          <p className="mt-1 text-[13px] text-slate-400">上の「待機場所（部屋）」を追加して保存すると、ここに部屋ごとの QR が出ます。</p>
        ) : (
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {st.rooms.map((r) => <RoomQr key={r} salonId={salonId} room={r} />)}
          </div>
        )}
      </section>
      )}

      {tab === 'toggles' && <ToggleSection toggles={st.customToggles} onChange={(customToggles) => setSt({ ...st, customToggles })} />}

      {tab === 'cast' && (
        <section className="border border-slate-200 bg-white p-5">
          <h2 className="text-[17px] font-black text-slate-800">セラピストへの公開</h2>
          <label className="mt-3 flex cursor-pointer items-center gap-2 text-[15px] font-bold">
            <input type="checkbox" className="h-5 w-5 accent-indigo-600" checked={st.castPayEnabled} onChange={(e) => setSt({ ...st, castPayEnabled: e.target.checked })} />
            セラピストにスケジュールを見せる
          </label>
          <p className="mt-2 text-[13px] leading-relaxed text-slate-600">
            ON にすると、セラピスト本人のページ（/cast）に「スケジュール」タブが出て、<b>自分の出勤と予約</b>をタイムラインで見られます（日付を切り替えられます）。
            左の枠にはその日の待機場所（部屋）、予約には時間・お客様の名前・コースを出します。
            お客様の電話番号・料金・報酬・お店のメモ・女子メモ・ほかのセラピストの予定は見せません。
          </p>
          <p className="mt-1 text-[12px] text-slate-400">変えたあとは、下の「保存する」を押してください。</p>
        </section>
      )}

      {tab === 'import' && <ImportSection salonId={salonId} />}

      {/* ★ 保存ボタンは画面の下についてくる（第564便） */}
      <div className={`sticky bottom-0 z-20 -mx-3 mt-4 border-t border-slate-200 bg-white/95 px-3 pb-3 pt-2 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur ${tab === 'import' ? 'hidden' : ''}`}>
        {err && <p className="mb-2 text-[13px] font-bold text-rose-600">{err}</p>}
        {msg && <p className="mb-2 text-[13px] font-bold text-emerald-700">{msg}</p>}
        <button type="button" disabled={busy} onClick={save} className="w-full bg-indigo-600 py-3 text-[15px] font-bold text-white disabled:opacity-50">
          {busy ? '保存中…' : '保存する'}
        </button>
      </div>
      </div>
    </div>
  );
}

// 部屋ごとの QR（第560便・第561便）。★ 使える QR はいつも1つ。作り直しても「一つ前の QR に戻す」で戻せる
//   （アクリル板などで外注したときに、うっかり作り直しても作ったものが無駄にならないように）。
function RoomQr({ salonId, room }: { salonId: number; room: string }) {
  const [img, setImg] = useState('');
  const [url, setUrl] = useState('');
  const [createdAt, setCreatedAt] = useState('');
  const [prevAt, setPrevAt] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [sure, setSure] = useState<'' | 'regenerate' | 'revert'>('');
  const [busy, setBusy] = useState(false);
  const day = (iso: string) => new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric' }).format(new Date(iso));

  const run = async (action: 'get' | 'regenerate' | 'revert') => {
    setBusy(true); setErr(''); setMsg('');
    const r = await getCrmRoomQr(salonId, room, action);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setUrl(r.url);
    setCreatedAt(r.createdAt);
    setPrevAt(r.prevCreatedAt);
    setImg(await QRCode.toDataURL(r.url, { width: 480, margin: 2, errorCorrectionLevel: 'M' }));
    setSure('');
    if (action === 'regenerate') setMsg('新しい QR にしました。前の QR は使えません。');
    if (action === 'revert') setMsg(`一つ前の QR（${day(r.createdAt)} 作成）に戻しました。`);
  };

  const printIt = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    const esc = room.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch] as string));
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc}</title></head><body style="text-align:center;font-family:sans-serif;padding:24px"><p style="font-size:20px;font-weight:bold">ご来店時にこちらを読み取ってください</p><img src="${img}" style="width:300px;height:300px"><p style="font-size:14px;color:#555">${esc}</p><script>window.onload=function(){window.print()}<\/script></body></html>`);
    w.document.close();
  };

  return (
    <div className="border border-slate-200 p-3 text-center">
      <p className="text-[14px] font-black text-slate-800">{room}</p>
      {!img ? (
        <button type="button" disabled={busy} onClick={() => run('get')} className="mt-2 border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-[13px] font-bold text-indigo-700 disabled:opacity-50">
          QRコードを出す
        </button>
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img} alt={`${room}のQRコード`} className="mx-auto mt-2 h-[160px] w-[160px]" />
          <p className="mt-1 text-[12px] font-bold text-slate-600">この QR の作成日：{day(createdAt)}（いま使えるのはこれだけ）</p>
          <p className="mt-0.5 break-all text-[10px] text-slate-400">{url}</p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <button type="button" onClick={printIt} className="bg-indigo-600 px-3 py-1.5 text-[12px] font-bold text-white">印刷用に開く</button>
            <a href={img} download={`QR_${room}.png`} className="border border-slate-300 bg-white px-3 py-1.5 text-[12px] font-bold text-slate-600">画像を保存</a>
            <button type="button" onClick={() => setSure(sure === 'regenerate' ? '' : 'regenerate')} className="border border-slate-300 bg-white px-3 py-1.5 text-[12px] font-bold text-slate-500">作り直す</button>
            {prevAt && (
              <button type="button" onClick={() => setSure(sure === 'revert' ? '' : 'revert')} className="border border-slate-300 bg-white px-3 py-1.5 text-[12px] font-bold text-slate-500">
                一つ前の QR に戻す（{day(prevAt)} 作成）
              </button>
            )}
          </div>
          {sure === 'regenerate' && (
            <div className="mt-2 border border-rose-300 bg-rose-50 p-2 text-left text-[12px] leading-relaxed text-rose-700">
              作り直すと、今の QR コード（{day(createdAt)} 作成）は<b>すぐに使えなくなります</b>。印刷した紙や、アクリル板などで作ったものも読めなくなります。
              間違えた場合は「一つ前の QR に戻す」で戻せます。
              <div className="mt-2 flex gap-2">
                <button type="button" disabled={busy} onClick={() => run('regenerate')} className="bg-rose-600 px-3 py-1.5 font-bold text-white disabled:opacity-50">本当に作り直す</button>
                <button type="button" onClick={() => setSure('')} className="border border-slate-300 bg-white px-3 py-1.5 font-bold text-slate-600">やめる</button>
              </div>
            </div>
          )}
          {sure === 'revert' && prevAt && (
            <div className="mt-2 border border-amber-300 bg-amber-50 p-2 text-left text-[12px] leading-relaxed text-amber-800">
              一つ前の QR（{day(prevAt)} 作成）が使えるようになり、今の QR（{day(createdAt)} 作成）は使えなくなります。もう一度押せば、また入れ替わります。
              <div className="mt-2 flex gap-2">
                <button type="button" disabled={busy} onClick={() => run('revert')} className="bg-amber-600 px-3 py-1.5 font-bold text-white disabled:opacity-50">一つ前に戻す</button>
                <button type="button" onClick={() => setSure('')} className="border border-slate-300 bg-white px-3 py-1.5 font-bold text-slate-600">やめる</button>
              </div>
            </div>
          )}
          {msg && <p className="mt-1 text-[12px] font-bold text-emerald-700">{msg}</p>}
        </>
      )}
      {err && <p className="mt-1 text-[12px] font-bold text-rose-600">{err}</p>}
    </div>
  );
}

// 同意書を初期の文面に戻す（第562便）。★ 押しただけでは保存しない（下の「保存する」で保存）
function ResetConsentButton({ onReset }: { onReset: () => void }) {
  const [sure, setSure] = useState(false);
  return sure ? (
    <span className="flex items-center gap-2 text-[12px]">
      <span className="font-bold text-rose-600">いまの題名と本文が、初期の文面に置き換わります</span>
      <button type="button" onClick={() => { onReset(); setSure(false); }} className="bg-rose-600 px-2 py-1 font-bold text-white">戻す</button>
      <button type="button" onClick={() => setSure(false)} className="border border-slate-300 bg-white px-2 py-1 font-bold text-slate-600">やめる</button>
    </span>
  ) : (
    <button type="button" onClick={() => setSure(true)} className="border border-slate-300 bg-white px-2 py-1 text-[12px] font-bold text-slate-600">初期の文面に戻す</button>
  );
}

// 出勤情報の自由項目（第597便）。★ 題名と選択肢を自由に作れる・最大2つ。
// ★ スケジュールで名前を押した「出勤情報」に選択肢のボタンが並ぶ（1つだけ選ぶ）。選んだものは名前の下にもバッジで出る。
function newToggleId(): string {
  return Math.random().toString(36).slice(2, 10).replace(/[^a-z0-9]/g, '') || 't' + Date.now().toString(36).slice(-6);
}
function ToggleSection({ toggles, onChange }: { toggles: CrmToggle[]; onChange: (t: CrmToggle[]) => void }) {
  const upd = (i: number, patch: Partial<CrmToggle>) => onChange(toggles.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const input = 'border border-slate-300 bg-white px-3 py-2 text-[14px] focus:border-indigo-400 focus:outline-none';
  return (
    <section className="border border-slate-200 bg-white p-5">
      <h2 className="text-[17px] font-black text-slate-800">出勤情報の項目（追加）</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-slate-600">
        題名と選択肢を自由に作れます（{CRM_TOGGLE_MAX}つまで）。スケジュールで名前を押した「出勤情報」に選択肢のボタンが並び、1つ選べます（もう一度押すと外れます）。
        選んだ選択肢は、スケジュールの名前の下にも小さく出ます（題名は出しません）。例）掛け持ち出勤　A・B・C
      </p>
      <p className="mt-1 text-[13px] leading-relaxed text-slate-600">
        選択肢ごとに<b>予約の背景の色</b>（なし・黄・緑）を決められます。その選択肢を選んだ日は、そのセラピストの予約が選んだ色になります。
      </p>
      <div className="mt-3 space-y-4">
        {toggles.map((t, i) => (
          <div key={t.id} className="border border-slate-200 p-3">
            <div className="flex items-center gap-2">
              <p className="text-[12px] font-bold text-slate-500">項目{i + 1}の題名</p>
              <button type="button" onClick={() => onChange(toggles.filter((_, j) => j !== i))} className="ml-auto text-[12px] font-bold text-slate-400 underline">この項目を削除</button>
            </div>
            <input className={`${input} mt-1 w-full`} value={t.title} maxLength={CRM_TOGGLE_TITLE_LEN} placeholder="例）掛け持ち出勤" onChange={(e) => upd(i, { title: e.target.value })} />
            <p className="mb-1 mt-3 text-[12px] font-bold text-slate-500">選択肢（{CRM_TOGGLE_OPTION_LEN}文字まで・{CRM_TOGGLE_OPTION_MAX}個まで）</p>
            <div className="flex flex-wrap items-center gap-2">
              {t.options.map((o, k) => (
                <span key={k} className="flex items-center border border-slate-300 bg-white">
                  <input
                    className="w-24 px-2 py-1.5 text-[14px] focus:outline-none"
                    value={o}
                    maxLength={CRM_TOGGLE_OPTION_LEN}
                    placeholder={['A', 'B', 'C'][k] ?? ''}
                    onChange={(e) => {
                      // ★ 色は選択肢の文字で覚えるので、文字を変えたら色も付け替える（第638便）
                      const nv = e.target.value;
                      const colors = { ...(t.colors ?? {}) };
                      const c = colors[o];
                      delete colors[o];
                      if (c && nv) colors[nv] = c;
                      upd(i, { options: t.options.map((x, m) => (m === k ? nv : x)), colors });
                    }}
                  />
                  <select
                    aria-label="予約の背景の色"
                    value={t.colors?.[o] ?? ''}
                    disabled={!o.trim()}
                    onChange={(e) => {
                      const colors = { ...(t.colors ?? {}) };
                      if (e.target.value) colors[o] = e.target.value as CrmToggleColor; else delete colors[o];
                      upd(i, { colors });
                    }}
                    className="border-l border-slate-300 px-1 py-1.5 text-[13px] disabled:opacity-40"
                    style={{ background: CRM_TOGGLE_COLORS.find((c) => c.key === t.colors?.[o])?.bg ?? '#fff' }}
                  >
                    <option value="">色なし</option>
                    {CRM_TOGGLE_COLORS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                  <button type="button" aria-label="この選択肢を消す" onClick={() => { const colors = { ...(t.colors ?? {}) }; delete colors[o]; upd(i, { options: t.options.filter((_, m) => m !== k), colors }); }} className="px-2 text-[14px] font-bold text-slate-400">×</button>
                </span>
              ))}
              <button
                type="button"
                disabled={t.options.length >= CRM_TOGGLE_OPTION_MAX}
                onClick={() => upd(i, { options: [...t.options, ''] })}
                className="border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-[13px] font-bold text-indigo-700 disabled:opacity-40"
              >
                ＋ 選択肢
              </button>
            </div>
          </div>
        ))}
      </div>
      {toggles.length < CRM_TOGGLE_MAX && (
        <button
          type="button"
          onClick={() => onChange([...toggles, { id: newToggleId(), title: '', options: ['', '', ''] }])}
          className="mt-3 border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-[13px] font-bold text-indigo-700"
        >
          ＋ 項目を追加
        </button>
      )}
      <p className="mt-2 text-[12px] leading-relaxed text-slate-400">
        空の選択肢は保存のときに外れます。題名を変えても、これまでに選んだ内容はそのまま残ります（選択肢の文字を変えたときは、その選択肢を選んでいた日の表示が消えます）。変えたあとは、下の「保存する」を押してください。
      </p>
    </section>
  );
}

// ★ 第596便: 設定の「データの書き出し」は外した（カッキーさんの指示）。★ サーバー側の exportCrmCsv（actions/crm.ts）は残してある
//   （規約 第7条3「サービスをやめるときは店舗データを書き出す手段を用意する」のため）。戻すときは第569〜578便の ExportSection を git から戻す。

// データの取り込み（第579便）。★ 最初の1回くらいしか使わないので設定の一番下に置く
function ImportSection({ salonId }: { salonId: number }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  return (
    <section className="border border-slate-200 bg-white p-5">
      <h2 className="text-[17px] font-black text-slate-800">データの取り込み</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-slate-600">
        お客様の名前と電話番号を、ファイルからまとめて顧客台帳に入れます。使い始めるときの1回だけの作業です。
        スマホの連絡先（.vcf）や Excel の CSV が読めます。
        電話番号が同じお客様は重複して作りません。分類・メモ・予約は取り込みません。
      </p>
      <button type="button" onClick={() => { setDone(false); setOpen(true); }} className="mt-3 bg-indigo-600 px-4 py-2 text-[14px] font-bold text-white">
        取り込みを始める
      </button>
      {done && <p className="mt-2 text-[13px] font-bold text-emerald-700">取り込みました。顧客台帳で確かめてください。</p>}
      {open && <ImportDialog salonId={salonId} onClose={() => setOpen(false)} onDone={() => setDone(true)} />}
    </section>
  );
}
