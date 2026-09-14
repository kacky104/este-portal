import Link from 'next/link';
import { areaLabel } from '@/app/lib/areaLabel';
import type { FreeListing } from '@/app/lib/salons';

export const FREE_LISTING_HEADING = 'その他の掲載店舗';

export function FreeListingCards({ items }: { items: FreeListing[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-label={FREE_LISTING_HEADING} className="px-3 lg:px-0">
      <h2 className="text-base font-bold text-slate-900 mb-2">{FREE_LISTING_HEADING}</h2>
      <ul className="grid grid-cols-2 lg:grid-cols-3 gap-2">
        {items.map((s) => (
          <li key={s.id}>
            <Link href={`/salon/${s.id}`} className="block bg-white border border-slate-200 px-3 py-2.5 hover:bg-slate-50 transition-colors">
              <p className="text-sm font-bold text-slate-900 truncate">{s.name}</p>
              <p className="text-[11px] text-slate-500 mt-0.5 truncate">{areaLabel(s.area)}</p>
              {s.catchphrase && <p className="text-[12px] text-slate-600 mt-1 truncate">{s.catchphrase}</p>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
