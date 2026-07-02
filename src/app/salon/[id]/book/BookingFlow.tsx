'use client';

import { useState } from 'react';
import {
  getTherapistScheduleDays,
  getSlots,
  createBooking,
  type BookableTherapist,
  type BookingCourse,
  type ScheduleDay,
} from '@/app/actions/booking';
import type { Slot } from '@/app/lib/booking/slots';
import { getBusinessDateJST } from '@/lib/dutyStatus';
import { CALLBACK_PREF_OPTIONS, callbackPrefLabel } from '@/app/lib/booking/callbackPref';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

// "YYYY-MM-DD" → "M/D(曜)"。日付文字列を直接分解し曜日は UTC 正午基準で算出（ブラウザTZ非依存）。
function formatDateTab(dateStr: string, isToday: boolean): { md: string; wd: string; today: boolean } {
  const [y, m, d] = dateStr.split('-').map(Number);
  const wdIndex = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return {
    md: `${m}/${d}`,
    wd: WEEKDAYS[wdIndex],
    today: isToday,
  };
}

// slotのラベル "HH:MM" から "時"（先頭2桁）を取り出す。
function hourOf(label: string): string {
  return label.slice(0, 2);
}

type Step = 'therapist' | 'course' | 'date' | 'time' | 'info' | 'confirm' | 'done';

