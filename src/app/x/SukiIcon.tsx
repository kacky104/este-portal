// fukuX「スキ」用アイコン。currentColor 追従＝親の text-* 色で塗り分け（既定ミュート／スキ済みはピンク）。
export function SukiIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M9 18 C9 18,2.8 13.2,2.8 9 C2.8 7,4.3 5.5,6.2 5.5 C7.4 5.5,8.5 6.1,9 7.1 C9.5 6.1,10.6 5.5,11.8 5.5 C13.7 5.5,15.2 7,15.2 9 C15.2 13.2,9 18,9 18 Z" />
      <path d="M17 21 C17 21,12.4 17.4,12.4 14.3 C12.4 12.8,13.5 11.7,14.9 11.7 C15.8 11.7,16.6 12.2,17 12.9 C17.4 12.2,18.2 11.7,19.1 11.7 C20.5 11.7,21.6 12.8,21.6 14.3 C21.6 17.4,17 21,17 21 Z" />
    </svg>
  );
}
