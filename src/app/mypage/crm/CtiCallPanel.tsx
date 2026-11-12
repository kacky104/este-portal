'use client';

// フクエスCRM 着信の大きな窓（第1994便・2026-11-12・カッキーさん）。★ 風俗CTI の着信の窓にならった。
// ★ 着信ポップ（CrmIncomingCalls）と、着信履歴のタブ（calls/page.tsx）の「詳細」の両方で使う。
// ★ 中身は lookupCtiCaller（台帳・グループ共有・利用履歴・前回の予約）。読めなかったら欠けたまま出さず、そう書く。
// ★ 「女子への連絡事項」は CRM の台帳に欄が無いので出さない（カッキーさん 11/12）。

import { CRM_CATEGORY_CLASS, CRM_CATEGORY_LABEL, CRM_PLAY_LABEL, CRM_RECEIVED_LABEL, yen, type CrmPlayStatus } from '@/app/lib/crm/types';
import type { CtiCallerInfo } from '@/app/actions/crmCti';
import type { CtiHiddenReason } from '@/app/lib/crm/cti';

export type CtiPanelCall = { phone: string | null; hidden: CtiHiddenReason | null; rangAtISO: string; test: boolean; count?: number };
export type CtiPanelInfo = CtiCallerInfo | null | 'loading' | 'failed';

export function fmtTel(p: string): string {
  // 090-1234-5678 / 092-123-4567 の見た目（読みやすさだけ・保存は数字のみ）
  //   携帯・IP（090/080/070/050）は 3-4-4。0120・0570 は 4-3-3、0800 は 4-3-4
  //   固定（10けた）は市外局番の長さで区切る：03・06 は 2-4-4／福岡県の 4けたの局番は 4-2-4／それ以外は 3-3-4（092・093 など）
  if (/^0800\d{7}$/.test(p)) return `${p.slice(0, 4)}-${p.slice(4, 7)}-${p.slice(7)}`;
  if (/^0[5789]0\d{8}$/.test(p)) return `${p.slice(0, 3)}-${p.slice(3, 7)}-${p.slice(7)}`;
  if (/^(0120|0570)\d{6}$/.test(p)) return `${p.slice(0, 4)}-${p.slice(4, 7)}-${p.slice(7)}`;
  if (/^0[36]\d{8}$/.test(p)) return `${p.slice(0, 2)}-${p.slice(2, 6)}-${p.slice(6)}`;
  if (/^(0930|094[02346789])\d{6}$/.test(p)) return `${p.slice(0, 4)}-${p.slice(4, 6)}-${p.slice(6)}`;
  if (/^0\d{9}$/.test(p)) return `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}`;
  return p;
}
export function withQuery(href: string, params: Record<string, string>): string {
  const [path, q = ''] = href.split('?');
  const sp = new URLSearchParams(q);
  for (const [k, v] of Object.entries(params)) sp.set(k, v);
  const s = sp.toString();
  return s ? `${path}?${s}` : path;
}

const WD = ['日', '月', '火', '水', '木', '金', '土'];
const JST = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600_000);
function dt(iso: string): string {
  const d = JST(iso);
  return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}(${WD[d.getUTCDay()]}) ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}
function hm(iso: string): string {
  const d = JST(iso);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}
