'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getArticleBoard,
  readArticleSlots,
  saveArticleTemplate,
  deleteArticleTemplate,
  saveArticleSettings,
  saveArticlePhotoPool,
  startArticlePost,
  type ArticleBoard,
  type ArticleTemplateRow,
} from '@/app/actions/articleTemplates';
import { titleWidth, ARTICLE_TITLE_MAX_WIDTH } from '@/lib/ekichikaArticle';
import { ARTICLE_PHOTO_MAX, articlePhotoNote, articlePhotoConfirmNote } from '@/lib/articlePhotoPick';
import { articleQuotaNote } from '@/lib/articleRotation';

// 新着情報を送る（第158便で作り、第167便で作り直し、★ 第373便で【写真を店舗に1つの箱】へ・2026-09-15）。
//
// ★★★ 第373便の発端（カッキーさん・2026-09-15）
//   「これからはベンリーに配慮する必要はありません。設計のやり直しです。まずシンプルにします」
//   「画像選択のブロックを作ります。そこに10枚画像を設定できるようにします。
//    どのカテゴリーからの投稿もここで設定した10枚の写真から1枚がランダムで表示されて投稿する」
//
// ★★★ 第373便で変えた3つ
//   ① 【写真】の節を1つ作った（画面の上・店舗に1つ）
//        ★ 前 … 文章ごとに写真を何枚でも選ぶ（第172便）。★ 文章を書くたびに写真も決めさせていた
//        ★ 後 … 写真は店舗で10枚まで。★ どの枠から出すときも、その中から1枚をランダムに
//   ② 文章を書く画面から【写真】を外した
//        ★ 枠・タイトル・本文・自動で回すか、の4つだけ。★ 「駅ちかに登録されている方から選ぶ」も外した
//   ③ 一覧の左の写真と「写真：◯枚から毎回1枚」の文字を外した
//        ★ 文章と写真が結びついていないので、文章の脇に写真を出すと嘘になる
//
// ★★ 第167便から変えていないこと（★ 崩さない）
//   ・枠に既定値を作らない（★ 選ばないと保存できない）
//   ・押す前に【何が消えるか】を見せる（★ 新着は上書き。前の記事は戻らない）
//   ・「送った」と「載った」と「公開ページに出た」を分けて書く
//   ・この画面のどの操作も、勝手に駅ちかを書き換えない
//   ・決まりごとは、その項目の脇に書く。★ 保存ボタンは大きく

