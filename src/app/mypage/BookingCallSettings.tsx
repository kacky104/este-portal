'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  getBookingCallInfo,
  saveBookingCallSettings,
  sendBookingTestCall,
  type BookingCallInfo,
  type BookingCallLog,
  type BookingCallSettings as Settings,
} from '@/app/actions/bookingCall';
import { normalizeCallTel, formatCallTel, CALL_HOUR_OPTIONS } from '@/app/lib/booking/callTel';

// ── 予約の電話通知（第1703便・2026-10-30）──────────────────────────────
//   ネット予約設定タブの「予約の電話通知（準備中）」の枠（第1664便）を本物にしたもの。
//   ★ 電話通知が使える（TWILIO_VOICE_ENABLED）まで は今まで通り「準備中」の枠だけを出す。
//   ★ この枠は自分の「保存」ボタンを持つ（画面下の大きな保存とは別）。番号を店舗の読み込みに混ぜないため。
//   ★ 決めたこと（カッキーさん 10/30）
//     ・番号は 1店1つ。掲載用の番号と同じでよい（オンにしたとき空なら掲載用の番号を入れておく）
//     ・時間帯は店舗様が選ぶ（いつでも／始め〜終わり・日をまたいでよい）
//     ・再発信は店舗様が選ぶ（最初はオフ）。出ない・話中のとき3分後に1回だけ。留守電に入った場合はかけ直さない

const INPUT = 'w-full px-3 py-2 rounded-none border border-slate-200 text-sm bg-slate-50/50 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-pink-200';

function Placeholder() {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 mb-1">
        予約の電話通知
        <span className="flex-none text-[10px] font-black text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full">準備中</span>
      </label>
      <input type="tel" disabled placeholder="090-0000-0000" className={`${INPUT} cursor-not-allowed opacity-60`} />
      <p className="text-[10px] text-slate-400 mt-1">
        新しい予約が入ったとき、メールに加えてお電話（自動音声）でもお知らせできるようになります。現在準備中です。
      </p>
    </div>
  );
}

function statusLabel(c: BookingCallLog): { text: string; tone: 'ok' | 'warn' | 'muted' } {
  if (c.status === 'skipped') {
    const m: Record<string, string> = {
      hours: '時間帯の外なのでかけていません',
      limit: '回数の上限のためかけていません',
      global_limit: '回数の上限のためかけていません',
      no_tel: '番号が未設定のためかけていません',
      not_new: '予約を確認済みのため、かけ直していません',
      error: 'かけられませんでした',
    };
    return { text: m[c.skipReason ?? ''] ?? 'かけていません', tone: 'muted' };
  }
  switch (c.status) {
    case 'completed':
      return { text: `つながりました${c.durationSec != null ? `（${c.durationSec}秒）` : ''}`, tone: 'ok' };
    case 'busy':
      return { text: '話し中でした', tone: 'warn' };
    case 'no-answer':
      return { text: '出ませんでした', tone: 'warn' };
    case 'failed':
      return { text: 'かけられませんでした', tone: 'warn' };
    case 'canceled':
      return { text: '取り消しました', tone: 'muted' };
    default:
      return { text: '発信中', tone: 'muted' };
  }
}

function whenLabel(iso: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso));
}

