import type { Metadata } from 'next';
import Image from 'next/image';
import { headers } from 'next/headers';
import { crmBaseFor, crmSpecialHref } from '@/lib/crmHost';
import { CrmBaseProvider } from '@/app/mypage/crm/CrmBase';
import { CrmIntro } from '@/app/mypage/crm/CrmIntro';

// フクエスCRM「ご案内」（第1145便・2026-10-04・カッキーさん）。★ fukuescrm.com/about。ログイン不要。
//   ★ きっかけ: fukuescrm.com は別のドメインなので、マイページのバナーを押すとまずログイン画面になる。
//     未契約の店舗様には、ログインの前に「何ができるか」を見せたい → マイページのバナーの行き先をここにした（契約店は今までどおり CRM へ）。
//   ★ 中身は /mypage/crm の未契約の案内（CrmIntro）と同じ1つ。★ リンクの頭は layout と同じく、開いたホストから決める。
export const metadata: Metadata = { title: 'フクエスCRMのご案内', robots: { index: false, follow: false } };

export default async function CrmAboutPage() {
  const h = await headers();
  const base = crmBaseFor(h.get('x-forwarded-host') ?? h.get('host'));
  return (
    <CrmBaseProvider base={base}>
      <div className="min-h-screen bg-[#eef1f8]">
        <header className="bg-[#1e2a5a] text-white">
          <div className="mx-auto flex max-w-3xl items-center gap-2.5 px-4 py-3">
            <Image src="/crm-logo.png" alt="" width={64} height={64} className="h-8 w-8" priority />
            <span className="text-[17px] font-black tracking-wide">フクエスCRM</span>
            <span className="ml-1 text-[12px] text-indigo-200">ご案内</span>
            {/* ★ 2026-10-09 点検（レイアウト）: 契約店がブックマークやバナーからここへ来たときの入口。使い方も */}
            <nav className="ml-auto flex items-center gap-1.5 text-[12px] font-bold">
              <a href={crmSpecialHref(base, 'guide')} className="border border-indigo-300/60 px-2 py-1 text-indigo-100 hover:bg-white/10">使い方</a>
              <a href={crmSpecialHref(base, 'login')} className="bg-white px-2.5 py-1 text-[#1e2a5a] hover:bg-indigo-50">ログイン</a>
            </nav>
          </div>
        </header>
        <CrmIntro publicPage />
      </div>
    </CrmBaseProvider>
  );
}
