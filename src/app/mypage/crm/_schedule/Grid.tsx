'use client';

import { useEffect, useRef, useState } from 'react';
import { CRM_CATEGORY_CLASS, CRM_CATEGORY_LABEL, CRM_RECEIVED_LABEL, type CrmReceivedBy, CRM_END_LABEL, type CrmEndType, CRM_ATTENDANCE_LABEL, type CrmRoomBand, type CrmPartnerRoom, roomColor, pickCrmToggleValues, crmToggleBookingColor, type CrmToggle, type CrmWorkDay, inBusinessDay, nominationBadge, CRM_NOMINATION_CLASS, yen, type CrmPayConfirm, type CrmScheduleBooking, type CrmScheduleTherapist } from '@/app/lib/crm/types';
import { castNotifyText } from '@/lib/crmCastNotify';
import { LineShareLink } from '@/app/components/LineShareLink';
import { CRM_GROUP_BADGE_LABEL, crmGroupBadge } from '@/lib/crmGroup';
import { shiftRangeText, shiftNextDayMarks } from '@/lib/scheduleFormat';
import { crmOrdinalLabel } from '@/lib/crmBookingOrdinal';
import { PX_PER_MIN, NAME_W, MEMO_W, ROW_H, FREE_ROWS_MAX, splitFreeLanes, DAY_START_MIN, WINDOW_END_MIN, CLICK_STEP_MIN, hourLabel, hm, useNarrow, type Row } from './shared';

