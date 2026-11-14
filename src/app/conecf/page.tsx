'use client';

import { ConecfShell } from './ConecfShell';
import { ConecfHome } from './ConecfHome';
import { CastLinkProgress } from '@/app/components/CastLinkProgress';
import { useConecfHref } from './ConecfBase';
import { useToast } from '@/app/components/useToast';
import { useState } from 'react';
import { enableConecf } from '@/app/actions/conecf';
import { CONECF_OPTION_LINE, SET_PLAN_APPLY_LINE } from '@/lib/setPlan';
import { FUKUES_ORIGIN } from '@/lib/crmHost';

// コネックエフのホーム（第395便 1a → 第396便 1b で連携の状態を足した）。

// ★★ 「コネックエフに切り替える」（第399便・カッキーさんの決定）。★ 押す前に、何が変わるかを言う。
// ★★ 第1241便（カッキーさん）: セット（コネックエフ＋フクエスCRM・月額22,000円 税込）を契約していない店には、
//   切り替えるボタンの代わりに料金と「お申し込みは運営へ」を出す（canSwitch=false）。サーバー（enableConecf）でも止めている。
function SwitchCard({ enabledAt, canSwitch, applyHref, onToast }: { enabledAt: string | null; canSwitch: boolean; applyHref: string; onToast: (m: string) => void }) {
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(enabledAt);
  // ★ 第400便: 駅ちかから反映が残っているとき、止めてよいかを聞く
  const [reading, setReading] = useState<string[] | null>(null);

  // ★ 第411便（カッキーさん）: 切り替え済みの帯は出さない（★ ベンリーに寄せて上をすっきり）。★ 切り替え前の案内だけ残す
  if (done) return null;

  if (!canSwitch) {
    return (
      <div className="bg-white border-2 border-indigo-200 px-5 py-4 space-y-3">
        <p className="text-[16px] font-black text-indigo-800">コネックエフは、フクエスCRMの無料オプションです</p>
        <p className="text-[14px] text-slate-600 leading-relaxed">
          いまは見るだけです。{CONECF_OPTION_LINE}{SET_PLAN_APPLY_LINE}ご契約後に切り替えられます。
        </p>
        <a href={applyHref} className="inline-block px-5 py-2.5 bg-gradient-to-r from-indigo-700 to-indigo-500 text-white text-[15px] font-bold">
          運営に申し込む
        </a>
      </div>
    );
  }

  const onGo = async (stopRead = false) => {
    setBusy(true);
    const res = await enableConecf({ stopRead });
    setBusy(false);
    if (!res.ok) {
      if (res.readingSites && res.readingSites.length > 0) { setReading(res.readingSites); return; }
      onToast(res.error); return;
    }
    setDone(res.enabledAt); setAsk(false);
    onToast('コネックエフに切り替えました');
    window.location.reload();
  };

  return (
    <div className="bg-white border-2 border-indigo-200 px-5 py-4 space-y-3">
      <p className="text-[16px] font-black text-indigo-800">コネックエフに切り替えましょう</p>
      <p className="text-[14px] text-slate-600 leading-relaxed">
        いまは見るだけです。切り替えると、セラピスト・写真・出勤をコネックエフから各サイトへ反映できます。
      </p>
      {!ask ? (
        <button type="button" onClick={() => setAsk(true)} className="px-5 py-2.5 bg-gradient-to-r from-indigo-700 to-indigo-500 text-white text-[15px] font-bold">
          コネックエフに切り替える
        </button>
      ) : (
        <div className="border border-amber-300 bg-amber-50 px-4 py-3 space-y-2.5">
          <p className="text-[14px] font-bold text-amber-900">切り替えますか？</p>
          {/* ★ 第2018便（2026-11-14・カッキーさん）: 誤って押した店（コネクト様 11/12）で、駅ちかで書いた出勤・写メ日記がフクエスに入らなくなった。うっかり押しにくくする */}
          <div className="border border-rose-300 bg-rose-50 px-3 py-2.5 text-[13.5px] text-rose-800 leading-relaxed">
            <b>切り替えると、駅ちかで入れた出勤・写メ日記はフクエスに入らなくなります。</b>
            今後は出勤・写メ日記をコネックエフで入力し、各サイトへ「フクエスから反映」で送る形になります。駅ちかで入力を続ける場合は、切り替えないでください。
          </div>
          <ul className="text-[13.5px] text-amber-900/90 leading-relaxed list-disc pl-5 space-y-0.5">
            <li>セラピストの追加・写真・年齢・サイズ・公開・出勤は、コネックエフで編集します（フクエスのマイページでは編集しません）。</li>
            {/* ★ 第470便: キャッチ・紹介文はコネックエフの「コメント」タブでも編集できる（★ フクエスと同じ列・駅ちか・エステ魂へも送れる） */}
            <li>キャッチ・紹介文は、どちらでも編集できます。</li>
            <li>クーポン・ネット予約などは、これまでどおりマイページで編集します。</li>
            {/* ★ 2026-11-14・カッキーさん: 他社の連携サービスと同じサイトへ二重に書き込まないため（他社の名前は出さない） */}
            <li>他社の連携サービスで駅ちか・エステ魂などを更新している場合は、その連携を解除する必要があります。運営が解除を代行することもできますので、必要な場合は切り替える前にご連絡ください。</li>
            <li>マイページでの編集に戻すときは、運営までご連絡ください。</li>
          </ul>
          {reading && (
            <div className="border border-rose-300 bg-rose-50 px-3 py-2.5 text-[13.5px] text-rose-800 leading-relaxed">
              現在、<b>{reading.join('・')}</b>から出勤などを反映させています。{reading.join('・')}からの反映を止めてコネックエフからの反映に切り替えますか？
            </div>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={() => { setAsk(false); setReading(null); }} disabled={busy} className="px-4 py-2 border border-slate-300 bg-white text-[14px] font-bold text-slate-600">やめる</button>
            <button type="button" onClick={() => void onGo(reading !== null)} disabled={busy} className="px-5 py-2 bg-indigo-600 text-white text-[14px] font-bold disabled:opacity-50">
              {busy ? '切り替えています…' : reading ? '反映を止めて切り替える' : '切り替える'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ConecfHomePage() {
  const { toast, showToast } = useToast();
  const href = useConecfHref();
  return (
    <ConecfShell current="home" title="ホーム" toast={toast}>
      {(access) => (
        <div className="space-y-3">
          {/* ★ 第411便: 「◯◯ 様」の帯は外した（★ 店舗名はサイドバーに出ている。★ はじめての方へはサイドバーから） */}
          <SwitchCard
            enabledAt={access.enabledAt}
            canSwitch={access.contract}
            applyHref={`${FUKUES_ORIGIN}/mypage?tab=support&apply=crm`}
            onToast={showToast}
          />
          {/* ★ 第884便（カッキーさん）: セラピストページ連携の連携率と未連携の一覧。第1776便: その下に連携済みの方も */}
          <CastLinkProgress salonId={access.salonId} editHref={(id) => href(`/girls/${id}`)} onToast={showToast} guideHref={href('/cast-guide')} aboutHref={href('/cast-about')} showLinked viewHref={(id) => href(`/cast-view/${id}`)} />
          <ConecfHome salonId={access.salonId} enabled={!!access.enabledAt} stopped={!!access.enabledAt && !access.contract} onToast={showToast} />
        </div>
      )}
    </ConecfShell>
  );
}
