'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/app/lib/supabase/client';
import { ExpandableText } from './ExpandableText';
import { fetchDiaryFeed, type DiaryEntry } from './feedShared';
import { DiaryDate } from '@/components/DiaryDate';
import { DiaryNewBadge } from '@/components/DiaryNewBadge';
import { DiaryGoodButton, getVoterKey, type GoodState } from './DiaryGood';

// 写メ日記フィード（縦に連続表示）。
// 既定（therapist フィード）はサーバーで取得済みの initialList を SSR 表示（ISR キャッシュ対象）。
// ?from=salon のときだけクライアントでサロン全体フィードに差し替える（searchParams 依存をクライアントへ隔離）。
// 表示マークアップは従来のサーバー版と同一。
export function DiaryFeed({
  initialList,
  currentId,
  salonId,
  therapistId,
}: {
  initialList: DiaryEntry[];
  currentId: string;
  salonId: string;
  therapistId: string;
}) {
  const fromSalon = useSearchParams().get('from') === 'salon';
  const [list, setList] = useState<DiaryEntry[]>(initialList);

  // from=salon のときのみサロン全体フィードへ差し替える（既定は初期stateのサーバー取得分をそのまま使用）。
  useEffect(() => {
    if (!fromSalon) return;
    let cancelled = false;
    (async () => {
      const data = await fetchDiaryFeed(createClient(), { fromSalon: true, salonId, therapistId });
      if (!cancelled && data.length > 0) setList(data);
    })();
    return () => { cancelled = true; };
  }, [fromSalon, salonId, therapistId]);

  // ★ 第1591便: グッドの数と「自分が押したか」をまとめて取る。
  //   RPC が無い・失敗したときは goods=null のまま＝ボタン自体を出さない（SQL 適用前に push しても壊れない）。
  const supabase = useMemo(() => createClient(), []);
  const [goods, setGoods] = useState<Record<string, GoodState> | null>(null);
  useEffect(() => {
    let cancelled = false;
    const voter = getVoterKey();
    if (!voter || list.length === 0) return;
    (async () => {
      const { data, error } = await supabase.rpc('get_diary_goods', { p_diary_ids: list.map((d) => d.id), p_voter_key: voter });
      if (cancelled || error) return;
      const map: Record<string, GoodState> = {};
      for (const r of (data ?? []) as { diary_id: string; good_count: number; mine: boolean }[]) {
        map[String(r.diary_id)] = { count: Number(r.good_count) || 0, mine: !!r.mine };
      }
      setGoods(map);
    })();
    return () => { cancelled = true; };
  }, [list, supabase]);

  // 現在の日記まで自動スクロール（リスト確定後）。
  useEffect(() => {
    const el = document.getElementById(`diary-${currentId}`);
    if (el) el.scrollIntoView({ block: 'center' });
  }, [list, currentId]);

  return (
    <div className="space-y-6">
      {list.map((d) => {
        const isCurrent = d.id === String(currentId);
        return (
          <article
            key={d.id}
            id={`diary-${d.id}`}
            className={`scroll-mt-20 bg-white shadow-sm overflow-hidden border ${
              isCurrent ? 'border-pink-400 ring-2 ring-pink-300' : 'border-slate-200'
            }`}
          >
            {/* セラピストアイコン + 名前（左） + 投稿日時 */}
            <div className="px-5 sm:px-6 pt-2 pb-1">
              <div className="flex items-center gap-2 min-w-0 leading-none">
                <Link href={`/therapist/${d.therapistId}`} className="w-14 h-14 rounded-full overflow-hidden border-2 border-pink-100 shadow-sm flex-shrink-0 bg-gradient-to-br from-pink-300 to-rose-400 flex items-center justify-center">
                  {d.therapistImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={d.therapistImage} alt={d.therapistName} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-white text-xl font-bold">{(d.therapistName || '?').charAt(0)}</span>
                  )}
                </Link>
                <Link href={`/therapist/${d.therapistId}`} className="text-sm font-bold text-pink-600 hover:underline truncate min-w-0">
                  {d.therapistName || 'セラピスト'}
                </Link>
                <p className="flex-shrink-0" style={{ fontSize: '13px', color: '#999' }}>📅 <DiaryDate iso={d.createdAt} /><DiaryNewBadge iso={d.createdAt} /></p>
              </div>
            </div>

            <div className="px-5 sm:px-6 pb-5 sm:pb-6 space-y-4">
              {/* 画像 */}
              {/* ★ 第1402便（2026-10-11・カッキーさん）: 写真の無い日記は、プロフィール写真を出す（駅ちかと同じ見せ方）。
                  一覧（第1401便）でプロフィール写真を出すようにしたので、開いた先でも同じ写真が出るようにそろえる。
                  縦長の写真の頭が切れないよう上寄せ。プロフィール写真も無い方は、今までどおり文字だけ。 */}
              {(d.image || d.therapistImage) && (
                <div className="-mx-5 sm:-mx-6">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={(d.image || d.therapistImage) as string} alt={d.title ?? d.therapistName} className={`block w-full max-h-[70vh] object-cover${d.image ? '' : ' object-top'}`} />
                </div>
              )}

              {/* 題名＋グッド（★ 第1592便: グッドは題名の行の右端に大きく／★ 第1593便: 題名は1行・はみ出た分は「…」） */}
              {(d.title || goods) && (
                <div className="flex items-center justify-between gap-3">
                  {d.title ? (
                  <h2
                    className="text-xl sm:text-2xl font-bold w-fit min-w-0 truncate"
                    style={{
                      background: 'linear-gradient(to right, #ec4899, #f97316)',
                      WebkitBackgroundClip: 'text',
                      backgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      color: 'transparent',
                    }}
                  >
                    {d.title}
                  </h2>
                  ) : <span className="block h-8" />}
                  {/* ★ 第1594便: 高さ0の箱の中で題名の真ん中にそろえる＝ボタンで題名の行の縦幅が広がらない */}
                  {goods && (
                    <div className="flex-shrink-0 -mr-1 h-0 flex items-center">
                      <DiaryGoodButton
                        supabase={supabase}
                        diaryId={d.id}
                        size={30}
                        state={goods[d.id] ?? { count: 0, mine: false }}
                        onChange={(next) => setGoods((g) => ({ ...(g ?? {}), [d.id]: next }))}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* 本文（5行超は「続きを見る」で展開） */}
              {d.content && <ExpandableText text={d.content} />}

            </div>
          </article>
        );
      })}
    </div>
  );
}
