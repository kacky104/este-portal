'use client';

// お知らせの画像欄の「ランダム表示」ボタン（第910便・2026-09-27・カッキーさん）。
// ★ 押すと、このお知らせは【ランダム表示】になる＝自分で付けた画像を外す（「保存」で確定）。
//   ★ ランダム表示中のお知らせには、出すたび（自動・再投稿・新規）に「お知らせの写真」から1枚が入る
//     （applyAnnouncePhoto・第775便。★ 仕組みは変えていない。画像なし＝ランダム、のまま）。
// ★ 見分け方は置き場だけ: announcement-images＝自分で付けた画像／それ以外（空・therapist-photos）＝ランダム。

export function isOwnAnnounceImageUrl(url: string | null | undefined): boolean {
  return String(url ?? '').includes('/announcement-images/');
}

export function AnnounceRandomTile({
  imageUrl,
  onChoose,
  tone = 'pink',
  boxClassName = 'w-32 h-32',
}: {
  imageUrl: string | null | undefined;
  /** 押したとき（★ 呼ぶ側で image_url を null にする） */
  onChoose: () => void;
  tone?: 'pink' | 'indigo';
  boxClassName?: string;
}) {
  const active = !isOwnAnnounceImageUrl(imageUrl);
  const pool = active && imageUrl ? imageUrl : null; // 前回ランダムで入った写真
  const on = tone === 'pink'
    ? 'border-2 border-pink-500 bg-pink-50 text-pink-600'
    : 'border-2 border-indigo-500 bg-indigo-50 text-indigo-700';
  const off = tone === 'pink'
    ? 'border-2 border-dashed border-slate-300 bg-white text-slate-500 hover:bg-pink-50 hover:text-pink-600 cursor-pointer'
    : 'border-2 border-dashed border-slate-300 bg-white text-slate-500 hover:bg-indigo-50 hover:text-indigo-700 cursor-pointer';
  const badge = tone === 'pink' ? 'bg-pink-500' : 'bg-indigo-600';

  return (
    <button
      type="button"
      onClick={() => { if (!active) onChoose(); }}
      aria-pressed={active}
      title={active ? 'ランダム表示中（投稿のたびに「お知らせの写真」から入れ替わります）' : '自分の画像を外して、ランダム表示にします'}
      className={'relative flex-none flex flex-col items-center justify-center overflow-hidden rounded-none transition-colors ' + boxClassName + ' ' + (active ? on + ' cursor-default' : off)}
    >
      {pool && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={pool} alt="" className="absolute inset-0 w-full h-full object-cover opacity-60" />
      )}
      <span className="relative text-2xl leading-none">🎲</span>
      <span className={'relative mt-1 text-[10px] font-black px-1.5 py-0.5 ' + (active ? 'text-white ' + badge : '')}>
        {active ? 'ランダム表示中' : 'ランダムにする'}
      </span>
    </button>
  );
}