export function BookingFlow({
  salonId,
  salonName,
  phone,
  courses,
  therapists,
}: {
  salonId: number;
  salonName: string;
  phone: string | null;
  courses: BookingCourse[];
  therapists: BookableTherapist[];
}) {
  const [step, setStep] = useState<Step>('therapist');
  // 「今日」ラベルは営業日基準の当日と一致する日付にのみ付ける（出勤の無い当日でも誤表示しない）。
  const businessToday = getBusinessDateJST(0);

  const [therapist, setTherapist] = useState<BookableTherapist | null>(null);
  const [course, setCourse] = useState<BookingCourse | null>(null);
  const [days, setDays] = useState<ScheduleDay[]>([]);
  const [daysLoading, setDaysLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);

  const [customerName, setCustomerName] = useState('');
  const [customerTel, setCustomerTel] = useState('');
  const [callbackPref, setCallbackPref] = useState('none');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // ── ステップ遷移ハンドラ ──
  const chooseTherapist = async (t: BookableTherapist) => {
    setTherapist(t);
    setCourse(null);
    setSelectedDate(null);
    setSelectedSlot(null);
    setStep('course');
  };

  const chooseCourse = (c: BookingCourse) => {
    setCourse(c);
    setSelectedDate(null);
    setSelectedSlot(null);
    setStep('date');
    // セラピストの出勤日を取得。
    if (therapist) {
      setDaysLoading(true);
      getTherapistScheduleDays(therapist.id)
        .then((d) => setDays(d))
        .finally(() => setDaysLoading(false));
    }
  };

  const chooseDate = async (date: string) => {
    if (!therapist || !course) return;
    setSelectedDate(date);
    setSelectedSlot(null);
    setStep('time');
    setSlotsLoading(true);
    try {
      const s = await getSlots(therapist.id, date, course.durationMin);
      setSlots(s);
    } finally {
      setSlotsLoading(false);
    }
  };

  const reloadSlots = async () => {
    if (!therapist || !course || !selectedDate) return;
    setSlotsLoading(true);
    try {
      const s = await getSlots(therapist.id, selectedDate, course.durationMin);
      setSlots(s);
    } finally {
      setSlotsLoading(false);
    }
  };

  const chooseSlot = (slot: Slot) => {
    if (slot.state !== 'open') return;
    setSelectedSlot(slot);
    setStep('info');
  };

  const goToConfirm = () => {
    setFormError('');
    if (!customerName.trim()) {
      setFormError('お名前を入力してください');
      return;
    }
    if (!/^[\d\-]{6,20}$/.test(customerTel.trim())) {
      setFormError('電話番号は数字とハイフンで正しく入力してください');
      return;
    }
    setStep('confirm');
  };

  const submit = async () => {
    if (!therapist || !course || !selectedSlot) return;
    setSubmitting(true);
    setSubmitError('');
    const res = await createBooking({
      salonId,
      therapistId: therapist.id,
      courseName: course.name,
      courseMin: course.durationMin,
      slotStartISO: selectedSlot.startISO,
      customerName: customerName.trim(),
      customerTel: customerTel.trim(),
      note: note.trim(),
      callbackPref,
    });
    setSubmitting(false);

    if (res.ok) {
      setStep('done');
      return;
    }
    if (res.error === 'slot_taken') {
      setSubmitError('申し訳ありません。その枠は直前に埋まりました。別の時間をお選びください。');
      setSelectedSlot(null);
      await reloadSlots();
      setStep('time');
      return;
    }
    if (res.error === 'disabled') {
      setSubmitError('この店舗は現在ネット予約を受け付けていません。');
      return;
    }
    setSubmitError('予約内容に不備があります。最初からやり直してください。');
  };

  // ── 表示用ヘルパー ──
  const brandGrad = 'linear-gradient(to right,#FB923C,#DB2777)';
  const cardCls = 'rounded-2xl border border-slate-100 shadow-sm p-5 bg-white';
  const selectedSlotLabel = selectedSlot
    ? (() => {
        const day = selectedDate ? formatDateTab(selectedDate, false) : null;
        return day ? `${day.md}(${day.wd}) ${selectedSlot.label}〜` : selectedSlot.label;
      })()
    : '';

  // 直前ガードで弾かれた（openが1つも無い）とき、TEL枠があるか。
  const hasAnyOpen = slots.some((s) => s.state === 'open');
  const visibleSlots = slots.filter((s) => s.state !== 'past');
  // 時グループ化（表示用）。
  const slotsByHour: { hour: string; items: Slot[] }[] = [];
  for (const s of visibleSlots) {
    const h = hourOf(s.label);
    const g = slotsByHour.find((x) => x.hour === h);
    if (g) g.items.push(s);
    else slotsByHour.push({ hour: h, items: [s] });
  }

  return (
    <div className="space-y-4">
      {/* ステップインジケータ（簡易） */}
      {step !== 'done' && (
        <StepIndicator step={step} />
      )}

      {/* 直前予約についての固定案内（フリー予約は電話へ） */}
      {step !== 'done' && (
        <p className="text-[11px] text-slate-400 leading-relaxed text-center">
          ネット予約は「指名予約」のみです。フリー（指名なし）ご希望の場合はお電話ください
          {phone && <>（<a href={`tel:${phone}`} className="text-pink-500 font-bold underline">{phone}</a>）</>}。
        </p>
      )}

      {submitError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 leading-relaxed">
          {submitError}
        </div>
      )}

      {/* ── STEP 1: セラピスト選択 ── */}
      {step === 'therapist' && (
        <div className={cardCls}>
          <SectionTitle>1. セラピストを選ぶ（指名）</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
            {therapists.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => chooseTherapist(t)}
                className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 p-3 hover:border-pink-300 hover:bg-pink-50/40 transition-colors"
              >
                {t.profileImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={t.profileImageUrl}
                    alt={t.name}
                    className="w-16 h-16 rounded-full object-cover bg-slate-100"
                  />
                ) : (
                  <span className="w-16 h-16 rounded-full bg-pink-50 text-pink-400 flex items-center justify-center text-xl font-black">
                    {t.name.slice(0, 1)}
                  </span>
                )}
                <span className="text-xs font-bold text-slate-700 text-center break-words">{t.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── STEP 2: コース選択 ── */}
      {step === 'course' && (
        <div className={cardCls}>
          <BackBar onBack={() => setStep('therapist')} label={`指名：${therapist?.name ?? ''}`} />
          <SectionTitle>2. コースを選ぶ</SectionTitle>
          <div className="space-y-2 mt-3">
            {courses.map((c, i) => (
              <button
                key={`${c.name}-${i}`}
                type="button"
                onClick={() => chooseCourse(c)}
                className="w-full flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-4 hover:border-pink-300 hover:bg-pink-50/40 transition-colors text-left"
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-700 break-words">{c.name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{c.durationMin}分</p>
                </div>
                {c.price && <span className="text-sm font-bold text-pink-600 flex-shrink-0">{c.price}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── STEP 3: 日付選択 ── */}
      {step === 'date' && (
        <div className={cardCls}>
          <BackBar onBack={() => setStep('course')} label={`${therapist?.name ?? ''}／${course?.name ?? ''}（${course?.durationMin}分）`} />
          <SectionTitle>3. 日付を選ぶ</SectionTitle>
          {daysLoading ? (
            <p className="text-xs text-slate-400 mt-3">出勤日を読み込み中...</p>
          ) : days.length === 0 ? (
            <p className="text-xs text-slate-400 mt-3">
              当日〜7日先で出勤予定がありません。お手数ですがお電話にてお問い合わせください。
            </p>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-2 mt-3 -mx-1 px-1">
              {days.map((d) => {
                const t = formatDateTab(d.date, d.date === businessToday);
                return (
                  <button
                    key={d.date}
                    type="button"
                    onClick={() => chooseDate(d.date)}
                    className="flex-shrink-0 flex flex-col items-center gap-0.5 rounded-xl border border-slate-200 px-3.5 py-2.5 hover:border-pink-300 hover:bg-pink-50/40 transition-colors min-w-[64px]"
                  >
                    {t.today && <span className="text-[9px] font-bold text-pink-500">今日</span>}
                    <span className="text-sm font-bold text-slate-700">{t.md}</span>
                    <span className={`text-[10px] ${t.wd === '日' ? 'text-rose-400' : t.wd === '土' ? 'text-blue-400' : 'text-slate-400'}`}>({t.wd})</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── STEP 4: 時間グリッド ── */}
      {step === 'time' && (
        <div className={cardCls}>
          <BackBar onBack={() => setStep('date')} label={selectedDate ? `${formatDateTab(selectedDate, false).md}（${formatDateTab(selectedDate, false).wd}）／${course?.name}` : ''} />
          <SectionTitle>4. 時間を選ぶ</SectionTitle>
          <p className="text-[11px] text-slate-400 mt-1">
            選べる枠（青）をタップしてください。<span className="text-slate-400">TEL＝直前のためお電話で</span>／×＝空きなし。
          </p>
          {slotsLoading ? (
            <p className="text-xs text-slate-400 mt-3">空き枠を読み込み中...</p>
          ) : visibleSlots.length === 0 ? (
            <p className="text-xs text-slate-400 mt-3">この日に予約できる枠がありません。別の日をお選びください。</p>
          ) : (
            <>
              {!hasAnyOpen && (
                <p className="text-[11px] text-amber-600 mt-3">
                  現在ご予約いただける空き枠がありません。直前のご予約はお電話にてお願いいたします
                  {phone && <>（<a href={`tel:${phone}`} className="font-bold underline">{phone}</a>）</>}。
                </p>
              )}
              <div className="space-y-2 mt-3">
                {slotsByHour.map((g) => (
                  <div key={g.hour} className="flex items-start gap-2">
                    <span className="text-xs font-bold text-slate-400 w-8 flex-shrink-0 pt-2">{g.hour}時</span>
                    <div className="flex flex-wrap gap-1.5">
                      {g.items.map((s) => {
                        if (s.state === 'open') {
                          return (
                            <button
                              key={s.startISO}
                              type="button"
                              onClick={() => chooseSlot(s)}
                              className="rounded-lg border border-pink-300 bg-pink-50 text-pink-700 text-xs font-bold px-2.5 py-1.5 hover:bg-pink-100 transition-colors"
                            >
                              {s.label}
                            </button>
                          );
                        }
                        if (s.state === 'tel') {
                          return (
                            <span
                              key={s.startISO}
                              className="rounded-lg border border-slate-200 bg-slate-50 text-slate-400 text-xs font-bold px-2.5 py-1.5 cursor-not-allowed"
                              title="直前のためお電話でご予約ください"
                            >
                              {s.label}<span className="ml-0.5 text-[9px]">TEL</span>
                            </span>
                          );
                        }
                        // full
                        return (
                          <span
                            key={s.startISO}
                            className="rounded-lg border border-slate-200 bg-slate-100 text-slate-300 text-xs font-bold px-2.5 py-1.5 cursor-not-allowed"
                          >
                            {s.label}<span className="ml-0.5">×</span>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── STEP 5: 客情報入力 ── */}
      {step === 'info' && (
        <div className={cardCls}>
          <BackBar onBack={() => setStep('time')} label={selectedSlotLabel} />
          <SectionTitle>5. お客様情報</SectionTitle>
          <div className="space-y-3 mt-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">お名前 <span className="text-rose-400">必須</span></label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="例）福岡 太郎"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-pink-200"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">電話番号 <span className="text-rose-400">必須</span></label>
              <input
                type="tel"
                value={customerTel}
                onChange={(e) => setCustomerTel(e.target.value)}
                placeholder="例）090-1234-5678"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-pink-200"
              />
            </div>
            {/* 折り返しお電話の希望時間帯（任意・デフォルト「希望なし」） */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">折り返しお電話の希望時間帯（任意）</label>
              <div className="flex flex-wrap gap-2">
                {CALLBACK_PREF_OPTIONS.map((o) => (
                  <label
                    key={o.slug}
                    className={`cursor-pointer rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${
                      callbackPref === o.slug
                        ? 'border-pink-400 bg-pink-50 text-pink-700'
                        : 'border-slate-200 bg-slate-50/50 text-slate-500 hover:border-pink-200'
                    }`}
                  >
                    <input
                      type="radio"
                      name="callbackPref"
                      value={o.slug}
                      checked={callbackPref === o.slug}
                      onChange={() => setCallbackPref(o.slug)}
                      className="sr-only"
                    />
                    {o.label}
                  </label>
                ))}
              </div>
            </div>
            {/* お電話についての注意書き（固定文言） */}
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-[11px] text-amber-800 leading-relaxed">
              <p className="font-bold mb-1">お電話について</p>
              <p>
                ご予約の可否をお伝えするため、店舗より折り返しお電話いたします。
                <span className="font-bold">お電話に出られなかった場合、当店からの掛け直しはいたしません。</span>
                その際は、ご予約が確定していた場合でも予約枠を解放させていただきます。恐れ入りますが、
                できるだけ早めに折り返しのお電話にご対応いただけますようお願いいたします。
              </p>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">備考（任意）</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="ご要望などありましたらご記入ください"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-pink-200"
              />
            </div>
            {formError && <p className="text-xs text-rose-600">{formError}</p>}
            <button
              type="button"
              onClick={goToConfirm}
              className="w-full rounded-xl text-white font-bold py-3 text-sm shadow-sm hover:brightness-105 transition-all"
              style={{ background: brandGrad }}
            >
              確認画面へ
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 6: 確認 ── */}
      {step === 'confirm' && (
        <div className={cardCls}>
          <BackBar onBack={() => setStep('info')} label="内容を確認" />
          <SectionTitle>6. ご予約内容の確認</SectionTitle>
          <dl className="mt-3 space-y-2 text-sm">
            <Row label="店舗" value={salonName} />
            <Row label="セラピスト" value={therapist?.name ?? ''} />
            <Row label="コース" value={`${course?.name ?? ''}（${course?.durationMin}分）${course?.price ? ` / ${course.price}` : ''}`} />
            <Row label="日時" value={selectedSlotLabel} />
            <Row label="お名前" value={customerName} />
            <Row label="電話番号" value={customerTel} />
            <Row label="折り返し希望" value={callbackPrefLabel(callbackPref)} />
            {note.trim() && <Row label="備考" value={note} />}
          </dl>
          <p className="text-[11px] text-slate-400 leading-relaxed mt-3">
            送信後、店舗が内容を確認し、折り返しお電話にてご予約を確定いたします（この時点ではまだ確定ではありません）。
          </p>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="w-full mt-4 rounded-xl text-white font-bold py-3 text-sm shadow-sm hover:brightness-105 transition-all disabled:opacity-60"
            style={{ background: brandGrad }}
          >
            {submitting ? '送信中...' : 'この内容で予約リクエストを送る'}
          </button>
        </div>
      )}

      {/* ── STEP 7: 完了 ── */}
      {step === 'done' && (
        <div className={`${cardCls} text-center space-y-3`}>
          <div className="mx-auto w-14 h-14 rounded-full flex items-center justify-center" style={{ background: brandGrad }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
          <p className="text-sm font-black text-slate-700">予約リクエストを受け付けました</p>
          <p className="text-xs text-slate-500 leading-relaxed">
            こちらはまだ予約確定ではありません。<br />
            店舗が内容を確認し、折り返しお電話にてご予約を確定いたします。
          </p>
          <div className="rounded-xl bg-slate-50 p-3 text-left text-xs text-slate-600 space-y-1">
            <p><span className="text-slate-400">セラピスト：</span>{therapist?.name}</p>
            <p><span className="text-slate-400">コース：</span>{course?.name}（{course?.durationMin}分）</p>
            <p><span className="text-slate-400">日時：</span>{selectedSlotLabel}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function StepIndicator({ step }: { step: Step }) {
  const order: Step[] = ['therapist', 'course', 'date', 'time', 'info', 'confirm'];
  const labels: Record<string, string> = {
    therapist: '指名', course: 'コース', date: '日付', time: '時間', info: '入力', confirm: '確認',
  };
  const idx = order.indexOf(step);
  return (
    <div className="flex items-center justify-center gap-1 text-[10px]">
      {order.map((s, i) => (
        <div key={s} className="flex items-center gap-1">
          <span className={`px-1.5 py-0.5 rounded-full font-bold ${i <= idx ? 'text-white' : 'text-slate-400 bg-slate-100'}`} style={i <= idx ? { background: 'linear-gradient(to right,#FB923C,#DB2777)' } : undefined}>
            {labels[s]}
          </span>
          {i < order.length - 1 && <span className="text-slate-300">›</span>}
        </div>
      ))}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-black text-slate-700">{children}</h2>;
}

function BackBar({ onBack, label }: { onBack: () => void; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3 pb-3 border-b border-slate-100">
      <button type="button" onClick={onBack} className="text-xs font-bold text-slate-400 hover:text-pink-500 transition-colors flex-shrink-0">
        ← 戻る
      </button>
      {label && <span className="text-xs text-slate-500 truncate">{label}</span>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <dt className="text-slate-400 w-20 flex-shrink-0 text-xs pt-0.5">{label}</dt>
      <dd className="text-slate-700 font-bold min-w-0 break-words whitespace-pre-wrap">{value}</dd>
    </div>
  );
}
