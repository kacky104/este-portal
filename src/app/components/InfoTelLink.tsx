'use client';

// 店舗基本情報の「電話番号」の値を、タップで「フクエスを見たとお伝えください」のポップアップ → 発信 にする
// （2026-09-08・カッキーさんの指示）。★ 上の「電話をする」ボタン（SalonActionButtons）と同じ TelNoticeLink・同じ計測。
// ★ 店舗詳細トップと /info の両方で使う。★ サーバー部品から呼べるよう、計測の関数はこの中で結ぶ。
import { TelNoticeLink } from '@/app/components/TelNoticeLink';
import { logSalonAction } from '@/app/lib/logSalonAction';

export function InfoTelLink({ salonId, phone, color }: { salonId: number; phone: string; color?: string }) {
  return (
    <TelNoticeLink
      phone={phone}
      onCall={() => logSalonAction(salonId, 'tel')}
      className="underline decoration-dotted underline-offset-2 hover:opacity-80 text-left break-words"
      style={{ color }}
    >
      {phone}
    </TelNoticeLink>
  );
}
