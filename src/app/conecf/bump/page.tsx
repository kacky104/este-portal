'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ConecfShell } from '../ConecfShell';
import { useConecfActing } from '../ConecfSession';
import { useConecfHref } from '../ConecfBase';
import { useToast } from '@/app/components/useToast';
import { getConecfBump, getEsutamaAppealRows, type ConecfBumpSlot, type EsutamaAppealRowSlot } from '@/app/actions/conecfBump';
import { ESUTAMA_APPEAL_ROW_SLUG, esutamaAppealRowLabel, type EsutamaAppealRowKey } from '@/lib/esutamaAppealRows';
import { CARD, SITES, BumpRow, ShineStyle, FukuesBumpRow, type SiteTheme } from './BumpParts';

// コネックエフ「上位表示設定」（第1305便で駅ちかを作り、第1306便でフクエスも同じ画面に入れた・2026-10-08・カッキーさん）。
// ★ フクエスの部分は、マイページの「今すぐ」画面と同じ部品（SalonBumpButton）をそのまま置いている（★ 2か所に別々に書かない）。
// ★ 駅ちかの管理画面トップの「上位表示する」を、自動（時間帯・間隔）と今すぐの2通りで押す。
// ★ フクエスの自動上位表示（マイページ）と同じ形: ON/OFF・時間帯・間隔（10/15/20/30/60分）。
// ★ 残り回数・最後の上位表示は、押しに行ったときに駅ちかの画面から読んだ値（手で押した分も入る）。

