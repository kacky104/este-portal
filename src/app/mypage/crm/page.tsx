'use client';

import { appConfirm } from '@/app/components/AppConfirm';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getCrmChangeMark, getCrmSchedule, setCrmWorkEnd, saveCrmTherapistOrder } from '@/app/actions/crm';
import { isUnreceived, type CrmEndType, CRM_EMPTY_WORK_DAY, inBusinessDay, yen, type CrmScheduleBooking, type CrmScheduleData, type CrmScheduleTherapist } from '@/app/lib/crm/types';
import { CrmShell, useCrmAccess } from './CrmShell';
import { CRM_GROUP_ALERT_SOURCE_LABEL } from '@/lib/crmGroup';
import { manualOrderRank } from '@/lib/therapistOrder';
import { safeCall, yenShort, DAY_START_MIN, WINDOW_END_MIN, REFRESH_MS, FORCE_RELOAD_MS, businessTodayJST, shiftDate, dateLabel, minOfDay, type Row } from './_schedule/shared';
import { Grid } from './_schedule/Grid';
import { DetailPanel } from './_schedule/DetailPanel';
import { type BookingFormState, payAmountsOf, splitItems, BookingForm } from './_schedule/BookingForm';
import { MemoDialog, ConfirmDialog } from './_schedule/Dialogs';
import { AlarmCenter } from './_schedule/AlarmCenter';
import { CloseDialog } from './_schedule/CloseDialog';
import { WorkDayDialog } from './_schedule/WorkDayDialog';

export default function CrmSchedulePage() {
  const { access, adminSalonQuery } = useCrmAccess();
  return (
    <CrmShell access={access} adminSalonQuery={adminSalonQuery} current="schedule">
      {(a) => <ScheduleBody salonId={a.salonId} adminSalonQuery={adminSalonQuery} />}
    </CrmShell>
  );
}