function md(iso: string): string {
  const d = JST(iso);
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}(${WD[d.getUTCDay()]})`;
}
function daysAgo(iso: string, nowMs: number): number {
  const day = (ms: number) => Math.floor((ms + 9 * 3600_000) / 86400_000);
  return day(nowMs) - day(new Date(iso).getTime());
}

function Box({ title, tone = 'indigo', children, className = '' }: { title: string; tone?: 'indigo' | 'rose'; children: React.ReactNode; className?: string }) {
  return (
    <section className={`border-b border-r border-slate-200 p-3 ${className}`}>
      <h3 className={`mb-1.5 text-[14px] font-black ${tone === 'rose' ? 'text-rose-700' : 'text-indigo-700'}`}>{title}</h3>
      {children}
    </section>
  );
}
function Line({ k, v, strong }: { k: string; v: React.ReactNode; strong?: boolean }) {
  return (
    <p className="text-[13px] leading-relaxed">
      <span className="font-bold text-indigo-700">{k}：</span>
      <span className={strong ? 'font-bold text-rose-700' : 'text-slate-800'}>{v}</span>
    </p>
  );
}

export function CtiCallPanel({
  call, info, nowMs, receptionHref, ledgerHref, onClose, onMinimize,
}: {
  call: CtiPanelCall;
  info: CtiPanelInfo;
  nowMs: number;
  /** 「新規予約」（受付フォームへ）。番号が無ければ null */
  receptionHref: string | null;
  /** 「台帳」（お客様を開く・台帳に無ければ番号を入れて新規） */
  ledgerHref: string | null;
  onClose: () => void;
  /** 着信ポップのときだけ：右上の小さなカードにたたむ */
  onMinimize?: () => void;
}) {
  const data = info && typeof info === 'object' ? info : null;
  const cust = data?.customer ?? null;
  const hits = data?.groupHits ?? [];
  const otherHits = hits.filter((h) => !h.mine);
  const isNg = cust?.category === 'ng' || otherHits.some((h) => h.level === 'ng');
  const last = data?.last ?? null;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-slate-900/40 p-2 pt-[70px] md:pt-[90px]" role="dialog" aria-modal="true" aria-label="着信">
      <div className={`w-full max-w-[1180px] border-2 bg-white shadow-2xl ${isNg ? 'border-rose-600' : 'border-indigo-600'}`}>
        {/* 上の帯：ボタン */}
        <div className={`flex flex-wrap items-center gap-2 px-3 py-2 text-white ${isNg ? 'bg-rose-700' : 'bg-indigo-700'}`}>
          <span className="text-[16px] font-black">📞 着信</span>
          {call.test && <span className="border border-white/60 px-1 text-[11px] font-bold">テスト</span>}
          {(call.count ?? 1) > 1 && <span className="text-[12px]">（5分以内に{call.count}回）</span>}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {receptionHref && <a href={receptionHref} onClick={onClose} className="bg-white px-3 py-1.5 text-[13px] font-black text-indigo-700">＋新規予約</a>}
            {ledgerHref && <a href={ledgerHref} onClick={onClose} className="border border-white/70 px-3 py-1.5 text-[13px] font-bold">{cust ? '台帳を開く' : '台帳に登録'}</a>}
            {onMinimize && <button type="button" onClick={onMinimize} className="border border-white/70 px-3 py-1.5 text-[13px] font-bold">小さくする</button>}
            <button type="button" onClick={onClose} className="border border-white/70 px-3 py-1.5 text-[13px] font-bold">閉じる</button>
          </div>
        </div>

        <div className="grid md:grid-cols-[1fr_1fr_1.4fr_1.3fr]">
          {/* 着信 */}
          <Box title="着信">
            {call.phone
              ? <p className="text-[20px] font-black tracking-wide text-slate-800">{fmtTel(call.phone)}</p>
              : <p className="text-[20px] font-black text-slate-700">{call.hidden === 'payphone' ? '公衆電話' : '非通知'}</p>}
            <p className="text-[13px] text-slate-600">{dt(call.rangAtISO)}</p>
            {data && <p className="mt-1 text-[13px] text-slate-600">CRM の予約：{data.bookingCount}件（次は {data.bookingCount + 1} 回目）</p>}
          </Box>

          {/* 顧客データ */}
          <Box title="顧客データ">
            {!call.phone && <p className="text-[13px] text-slate-500">番号が無いので台帳を引けません</p>}
            {call.phone && info === 'loading' && <p className="text-[13px] text-slate-400">台帳を確認しています…</p>}
            {call.phone && info === 'failed' && <p className="text-[13px] font-bold text-amber-700">読み込めませんでした（「台帳」で開いて確かめてください）</p>}
            {data && (cust ? (
              <>
                <p className="flex flex-wrap items-center gap-1.5">
                  <span className={`border px-1.5 py-0.5 text-[11px] font-bold leading-none ${CRM_CATEGORY_CLASS[cust.category]}`}>{CRM_CATEGORY_LABEL[cust.category]}</span>
                </p>
                <p className="mt-1 text-[20px] font-black text-slate-800">{cust.name || '（名前なし）'} 様</p>
                {call.phone && <p className="text-[13px] text-slate-600">{fmtTel(call.phone)}</p>}
              </>
            ) : (
              <>
                <p><span className="bg-violet-600 px-2 py-0.5 text-[14px] font-black text-white">新規</span></p>
                <p className="mt-1 text-[13px] text-slate-600">台帳にない番号です</p>
              </>
            ))}
          </Box>

          {/* 回数・女子 */}
          <Box title="利用">
            {data && cust ? (
              <>
                <Line k="利用回数" v={`${cust.stats.visits}回（${yen(data.totalSpent)}）`} />
                <Line k="キャンセル" v={`${cust.stats.cancels}回（悪質：${cust.stats.badCancels}回）`} strong={cust.stats.badCancels > 0} />
                <Line k="女子NG" v={data.ngNames.length > 0 ? data.ngNames.join('、') : 'なし'} strong={data.ngNames.length > 0} />
                <Line k="利用女子" v={data.usedNames.length > 0 ? data.usedNames.join('、') : 'まだありません'} />
                {cust.stats.upcoming > 0 && <Line k="予約中" v={`${cust.stats.upcoming}件`} />}
              </>
            ) : <p className="text-[13px] text-slate-400">—</p>}
          </Box>

          {/* 前回の予約データ（右の列・縦に長い） */}
          <section className="border-b border-slate-200 p-3 md:row-span-3">
            <div className="mb-1.5 flex items-center gap-2">
              <h3 className="text-[14px] font-black text-indigo-700">前回の予約データ</h3>
              {last && <span className="ml-auto bg-slate-500 px-2 py-0.5 text-[12px] font-bold text-white">{daysAgo(last.startISO, nowMs) <= 0 ? '今日の予約' : `${daysAgo(last.startISO, nowMs)}日前の予約`}</span>}
            </div>
            {!last ? <p className="text-[13px] text-slate-400">{data ? 'まだ予約がありません' : '—'}</p> : (
              <dl className="grid grid-cols-[6.5em_1fr] gap-y-1 border-t border-slate-200 pt-1.5 text-[13px]">
                <dt className="font-bold text-slate-600">日時</dt><dd>{md(last.startISO)} {hm(last.startISO)}〜{hm(last.endISO)}</dd>
                <dt className="font-bold text-slate-600">女子</dt><dd>{last.therapistName}</dd>
                <dt className="font-bold text-slate-600">コース</dt><dd>{last.course || '—'}</dd>
                <dt className="font-bold text-slate-600">指名</dt><dd>{last.nomination || '—'}</dd>
                <dt className="font-bold text-slate-600">延長</dt><dd>{last.extensions || '—'}</dd>
                <dt className="font-bold text-slate-600">オプション</dt><dd>{last.options || '—'}</dd>
                <dt className="font-bold text-slate-600">割引</dt><dd>{last.discounts || '—'}</dd>
                <dt className="font-bold text-slate-600">料金</dt><dd>{last.priceTotal == null ? '—' : yen(last.priceTotal)}</dd>
                <dt className="font-bold text-slate-600">女子報酬</dt><dd>{last.payTotal == null ? '—' : yen(last.payTotal)}</dd>
                <dt className="font-bold text-slate-600">支払い</dt><dd>{last.payment || '—'}</dd>
                <dt className="font-bold text-slate-600">受領</dt><dd>{CRM_RECEIVED_LABEL[last.receivedBy] ?? '—'}</dd>
                <dt className="font-bold text-slate-600">プレイ状況</dt><dd>{CRM_PLAY_LABEL[last.playStatus as CrmPlayStatus] ?? '—'}</dd>
                <dt className="font-bold text-slate-600">入り口</dt><dd>{last.web ? 'フクエス（ネット予約）' : '店で受付'}</dd>
                <dt className="font-bold text-slate-600">メモ</dt><dd className="whitespace-pre-line">{last.note || '—'}</dd>
                <dt className="font-bold text-slate-600">作成日時</dt><dd>{dt(last.createdAtISO)}</dd>
              </dl>
            )}
          </section>

          {/* 要注意・共有メモ */}
          <Box title="⚠ 要注意／共有メモ" tone="rose" className="md:col-span-2">
            {cust?.cautionMemo ? <p className="whitespace-pre-line text-[13px] font-bold text-rose-700">{cust.cautionMemo}</p> : null}
            {otherHits.map((h) => (
              <p key={h.id} className={`mt-1 border-l-4 px-2 py-1 text-[13px] ${h.level === 'ng' ? 'border-rose-900 bg-rose-600 font-bold text-white' : 'border-amber-500 bg-amber-100 text-amber-900'}`}>
                <span className="font-bold">{h.level === 'ng' ? 'グループ・提携店でNG' : 'グループ・提携店で要注意'}</span>
                {h.what && <span className="ml-1 whitespace-pre-line">{h.what}</span>}
              </p>
            ))}
            {data?.groupFailed && <p className="mt-1 text-[12px] font-bold text-amber-800">共有リストを確認できませんでした</p>}
            {!cust?.cautionMemo && otherHits.length === 0 && !data?.groupFailed && <p className="text-[13px] text-slate-400">なし</p>}
          </Box>

          {/* 事業所メモ（お店のメモ） */}
          <Box title="事業所メモ（お店のメモ）">
            {data?.memo ? <p className="whitespace-pre-line text-[13px] text-slate-800">{data.memo}</p> : <p className="text-[13px] text-slate-400">なし</p>}
          </Box>

          {/* 利用履歴 */}
          <section className="border-r border-slate-200 p-3 md:col-span-3">
            <h3 className="mb-1.5 text-[14px] font-black text-indigo-700">利用履歴{data && data.history.length > 0 ? `（新しい順・${data.history.length}件${data.history.length >= 30 ? '・30件まで' : ''}）` : ''}</h3>
            {!data || data.history.length === 0 ? <p className="text-[13px] text-slate-400">{data ? 'まだありません' : '—'}</p> : (
              <div className="max-h-[260px] overflow-auto">
                <table className="w-full text-left text-[13px]">
                  <thead className="sticky top-0 bg-slate-100 text-slate-600">
                    <tr><th className="px-2 py-1">日付</th><th className="px-2 py-1">女子</th><th className="px-2 py-1">指名</th><th className="px-2 py-1">コース</th><th className="px-2 py-1 text-right">料金</th><th className="px-2 py-1">状態</th></tr>
                  </thead>
                  <tbody>
                    {data.history.map((h) => (
                      <tr key={h.id} className="border-t border-slate-100">
                        <td className="whitespace-nowrap px-2 py-1">{md(h.startISO)} {hm(h.startISO)}</td>
                        <td className="px-2 py-1">{h.therapistName}</td>
                        <td className="px-2 py-1">{h.nomination || '—'}</td>
                        <td className="px-2 py-1">{h.course || '—'}</td>
                        <td className="px-2 py-1 text-right">{h.price == null ? '—' : yen(h.price)}</td>
                        <td className="whitespace-nowrap px-2 py-1">
                          {h.status === 'cancelled'
                            ? <span className={`font-bold ${h.cancelBad ? 'text-rose-700' : 'text-slate-500'}`}>{h.cancelBad ? 'キャンセル（悪質）' : 'キャンセル'}</span>
                            : new Date(h.startISO).getTime() > nowMs ? <span className="font-bold text-sky-700">予約中</span>
                            : h.status === 'confirmed' ? '来店' : '未確定'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
