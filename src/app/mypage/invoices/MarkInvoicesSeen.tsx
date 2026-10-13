'use client';

import { useEffect } from 'react';
import { addSeenInvoiceIds } from '@/lib/invoiceSeen';

// ★ 第1432便: 一覧を開いたら、並んだ請求書を「見た」にする（サイドバーの未読の数・店名の下の案内が消える）
export default function MarkInvoicesSeen({ ids }: { ids: string[] }) {
  useEffect(() => { addSeenInvoiceIds(ids); }, [ids]);
  return null;
}
