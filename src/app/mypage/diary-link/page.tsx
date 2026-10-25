'use client';

// ★ 第1659便（2026-10-25・カッキーさん）: 駅ちかの写メ日記をフクエスに反映するための、ID・PW だけのシンプルな入力ページ。
//   ・入口はマイページのサイドバー「フリーページ」の下の画像バナー（いまはアバンティ様だけ・page.tsx の DIARY_LINK_SALON_IDS）。
//   ・保存はフクエスリンクと同じ saveMediaCredential（駅ちか・枠1・フクエスリンクの同意の版）。保存すると写メ日記の取り込み元が
//     自動で見直される（syncDiarySource）＝駅ちかで投稿した写メ日記がフクエスに反映される。
//   ・★ 同意文はフクエスリンクと同じものを出す（ID・PW を預かるため・省略しない）。同意済みなら読み返せる形で畳む。
//   ・★ 中身はこれだけ（説明・ID・PW・同意・保存）。詳しい操作はフクエスリンク（/mypage/media）のまま。

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/app/lib/supabase/client';
import { getMediaCredentials, saveMediaCredential } from '@/app/actions/mediaCredentials';
import { FUKUES_LINK_CONSENT_SECTIONS, FUKUES_LINK_CONSENT_AGREE_LABEL } from '@/lib/mediaConsent';

const supabase = createClient();

type Row = { provider: string; slot: number; loginId: string; hasPassword: boolean; needsConsent: boolean };

export default function DiaryLinkPage() {
  const router = useRouter();
  const [salonId, setSalonId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [row, setRow] = useState<Row | null>(null);
  const [consentVersion, setConsentVersion] = useState('');
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async (id: number, fillForm: boolean) => {
    const res = await getMediaCredentials({ salonId: id, service: 'link' });
    if (!res.ok) { setLoadError(res.error); return; }
    const r = (res.data.rows as Row[]).find((x) => x.provider === 'ekichika' && x.slot === 1) ?? null;
    setRow(r);
    setConsentVersion(res.data.consentVersion);
    setLoadError('');
    if (fillForm && r?.loginId) setLoginId(r.loginId);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/owner/login?redirectTo=' + encodeURIComponent('/mypage/diary-link')); return; }
      const { data, error } = await supabase
        .from('salons').select('id, is_hidden').eq('owner_id', user.id)
        .order('is_hidden', { ascending: true }).limit(1);
      const id = !error && data && data[0] ? Number(data[0].id) : null;
      if (id == null) { setLoadError('店舗情報が見つかりませんでした。'); setLoading(false); return; }
      setSalonId(id);
      await load(id, true);
      setLoading(false);
    })();
  }, [load, router]);

  const needConsent = !row || row.needsConsent;
  const registered = !!row && row.hasPassword;

  const onSave = async () => {
    if (salonId == null) return;
    if (loginId.trim() === '') { setMsg({ ok: false, text: 'ログインIDを入力してください' }); return; }
    if (!registered && password === '') { setMsg({ ok: false, text: 'パスワードを入力してください' }); return; }
    setSaving(true); setMsg(null);
    const res = await saveMediaCredential({
      salonId, provider: 'ekichika', slot: 1, shopId: '',
      loginId: loginId.trim(), password, agreed, consentVersion,
    });
    setSaving(false);
    if (!res.ok) { setMsg({ ok: false, text: res.error }); return; }
    setPassword(''); setAgreed(false);
    await load(salonId, false);
    setMsg({ ok: true, text: '保存しました。駅ちかで投稿した写メ日記が、順にフクエスへ反映されます。' });
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-lg">
        <h1 className="text-[20px] font-black text-slate-800">駅ちかの写メ日記をフクエスに反映</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-slate-600">
          駅ちかのログインIDとパスワードを入力すると、駅ちかで投稿した写メ日記がフクエスにも反映されます。
        </p>

        <section className="mt-5 border border-slate-200 bg-white p-5 shadow-sm">
          {loading ? (
            <p className="text-[14px] text-slate-400">読み込み中…</p>
          ) : loadError ? (
            <p className="text-[14px] text-rose-600">{loadError}</p>
          ) : (
            <div className="space-y-4">
              {registered && (
                <p className="border-l-4 border-emerald-500 bg-emerald-50 px-3 py-2 text-[13.5px] text-emerald-800">
                  登録済みです（ログインID {row?.loginId}）。変えるときだけ入力してください。
                </p>
              )}
              <label className="block">
                <span className="text-[13.5px] font-bold text-slate-700">ログインID</span>
                <input
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  autoComplete="off"
                  className="mt-1 w-full border border-slate-300 px-3 py-2.5 text-[16px] focus:border-pink-400 focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="text-[13.5px] font-bold text-slate-700">パスワード</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder={registered ? '●●●●（変更するときだけ入力）' : ''}
                  className="mt-1 w-full border border-slate-300 px-3 py-2.5 text-[16px] focus:border-pink-400 focus:outline-none"
                />
              </label>

              {/* ★ ID・PW を預かるので、同意文は省かない（フクエスリンクと同じ文） */}
              <details open={needConsent} className={needConsent ? 'border-2 border-amber-300 bg-amber-50/40' : 'border border-slate-200 bg-slate-50/60'}>
                <summary className="cursor-pointer list-none px-3 py-2.5 text-[14px] font-bold text-slate-700">
                  {needConsent ? 'お預かりする情報の取り扱い' : 'お預かり情報の取り扱い（同意済・再読）'}
                </summary>
                <ol className="list-none space-y-2.5 px-3 pb-3">
                  {FUKUES_LINK_CONSENT_SECTIONS.map((s, i) => (
                    <li key={s.heading}>
                      <p className="text-[13.5px] font-bold text-slate-600">{i + 1}. {s.heading}</p>
                      <p className="mt-0.5 text-[13px] leading-relaxed text-slate-500">{s.body}</p>
                    </li>
                  ))}
                </ol>
              </details>
              {needConsent && (
                <label className="flex cursor-pointer items-start gap-2 border border-pink-200 bg-pink-50 px-3 py-2.5">
                  <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 accent-pink-600" />
                  <span className="text-[13.5px] leading-relaxed text-slate-600">{FUKUES_LINK_CONSENT_AGREE_LABEL}</span>
                </label>
              )}

              <button
                type="button"
                onClick={onSave}
                disabled={saving || (needConsent && !agreed)}
                className="w-full bg-gradient-to-r from-pink-600 to-orange-400 py-3 text-[16px] font-bold text-white disabled:bg-none disabled:bg-slate-200 disabled:text-slate-400"
              >
                {saving ? '保存中…' : '保存する'}
              </button>
              {msg && <p className={`text-[13.5px] ${msg.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{msg.text}</p>}
            </div>
          )}
        </section>

        <div className="mt-6 text-center">
          <Link href="/mypage" className="text-[14px] font-bold text-pink-600 hover:underline">マイページへ戻る</Link>
        </div>
      </div>
    </main>
  );
}
