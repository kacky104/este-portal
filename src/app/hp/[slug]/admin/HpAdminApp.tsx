'use client';

import { useCallback, useEffect, useState } from 'react';
import { signInWithEmail } from '@/lib/auth';
import {
  getHpAdminContext,
  type HpAdminContext,
} from '@/app/actions/hpAdmin';
import {
  normalizeHpSiteKey,
  HP_TEMPLATES,
  HP_COLOR_VARIANTS,
  type HpSite,
} from '@/app/lib/hpSite';
import { HpEditor } from './HpEditor';
import { HpShell } from './HpShell';
import { HP_ADMIN_NAV, type HpAdminSection } from './adminNav';

// 店舗ドメイン/admin の本体（2026-08-09 段階3）。
//
// 1画面で「ログイン → デザイン設定（未確定なら） → 編集」までを完結させる。
// ログイン専用ルートを分けていないのは、店舗に案内するURLを
// 「https://お店のドメイン/admin」の1本だけにしたいため（マニュアルを薄く保つ）。
//
// デザインの決め方（★ 2026-09-12 第285便・カッキーさんの指示で変えた）:
//   ★ 店舗様から口頭で聞き、【運営が /admin →「公式HP管理」→ その店の「編集」】で
//     ひな形とカラーを選んで保存する。★ 入口はそこ1つだけ。
//   ★ この画面（店舗様の側）にデザインの選択UIは無い。★ ホームの枠に1行出るだけ。
//   ★ design_locked=false のあいだは「デザインを準備中です」の案内になる（誰が見ても同じ）。
//     ★ 以前ここにあったギャラリー（HpGallery）はもう呼んでいない。
//
// 権限判定はサーバー（actions/hpAdmin.ts）が唯一の正。ここでの出し分けは見た目だけで、
// 権限が無い状態で操作しても各アクションがエラーを返す。

type View =
  | { kind: 'loading' }
  | { kind: 'login'; notice: string }
  | { kind: 'ready'; ctx: HpAdminContext };