export function Grid({
  rows, startMin, endMin, baseMs, nowMs, pickedId, onPick, onMemo, confirms, onConfirm, workDayOf, roomBandsOf, partnerRooms, roomColorOf, toggleDefs, onWork, onMoveRow, endTypeOf, onToggleEnd, onEmpty, date, castNotifyOn, nowJump,
}: {
  /** ★ 第1410便: 行を上下に動かす（ids … 同じ組の方の id を上から順に） */
  onMoveRow: (ids: number[], therapistId: number, dir: -1 | 1) => void;
  /** いま開いている日（YYYY-MM-DD）。「LINE」で知らせる文面とリンクに使う（第1209便） */
  date: string;
  /** 設定「セラピストへの公開」が ON か。OFF だとセラピストページにスケジュールが出ないので、「LINE」は押せない形で出す（第1209便） */
  castNotifyOn: boolean;
  /** その日の出勤情報（休憩・待機場所・遅刻当欠・交通費） */
  workDayOf: (therapistId: number) => CrmWorkDay | null;
  /** ★ 第1669便: 提携店の予約の帯（同じ部屋） */
  roomBandsOf: (therapistId: number) => CrmRoomBand[] | null;
  partnerRooms: CrmPartnerRoom[];
  /** 部屋の色の名前 */
  roomColorOf: (room: string) => string | undefined;
  /** 出勤情報の自由項目（第597便）。選んだものを名前の下に小さく出す */
  toggleDefs: CrmToggle[];
  /** 名前を押した */
  onWork: (t: CrmScheduleTherapist) => void;
  /** そのセラピストのその日の「受まで／上がり」 */
  endTypeOf: (therapistId: number) => CrmEndType;
  onToggleEnd: (therapistId: number, next: CrmEndType) => void;
  /** ★ 第1218便: 「今」ボタンが押された回数（増えたら赤い線の位置へ横スクロール） */
  nowJump: number;
  rows: Row[];
  startMin: number;
  endMin: number;
  baseMs: number;
  nowMs: number | null;
  pickedId: string | null;
  onPick: (b: CrmScheduleBooking) => void;
  /** 女子メモを押した */
  onMemo: (t: CrmScheduleTherapist) => void;
  confirms: CrmPayConfirm[];
  /** 報酬確定を押した */
  onConfirm: (t: CrmScheduleTherapist) => void;
  /** 空いているところを押した（therapistId: null＝フリー・min: その日0:00からの分） */
  onEmpty: (therapistId: number | null, min: number) => void;
}) {
  // ★ スマホは名前の列を細く・女子メモの列を出さない（名前の下の「メモ」から開く）・時間軸を詰める（第541便）
  // ★ 第575便：スマホも風俗CTIv2 のように女子メモの列を出し、PC と同じ形を小さく（zoom）して1画面に多く並べる
  const narrow = useNarrow();
  const zoom = narrow ? 0.72 : 1;
  // ★ 第1214便（カッキーさん）: スマホは名前の列を広げる（150→186）・女子メモの列を細く（100→64）。名前の列の余白は px-2 → px-1。
  // ★ 第1215便（カッキーさん・本番で確認）: 女子メモが狭すぎた → 女子メモは元の 100px に戻し、名前は 174px（右に余白があった）。
  //   左の固定枠の合計は 250 → 274px（画面上はタイムラインが約17px 狭くなるが、少しなら良いとのこと）。
  // ★ 第1216便（カッキーさん）: 女子メモの列を画面上 17px（zoom 0.72 なので 24px）狭く＝100→76px にして、タイムラインを第1214便の目視幅に戻す。
  //   左の固定枠の合計は 250px。女子メモの空欄の文字はスマホだけ「✎ メモ」。
  // ★ 第1233便（カッキーさん）: PC は名前の列を 150→190px に（そのぶんタイムラインの見える幅は狭くなる）。スマホは第1216便のまま 174px。
  // ★ 第1365便: 待機部屋を名前の行に上げたので、PC の名前の列を 190→174px（第1233便の 190 から少し戻す）。スマホは 174 のまま
  // ★ 第1366便: スマホも 174→156px（画面上は 0.72 倍で 約125→112px）。待機部屋が名前の行に上がって出勤の行が短くなった分
  // ★ 第1367便: 本数を2行目へ移したので、スマホは 150px（画面上 約108px）。PC は 174 のまま
  // ★ 第1673便（カッキーさん）: 名前の列をほんの少し広げる。借りた部屋のバッジ「借 G1011」が入るように
  //   PC +12px（186）／スマホ +4px（154・第1674便 +6 → 第1675便 +4）
  const nameW = narrow ? NAME_W + 4 : NAME_W + 24 + 12;
  // ★ 第1364便（カッキーさん）: 女子メモの列をたためる（見出しの「女子メモ ◀」で閉じる・「女子メモ ▶」で開く）。
  //   閉じると時間軸がそのぶん広がる。既定は開いた状態。この端末だけ覚える
  const [memoOpen, setMemoOpen] = useState<boolean>(() => {
    try { return typeof window === 'undefined' ? true : localStorage.getItem('crm_memo_open') !== '0'; } catch { return true; }
  });
  // ★ 第1785便（カッキーさん）: いちばん上のフリーの行をたためる。既定は出ている。この端末だけ覚える
  const [freeOpen, setFreeOpen] = useState<boolean>(() => {
    try { return typeof window === 'undefined' ? true : localStorage.getItem('crm_free_open') !== '0'; } catch { return true; }
  });
  const toggleFree = () => {
    setFreeOpen((v) => {
      try { localStorage.setItem('crm_free_open', v ? '0' : '1'); } catch { /* 何もしない */ }
      return !v;
    });
  };
  // ★ 第1786便（カッキーさん）: フリーの行は3行まで増やせる（「＋ 行を足す」・この端末だけ覚える）。
  //   担当未定の予約は、時間が重ならないように上の行から順に入れる（重なって入りきらないときは、足りるだけ行を増やす・最大3行）。
  const [freeCount, setFreeCount] = useState<number>(() => {
    try { const n = Number(typeof window === 'undefined' ? 1 : localStorage.getItem('crm_free_rows')); return n >= 1 && n <= FREE_ROWS_MAX ? n : 1; } catch { return 1; }
  });
  const changeFreeCount = (n: number) => {
    const v = Math.max(1, Math.min(FREE_ROWS_MAX, n));
    setFreeCount(v);
    try { localStorage.setItem('crm_free_rows', String(v)); } catch { /* 何もしない */ }
  };
  const toggleMemo = () => {
    setMemoOpen((v) => {
      try { localStorage.setItem('crm_memo_open', v ? '0' : '1'); } catch { /* 何もしない */ }
      return !v;
    });
  };
  const memoW = memoOpen ? (narrow ? 76 : MEMO_W) : 0;
  const leftW = nameW + memoW;
  const ppm = narrow ? 1.1 : PX_PER_MIN;
  const width = (endMin - startMin) * ppm;
  const hours: number[] = [];
  for (let m = startMin; m < endMin; m += 60) hours.push(m / 60);
  const x = (min: number) => (Math.min(Math.max(min, startMin), endMin) - startMin) * ppm;
  const nowMin = nowMs != null ? Math.round((nowMs - baseMs) / 60000) : null;
  const showNow = nowMin != null && nowMin >= startMin && nowMin <= endMin;

  // ★ 開いたとき「今」の赤い線が画面の左 1/3 に来るように横スクロール（第640便・風俗CTIv2 と同じ）。
  //   ★ 日付を変えたときにもう一度。★ 60秒ごとの読み直しでは動かさない（見ている最中にずらさない）。
  //   ★ 第1218便: 日付が変わったら「動かした」の印を消す（前は今日→明日→今日と戻ると今日の印が残っていて動かなかった）。
  //   ★ 「今」ボタン（nowJump が増えたとき）でも同じ位置へ動かす。
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrolledFor = useRef<number | null>(null);
  const jumpToNow = () => {
    const el = scrollRef.current;
    if (!el || !showNow || nowMin == null) return;
    // ★ 2026-10-09 点検#13: 赤い線は「見えている時間軸（左の固定枠を除いた幅）」の左 1/3 に置く。
    //   画面全体の 1/3 だと、スマホ・小さい PC では左の固定枠（名前＋女子メモ）より内側になり、赤線が固定枠の裏に隠れて「今」が効かないように見えた。
    const fixed = leftW * zoom;
    const target = (leftW + x(nowMin)) * zoom - fixed - (el.clientWidth - fixed) / 3;
    el.scrollLeft = Math.max(0, target);
  };
  useEffect(() => {
    if (scrolledFor.current !== baseMs) scrolledFor.current = null;
    if (!showNow || scrolledFor.current === baseMs) return;
    scrolledFor.current = baseMs;
    jumpToNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseMs, showNow]);
  useEffect(() => {
    if (nowJump > 0) jumpToNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nowJump]);

  return (
    <div ref={scrollRef} className="max-h-[calc(100dvh-130px)] overflow-auto border border-slate-300 bg-white md:max-h-[calc(100dvh-170px)]">
      <div className="relative" style={{ width: leftW + width, zoom }}>
        {/* 時間の見出し（上に固定） */}
        <div className="sticky top-0 z-30 flex border-b border-slate-300 bg-slate-50" style={{ height: 30 }}>
          <div className="sticky left-0 z-10 flex flex-none border-r border-slate-300 bg-slate-100 text-[12px] font-bold leading-[30px] text-slate-500" style={{ width: leftW }}>
            <span className={`flex items-center ${narrow ? 'px-1' : 'px-2'}`} style={{ width: nameW }}>
              女子
              {!memoOpen && (
                <button type="button" onClick={toggleMemo} title="女子メモの列を開く" className="ml-auto whitespace-nowrap px-1 text-[11px] font-bold text-amber-700 hover:bg-amber-100">
                  女子メモ ▶
                </button>
              )}
            </span>
            {memoOpen && (
              <button type="button" onClick={toggleMemo} title="女子メモの列を閉じる（時間軸が広がります）" className={`flex items-center whitespace-nowrap border-l border-slate-300 text-left hover:bg-amber-100 ${narrow ? 'px-1' : 'px-2'}`} style={{ width: memoW }}>
                {/* ★ 第1979便: スマホで「女子メ／モ」と2行に折れていた → 折り返さない・スマホは左右の余白を詰める */}
                女子メモ<span className="ml-auto pl-0.5 text-[11px] text-amber-700">◀</span>
              </button>
            )}
          </div>
          {hours.map((h) => (
            <div key={h} className="flex-none border-r border-slate-200 pl-1.5 text-[13px] font-bold leading-[30px] text-slate-600" style={{ width: 60 * ppm }}>
              {hourLabel(h)}
            </div>
          ))}
        </div>

        {/* ★ 行の hover:z-[25]：女子メモの全文（第643便）が下の行の名前の列に隠れないように（見出しの z-30 より下） */}
        {(() => {
          // ★ 第1786便: フリーの行を、開いているときは freeCount 行（予約が重なればそれ以上・最大3行）に分ける
          const freeRow = rows.find((x) => x.key === 'free');
          if (!freeRow || !freeOpen) return rows;
          const lanes = splitFreeLanes(freeRow.bookings, freeCount);
          return [...lanes, ...rows.filter((x) => x.key !== 'free')];
        })().map((r, _i, shown) => r.key === 'free' && !freeOpen ? (
          // ★ 第1785便: たたんだフリーの行（細い1行。押すと開く）
          <div key={r.key} className="relative flex border-b border-slate-200 bg-amber-50/50" style={{ height: 28 }}>
            <div className="sticky left-0 z-20 flex flex-none items-center border-r border-slate-300 bg-amber-50" style={{ width: leftW }}>
              <button type="button" onClick={toggleFree} title="フリーの行を開く" className="flex h-full w-full items-center gap-1.5 px-2 text-left hover:bg-amber-100">
                <span className="text-[11px] text-amber-700">▶</span>
                <span className="text-[13px] font-black text-amber-600">フリー</span>
                {r.bookings.filter((b) => b.status !== 'cancelled').length > 0 && (
                  <span className="bg-amber-500 px-1.5 text-[11px] font-black leading-[16px] text-white">{r.bookings.filter((b) => b.status !== 'cancelled').length}件</span>
                )}
              </button>
            </div>
            <div className="flex-none" style={{ width }} />
          </div>
        ) : (
          <div key={r.key} className={`relative flex border-b hover:z-[25] ${r.done ? 'border-slate-300' : 'border-slate-200'}`} style={{ height: ROW_H }}>
            {/* 名前と女子メモ（左に固定） */}
            <div className={`sticky left-0 z-20 flex flex-none border-r border-slate-300 ${r.done ? 'bg-slate-300' : 'bg-white'}`} style={{ width: leftW }}>
            <div className={`flex flex-none flex-col justify-center ${narrow ? 'px-1' : 'px-2'}`} style={{ width: nameW }}>
              {r.therapist ? (
                <>
                  <p className="flex items-center gap-1 leading-[20px]">
                    {/* ★ 名前を押すと「出勤情報」（第550便） */}
                    <button type="button" onClick={() => onWork(r.therapist!)} className="truncate text-left text-[15px] font-black text-[#3f51b5] underline decoration-dotted underline-offset-2 hover:text-indigo-800">
                      {r.therapist.name}
                    </button>
                    {/* ★★ 第1209便（カッキーさん）: 予約や待機部屋などを更新したことを、その子へ LINE で知らせるボタン。
                        ★ 押すと、文面（更新しました＋セラピストページのスケジュールへのリンク）が入った LINE の送る画面が開く。送り先は LINE の画面で選ぶ。
                        ★ 文面とリンクは src/lib/crmCastNotify.ts。★ 予約の中身・お客様の名前は文面に入れない。
                        ★ 「セラピストへの公開」が OFF の店は、開いてもスケジュールが出ないので押せない形にする（理由は title に）。 */}
                    {castNotifyOn ? (
                      // ★ 第1791便: PC は LINE の送る画面が開けないので、文面をコピーして貼り付けてもらう（LineShareLink）
                      <LineShareLink
                        text={castNotifyText(r.therapist.name, date)}
                        title="予定を更新したことを LINE で知らせる（送り先は LINE の画面で選びます）"
                        className="flex-none bg-[#06c755] px-1 text-[10px] font-black leading-[16px] text-white hover:opacity-85"
                      >
                        LINE
                      </LineShareLink>
                    ) : (
                      <span
                        title="設定の「女子への公開」を ON にすると、LINE で知らせるボタンが使えます"
                        className="flex-none cursor-not-allowed bg-slate-300 px-1 text-[10px] font-black leading-[16px] text-white"
                      >
                        LINE
                      </span>
                    )}
                    {/* ★ 第1365便（カッキーさん）: 待機部屋のバッジは名前の行（LINE の右）に。出勤の行は 時刻・出欠・自由項目だけ */}
                    {(() => {
                      const wdr = workDayOf(r.therapist!.id);
                      const room = wdr?.room;
                      if (!room) return null;
                      // ★ 第1669便: 借りた部屋は「店名／部屋」を灰色で（自店の部屋の色は使わない）
                      if (wdr?.roomSalonId != null) {
                        const pn = partnerRooms.find((p) => p.salonId === wdr.roomSalonId)?.salonName ?? '提携店';
                        // ★ 第1671便（カッキーさん）: 店名を入れると長すぎて名前が消えた → バッジは「借 部屋名」だけ。店名は title（マウスを乗せる）で
                        return <span className="max-w-[96px] flex-none truncate border border-slate-400 bg-slate-100 px-1 text-[10px] font-bold leading-[16px] text-slate-700" title={`${pn} の部屋を借りています`}>借 {room}</span>;
                      }
                      const c = roomColor(roomColorOf(room));
                      return <span className="flex-none truncate px-1 text-[10px] font-bold leading-[16px]" style={{ background: c.bg, color: c.fg, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.25)' }}>{room}</span>;
                    })()}
                  </p>
                  {/* ★ 第1369便: 出勤時刻と本数は必ず全部出す（flex-none・折り返さない）。幅が足りないときはバッジの側が切れる（前は時刻が「11:00…」と切れた） */}
                  <p className="flex items-center gap-1 overflow-hidden text-[12px] font-bold leading-[16px] text-slate-600">
                    <span className="flex-none whitespace-nowrap">
                      {r.therapist.schedules.length > 0
                        ? r.therapist.schedules.map((w) => shiftRangeText(w.start, w.end, '-')).join(' / ')
                        : '出勤なし'}
                      {/* ★ 第1367便: 本数はここ（3行目は「報酬 ¥100,000 確定」だけにして、6桁でも折れないように） */}
                      <span className="ml-1 font-normal text-slate-500">{r.bookings.filter((b) => b.status !== 'cancelled' && inBusinessDay(Math.round((new Date(b.slotStartISO).getTime() - baseMs) / 60000))).length}本</span>
                    </span>
                    {(() => {
                      const wd = workDayOf(r.therapist!.id);
                      if (!wd) return null;
                      return (
                        <>
                          {wd.attendance && (
                            // ★ 第1368便: スマホは1文字（遅・欠・休）。色は今までどおり。PC は全文
                            <span title={CRM_ATTENDANCE_LABEL[wd.attendance]} className={`flex-none px-1 text-[10px] font-bold text-white ${wd.attendance === 'late' ? 'bg-amber-500' : 'bg-rose-600'}`}>
                              {narrow ? CRM_ATTENDANCE_LABEL[wd.attendance].slice(0, 1) : CRM_ATTENDANCE_LABEL[wd.attendance]}
                            </span>
                          )}
                          {pickCrmToggleValues(toggleDefs, wd.toggles).map((tv) => (
                            // ★ 第1368便: スマホは3文字まで（「掛け持ち」→「掛け持…」）。PC は 96px まで
                            <span key={tv.title} title={`${tv.title}：${tv.value}`} className={`min-w-0 shrink truncate border border-violet-300 bg-violet-50 px-1 text-[10px] font-bold text-violet-700 ${narrow ? 'max-w-[44px]' : 'max-w-[96px]'}`}>
                              {narrow && tv.value.length > 3 ? `${tv.value.slice(0, 3)}…` : tv.value}
                            </span>
                          ))}
                        </>
                      );
                    })()}
                  </p>
                  {(() => {
                    // ★ 報酬と確定は【営業日（6:00〜翌6:00に始まる予約）】で数える（サーバーの確定と同じ決まり）
                    const mine = r.bookings.filter((b) => b.status !== 'cancelled' && inBusinessDay(Math.round((new Date(b.slotStartISO).getTime() - baseMs) / 60000)));
                    const pay = mine.reduce((a, b) => a + (b.payTotal ?? 0), 0);
                    const cf = confirms.find((c) => c.therapistId === r.therapist!.id);
                    const changed = cf && (cf.payTotal !== pay || cf.bookingCount !== mine.length);
                    return (
                      <div className="flex h-[22px] items-center gap-1 whitespace-nowrap text-[12px] text-slate-500">{/* ★ 2026-10-09 点検（レイアウト）: 11px→12px・高さ22px。★ 第1367便: 本数は2行目へ・折り返さない */}
                        {cf ? (
                          <button
                            type="button"
                            onClick={() => onConfirm(r.therapist!)}
                            title={changed ? '確定のあとに予約が変わっています（押して確定し直し）' : '報酬確定済み（押すと内容・取り消し）'}
                            className={`min-h-[20px] px-1.5 font-bold text-white ${changed ? 'bg-amber-500' : 'bg-emerald-600'}`}
                          >
                            {changed ? '⚠変更あり' : '✓確定'} {yen(cf.payTotal + cf.allowance)}
                          </button>
                        ) : (
                          <>
                            <span className="bg-cyan-50 px-1 font-bold text-slate-700">報酬 {yen(pay)}</span>
                            <button type="button" onClick={() => onConfirm(r.therapist!)} className={`min-h-[20px] bg-[#3f51b5] font-bold text-white ${narrow ? 'px-1' : 'px-1.5'}`}>確定</button>
                          </>
                        )}
                        {/* ★ 第1410便（ラビリンス様のご要望）: 並べ替え ▲▼（同じ組＝確定していない方どうし／確定した方どうし）。決めた順はコネックエフのセラピスト一覧にも効く。
                            ★ 第1411便: 1行目（名前の行）だとスマホで名前が「な…」まで縮んだので、いちばん空いている3行目の右端へ移した */}
                        {(() => {
                          const ids = rows.filter((x) => x.therapist && !!x.done === !!r.done).map((x) => x.therapist!.id);
                          if (ids.length < 2) return null;
                          const i = ids.indexOf(r.therapist!.id);
                          // ★ 第1980便: 第1976便で横並び 22×22px に大きくしたが、報酬が5桁になると右にはみ出し、当欠などの札にも被った → 元の大きさ（縦に重ねた 14×10px）に戻した（カッキーさん）
                          const btn = 'block h-[10px] w-[14px] text-[8px] leading-[10px] text-slate-500 hover:bg-indigo-100 hover:text-indigo-700 disabled:opacity-25 disabled:hover:bg-transparent';
                          return (
                            <span className="ml-auto flex flex-none flex-col border border-slate-300 bg-white">
                              <button type="button" aria-label="上へ" title="上へ" disabled={i <= 0} onClick={() => onMoveRow(ids, r.therapist!.id, -1)} className={btn}>▲</button>
                              <button type="button" aria-label="下へ" title="下へ" disabled={i >= ids.length - 1} onClick={() => onMoveRow(ids, r.therapist!.id, 1)} className={btn}>▼</button>
                            </span>
                          );
                        })()}
                      </div>
                    );
                  })()}
                </>
              ) : (
                (() => {
                  // ★ 第1786便: フリーの行が何本目か・最後の行か（足す／消すボタン）
                  const lanes = shown.filter((x) => x.therapist == null);
                  const idx = lanes.findIndex((x) => x.key === r.key);
                  const last = idx === lanes.length - 1;
                  const btn = 'border border-amber-400 bg-white px-1 text-[10px] font-bold leading-[16px] text-amber-700 hover:bg-amber-50 disabled:opacity-40';
                  return (
                    <>
                      {idx === 0 ? (
                        // ★ 第1785便: 押すとたたむ
                        <button type="button" onClick={toggleFree} title="フリーの行をたたむ" className="flex items-center gap-1 text-left leading-[20px] hover:opacity-80">
                          <span className="text-[11px] text-amber-700">▼</span>
                          <span className="text-[15px] font-black text-amber-600">フリー</span>
                        </button>
                      ) : (
                        <p className="text-[15px] font-black leading-[20px] text-amber-600">フリー{idx + 1}</p>
                      )}
                      <p className="text-[11px] leading-[14px] text-slate-400">担当未定の予約</p>
                      {last && (
                        <p className="mt-0.5 flex gap-1">
                          {lanes.length < FREE_ROWS_MAX && (
                            <button type="button" onClick={() => changeFreeCount(lanes.length + 1)} className={btn} title="フリーの行を1つ足す（3行まで）">＋ 行を足す</button>
                          )}
                          {idx > 0 && (
                            <button type="button" disabled={r.bookings.length > 0} onClick={() => changeFreeCount(lanes.length - 1)} className={btn}
                              title={r.bookings.length > 0 ? '予約が入っている行は消せません' : 'この行を消す'}>− 消す</button>
                          )}
                        </p>
                      )}
                    </>
                  );
                })()
              )}
            </div>
            {/* 女子メモ（押すと書ける・お店の内部メモ）。★ 第1364便: 列をたたんでいるときは出さない */}
            {!memoOpen ? null : r.therapist ? (
              // ★ 女子メモ：ホバーで全文を浮かせて出す（第643便・風俗CTIv2 と同じ）。★ 押すと書ける（今までどおり）
              <div className="group relative flex-none" style={{ width: memoW }}>
              <button
                type="button"
                onClick={() => onMemo(r.therapist!)}
                title={r.therapist.memo ? undefined : '女子メモを書く'}
                className="h-full w-full overflow-hidden border-l border-slate-200 bg-amber-50/40 px-2 py-1 text-left hover:bg-amber-100"
              >
                {r.therapist.memo ? (
                  <p className="line-clamp-4 whitespace-pre-line text-[12px] leading-[1.3] text-slate-700">{r.therapist.memo}</p>
                ) : (
                  // ★ 薄すぎて見つけられなかった（2026-09-19）→ 枠つきのボタンに見える形に
                  <span className="inline-block whitespace-nowrap border border-dashed border-amber-400 bg-amber-50 px-1 py-0.5 text-[11px] font-bold text-amber-700">{narrow ? '✎ メモ' : '✎ メモを書く'}</span>
                )}
              </button>
              {r.therapist.memo && (
                <div className="pointer-events-none invisible absolute left-0 top-full z-50 w-[320px] max-w-[80vw] whitespace-pre-line border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] leading-relaxed text-slate-800 shadow-xl group-hover:visible">
                  <p className="mb-1 text-[11px] font-bold text-amber-700">女子メモ（押すと書き直せます）</p>
                  {r.therapist.memo}
                </div>
              )}
              </div>
            ) : (
              <div className="flex-none border-l border-slate-200 bg-slate-50" style={{ width: memoW }} />
            )}
            </div>

            {/* 時間の中身（空いているところを押すと受付） */}
            <div
              className={`relative flex-none cursor-copy ${r.done ? 'bg-slate-300/70' : ''}`}
              style={{ width }}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                // ★ zoom しているときは画面上の幅が縮むので、その割合で戻す（第575便）
                const scale = rect.width > 0 ? rect.width / width : 1;
                const min = startMin + (e.clientX - rect.left) / (ppm * scale);
                // ★ 第647便：切り捨てではなく近い15分に（1:12 → 1:15、1:07 → 1:00）
                const snapped = Math.round(min / CLICK_STEP_MIN) * CLICK_STEP_MIN;
                onEmpty(r.therapist ? r.therapist.id : null, Math.max(DAY_START_MIN, Math.min(snapped, WINDOW_END_MIN - CLICK_STEP_MIN)));
              }}
            >
              {/* 1時間ごとの線 */}
              {hours.map((h) => (
                <div key={h} className="pointer-events-none absolute top-0 bottom-0 border-r border-slate-100" style={{ left: (h * 60 - startMin + 60) * ppm - 1 }} />
              ))}
              {/* 出勤の帯 */}
              {r.therapist?.schedules.map((w, i) => {
                const s = Math.round((new Date(w.startISO).getTime() - baseMs) / 60000);
                const e = Math.round((new Date(w.endISO).getTime() - baseMs) / 60000);
                // ★ 第1233便（カッキーさん）: 「受まで／上がり」のバッジは、出勤の終わりの【次のマス】（帯の右の外側）に出す。
                //   終わりが時間軸の右端（営業時間の終わり）で、その先にマスが無いときは今までどおり帯の中の右端。
                const tid = r.therapist!.id;
                const et = endTypeOf(tid);
                const outside = e < endMin;
                return (
                  <div key={i} className="contents">
                    <div className="pointer-events-none absolute top-0 bottom-0 bg-pink-100/70" style={{ left: x(s), width: Math.max(0, x(e) - x(s)) }} />
                    {/* ★ 終わりの時刻に「受まで／上がり」（押すとその日だけ切り替え・第548便） */}
                    <button
                      type="button"
                      onClick={(ev) => { ev.stopPropagation(); onToggleEnd(tid, et === 'accept' ? 'finish' : 'accept'); }}
                      title="押すと「受まで」と「上がり」を切り替えます"
                      className={`absolute top-0.5 z-[8] flex items-center gap-0.5 whitespace-nowrap border px-1 text-[10px] font-bold leading-[14px] ${
                        et === 'accept' ? 'border-orange-400 bg-orange-50 text-orange-700' : 'border-pink-400 bg-white text-pink-600'
                      }`}
                      style={outside ? { left: x(e) + 3 } : { left: Math.max(x(s), x(e) - 2), transform: 'translateX(-100%)' }}
                    >
                      {CRM_END_LABEL[et]} {shiftNextDayMarks(w.start, w.end).end ? `翌${Number(w.end.slice(0, 2))}:${w.end.slice(3, 5)}` : w.end}
                    </button>
                  </div>
                );
              })}
              {/* 休憩（白い帯・第550便） */}
              {r.therapist && (() => {
                const wd = workDayOf(r.therapist.id);
                if (!wd || wd.breakStartMin == null || wd.breakEndMin == null) return null;
                const fmt = (m: number) => `${m >= 1440 ? '翌' : ''}${Math.floor(m / 60) % 24}:${String(m % 60).padStart(2, '0')}`;
                return (
                  <div
                    className="pointer-events-none absolute top-1 bottom-1 z-[6] overflow-hidden border border-slate-300 bg-white/95 px-1 text-[11px] leading-tight text-slate-600"
                    style={{ left: x(wd.breakStartMin), width: Math.max(0, x(wd.breakEndMin) - x(wd.breakStartMin)) }}
                  >
                    <p className="truncate font-bold">休憩({fmt(wd.breakStartMin)}-{fmt(wd.breakEndMin)})</p>
                    {wd.breakMemo && <p className="truncate">{wd.breakMemo}</p>}
                  </div>
                );
              })()}
              {/* ★ 第1669便: 提携店の予約の帯（同じ部屋を使う相手の店の予約の時間帯・見た目だけで受付は止めない） */}
              {r.therapist && (roomBandsOf(r.therapist.id) ?? []).map((bd, i) => {
                const s = Math.round((new Date(bd.startISO).getTime() - baseMs) / 60000);
                const e = Math.round((new Date(bd.endISO).getTime() - baseMs) / 60000);
                if (e <= s) return null;
                return (
                  <div
                    key={`rb-${i}`}
                    className="pointer-events-none absolute top-1 bottom-1 z-[5] overflow-hidden border border-dashed border-amber-500 bg-amber-50/90 px-1 text-[11px] leading-tight text-amber-800"
                    style={{ left: x(s), width: Math.max(0, x(e) - x(s)) }}
                    title={`${bd.room}：${bd.salonName} の予約と同じ部屋`}
                  >
                    <p className="truncate font-bold">{bd.room} 使用中</p>
                    <p className="truncate">{bd.salonName}</p>
                  </div>
                );
              })}
              {/* 予約 */}
              {r.bookings.map((b) => {
                const s = Math.round((new Date(b.slotStartISO).getTime() - baseMs) / 60000);
                const e = Math.round((new Date(b.slotEndISO).getTime() - baseMs) / 60000);
                return (
                  <BookingCard
                    key={b.id}
                    b={b}
                    left={x(s)}
                    width={Math.max(24, x(e) - x(s))}
                    picked={pickedId === b.id}
                    ng={r.therapist != null && (b.customer?.ngTherapistIds.includes(r.therapist.id) ?? false)}
                    toggleColor={r.therapist ? crmToggleBookingColor(toggleDefs, workDayOf(r.therapist.id)?.toggles) : null}
                    onPick={() => onPick(b)}
                  />
                );
              })}
            </div>
          </div>
        ))}

        {/* 今の時刻（赤い線） */}
        {showNow && (
          <div
            className="pointer-events-none absolute bottom-0 z-[15] w-0.5 bg-red-500"
            style={{ left: leftW + (nowMin! - startMin) * ppm, top: 30 }}
          />
        )}
      </div>
    </div>
  );
}

