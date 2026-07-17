"use client";

/**
 * ScrollPopupImage
 * サロン詳細ページ用：下にスクロールすると左下から「ポンっ」と跳ねて出る画像。
 *
 * 挙動（HTMLデモと同じ）:
 *  - 少しスクロールすると出現（showAfter px を超えたら）
 *  - 一番上まで戻すと消える（また下げると再び出る）
 *  - ✕ で閉じると、そのセッション中は再表示しない
 *  - 画像本体クリックで href へ遷移
 *  - スマホのみ表示（PC・タブレット等、幅600pxより広い画面では非表示）
 *  - サイズ：スマホ 42vw × 30vh（横=画面幅の約42%・縦=画面高の約30%）
 *  - 枠なし表示：角丸カード枠・四角い影は付けず、画像は全体表示（切れない）。
 *    背景を透過したPNG（切り抜き画像）は背景に溶け込む。影はシルエットに沿う drop-shadow。
 *
 * 使い方（例）:
 *   import ScrollPopupImage from "@/components/ScrollPopupImage";
 *
 *   <ScrollPopupImage
 *     src="/banners/campaign.png"
 *     href="/campaign"
 *     alt="キャンペーン"
 *   />
 *
 *   // 別タブで開きたい場合や閾値・サイズを変えたい場合:
 *   <ScrollPopupImage
 *     src="https://example.com/banner.png"
 *     href="https://example.com/campaign"
 *     target="_blank"
 *     showAfter={300}
 *     widthVw={25}
 *     heightVh={33}
 *   />
 *
 * ※ サロン詳細ページ（App Router の page/コンポーネント）内に1つ置くだけです。
 *   親が Server Component でもこのファイルは "use client" なのでそのまま配置できます。
 */

import { useEffect, useRef, useState } from "react";

type Props = {
  /** 表示する画像URL（/public 配下のパス or 絶対URL） */
  src: string;
  /** クリック時の遷移先 */
  href: string;
  /** 画像のalt（アクセシビリティ用） */
  alt?: string;
  /** リンクのtarget（別タブなら "_blank"） */
  target?: "_self" | "_blank";
  /** このスクロール量(px)を超えたら出現（既定200） */
  showAfter?: number;
  /** これより上（ほぼ最上部, px）で消す（既定20） */
  hideBefore?: number;
  /** PC横幅：画面幅に対する%（既定25 = 約1/4） */
  widthVw?: number;
  /** PC縦幅：画面高に対する%（既定33 = 約1/3） */
  heightVh?: number;
  /** スマホ横幅%（既定42） */
  mobileWidthVw?: number;
  /** スマホ縦幅%（既定30） */
  mobileHeightVh?: number;
  /** 跳ねるアニメの秒数（既定0.7） */
  bounceDuration?: number;
  /** ✕を押した時などに呼ばれる任意コールバック */
  onClose?: () => void;
};

