'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getArticleBoard,
  readArticleSlots,
  saveArticleTemplate,
  deleteArticleTemplate,
  saveArticlePhotoPool,
  startArticlePost,
  type ArticleBoard,
  type ArticleTemplateRow,
  type ArticleSlotAuto,
} from '@/app/actions/articleTemplates';
import type { ArticleSlotAdvice } from '@/lib/articleSlotAdvice';
import { titleWidth, ARTICLE_TITLE_MAX_WIDTH } from '@/lib/ekichikaArticle';
// ★ 第375便: articlePhotoNote（選んだあとの青い箱）は画面から外した。★ 関数はライブラリに残っている
import { ARTICLE_PHOTO_MAX, articlePhotoConfirmNote } from '@/lib/articlePhotoPick';

// 新着情報を送る（第158便 → 第167便で作り直し → 第373便で写真を店舗の箱へ →
//   ★ 第376便で【カテゴリーごとの画面・1日1回】へ作り直し → 第377便でタブに →
//   ★ 第379便で【文章ごとに写真を1人固定】を足した・2026-09-15）。
//
// ★★★ 第376便の発端（カッキーさん・2026-09-15）
//   「各カテゴリー自動投稿は1日1回にします。手動投稿はなんどでもOK」
//   「レイアウトを各カテゴリーごと、/mypage のお知らせのようにしてほしいです」
//   「1カテゴリーにつき最大5投稿、自動更新用に用意できる仕様で」
//
// ★★★ 第376便で変えた4つ
//   ① 【カテゴリーごとの節】にした（★ マイページのお知らせと同じ形）
//        ★ 前 … 文章の一覧が1つ。★ 文章を書くときに「どの枠に出すか」を選ばせていた
//        ★ 後 … 枠ごとに節があり、その中に最大10本（★ 第384便で5本から）。★ **枠を選ぶ操作が消えた**
//        ★★ 第377便: 5つを縦に並べると長いので【タブ】にした（カッキーさん・2026-09-15）
//   ② 【自動は枠ごとに1日1回】
//        ★ 前 … 店舗ぜんぶで1日◯回（2/3/4/6/8回から選ぶ）。★ 手で出したぶんも数えていた
//        ★ 後 … 枠ごとに1日1回。★ 手動は何度でも（★ 自動とは別に数える）
//   ③ 【文章の編集を、その場で開く】
//        ★ 前 … 下に大きな「文章を書く」の節が出る
//        ★ 後 … カードを開くとそこに編集が出る（★ お知らせと同じ）
//   ④ 【「1日に出す本数」の設定を消した】★ 枠ごと1日1回に固定したので、選ぶものが無い
//
// ★★ 第167便から変えていないこと（★ 崩さない）
//   ・押す前に【何が消えるか】を見せる（★ 新着は上書き。前の記事は戻らない）
//   ・「送った」と「載った」と「公開ページに出た」を分けて書く
//   ・この画面のどの操作も、勝手に駅ちかを書き換えない
//   ・決まりごとは、その項目の脇に書く。★ 保存ボタンは大きく

// ★ 第380便: 枠の状態バッジ（STATE_CHIP）は画面から外した。★ 色分けは articleSlotAdvice の state に残っている

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

/**
 * ★ 開いているカードの下書き。★ 保存するまで DB には触らない。
 *   ★ photoId … この文章だけ固定で出す写真の持ち主（第379便）。★ null は「店舗の写真から1枚」
 */
type Draft = { title: string; body: string; photoId: number | null };

