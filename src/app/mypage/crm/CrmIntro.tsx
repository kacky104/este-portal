'use client';

import { useCrmLinks } from './CrmBase';
import { CRM_INTRO } from '@/lib/crmIntro';

// フクエスCRM「ご案内」（第1144便・2026-10-04・カッキーさん）。★ 未契約の店舗様が入口を押したときに出る。
//   ★ それまでは「有料機能です」の箇条だけ（CrmShell の Upsell）。
//   ★ フクエスリンク・コネックエフの「はじめての方へ」と同じ組み立て（とは → 流れ → できること → 無料との違い → はじめかた）。
//   ★ 中身は lib/crmIntro.ts（純粋なデータ）。★ 契約の判定はサーバー（actions/crm.ts）のまま。ここは見せるだけ。

const card = 'border border-slate-200 bg-white p-4 sm:p-5 shadow-sm';

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[16px] font-black text-slate-800 border-l-4 border-indigo-500 pl-2.5">{children}</h3>;
}

// ★ 第1145便: ログイン不要のご案内ページ（fukuescrm.com/about）でも使う。★ salonName は無ければ出さない。
//   publicPage のときは「契約店舗様はこちらからログイン」のボタンを出す（ログイン後は契約店ならそのまま使える・未契約ならこの案内に戻る）。
export function CrmIntro({ salonName, publicPage = false }: { salonName?: string; publicPage?: boolean }) {
  const links = useCrmLinks();
  const c = CRM_INTRO;
  return (
    <div className="mx-auto max-w-3xl px-3 py-6 sm:px-4 sm:py-8 space-y-4">
      {salonName && <p className="text-[12px] font-bold text-indigo-500">{salonName}</p>}

      {/* ── とは ── */}
      <section className={`${card} space-y-3`}>
        <SectionTitle>{c.intro.title}</SectionTitle>
        <p className="text-[15.5px] font-bold text-slate-700 leading-relaxed">{c.intro.lead}</p>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 text-center">
          {c.flow.map((f, i) => (
            <div key={f.name} className="contents">
              {i > 0 && <div className="text-indigo-400 font-black text-[18px] rotate-90 sm:rotate-0" aria-hidden>→</div>}
              <div className={`flex-1 border px-3 py-2.5 ${i < 2 ? 'border-indigo-200 bg-indigo-50' : 'border-emerald-200 bg-emerald-50'}`}>
                <div className={`text-[12px] font-bold ${i < 2 ? 'text-indigo-500' : 'text-emerald-600'}`}>{f.caption}</div>
                <div className={`text-[15px] font-black ${i < 2 ? 'text-indigo-800' : 'text-emerald-800'}`}>{f.name}</div>
              </div>
            </div>
          ))}
        </div>
        <ul className="space-y-1.5">
          {c.intro.points.map((p) => (
            <li key={p} className="flex gap-2 text-[14.5px] text-slate-600 leading-relaxed">
              <span className="text-emerald-600 font-black flex-none">✓</span>{p}
            </li>
          ))}
        </ul>
      </section>

      {/* ── できること ── */}
      <section className={`${card} space-y-3`}>
        <SectionTitle>できること</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {c.features.map((f) => (
            <div key={f.name} className="border border-slate-200 p-3.5">
              <b className="text-[15px] font-black text-slate-800">{f.name}</b>
              <p className="mt-1 text-[13.5px] text-slate-600 leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── 無料との違い ── */}
      <section className={`${card} space-y-3`}>
        <SectionTitle>無料の予約ボードとの違い</SectionTitle>
        <p className="text-[14px] text-slate-500 leading-relaxed">予約ボードは今までどおり無料でお使いいただけます。</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-[13.5px] border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-600">
                <th className="text-left font-bold px-3 py-2 border-b border-slate-200"></th>
                <th className="font-bold px-3 py-2 border-b border-slate-200 whitespace-nowrap">{c.compare.freeLabel}</th>
                <th className="font-bold px-3 py-2 border-b border-indigo-200 bg-indigo-50 text-indigo-800 whitespace-nowrap">{c.compare.crmLabel}</th>
              </tr>
            </thead>
            <tbody>
              {c.compare.rows.map((r) => (
                <tr key={r.item} className="border-b border-slate-100">
                  <td className="px-3 py-2 text-slate-700">{r.item}</td>
                  <td className="px-3 py-2 text-center text-slate-500">{r.free}</td>
                  <td className="px-3 py-2 text-center font-bold text-indigo-800 bg-indigo-50/50">{r.crm}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── はじめかた ── */}
      <section className={`${card} space-y-3`}>
        <SectionTitle>はじめかた</SectionTitle>
        <ol className="space-y-2.5">
          {c.steps.map((s, i) => (
            <li key={s.title} className="flex gap-3">
              <span className="flex-none w-7 h-7 rounded-full bg-indigo-600 text-white text-[13px] font-black flex items-center justify-center">{i + 1}</span>
              <div className="min-w-0">
                <b className="text-[14.5px] font-black text-slate-800">{s.title}</b>
                <p className="mt-0.5 text-[13.5px] text-slate-600 leading-relaxed">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="border-l-4 border-indigo-300 bg-indigo-50 px-3 py-2 text-[13px] leading-relaxed text-indigo-900">{c.already}</p>
      </section>

      {/* ── お申し込み ── */}
      <section className={`${card} space-y-3`}>
        <SectionTitle>{c.apply.title}</SectionTitle>
        <p className="text-[14px] text-slate-600 leading-relaxed">{c.apply.body}</p>
        <div className="flex flex-wrap gap-2">
          {publicPage && (
            <a href={links.special('login')} className="inline-block bg-indigo-600 px-4 py-2 text-[13px] font-bold text-white">
              ご契約店舗様はこちらからログイン
            </a>
          )}
          <a href={links.special('guide')} target="_blank" rel="noopener" className="inline-block border border-indigo-300 bg-white px-4 py-2 text-[13px] font-bold text-indigo-700">
            使い方・よくある質問を見る
          </a>
          <a href={links.fukues('/mypage')} className="inline-block bg-slate-800 px-4 py-2 text-[13px] font-bold text-white">
            マイページへ戻る
          </a>
        </div>
      </section>
    </div>
  );
}
