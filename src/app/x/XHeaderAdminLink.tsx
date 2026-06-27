'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getSession, onAuthChange } from '@/lib/auth';
import { ADMIN_UUID } from '@/app/lib/admin';

// 運営UUIDでログイン中のときだけヘッダーに「運営」リンクを出す（一般ユーザーには出さない）。
// 表示制御のみ。実際のアクセス制御は /x/admin のサーバー側で auth.uid === ADMIN_UUID を検証している。
export function XHeaderAdminLink() {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let mounted = true;
    getSession().then((s) => {
      if (mounted) setIsAdmin(s?.user.id === ADMIN_UUID);
    });
    const off = onAuthChange((s) => {
      if (mounted) setIsAdmin(s?.user.id === ADMIN_UUID);
    });
    return () => {
      mounted = false;
      off();
    };
  }, []);

  if (!isAdmin) return null;
  return (
    <Link
      href="/x/admin"
      className="text-xs font-bold text-indigo-500 hover:text-indigo-700 transition-colors"
    >
      運営
    </Link>
  );
}
