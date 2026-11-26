// Public storefront + router. The admin panel (admin.tsx) is lazy-loaded and never reaches normal visitors.
import { lazy, StrictMode, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import {
  ACTIVE_SEASON, app, BRAND, FILTERS, formatPrice, getSeason, isFirebaseConfigured, Logo, normalizeProduct,
  RECIPIENTS, SafeImage, SEED_PRODUCTS, useEscape, type Product, type Season,
} from './shared';
import './style.css';

const AdminPage = lazy(() => import('./admin'));

/* ───────── hooks ───────── */
function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : initial; } catch { return initial; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked */ } }, [key, value]);
  return [value, setValue] as const;
}

interface Catalog { activeSeason: string; products: Product[] }
const CACHE_KEY = 'pz:catalog:v1';
const seedCatalog = (): Catalog => ({ activeSeason: ACTIVE_SEASON, products: SEED_PRODUCTS });

async function fetchCatalog() {
  const { collection, doc, getDoc, getDocs, getFirestore } = await import('firebase/firestore/lite');
  const db = getFirestore(app!);
  const [settings, snap] = await Promise.all([getDoc(doc(db, 'settings', 'general')), getDocs(collection(db, 'products'))]);
  const s = settings.data()?.activeSeason;
  return { activeSeason: typeof s === 'string' ? s : undefined, products: snap.docs.map((d) => normalizeProduct(d.id, d.data())) };
}

// Cached data shows instantly, then refreshes from Firestore. Empty/failed Firestore falls back to seed data.
function useCatalog() {
  const [data, setData] = useState<Catalog | null>(() => {
    if (!isFirebaseConfigured) return seedCatalog();
    try { const raw = localStorage.getItem(CACHE_KEY); return raw ? (JSON.parse(raw) as Catalog) : null; } catch { return null; }
  });
  useEffect(() => {
    if (!isFirebaseConfigured) return;
    let off = false;
    fetchCatalog().then((r) => {
      if (off) return;
      if (r.products.length === 0) return setData({ activeSeason: r.activeSeason ?? ACTIVE_SEASON, products: SEED_PRODUCTS });
      const next = { activeSeason: r.activeSeason ?? ACTIVE_SEASON, products: r.products };
      setData(next);
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    }).catch(() => { if (!off) setData((prev) => prev ?? seedCatalog()); });
    return () => { off = true; };
  }, []);
  return useMemo(() => {
    const season = getSeason(data?.activeSeason);
    return { loading: data === null, season, products: (data?.products ?? []).filter((p) => p.isActive && p.season === season.id) };
  }, [data]);
}

/* ───────── snow ───────── */
function Snow() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!; const ctx = canvas.getContext('2d')!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const count = window.innerWidth < 640 ? 28 : 50;
    let w = 0, h = 0, raf = 0;
    const flakes = Array.from({ length: count }, () => ({ x: Math.random(), y: Math.random(), r: 1 + Math.random() * 2.2, s: 0.25 + Math.random() * 0.6, d: Math.random() * Math.PI * 2 }));
    const resize = () => { w = window.innerWidth; h = window.innerHeight; canvas.width = w * dpr; canvas.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    resize(); window.addEventListener('resize', resize);
    const tick = () => {
      if (!document.hidden) {
        ctx.clearRect(0, 0, w, h); ctx.fillStyle = 'rgba(147,197,253,0.85)'; ctx.beginPath();
        for (const f of flakes) {
          f.d += 0.01; f.y += (f.s * 0.6) / h * 60; f.x += Math.sin(f.d) * 0.0006;
          if (f.y > 1.02) { f.y = -0.02; f.x = Math.random(); }
          const px = f.x * w, py = f.y * h; ctx.moveTo(px + f.r, py); ctx.arc(px, py, f.r, 0, Math.PI * 2);
        }
        ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={ref} aria-hidden="true" className="pointer-events-none fixed inset-0 z-20 h-full w-full" />;
}

/* ───────── page pieces ───────── */
function Header({ savedCount, onOpenSaved, snowAvailable, snowOn, onToggleSnow }: { savedCount: number; onOpenSaved: () => void; snowAvailable: boolean; snowOn: boolean; onToggleSnow: () => void }) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Logo />
        <div className="flex items-center gap-2">
          {snowAvailable && (
            <button onClick={onToggleSnow} aria-pressed={snowOn} aria-label={snowOn ? 'Turn snow off' : 'Turn snow on'} className="btn-ghost">
              <span aria-hidden="true">❄</span><span className="hidden sm:inline">{snowOn ? 'Snow on' : 'Snow off'}</span>
            </button>
          )}
          <button onClick={onOpenSaved} className="btn-ghost" aria-label={`My Picks, ${savedCount} saved`}>
            <span aria-hidden="true">♡</span> My Picks
            <span className="ml-1 rounded-full bg-accent px-1.5 text-xs font-bold text-white">{savedCount}</span>
          </button>
        </div>
      </div>
    </header>
  );
}

