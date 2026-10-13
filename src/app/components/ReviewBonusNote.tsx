import { POINT_FIRST_REVIEW, POINT_VISIT_NOTE } from '@/lib/points';

// ★ 第1450便: 「口コミを書く」ボタンのそばに出す、はじめての口コミのポイントの小さな案内（全員に同じ文・キャッシュされるページでも出せる）
export function ReviewBonusNote({ className = '' }: { className?: string }) {
  return (
    <p className={`text-[11px] font-bold text-pink-600 ${className}`}>
      🎁 はじめての口コミで{POINT_FIRST_REVIEW}pt（運営の承認後{POINT_VISIT_NOTE ? `・${POINT_VISIT_NOTE}` : ''}）
    </p>
  );
}
