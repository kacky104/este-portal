'use client';

import AdminDocumentsManager from '@/app/components/AdminDocumentsManager';
import AdminImagesManager from '@/app/components/AdminImagesManager';
import { useToast } from '@/app/components/useToast';

// /moderation「書類」タブ：/admin の「書類置き場（PDF・Word）」＋「画像フォルダ」と同じコンポーネントを流用し、
// トーストだけこの場で持つ。アクセス権は RLS（管理者＋審査スタッフ・20260717_admin_documents_moderators.sql）が担う。
export function ModerationDocuments() {
  const { toast, showToast } = useToast();
  return (
    <>
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-1 h-6 rounded-full bg-gradient-to-b from-orange-400 to-pink-600" />
        <h2 className="text-xl font-bold text-slate-900">書類置き場（PDF・Word）</h2>
      </div>
      <AdminDocumentsManager onToast={showToast} />

      <div className="flex items-center gap-2.5 mb-3 mt-8">
        <div className="w-1 h-6 rounded-full bg-gradient-to-b from-orange-400 to-pink-600" />
        <h2 className="text-xl font-bold text-slate-900">画像フォルダ</h2>
      </div>
      <AdminImagesManager onToast={showToast} />

      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-white border border-pink-200 shadow-lg rounded-2xl px-6 py-3 text-sm font-bold text-pink-600">
          {toast}
        </div>
      )}
    </>
  );
}
