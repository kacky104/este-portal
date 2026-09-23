'use client';

import { ConecfShell } from '../ConecfShell';
import { ConecfLoginBoard } from './ConecfLoginBoard';
import { useToast } from '@/app/components/useToast';

// コネックエフ「ID・PASS登録」（第396便・1b → 第412便でベンリー型に作り直し）。
// ★ 表と窓は ConecfLoginBoard（★ フクエスリンクの LoginBoard と同じ server action を呼ぶ）。
// ★★ フクエスも一覧に出す（★ ID・PASS はいらない・外せない）。

export default function ConecfSitesPage() {
  const { toast, showToast } = useToast();
  return (
    <ConecfShell current="sites" title="ID・パスワード登録" toast={toast}>
      {(a) => <ConecfLoginBoard salonId={a.salonId} onToast={showToast} />}
    </ConecfShell>
  );
}
