'use client';

/**
 * セラピストの名前の左に出す、小さな丸い顔のバッジ（第371〜372便・2026-09-15・カッキーさん）。
 *
 * ★★ 置き場所: もとは DiaryTargets.tsx の中にあったが、了承の一覧（DiaryConsent）でも同じものを
 *   使うことになったので、第372便で1つのファイルに出した。★ 同じ画面で2種類の顔バッジを作らない。
 *
 * ★★★ next/image を使わない。
 *   ★ 店舗様が外部URLを入れている場合があり、next.config の remotePatterns に無いホストだと
 *     実行時に落ちる。★ ここは管理画面なので素の img で足りる（TherapistBoard の Photo と同じ判断・第217便）。
 *
 * ★ 写真が無いときも空白にしない。★ 行の高さが揃わないと一覧が読みにくいので、名前の頭文字を出す。
 */
export function TherapistBadge({ url, name }: { url: string | null; name: string }) {
  if (url) {
    return (
      <span className="w-7 h-7 flex-none overflow-hidden rounded-full border border-slate-200 bg-slate-100 block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={name} loading="lazy" className="w-full h-full object-cover" />
      </span>
    );
  }
  return (
    <span className="w-7 h-7 flex-none rounded-full border border-slate-200 bg-slate-100 grid place-items-center text-[12px] font-bold text-slate-400">
      {name.trim().slice(0, 1) || '？'}
    </span>
  );
}
