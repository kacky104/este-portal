import Image from 'next/image';
import styles from './matchingFlow.module.css';

// ★ 第975便（2026-09-29・カッキーさん）: お仕事マッチングの「かんたん 3 STEP」（いただいた実装用 ZIP のデザイン）。
// ★ ページの見出し（h1）もこのブロックが持つ。★ SEO のため「お仕事マッチング」は h1 の頭に読み上げ用で残す（画面には出さない）。
// ★ 写真は public/jobs/matching/step-*.webp（ZIP の jpg を 600px の webp にしたもの）。
const STEPS = [
  {
    n: '01',
    img: '/jobs/matching/step-1.webp',
    alt: 'スマートフォンで希望条件を考える女性',
    title: '希望を入力',
    text: ['エリアや働き方など、', '気になる条件を選ぶだけ。'],
  },
  {
    n: '02',
    img: '/jobs/matching/step-2.webp',
    alt: 'パソコンでお店を探す運営スタッフ',
    title: '運営がお探し',
    text: ['ご希望に合うお店を、', '運営が無料でピックアップ。'],
  },
  {
    n: '03',
    img: '/jobs/matching/step-3.webp',
    alt: 'スマートフォンで連絡を受け取る女性',
    title: 'お店からご連絡',
    text: ['条件に合うお店からご連絡。', 'お話を進めるかはあなた次第。'],
  },
] as const;

export function MatchingFlow() {
  return (
    <section className={styles.flow} aria-labelledby="matching-flow-title">
      <div className={styles.inner}>
        <p className={styles.eyebrow}>かんたん 3 STEP</p>
        <h1 id="matching-flow-title" className={styles.title}>
          <span className="sr-only">お仕事マッチング｜</span>
          あなたに合うお店と出会うまで
        </h1>
        <p className={styles.lead}>希望を教えていただくだけで、運営があなたに合うお店を無料でお探しします。</p>

        <ol className={styles.steps}>
          {STEPS.map((s, i) => (
            <li key={s.n} className={styles.card}>
              <div className={styles.photo}>
                <Image
                  src={s.img}
                  alt={s.alt}
                  width={600}
                  height={600}
                  sizes="(max-width: 680px) 40vw, 320px"
                  priority={i === 0}
                />
              </div>
              <div className={styles.body}>
                <span className={styles.number}>
                  STEP <strong>{s.n}</strong>
                </span>
                <h2 className={styles.stepTitle}>{s.title}</h2>
                <p className={styles.stepText}>
                  {s.text[0]}
                  <br />
                  {s.text[1]}
                </p>
              </div>
            </li>
          ))}
        </ol>

        <p className={styles.footnote}>
          <span className={styles.onlyPc}>まずは下のフォームから、あなたの希望を教えてください</span>
          <span className={styles.onlySp}>下のフォームから希望を教えてください</span>
          <span className={styles.footnoteMark} aria-hidden="true">⌄</span>
        </p>
      </div>
    </section>
  );
}