/** ★ 2つの並びが同じか（★ 順番も見る）。★ 写真の箱の「変えたか」に使う */
function sameIds(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export function NewsBoard({ salonId, onToast }: { salonId: number | null; onToast: (m: string) => void }) {
  const [board, setBoard] = useState<ArticleBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  /** ★ 開いているカード。★ 'new-3'（枠3の新規）／'tpl-12'（文章12） */
  const [open, setOpen] = useState<Set<string>>(new Set());
  /** ★ 開いているカードの下書き。★ 同じキー */
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  /** ★ 「いま出す」の確認を出している文章 */
  const [confirmPost, setConfirmPost] = useState<number | null>(null);

  /** ★★ 写真の箱の【画面の側の控え】（第373便）。★ 保存するまで DB には触らない */
  const [pool, setPool] = useState<number[]>([]);
  /** ★★ 写真の節を開いているか（第374便）。★ 普段は畳む */
  const [openPhoto, setOpenPhoto] = useState(false);
  /**
   * ★★★ いま見ているカテゴリー（第377便）。★ 既定は枠1（速報NEWS）。
   *   ★ タブを替えても、開いているカードや書きかけは消えない（★ キーが枠ごとに違う）
   */
  const [pickedSlot, setPickedSlot] = useState<number>(1);

  /**
   * ★ 結果が届くのを待っている印。値は【押した時点でいちばん新しかった記録のid】。
   *   ★★★ 「verify_article があるか」で止めてはいけない。★ 前回の送信の行が残っているから。
   *   → ★ この id より **新しい行が来たとき**だけ止める。
   */
  const [waitFrom, setWaitFrom] = useState<number | null>(null);
  const pollCount = useRef(0);
  /** ★ 最後に DB から読んだ写真の箱。★ null は「まだ一度も読んでいない」 */
  const serverPool = useRef<number[] | null>(null);

  const load = useCallback(async () => {
    if (salonId == null) return;
    const r = await getArticleBoard({ salonId });
    if (!r.ok) { setError(r.error); setLoading(false); return; }
    setBoard(r.data);
    // ★★ 箱の控えは【DBの箱が変わったとき】だけ揃える。
    //   ★ 送ったあとの15秒ごとの読み直しで、選びかけの写真が消えないように
    if (serverPool.current === null || !sameIds(serverPool.current, r.data.photoIds)) {
      setPool(r.data.photoIds);
    }
    // ★ 初めて読んだときだけ、写真の節を開くかどうかを決める（★ あとは店舗様の開閉にまかせる）
    if (serverPool.current === null) setOpenPhoto(r.data.photoIds.length === 0);
    serverPool.current = r.data.photoIds;
    setError('');
    setLoading(false);
  }, [salonId]);

  useEffect(() => { void load(); }, [load]);

  // ★★★ 押したあと、結果が届くまで自分で見にいく（第159便）。
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

  const toggleOpen = (key: string, init?: Draft) => {
    const next = new Set(open);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
      // ★ 開くときに下書きを用意する。★ すでにあれば書きかけをそのまま残す
      if (init && drafts[key] === undefined) setDrafts({ ...drafts, [key]: init });
    }
    setOpen(next);
  };
  const closeKey = (key: string) => {
    const next = new Set(open);
    next.delete(key);
    setOpen(next);
    const d = { ...drafts };
    delete d[key];
    setDrafts(d);
  };
  const setDraft = (key: string, patch: Partial<Draft>) => {
    const cur = drafts[key] ?? { title: '', body: '', photoId: null };
    setDrafts({ ...drafts, [key]: { ...cur, ...patch } });
  };

  const onRead = async () => {
    setBusy('read');
    const r = await readArticleSlots({ salonId });
    setBusy('');
    // ★ 断られた理由（別の手順が走っている等）も、そのまま出す。★ 握りつぶさない
    onToast(r.ok ? r.data.note : r.error);
  };

  /** ★ 新しく書く（枠ごと）。★ 既定は「回さない」（★ 作っただけでは何も起きない） */
  const onCreate = async (articleSlot: number) => {
    const key = 'new-' + articleSlot;
    const d = drafts[key] ?? { title: '', body: '', photoId: null };
    setBusy('save');
    const r = await saveArticleTemplate({
      salonId, articleSlot, title: d.title, body: d.body, isActive: false,
      photoTherapistId: d.photoId,
    });
    setBusy('');
    if (!r.ok) { onToast(r.error); return; }
    closeKey(key);
    onToast('保存しました');
    await load();
  };

  /** ★ 直す（タイトルと本文だけ）。★ 自動で回すかは、その場のボタンが持つ */
  const onUpdate = async (row: ArticleTemplateRow) => {
    const key = 'tpl-' + row.id;
    const d = drafts[key] ?? { title: row.title, body: row.body, photoId: row.photoTherapistId };
    setBusy('save');
    const r = await saveArticleTemplate({
      salonId, id: row.id, articleSlot: row.articleSlot, title: d.title, body: d.body,
      photoTherapistId: d.photoId,
    });
    setBusy('');
    if (!r.ok) { onToast(r.error); return; }
    closeKey(key);
    onToast('書き換えました');
    await load();
  };

  /**
   * ★★ 自動で回すかを、その場で切り替える（★ 保存を経由しない・お知らせと同じ）。
   *   ★ 送るタイトルと本文は【いまDBに入っている値】。★ 書きかけを勝手に保存しない
   */
  const onToggleActive = async (row: ArticleTemplateRow) => {
    setBusy('active');
    const r = await saveArticleTemplate({
      salonId, id: row.id, articleSlot: row.articleSlot,
      title: row.title, body: row.body, isActive: !row.isActive,
    });
    setBusy('');
    if (!r.ok) { onToast(r.error); return; }
    onToast(row.isActive ? '自動投稿をやめました' : '自動投稿にしました');
    await load();
  };

  const onDelete = async (id: number) => {
    setBusy('del');
    const r = await deleteArticleTemplate({ salonId, id });
    setBusy('');
    setConfirmDelete(null);
    if (!r.ok) { onToast(r.error); return; }
    closeKey('tpl-' + id);
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

  return (
    <div className="space-y-5">
      {/* ★★ 押したあと、届くまでのあいだ。★ 「押したのに何も起きない」を作らない */}
      {waitFrom !== null && (
        <p className="text-[14px] text-indigo-800 bg-indigo-50 border border-indigo-200 px-3.5 py-2.5 leading-relaxed">
          駅ちかへ送っています。結果が出るまで1〜2分かかります。この画面のままお待ちください。
        </p>
      )}

      {/* ───────── ★★★ まだ一度も読んでいないとき（第167便） ───────── */}
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
      ) : null}

      {/* ★★★ 第378便（カッキーさん・2026-09-15）: ここにあった2行を消した。
          ★ 前 … 「いますぐ使える枠は5つです…」＋「9/6 15:46 に駅ちかを確認しました／今日はここまで◯本」
          ★ 後 … **自動投稿が動く条件**だけを置く。★ 枠の状態は、下のタブと節の中で枠ごとに見える。
          ★★ 消した2行のうち【読み直す】は、枠の状態バッジの脇へ移した（★ 入口は失わせない）。
             ★ 「この状態はいつのものか」を直すボタンなので、状態のすぐ隣がいちばん意味が通る。
          ★ board.summary / board.postedToday は受け口に残してある（★ 戻すならここに1行） */}
      <p className="text-[14px] text-amber-800 bg-amber-50 border border-amber-200 px-3.5 py-2.5 leading-relaxed">
        「フクエスから反映」の時のみ自動投稿できます。
      </p>

      {/* ───────── ① 写真（第373便・店舗に1つ／第374便でアコーディオン） ───────── */}
      <section className="bg-white border border-slate-200">
        <button
          type="button"
          onClick={() => setOpenPhoto(!openPhoto)}
          aria-expanded={openPhoto}
          className="w-full text-left px-3.5 py-3 flex items-start justify-between gap-3 hover:bg-slate-50"
        >
          <div className="min-w-0">
            <h2 className="text-[15px] font-black text-slate-800">写真</h2>
            <p className="text-[13.5px] text-slate-500 leading-relaxed mt-0.5">
              選んだ1枚がランダムで表示されます。
            </p>
          </div>
          <span className="flex items-center gap-2 flex-none pt-0.5">
            {poolDirty && <span className="text-[12.5px] font-bold text-amber-700">未保存</span>}
            <span className="text-[13px] text-slate-400 tabular-nums">
              {pool.length} / {ARTICLE_PHOTO_MAX} 枚
            </span>
            <span className={'text-[13px] text-slate-400 ' + (openPhoto ? 'rotate-180' : '')}>▼</span>
          </span>
        </button>

        {openPhoto && (
          <div className="px-3.5 py-3.5 border-t border-slate-200">
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
        )}
      </section>

      {/* ───────── ② カテゴリーのタブ（第377便・2026-09-15・カッキーさん） ─────────
          ★★★ 5つの節を縦に並べると画面が長い。★ タブで1つずつ出す。
          ★ 形は写メ日記の投稿先ページ（DiaryTargets・第371便）と同じ:
            ★ grid の等分（★ 文字数で幅がバラバラにならない）
            ★ スマホは2列・中くらいで3列・広い画面で5列（★ 「激アツ割引情報」が折れない幅を確保）
          ★★ タブには【本数】を出す。★ 開かなくても、どの枠が空かが分かる */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {board.slots.map((s) => {
          const on = pickedSlot === s.slot;
          const auto = board.slotAuto.find((a) => a.slot === s.slot);
          return (
            <button
              key={s.slot}
              type="button"
              onClick={() => setPickedSlot(s.slot)}
              aria-pressed={on}
              className={
                'px-3 py-2 border text-left transition-colors ' +
                (on
                  ? 'bg-indigo-50 text-indigo-700 border-indigo-300'
                  : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50')
              }
            >
              <span className={'block text-[14px] font-bold ' + (on ? 'text-indigo-800' : 'text-slate-600')}>
                {s.label}
              </span>
              <span className="block text-[12.5px] tabular-nums mt-0.5">
                {auto?.count ?? 0} / {board.perSlotMax} 本
                {/* ★ 自動で回っている本数。★ 0なら何も出さない（★ 「0件」と書かない） */}
                {auto !== undefined && auto.activeCount > 0 && (
                  <span className={on ? 'text-emerald-700' : 'text-emerald-600'}>
                    ・自動{auto.activeCount}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* ───────── ③ 選んだカテゴリー（第376便） ─────────
          ★ 「どの枠へ出すか」を選ぶ操作は無い。★ このタブで書けば、この枠へ出る */}
      {board.slots.filter((s) => s.slot === pickedSlot).map((s) => {
        const auto = board.slotAuto.find((a) => a.slot === s.slot);
        const rows = board.templates.filter((t) => t.articleSlot === s.slot);
        const newKey = 'new-' + s.slot;
        return (
          <SlotSection
            key={s.slot}
            advice={s}
            auto={auto}
            perSlotMax={board.perSlotMax}
            rows={rows}
            poolPhotoCount={board.photoIds.length}
            busy={busy !== ''}
            therapists={board.therapists}
            poolCount={board.photoIds.length}
            open={open}
            drafts={drafts}
            newOpen={open.has(newKey)}
            onToggleNew={() => toggleOpen(newKey, { title: '', body: '', photoId: null })}
            onCancelNew={() => closeKey(newKey)}
            onCreate={() => onCreate(s.slot)}
            onToggleRow={(row) => toggleOpen('tpl-' + row.id, { title: row.title, body: row.body, photoId: row.photoTherapistId })}
            onCancelRow={(row) => closeKey('tpl-' + row.id)}
            onUpdate={onUpdate}
            onToggleActive={onToggleActive}
            setDraft={setDraft}
            confirmDelete={confirmDelete}
            onAskDelete={setConfirmDelete}
            onDelete={onDelete}
            confirmPost={confirmPost}
            onAskPost={setConfirmPost}
            onPost={onPost}
          />
        );
      })}

      {/* ★★★ 第380便: 「自動で出す」の節（店舗の元栓）を消した（カッキーさん・2026-09-15）。
          ★ 「デフォルトが自動で出す。出したくなかったら文章で自動設定を止めてもらう」
          ★★ 止める場所は【文章の「自動投稿中」ボタン】ひとつ。★ 元栓と印の2か所を持たない。
          ★ 暴発しない: 新しく作った文章の印は **付いていない**（★ 第43便の作法）。
          ★ 受け口 saveArticleSettings と列 auto_enabled は残してある（★ 戻すならここに節を1つ） */}

      {/* ───────── ④ 送った記録 ───────── */}
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
 * ★★★ カテゴリー1つぶんの節（第376便）。★ マイページのお知らせと同じ形。
 *   ・見出し … 枠の名前・枠の状態・何本あるか
 *   ・その下 … 自動投稿の1行（★ 文言は articleRotation が作る）
 *   ・「＋ 新しく書く」… 開くとその場にフォーム（★ 枠を選ばせない）
 *   ・文章カード … 閉じているときはバー、開くと編集と操作
 */
function SlotSection({
  advice, auto, perSlotMax, rows, poolPhotoCount, busy, therapists, poolCount,
  open, drafts, newOpen, onToggleNew, onCancelNew, onCreate,
  onToggleRow, onCancelRow, onUpdate, onToggleActive, setDraft,
  confirmDelete, onAskDelete, onDelete,
  confirmPost, onAskPost, onPost,
}: {
  advice: ArticleSlotAdvice;
  auto: ArticleSlotAuto | undefined;
  perSlotMax: number;
  rows: ArticleTemplateRow[];
  /** ★ 店舗の箱の枚数。★ 「いま出す」の確認の1行をここで作る（★ 固定の有無は行ごとに違う） */
  poolPhotoCount: number;
  busy: boolean;
  /** ★ 第379便: 文章ごとの写真の固定に使う（★ 写真がある方ぜんぶ） */
  therapists: Array<{ id: number; name: string; photoUrl: string }>;
  /** ★ 店舗の箱の枚数（★ 固定していないときに何から選ばれるかを言うため） */
  poolCount: number;
  open: Set<string>;
  drafts: Record<string, Draft>;
  newOpen: boolean;
  onToggleNew: () => void;
  onCancelNew: () => void;
  onCreate: () => void;
  onToggleRow: (row: ArticleTemplateRow) => void;
  onCancelRow: (row: ArticleTemplateRow) => void;
  onUpdate: (row: ArticleTemplateRow) => void;
  onToggleActive: (row: ArticleTemplateRow) => void;
  setDraft: (key: string, patch: Partial<Draft>) => void;
  confirmDelete: number | null;
  onAskDelete: (id: number | null) => void;
  onDelete: (id: number) => void;
  confirmPost: number | null;
  onAskPost: (id: number | null) => void;
  onPost: (id: number) => void;
}) {
  const newKey = 'new-' + advice.slot;
  const nd = drafts[newKey] ?? { title: '', body: '', photoId: null };
  const canAdd = auto?.canAdd !== false;

  return (
    <section className="bg-white border border-slate-200">
      {/* ── 見出し ── */}
      <div className="px-3.5 py-3 border-b border-slate-200">
        {/* ★ 第377便: 本数はタブに出ている（★ 同じ話を2回書かない）
            ★★ 第380便: 枠の状態バッジ（「空いています」）と「読み直す」も消した（カッキーさん）。
               ★ 状態は【押す前の確認】でちゃんと出る（★ 空なら「新しく作ります」、非表示なら「公開ページには出ません」）。
               ★ 読み直す入口は、まだ一度も読んでいないときの大きなカードに残っている。
               ★★ advice.state / canPost / currentTitle は下の確認で使い続けている */}
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-[15px] font-black text-slate-800">{advice.label}</h2>
        </div>
        {/* ★★ 自動投稿の1行。★ 文言は articleRotation が作る（★ 画面で作らない） */}
        <p className="text-[13px] font-bold text-slate-500 mt-1.5">自動投稿（1日1回）</p>
        {auto && auto.note !== null && (
          <p className="text-[13.5px] text-slate-500 leading-relaxed mt-0.5">{auto.note}</p>
        )}
      </div>

      {/* ── ＋ 新しく書く ──
          ★ 上限（第384便から10本）までたまっていたら出さない。★ 押せるように見せて断らない（設計メモ §32） */}
      <div className="px-3.5 py-2.5 border-b border-slate-100">
        {canAdd ? (
          <button
            type="button"
            onClick={newOpen ? onCancelNew : onToggleNew}
            aria-expanded={newOpen}
            className="text-[14px] font-bold px-3.5 py-2 border border-indigo-300 text-indigo-700 hover:bg-indigo-50"
          >
            {newOpen ? '閉じる' : '＋ 新しく書く'}
          </button>
        ) : (
          <p className="text-[13.5px] text-slate-400 leading-relaxed">
            この枠は{perSlotMax}本たまっています。新しく書くには、どれかを消してください。
          </p>
        )}
      </div>

      {newOpen && (
        <div className="px-3.5 py-4 border-b border-slate-200 bg-slate-50/60">
          <Editor
            draft={nd}
            onChange={(patch) => setDraft(newKey, patch)}
            busy={busy}
            saveLabel="保存する"
            onSave={onCreate}
            onCancel={onCancelNew}
            therapists={therapists}
            poolCount={poolCount}
          />
          <p className="text-[13px] text-slate-400 leading-relaxed mt-2">
            保存しただけでは自動では出ません。あとで「自動投稿にする」を押してください。
          </p>
        </div>
      )}

      {/* ── 文章のカード ── */}
      {rows.length === 0 ? (
        <p className="px-3.5 py-5 text-[14px] text-slate-400 leading-relaxed">
          この枠にはまだ文章がありません。
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((row) => {
            const key = 'tpl-' + row.id;
            const isOpen = open.has(key);
            const d = drafts[key] ?? { title: row.title, body: row.body, photoId: row.photoTherapistId };
            return (
              <li key={row.id}>
                {/* ── 閉じているときのバー（★ お知らせと同じ並び） ── */}
                <button
                  type="button"
                  onClick={() => (isOpen ? onCancelRow(row) : onToggleRow(row))}
                  aria-expanded={isOpen}
                  className="w-full text-left px-3.5 py-3 flex items-center gap-2 hover:bg-slate-50"
                >
                  {row.isActive ? (
                    <span className="text-[12px] font-bold px-2 py-0.5 border border-emerald-200 text-emerald-700 bg-emerald-50 flex-none">
                      自動投稿中
                    </span>
                  ) : (
                    <span className="text-[12px] font-bold px-2 py-0.5 border border-slate-200 text-slate-400 flex-none">
                      手動のみ
                    </span>
                  )}
                  <span className="text-[14.5px] font-bold text-slate-800 truncate min-w-0">
                    {row.title || '(タイトル未設定)'}
                  </span>
                  <span className="ml-auto flex items-center gap-2 flex-none">
                    {/* ★★ 第379便: 写真を固定している文章は、開かなくても分かるようにする */}
                    {row.photoTherapistId !== null && (
                      <span className="text-[12px] font-bold px-1.5 py-0.5 border border-indigo-200 text-indigo-700 bg-indigo-50">
                        写真：{row.photoTherapistName || '指定あり'}
                      </span>
                    )}
                    {/* ★ 最後に出した日時。★ 一度も出していなければ何も出さない（★ 「なし」と書かない） */}
                    {row.lastPostedAt !== null && (
                      <span className="hidden sm:inline text-[12px] text-slate-400 tabular-nums">
                        {fmt(row.lastPostedAt)} に投稿
                      </span>
                    )}
                    <span className={'text-[13px] text-slate-400 ' + (isOpen ? 'rotate-180' : '')}>▼</span>
                  </span>
                </button>

                {/* ── 開いたとき ── */}
                {isOpen && (
                  <div className="px-3.5 pb-4 pt-1 border-t border-slate-100">
                    {/* ★ 操作は上（★ お知らせと同じ）。★ 押した時点で効くものと、保存が要るものを分ける */}
                    <div className="flex flex-wrap items-center gap-2 justify-end pb-3">
                      <button
                        type="button"
                        onClick={() => onToggleActive(row)}
                        disabled={busy}
                        title={row.isActive
                          ? '1日1回・順番に1本ずつ自動で出しています。押すとやめます'
                          : '押すと、この枠の自動投稿のローテーションに入ります'}
                        className={
                          'text-[13.5px] font-bold px-3 py-1.5 border disabled:opacity-40 ' +
                          (row.isActive
                            ? 'border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                            : 'border-slate-200 text-slate-500 hover:bg-slate-50')
                        }
                      >
                        {row.isActive ? '自動投稿中' : '自動投稿にする'}
                      </button>
                      {/* ★★★ 出せない枠のときはボタンを出さない。★ 押せるように見せて断らない */}
                      {advice.canPost && confirmPost !== row.id && (
                        <button
                          type="button"
                          onClick={() => onAskPost(row.id)}
                          disabled={busy}
                          className="text-[13.5px] font-bold px-3 py-1.5 border border-indigo-300 text-indigo-700 hover:bg-indigo-50 disabled:opacity-40"
                        >
                          すぐ投稿
                        </button>
                      )}
                      {confirmDelete === row.id ? (
                        <>
                          <button
                            type="button"
                            onClick={() => onDelete(row.id)}
                            disabled={busy}
                            className="text-[13.5px] font-bold px-2.5 py-1.5 border border-rose-200 text-rose-700 hover:bg-rose-50 disabled:opacity-40"
                          >
                            消します
                          </button>
                          <button
                            type="button"
                            onClick={() => onAskDelete(null)}
                            className="text-[13.5px] font-bold px-2 py-1.5 text-slate-500 hover:text-slate-700"
                          >
                            やめる
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onAskDelete(row.id)}
                          className="text-[13.5px] font-bold px-2 py-1.5 text-slate-400 hover:text-rose-600"
                        >
                          消す
                        </button>
                      )}
                    </div>

                    {/* ★★★ 押す前に【何が消えるか】を見せる。★ 新着は上書きなので、前の記事は戻らない */}
                    {confirmPost === row.id && (
                      <div className="mb-3 p-3 bg-amber-50 border border-amber-200">
                        <p className="text-[14px] text-slate-700 leading-relaxed">
                          駅ちかの<b>{advice.label}</b>を、この文章に書き換えます。
                        </p>
                        {/* ★★★ 第163便: 空の枠は【新しく作る】。★ 消えるものが無いのに「消えます」と書かない */}
                        {advice.state === 'empty' ? (
                          <p className="text-[13.5px] text-slate-600 leading-relaxed mt-1">
                            この枠はいま空いています。<b>新しく記事を作ります。</b>
                          </p>
                        ) : advice.currentTitle ? (
                          <p className="text-[13.5px] text-slate-600 leading-relaxed mt-1">
                            いま入っている「<b>{advice.currentTitle}</b>」は<b>消えます</b>（元に戻せません）。
                          </p>
                        ) : (
                          <p className="text-[13.5px] text-slate-600 leading-relaxed mt-1">
                            いま入っている記事は<b>消えます</b>（元に戻せません）。
                          </p>
                        )}
                        <p className="text-[13.5px] text-slate-600 leading-relaxed mt-1">
                          {/* ★★ 第379便: この文章が誰かに固定していれば、その人の話をする（★ 箱の枚数の話をしない） */}
                          {articlePhotoConfirmNote(poolPhotoCount, row.photoTherapistName || null)}
                        </p>
                        {advice.state === 'hidden' && (
                          <p className="text-[13.5px] text-amber-800 leading-relaxed mt-1">
                            なお、この枠はいま非表示です。送っても公開ページには出ません。
                          </p>
                        )}
                        {/* ★ 手で出しても、この枠の自動（1日1回）は止まらない。★ 押す前に言う */}
                        <p className="text-[13.5px] text-slate-500 leading-relaxed mt-1">
                          手で出しても、この枠の自動投稿は今日ぶんが別に出ます。
                        </p>
                        <div className="flex items-center gap-2 mt-2.5">
                          <button
                            type="button"
                            onClick={() => onPost(row.id)}
                            disabled={busy}
                            className="text-[15px] font-black px-5 py-2.5 bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40"
                          >
                            書き換える
                          </button>
                          <button
                            type="button"
                            onClick={() => onAskPost(null)}
                            className="text-[14px] font-bold px-3 py-2 text-slate-500 hover:text-slate-700"
                          >
                            やめる
                          </button>
                        </div>
                      </div>
                    )}

                    <Editor
                      draft={d}
                      onChange={(patch) => setDraft(key, patch)}
                      busy={busy}
                      saveLabel="書き換える"
                      onSave={() => onUpdate(row)}
                      onCancel={() => onCancelRow(row)}
                      therapists={therapists}
                      poolCount={poolCount}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/**
 * ★ タイトル・本文・写真の指定だけの編集。★ 新規も直すも同じ部品（★ 2つ作らない）。
 *   ★ 決まりごと（文字数・画像とリンクは入れられない）は、その項目の脇に書く
 */
function Editor({
  draft, onChange, busy, saveLabel, onSave, onCancel, therapists, poolCount,
}: {
  draft: Draft;
  onChange: (patch: Partial<Draft>) => void;
  busy: boolean;
  saveLabel: string;
  onSave: () => void;
  onCancel: () => void;
  /** ★ 写真がある方ぜんぶ（★ 店舗の箱の10枚に限らない・第379便） */
  therapists: Array<{ id: number; name: string; photoUrl: string }>;
  /** ★ 店舗の箱に入っている枚数。★ 「ふだんは何から選ばれるか」を言うため */
  poolCount: number;
}) {
  const width = titleWidth(draft.title);
  const over = width > ARTICLE_TITLE_MAX_WIDTH;
  /** ★ 固定する方を選ぶ並びを開いているか。★ 普段は閉じておく（★ 40人ぶんのタイルは重い） */
  const [pickOpen, setPickOpen] = useState(false);
  const fixed = draft.photoId === null ? null : therapists.find((t) => t.id === draft.photoId) ?? null;
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <label className="text-[13.5px] font-bold text-slate-600">タイトル</label>
          <span className={'text-[12.5px] tabular-nums ' + (over ? 'text-rose-600 font-bold' : 'text-slate-400')}>
            全角 {Math.ceil(width)} / {ARTICLE_TITLE_MAX_WIDTH}
          </span>
        </div>
        <input
          value={draft.title}
          onChange={(e) => onChange({ title: e.target.value })}
          className={
            'w-full mt-1 px-3 py-2.5 text-[15px] border outline-none bg-white ' +
            (over ? 'border-rose-400 focus:border-rose-500' : 'border-slate-300 focus:border-indigo-400')
          }
          placeholder="本日も元気に営業中です"
        />
        {over && (
          <p className="text-[13px] text-rose-600 leading-relaxed mt-1">
            長すぎます。このままでは駅ちかに断られます。
          </p>
        )}
      </div>

      <div>
        <label className="text-[13.5px] font-bold text-slate-600">本文</label>
        {/* ★ 相手ができないと言っていることを、書く【前】に伝える */}
        <p className="text-[13px] text-slate-400 leading-relaxed mt-0.5">
          画像と外部リンクは不可。改行は
          <code className="mx-0.5 px-1 bg-slate-100">&lt;br&gt;</code>、
          段落は<code className="mx-0.5 px-1 bg-slate-100">&lt;p&gt;〜&lt;/p&gt;</code>で書けます。
        </p>
        <textarea
          value={draft.body}
          onChange={(e) => onChange({ body: e.target.value })}
          rows={6}
          className="w-full mt-1.5 px-3 py-2.5 text-[15px] border border-slate-300 focus:border-indigo-400 outline-none leading-relaxed bg-white"
          placeholder="本日も元気に営業しております。ご予約お待ちしております。"
        />
      </div>

      {/* ───── 写真（第379便・2026-09-15・カッキーさん） ─────
          ★★★ 発端「新人速報、場合によっては速報NEWSや他のカテゴリーでも
             特定のセラピストの写真を出す必要がある場面があると思います」
          ★★ ふだんは店舗の箱からランダム。★ この文章だけ特定の方に固定できる。
          ★ 固定は【1人だけ】。★ 第172便の「何枚でも選べる」には戻さない（★ 店舗の箱と二重になる） */}
      <div className="border-t border-slate-100 pt-3.5">
        <label className="text-[13.5px] font-bold text-slate-600">写真</label>
        {fixed === null && draft.photoId !== null ? (
          // ★★ 固定していた方の写真が消えた／見つからない。★ 黙って店舗の箱に落とさず、言う
          <p className="text-[13.5px] text-amber-700 leading-relaxed mt-1">
            固定していた方が見つかりません（写真が外された可能性があります）。選び直すか、店舗の写真に戻してください。
          </p>
        ) : null}

        <div className="flex items-center gap-2 flex-wrap mt-1">
          {fixed !== null ? (
            <>
              <span className="w-9 h-9 flex-none bg-slate-100 overflow-hidden">
                {fixed.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={fixed.photoUrl} alt="" className="w-full h-full object-cover" />
                ) : null}
              </span>
              <span className="text-[14px] text-slate-700">
                <b>{fixed.name}</b> の写真で固定します。
              </span>
            </>
          ) : (
            <span className="text-[14px] text-slate-600">
              {poolCount === 0
                ? '駅ちかに入っている写真がそのまま残ります（上の「写真」で選ぶと、そこから1枚入ります）。'
                : '上の「写真」で選んだ ' + poolCount + ' 枚から1枚がランダムで入ります。'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 flex-wrap mt-1.5">
          <button
            type="button"
            onClick={() => setPickOpen(!pickOpen)}
            disabled={busy}
            className="text-[13.5px] font-bold px-3 py-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            {pickOpen ? '閉じる' : draft.photoId === null ? 'この文章だけ、特定の方に固定する' : '選び直す'}
          </button>
          {draft.photoId !== null && (
            <button
              type="button"
              onClick={() => { onChange({ photoId: null }); setPickOpen(false); }}
              disabled={busy}
              className="text-[13.5px] font-bold px-2 py-1.5 text-slate-500 hover:text-slate-700 disabled:opacity-40"
            >
              固定をやめる
            </button>
          )}
        </div>

        {pickOpen && (
          therapists.length === 0 ? (
            <p className="text-[13.5px] text-slate-500 leading-relaxed mt-2">
              フクエスに写真が登録されている方がまだいません。セラピストの登録で写真を入れると、ここから選べるようになります。
            </p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-2">
              {therapists.map((t) => (
                <PhotoTile
                  key={t.id}
                  on={draft.photoId === t.id}
                  name={t.name}
                  photoUrl={t.photoUrl}
                  onClick={() => { onChange({ photoId: draft.photoId === t.id ? null : t.id }); setPickOpen(false); }}
                  disabled={busy}
                />
              ))}
            </div>
          )
        )}
      </div>

      {/* ★★★ 保存ボタンを大きく。★ 「保存ボタンを押してなかったです」（2026-09-05・実際に起きた） */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={busy}
          className="text-[16px] font-black px-7 py-3 bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40"
        >
          {saveLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-[14px] font-bold px-3 py-2 text-slate-500 hover:text-slate-700"
        >
          やめる
        </button>
      </div>
    </div>
  );
}

/**
 * ★★★ 写真1枚ぶんのタイル（第167便）。★ 第373便からは【写真の箱】の選択肢。
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