function ScheduleBody({ salonId, adminSalonQuery }: { salonId: number; adminSalonQuery: string }) {
  // ★ 予約一覧から来たとき（?date=YYYY-MM-DD）はその日を開く（第571便）
  const [date, setDate] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const v = new URLSearchParams(window.location.search).get('date') ?? '';
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    }
    return businessTodayJST();
  });
  // ★ 点検（低 R）: 見ている日付を URL（?date=）に残す。明日を見ている途中でスマホのブラウザが再読込しても、顧客台帳から戻っても同じ日に戻る。
  //   ★ 今日のときは ?date= を消す（ブックマークが「今日」のままになるように）。?salon= は残す
  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      if (date === businessTodayJST()) u.searchParams.delete('date'); else u.searchParams.set('date', date);
      window.history.replaceState(window.history.state, '', u.toString());
    } catch { /* 何もしない */ }
  }, [date]);
  const [data, setData] = useState<CrmScheduleData | null>(null);
  const [err, setErr] = useState('');
  const [picked, setPicked] = useState<CrmScheduleBooking | null>(null);
  // 受付・変更フォーム（null＝閉じている）
  const [form, setForm] = useState<BookingFormState | null>(null);
  // 女子メモの編集（null＝閉じている）
  const [memoEdit, setMemoEdit] = useState<CrmScheduleTherapist | null>(null);
  // 報酬確定・締め（第538便）
  const [confirmFor, setConfirmFor] = useState<CrmScheduleTherapist | null>(null);
  // ★ 2026-10-09 点検#3: 出勤情報の小窓から「報酬確定を行う」で来たとき、いま保存した交通費（reload が終わる前の data には無い）
  const [confirmTransport, setConfirmTransport] = useState<number | null>(null);
  const [closing, setClosing] = useState(false);
  // ★ 表の上（アラーム・日付・件数）をたためる（第576便）。この端末だけ覚える
  // ★ 第647便：スマホは最初からたたむ（一度でも押した端末は、その選んだ方を守る）
  const [folded, setFolded] = useState<boolean>(() => {
    try {
      if (typeof window === 'undefined') return false;
      const v = localStorage.getItem('crm_top_folded');
      if (v != null) return v === '1';
      return window.matchMedia('(max-width: 767px)').matches;
    } catch { return false; }
  });
  const toggleFold = () => {
    setFolded((v) => {
      try { localStorage.setItem('crm_top_folded', v ? '0' : '1'); } catch { /* 何もしない */ }
      return !v;
    });
  };
  // 出勤情報（名前を押す・第550便）
  const [workFor, setWorkFor] = useState<CrmScheduleTherapist | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [tick, setTick] = useState(0);

  // ★ 第1113便: 60秒ごとの自動更新は lite（設定・料金表を読まない＝前回の値を使い回す）。
  //   日付を変えたとき・「画面を更新」を押したとき・まだ何も持っていないときは全部読む。
  const dataRef = useRef<CrmScheduleData | null>(null);
  useEffect(() => { dataRef.current = data; }, [data]);
  // ★ 第1218便: 「受まで／上がり」を保存中の人（連打防止）
  const endTogglingRef = useRef<Set<number>>(new Set());
  const fullNextRef = useRef(true);
  // ★ 第1116便: 前回読んだときの変更マークと時刻。★ マークが同じ（＝何も変わっていない）なら全量を読まない
  const markRef = useRef<{ mark: string; at: number } | null>(null);
  // ★ 2026-10-09 点検#14: 最後に読み直した時刻
  const loadedAtRef = useRef(0);

  // 読み込み（日付が変わったとき・自動更新のとき）
  useEffect(() => {
    let alive = true;
    const prev = dataRef.current;
    let full = fullNextRef.current || !prev || prev.date !== date;
    fullNextRef.current = false;
    (async () => {
      // ★ 第1116便: 先に変更マーク（1行）だけ読む（★ 全量より【先に】読む＝読んでいる最中の変化を次の回で拾える）。
      //   自動更新で、マークが前回と同じ、かつ前回から10分経っていなければ、ここで終わり（全量を読まない）。
      //   ★ マークを読めないとき（SQL 前・運営が別の店舗を見ている）は null → 今までどおり毎回読む。
      // ★ 第1218便: 読み取りが例外で落ちても（オフライン等）画面が固まらないように try/catch。
      //   ★ lite（60秒ごと）の失敗では前の表を残してエラー文だけ出す（スマホの一瞬の通信切れで表が丸ごと消えないように）。
      let mark: string | null = null;
      try { mark = await getCrmChangeMark(salonId); } catch { mark = null; }
      if (!alive) return;
      if (!full) {
        const last = markRef.current;
        if (mark !== null && last && last.mark === mark && Date.now() - last.at < FORCE_RELOAD_MS) {
          setNowMs(Date.now());
          return;
        }
        // ★ 2026-10-09 点検#5: マークが前回と【違う】＝どこかが変わった → 設定・料金表も読み直す（full）。
        //   lite は設定・料金表を前回の値で使い回すので、別の端末で部屋・アラーム・料金表を変えても、開きっぱなしの画面に出なかった。
        //   （追加SQL_第1344便で crm_settings・crm_price_items もマークを動かす）。マークが同じ回・読めない回は今までどおり lite。
        if (mark !== null && last && last.mark !== mark) full = true;
      }
      let res: Awaited<ReturnType<typeof getCrmSchedule>>;
      try {
        res = await getCrmSchedule(salonId, date, full ? undefined : { lite: true });
      } catch {
        res = { ok: false, error: '読み込めませんでした（通信を確認してください）' };
      }
      if (!alive) return;
      if (!res.ok) {
        setErr(res.error);
        // ★ 2026-10-09 点検#19: full の失敗でも前の表を残す（data を null にすると AlarmCenter が消えて「音ON」と鳴っている最中の状態が失われた）。
        //   日付が違う data は view 側で null（「読み込み中」）になるので、別の日の表で誤って受け付けることはない。
        return;
      }
      setErr('');
      if (res.lite) {
        // ★ lite の返事に設定・料金表は無い → 前回の値と合わせる（前回が無ければ次は全部読む）
        const cur = dataRef.current;
        if (!cur) { fullNextRef.current = true; setTick((v) => v + 1); return; }
        setData({ ...res.data, settings: cur.settings, priceItems: cur.priceItems });
      } else {
        setData(res.data);
      }
      markRef.current = mark !== null ? { mark, at: Date.now() } : null;
      loadedAtRef.current = Date.now();
      setNowMs(Date.now());
    })();
    return () => { alive = false; };
  }, [salonId, date, tick]);

  // 60秒ごとに読み直す（詳細・フォームを開いている間は止める＝見ている最中に動かさない）
  // ★ 2026-10-09 点検#14: 小窓を閉じた直後・スリープから戻った直後は、次の60秒を待たずにすぐ読み直す（15秒以上経っていれば）。
  //   受付フォームを開いたまま電話で5分話して閉じると、別端末の予約・受まで／上がりが最大60秒古いままだった。
  const STALE_MS = 15000;
  useEffect(() => {
    if (picked || form || memoEdit || confirmFor || closing || workFor) return;
    if (loadedAtRef.current && Date.now() - loadedAtRef.current > STALE_MS) setTick((v) => v + 1);
    const t = setInterval(() => setTick((v) => v + 1), REFRESH_MS);
    return () => clearInterval(t);
  }, [picked, form, memoEdit, confirmFor, closing, workFor]);
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      if (loadedAtRef.current && Date.now() - loadedAtRef.current > STALE_MS) setTick((v) => v + 1);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const reload = useCallback(() => setTick((v) => v + 1), []);
  // ★ 第1410便: 行の並べ替え（▲▼）。同じ組（確定していない／確定した）の中で、となりの方と入れ替える。
  //   ★ 画面はすぐ入れ替え、保存はコネックエフと同じ表へ（saveCrmTherapistOrder がその日の方の順だけを全体に差し込む）。
  const orderBusyRef = useRef(false);
  const moveRow = async (ids: number[], tid: number, dir: -1 | 1) => {
    if (orderBusyRef.current) return;
    const i = ids.indexOf(tid);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    const next = [...ids];
    [next[i], next[j]] = [next[j], next[i]];
    orderBusyRef.current = true;
    setData((d) => (d ? { ...d, therapistOrder: [...next, ...d.therapistOrder.filter((x) => !next.includes(x))] } : d));
    try {
      const r = await safeCall(() => saveCrmTherapistOrder(salonId, next));
      if (!r.ok) { setErr(r.error); reload(); return; }
    } finally {
      orderBusyRef.current = false;
    }
  };

  // 「受まで／上がり」の切り替え（表のバッジと、出勤情報の小窓の両方から）
  const toggleEnd = async (tid: number, next: CrmEndType) => {
    // ★ 第1218便: 保存が終わるまで同じ人の切り替えを受け付けない（反応が無いと思って2回押すと元に戻っていた）
    if (endTogglingRef.current.has(tid)) return;
    endTogglingRef.current.add(tid);
    try {
      const r = await safeCall(() => setCrmWorkEnd(salonId, tid, date, next));
      if (!r.ok) { setErr(r.error); return; }
      reload();
    } finally {
      endTogglingRef.current.delete(tid);
    }
  };

  // ★ 帯の「画面を更新」（第641便）：開いている詳細・フォームは閉じて、読み直す。「更新しました」を2秒出す
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null);
  useEffect(() => {
    const onRefresh = (e: Event) => {
      e.preventDefault();
      setPicked(null); setForm(null); setMemoEdit(null); setConfirmFor(null); setClosing(false); setWorkFor(null);
      setErr('');
      fullNextRef.current = true;   // ★ 第1113便: 「画面を更新」は設定・料金表も読み直す
      reload();
      setRefreshedAt(Date.now());
    };
    window.addEventListener('crm:refresh', onRefresh);
    return () => window.removeEventListener('crm:refresh', onRefresh);
  }, [reload]);
  useEffect(() => {
    if (refreshedAt == null) return;
    const t = setTimeout(() => setRefreshedAt(null), 2000);
    return () => clearTimeout(t);
  }, [refreshedAt]);

  const baseMs = useMemo(() => new Date(`${date}T00:00:00+09:00`).getTime(), [date]);

  // ★ 第1686便: 着信ポップの「受付へ」（?tel=090…）。読み込みが終わったら、その番号が入った受付フォームを開く（担当はフリー・開始は今の時刻を 5 分に丸め）。
  //   ★ 1回だけ（開いたら URL から tel を消す）。今日以外を見ていたら今日に戻してから開く。番号から台帳を引くのはフォームの今の仕組み（lookupCrmCustomerByPhone）
  const telOpened = useRef(false);
  useEffect(() => {
    if (!data || telOpened.current) return;
    const tel = new URLSearchParams(window.location.search).get('tel') ?? '';
    if (!/^\d{10,13}$/.test(tel)) return;
    const today = businessTodayJST();
    // ★ URL（?tel=）は画面を開いてからしか読めない＝今日へ戻すのはここ（1回だけ）
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (date !== today) { setDate(today); return; }
    telOpened.current = true;
    try {
      const u = new URL(window.location.href);
      u.searchParams.delete('tel');
      window.history.replaceState(window.history.state, '', u.toString());
    } catch { /* 何もしない */ }
    const nowMin = Math.max(DAY_START_MIN, Math.round((Date.now() - baseMs) / 60000 / 5) * 5);
    const first = data.courses[0];
    setErr('');
    setPicked(null);
    setForm({
      mode: 'new',
      therapistKey: 'free',
      startMin: nowMin,
      courseName: first?.name ?? '',
      courseMin: first?.durationMin ?? 60,
      intervalMin: data.defaultIntervalMin ?? 0,
      customerName: '',
      customerTel: tel,
      note: '',
      selIds: [],
      keepItems: [],
      priceAdjust: '',
      payAdjust: '',
      paymentMethod: '',
      payAmounts: {},
    });
  }, [data, date, baseMs]);

  // 行と表示範囲
  const view = useMemo(() => {
    // ★ 第1218便: 日付を変えた直後（data がまだ前の日）は表を出さない＝「空いている」と誤って受付しないように（下に「読み込み中」）
    if (!data || data.date !== date) return null;
    const inWindow = (s: number, e: number) => e > DAY_START_MIN && s < WINDOW_END_MIN;
    // ★ 時間軸の始まりと終わりは「設定」タブの値（第548便）。予約がその外にあるときだけ広げる。
    let minStart = data.settings.dayStartMin;
    let maxEnd = data.settings.dayEndMin;
    const noteBooking = (s: number, e: number) => {
      if (!inWindow(s, e)) return;
      minStart = Math.min(minStart, Math.max(DAY_START_MIN, s));
      maxEnd = Math.max(maxEnd, Math.min(WINDOW_END_MIN, e));
    };
    const visibleBookings = data.bookings.filter((b) => {
      const s = minOfDay(b.slotStartISO, baseMs);
      const e = minOfDay(b.slotEndISO, baseMs);
      return inWindow(s, e);
    });
    visibleBookings.forEach((b) => noteBooking(minOfDay(b.slotStartISO, baseMs), minOfDay(b.slotEndISO, baseMs)));

    const rows: Row[] = [];
    // ★ 第1785便（カッキーさん・2026-11-08）: フリー（担当未定）の行を【いつも】いちばん上に出す（予約が無い日も）。
    //   ★ 行はたためる（たたむと細い1行・この端末だけ覚える・既定は出ている）。
    //   （第553便では出さない決まりにして、担当未定の予約が残っている日だけ出していた）
    const free = visibleBookings.filter((b) => b.therapistId == null);
    rows.push({ key: 'free', therapist: null, bookings: free });

    const therapistRows: Row[] = [];
    for (const t of data.therapists) {
      const scheds = t.schedules.filter((w) => inWindow(minOfDay(w.startISO, baseMs), minOfDay(w.endISO, baseMs)));
      const bs = visibleBookings.filter((b) => b.therapistId === t.id);
      if (scheds.length === 0 && bs.length === 0) continue;
      therapistRows.push({ key: `t${t.id}`, therapist: { ...t, schedules: scheds }, bookings: bs, done: data.confirms.some((c) => c.therapistId === t.id) });
    }
    // 出勤の早い順（出勤なし・予約だけの人は後ろ）
    const firstStart = (r: Row) => r.therapist?.schedules[0] ? minOfDay(r.therapist.schedules[0].startISO, baseMs) : 99999;
    // ★ 報酬を確定した人は灰色にして下へ（風俗CTIv2 と同じ・第543便）。取り消すと元の位置に戻る。
    // ★ 第1410便（ラビリンス様のご要望）: 確定した人を下へ、の次は【店舗様が決めた並び】（コネックエフのセラピスト一覧と同じ・CRM の ▲▼ でも変えられる）。
    //   並びに無い方は上（-1）。並びが無い店・同じ位置どうしは今までどおり出勤の早い順。
    const orderRank = (r: Row) => (r.therapist ? manualOrderRank(data.therapistOrder, r.therapist.id) : -1);
    therapistRows.sort((a, b) => Number(!!a.done) - Number(!!b.done) || orderRank(a) - orderRank(b) || firstStart(a) - firstStart(b));
    rows.push(...therapistRows);

    const startMin = Math.floor(minStart / 60) * 60;
    const endMin = Math.ceil(maxEnd / 60) * 60;
    // ★ 第1218便: 上の帯の合計は【営業日（6:00〜翌6:00 に始まる予約）】で数える。
    //   前は表示窓（〜翌7:00）で数えていたので、翌6:30 の予約がある日は行ごとの本数・報酬確定・日報とずれていた。
    const dayBookings = visibleBookings.filter((b) => b.status !== 'cancelled' && inBusinessDay(minOfDay(b.slotStartISO, baseMs)));
    const activeCount = dayBookings.length;
    const sales = dayBookings.reduce((a, b) => a + (b.priceTotal ?? 0), 0);
    // ★ 報酬は確定のときの手当・交通費も足す（日報の女子報酬とそろえる・第539便）
    const payAll = dayBookings.reduce((a, b) => a + (b.payTotal ?? 0), 0)
      + data.confirms.reduce((a, c) => a + c.allowance, 0);
    const workingCount = therapistRows.filter((r) => (r.therapist?.schedules.length ?? 0) > 0).length;
    // ★ 第1228便: 未受領の予約そのもの（時間順）も返す＝「未受領 N件」を押すと最初の1件の詳細を開ける
    // ★ 第1415便: 金銭授受を使わないお店は「未受領」を出さない。受領を自動にした日から先は未受領に数えない
    const moneyOn = data.settings?.moneyEnabled !== false;
    const unreceivedList = moneyOn
      ? visibleBookings.filter((b) => isUnreceived(b, nowMs, data.settings?.autoReceivedFrom ?? null)).sort((a, b) => a.slotStartISO.localeCompare(b.slotStartISO))
      : [];
    const unreceived = unreceivedList.length;
    return { rows, startMin, endMin, activeCount, workingCount, sales, payAll, unreceived, unreceivedList };
  }, [data, date, baseMs, nowMs]);

  const isToday = date === businessTodayJST();
  // ★ 第1981便: 「アラームの音をON」を置く場所（日付の行の右端）
  const [alarmHost, setAlarmHost] = useState<HTMLSpanElement | null>(null);
  // ★ 第1218便: 「今」ボタン（今日だけ）。横に流したあと、赤い線の位置へ戻る手段が無かった。
  const [nowJump, setNowJump] = useState(0);
  const nowButton = isToday && view ? (
    <button type="button" onClick={() => setNowJump((v) => v + 1)} title="今の時刻（赤い線）の位置へ" className="border border-rose-400 bg-white px-1.5 py-0.5 text-[11px] font-bold text-rose-600 md:px-2 md:py-1 md:text-[13px]">今</button>
  ) : null;

  return (
    <div className="px-1.5 py-1.5 md:px-4 md:py-2">
      {data && (
        <AlarmCenter
          salonId={salonId}
          isToday={isToday}
          bookings={data.bookings}
          therapists={data.therapists}
          alarms={data.settings.alarms}
          hideButton={folded}
          buttonHost={alarmHost}
        />
      )}
      {folded ? (
        // たたんだとき：日付と前日／今日／次日だけの細い1行
        <div className="mb-1 flex items-center gap-1">
          <span className="text-[13px] font-black text-slate-800 md:text-[15px]">{dateLabel(date)}</span>
          <button type="button" onClick={() => setDate(shiftDate(date, -1))} className="bg-[#3f51b5] px-1.5 py-0.5 text-[11px] font-bold text-white">◀</button>
          <button type="button" onClick={() => setDate(businessTodayJST())} className={`px-1.5 py-0.5 text-[11px] font-bold text-white ${isToday ? 'bg-pink-400' : 'bg-[#3f51b5]'}`}>今日</button>
          <button type="button" onClick={() => setDate(shiftDate(date, 1))} className="bg-[#3f51b5] px-1.5 py-0.5 text-[11px] font-bold text-white">▶</button>
          {nowButton}
          <span className="ml-auto flex items-center gap-1">
            <span ref={setAlarmHost} className="contents" />
            <button type="button" onClick={toggleFold} className="border border-slate-300 bg-white px-4 py-0.5 text-[11px] font-bold text-slate-600">▼ ひらく</button>
          </span>
        </div>
      ) : (
      <>
      {/* 日付と件数 */}
      {/* ★ 第1981便（カッキーさん）: 表の上の隙間を詰めた。前は「アラームの音をON」「たたむ」「日付と件数」が3段だった
          → 1段にまとめ、アラームの音と「たたむ」は右端へ（入りきらない幅では次の行の右に回る）。
          「空いているところを押すと受付できます」は外した（使い方のページにある） */}
      {/* ★ スマホは風俗CTIv2 に近い詰めた形（日付と前日/今日/次日を1行・件数は小さく1行・第575便） */}
      <div className="mb-1.5 flex flex-wrap items-center gap-1 md:mb-2 md:gap-2">
        <span className="text-[14px] font-black text-slate-800 md:text-[20px]">{dateLabel(date)}</span>
        <div className="flex">
          {/* ★ 第1983便: PC も日付の欄をやめて 📅 にした（売上・報酬・未受領で件数が長い日に、右端のアラームと「たたむ」が2行目に落ちていた）。
              押すと日付を選ぶ画面が開く（PC は showPicker） */}
          <label className="relative flex cursor-pointer items-center bg-[#3f51b5] px-1.5 py-1 text-[11px] font-bold text-white md:px-2.5 md:py-1.5 md:text-[13px]" aria-label="日付を選ぶ" title="日付を選ぶ">
            📅
            <input
              type="date"
              value={date}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              onClick={(e) => { try { e.currentTarget.showPicker?.(); } catch { /* 選ぶ画面を出せないブラウザは、そのまま */ } }}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>
          <button type="button" onClick={() => setDate(shiftDate(date, -1))} className="bg-[#3f51b5] px-2 py-1 text-[11px] font-bold text-white md:px-3 md:py-1.5 md:text-[13px]">◀前日</button>
          <button type="button" onClick={() => setDate(businessTodayJST())} className={`px-2 py-1 text-[11px] font-bold text-white md:px-3 md:py-1.5 md:text-[13px] ${isToday ? 'bg-pink-400' : 'bg-[#3f51b5]'}`}>今日</button>
          <button type="button" onClick={() => setDate(shiftDate(date, 1))} className="bg-[#3f51b5] px-2 py-1 text-[11px] font-bold text-white md:px-3 md:py-1.5 md:text-[13px]">次日▶</button>
        </div>
        {nowButton}
        {view && (
          <>
          {/* ★ 第1984便（カッキーさん）: スマホは件数を1行に収める。売上・報酬は「12.5万」の形（売上が6桁の日がほぼ毎日のため）・空白なし・「確定」と短く。
              1万円未満はそのまま「¥9,500」。ぴったりの金額は PC と「締め作業」で見られる */}
          <span className="w-full whitespace-nowrap text-[11px] font-bold tracking-tight text-slate-700 md:hidden">
            予約<span className="text-[#3f51b5]">{view.activeCount}</span>本／出勤<span className="text-[#3f51b5]">{view.workingCount}</span>人／売上<span className="text-[#3f51b5]">{yenShort(view.sales)}</span>／報酬<span className="text-[#3f51b5]">{yenShort(view.payAll)}</span>（確定<span className="text-emerald-600">{data?.confirms.length ?? 0}</span>人）
            {view.unreceived > 0 && (
              <>／<button type="button" onClick={() => setPicked(view.unreceivedList[0])} className="text-rose-600 underline decoration-dotted underline-offset-2">未受領{view.unreceived}件</button></>
            )}
          </span>
          <span className="hidden text-[14px] font-bold text-slate-700 md:ml-2 md:inline">
            予約数 <span className="text-[#3f51b5]">{view.activeCount}</span>本 ／ 出勤数 <span className="text-[#3f51b5]">{view.workingCount}</span>人
            {' '}／ 売上 <span className="text-[#3f51b5]">{yen(view.sales)}</span> ／ 報酬 <span className="text-[#3f51b5]">{yen(view.payAll)}</span>
            {' '}（報酬確定済 <span className="text-emerald-600">{data?.confirms.length ?? 0}</span>人）
            {view.unreceived > 0 && (
              // ★ 第1228便: 押すと、未受領のいちばん早い予約の「お客様と予約」を開く（受領の印をそこで付けられる）
              <>{' '}／ <button type="button" onClick={() => setPicked(view.unreceivedList[0])} title="押すと、未受領のいちばん早い予約を開きます" className="text-rose-600 underline decoration-dotted underline-offset-2">未受領 {view.unreceived}件</button></>
            )}
          </span>
          </>
        )}
        {data && (
          data.report ? (
            <button type="button" onClick={() => setClosing(true)} title="日報を見る・締め直す" className="whitespace-nowrap bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white md:px-3 md:py-1.5 md:text-[13px]">
              ✓ 締め済み
            </button>
          ) : (
            <button type="button" onClick={() => setClosing(true)} title="日報を作る" className="whitespace-nowrap border border-[#3f51b5] bg-white px-2 py-0.5 text-[11px] font-bold text-[#3f51b5] md:border-2 md:px-3 md:py-1 md:text-[13px]">
              締め作業
            </button>
          )
        )}
        <span className="ml-auto flex items-center gap-1 md:gap-2">
          <span ref={setAlarmHost} className="contents" />
          <button type="button" onClick={toggleFold} className="border border-slate-300 bg-white px-4 py-0.5 text-[11px] font-bold text-slate-600 md:py-1 md:text-[12px]">▲ たたむ</button>
        </span>
      </div>

      </>
      )}

      {err && <p className="mb-3 border-l-4 border-rose-500 bg-rose-50 px-3 py-2 text-[13px] font-bold text-rose-700">{err}</p>}
      {/* ★ 第1325便: 共有リストを読めなかったとき（★ 印が出ていなくても「NG ではない」と思いこまないように知らせる） */}
      {data?.groupFailed && data.date === date && (
        <p className="mb-3 border-l-4 border-amber-500 bg-amber-50 px-3 py-2 text-[13px] font-bold text-amber-800">
          {CRM_GROUP_ALERT_SOURCE_LABEL}の共有リストを読めませんでした。予約に印が出ていなくても、NG ではないとは限りません。「画面を更新」を押してください。
        </p>
      )}
      {refreshedAt != null && (
        <div className="pointer-events-none fixed left-1/2 top-16 z-[60] -translate-x-1/2 bg-slate-800/90 px-4 py-2 text-[13px] font-bold text-white shadow-lg">更新しました</div>
      )}
      {(!data || data.date !== date) && !err && <p className="p-6 text-center text-[14px] text-slate-400">読み込み中です…</p>}

      {view && (
        <Grid
          rows={view.rows}
          startMin={view.startMin}
          endMin={view.endMin}
          baseMs={baseMs}
          nowMs={isToday ? nowMs : null}
          pickedId={picked?.id ?? null}
          onPick={setPicked}
          onMemo={setMemoEdit}
          confirms={data?.confirms ?? []}
          onConfirm={(t) => { setConfirmTransport(null); setConfirmFor(t); }}
          workDayOf={(tid) => data?.workDays[tid] ?? null}
          roomBandsOf={(tid) => data?.roomBands?.[tid] ?? null}
          partnerRooms={data?.partnerRooms ?? []}
          roomColorOf={(room) => data?.settings.roomColors[room]}
          toggleDefs={data?.settings.customToggles ?? []}
          date={date}
          castNotifyOn={Boolean(data?.settings.castPayEnabled)}
          nowJump={nowJump}
          onWork={setWorkFor}
          onMoveRow={moveRow}
          endTypeOf={(tid) => data?.workEnds[tid] ?? data?.settings.defaultEndType ?? 'finish'}
          onToggleEnd={toggleEnd}
          onEmpty={async (therapistId, min) => {
            // ★ 休憩の時間は受付しない（第551便）
            const wd = therapistId != null ? data?.workDays[therapistId] : undefined;
            if (wd && wd.breakStartMin != null && wd.breakEndMin != null && min >= wd.breakStartMin && min < wd.breakEndMin) {
              setErr('休憩の時間には予約を入れられません');
              return;
            }
            // ★ 第1669便: 提携店の予約の帯の中なら、一度だけ確認（止めはしない＝両店で受付できる前提）
            if (therapistId != null) {
              const hit = (data?.roomBands?.[therapistId] ?? []).find((bd) => {
                const s = Math.round((new Date(bd.startISO).getTime() - baseMs) / 60000);
                const e = Math.round((new Date(bd.endISO).getTime() - baseMs) / 60000);
                return min >= s && min < e;
              });
              if (hit && !(await appConfirm(`${hit.room} は ${hit.salonName} の予約と重なる時間です。このまま受付しますか？`, { ok: '受付する' }))) return;
            }
            setErr('');
            setPicked(null);
            const first = data?.courses[0];
            setForm({
              mode: 'new',
              therapistKey: therapistId == null ? 'free' : String(therapistId),
              startMin: min,
              courseName: first?.name ?? '',
              courseMin: first?.durationMin ?? 60,
              intervalMin: data?.defaultIntervalMin ?? 0, // ★ 第1361便: 店の既定（45・60 でも選択肢に足して出す）
              customerName: '',
              customerTel: '',
              note: '',
              selIds: [],
              keepItems: [],
              priceAdjust: '',
              payAdjust: '',
              paymentMethod: '',
              payAmounts: {},
            });
          }}
        />
      )}

      {picked && (
        <DetailPanel
          booking={picked}
          therapistName={
            picked.therapistId == null
              ? 'フリー（担当未定）'
              : data?.therapists.find((t) => t.id === picked.therapistId)?.name ?? '(不明)'
          }
          salonId={salonId}
          adminSalonQuery={adminSalonQuery}
          scheduleData={data}
          onClose={() => setPicked(null)}
          onChanged={(b) => { setPicked(b); reload(); }}
          onDone={() => { setPicked(null); reload(); }}
          onEdit={() => {
            const b = picked;
            const span = Math.round((new Date(b.slotEndISO).getTime() - new Date(b.slotStartISO).getTime()) / 60000);
            setForm({
              mode: 'edit',
              bookingId: b.id,
              origTherapistKey: b.therapistId == null ? 'free' : String(b.therapistId),
              origStartMin: minOfDay(b.slotStartISO, baseMs),
              origSpan: span, // ★ 2026-10-09 点検#16: 枠が縮むか伸びるかで、移動と内容の順番を決める
              therapistKey: b.therapistId == null ? 'free' : String(b.therapistId),
              startMin: minOfDay(b.slotStartISO, baseMs),
              courseName: b.courseName,
              courseMin: b.courseMin || span,
              intervalMin: Math.max(0, span - (b.courseMin || span)),
              customerName: b.customerName,
              customerTel: b.customerTel,
              note: b.note,
              ...splitItems(b.items, data?.priceItems ?? [], b.therapistId == null ? null : Number(b.therapistId)),
              priceAdjust: b.priceAdjust ? String(b.priceAdjust) : '',
              payAdjust: b.payAdjust ? String(b.payAdjust) : '',
              paymentMethod: b.paymentMethod,
              payAmounts: payAmountsOf(b),
            });
            setPicked(null);
          }}
        />
      )}

      {workFor && data && (
        <WorkDayDialog
          key={workFor.id}
          therapist={workFor}
          salonId={salonId}
          date={date}
          rooms={data.settings.rooms}
          partnerRooms={data.partnerRooms ?? []}
          toggleDefs={data.settings.customToggles}
          endType={data.workEnds[workFor.id] ?? data.settings.defaultEndType}
          initial={data.workDays[workFor.id] ?? CRM_EMPTY_WORK_DAY}
          onClose={() => setWorkFor(null)}
          onSaved={() => { setWorkFor(null); reload(); }}
          onConfirm={(savedTransport) => { const t = workFor; setWorkFor(null); reload(); setConfirmTransport(savedTransport); setConfirmFor(t); }}
          onToggleEnd={(next) => void toggleEnd(workFor.id, next)}
        />
      )}

      {confirmFor && data && (
        <ConfirmDialog
          key={confirmFor.id}
          transport={confirmTransport ?? data.workDays[confirmFor.id]?.transport ?? 0}
          therapist={confirmFor}
          salonId={salonId}
          date={date}
          baseMs={baseMs}
          bookings={data.bookings.filter((b) => b.therapistId === confirmFor.id)}
          confirm={data.confirms.find((c) => c.therapistId === confirmFor.id) ?? null}
          moneyEnabled={data.settings?.moneyEnabled !== false}
          onClose={() => setConfirmFor(null)}
          onDone={() => { setConfirmFor(null); reload(); }}
        />
      )}

      {closing && (
        <CloseDialog
          salonId={salonId}
          date={date}
          onClose={() => setClosing(false)}
          onDone={() => { setClosing(false); reload(); }}
        />
      )}

      {memoEdit && (
        <MemoDialog
          key={memoEdit.id}
          therapist={memoEdit}
          salonId={salonId}
          onClose={() => setMemoEdit(null)}
          onSaved={() => { setMemoEdit(null); reload(); }}
        />
      )}

      {form && data && (
        <BookingForm
          key={form.bookingId ?? `new-${form.therapistKey}-${form.startMin}`}
          initial={form}
          salonId={salonId}
          baseMs={baseMs}
          therapists={data.therapists}
          courses={data.courses}
          priceItems={data.priceItems}
          dayBookings={data.bookings}
          roomBandsOf={(tid) => data.roomBands?.[tid] ?? []}
          onClose={() => setForm(null)}
          onSaved={() => { setForm(null); reload(); }}
          onSavedKeepOpen={() => reload()}
        />
      )}
    </div>
  );
}
