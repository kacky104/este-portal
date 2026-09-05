'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  getArticleBoard,
  readArticleSlots,
  saveArticleTemplate,
  deleteArticleTemplate,
  saveArticleSettings,
  type ArticleBoard,
  type ArticleTemplateRow,
} from '@/app/actions/articleTemplates';
import { titleWidth, ARTICLE_TITLE_MAX_WIDTH } from '@/lib/ekichikaArticle';

// 新着情報を送る（第158便・2026-09-05）。フクエスリンクの7画面目。
//
// ★★★ この画面の順番が、そのまま 2026-09-05 に踏んだ穴の裏返しになっている
//   ① まず【枠の状態】を見せる … 非表示の枠・カラの枠を、書く前に知ってもらう
//   ② そのうえで【文章】を書く … 枠を選ばないと保存できない
//   ③ 最後に【回すかどうか】   … 既定は回さない
//
//   ★ 実弾のときは ③→②→① の順で分かった。★ 送って、載って、公開ページに出ていなかった。
//   ★★ 店舗様には同じ順番を踏ませない。
//
// ★★ この画面は駅ちかを書き換えない。★ 「いまの状態を読む」も読むだけ。

const STATE_STYLE: Record<string, { chip: string; dot: string }> = {
  usable:  { chip: 'text-emerald-700 bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
  hidden:  { chip: 'text-amber-700  bg-amber-50  border-amber-200',    dot: 'bg-amber-500' },
  empty:   { chip: 'text-slate-500  bg-slate-50  border-slate-200',    dot: 'bg-slate-300' },
  unknown: { chip: 'text-slate-500  bg-slate-50  border-slate-200',    dot: 'bg-slate-300' },
};

/** 「9/5 14:52」。★ 読めない値は空文字（"Invalid Date" を店舗に見せない） */
function fmt(iso: string | null): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo',
  }).format(new Date(t));
}

type Draft = { id: number | null; articleSlot: number | null; title: string; body: string; isActive: boolean };

const EMPTY: Draft = { id: null, articleSlot: null, title: '', body: '', isActive: false };