/** ★ 枠の状態の色。★ 空も【使える】側（第163便）。★ 灰色は「使えない」に見えるので使わない */
const STATE_CHIP: Record<string, string> = {
  usable:  'text-emerald-700 bg-emerald-50 border-emerald-200',
  empty:   'text-emerald-700 bg-emerald-50 border-emerald-200',
  hidden:  'text-amber-700  bg-amber-50  border-amber-200',
  unknown: 'text-slate-500  bg-slate-50  border-slate-200',
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

/**
 * ★ 送った結果が届くのを待つ間隔と回数（第159便）。
 *   ★★ 中継役は1分ごとに引き取り、login → 一覧 → 編集 → 送信 → 読み返し と4〜5段ある。
 *   ★ 5分で待つのをやめる。★ 永久に回さない（WorkSend と同じ作法）。
 */
const POLL_MS = 15000;
const POLL_MAX = 20;

type Draft = {
  id: number | null; articleSlot: number | null; title: string; body: string; isActive: boolean;
};

const EMPTY: Draft = { id: null, articleSlot: null, title: '', body: '', isActive: false };

/** ★ 2つの並びが同じか（★ 順番も見る）。★ 写真の箱の「変えたか」に使う */
function sameIds(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export function NewsBoard({ salonId, onToast }: { salonId: number | null; onToast: (m: string) => void }) {
  const [board, setBoard] = useState<ArticleBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  /** ★ 「いま出す」の確認を出している文章 */
  const [confirmPost, setConfirmPost] = useState<number | null>(null);
  /**
   * ★★★ 写真の箱の【画面の側の控え】（第373便）。★ 保存するまで DB には触らない。
   *   ★ board.photoIds と違っていれば「まだ保存していない」
   */
  const [pool, setPool] = useState<number[]>([]);
  /**
   * ★ 結果が届くのを待っている印。値は【押した時点でいちばん新しかった記録のid】。
   *   ★★★ 「verify_article があるか」で止めてはいけない。★ 前回の送信の行が残っているから。
   *     ★ それだと押した瞬間に「終わりました」と出る。★ 何も起きていないのに。
   *   → ★ この id より **新しい行が来たとき**だけ止める。
   */
  const [waitFrom, setWaitFrom] = useState<number | null>(null);
  const pollCount = useRef(0);
  /** ★ 最後に DB から読んだ箱。★ null は「まだ一度も読んでいない」 */
  const serverPool = useRef<number[] | null>(null);

  const load = useCallback(async () => {
    if (salonId == null) return;
    const r = await getArticleBoard({ salonId });
    if (!r.ok) { setError(r.error); setLoading(false); return; }
    setBoard(r.data);
    // ★★ 箱の控えは【DBの箱が変わったとき】だけ揃える。
    //   ★ 送ったあとの15秒ごとの読み直しで、選びかけの写真が消えないように（★ 保存前の選択を勝手に捨てない）
    if (serverPool.current === null || !sameIds(serverPool.current, r.data.photoIds)) {
      setPool(r.data.photoIds);
    }
    serverPool.current = r.data.photoIds;
    setError('');
    setLoading(false);
  }, [salonId]);

  useEffect(() => { void load(); }, [load]);

  // ★★★ 押したあと、結果が届くまで自分で見にいく（第159便）。
  //   ★ 店舗様に「開き直してください」と言わせない。★ ただし永久には回さない（5分でやめる）。
  useEffect(() => {
    if (waitFrom === null) return;
    const id = setInterval(() => {
      pollCount.current += 1;
      // ★ 5分で待つのをやめる。★ 止まったのか遅いのかは分からないので、そう書く
      if (pollCount.current > POLL_MAX) { setWaitFrom(null); return; }
      void load();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [waitFrom, load]);

  // ★★★ 押したあとに来た【新しい行】だけを合図にする。
  //   ★ 終わりの合図は verify_article（載ったか確かめた）／flow_stalled（始められなかった）／
  //     push_article の失敗／plan_article の失敗。★ 「送った」だけでは終わりにしない（第136便）。
  useEffect(() => {
    if (waitFrom === null || !board) return;
    const done = board.runs.some((r) =>
      r.id > waitFrom && (
        r.event === 'verify_article' ||
        r.event === 'flow_stalled' ||
        (r.event === 'push_article' && r.outcome !== 'ok') ||
        (r.event === 'plan_article' && r.outcome !== 'ok')
      ));
    if (done) setWaitFrom(null);
  }, [waitFrom, board]);

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

  const onPost = async (id: number) => {
    setBusy('post');
    // ★ 押した時点でいちばん新しい行を覚えておく。★ ここより新しい行が来たら終わり
    const from = board.runs.length > 0 ? board.runs[0].id : 0;
    const r = await startArticlePost({ salonId, templateId: id });
    setBusy('');
    setConfirmPost(null);
    if (!r.ok) { onToast(r.error); return; }
    pollCount.current = 0;
    setWaitFrom(from);
    onToast(r.data.note);
    await load();
  };

  const onSettings = async (patch: { postsPerDay?: number; autoEnabled?: boolean }) => {
    setBusy('set');
    const r = await saveArticleSettings({ salonId, ...patch });
    setBusy('');
    if (!r.ok) { onToast(r.error); return; }
    await load();
  };

  /** ★ 写真を1枚ずつ入れたり外したり。★ 上限は10枚。★ 保存するまで DB には触らない */
  const togglePhoto = (id: number) => {
    if (pool.includes(id)) { setPool(pool.filter((x) => x !== id)); return; }
    // ★★ 上限を超えたら、黙って落とさずに言う
    if (pool.length >= ARTICLE_PHOTO_MAX) { onToast('写真は' + ARTICLE_PHOTO_MAX + '枚までです'); return; }
    setPool([...pool, id]);
  };

  const onSavePool = async () => {
    setBusy('pool');
    const r = await saveArticlePhotoPool({ salonId, therapistIds: pool });
    setBusy('');
    if (!r.ok) { onToast(r.error); return; }
    onToast(pool.length === 0 ? '写真を外しました' : '写真を保存しました（' + pool.length + '枚）');
    await load();
  };

  const poolDirty = !sameIds(pool, board.photoIds);
  const width = draft ? titleWidth(draft.title) : 0;
  const overTitle = width > ARTICLE_TITLE_MAX_WIDTH;
  const openDraft = (d: Draft) => { setDraft(d); };

  return (
    <div className="space-y-5">
      {/* ★★ 押したあと、届くまでのあいだ。★ 「押したのに何も起きない」を作らない */}
      {waitFrom !== null && (
        <p className="text-[14px] text-indigo-800 bg-indigo-50 border border-indigo-200 px-3.5 py-2.5 leading-relaxed">
          駅ちかへ送っています。結果が出るまで1〜2分かかります。この画面のままお待ちください。
        </p>
      )}

      {/* ───────── ★★★ まだ一度も読んでいないとき（第167便） ─────────
          ★ 普段は「いまの状態を読む」を出さない。★ 店舗様の仕事ではないから。
          ★★ ただし一度も読んでいないと、どの枠が使えるかも分からない。
             → ★ そのときだけ、これを大きく1回出す。 */}
      {board.readAt === null ? (
        <section className="bg-white border border-indigo-200">
          <div className="px-4 py-4">
            <h2 className="text-[15.5px] font-black text-slate-800">はじめに、駅ちかを1回読み取ります</h2>
            <p className="text-[14px] text-slate-600 leading-relaxed mt-1.5">
              いまどの枠が使えるかを確かめます。<b>この操作で駅ちかの記事は書き換わりません。</b>
              読み取りに1〜2分かかります。
            </p>
            <button
              type="button"
              onClick={onRead}
              disabled={busy !== ''}
              className="mt-3 text-[15px] font-bold px-5 py-2.5 bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40"
            >
              駅ちかを読み取る
            </button>
          </div>
        </section>
      ) : (
        // ★ 読んだあとは、静かに「どの枠が使えるか」と「いつ確かめたか」だけ。
        //   ★ 押し直したい人のために小さく置く（★ 普段は押さない）
        <div className="px-0.5">
          <p className="text-[13.5px] text-slate-500 leading-relaxed">{board.summary}</p>
          <p className="text-[13px] text-slate-400 leading-relaxed flex items-center gap-2 flex-wrap mt-0.5">
            <span className="tabular-nums">{fmt(board.readAt)} に駅ちかを確認しました</span>
            <button
              type="button"
              onClick={onRead}
              disabled={busy !== ''}
              className="underline underline-offset-2 hover:text-slate-600 disabled:opacity-40"
            >
              読み直す
            </button>
          </p>
        </div>
      )}

      {/* ───────── ① 写真（第373便・店舗に1つ） ─────────
          ★★★ 文章ごとではなく、店舗で10枚まで。★ どの枠から出すときも、この中から1枚をランダムに。
          ★ 選んだ順に並ぶ。★ 保存するまで DB には触らない（★ 「保存ボタンを押してなかった」を、下の帯で止める） */}
      <section className="bg-white border border-slate-200">
        <div className="px-3.5 py-3 border-b border-slate-200 flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h2 className="text-[15px] font-black text-slate-800">写真</h2>
            <p className="text-[13.5px] text-slate-500 leading-relaxed mt-0.5">
              どの枠から出すときも、ここで選んだ写真の中から1枚がランダムで入ります。{ARTICLE_PHOTO_MAX}枚まで。
            </p>
          </div>
          <span className="text-[13px] text-slate-400 tabular-nums flex-none">
            {pool.length} / {ARTICLE_PHOTO_MAX} 枚
          </span>
        </div>
        <div className="px-3.5 py-3.5">
          {board.therapists.length === 0 ? (
            <p className="text-[13.5px] text-slate-500 leading-relaxed">
              フクエスに写真が登録されている方がまだいません。セラピストの登録で写真を入れると、ここから選べるようになります。
              それまでは、駅ちかに入っている写真がそのまま残ります。
            </p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {board.therapists.map((t) => (
                <PhotoTile
                  key={t.id}
                  on={pool.includes(t.id)}
                  name={t.name}
                  photoUrl={t.photoUrl}
                  onClick={() => togglePhoto(t.id)}
                  disabled={busy !== ''}
                />
              ))}
            </div>
          )}

          {/* ★★★ いま何が起きるかを、選んだその場で言う。★ 文言は articlePhotoPick が作る（★ 画面で作らない） */}
          <p className="text-[13.5px] text-indigo-800 bg-indigo-50 border border-indigo-200 px-3 py-2 leading-relaxed mt-2.5">
            {articlePhotoNote(pool.length)}
          </p>

          {/* ★ 決まりごとは、選ぶところの【すぐ下】に */}
          <p className="text-[13px] text-slate-400 leading-relaxed mt-1.5">
            駅ちかへ送るのはタイトルと本文と、この写真1枚です。JPEG でも PNG でもかまいません（送るときにこちらで整えます）。
          </p>

          {/* ★★★ 保存していない選択があるときだけ、帯を出す。★ 「選んだのに保存していなかった」を作らない */}
          {poolDirty && (
            <div className="flex items-center gap-3 flex-wrap mt-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={onSavePool}
                disabled={busy !== ''}
                className="text-[15px] font-black px-6 py-2.5 bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40"
              >
                写真を保存する
              </button>
              <button
                type="button"
                onClick={() => setPool(board.photoIds)}
                disabled={busy !== ''}
                className="text-[14px] font-bold px-3 py-2 text-slate-500 hover:text-slate-700 disabled:opacity-40"
              >
                元に戻す
              </button>
              <span className="text-[13.5px] text-amber-700">まだ保存していません</span>
            </div>
          )}
        </div>
      </section>

      {/* ───────── ② 出す文章 ───────── */}
      <section className="bg-white border border-slate-200">
        <div className="px-3.5 py-3 border-b border-slate-200 flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h2 className="text-[15px] font-black text-slate-800">出す文章</h2>
            <p className="text-[13.5px] text-slate-500 leading-relaxed mt-0.5">
              登録した文章を、上から順に1本ずつ出していきます。
            </p>
            {/* ★★★ 手で出したぶんも1日の本数に数える。★ そのことを数字といっしょに出す */}
            <p className="text-[13px] text-slate-400 leading-relaxed mt-0.5">
              今日はここまで {board.postedToday} 本出しました（手で出したぶんも数えます）。
            </p>
            {/* ★★★ 第168便: 「5本出した」と「1日2回」が並んでいるのに、関係を書いていなかった。
                ★ 中身は正しいのに黙っている形（★ 送ったのに公開ページに出ていなかった、と同じ穴）。
                ★★ 言葉は articleRotation の1か所で作る。★ ここで作らない（第167便で直した作法） */}
            {(() => {
              const q = articleQuotaNote({
                autoEnabled: board.autoEnabled,
                timesPerDay: board.postsPerDay,
                postedToday: board.postedToday,
                activeCount: board.activeCount,
              });
              return q === null ? null : (
                <p className="text-[13px] text-slate-500 leading-relaxed mt-0.5">{q}</p>
              );
            })()}
          </div>
          {draft === null && (
            <button
              type="button"
              onClick={() => openDraft(EMPTY)}
              className="text-[14px] font-bold px-3.5 py-2 bg-indigo-600 text-white hover:bg-indigo-700 flex-none"
            >
              ＋ 文章を追加
            </button>
          )}
        </div>

        {board.templates.length === 0 && draft === null && (
          <p className="px-3.5 py-5 text-[14px] text-slate-400 leading-relaxed">
            まだ1本もありません。「＋ 文章を追加」から作ってください。
          </p>
        )}

        <ul className="divide-y divide-slate-100">
          {board.templates.map((t) => {
            const s = board.slots.find((x) => x.slot === t.articleSlot);
            return (
              <TemplateItem
                key={t.id}
                row={t}
                slotState={s?.state ?? 'unknown'}
                slotShort={s?.short ?? 'まだ確かめていません'}
                photoNote={articlePhotoConfirmNote(board.photoIds.length)}
                onEdit={() => openDraft({
                  id: t.id, articleSlot: t.articleSlot, title: t.title, body: t.body, isActive: t.isActive,
                })}
                canPost={s?.canPost === true}
                currentTitle={s?.currentTitle ?? ''}
                confirmingPost={confirmPost === t.id}
                onAskPost={() => setConfirmPost(t.id)}
                onCancelPost={() => setConfirmPost(null)}
                onPost={() => onPost(t.id)}
                confirming={confirmDelete === t.id}
                onAskDelete={() => setConfirmDelete(t.id)}
                onCancelDelete={() => setConfirmDelete(null)}
                onDelete={() => onDelete(t.id)}
                busy={busy !== ''}
              />
            );
          })}
        </ul>
      </section>

      {/* ───────── ③ 文章を書く（開いたときだけ） ─────────
          ★ 第373便: 枠・タイトル・本文・自動で回すか、の4つだけ。★ 写真はここでは決めない（上の【写真】） */}
      {draft !== null && (
        <section className="bg-white border-2 border-indigo-300">
          <div className="px-3.5 py-3 border-b border-slate-200">
            <h2 className="text-[15px] font-black text-slate-800">
              {draft.id === null ? '文章を追加する' : '文章を直す'}
            </h2>
          </div>
          <div className="px-3.5 py-4 space-y-5">

            {/* ───── 枠 ─────
                ★★★ 枠に既定値を作らない。★ 選ばないと保存できない。
                ★★ 第167便: 状態を【ボタンの中】に書く。★ 別の節を見に行かせない */}
            <div>
              <label className="text-[13.5px] font-bold text-slate-600">どの枠に出しますか</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-1.5">
                {board.slots.map((s) => {
                  const on = draft.articleSlot === s.slot;
                  return (
                    <button
                      key={s.slot}
                      type="button"
                      onClick={() => setDraft({ ...draft, articleSlot: s.slot })}
                      className={
                        'text-left px-3 py-2 border ' +
                        (on ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50')
                      }
                    >
                      <b className={'text-[14.5px] font-black ' + (on ? 'text-indigo-800' : 'text-slate-700')}>
                        {s.label}
                      </b>
                      <span className={'block text-[12.5px] mt-0.5 ' + (s.state === 'hidden' || s.state === 'unknown' ? 'text-amber-700' : 'text-slate-400')}>
                        {s.short}
                      </span>
                    </button>
                  );
                })}
              </div>
              {/* ★★★ 選んだ枠の見立てを、その場で出す。★ 保存してから気づかせない */}
              {draft.articleSlot !== null && (
                <p className="text-[13.5px] text-slate-600 leading-relaxed mt-2 bg-slate-50 border border-slate-200 px-3 py-2">
                  {board.slots.find((s) => s.slot === draft.articleSlot)?.note}
                </p>
              )}
            </div>

            {/* ───── タイトル ─────
                ★ 決まりごと（文字数）は、その項目の右に出す。★ 下にまとめない */}
            <div>
              <div className="flex items-baseline justify-between gap-2">
                <label className="text-[13.5px] font-bold text-slate-600">タイトル</label>
                <span className={'text-[12.5px] tabular-nums ' + (overTitle ? 'text-rose-600 font-bold' : 'text-slate-400')}>
                  全角 {Math.ceil(width)} / {ARTICLE_TITLE_MAX_WIDTH}
                </span>
              </div>
              <input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                className={
                  'w-full mt-1 px-3 py-2.5 text-[15px] border outline-none ' +
                  (overTitle ? 'border-rose-400 focus:border-rose-500' : 'border-slate-300 focus:border-indigo-400')
                }
                placeholder="本日も元気に営業中です"
              />
              {overTitle && (
                <p className="text-[13px] text-rose-600 leading-relaxed mt-1">
                  長すぎます。このままでは駅ちかに断られます。
                </p>
              )}
            </div>

            {/* ───── 本文 ───── */}
            <div>
              <label className="text-[13.5px] font-bold text-slate-600">本文</label>
              {/* ★ 相手ができないと言っていることを、書く【前】に伝える */}
              <p className="text-[13px] text-slate-400 leading-relaxed mt-0.5">
                画像と外部リンクは駅ちかの決まりで入れられません。改行は
                <code className="mx-0.5 px-1 bg-slate-100">&lt;br&gt;</code>、
                段落は<code className="mx-0.5 px-1 bg-slate-100">&lt;p&gt;〜&lt;/p&gt;</code>で書けます。
              </p>
              <textarea
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                rows={6}
                className="w-full mt-1.5 px-3 py-2.5 text-[15px] border border-slate-300 focus:border-indigo-400 outline-none leading-relaxed"
                placeholder="本日も元気に営業しております。ご予約お待ちしております。"
              />
            </div>

            {/* ───── 自動で回すか ───── */}
            <label className="flex items-start gap-2 cursor-pointer border-t border-slate-100 pt-3.5">
              <input
                type="checkbox"
                checked={draft.isActive}
                onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
                className="mt-1"
              />
              <span className="text-[14px] text-slate-700 leading-relaxed">
                この文章を自動で回す
                <span className="block text-[13px] text-slate-400">
                  外しておくと保存だけされ、自動では出しません。
                </span>
              </span>
            </label>

            {/* ★★★ 保存ボタンを大きく。★ 「保存ボタンを押してなかったです」（2026-09-05・実際に起きた） */}
            <div className="flex items-center gap-3 border-t border-slate-200 pt-3.5">
              <button
                type="button"
                onClick={onSave}
                disabled={busy !== '' || draft.articleSlot === null}
                className="text-[16px] font-black px-7 py-3 bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40"
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
              {/* ★ 押せない理由を、ボタンの脇に書く。★ 灰色のまま黙らない */}
              {draft.articleSlot === null && (
                <span className="text-[13.5px] text-slate-400">上で枠を選ぶと保存できます</span>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ───────── ④ 自動で出す ───────── */}
      <section className="bg-white border border-slate-200">
        <div className="px-3.5 py-3 border-b border-slate-200">
          <h2 className="text-[15px] font-black text-slate-800">自動で出す</h2>
        </div>
        <div className="px-3.5 py-3.5 space-y-3">
          <div>
            <label className="text-[13.5px] font-bold text-slate-600">1日に出す本数</label>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {[0, 2, 3, 4, 6, 8].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => onSettings({ postsPerDay: n })}
                  disabled={busy !== ''}
                  className={
                    'text-[14px] font-bold px-3.5 py-2 border disabled:opacity-40 ' +
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
            <span className="text-[14px] text-slate-700 leading-relaxed">
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

      {/* ───────── ⑤ 送った記録 ───────── */}
      {board.runs.length > 0 && (
        <section className="bg-white border border-slate-200">
          <div className="px-3.5 py-3 border-b border-slate-200">
            <h2 className="text-[15px] font-black text-slate-800">駅ちかとのやりとり</h2>
            {/* ★★★ 「送った」と「載った」は別。★ そのことを見出しの下に書いておく */}
            <p className="text-[13.5px] text-slate-500 leading-relaxed mt-0.5">
              送っただけでは、公開ページに出たとは限りません。読み返して確かめたところまで残しています。
            </p>
          </div>
          <ul className="divide-y divide-slate-100">
            {board.runs.map((r) => (
              <li key={r.id} className="px-3.5 py-2.5 flex items-start gap-2.5">
                <span className={
                  'w-2 h-2 rounded-full flex-none mt-1.5 ' +
                  (r.outcome === 'ok' ? 'bg-emerald-500' : r.outcome === 'failed' ? 'bg-rose-500' : 'bg-slate-300')
                } />
                <div className="min-w-0 flex-1">
                  <span className="text-[13px] text-slate-400 tabular-nums">{fmt(r.createdAt)}</span>
                  <p className="text-[14px] text-slate-600 leading-relaxed mt-0.5">{r.summary}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {error && <p className="text-[14px] text-rose-600 leading-relaxed px-1">{error}</p>}
    </div>
  );
}

/**
 * ★★★ 写真1枚ぶんのタイル（第167便）。★ 第373便からは【写真の箱】の選択肢。
 *   ★ 写真を読めなかった方は、名前だけの四角にする。
 *   ★★ 「読み込めなかった」を空白にしない。★ 何のタイルか分かる文字を必ず置く。
 *   ★★ next/image は使わない（店舗様の外部URLで実行時に落ちる・第217便）
 */
function PhotoTile({
  on, name, photoUrl, onClick, disabled,
}: {
  on: boolean;
  name: string;
  photoUrl?: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled === true}
      aria-pressed={on}
      className={
        'text-left border p-1 disabled:opacity-60 ' +
        (on ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50')
      }
    >
      <span className="block aspect-square bg-slate-100 overflow-hidden relative">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-[12px] font-bold text-slate-400 text-center leading-tight px-1">
            {name}
          </span>
        )}
        {/* ★ 選んでいる印。★ 枠の色だけだと写真によっては見えにくい */}
        {on && (
          <span className="absolute left-1 top-1 text-[11px] font-black text-white bg-indigo-600 px-1.5 py-0.5">
            選択中
          </span>
        )}
      </span>
      <span className={'block text-[12.5px] font-bold truncate mt-1 px-0.5 ' + (on ? 'text-indigo-800' : 'text-slate-600')}>
        {name}
      </span>
    </button>
  );
}

/**
 * 登録した文章1本ぶん（第167便で作り直し、★ 第373便で左の写真を外した）。
 *   ★ 文章と写真は結びついていないので、文章の脇に写真を出すと嘘になる。
 *   ★ 真ん中に枠と状態とタイトル、右に操作。
 */
function TemplateItem({
  row, slotState, slotShort, photoNote, onEdit, confirming, onAskDelete, onCancelDelete, onDelete, busy,
  canPost, currentTitle, confirmingPost, onAskPost, onCancelPost, onPost,
}: {
  row: ArticleTemplateRow;
  slotState: string;
  slotShort: string;
  /** ★ 「いま出す」の確認に出す写真の1行（★ 箱の枚数だけで決まる） */
  photoNote: string;
  onEdit: () => void;
  confirming: boolean;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
  busy: boolean;
  canPost: boolean;
  currentTitle: string;
  confirmingPost: boolean;
  onAskPost: () => void;
  onCancelPost: () => void;
  onPost: () => void;
}) {
  const chip = STATE_CHIP[slotState] ?? STATE_CHIP.unknown;

  return (
    <li className="px-3.5 py-3">
      <div className="flex items-start gap-3">
        {/* ── 左：枠・状態・タイトル ── */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[12.5px] font-bold px-1.5 py-0.5 border border-slate-200 text-slate-600 bg-slate-50">
              {row.slotLabel}
            </span>
            <span className={'text-[12.5px] font-bold px-1.5 py-0.5 border ' + chip}>{slotShort}</span>
            {row.isActive
              ? <span className="text-[12.5px] font-bold text-emerald-700">自動で回す</span>
              : <span className="text-[12.5px] text-slate-400">回さない</span>}
          </div>
          <p className="text-[15px] font-bold text-slate-800 mt-1 break-words">{row.title}</p>
        </div>

        {/* ── 右：操作 ── */}
        <div className="flex items-center gap-1.5 flex-none">
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
              {/* ★★★ 出せない枠のときはボタンを出さない。★ 押せるように見せて断らない（設計メモ §32） */}
              {canPost && !confirmingPost && (
                <button type="button" onClick={onAskPost} disabled={busy}
                  className="text-[13.5px] font-bold px-3 py-1.5 border border-indigo-300 text-indigo-700 hover:bg-indigo-50 disabled:opacity-40">
                  いま出す
                </button>
              )}
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

      {/* ★★★ 押す前に【何が消えるか】を見せる。★ 新着は上書きなので、前の記事は戻らない */}
      {confirmingPost && (
        <div className="mt-2.5 p-3 bg-amber-50 border border-amber-200">
          <p className="text-[14px] text-slate-700 leading-relaxed">
            駅ちかの<b>{row.slotLabel}</b>を、この文章に書き換えます。
          </p>
          {/* ★★★ 第163便: 空の枠は【新しく作る】。★ 消えるものが無いのに「消えます」と書かない */}
          {slotState === 'empty'
            ? (
              <p className="text-[13.5px] text-slate-600 leading-relaxed mt-1">
                この枠はいま空いています。<b>新しく記事を作ります。</b>
              </p>
            )
            : currentTitle
              ? (
                <p className="text-[13.5px] text-slate-600 leading-relaxed mt-1">
                  いま入っている「<b>{currentTitle}</b>」は<b>消えます</b>（元に戻せません）。
                </p>
              )
              : (
                <p className="text-[13.5px] text-slate-600 leading-relaxed mt-1">
                  いま入っている記事は<b>消えます</b>（元に戻せません）。
                </p>
              )}
          {/* ★ 第373便: 写真の1行は箱の枚数だけで決まる。★ 文言は articlePhotoPick が作る */}
          <p className="text-[13.5px] text-slate-600 leading-relaxed mt-1">{photoNote}</p>
          {slotState === 'hidden' && (
            <p className="text-[13.5px] text-amber-800 leading-relaxed mt-1">
              なお、この枠はいま非表示です。送っても公開ページには出ません。
            </p>
          )}
          <div className="flex items-center gap-2 mt-2.5">
            <button type="button" onClick={onPost} disabled={busy}
              className="text-[15px] font-black px-5 py-2.5 bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40">
              書き換える
            </button>
            <button type="button" onClick={onCancelPost}
              className="text-[14px] font-bold px-3 py-2 text-slate-500 hover:text-slate-700">
              やめる
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
