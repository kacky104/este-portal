'use client';

import AdminDocumentsManager from '@/app/components/AdminDocumentsManager';
import { useToast } from '@/app/components/useToast';

// /moderation「書類」タブ：/admin の書類置き場と同じコンポーネントを流用し、トーストだけこの場で持つ。
// アクセス権は RLS（管理者＋審査スタッフ・20260717_admin_documents_moderators.sql）が担う。
export function ModerationDocuments() {
  const { toast, showToast } = useToast();
  return (
    <>
      <AdminDocumentsManager onToast={showToast} />
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-white border border-pink-200 shadow-lg rounded-2xl px-6 py-3 text-sm font-bold text-pink-600">
          {toast}
        </div>
      )}
    </>
  );
}
