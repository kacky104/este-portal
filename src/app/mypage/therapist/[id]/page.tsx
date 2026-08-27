'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/app/lib/supabase/client';
import { revalidateSalon, revalidateTherapist } from '@/app/lib/revalidateTop';
import {
  BADGE_CATEGORY_ORDER,
  BADGE_CATEGORY_LABELS,
  BADGE_CATEGORY_COLORS,
  BADGES_BY_CATEGORY,
  MAX_BADGES,
  sanitizeBadges,
} from '@/lib/therapistBadges';
import { STORAGE_CACHE_CONTROL } from '@/app/lib/storage';
import { cleanupTherapistPhotos } from '@/app/actions/therapistAdmin';
import { generateTherapistCopy, getTherapistCopyQuota, type QuotaState } from '@/app/actions/therapistCopy';
import { getOrCreateDiaryMailAddress } from '@/app/actions/diaryMail';
import { getDiaryForwards, saveDiaryForward, getSalonDiarySource, setSalonDiarySource } from '@/app/actions/diaryForward';
import { useToast } from '@/app/components/useToast';
import { SiteNoticeBanner } from '@/app/components/SiteNoticeBanner';

const supabase = createClient();

type BodyParts = { height: string; bust: string; cup: string; waist: string; hip: string };

function parseBodyType(raw: string | null): BodyParts {
  if (!raw) return { height: '', bust: '', cup: '', waist: '', hip: '' };
  const hMatch   = raw.match(/T(\d+)/);
  const bMatch   = raw.match(/B(\d+)\(([A-Za-z]+)\)/);
  const wMatch   = raw.match(/W(\d+)/);
  const hipMatch = raw.match(/H(\d+)/);
  return {
    height: hMatch?.[1]   ?? '',
    bust:   bMatch?.[1]   ?? '',
    cup:    bMatch?.[2]   ?? '',
    waist:  wMatch?.[1]   ?? '',
    hip:    hipMatch?.[1] ?? '',
  };
}

function buildBodyType(p: BodyParts): string {
  const parts: string[] = [];
  if (p.height) parts.push(`T${p.height}`);
  if (p.bust && p.cup) parts.push(`B${p.bust}(${p.cup.toUpperCase()})`);
  else if (p.bust) parts.push(`B${p.bust}`);
  if (p.waist) parts.push(`W${p.waist}`);
  if (p.hip)   parts.push(`H${p.hip}`);
  return parts.join(' ');
}

type Therapist = {
  id: string;
  salon_id: number;
  name: string | null;
  profile_image_url: string | null;
  profile_images: string[] | null;
  age: string | null;
  body_type: string | null;
  profile_text: string | null;
  catchphrase: string | null;
  feature_badges: string[] | null;
};

const MAX_IMAGES = 5;