export default function BookingCallSettings({ salonId, listingPhone }: { salonId: number; listingPhone: string | null }) {
  const [info, setInfo] = useState<BookingCallInfo | null>(null);
  const [form, setForm] = useState<Settings | null>(null);
  const [saved, setSaved] = useState<string>('');
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const apply = useCallback((r: BookingCallInfo, withForm: boolean) => {
    setInfo(r);
    if (withForm && r.ok && r.available) {
      const s = { ...r.settings, tel: r.settings.tel ? formatCallTel(r.settings.tel) : '' };
      setForm(s);
      setSaved(JSON.stringify(s));
    }
  }, []);
  // 保存・テスト発信のあとは「最近のお電話」だけ読み直す（入力中の中身は上書きしない）
  const load = useCallback(async () => apply(await getBookingCallInfo(salonId), false), [salonId, apply]);

  useEffect(() => {
    let alive = true;
    getBookingCallInfo(salonId).then((r) => { if (alive) apply(r, true); }, () => {});
    return () => { alive = false; };
  }, [salonId, apply]);

  // 読み込み前・読めない・まだ使えない → 準備中の枠（今までと同じ見た目）
  if (!info || !info.ok || !info.available || !form) return <Placeholder />;

  const dirty = JSON.stringify(form) !== saved;
  const telOk = form.tel.trim() === '' || normalizeCallTel(form.tel) !== null;

  const onToggle = (on: boolean) => {
    setForm((f) => {
      if (!f) return f;
      // ★ オンにしたとき番号が空なら、掲載用の番号を入れておく（かけられない番号なら入れない）
      const fill = on && !f.tel.trim() ? normalizeCallTel(listingPhone) : null;
      return { ...f, enabled: on, tel: fill ? formatCallTel(fill) : f.tel };
    });
  };

  const onSave = async () => {
    setBusy('save');
    setMsg(null);
    const r = await saveBookingCallSettings(salonId, form);
    setBusy(null);
    if (r.ok) {
      const next = { ...r.settings, tel: r.settings.tel ? formatCallTel(r.settings.tel) : '' };
      setForm(next);
      setSaved(JSON.stringify(next));
      setMsg({ ok: true, text: '電話通知の設定を保存しました' });
      void load();
    } else {
      setMsg({ ok: false, text: r.error });
    }
  };

  const onTest = async () => {
    setBusy('test');
    setMsg(null);
    const r = await sendBookingTestCall(salonId);
    setBusy(null);
    setMsg(
      r.ok
        ? { ok: true, text: `${formatCallTel(form.tel)} へテストの電話をかけました。30秒ほどで鳴ります（${info.fromNumber} から）` }
        : { ok: false, text: r.error },
    );
    setTimeout(() => void load(), 2000);
  };

  return (
    <div className="border border-slate-200 rounded-none p-3 bg-white space-y-2.5">
      <label className="flex items-center gap-2 text-[13px] font-black text-slate-700 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={form.enabled}
          onChange={(e) => onToggle(e.target.checked)}
          className="accent-pink-500 w-4 h-4"
        />
        予約の電話通知を使う
      </label>
      <p className="text-[10px] text-slate-400 leading-relaxed">
        ネット予約が入ると、メールに加えて、下の番号へ自動音声のお電話でお知らせします（日時・セラピスト・コース）。
        お客様のお名前と電話番号は読み上げません。電話は <span className="font-bold text-slate-500">{info.fromNumber}</span>（フクエス）からかかります。
        電話帳に「フクエス予約」で登録しておくと分かりやすいです。
      </p>

      <div>
        <label className="block text-[11px] font-bold text-slate-500 mb-1">かける電話番号</label>
        <input
          type="tel"
          inputMode="tel"
          placeholder="090-0000-0000"
          className={INPUT}
          value={form.tel}
          onChange={(e) => setForm((f) => (f ? { ...f, tel: e.target.value } : f))}
        />
        {!telOk && <p className="text-[10px] text-rose-600 mt-1">0から始まる10〜11桁の番号を入れてください（0120・0570 などは使えません）</p>}
        <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
          掲載用の番号と同じでもかまいません。ただし自動音声が鳴っている30秒ほどは話し中になるため、お客様からの予約電話とぶつけたくない場合は、別の番号（オーナー様の携帯など）がおすすめです。
        </p>
      </div>

      <div>
        <label className="block text-[11px] font-bold text-slate-500 mb-1">鳴らす時間帯</label>
        <div className="flex items-center gap-2">
          <select
            className={INPUT}
            value={form.start}
            onChange={(e) => setForm((f) => (f ? { ...f, start: e.target.value, end: e.target.value === '' ? '' : f.end } : f))}
          >
            <option value="">指定しない（いつでも）</option>
            {CALL_HOUR_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <span className="flex-none text-xs text-slate-400">〜</span>
          <select
            className={INPUT}
            value={form.end}
            disabled={form.start === ''}
            onChange={(e) => setForm((f) => (f ? { ...f, end: e.target.value } : f))}
          >
            <option value="">{form.start === '' ? '—' : '選んでください'}</option>
            {CALL_HOUR_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
          この時間の外に入った予約は、お電話はせずメールだけでお知らせします。日をまたぐ時間帯（例 10:00〜03:00）も選べます。
        </p>
      </div>

      <label className="flex items-start gap-2 text-[12px] font-bold text-slate-600 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={form.retry}
          onChange={(e) => setForm((f) => (f ? { ...f, retry: e.target.checked } : f))}
          className="accent-pink-500 w-4 h-4 mt-0.5"
        />
        <span>
          出なかったときは、3分後にもう一度かける
          <span className="block text-[10px] font-normal text-slate-400 leading-relaxed mt-0.5">
            出なかった・話し中のとき、1回だけかけ直します。留守番電話に入った場合は、かけ直しません（着信履歴は残ります）。
          </span>
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          disabled={busy !== null || !dirty || !telOk}
          onClick={onSave}
          className="rounded-none bg-pink-500 px-4 py-1.5 text-[12px] font-black text-white transition-colors hover:bg-pink-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy === 'save' ? '保存中…' : '電話通知の設定を保存'}
        </button>
        <button
          type="button"
          disabled={busy !== null || dirty || !form.tel.trim()}
          onClick={onTest}
          className="rounded-none border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === 'test' ? 'かけています…' : '保存済みの番号にテスト発信'}
        </button>
        {dirty && <span className="text-[10px] font-bold text-amber-600">※ まだ保存していません（この枠の「保存」を押してください）</span>}
      </div>

      {msg && (
        <p className={`rounded-none border px-3 py-2 text-[11px] leading-relaxed ${msg.ok ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : 'border-rose-100 bg-rose-50 text-rose-700'}`}>
          {msg.text}
        </p>
      )}

      {info.calls.length > 0 && (
        <div className="pt-1">
          <p className="text-[10px] font-bold text-slate-500 mb-1">最近のお電話（5件まで）</p>
          <ul className="divide-y divide-slate-100 border border-slate-100">
            {info.calls.map((c) => {
              const s = statusLabel(c);
              return (
                <li key={c.id} className="flex items-center justify-between gap-2 px-2 py-1.5 text-[11px]">
                  <span className="text-slate-500 tabular-nums">
                    {whenLabel(c.createdAt)}
                    <span className="ml-1.5 text-slate-400">{c.kind === 'test' ? 'テスト' : c.attempt > 1 ? 'かけ直し' : '予約'}</span>
                  </span>
                  <span className={s.tone === 'ok' ? 'text-emerald-600 font-bold' : s.tone === 'warn' ? 'text-amber-600 font-bold' : 'text-slate-400'}>
                    {s.text}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