export function BookingCard({
  b, left, width, picked, ng, onPick, toggleColor,
}: {
  b: CrmScheduleBooking;
  left: number;
  width: number;
  picked: boolean;
  ng: boolean;
  onPick: () => void;
  /** 出勤情報の項目（追加）で選んだ選択肢の色（第638便）。★ 背景だけ変える（枠の色＝未確定／確定の見分けは残す） */
  toggleColor?: { bg: string; border: string } | null;
}) {
  const cancelled = b.status === 'cancelled';
  const c = b.customer;
  const groupBadge = cancelled ? null : crmGroupBadge(b.groupHits);
  // ★ 色分け（第643便・風俗CTIv2 にならう）：受領済＝終わった予約はグレー寄り（一目で「済み」）・入室済＝枠を太く（いま部屋にいる）
  //   ★ 未確定（ピンク枠）／確定（水色枠）の見分けは残す。★ 受領済は第638便の背景色（出勤情報の色）より優先
  const received = !cancelled && !!b.receivedBy;
  const entered = !cancelled && !received && b.playStatus === 'entered';
  const tone = cancelled
    ? 'bg-slate-100 text-slate-400 border-slate-300'
    : received
      ? 'bg-slate-100 text-slate-500 border-slate-400'
      : b.status === 'new'
        ? 'bg-pink-50 text-slate-800 border-pink-400'
        : 'bg-cyan-50 text-slate-800 border-cyan-400';
  return (
    <button
      type="button"
      data-bid={b.id}
      onClick={(e) => { e.stopPropagation(); onPick(); }}
      title={`${hm(b.slotStartISO)}-${hm(b.slotEndISO)} ${c?.name || b.customerName}`}
      className={`absolute top-1 bottom-1 overflow-hidden border px-1 text-left leading-tight shadow-sm ${tone} ${
        entered ? '!border-[3px] !border-amber-500' : ''
      } ${
        ng && !cancelled ? '!border-2 !border-rose-600' : ''
      } ${picked ? 'ring-2 ring-[#3f51b5]' : ''} ${cancelled ? 'z-[5]' : 'z-10'}`}
      style={{ left, width, ...(toggleColor && !cancelled && !received ? { background: toggleColor.bg } : {}) }}
    >
      <p className="truncate text-[12px] font-black">
        {hm(b.slotStartISO)}-{hm(b.slotEndISO)}
        {/* ★ 第647便：「（80分）」だと切れるので、小さく「80分」 */}
        {b.courseMin ? <span className="ml-1 text-[10px] font-bold text-slate-500">{b.courseMin}分</span> : null}
      </p>
      <p className="flex items-center gap-1 truncate text-[12px]">
        {cancelled && <span className={`px-1 text-[10px] font-bold text-white ${b.cancelBad ? 'bg-rose-600' : 'bg-slate-400'}`}>{b.cancelBad ? '悪質' : 'ｷｬﾝｾﾙ'}</span>}
        {/* フクエスのネット予約（第556便）：仮で枠が埋まるので担当が見分けられるように。キャンセルでも出す */}
        {b.source === 'web' && <span className="border border-pink-500 bg-white px-1 text-[10px] font-bold text-pink-600">ﾌｸｴｽ</span>}
        {!cancelled && b.status === 'new' && <span className="bg-pink-500 px-1 text-[10px] font-bold text-white">未確定</span>}
        {!cancelled && b.playStatus === 'address_sent' && <span className="bg-blue-600 px-1 text-[10px] font-bold text-white">住所送済</span>}
        {!cancelled && b.playStatus === 'entered' && <span className="bg-yellow-300 px-1 text-[10px] font-bold text-slate-900">入室済</span>}
        {!cancelled && b.consentAt && <span className="bg-violet-600 px-1 text-[10px] font-bold text-white" title="同意書を了承済み">了承済</span>}
        {!cancelled && b.receivedBy && (
          <span className="bg-emerald-600 px-1 text-[10px] font-bold text-white" title={CRM_RECEIVED_LABEL[b.receivedBy as CrmReceivedBy] ?? ''}>
            受領済{b.receivedBy === 'therapist' ? '(女)' : b.receivedBy === 'shop' ? '(店)' : ''}
          </span>
        )}
        {/* ★ 第1454便: お客様がフクエスポイントを使った（フクエス負担・お客様から受け取る額が少なくなる） */}
        {!cancelled && b.pointsYen > 0 && (
          <span className="bg-orange-500 px-1 text-[10px] font-bold text-white" title={`フクエスポイント −${b.pointsYen.toLocaleString()}円（フクエス負担）`}>Pt−{b.pointsYen.toLocaleString()}</span>
        )}
        {(() => {
          const nb = nominationBadge(b.items);
          if (!nb) return null;
          return <span className={`px-1 text-[10px] font-bold ${CRM_NOMINATION_CLASS[nb]}`}>{nb}</span>;
        })()}
        {/* ★ 「一般」は出さない（枠の場所をとるため・2026-09-19 カッキーさんの指示）。★ 第1742便: 分類は一般・出禁の2つ → 出禁だけ */}
        {c && c.category !== 'general' && <span className={`border px-1 text-[10px] font-bold leading-none ${CRM_CATEGORY_CLASS[c.category]}`}>{CRM_CATEGORY_LABEL[c.category]}</span>}
        {/* ★ 第1514便: 1件目の予約（キャンセル込み・入れた順）は「新規」。紫＝ほかのバッジと色を重ねない */}
        {b.ordinal === 1 && <span className="flex-none bg-violet-600 px-1 text-[10px] font-bold text-white">新規</span>}
        <span className="truncate font-bold">{c?.name || b.customerName || '(名前なし)'}</span>
      </p>
      <p className="flex items-center gap-1 truncate text-[11px]">
        {ng && !cancelled && <span className="bg-rose-600 px-1 font-bold text-white">女子NG</span>}
        {c?.cautionMemo && <span className="bg-rose-100 px-1 font-bold text-rose-700">要注意</span>}
        {/* ★ 第1325便: グループ・提携店の共有リストに当たった印（★ 出した店の名前は出さない。受けるかは店が決める） */}
        {groupBadge && <span className={groupBadge === 'ng' ? 'flex-none bg-rose-700 px-1 font-bold text-white' : 'flex-none bg-amber-400 px-1 font-bold text-slate-900'}>{CRM_GROUP_BADGE_LABEL[groupBadge]}</span>}
        {b.priceTotal != null && <span className="font-bold text-slate-700">{yen(b.priceTotal)}</span>}
        {/* ★ 第1514便: 「利用◯」（来店回数）→「◯回目」（キャンセル込みの予約の順番）。1件目は上の「新規」。台帳の利用◯回は来店回数のまま */}
        {b.ordinal != null && b.ordinal > 1 && <span className="text-slate-500">{crmOrdinalLabel(b.ordinal)}</span>}
        <span className="truncate text-slate-500">{b.courseName}</span>
      </p>
    </button>
  );
}