export function NewsBoard({ salonId, onToast }: { salonId: number | null; onToast: (m: string) => void }) {
  const [board, setBoard] = useState<ArticleBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (salonId == null) return;
    const r = await getArticleBoard({ salonId });
    if (!r.ok) { setError(r.error); setLoading(false); return; }
    setBoard(r.data);
    setError('');
    setLoading(false);
  }, [salonId]);

  useEffect(() => { void load(); }, [load]);

  if (salonId == null || loading) {
    return <p className="text-[14px] text-slate-400">読み込んでいます…</p>;
  }
  if (error && !board) {
    return <p className="text-[14px] text-rose-600 leading-relaxed">{error}</p>;
  }
  if (!board) return null;

  const onRead = async () => {
    setBusy('read');
    const r = await readArticleSlots({ salonId });
    setBusy('');
    // ★ 断られた理由（別の手順が走っている等）も、そのまま出す。★ 握りつぶさない
    onToast(r.ok ? r.data.note : r.error);
  };

  const onSave = async () => {
    if (!draft) return;
    if (draft.articleSlot === null) { onToast('どの枠へ出すかを選んでください'); return; }
    setBusy('save');
    const r = await saveArticleTemplate({
      salonId,
      id: draft.id,
      articleSlot: draft.articleSlot,
      title: draft.title,
      body: draft.body,
      isActive: draft.isActive,
    });
    setBusy('');
    if (!r.ok) { onToast(r.error); return; }
    setDraft(null);
    onToast('保存しました');
    await load();
  };

  const onDelete = async (id: number) => {
    setBusy('del');
    const r = await deleteArticleTemplate({ salonId, id });
    setBusy('');
    setConfirmDelete(null);
    if (!r.ok) { onToast(r.error); return; }
    onToast('消しました');
    await load();
  };

  const onSettings = async (patch: { postsPerDay?: number; autoEnabled?: boolean }) => {
    setBusy('set');
    const r = await saveArticleSettings({ salonId, ...patch });
    setBusy('');
    if (!r.ok) { onToast(r.error); return; }
    await load();
  };

  const width = draft ? titleWidth(draft.title) : 0;
  const overTitle = width > ARTICLE_TITLE_MAX_WIDTH;

  return (
    <div className="space-y-5">
      {/* ───────── ① 枠の状態 ───────── */}
      <section className="bg-white border border-slate-200">
        <div className="px-3.5 py-3 border-b border-slate-200 flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h2 className="text-[15px] font-black text-slate-800">駅ちかの5つの枠</h2>
            <p className="text-[13.5px] text-slate-500 leading-relaxed mt-0.5">{board.summary}</p>
          </div>
          <div className="flex items-center gap-2 flex-none">
            {board.readAt && (
              <span className="text-[12.5px] text-slate-400 tabular-nums">{fmt(board.readAt)} に確認</span>
            )}
            <button
              type="button"
              onClick={onRead}
              disabled={busy !== ''}
              className="text-[13.5px] font-bold px-3 py-1.5 border border-indigo-200 text-indigo-700 hover:bg-indigo-50 disabled:opacity-40"
            >
              いまの状態を読む
            </button>
          </div>
        </div>

        {/* ★ 押したあとすぐには変わらない。★ 「押したのに変わらない＝壊れている」と読ませない */}
        <p className="px-3.5 py-2 text-[13px] text-slate-400 leading-relaxed border-b border-slate-100">
          読みにいくのに1〜2分かかります。少し経ってから画面を開き直してください。この操作で駅ちかの記事は書き換わりません。
        </p>

        <ul className="divide-y divide-slate-100">
          {board.slots.map((s) => {
            const st = STATE_STYLE[s.state] ?? STATE_STYLE.unknown;
            return (
              <li key={s.slot} className="px-3.5 py-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={'w-2 h-2 rounded-full flex-none ' + st.dot} />
                  <b className="text-[14.5px] font-black text-slate-800">{s.label}</b>
                  <span className={'text-[12.5px] font-bold px-1.5 py-0.5 border ' + st.chip}>{s.headline}</span>
                </div>
                <p className="text-[13.5px] text-slate-500 leading-relaxed mt-1">{s.note}</p>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ───────── ② 文章 ───────── */}
      <section className="bg-white border border-slate-200">
        <div className="px-3.5 py-3 border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-[15px] font-black text-slate-800">出す文章</h2>
            <p className="text-[13.5px] text-slate-500 leading-relaxed mt-0.5">
              登録した文章を、上から順に1本ずつ出していきます。
            </p>
          </div>
          {draft === null && (
            <button
              type="button"
              onClick={() => setDraft(EMPTY)}
              className="text-[13.5px] font-bold px-3 py-1.5 border border-indigo-200 text-indigo-700 hover:bg-indigo-50"
            >
              文章を追加
            </button>
          )}
        </div>

        {board.templates.length === 0 && draft === null && (
          <p className="px-3.5 py-4 text-[14px] text-slate-400 leading-relaxed">
            まだ1本もありません。「文章を追加」から作ってください。
          </p>
        )}

        <ul className="divide-y divide-slate-100">
          {board.templates.map((t) => (
            <TemplateItem
              key={t.id}
              row={t}
              slotState={board.slots.find((s) => s.slot === t.articleSlot)?.state ?? 'unknown'}
              slotHeadline={board.slots.find((s) => s.slot === t.articleSlot)?.headline ?? ''}
              onEdit={() => setDraft({
                id: t.id, articleSlot: t.articleSlot, title: t.title, body: t.body, isActive: t.isActive,
              })}
              confirming={confirmDelete === t.id}
              onAskDelete={() => setConfirmDelete(t.id)}
              onCancelDelete={() => setConfirmDelete(null)}
              onDelete={() => onDelete(t.id)}
              busy={busy !== ''}
            />
          ))}
        </ul>

        {draft !== null && (
          <div className="px-3.5 py-3.5 border-t border-slate-200 bg-slate-50/60 space-y-3">
            {/* ★★★ 枠に既定値を作らない。★ 選ばないと保存できない */}
            <div>
              <label className="text-[13px] font-bold text-slate-500">どの枠へ出しますか</label>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {board.slots.map((s) => {
                  const on = draft.articleSlot === s.slot;
                  return (
                    <button
                      key={s.slot}
                      type="button"
                      onClick={() => setDraft({ ...draft, articleSlot: s.slot })}
                      className={
                        'text-[13.5px] font-bold px-2.5 py-1.5 border ' +
                        (on ? 'border-indigo-500 text-indigo-700 bg-indigo-50' : 'border-slate-200 text-slate-600 hover:bg-white')
                      }
                    >
                      {s.label}
                      <span className="text-[12px] font-normal text-slate-400 ml-1">{s.headline}</span>
                    </button>
                  );
                })}
              </div>
              {/* ★★★ 選んだ枠の見立てを、その場で出す。★ 保存してから気づかせない */}
              {draft.articleSlot !== null && (
                <p className="text-[13.5px] text-slate-500 leading-relaxed mt-1.5">
                  {board.slots.find((s) => s.slot === draft.articleSlot)?.note}
                </p>
              )}
            </div>

            <div>
              <div className="flex items-baseline justify-between">
                <label className="text-[13px] font-bold text-slate-500">タイトル</label>
                <span className={'text-[12.5px] tabular-nums ' + (overTitle ? 'text-rose-600 font-bold' : 'text-slate-400')}>
                  全角 {Math.ceil(width)} / {ARTICLE_TITLE_MAX_WIDTH}
                </span>
              </div>
              <input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                className="w-full mt-1 px-2.5 py-2 text-[14.5px] border border-slate-200 focus:border-indigo-400 outline-none"
                placeholder="本日も元気に営業中です"
              />
            </div>

            <div>
              <label className="text-[13px] font-bold text-slate-500">本文</label>
              <textarea
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                rows={6}
                className="w-full mt-1 px-2.5 py-2 text-[14.5px] border border-slate-200 focus:border-indigo-400 outline-none leading-relaxed"
                placeholder="&lt;p&gt;本日も元気に営業しております。&lt;/p&gt;"
              />
              {/* ★ 相手ができないと言っていることを、書く前に伝える */}
              <p className="text-[13px] text-slate-400 leading-relaxed mt-1">
                駅ちかの新着情報には画像と外部リンクを入れられません。改行は
                <code className="mx-0.5 px-1 bg-slate-100">&lt;br&gt;</code>、
                段落は<code className="mx-0.5 px-1 bg-slate-100">&lt;p&gt;〜&lt;/p&gt;</code>で書けます。
              </p>
            </div>

            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.isActive}
                onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
                className="mt-1"
              />
              <span className="text-[13.5px] text-slate-600 leading-relaxed">
                この文章を自動で回す
                <span className="block text-[13px] text-slate-400">
                  外しておくと保存だけされ、自動では出しません。
                </span>
              </span>
            </label>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={onSave}
                disabled={busy !== '' || draft.articleSlot === null}
                className="text-[14px] font-bold px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40"
              >
                {draft.id === null ? '保存する' : '書き換える'}
              </button>
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="text-[14px] font-bold px-3 py-2 text-slate-500 hover:text-slate-700"
              >
                やめる
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ───────── ③ 回すかどうか ───────── */}
      <section className="bg-white border border-slate-200">
        <div className="px-3.5 py-3 border-b border-slate-200">
          <h2 className="text-[15px] font-black text-slate-800">自動で出す</h2>
        </div>
        <div className="px-3.5 py-3.5 space-y-3">
          <div>
            <label className="text-[13px] font-bold text-slate-500">1日に出す本数</label>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {[0, 2, 3, 4, 6, 8].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => onSettings({ postsPerDay: n })}
                  disabled={busy !== ''}
                  className={
                    'text-[13.5px] font-bold px-3 py-1.5 border disabled:opacity-40 ' +
                    (board.postsPerDay === n
                      ? 'border-indigo-500 text-indigo-700 bg-indigo-50'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50')
                  }
                >
                  {n === 0 ? '出さない' : n + '回'}
                </button>
              ))}
            </div>
            {/* ★★★ null（出さない）を「0時に出ます」と読ませない */}
            <p className="text-[13.5px] text-slate-500 leading-relaxed mt-1.5">
              {board.postTimes === null
                ? '自動では出しません。'
                : 'だいたい ' + board.postTimes.join(' / ') + ' ごろに出ます。時刻は店舗ごとに自動で割り当てています。'}
            </p>
          </div>

          <label className="flex items-start gap-2 cursor-pointer border-t border-slate-100 pt-3">
            <input
              type="checkbox"
              checked={board.autoEnabled}
              onChange={(e) => onSettings({ autoEnabled: e.target.checked })}
              disabled={busy !== ''}
              className="mt-1"
            />
            <span className="text-[13.5px] text-slate-600 leading-relaxed">
              自動で出すことを許可する
              <span className="block text-[13px] text-slate-400">
                ここを入れないかぎり、フクエスは駅ちかへ何も書きません。
              </span>
            </span>
          </label>

          {/* ★★ 「入れたのに出ない」を先に説明する。★ 黙って出さないことをしない */}
          {board.autoEnabled && board.activeCount === 0 && (
            <p className="text-[13.5px] text-amber-700 leading-relaxed">
              自動で回す文章が1本もありません。上の文章で「この文章を自動で回す」を入れてください。
            </p>
          )}
          {board.autoEnabled && board.activeCount > 0 && board.postsPerDay === 0 && (
            <p className="text-[13.5px] text-amber-700 leading-relaxed">
              1日に出す本数が「出さない」になっています。
            </p>
          )}
        </div>
      </section>

      {error && <p className="text-[14px] text-rose-600 leading-relaxed px-1">{error}</p>}
    </div>
  );
}

