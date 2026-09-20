// フクエスCRM の規約・取り扱いの本文を表示する（第569便）。★ 見出し「## 」・箇条「- 」「1. 」・空行で段落。
export function TermsView({ title, text }: { title: string; text: string }) {
  const blocks = text.split(/\n\s*\n/);
  return (
    <main className="mx-auto w-full max-w-3xl bg-white px-5 py-10 text-slate-700">
      <h1 className="mb-6 text-2xl font-bold text-slate-900">{title}</h1>
      {blocks.map((b, i) => {
        const lines = b.split('\n');
        return (
          <div key={i} className="mb-4 space-y-1 text-[14px] leading-relaxed">
            {lines.map((l, j) => {
              if (l.startsWith('## ')) return <h2 key={j} className="mt-6 text-lg font-bold text-slate-800">{l.slice(3)}</h2>;
              if (/^(- |\d+\. )/.test(l)) return <p key={j} className="pl-4 -indent-4">{l.startsWith('- ') ? `・${l.slice(2)}` : l}</p>;
              return <p key={j}>{l}</p>;
            })}
          </div>
        );
      })}
    </main>
  );
}