export default function TherapistEditPage() {
  const router = useRouter();
  const params = useParams();
  const therapistId = params.id as string;

  const [therapist, setTherapist] = useState<Therapist | null>(null);
  const [form, setForm] = useState<Partial<Therapist>>({});
  const [images, setImages] = useState<string[]>([]);
  // 旧画像掃除用（2026-07-12）：DB保存済みの画像一覧と、このセッションでアップロードしたURLを控えておき、
  // 保存成功時に「最終的に使われなかった画像」を storage から掃除する（従来は差し替え・削除のたびに孤児が蓄積）。
  const [savedImages, setSavedImages] = useState<string[]>([]);
  const sessionUploadsRef = useRef<string[]>([]);
  const [bodyParts, setBodyParts] = useState<BodyParts>({ height: '', bust: '', cup: '', waist: '', hip: '' });
  const [badges, setBadges] = useState<string[]>([]);
  const [loadError, setLoadError] = useState('');
  // 写メ日記のメール投稿アドレス（2026-08-21 第27便）。ベンリー等の更新代行に登録する。
  // トークンは server action がオーナー検証のうえ発行・返却する（クライアントから直接は引けない）。
  const [diaryMailAddress, setDiaryMailAddress] = useState<string | null>(null);
  const [diaryMailError, setDiaryMailError] = useState('');
  // 写メ日記の転送先（第36便・第2弾）。フクエスで書いた日記を駅ちか／エスラブへ送る宛先。
  // ★ 上の diaryMailAddress とは【向きが逆】。あちらは受け取る側、こちらは送る側。
  const [forwardRows, setForwardRows] = useState<Array<{ provider: string; slot: number; address: string; persisted: boolean }>>([]);
  const [forwardLoaded, setForwardLoaded] = useState(false);
  const [forwardSaving, setForwardSaving] = useState<string | null>(null);
  // ★ 読み込みに失敗したら理由を出す。黙って「読み込み中...」のままにしない
  //   （第36便で実際にそうなり、原因が画面から分からなかった）。
  const [forwardError, setForwardError] = useState('');
  // 店舗の「写メ日記の正本」。'benry'=他媒体で書く（既定） / 'fukues'=フクエスで書く。
  // ★★★ これが二重投稿を防ぐ唯一の仕掛け（fukues にすると他媒体からの受信を止める）。
  const [diarySource, setDiarySource] = useState<string | null>(null);
  const [sourceSaving, setSourceSaving] = useState(false);
  const [saving, setSaving] = useState(false);
  // AI下書き（第30便）。生成中フラグと「写真をAIに渡すか」の選択。保存はせずフォームに入れるだけ。
  const [aiLoading, setAiLoading] = useState(false);
  const [aiUseImage, setAiUseImage] = useState(true);
  // 直前の内容（AI下書きを1回だけ元に戻せるようにする）。null なら戻せる状態にない。
  const [aiUndo, setAiUndo] = useState<{ catchphrase: string | null; profile_text: string | null } | null>(null);
  // 今月の残り回数（第30便）。読めなければ null のまま＝表示を出さない。
  const [aiQuota, setAiQuota] = useState<QuotaState | null>(null);

  useEffect(() => {
    let cancelled = false;
    getOrCreateDiaryMailAddress({ therapistId }).then((r) => {
      if (cancelled) return;
      if (r.ok) setDiaryMailAddress(r.address);
      else setDiaryMailError(r.error);
    });
    getDiaryForwards({ therapistId }).then((r) => {
      if (cancelled) return;
      if (!r.ok) { setForwardError(r.error); return; }
      const loaded = r.data.map((f) => ({ provider: f.provider, slot: f.slot, address: f.address, persisted: true }));
      // 未登録の媒体には、そのまま入力できる空の1枠目を出しておく（初回登録を1クリック減らす）。
      for (const mp of ['ekichika', 'esulove']) {
        if (!loaded.some((x) => x.provider === mp)) loaded.push({ provider: mp, slot: 1, address: '', persisted: false });
      }
      setForwardRows(loaded);
      setForwardLoaded(true);
    }).catch((e) => { if (!cancelled) setForwardError(String(e)); });
    getSalonDiarySource({ therapistId }).then((r) => {
      if (cancelled) return;
      if (!r.ok) { setForwardError((prev) => prev || r.error); return; }
      setDiarySource(r.data.source);
    }).catch((e) => { if (!cancelled) setForwardError((prev) => prev || String(e)); });
    return () => { cancelled = true; };
  }, [therapistId]);
  const [uploadingSlot, setUploadingSlot] = useState<number | null>(null);
  // トーストは共通フックで一元管理（タイマー直書きは連続表示・unmount後setStateのバグ源）。
  const { toast, showToast } = useToast();

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/owner/login?redirectTo=' + encodeURIComponent(window.location.pathname));
        return;
      }

      const { data: tData, error: tError } = await supabase
        .from('therapists')
        .select('id, salon_id, name, profile_image_url, profile_images, age, body_type, profile_text, catchphrase, feature_badges')
        .eq('id', therapistId)
        .single();

      if (tError || !tData) {
        setLoadError('セラピストが見つかりません');
        return;
      }

      // 自分のサロンのセラピストか確認
      const { data: salonData } = await supabase
        .from('salons')
        .select('id')
        .eq('id', tData.salon_id)
        .eq('owner_id', user.id)
        // 0 件（他店のセラピスト）は想定内の分岐なので maybeSingle。single だと 0 件でもエラーを吐く。
        .maybeSingle();

      if (!salonData) {
        setLoadError('このセラピストを編集する権限がありません');
        return;
      }

      setTherapist(tData);
      setForm(tData);
      // 複数画像：profile_images を優先、無ければ既存の単一画像を1枚目として扱う（互換性）
      const initialImages =
        Array.isArray(tData.profile_images) && tData.profile_images.length > 0
          ? tData.profile_images.filter(Boolean)
          : tData.profile_image_url
            ? [tData.profile_image_url]
            : [];
      setImages(initialImages.slice(0, MAX_IMAGES));
      setSavedImages(initialImages.slice(0, MAX_IMAGES));
      setBodyParts(parseBodyType(tData.body_type));
      // 現在の特徴バッジをプリフィル（不正値除去・最大3つに正規化）
      setBadges(sanitizeBadges(tData.feature_badges));

      // AI下書きの今月の残り回数（第30便）。失敗しても画面は出す（表示を省くだけ）。
      const q = await getTherapistCopyQuota(Number(tData.salon_id));
      if (q.ok) setAiQuota(q.quota);
    })();
  }, [therapistId, router]);

  const updateBodyPart = (key: keyof BodyParts, value: string) => {
    setBodyParts(prev => {
      const updated = { ...prev, [key]: value };
      setForm(f => ({ ...f, body_type: buildBodyType(updated) }));
      return updated;
    });
  };

  // slot が画像数と同じ＝末尾への追加、それ未満＝そのスロットの差し替え
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, slot: number) => {
    const file = e.target.files?.[0];
    if (!file || !therapist) return;

    setUploadingSlot(slot);

    const ext = file.name.split('.').pop();
    const fileName = `${therapist.id}-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('therapist-photos')
      .upload(fileName, file, { cacheControl: STORAGE_CACHE_CONTROL });

    if (uploadError) {
      showToast('アップロードに失敗しました: ' + uploadError.message);
      setUploadingSlot(null);
      e.target.value = '';
      return;
    }

    const { data: urlData } = supabase.storage
      .from('therapist-photos')
      .getPublicUrl(fileName);

    sessionUploadsRef.current.push(urlData.publicUrl);
    setImages(prev => {
      const next = [...prev];
      if (slot < next.length) next[slot] = urlData.publicUrl; // 差し替え
      else next.push(urlData.publicUrl);                       // 追加
      return next.slice(0, MAX_IMAGES);
    });
    setUploadingSlot(null);
    e.target.value = '';
    showToast('画像をアップロードしました(保存ボタンを押して反映してください)');
  };

  const handleImageRemove = (slot: number) => {
    setImages(prev => prev.filter((_, i) => i !== slot));
  };

  // 特徴バッジの選択トグル（最大 MAX_BADGES。上限到達後は未選択を追加しない）。
  const toggleBadge = (label: string) => {
    setBadges(prev => {
      if (prev.includes(label)) return prev.filter(b => b !== label);
      if (prev.length >= MAX_BADGES) return prev;
      return [...prev, label];
    });
  };

  // AI下書き生成（第30便）。素材はサーバー側で引き直すので、ここでは未保存の編集内容は渡らない。
  // ★ 保存はしない。フォームに入れるだけなので、気に入らなければ「元に戻す」か保存せず離れればよい。
  const handleAiDraft = async () => {
    if (!therapist || aiLoading) return;
    setAiLoading(true);
    const before = {
      catchphrase: form.catchphrase ?? null,
      profile_text: form.profile_text ?? null,
    };
    const r = await generateTherapistCopy(therapist.salon_id, Number(therapistId), aiUseImage);
    setAiLoading(false);

    if (!r.ok) {
      if (r.quota) setAiQuota(r.quota);
      showToast(r.error);
      return;
    }

    setAiQuota(r.quota);
    setAiUndo(before);
    setForm((p) => ({
      ...p,
      catchphrase: r.catchphrase || p.catchphrase,
      profile_text: r.profileText,
    }));

    const notes: string[] = [];
    if (!r.usedImage && aiUseImage) notes.push('写真は読み込めなかったため文字情報のみで作成');
    if (r.short) notes.push('短めなので加筆をおすすめします');
    showToast(
      'AIの下書きを入れました（まだ保存されていません）' +
      (notes.length ? '。' + notes.join('・') : ''),
    );
  };

  // 今月の枠が尽きているか。枠が読めないときは押させる（サーバー側でも弾く）。
  // 写真あり・なしで枠は分かれない（第30便でオーナーが合算に確定）。運営アカウントは無制限。
  const aiOutOfQuota = aiQuota ? !aiQuota.unlimited && aiQuota.used >= aiQuota.limit : false;

  // ★ 素材がゼロのときだけ生成を止める（第30便）。
  //   画面の並びが「AIボタン → 特徴バッジ」なので、上から埋めるとバッジ前にボタンへ着く。
  //   ただしバッジ6個を必須にはしない（6は上限であって適正値ではなく、
  //   ボタンを押したいがために当てはまらないバッジを選ばせると、
  //   嘘のバッジからAIが嘘の紹介文を書き、検索用データも汚れるため）。
  //   写真かバッジのどちらか一方でもあれば、その人らしい文章は書ける（実測: バッジ1個でも可）。
  const aiNoMaterial = images.length === 0 && badges.length === 0;
  // 写真を使わない設定にしていて、バッジも無い＝文字素材が年齢・サイズだけになる場合も止める。
  const aiNoMaterialForText = !aiUseImage && badges.length === 0;
  const aiBlocked = aiNoMaterial || aiNoMaterialForText;

  const handleAiUndo = () => {
    if (!aiUndo) return;
    setForm((p) => ({ ...p, catchphrase: aiUndo.catchphrase, profile_text: aiUndo.profile_text }));
    setAiUndo(null);
    showToast('AI下書きを取り消して元の内容に戻しました');
  };

  const handleSave = async () => {
    if (!therapist) return;
    setSaving(true);

    const { error } = await supabase
      .from('therapists')
      .update({
        // profile_image_url は1枚目を保存して既存表示との互換性を維持
        profile_image_url: images[0] ?? null,
        profile_images:    images,
        age:               form.age ?? null,
        body_type:         form.body_type ?? null,
        profile_text:      form.profile_text ?? null,
        catchphrase:       (form.catchphrase ?? '').trim().slice(0, 16) || null,
        // 念のため保存前に正規化（既知バッジのみ・カテゴリ順に並べ替え・最大 MAX_BADGES 件）
        feature_badges:    sanitizeBadges(badges),
      })
      .eq('id', therapist.id);

    setSaving(false);
    if (!error) {
      // ★★ 2026-08-18（第23便）に revalidateTop() から差し替え。
      //   ここで保存しているのは特徴バッジ・年齢・体型・キャッチ・写真＝
      //   【店舗ページとセラピストページに出る情報】なのに、無効化していたのはトップ(/)だけだった。
      //   そのため「保存したのに反映されない（最大10分）」が起きていた。実際に古いままだった場所:
      //     /salon/{id}（セラピスト一覧）・/salon/{id}/schedule・/salon/{id}/therapists
      //     /therapist/{id}（本人ページ）・/hp/{slug}（公式ホームページ）
      //   revalidateSalon は既定でトップ(/)と全エリアページも無効化するので、
      //   従来 revalidateTop() が担っていたぶんはそのまま含まれている（減っていない）。
      revalidateSalon(therapist.salon_id);
      revalidateTherapist(therapist.id);
      // 差し替え・スロット削除で不要になった旧画像を掃除（best-effort・失敗しても保存は成立）。
      // 対象＝「DB保存済みだった画像」＋「このセッションでアップロードした画像」のうち最終形に残らなかったもの。
      const keep = new Set(images);
      const removedUrls = [...new Set([...savedImages, ...sessionUploadsRef.current])].filter(
        (u) => !keep.has(u),
      );
      if (removedUrls.length > 0) {
        cleanupTherapistPhotos({
          therapistId: therapist.id,
          salonId: Number(therapist.salon_id),
          urls: removedUrls,
        }).catch((e) => console.error('[therapist] 旧画像の掃除に失敗:', e));
      }
      setSavedImages(images);
      sessionUploadsRef.current = [];
    }
    showToast(error ? '保存に失敗しました' : '保存しました');
  };

  const inputClass = 'w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-pink-200';
  const textareaClass = 'w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-pink-200 resize-none';
  const labelClass = 'text-[11px] font-bold text-slate-400 block mb-1';
  const saveBtn = 'px-5 py-2 rounded-xl bg-gradient-to-r from-pink-500 to-fuchsia-500 text-white font-bold text-xs shadow-sm disabled:opacity-50';

  if (loadError) {
    return (
      <div className="min-h-screen bg-pink-50/30 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl border border-rose-100 shadow-xl p-8 max-w-sm w-full text-center space-y-4">
          <p className="text-sm text-slate-500">{loadError}</p>
          <Link href="/mypage" className="text-xs text-pink-500 font-bold hover:underline">
            マイページに戻る
          </Link>
        </div>
      </div>
    );
  }

  if (!therapist) {
    return (
      <div className="min-h-screen bg-pink-50/30 flex items-center justify-center">
        <p className="text-slate-400 text-sm">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-pink-50/30">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-white border border-pink-200 shadow-lg rounded-2xl px-6 py-3 text-sm font-bold text-pink-600">
          {toast}
        </div>
      )}

      <header className="bg-white border-b border-slate-100 sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/mypage" className="text-slate-400 hover:text-pink-500 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-base font-black text-slate-800 tracking-wide">
            {therapist.name ?? 'セラピスト'} のプロフィール編集
          </h1>
        </div>
      </header>
      <SiteNoticeBanner />

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">

        {/* プロフィール画像（最大5枚） */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black text-slate-700">プロフィール画像</h2>
            <span className="text-[10px] text-slate-400">{images.length} / {MAX_IMAGES}枚</span>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
            {/* 既存スロット：プレビュー＋変更／削除 */}
            {images.map((url, i) => (
              <div key={i} className="space-y-1.5">
                <div className="relative aspect-square rounded-2xl border border-pink-100 overflow-hidden bg-slate-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`プロフィール画像${i + 1}`} className="w-full h-full object-cover" />
                  {i === 0 && (
                    <span className="absolute top-1 left-1 bg-pink-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                      メイン
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleImageRemove(i)}
                    aria-label="削除"
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/55 text-white text-xs flex items-center justify-center hover:bg-black/75 transition-colors"
                  >
                    ×
                  </button>
                </div>
                <label className="block text-center bg-white border border-slate-200 text-slate-500 text-[10px] font-bold py-1 rounded-lg cursor-pointer hover:border-pink-300 hover:text-pink-500 transition-colors">
                  {uploadingSlot === i ? '...' : '変更'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => handleImageUpload(e, i)}
                    disabled={uploadingSlot !== null}
                    className="hidden"
                  />
                </label>
              </div>
            ))}

            {/* 追加スロット（5枚未満のとき1つだけ表示） */}
            {images.length < MAX_IMAGES && (
              <div className="space-y-1.5">
                <label className="flex flex-col items-center justify-center aspect-square rounded-2xl border-2 border-dashed border-pink-200 bg-pink-50/40 text-pink-400 cursor-pointer hover:bg-pink-50 transition-colors">
                  {uploadingSlot === images.length ? (
                    <span className="text-[10px] font-bold">アップ中...</span>
                  ) : (
                    <>
                      <span className="text-2xl leading-none">＋</span>
                      <span className="text-[10px] font-bold mt-0.5">追加</span>
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => handleImageUpload(e, images.length)}
                    disabled={uploadingSlot !== null}
                    className="hidden"
                  />
                </label>
              </div>
            )}
          </div>

          <p className="text-[10px] text-slate-400">
            推奨：縦長（3:4）1080×1440px／JPEG・PNG・WebP、5MBまで。1枚目がメイン画像として一覧などに表示されます。
          </p>
        </div>

        {/* 年齢 */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-3">
          <h2 className="text-sm font-black text-slate-700">年齢</h2>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="18"
              max="99"
              className={`${inputClass} max-w-[120px]`}
              placeholder="22"
              value={(form.age ?? '').replace(/[^0-9]/g, '') || ''}
              onChange={(e) => setForm((p) => ({ ...p, age: e.target.value }))}
            />
            <span className="text-sm text-slate-500 font-medium">歳</span>
          </div>
        </div>

        {/* スタイル */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-3">
          <h2 className="text-sm font-black text-slate-700">スタイル</h2>
          <div className="grid grid-cols-5 gap-2">
            {(
              [
                { key: 'height', label: 'T',   placeholder: '160', type: 'number' },
                { key: 'bust',   label: 'B',   placeholder: '85',  type: 'number' },
                { key: 'cup',    label: 'CUP', placeholder: 'D',   type: 'text'   },
                { key: 'waist',  label: 'W',   placeholder: '58',  type: 'number' },
                { key: 'hip',    label: 'H',   placeholder: '85',  type: 'number' },
              ] as { key: keyof BodyParts; label: string; placeholder: string; type: string }[]
            ).map(({ key, label, placeholder, type }) => (
              <div key={key} className="flex flex-col items-center gap-0.5">
                <span className="text-[10px] font-bold text-slate-400">{label}</span>
                <input
                  type={type}
                  placeholder={placeholder}
                  value={bodyParts[key] ?? ''}
                  onChange={(e) => updateBodyPart(key, e.target.value)}
                  className="w-full px-1.5 py-2 rounded-xl border border-slate-200 text-xs bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-pink-200 text-center"
                />
              </div>
            ))}
          </div>
          {form.body_type && (
            <p className="text-[10px] text-slate-400">
              保存値: <span className="font-mono text-slate-600">{form.body_type}</span>
            </p>
          )}
        </div>

        {/* AI下書き（第30便）。キャッチ＋詳細プロフィールをまとめて生成してフォームに入れる。 */}
        <div className="bg-gradient-to-br from-violet-50 to-pink-50 rounded-3xl border border-violet-100 shadow-sm p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-black text-violet-800">AIで下書きを作る</h2>
            {aiQuota && (
              <span className="text-[10px] font-bold text-violet-600 bg-white/70 rounded-full px-2 py-0.5 whitespace-nowrap">
                {aiQuota.unlimited
                  ? '運営アカウント（回数制限なし）'
                  : `今月の残り ${Math.max(0, aiQuota.limit - aiQuota.used)}回 / ${aiQuota.limit}回`}
              </span>
            )}
          </div>
          <p className="text-[11px] text-violet-900/70 leading-relaxed">
            登録済みの年齢・サイズ・特徴バッジ（と写真）から、キャッチフレーズと詳細プロフィールの下書きを作ります。
            <strong className="font-bold">押しただけでは保存されません</strong>ので、
            内容を確認して手直ししてから保存してください。回数は毎月1日にリセットされます。
          </p>

          <label className="flex items-center gap-2 text-[11px] font-bold text-violet-900/80 cursor-pointer">
            <input
              type="checkbox"
              className="accent-violet-600 w-4 h-4"
              checked={aiUseImage}
              onChange={(e) => setAiUseImage(e.target.checked)}
              disabled={aiLoading}
            />
            プロフィール写真も見て書く（外すと文字情報だけで作成します）
          </label>

          {/* 素材ゼロ＝止める。無駄に1回消費させないため、押す前に理由を出す。 */}
          {aiBlocked ? (
            <p className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 leading-relaxed">
              {aiNoMaterial
                ? 'まだ材料がありません。プロフィール写真を登録するか、下の「特徴バッジ」を選んでから作成してください。'
                : '写真を使わない設定のときは、下の「特徴バッジ」を選んでから作成してください。'}
            </p>
          ) : (
            /* 材料はあるが少ない＝案内だけ出して、押すこと自体は止めない。 */
            badges.length < 3 && (
              <p className="text-[11px] text-violet-900/70 bg-white/60 border border-violet-100 rounded-xl px-3 py-2 leading-relaxed">
                下の「特徴バッジ」を設定してから作ると、その人らしい文章になります
                （現在 {badges.length}つ）。このまま作ることもできます。
              </p>
            )
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleAiDraft}
              disabled={aiLoading || aiOutOfQuota || aiBlocked}
              className="rounded-full bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white text-xs font-black px-5 py-2.5 transition-colors"
            >
              {aiLoading
                ? '作成中…（20秒ほどかかります）'
                : aiOutOfQuota
                  ? '今月の回数を使い切りました'
                  : aiBlocked
                    ? '写真かバッジを設定してください'
                    : 'AIで下書きを作る'}
            </button>
            {aiUndo && !aiLoading && (
              <button
                type="button"
                onClick={handleAiUndo}
                className="rounded-full bg-white border border-violet-200 text-violet-700 text-xs font-bold px-4 py-2.5 hover:bg-violet-50 transition-colors"
              >
                元に戻す
              </button>
            )}
          </div>
        </div>

        {/* キャッチフレーズ */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black text-slate-700">キャッチフレーズ</h2>
            <span className="text-[11px] font-bold text-slate-500">{(form.catchphrase ?? '').length} / 16</span>
          </div>
          <input
            type="text"
            maxLength={16}
            className={inputClass}
            placeholder="例：癒しの時間をあなたに"
            value={form.catchphrase ?? ''}
            onChange={(e) => setForm((p) => ({ ...p, catchphrase: e.target.value.slice(0, 16) }))}
          />
        </div>

        {/* 詳細プロフィール */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-3">
          <h2 className="text-sm font-black text-slate-700">詳細プロフィール</h2>
          <textarea
            rows={5}
            className={textareaClass}
            placeholder="セラピストの自己紹介文を入力してください"
            value={form.profile_text ?? ''}
            onChange={(e) => setForm((p) => ({ ...p, profile_text: e.target.value }))}
          />
        </div>

        {/* 特徴バッジ（上限は therapistBadges.ts の MAX_BADGES。見出しの数字もそこから引いている） */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black text-slate-700">
              特徴バッジ
              <span className="text-[11px] font-normal text-slate-400 ml-1">（最大{MAX_BADGES}つ）</span>
            </h2>
            <span className="text-[11px] font-bold text-slate-500">{badges.length} / {MAX_BADGES} 選択中</span>
          </div>

          {/* 設定を促す訴求文：検索・特徴別ページへの露出メリットを明記して設定率を上げる。 */}
          <p className="text-[11px] text-pink-700 bg-pink-50 border border-pink-100 rounded-xl px-3 py-2 leading-relaxed">
            設定すると「特徴からセラピストを探す」検索や特徴別ページに掲載され、お客様に見つけてもらいやすくなります。
          </p>

          {BADGE_CATEGORY_ORDER.map((cat) => {
            const colors = BADGE_CATEGORY_COLORS[cat];
            const atMax = badges.length >= MAX_BADGES;
            return (
              <div key={cat}>
                <p className="text-[11px] font-bold text-slate-400 mb-1.5 flex items-center gap-1.5">
                  {BADGE_CATEGORY_LABELS[cat]}
                  {/* カテゴリの色見本（fill=背景 / border=枠線。色は therapistBadges を参照） */}
                  <span
                    aria-hidden
                    className="inline-block w-4 h-2.5 rounded-full border"
                    style={{ backgroundColor: colors.fill, borderColor: colors.border }}
                  />
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {BADGES_BY_CATEGORY[cat].map((label) => {
                    const selected = badges.includes(label);
                    const disabled = !selected && atMax;
                    return (
                      <button
                        key={label}
                        type="button"
                        disabled={disabled}
                        onClick={() => toggleBadge(label)}
                        className={`relative inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold border-2 transition-colors ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                        style={
                          selected
                            ? { backgroundColor: colors.fill, color: colors.text, borderColor: colors.text }
                            : { backgroundColor: '#F9FAFB', color: '#9CA3AF', borderColor: '#E5E7EB' }
                        }
                        aria-pressed={selected}
                      >
                        {label}
                        {selected && (
                          <span
                            className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center"
                            style={{ backgroundColor: colors.text, color: '#ffffff' }}
                          >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M20 6L9 17l-5-5" />
                            </svg>
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* 写メ日記 メール投稿アドレス（2026-08-21 第27便）。
            ベンリー等の更新代行システムの「日記転送先」にこのアドレスを登録すると、
            件名=タイトル・本文=日記・添付=写真 のメールで自動投稿される。 */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-3">
          <h2 className="text-sm font-black text-slate-700">写メ日記 メール投稿アドレス</h2>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            更新代行システム（ベンリー等）の「日記転送先」にこのアドレスを登録すると、写メ日記が自動で投稿されます。
            件名がタイトル、本文が日記、添付画像が写真になります。
          </p>
          {diaryMailAddress ? (
            <div className="flex items-center gap-2">
              <code className="flex-1 min-w-0 truncate rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">{diaryMailAddress}</code>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(diaryMailAddress).then(
                    () => showToast('アドレスをコピーしました'),
                    () => showToast('コピーに失敗しました'),
                  );
                }}
                className="flex-shrink-0 px-3 py-2 rounded-xl border border-pink-200 text-pink-600 text-xs font-bold hover:bg-pink-50 transition-colors"
              >
                コピー
              </button>
            </div>
          ) : (
            <p className="text-[11px] text-slate-400">{diaryMailError || '読み込み中...'}</p>
          )}
          <p className="text-[10px] text-amber-600 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 leading-relaxed">
            ※ このアドレスを知っている人は誰でもこのセラピストとして日記を投稿できます。代行業者以外には教えないでください。
          </p>
        </div>

        {/* 写メ日記の転送先（第36便・第2弾）。
            フクエスで書いた日記を、駅ちか／エスラブの投稿用アドレスへ自動で送る。
            ★ 上のカードとは向きが逆（あちらは受け取る側、こちらは送る側）。
            ★ 送るかどうかは店舗単位の「どこで書くか」で決まる。ここは宛先の登録だけ。 */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-4">
          <h2 className="text-sm font-black text-slate-700">写メ日記の転送先</h2>

          {/* 店舗全体の設定 */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 space-y-2">
            <p className="text-[11px] font-bold text-slate-600">写メ日記をどこで書きますか（店舗全体の設定）</p>
            {diarySource === null ? (
              <p className="text-[11px] text-slate-400">読み込み中...</p>
            ) : (
              <div className="space-y-1.5">
                {[
                  { v: 'benry',  t: '他媒体で書く',   d: '駅ちか等で書いた日記を、代行システム経由でフクエスが受け取ります（現在の運用）' },
                  { v: 'fukues', t: 'フクエスで書く', d: 'フクエスで書いた日記を、下に登録した宛先へ即時で送ります' },
                ].map((o) => (
                  <label key={o.v} className={`flex gap-2 items-start p-2 rounded-xl cursor-pointer transition-colors ${diarySource === o.v ? 'bg-white border border-pink-200' : 'hover:bg-white/60'}`}>
                    <input
                      type="radio" name="diarySource" value={o.v} checked={diarySource === o.v} disabled={sourceSaving}
                      onChange={async () => {
                        setSourceSaving(true);
                        const r = await setSalonDiarySource({ therapistId, source: o.v });
                        setSourceSaving(false);
                        if (r.ok) { setDiarySource(o.v); showToast('保存しました'); }
                        else showToast(r.error);
                      }}
                      className="mt-0.5 flex-shrink-0"
                    />
                    <span className="min-w-0">
                      <span className="block text-xs font-bold text-slate-700">{o.t}</span>
                      <span className="block text-[10px] text-slate-400 leading-relaxed">{o.d}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
            {diarySource === 'fukues' && (
              <p className="text-[10px] text-amber-600 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 leading-relaxed">
                ※ 代行システム（ベンリー等）側の「日記転送先」の設定は外してください。外さなくても同じ日記が二重に載ることはありませんが、代行側の送信が無駄になります。
              </p>
            )}
          </div>

          {/* 媒体ごとの宛先 */}
          <p className="text-[11px] text-slate-400 leading-relaxed">
            各媒体の管理画面で発行された「日記の投稿用メールアドレス」を貼ってください。空にすると、その媒体へは送りません。
          </p>
          {forwardError ? (
            <p className="text-[11px] text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2 leading-relaxed">
              読み込めませんでした: {forwardError}
            </p>
          ) : !forwardLoaded ? (
            <p className="text-[11px] text-slate-400">読み込み中...</p>
          ) : (
            [{ p: 'ekichika', label: '駅ちか' }, { p: 'esulove', label: 'エスラブ' }].map((m) => {
              const mediaRows = forwardRows.filter((r) => r.provider === m.p).sort((a, b) => a.slot - b.slot);
              return (
                <div key={m.p} className="space-y-2">
                  <label className="block text-[11px] font-bold text-slate-500">{m.label}</label>
                  {mediaRows.length === 0 ? (
                    <p className="text-[11px] text-slate-400">未登録</p>
                  ) : mediaRows.map((row) => {
                    const rowKey = `${m.p}:${row.slot}`;
                    const suffix = row.slot > 1 ? `（${row.slot}枠目）` : '';
                    return (
                      <div key={rowKey} className="space-y-1">
                        {row.slot > 1 && <span className="block text-[10px] text-slate-400">{row.slot}枠目</span>}
                        <div className="flex items-center gap-2">
                          <input
                            type="email" inputMode="email" autoComplete="off" placeholder="未登録"
                            value={row.address}
                            onChange={(e) => setForwardRows((rs) => rs.map((x) => (x.provider === m.p && x.slot === row.slot ? { ...x, address: e.target.value } : x)))}
                            className="flex-1 min-w-0 rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-700 focus:border-pink-300 focus:outline-none"
                          />
                          <button
                            type="button" disabled={forwardSaving === rowKey}
                            onClick={async () => {
                              setForwardSaving(rowKey);
                              const r = await saveDiaryForward({ therapistId, provider: m.p, slot: row.slot, address: row.address });
                              setForwardSaving(null);
                              if (!r.ok) { showToast(r.error); return; }
                              if (r.data.saved) {
                                setForwardRows((rs) => rs.map((x) => (x.provider === m.p && x.slot === row.slot ? { ...x, persisted: true } : x)));
                                showToast(`${m.label}${suffix}の宛先を保存しました`);
                              } else {
                                setForwardRows((rs) => rs.filter((x) => !(x.provider === m.p && x.slot === row.slot)));
                                showToast(`${m.label}${suffix}へは送らない設定にしました`);
                              }
                            }}
                            className="flex-shrink-0 px-3 py-2 rounded-xl border border-pink-200 text-pink-600 text-xs font-bold hover:bg-pink-50 transition-colors disabled:opacity-50"
                          >
                            {forwardSaving === rowKey ? '保存中...' : '保存'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setForwardRows((rs) => {
                      const slots = rs.filter((x) => x.provider === m.p).map((x) => x.slot);
                      const next = slots.length ? Math.max(...slots) + 1 : 1;
                      return [...rs, { provider: m.p, slot: next, address: '', persisted: false }];
                    })}
                    className="text-[11px] font-bold text-pink-600 hover:text-pink-700"
                  >
                    ＋ {m.label}の枠を追加
                  </button>
                </div>
              );
            })
          )}
          <p className="text-[10px] text-amber-600 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 leading-relaxed">
            ※ この宛先を知っている人は誰でもこのセラピストとして各媒体に投稿できます。取り扱いにご注意ください。
          </p>
        </div>

       <div className="flex justify-between items-center pb-4">
          <Link
            href="/mypage"
            className="px-5 py-2 rounded-xl border border-slate-200 text-slate-500 text-xs font-bold hover:border-pink-300 hover:text-pink-500 transition-colors"
          >
            ← マイページに戻る
          </Link>
          <button className={saveBtn} onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </main>
    </div>
  );
}