function Hero({ season }: { season: Season }) {
  const c = season.countdown;
  const days = c ? Math.ceil((new Date(c.date).getTime() - Date.now()) / 86_400_000) : 0;
  return (
    <section className={`mx-auto mt-4 max-w-6xl overflow-hidden rounded-2xl bg-gradient-to-br ${season.heroClass} px-5 py-9 text-white sm:px-10 sm:py-14`} style={{ marginInline: 'max(1rem, calc((100vw - 72rem) / 2))' }}>
      <span className="inline-block rounded-full bg-accent px-3 py-1 text-xs font-bold">{season.badge}</span>
      <h1 className="mt-4 max-w-xl font-display text-3xl font-extrabold leading-tight sm:text-5xl">{season.headline}</h1>
      <p className="mt-3 max-w-lg text-base text-blue-100">{season.subline}</p>
      {c && days > 0 && (
        <p className="mt-6 inline-block rounded-lg border border-white/20 px-3 py-2 text-sm">
          <strong className="font-display text-lg">{days}</strong> {days === 1 ? 'day' : 'days'} {c.label}
        </p>
      )}
    </section>
  );
}

function ProductCard({ product: p, saved, comparing, highlighted, onSave, onCompare, onShare }: { product: Product; saved: boolean; comparing: boolean; highlighted: boolean; onSave: () => void; onCompare: () => void; onShare: () => void }) {
  return (
    <article id={`p-${p.id}`} className={`flex scroll-mt-24 flex-col overflow-hidden rounded-xl border bg-white transition ${highlighted ? 'border-accent ring-2 ring-accent' : 'border-slate-200'}`}>
      <div className="relative">
        <SafeImage src={p.image} alt={p.title} emoji={p.emoji} className="aspect-[4/3] w-full" />
        {p.badge && <span className={`absolute left-2 top-2 rounded-full px-2.5 py-0.5 text-xs font-bold ${p.badge === 'Top Pick' ? 'bg-accent text-white' : 'bg-white text-navy'}`}>{p.badge}</span>}
        <button onClick={onSave} aria-pressed={saved} aria-label={saved ? `Remove ${p.title} from My Picks` : `Save ${p.title} to My Picks`} className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-white text-lg shadow-sm">
          <span className={saved ? 'text-accent' : 'text-slate-400'}>{saved ? '♥' : '♡'}</span>
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-display text-base font-extrabold leading-snug text-navy">{p.title}</h2>
          <span className="font-bold text-navy">{formatPrice(p)}</span>
        </div>
        <p className="text-xs text-slate-500">{p.category} · Best for: {p.bestFor}</p>
        <p className="text-sm text-slate-600"><strong className="text-navy">Why we picked it:</strong> {p.why}</p>
        <div className="mt-auto flex items-center gap-2 pt-3">
          <a href={p.url} target="_blank" rel="nofollow sponsored noopener" className="btn-primary flex-1">View deal</a>
          <button onClick={onCompare} aria-pressed={comparing} className="btn-ghost aria-pressed:border-navy aria-pressed:bg-navy aria-pressed:text-white">{comparing ? '✓ Compare' : 'Compare'}</button>
          <button onClick={onShare} aria-label={`Share ${p.title}`} className="btn-ghost px-2.5">⤴</button>
        </div>
      </div>
    </article>
  );
}

function ProductSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading picks">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="animate-pulse overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="aspect-[4/3] bg-slate-200" />
          <div className="space-y-3 p-4"><div className="h-4 w-3/4 rounded bg-slate-200" /><div className="h-3 w-1/2 rounded bg-slate-100" /><div className="h-3 w-full rounded bg-slate-100" /><div className="h-9 w-full rounded-lg bg-slate-200" /></div>
        </div>
      ))}
    </div>
  );
}

const BUDGETS = [{ max: 25, label: 'Under $25' }, { max: 50, label: 'Under $50' }, { max: Infinity, label: 'Any budget' }];
function GiftFinder({ products }: { products: Product[] }) {
  const [who, setWho] = useState<string | null>(null);
  const [max, setMax] = useState<number>(Infinity);
  const matches = useMemo(() => !who ? [] : products
    .filter((p) => p.recipients.includes(who) && p.price <= max)
    .sort((a, b) => Number(b.badge === 'Top Pick') - Number(a.badge === 'Top Pick') || a.price - b.price).slice(0, 3), [products, who, max]);
  return (
    <section aria-labelledby="finder" className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <h2 id="finder" className="font-display text-lg font-extrabold text-navy">Gift finder</h2>
      <p className="text-sm text-slate-500">Two taps to your best matches.</p>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Who is it for?">
        {RECIPIENTS.map((w) => <button key={w} className="pill" aria-pressed={who === w} onClick={() => setWho(w)}>{w}</button>)}
      </div>
      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Budget">
        {BUDGETS.map((b) => <button key={b.label} className="pill" aria-pressed={max === b.max} onClick={() => setMax(b.max)}>{b.label}</button>)}
      </div>
      <div className="mt-4" aria-live="polite">
        {!who && <p className="text-sm text-slate-500">Choose who it is for to see matches.</p>}
        {who && matches.length === 0 && <p className="text-sm text-slate-500">No matches at that budget. Try a higher one.</p>}
        <ul className="grid gap-2 sm:grid-cols-3">
          {matches.map((p) => (
            <li key={p.id}>
              <a href={p.url} target="_blank" rel="nofollow sponsored noopener" className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 hover:border-accent">
                <span className="text-2xl" aria-hidden="true">{p.emoji}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-navy">{p.title}</span><span className="text-xs text-slate-500">{formatPrice(p)} · {p.bestFor}</span></span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function CompareModal({ items, onClose, onRemove }: { items: Product[]; onClose: () => void; onRemove: (id: string) => void }) {
  useEscape(onClose);
  const lowest = Math.min(...items.map((p) => p.price));
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/60 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Compare products" onClick={(e) => e.stopPropagation()} className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-t-2xl bg-white p-4 sm:rounded-2xl sm:p-6">
        <div className="flex items-center justify-between"><h2 className="font-display text-xl font-extrabold text-navy">Compare</h2><button onClick={onClose} className="btn-ghost" aria-label="Close comparison">✕</button></div>
        <div className="mt-4 overflow-x-auto">
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(160px, 1fr))` }}>
            {items.map((p) => (
              <div key={p.id} className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3 text-sm">
                <SafeImage src={p.image} alt={p.title} emoji={p.emoji} className="aspect-[4/3] w-full rounded-lg" />
                <h3 className="font-display font-extrabold text-navy">{p.title}</h3>
                <p className="text-lg font-bold text-navy">{formatPrice(p)}{p.price === lowest && items.length > 1 && <span className="ml-2 rounded-full bg-orange-100 px-2 py-0.5 text-xs text-accent">Lowest</span>}</p>
                <p><strong className="text-navy">Best for:</strong> {p.bestFor}</p>
                <p className="text-slate-600"><strong className="text-navy">Why:</strong> {p.why}</p>
                <p className="text-slate-500">{p.badge ?? 'Curated pick'}</p>
                <a href={p.url} target="_blank" rel="nofollow sponsored noopener" className="btn-primary mt-auto">View deal</a>
                <button onClick={() => onRemove(p.id)} className="text-xs text-slate-500 underline">Remove</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SavedDrawer({ items, onClose, onRemove }: { items: Product[]; onClose: () => void; onRemove: (id: string) => void }) {
  useEscape(onClose);
  return (
    <div className="fixed inset-0 z-50 bg-navy/50" onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-label="My Picks" onClick={(e) => e.stopPropagation()} className="ml-auto flex h-full w-full max-w-sm flex-col bg-white p-4 shadow-xl">
        <div className="flex items-center justify-between"><h2 className="font-display text-xl font-extrabold text-navy">My Picks</h2><button onClick={onClose} className="btn-ghost" aria-label="Close My Picks">✕</button></div>
        {items.length === 0 ? <p className="mt-6 text-sm text-slate-500">Nothing saved yet. Tap the heart on any pick and it will wait for you here.</p> : (
          <ul className="mt-4 flex-1 space-y-3 overflow-auto">
            {items.map((p) => (
              <li key={p.id} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
                <span className="text-2xl" aria-hidden="true">{p.emoji}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-navy">{p.title}</span><span className="text-xs text-slate-500">{formatPrice(p)}</span></span>
                <a href={p.url} target="_blank" rel="nofollow sponsored noopener" className="btn-primary px-3 py-1.5">Shop</a>
                <button onClick={() => onRemove(p.id)} aria-label={`Remove ${p.title}`} className="text-slate-400">✕</button>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}

function Footer({ onJump }: { onJump: (filterId: string) => void }) {
  return (
    <footer className="mt-14 bg-navy text-blue-100">
      <div className="mx-auto max-w-6xl px-4 py-8 text-sm">
        <p className="max-w-2xl"><strong className="text-white">Affiliate disclosure.</strong> {BRAND.disclosure}</p>
        <nav aria-label="Jump to a category" className="mt-5 flex flex-wrap gap-x-5 gap-y-2">
          {FILTERS.filter((f) => f.id !== 'all').map((f) => <button key={f.id} onClick={() => onJump(f.id)} className="underline-offset-2 hover:underline">{f.label}</button>)}
        </nav>
        <div className="mt-3 flex flex-wrap gap-x-5">
          {BRAND.socials.map((s) => <a key={s.label} href={s.href} target="_blank" rel="noopener" className="underline-offset-2 hover:underline">{s.label}</a>)}
        </div>
        <p className="mt-6 text-xs text-blue-300">© {new Date().getFullYear()} {BRAND.name}. {BRAND.tagline}</p>
      </div>
    </footer>
  );
}

/* ───────── home page ───────── */
const MAX_COMPARE = 3;
function Home() {
  const { loading, season, products } = useCatalog();
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const reducedMotion = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [filter, setFilter] = useState('all');
  const [saved, setSaved] = useLocalStorage<string[]>('pz:saved', []);
  const [snowOn, setSnowOn] = useLocalStorage<boolean>('pz:snow', true);
  const [compare, setCompare] = useState<string[]>([]);
  const [showSaved, setShowSaved] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(params.get('pick'));
  const [toast, setToast] = useState('');

  const flash = useCallback((msg: string) => { setToast(msg); window.setTimeout(() => setToast(''), 2200); }, []);

  // Deep link: ?pick=<id> scrolls to and highlights that product once the catalog is ready.
  useEffect(() => {
    if (!focusId || loading) return;
    document.getElementById(`p-${focusId}`)?.scrollIntoView({ block: 'center' });
    const t = window.setTimeout(() => setFocusId(null), 4000);
    return () => window.clearTimeout(t);
  }, [focusId, loading]);

  const list = useMemo(() => {
    const f = FILTERS.find((x) => x.id === filter) ?? FILTERS[0];
    const q = query.trim().toLowerCase();
    return products.filter((p) => f.test(p) && (!q || `${p.title} ${p.category} ${p.bestFor} ${p.why}`.toLowerCase().includes(q)));
  }, [products, filter, query]);

  const savedProducts = products.filter((p) => saved.includes(p.id));
  const compareProducts = compare.map((id) => products.find((p) => p.id === id)).filter((p): p is Product => !!p);
  const toggleSave = (id: string) => setSaved((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const toggleCompare = (id: string) => {
    if (compare.includes(id)) return setCompare(compare.filter((x) => x !== id));
    if (compare.length >= MAX_COMPARE) return flash(`Compare up to ${MAX_COMPARE} items`);
    setCompare([...compare, id]);
  };
  const share = async (p: Product) => {
    const url = `${window.location.origin}${window.location.pathname}?pick=${p.id}`;
    try {
      if (navigator.share) { await navigator.share({ title: `${p.title} · PickerZone`, url }); return; }
      await navigator.clipboard.writeText(url); flash('Link copied');
    } catch { /* share cancelled */ }
  };
  const jump = (id: string) => { setFilter(id); setQuery(''); document.getElementById('picks')?.scrollIntoView(); };
  const snowVisible = season.snow && snowOn && !reducedMotion;

  return (
    <>
      {snowVisible && <Snow />}
      <Header savedCount={savedProducts.length} onOpenSaved={() => setShowSaved(true)} snowAvailable={season.snow && !reducedMotion} snowOn={snowOn} onToggleSnow={() => setSnowOn(!snowOn)} />
      <main>
        <Hero season={season} />
        <div className="mx-auto max-w-6xl space-y-5 px-4 pt-6">
          <GiftFinder products={products} />
          <section id="picks" aria-label="All picks" className="scroll-mt-20 space-y-4">
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search lights, mugs, gifts…" aria-label="Search picks" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base outline-none focus:border-navy" />
            <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4" role="group" aria-label="Filters">
              {FILTERS.map((f) => <button key={f.id} className="pill" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</button>)}
            </div>
            {loading ? <ProductSkeleton /> : list.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500">No picks match that. <button className="underline" onClick={() => { setQuery(''); setFilter('all'); }}>Clear search and filters</button></p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((p) => <ProductCard key={p.id} product={p} saved={saved.includes(p.id)} comparing={compare.includes(p.id)} highlighted={focusId === p.id} onSave={() => toggleSave(p.id)} onCompare={() => toggleCompare(p.id)} onShare={() => share(p)} />)}
              </div>
            )}
          </section>
        </div>
      </main>
      <Footer onJump={jump} />

      {compareProducts.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white p-3 shadow-lg">
          <div className="mx-auto flex max-w-6xl items-center gap-3">
            <p className="flex-1 truncate text-sm text-slate-600"><strong className="text-navy">{compareProducts.length}/{MAX_COMPARE}</strong> selected: {compareProducts.map((p) => p.emoji).join(' ')}</p>
            <button className="text-sm text-slate-500 underline" onClick={() => setCompare([])}>Clear</button>
            <button className="btn-primary" disabled={compareProducts.length < 2} onClick={() => setShowCompare(true)} style={compareProducts.length < 2 ? { opacity: 0.5 } : undefined}>{compareProducts.length < 2 ? 'Pick 1 more' : 'Compare'}</button>
          </div>
        </div>
      )}
      {showCompare && compareProducts.length >= 2 && <CompareModal items={compareProducts} onClose={() => setShowCompare(false)} onRemove={(id) => { const next = compare.filter((x) => x !== id); setCompare(next); if (next.length < 2) setShowCompare(false); }} />}
      {showSaved && <SavedDrawer items={savedProducts} onClose={() => setShowSaved(false)} onRemove={toggleSave} />}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center">
        {toast && <span className="rounded-full bg-navy px-4 py-2 text-sm text-white shadow-lg">{toast}</span>}
      </div>
    </>
  );
}

/* ───────── router + mount ───────── */
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/admin" element={<Suspense fallback={<div className="p-10 text-center text-slate-500">Loading admin…</div>}><AdminPage /></Suspense>} />
        <Route path="*" element={<Home />} />
      </Routes>
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