export default function ScrollPopupImage({
  src,
  href,
  alt = "",
  target = "_self",
  showAfter = 200,
  hideBefore = 20,
  widthVw = 25,
  heightVh = 33,
  mobileWidthVw = 42,
  mobileHeightVh = 30,
  bounceDuration = 0.7,
  onClose,
}: Props) {
  // visible: 現在表示中か / closed: ✕で閉じた（セッション中は再表示しない）
  const [visible, setVisible] = useState(false);
  const [closed, setClosed] = useState(false);
  // 退場アニメ用（true=消えていく途中）
  const [leaving, setLeaving] = useState(false);

  const closedRef = useRef(false);
  const visibleRef = useRef(false);
  closedRef.current = closed;
  visibleRef.current = visible;

  // src が空なら何も表示しない（設定を空にすればポップアップを止められる）
  const enabled = Boolean(src);

  useEffect(() => {
    if (!enabled) return;
    const onScroll = () => {
      const y = window.scrollY || window.pageYOffset;
      if (y <= hideBefore) {
        // 最上部付近 → 消す（閉じたわけではないので再度下げれば出る）
        if (visibleRef.current) {
          setLeaving(true);
          setVisible(false);
        }
      } else if (y > showAfter) {
        if (!closedRef.current && !visibleRef.current) {
          setLeaving(false);
          setVisible(true);
        }
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    // 初期位置がすでに下の場合にも対応
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [showAfter, hideBefore, enabled]);

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    setClosed(true);
    setLeaving(true);
    setVisible(false);
    onClose?.();
  };

  const handleClick = () => {
    // リンク未設定なら遷移しない（画像を見せるだけ・✕で閉じる用途）
    if (!href) return;
    if (target === "_blank") {
      window.open(href, "_blank", "noopener,noreferrer");
    } else {
      window.location.href = href;
    }
  };

  // src 未設定なら描画しない
  if (!enabled) return null;

  return (
    <>
      <style>{`
        @keyframes sp_bounce {
          0%   { transform: translateY(140%); opacity: .4; }
          55%  { transform: translateY(-10%); opacity: 1; }
          75%  { transform: translateY(4%); }
          100% { transform: translateY(0); opacity: 1; }
        }
        @keyframes sp_down {
          0%   { transform: translateY(0); opacity: 1; }
          100% { transform: translateY(140%); opacity: 0; }
        }
        .sp-pop {
          position: fixed;
          left: 16px;
          bottom: 16px;
          width: ${widthVw}vw;
          height: ${heightVh}vh;
          min-width: 120px;
          z-index: 50;
          cursor: pointer;
          transform: translateY(140%);
          opacity: 0;
          pointer-events: none;
          /* 枠なし（透過画像を背景に溶け込ませる）：角丸・四角い影・切り抜きは付けない */
        }
        .sp-pop.sp-show {
          opacity: 1;
          pointer-events: auto;
          animation: sp_bounce ${bounceDuration}s cubic-bezier(.18,.89,.32,1.28) forwards;
        }
        .sp-pop.sp-hide {
          animation: sp_down .35s ease-in forwards;
        }
        .sp-pop img {
          width: 100%;
          height: 100%;
          /* 全体表示（切り抜きPNGがはみ出さず全部見える）＋下寄せで人物が地に足つく */
          object-fit: contain;
          object-position: center bottom;
          display: block;
          /* 四角い box-shadow ではなく、画像のシルエットに沿う柔らかい影 */
          filter: drop-shadow(0 6px 10px rgba(0,0,0,.28));
        }
        .sp-close {
          position: absolute;
          top: 6px;
          left: 6px;
          z-index: 2;
          width: 26px;
          height: 26px;
          border-radius: 50%;
          background: rgba(0,0,0,.45);
          color: #fff;
          border: none;
          font-size: 15px;
          line-height: 26px;
          text-align: center;
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
        }
        .sp-close:hover { background: rgba(0,0,0,.65); }
        @media (max-width: 600px) {
          .sp-pop {
            width: ${mobileWidthVw}vw;
            height: ${mobileHeightVh}vh;
          }
        }
        /* スマホのみ表示：幅600pxより広い画面（PC・タブレット）では出さない */
        @media (min-width: 601px) {
          .sp-pop { display: none !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          .sp-pop.sp-show { animation: none; transform: translateY(0); }
          .sp-pop.sp-hide { animation: none; }
        }
      `}</style>

      {/* closed かつ退場アニメ完了後は表示しない */}
      {!(closed && !visible && !leaving) && (
        <div
          className={`sp-pop ${visible ? "sp-show" : leaving ? "sp-hide" : ""}`}
          style={{ cursor: href ? "pointer" : "default" }}
          onClick={handleClick}
          onAnimationEnd={() => {
            // 退場アニメが終わったら leaving を落として静止（次の出現に備える）
            if (!visible) setLeaving(false);
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") handleClick();
          }}
          aria-label={alt || "お知らせ"}
        >
          <button className="sp-close" onClick={handleClose} aria-label="閉じる">
            ✕
          </button>
          {/* next/image を使いたい場合はここを差し替えてください */}
          <img src={src} alt={alt} />
        </div>
      )}
    </>
  );
}
