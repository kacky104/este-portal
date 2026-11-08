'use client';

import { useState } from 'react';
import { submitHpContact } from '@/app/actions/hpContact';
import { HP_CONTACT_DONE_MESSAGE, HP_CONTACT_SUBJECTS, MAX_HP_CONTACT_BODY_LEN } from '@/app/lib/hp/contact';

// 公式ホームページ（フクエスサイト）の【お問い合わせフォーム】（第1717便・2026-11-02・カッキーさん）。
// HpInquiryForm（HP制作のお申し込み）と同じ作法：未ログインで送信可・company はハニーポット・送信成功で完了表示。
//
// ★ 見た目は Tailwind ではなく .hp-form 系のクラス（_templates/styles.ts）。ひな形の色（currentColor / --hp-accent）を継ぐ。
// ★ 自動返信メールは送らない。送信後は HP_CONTACT_DONE_MESSAGE を画面に出すだけ。
// ★ preview=true（デザインプレビュー）では送信ボタンを押せない。
export function HpContactForm({ siteKey, preview }: { siteKey: string; preview?: boolean }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [emailConfirm, setEmailConfirm] = useState('');
  const [tel, setTel] = useState('');
  const [subject, setSubject] = useState<string>(HP_CONTACT_SUBJECTS[0].key);
  const [body, setBody] = useState('');
  const [company, setCompany] = useState(''); // honeypot
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const canSubmit =
    !preview &&
    name.trim() !== '' &&
    email.trim() !== '' &&
    emailConfirm.trim() !== '' &&
    body.trim() !== '' &&
    !sending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSending(true);
    setError('');
    try {
      const res = await submitHpContact({ siteKey, name, email, emailConfirm, tel, subject, body, company });
      if (res.ok) {
        setDone(true);
        // ★ 第1792便: アクセス解析の「お問い合わせ」を1つ数える（計測は trackScript.ts）
        try { (window as unknown as { __fkHpTrack?: (t: string) => void }).__fkHpTrack?.('contact'); } catch { /* 数えられなくても送信は済んでいる */ }
      }
      else setError(res.error ?? '送信に失敗しました');
    } catch {
      setError('送信に失敗しました。時間をおいてお試しください');
    } finally {
      setSending(false);
    }
  };

  if (done) {
    return (
      <div className="hp-form-done" role="status">
        {HP_CONTACT_DONE_MESSAGE.split('\n').map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>
    );
  }

  return (
    <form className="hp-form" onSubmit={handleSubmit} noValidate>
      {/* honeypot：人には見えない。ボットが埋めたらサーバーが静かに捨てる */}
      <div className="hp-form-hp" aria-hidden="true">
        <label htmlFor="hpc-company">会社名</label>
        <input id="hpc-company" name="company" type="text" tabIndex={-1} autoComplete="off" value={company} onChange={(e) => setCompany(e.target.value)} />
      </div>

      <div className="hp-form-row">
        <label className="hp-form-label" htmlFor="hpc-name"><span className="hp-form-req">※</span> お名前</label>
        <input id="hpc-name" name="name" type="text" className="hp-form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="例）山田 太郎" autoComplete="name" maxLength={50} required />
      </div>
      <div className="hp-form-row">
        <label className="hp-form-label" htmlFor="hpc-email"><span className="hp-form-req">※</span> メールアドレス</label>
        <input id="hpc-email" name="email" type="email" className="hp-form-input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="例）example@example.com" autoComplete="email" inputMode="email" maxLength={200} required />
      </div>
      <div className="hp-form-row">
        <label className="hp-form-label" htmlFor="hpc-email2"><span className="hp-form-req">※</span> メールアドレス（確認用）</label>
        <input id="hpc-email2" name="emailConfirm" type="email" className="hp-form-input" value={emailConfirm} onChange={(e) => setEmailConfirm(e.target.value)} placeholder="もう一度入力してください" autoComplete="off" inputMode="email" maxLength={200} required />
      </div>
      <div className="hp-form-row">
        <label className="hp-form-label" htmlFor="hpc-tel">電話番号</label>
        <input id="hpc-tel" name="tel" type="tel" className="hp-form-input" value={tel} onChange={(e) => setTel(e.target.value)} placeholder="例）09012345678（任意）" autoComplete="tel" inputMode="tel" maxLength={20} />
      </div>
      <div className="hp-form-row">
        <span className="hp-form-label">お問い合わせ内容</span>
        <div className="hp-form-radios" role="radiogroup" aria-label="お問い合わせ内容">
          {HP_CONTACT_SUBJECTS.map((s) => (
            <label key={s.key} className="hp-form-radio">
              <input type="radio" name="subject" value={s.key} checked={subject === s.key} onChange={() => setSubject(s.key)} />
              <span>{s.label}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="hp-form-row">
        <label className="hp-form-label" htmlFor="hpc-body"><span className="hp-form-req">※</span> 詳しい内容</label>
        <textarea id="hpc-body" name="body" className="hp-form-input hp-form-textarea" value={body} onChange={(e) => setBody(e.target.value.slice(0, MAX_HP_CONTACT_BODY_LEN))} rows={6} placeholder="例）初めて利用するのですが、コースの内容を教えてください。" required />
      </div>

      {error !== '' && <p className="hp-form-error" role="alert">{error}</p>}

      <div className="hp-form-actions">
        <button type="submit" className="hp-form-submit" disabled={!canSubmit}>
          {sending ? '送信中…' : '送信する'}
        </button>
        {preview && <p className="hp-note">※ プレビューでは送信できません</p>}
      </div>
    </form>
  );
}
