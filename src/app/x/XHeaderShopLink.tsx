'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getSession, onAuthChange } from '@/lib/auth';
import { createClient } from '@/app/lib/supabase/client';

const supabase = createClient();

// verified 店舗でログイン中のときだけヘッダーに「店舗管理」リンクを出す。
// （運営リンクの出し分けと同じ作法。表示制御のみ。アクセス制御は /x/shop のサーバー側で実施。）
export function XHeaderShopLink() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let mounted = true;

    // セッションの auth_user_id から自分の x_profiles を引き、shop かつ is_verified なら表示。
    const check = async (uid: string | undefined) => {
      if (!uid) {
        if (mounted) setShow(false);
        return;
      }
      const { data } = await supabase
        .from('x_profiles')
        .select('kind, is_verified')
        .eq('auth_user_id', uid)
        .maybeSingle();
      if (mounted) setShow(data?.kind === 'shop' && Boolean(data?.is_verified));
    };

    getSession().then((s) => check(s?.user.id));
    const off = onAuthChange((s) => check(s?.user.id));
    return () => {
      mounted = false;
      off();
    };
  }, []);

  if (!show) return null;
  return (
    <Link
      href="/x/shop"
      className="text-xs font-bold text-emerald-600 hover:text-emerald-700 transition-colors"
    >
      店舗管理
    </Link>
  );
}
