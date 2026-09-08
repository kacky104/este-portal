'use client';

// ★★★ セラピスト共通画像（運営）（第217便・第218便・2026-09-08・カッキーさんの指示）
//
//   ① 写真なしの子に出す既定画像（第217便）
//      写真が1枚も無いセラピストのカードに出す、フクエス共通の画像。
//      ★ 店舗様が /mypage（店舗画像）で入れた画像があればそちらが勝つ（★ 本人 → 店舗 → 運営）。
//      ★ 決め方は src/lib/therapistPlaceholder.ts（番人あり）。
//      保存先: page_heroes 'therapist_placeholder' ／ RPC admin_set_therapist_placeholder
//   ② 「一覧を見る」カードの画像（第218便）
//      出勤中・新人の横スクロールの末尾カード（TOP・地域ページ）。無ければピンク→オレンジのグラデーション。
//      保存先: page_heroes 'list_more_card' ／ RPC admin_set_list_more_card_image
//
//   ★ どちらも【1枚だけ】。★ ヒーロー画像の RPC（admin_set_page_hero_image）の許可リストには入れていない
//     （あちらは PC/SP の2枚・ページの無効化と結びついていて用途が違う）。
//   ★ 画像の置き場: header-slider バケット（PageHeroManager と同じ）。
//   ★ 枠を増やすときは下の SLOTS に1行足し、同じ形の RPC を1本足す。★ 画面の作りは触らない。
import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/app/lib/supabase/client';
import { revalidateTopAndAreas } from '@/app/lib/revalidateTop';
import { THERAPIST_PLACEHOLDER_KEY } from '@/lib/therapistPlaceholder';
import { LIST_MORE_CARD_KEY } from '@/app/lib/siteImages';

const BUCKET = 'header-slider';

type Slot = {
  key: string;        // page_heroes.page_key
  rpc: string;        // 書くときの RPC 名（p_url 1つ）
  folder: string;     // バケット内のフォルダ
  title: string;
  help: string;
  ratio: string;      // プレビュー枠の比
  successNote: string;
};

const SLOTS: ReadonlyArray<Slot> = [
  {
    key: THERAPIST_PLACEHOLDER_KEY,
    rpc: 'admin_set_therapist_placeholder',
    folder: 'therapist-placeholder',
    title: '写真なしの子に出す共通画像',
    help: '写真が1枚も無いセラピストのカード（トップ・地域・店舗ページ・ランキング・出勤表・写メ日記・本人ページ・公式HP）に出します。店舗が自分の既定画像を入れている場合はそちらが優先されます。推奨：縦長（3:4）1080×1440px。',
    ratio: 'aspect-[3/4]',
    successNote: '（反映まで最大10分）',
  },
  {
    key: LIST_MORE_CARD_KEY,
    rpc: 'admin_set_list_more_card_image',
    folder: 'list-more-card',
    title: '「一覧を見る」カードの画像',
    help: 'トップ・地域ページの「現在出勤中のセラピスト」「新人セラピスト」の横スクロール末尾にある「一覧を見る」カードの背景です。未設定ならピンク→オレンジのグラデーション。文字は白で下に重なるので、下側が暗めの画像だと読みやすくなります。推奨：縦長（3:4）1080×1440px。',
    ratio: 'aspect-[11/16]',
    successNote: '',
  },
];

function ImageSlot({ slot, onToast }: { slot: Slot; onToast: (msg: string) => void }) {
  const supabase = createClient();
  const [url, setUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    supabase
      .from('page_heroes')
      .select('image_url')
      .eq('page_key', slot.key)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        setUrl(((data as { image_url?: string | null } | null)?.image_url) ?? null);
        setLoaded(true);
      });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot.key]);

  const onFile = async (file: File) => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { onToast('JPEG / PNG / WebP のみアップロードできます'); return; }
    if (file.size > 5 * 1024 * 1024) { onToast('画像は5MBまでです'); return; }
    setBusy(true);
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `${slot.folder}/default_${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) { setBusy(false); onToast(`アップロードに失敗しました: ${upErr.message}`); return; }
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const { error: rpcErr } = await supabase.rpc(slot.rpc, { p_url: pub.publicUrl });
    setBusy(false);
    if (rpcErr) { onToast(`保存に失敗しました: ${rpcErr.message}`); return; }
    setUrl(pub.publicUrl);
    if (inputRef.current) inputRef.current.value = '';
    // ★ トップと地域は即時に作り直す。残り（店舗・本人ページなど）は ISR（最大10分）。
    revalidateTopAndAreas();
    onToast(`「${slot.title}」を設定しました${slot.successNote}`);
  };

  const remove = async () => {
    if (!url) return;
    if (!window.confirm(`「${slot.title}」を削除しますか？`)) return;
    setBusy(true);
    const { error: rpcErr } = await supabase.rpc(slot.rpc, { p_url: '' });
    setBusy(false);
    if (rpcErr) { onToast(`削除に失敗しました: ${rpcErr.message}`); return; }
    setUrl(null);
    revalidateTopAndAreas();
    onToast(`「${slot.title}」を削除しました`);
  };

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-bold text-slate-700">{slot.title}</h3>
      <p className="text-xs text-slate-500 leading-relaxed">{slot.help} JPEG・PNG・WebP、5MBまで。</p>
      <div className="flex items-start gap-4">
        <div className={`w-28 ${slot.ratio} rounded-lg border border-slate-200 overflow-hidden bg-slate-50 flex-shrink-0 flex items-center justify-center`}>
          {!loaded ? (
            <span className="text-[10px] text-slate-400">読み込み中...</span>
          ) : url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={slot.title} className="w-full h-full object-cover" />
          ) : (
            <span className="text-[10px] text-slate-400">未設定</span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <label className={`inline-flex items-center justify-center px-4 py-2 rounded-lg border border-pink-300 text-pink-600 text-xs font-bold cursor-pointer hover:bg-pink-50 transition-colors ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
            {busy ? '処理中...' : url ? '画像を変更' : '画像を追加'}
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              disabled={busy}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }}
            />
          </label>
          {url && (
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="inline-flex items-center justify-center px-4 py-2 rounded-lg border border-rose-200 text-rose-500 text-xs font-bold bg-rose-50 hover:bg-rose-100 transition-colors disabled:opacity-50"
            >
              削除
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TherapistPlaceholderManager({ onToast }: { onToast: (msg: string) => void }) {
  return (
    <div className="space-y-6 divide-y divide-slate-100">
      {SLOTS.map((slot, i) => (
        <div key={slot.key} className={i > 0 ? 'pt-6' : ''}>
          <ImageSlot slot={slot} onToast={onToast} />
        </div>
      ))}
    </div>
  );
}