function TemplateItem({
  row, slotState, slotHeadline, onEdit, confirming, onAskDelete, onCancelDelete, onDelete, busy,
}: {
  row: ArticleTemplateRow;
  slotState: string;
  slotHeadline: string;
  onEdit: () => void;
  confirming: boolean;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const st = STATE_STYLE[slotState] ?? STATE_STYLE.unknown;
  return (
    <li className="px-3.5 py-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={'text-[12.5px] font-bold px-1.5 py-0.5 border ' + st.chip}>{row.slotLabel}</span>
            {/* ★★ 出せない枠に登録されている文章は、その場で分かるようにする */}
            {(slotState === 'empty' || slotState === 'hidden' || slotState === 'unknown') && (
              <span className="text-[12.5px] text-amber-700">{slotHeadline}</span>
            )}
            {row.isActive
              ? <span className="text-[12.5px] font-bold text-emerald-700">自動で回す</span>
              : <span className="text-[12.5px] text-slate-400">回さない</span>}
          </div>
          <p className="text-[14.5px] font-bold text-slate-800 mt-1 break-words">{row.title}</p>
        </div>
        <div className="flex items-center gap-2 flex-none">
          {confirming ? (
            <>
              <button type="button" onClick={onDelete} disabled={busy}
                className="text-[13.5px] font-bold px-2.5 py-1.5 border border-rose-200 text-rose-700 hover:bg-rose-50 disabled:opacity-40">
                消します
              </button>
              <button type="button" onClick={onCancelDelete}
                className="text-[13.5px] font-bold px-2 py-1.5 text-slate-500 hover:text-slate-700">
                やめる
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={onEdit}
                className="text-[13.5px] font-bold px-2.5 py-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50">
                直す
              </button>
              <button type="button" onClick={onAskDelete}
                className="text-[13.5px] font-bold px-2 py-1.5 text-slate-400 hover:text-rose-600">
                消す
              </button>
            </>
          )}
        </div>
      </div>
    </li>
  );
}