export function HpAdminApp({
  siteKey,
  previewHref,
  mypageHref,
}: {
  siteKey: string;
  previewHref: string;
  // ★ 「マイページへ戻る」の行き先（第278便）。★ 店舗ドメインで開いているときは
  //   fukues.com の絶対URLが渡る（★ 店舗ドメインに /mypage は無いため）。
  mypageHref: string;
}) {
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [toast, setToast] = useState('');
  // ★★ いま出している画面（第278便）。★ URLは /admin のまま変えない。
  //   ★ ページを移らないので、保存前の入力が消えない（HpEditor が外れない）。
  const [section, setSection] = useState<HpAdminSection>('home');

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 4000);
  }, []);

  const load = useCallback(async () => {
    const res = await getHpAdminContext(siteKey);
    if (res.ok) setView({ kind: 'ready', ctx: res.ctx });
    else setView({ kind: 'login', notice: res.error });
  }, [siteKey]);

  useEffect(() => {
    load();
  }, [load]);

  const patchSite = (site: HpSite) =>
    setView((v) => (v.kind === 'ready' ? { kind: 'ready', ctx: { ...v.ctx, site } } : v));

  if (view.kind === 'loading') {
    return <div className="min-h-screen flex items-center justify-center text-xs text-slate-400">読み込み中です…</div>;
  }

  if (view.kind === 'login') {
    // ログイン成功後はハードリロード。ソフト再取得だと、確立直後のセッションCookieが
    // Server Action のリクエストに乗り切らず未ログイン扱いに戻るレースがある
    // （/cast/login で実際に踏んだ問題。全documentリクエストにすれば確実）。
    return <LoginCard notice={view.notice} onDone={() => window.location.reload()} />;
  }

  const { ctx } = view;
  const { site } = ctx;

  // ★ ひな形とカラーの名前・色（第285便でホームの枠に出すため、ここで引く）。
  //   ★ 不正なキーでも落ちないよう、そのひな形の先頭色に倒す（★ 公開ページ側と同じ考え）。
  const templateLabel = HP_TEMPLATES.find((t) => t.key === site.template_key)?.label ?? '';
  const colorVariant = HP_COLOR_VARIANTS[site.template_key].find((v) => v.key === site.theme_key)
    ?? HP_COLOR_VARIANTS[site.template_key][0];

  // ★★★ 「ページを見る」の飛び先（2026-09-11 夜・カッキーさんの指示）。
  //   ★ 独自ドメインが付いていて【公開中】なら、そのドメインの表紙へ飛ばす。
  //     ★ お客様が実際に見ているのはそのドメイン。★ 店舗様に見てほしいのも同じ物。
  //   ★ それ以外（ドメインまだ・制作中・停止中）は、これまでどおり previewHref。
  //     ★ 公開前にドメインへ飛ばすと、DNS の向き先が未接続で【ブラウザのエラー画面】が出ることがある。
  //       ★ フクエス側の道（/hp/{slug}）はいつでも生きているので、そちらなら白い1枚で済む。
  //   ★ www. は落とす（★ 公開HP側・マイページ側と同じ normalizeHpSiteKey。判断を1か所にする）。
  const viewHref =
    site.status === 'live' && (site.domain ?? '').trim() !== ''
      ? `https://${normalizeHpSiteKey(site.domain as string)}/`
      : previewHref;

  // ★★★ サイドバーに出す画面（第278便・2026-09-12・カッキーさんの指示）。
  //   ★ 判断はこの1か所。★ 出さない画面は、押す道そのものを作らない。
  //     ★ デザインが未確定のあいだ ＝ 写真も文章もまだ入れられないので【ホームだけ】（第285便）。
  //     ★ 「担当者アカウント」は第279便（2026-09-12・カッキーさんの指示）で画面ごと撤去した。
  //   ★★ 第282便（2026-09-12）から 'home' も HpEditor が受け持つ（コンセプトがホームに入ったため）。
  //     ★ なので「全部」は HP_ADMIN_NAV の並びをそのまま使う（★ 並びの正は1か所）。
  const sections: HpAdminSection[] = site.design_locked
    ? HP_ADMIN_NAV.map((n) => n.key)
    : (['home'] as HpAdminSection[]);
  // ★ 出せない画面が選ばれていたらホームに倒す（★ 白い画面を出さない）。
  const current: HpAdminSection = sections.includes(section) ? section : 'home';

  return (
    <HpShell
      salonName={ctx.salonName}
      salonDomain={site.domain}
      current={current}
      sections={sections}
      onSelect={setSection}
      mypageHref={mypageHref}
      toast={toast}
    >
      <div className="space-y-4">
        {/* ── ホーム ＝ 公開の状態・ドメイン・ページを見る ── */}
        {current === 'home' && (
          <div className="bg-white rounded-none border border-slate-100 shadow-sm p-5 space-y-3">
            {/* ★ 公開中／非公開の印は外した（第281便・2026-09-12・カッキーさんの指示）。
                ★ 店舗様が切り替えられないものの状態を、ここで大きく見せる意味がないため。
                ★ 状態は運営の管理者ダッシュボード（/admin → 公式HP）で見る。 */}
            {/* ★★ 第283便（2026-09-12・カッキーさんの指示）: ドメインとボタンの場所を入れ替えた。
                ★ 見出しの【右】＝いちばん目につく場所には【押すもの】を置く。
                ★ ドメインは読むだけのものなので、下の行へ下ろす。
                ★ 文字も「ページを見る」→「公式サイトを見る」に（★ 何のページか分かるように）。
                ★ 狭いときは下に回り込む（flex-wrap）。 */}
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div>
                <h3 className="text-sm font-black text-slate-800">ホームページ管理</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">{ctx.salonName}</p>
              </div>
              <a
                href={viewHref}
                target="_blank"
                rel="noreferrer"
                className="flex-none px-4 py-2 rounded-none border border-slate-200 text-xs font-bold text-slate-500 hover:border-slate-300"
              >
                公式サイトを見る
              </a>
            </div>
            <p className="text-xs text-slate-500 break-all">
              ドメイン：{site.domain
                ? <span className="font-bold text-slate-700">{site.domain}</span>
                : '準備中（運営で取得手続き中です）'}
            </p>
            {/* ★★ デザイン（ひな形とカラー）… 第285便（2026-09-12・カッキーさんの指示）で
                「デザイン」の画面をやめ、ここに1行で出す形にした。
                ★ 店舗様は選べない（選ぶのは運営が /admin で）。★ 読めれば足りる。
                ★ 丸はそのカラーのアクセント色。★ 色の正は lib/hpSite.ts の HP_COLOR_VARIANTS。 */}
            <div className="flex items-center gap-2">
              <span
                className="w-5 h-5 rounded-full border border-black/10 flex-none"
                style={{ backgroundColor: colorVariant.css['--hp-accent'] }}
              />
              <p className="text-xs text-slate-500">
                デザイン：<span className="font-bold text-slate-700">{templateLabel}／{colorVariant.label}</span>
              </p>
            </div>
            {/* ★★★ 2026-09-12（第279便・カッキーさんの指示）: ここから2つのボタンを外した。
                ★ 「公開する／非公開にする」… 公開・非公開は【運営だけ】が変える。
                  ★ 変える場所は運営の管理者ダッシュボード（/admin → 公式HP → その店の「編集」→ 公開状態）。
                  ★ 画面から消すだけでなく、サーバー側（actions/hpAdmin.ts の setHpSiteLive）でも
                    運営以外を弾いている（★ 二重に止める。★ 第273便のセラピスト削除と同じ作法）。
                ★ 「ログアウト」… 入口はマイページからの1本になったので、ここで出る用事が無い。
                  ★ ログアウトはマイページの右上にある。
                ★★ 第281便（2026-09-12）で、その下に置いていた
                  「※ 公開・非公開の切り替えは運営事務局で行います」の一文も外した。
                  ★ 店舗様に用事のない話を、毎回いちばん上で読ませないため。
                  ★ 押しても断られるボタンはもう無いので、言い訳の文も要らない。 */}
          </div>
        )}

        {/* ── 写真と文章の編集 ──
            ★★ HpEditor は【いつも置いておく】（★ 出す中身は section が決める）。
              ★ 画面を移るたびに外していると、保存前に書いた文字が消える。
            確定済み（design_locked=true）: 編集パネル
            未確定:                          「デザインを準備中です」の案内（★ 誰が見ても同じ・第285便） ── */}
        {site.design_locked ? (
          <HpEditor siteKey={siteKey} site={site} section={current} onSaved={patchSite} onToast={showToast} />
        ) : (
          <DesignPendingCard />
        )}
      </div>
    </HpShell>
  );
}