// ★ 第1923便（ベンリーみたいに）: 枠ごとに1行。行を押すと、その枠の設定画面（駅ちか /bump/ekichika/<枠>・エステ魂 /bump/esutama/<枠>）
//   ★ 第1928便: エステ魂・フクエスも同じ1行の形に
const ROW_THEME = {
  ekichika: { border: 'border-orange-100', big: 'text-orange-500', hover: 'hover:bg-orange-50/60 hover:border-orange-300' },
  esutama: { border: 'border-violet-100', big: 'text-violet-500', hover: 'hover:bg-violet-50/60 hover:border-violet-300' },
} as const;
function SlotRowList({ site, slots }: { site: SiteTheme; slots: ConecfBumpSlot[] }) {
  const href = useConecfHref();
  const many = slots.length > 1;
  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {slots.map((s) => {
          const ok = s.hasCredential && !s.linkOff;
          const quota = s.quota ?? site.defaultQuota;
          const r = s.countStale && quota != null ? quota : s.remaining;
          const name = site.provider === 'ekichika'
            ? <>枠{s.slot}{s.area && <span className={`ml-1.5 ${s.enabled && ok ? '' : 'text-slate-500'}`}>{s.area}</span>}</>
            : <>集客アピール{many ? `（枠${s.slot}）` : ''}</>;
          return (
            <li key={s.slot}>
              <BumpRow href={href(`/bump/${site.provider}/${s.slot}`)} theme={ROW_THEME[site.provider]} name={name}
                lit={s.enabled && ok} remaining={r} quota={quota} enabled={s.enabled} lastAt={s.lastAt}
                note={ok ? undefined : 'ID・PW 未登録'} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SiteSection({ site, heading, enabled, onToast }: { site: SiteTheme; heading: string; enabled: boolean; onToast: (m: string) => void }) {
  const href = useConecfHref();
  const [data, setData] = useState<{ ready: boolean; slots: ConecfBumpSlot[] } | null>(null);
  // ★ 第1930便: エステ魂の集客アピールは、行ごとの表があれば3行（店舗情報・クーポン情報・お店体験談）で出す
  const [appealRows, setAppealRows] = useState<EsutamaAppealRowSlot[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const res = await getConecfBump(site.provider);
    if (!res.ok) { setError(res.error); return; }
    setData({ ready: res.data.ready, slots: res.data.slots }); setError('');
    if (site.provider === 'esutama') {
      const ar = await getEsutamaAppealRows();
      setAppealRows(ar.ok && ar.data.ready ? ar.data.rows : null);
    }
  }, [site.provider]);
  useEffect(() => { void load(); }, [load]);

  return (
    <section className="space-y-2">
      <h2 className={heading}>{site.name}</h2>
      {error && <div className={`${CARD} p-5 text-[14px] text-slate-500`}>読み込めませんでした（{error}）</div>}
      {!error && !data && <div className={`${CARD} p-5 text-[14px] text-slate-400`}>読み込み中…</div>}
      {!error && data && !data.ready && <div className={`${CARD} p-5 text-[14px] text-slate-500`}>準備中です。もうしばらくお待ちください。</div>}
      {!error && data && data.ready && (
        <>
          {!enabled && (
            <div className="border border-amber-300 bg-amber-50 px-4 py-3 text-[14px] text-amber-900 leading-relaxed">
              {site.name}の設定は、いまは見るだけです。保存するには、<Link href={href('/')} className="font-bold underline">ホーム</Link>で「コネックエフに切り替える」を押してください。
            </div>
          )}
          {data.slots.length === 0 && (
            <div className={`${CARD} p-5 text-[14px] text-slate-500`}>{site.name}の店舗ページが登録されていません。「ID・パスワード登録」から{site.name}を登録してください。</div>
          )}
          {data.slots.length > 0 && (appealRows
            ? (
              <ul className="space-y-2">
                {appealRows.map((r) => {
                  const ok = r.hasCredential && !r.linkOff;
                  const rem = r.countStale ? (r.quota ?? 10) : r.remaining;
                  return (
                    <li key={r.rowKey}>
                      <BumpRow href={href(`/bump/esutama/${ESUTAMA_APPEAL_ROW_SLUG[r.rowKey as EsutamaAppealRowKey]}`)} theme={ROW_THEME.esutama}
                        name={<>集客アピール<span className={`ml-1.5 ${r.enabled && ok ? '' : 'text-slate-500'}`}>{esutamaAppealRowLabel(r.rowKey)}</span></>}
                        lit={r.enabled && ok} remaining={rem} quota={r.quota} enabled={r.enabled} lastAt={r.lastAt}
                        note={ok ? undefined : 'ID・PW 未登録'} />
                    </li>
                  );
                })}
              </ul>
            )
            : <SlotRowList site={site} slots={data.slots} />)}
        </>
      )}
    </section>
  );
}

function Body({ salonId, enabled, onToast }: { salonId: number | null; enabled: boolean; onToast: (m: string) => void }) {
  // ★ 見出しの左線の色でサイトを見分ける（フクエス＝ピンク・駅ちか＝オレンジ・エステ魂＝紫）
  const section = 'text-[15px] font-black text-slate-800 border-l-4 pl-2.5';
  // ★ 第1399便: フクエスの上位表示（SalonBumpButton）は、DB の決まりが「持ち主だけ」。運営がほかの人の店を操作中は案内に替える（次の便で対応）
  const acting = useConecfActing();

  // ★ 第1308便（カッキーさん・店舗様の声「窮屈」）: 下に余白を足し、最後のカードの下までスクロールできるようにする
  return (
    <div className="space-y-5 pb-40">
      <ShineStyle />
      <p className="text-[14px] text-slate-400">行を押すと、その上位表示の設定（自動の時間・間隔、時刻指定）と「いま1回上位表示する」が開きます。</p>
      <p className="text-[13.5px] text-slate-600 leading-relaxed">
        フクエス・駅ちか・エステ魂の上位表示を、今すぐ押す・時間帯と間隔で自動で押す、のどちらでも設定できます。
      </p>

      {/* ── フクエス（TOP・地域ページ）── */}
      <section className="space-y-2">
        <h2 className={`${section} border-rose-400`}>フクエス</h2>
        {salonId != null
          ? <FukuesBumpRow salonId={salonId} operator={!!acting} />
          : <div className={`${CARD} p-5 text-[14px] text-slate-500`}>店舗情報が見つかりません</div>}
      </section>

      {/* ── 駅ちか（エリア・市区町村・駅の店舗一覧）── */}
      <SiteSection site={SITES.ekichika} heading={`${section} border-orange-400`} enabled={enabled} onToast={onToast} />

      {/* ── エステ魂（集客ワンクリックアピール・店舗情報）第1314便 ── */}
      <SiteSection site={SITES.esutama} heading={`${section} border-violet-400`} enabled={enabled} onToast={onToast} />
    </div>
  );
}

export default function ConecfBumpPage() {
  const { toast, showToast } = useToast();
  return (
    <ConecfShell current="bump" title="上位表示設定" toast={toast}>
      {(a) => <Body salonId={a.salonId} enabled={!!a.enabledAt} onToast={showToast} />}
    </ConecfShell>
  );
}
