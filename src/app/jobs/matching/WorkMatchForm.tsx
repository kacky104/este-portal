'use client';

import { useState } from 'react';
import { submitWorkMatchEntry } from '@/app/actions/workMatch';
import {
  WORK_AREA_CHOICES,
  WORK_EXPERIENCE_VALUES,
  EXPERIENCE_LABEL,
  WORK_PICKUP_VALUES,
  PICKUP_LABEL,
  MAX_DISPLAY_NAME_LEN,
  MAX_CURRENT_JOB_LEN,
  MAX_CONTACT_LEN,
  MAX_NOTE_LEN,
  type WorkExperience,
  type WorkPickup,
} from '@/app/lib/workMatch';
import { JOB_FEATURE_GROUPS, featureLabel, MAX_JOB_FEATURES } from '@/app/lib/jobs';

// 求職マッチングのエントリーフォーム（/jobs/matching）。未ログインで送信可。
// website はハニーポット（CSSで非表示・人間は空のまま）。送信成功で完了表示に切り替える。
// 連絡先（電話・LINE・メール）は最低どれか1つ必須。希望特徴は最大 MAX_JOB_FEATURES 個。
export function WorkMatchForm() {
  const [displayName, setDisplayName] = useState('');
  const [age, setAge] = useState('');
  const [experience, setExperience] = useState<WorkExperience | ''>('');
  const [currentJob, setCurrentJob] = useState('');
  const [desiredAreas, setDesiredAreas] = useState<string[]>([]);
  const [wantsPickup, setWantsPickup] = useState<WorkPickup>('either');
  const [desiredFeatures, setDesiredFeatures] = useState<string[]>([]);
  const [contactPhone, setContactPhone] = useState('');
  const [contactLine, setContactLine] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [note, setNote] = useState('');
  const [website, setWebsite] = useState(''); // honeypot
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const toggleArea = (area: string) => {
    setDesiredAreas((prev) => (prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area]));
  };

  const toggleFeature = (slug: string) => {
    setDesiredFeatures((prev) => {
      if (prev.includes(slug)) return prev.filter((s) => s !== slug);
      if (prev.length >= MAX_JOB_FEATURES) return prev; // 上限に達したら追加しない
      return [...prev, slug];
    });
  };

  const ageNum = Number(age);
  const ageOk = /^\d{1,3}$/.test(age.trim()) && ageNum >= 18 && ageNum <= 99;
  const hasContact = contactPhone.trim() !== '' || contactLine.trim() !== '' || contactEmail.trim() !== '';
  const canSubmit = ageOk && experience !== '' && hasContact && !sending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSending(true);
    setError('');
    try {
      const res = await submitWorkMatchEntry({
        displayName,
        age,
        experience,
        currentJob,
        desiredAreas,
        wantsPickup,
        desiredFeatures,
        contactPhone,
        contactLine,
        contactEmail,
        note,
        website,
      });
      if (!res.ok) {
        setError(res.error ?? '送信に失敗しました');
        return;
      }
      setDone(true);
    } finally {
      setSending(false);
    }
  };

  if (done) {
    return (
      <div className="bg-white rounded-2xl border border-emerald-100 shadow-sm p-8 text-center">
        <p className="text-2xl mb-2">🐾</p>
        <p className="text-sm font-bold text-slate-800 mb-1">エントリーを受け付けました</p>
        <p className="text-xs text-slate-500 leading-relaxed">
          ご希望に合うお店を運営がお探しして、ご入力いただいた連絡先へご案内します。<br />
          少しお時間をいただく場合があります。どうぞお待ちください。
        </p>
      </div>
    );
  }

  const inputClass =
    'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100';
  const labelClass = 'text-[11px] font-bold text-slate-500 block mb-1';
  const sectionClass = 'bg-white rounded-2xl border border-slate-200 shadow-sm p-5';

  // 選択チップ（ラジオ/チェック共用の見た目）。
  const chip = (active: boolean) =>
    `px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
      active
        ? 'bg-emerald-500 text-white border-emerald-500 shadow-sm'
        : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300'
    }`;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* あなたについて */}
      <div className={sectionClass}>
        <p className="text-xs font-black text-emerald-700 mb-3">あなたについて</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>お名前・ニックネーム（任意）</label>
            <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={MAX_DISPLAY_NAME_LEN} placeholder="例: みお" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>年齢 <span className="text-rose-400">*</span></label>
            <input type="text" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value.replace(/[^0-9]/g, ''))} maxLength={3} required placeholder="例: 24" className={inputClass} />
            {age !== '' && !ageOk && <p className="text-[11px] text-rose-400 mt-1">18〜99の範囲で入力してください</p>}
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>お仕事の経験 <span className="text-rose-400">*</span></label>
            <div className="flex flex-wrap gap-2">
              {WORK_EXPERIENCE_VALUES.map((v) => (
                <button key={v} type="button" onClick={() => setExperience(v)} className={chip(experience === v)}>
                  {EXPERIENCE_LABEL[v]}
                </button>
              ))}
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>現在の職業（任意）</label>
            <input type="text" value={currentJob} onChange={(e) => setCurrentJob(e.target.value)} maxLength={MAX_CURRENT_JOB_LEN} placeholder="例: 会社員 / 学生 / 現在他店で勤務 など" className={inputClass} />
          </div>
        </div>
      </div>

      {/* 希望の働き方 */}
      <div className={sectionClass}>
        <p className="text-xs font-black text-emerald-700 mb-1">希望の働き方</p>
        <p className="text-[11px] text-slate-400 mb-3">当てはまるものを選んでください（任意・複数可）。</p>

        <label className={labelClass}>働きたいエリア</label>
        <div className="flex flex-wrap gap-2 mb-1">
          {WORK_AREA_CHOICES.map((area) => (
            <button key={area} type="button" onClick={() => toggleArea(area)} className={chip(desiredAreas.includes(area))}>
              {area}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-slate-400 mb-4">※ 選ばない場合は「エリアはこだわらない」として全エリアが対象になります。</p>

        <label className={labelClass}>送迎</label>
        <div className="flex flex-wrap gap-2 mb-4">
          {WORK_PICKUP_VALUES.map((v) => (
            <button key={v} type="button" onClick={() => setWantsPickup(v)} className={chip(wantsPickup === v)}>
              {PICKUP_LABEL[v]}
            </button>
          ))}
        </div>

        <label className={labelClass}>
          その他の希望条件（最大{MAX_JOB_FEATURES}個・任意）
          <span className="ml-1 font-normal text-slate-400">選択中 {desiredFeatures.length}/{MAX_JOB_FEATURES}</span>
        </label>
        <div className="space-y-3 mt-1">
          {JOB_FEATURE_GROUPS.map((g) => (
            <div key={g.title}>
              <p className="text-[11px] font-bold text-slate-400 mb-1">{g.title}</p>
              <div className="flex flex-wrap gap-2">
                {g.slugs.map((slug) => {
                  const active = desiredFeatures.includes(slug);
                  const disabled = !active && desiredFeatures.length >= MAX_JOB_FEATURES;
                  return (
                    <button
                      key={slug}
                      type="button"
                      onClick={() => toggleFeature(slug)}
                      disabled={disabled}
                      className={`${chip(active)} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                    >
                      {featureLabel(slug)}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 連絡先 */}
      <div className={sectionClass}>
        <p className="text-xs font-black text-emerald-700 mb-1">ご連絡先</p>
        <p className="text-[11px] text-slate-400 mb-3">
          電話・LINE・メールのうち、ご希望の連絡方法を<span className="font-bold text-slate-500">1つ以上</span>ご記入ください。運営からそっとご連絡します。
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>電話番号</label>
            <input type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} maxLength={MAX_CONTACT_LEN} placeholder="例: 090-0000-0000" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>LINE ID</label>
            <input type="text" value={contactLine} onChange={(e) => setContactLine(e.target.value)} maxLength={MAX_CONTACT_LEN} placeholder="例: fukues_mio" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>メールアドレス</label>
            <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} maxLength={MAX_CONTACT_LEN} placeholder="例: mio@example.com" className={inputClass} />
          </div>
        </div>
        {!hasContact && (
          <p className="text-[11px] text-slate-400 mt-2">いずれか1つ以上の連絡先を入力すると送信できます。</p>
        )}
      </div>

      {/* その他ご希望 */}
      <div className={sectionClass}>
        <label className={labelClass}>その他ご希望・ご質問（任意）</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={MAX_NOTE_LEN} rows={4} placeholder="ご希望の勤務日数・時間帯、気になっていること、連絡がつきやすい時間帯など、自由にご記入ください" className={inputClass} />
      </div>

      {/* honeypot（スパムボット対策）：視覚・支援技術の双方から隠す。人間はここを埋めない。 */}
      <div className="hidden" aria-hidden="true">
        <label>ホームページ<input type="text" value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" /></label>
      </div>

      {error && <p className="text-xs text-rose-500">{error}</p>}

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full px-8 py-3 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm shadow-emerald-500/20"
      >
        {sending ? '送信中…' : 'この内容で運営にお店探しを依頼する'}
      </button>
    </form>
  );
}