// ── デザイン打ち合わせ中（店舗向け・design_locked=false のとき） ──────
function DesignPendingCard() {
  return (
    <div className="bg-white rounded-none border border-slate-100 shadow-sm p-5 space-y-3">
      <h3 className="text-sm font-black text-slate-800">ホームページのデザインを準備中です</h3>
      <p className="text-xs text-slate-500 leading-relaxed">
        ホームページのデザイン（ひな形とカラー）は、担当者との打ち合わせで決定します。
        下のデザイン一覧からお好みのイメージをお選びのうえ、担当者までお知らせください。
      </p>
      <a
        href="https://fukues.com/hp/templates"
        target="_blank"
        rel="noreferrer"
        className="inline-block px-5 py-2.5 rounded-none bg-pink-500 text-white text-xs font-black hover:bg-pink-600 transition-colors"
      >
        デザイン一覧を見る
      </a>
      <p className="text-[11px] text-slate-400 leading-relaxed">
        デザインの設定が完了すると、この画面で写真や文章の変更ができるようになります。
      </p>
    </div>
  );
}

// ── ログイン ─────────────────────────────────────────
function LoginCard({ notice, onDone }: { notice: string; onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // 「ログインが必要です」は初回表示では警告に見えるので出さない（未ログインは想定内）。
  const showNotice = notice !== '' && notice !== 'ログインが必要です';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email || !password) { setError('メールアドレスとパスワードを入力してください。'); return; }
    setLoading(true);
    try {
      const res = await signInWithEmail(email.trim(), password);
      if (!res.ok) { setError(res.error ?? 'ログインに失敗しました。'); return; }
      onDone();
    } catch {
      setError('通信エラーが発生しました。インターネット環境をお確かめください。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="text-lg font-black text-slate-900">ホームページ管理</h1>
          <p className="text-xs text-slate-500 mt-1">オーナー様・ご担当者様専用</p>
        </div>

        {showNotice && (
          <p className="mb-4 text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-none px-3 py-2 leading-relaxed">
            {notice}
          </p>
        )}

        <form onSubmit={submit} className="bg-white rounded-none border border-slate-200 shadow-sm p-7 space-y-5">
          <div>
            <label htmlFor="hp-admin-email" className="block text-xs font-bold text-slate-600 mb-1.5">メールアドレス</label>
            <input
              id="hp-admin-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
              className="w-full px-3.5 py-2.5 rounded-none border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent"
            />
          </div>
          <div>
            <label htmlFor="hp-admin-password" className="block text-xs font-bold text-slate-600 mb-1.5">パスワード</label>
            <input
              id="hp-admin-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              placeholder="••••••••"
              className="w-full px-3.5 py-2.5 rounded-none border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent"
            />
          </div>
          {error && (
            <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-none px-3 py-2">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-none bg-pink-600 text-white text-sm font-semibold hover:bg-pink-700 disabled:opacity-60 transition"
          >
            {loading ? 'ログイン中...' : 'ログイン'}
          </button>
        </form>

        <p className="mt-5 text-center text-[11px] text-slate-400 leading-relaxed">
          フクエスのオーナーアカウント、または招待メールで作成したアカウントでログインできます。
          <br />
          <a href="https://fukues.com/forgot-password" className="text-pink-600 font-medium hover:underline">
            パスワードをお忘れの方はこちら →
          </a>
        </p>
      </div>
    </div>
  );
}
