// Public storefront + router. The admin panel (admin.tsx) is lazy-loaded and never reaches normal visitors.
import { lazy, StrictMode, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import {
  ACTIVE_SEASON, app, BRAND, FILTERS, formatPrice, getSeason, isFirebaseConfigured, Logo, normalizeProduct,
  RECIPIENTS, SafeImage, SEED_PRODUCTS, tileBg, useEscape, type Product, type Season,
} from './shared';
import './style.css';

const AdminPage = lazy(() => import('./admin'));
document.documentElement.classList.add('js');

/* ───────── hooks ───────── */
function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : initial; } catch { return initial; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked */ } }, [key, value]);
  return [value, setValue] as const;
}

// Fades an element in the first time it scrolls into view.
function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!('IntersectionObserver' in window)) { setShown(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } }, { rootMargin: '0px 0px -6% 0px', threshold: 0.04 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, shown] as const;
}

function Reveal({ as: Tag = 'div', delay = 0, className = '', children }: { as?: 'div' | 'section'; delay?: number; className?: string; children: ReactNode }) {
  const [ref, shown] = useReveal<HTMLDivElement>();
  return <Tag ref={ref as never} className={`reveal ${shown ? 'in' : ''} ${className}`} style={{ ['--i' as string]: delay }}>{children}</Tag>;
}

function useScrolled(offset = 12) {
  const [v, setV] = useState(false);
  useEffect(() => {
    const on = () => setV(window.scrollY > offset);
    on(); window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, [offset]);
  return v;
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

/* ───────── icons ───────── */
const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
const IconSearch = () => <svg width="20" height="20" viewBox="0 0 24 24" {...S} aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>;
const IconHeart = ({ size = 20 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" {...S} aria-hidden="true"><path d="M20.8 5.6a5.2 5.2 0 0 0-7.4 0L12 7l-1.4-1.4a5.2 5.2 0 0 0-7.4 7.4L12 21.8l8.8-8.8a5.2 5.2 0 0 0 0-7.4Z" /></svg>;
const IconShare = () => <svg width="19" height="19" viewBox="0 0 24 24" {...S} aria-hidden="true"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" /><path d="m16 6-4-4-4 4" /><path d="M12 2v13" /></svg>;
const IconCompare = () => <svg width="19" height="19" viewBox="0 0 24 24" {...S} aria-hidden="true"><path d="M7 4v16M17 4v16M3 8h8M13 16h8" /></svg>;
const IconCheck = ({ size = 16 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" {...S} strokeWidth={2.6} aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;
const IconUp = () => <svg width="20" height="20" viewBox="0 0 24 24" {...S} aria-hidden="true"><path d="m18 15-6-6-6 6" /></svg>;
const Arrow = () => <span className="arr" aria-hidden="true">→</span>;

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
        ctx.clearRect(0, 0, w, h); ctx.fillStyle = 'rgba(180,210,255,0.9)'; ctx.beginPath();
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
  return <canvas ref={ref} aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 20, width: '100%', height: '100%', pointerEvents: 'none' }} />;
}

/* ───────── header pieces ───────── */
function Announce({ season }: { season: Season }) {
  return (
    <div className="announce">
      <div className="wrap">
        <span className="dot" aria-hidden="true" />
        <span><b>{season.badge}</b> is live<span className="long"> · hand-picked finds, compared side by side</span></span>
        <a href="#disclosure">Affiliate disclosure</a>
      </div>
    </div>
  );
}

function Header({ savedCount, onOpenSaved, snowAvailable, snowOn, onToggleSnow }: { savedCount: number; onOpenSaved: () => void; snowAvailable: boolean; snowOn: boolean; onToggleSnow: () => void }) {
  const scrolled = useScrolled();
  const [bump, setBump] = useState(false);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setBump(true); const t = window.setTimeout(() => setBump(false), 450); return () => window.clearTimeout(t);
  }, [savedCount]);
  return (
    <header className={`hdr ${scrolled ? 'scrolled' : ''}`}>
      <div className="wrap">
        <Logo />
        <nav className="nav" aria-label="Primary">
          <a href="#picks">All picks</a><a href="#finder">Gift finder</a><a href="#how">How we pick</a><a href="#faq">FAQ</a>
        </nav>
        <div className="hdr-actions">
          {snowAvailable && (
            <button onClick={onToggleSnow} aria-pressed={snowOn} aria-label={snowOn ? 'Turn snow off' : 'Turn snow on'} className="icon-btn">
              <span aria-hidden="true">❄</span><span className="hide-sm">{snowOn ? 'On' : 'Off'}</span>
            </button>
          )}
          <button onClick={onOpenSaved} className="icon-btn" aria-label={`My Picks, ${savedCount} saved`}>
            <IconHeart size={18} /> <span className="hide-sm">My Picks</span>
            <span className={`count ${bump ? 'bump' : ''}`}>{savedCount}</span>
          </button>
        </div>
      </div>
    </header>
  );
}

/* ───────── hero ───────── */
const renderHeadline = (h: string) => h.split('*').map((part, i) => (i % 2 ? <em key={i}>{part}</em> : part));

function useCountdown(date?: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { if (!date) return; const t = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(t); }, [date]);
  if (!date) return null;
  const diff = new Date(date).getTime() - now;
  if (!(diff > 0)) return null;
  return { d: Math.floor(diff / 86_400_000), h: Math.floor(diff / 3_600_000) % 24, m: Math.floor(diff / 60_000) % 60, s: Math.floor(diff / 1000) % 60 };
}
const pad = (n: number) => String(n).padStart(2, '0');

function Hero({ season, products, query, onQuery, onSearch, onFilter }: { season: Season; products: Product[]; query: string; onQuery: (v: string) => void; onSearch: () => void; onFilter: (id: string) => void }) {
  const cd = useCountdown(season.countdown?.date);
  const feature = useMemo(() => [...products].sort((a, b) => Number(!!b.badge) - Number(!!a.badge)).slice(0, 3), [products]);
  return (
    <section className={`hero ${season.heroClass}`}>
      <div className="wrap hero-grid">
        <div>
          <span className="eyebrow"><i aria-hidden="true">✦</i>{season.badge}</span>
          <h1>{renderHeadline(season.headline)}</h1>
          <p className="sub">{season.subline}</p>
          <form className="search" role="search" onSubmit={(e) => { e.preventDefault(); onSearch(); }}>
            <IconSearch />
            <input type="search" value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Search lights, mugs, gift bundles…" aria-label="Search picks" />
            <button className="pz-btn pz-btn-accent" type="submit"><span className="txt">Find picks</span><Arrow /></button>
          </form>
          <div className="quick">
            <span>Popular:</span>
            {FILTERS.filter((f) => f.id !== 'all').map((f) => <button key={f.id} onClick={() => onFilter(f.id)}>{f.label}</button>)}
          </div>
          <div className="trust">
            <span><IconCheck />Hand-picked, never random</span>
            <span><IconCheck />Compared side by side</span>
            <span><IconCheck />Free to you, always</span>
          </div>
          {cd && <p className="cd-mini"><span aria-hidden="true">⏳</span><b>{cd.d}</b> {cd.d === 1 ? 'day' : 'days'} {season.countdown?.label}</p>}
        </div>

        <div className="stage" aria-hidden={feature.length === 0}>
          {cd && (
            <div className="cd" role="timer" aria-label={`Time ${season.countdown?.label}`}>
              <small>{season.countdown?.label}</small>
              <div className="cd-row">
                {([['Days', cd.d], ['Hours', cd.h], ['Min', cd.m], ['Sec', cd.s]] as const).map(([l, v]) => <div className="cd-u" key={l}><b>{pad(v)}</b><span>{l}</span></div>)}
              </div>
            </div>
          )}
          {feature.map((p) => (
            <a key={p.id} className="float" href={`#p-${p.id}`}>
              <span className="t" style={{ background: tileBg(p.title) }} aria-hidden="true">{p.emoji}</span>
              <span><span className="n">{p.title}</span><span className="p" style={{ display: 'block' }}><b>{formatPrice(p)}</b> · {p.badge ?? p.category}</span></span>
            </a>
          ))}
        </div>
      </div>
      <div className="wave" aria-hidden="true"><svg viewBox="0 0 1440 48" preserveAspectRatio="none"><path fill="currentColor" d="M0 48V22c120 18 260 26 420 18C640 29 760 0 960 4c180 4 330 22 480 34v10Z" /></svg></div>
    </section>
  );
}

/* ───────── categories ───────── */
const CAT_META: Record<string, { icon: string; blurb: string }> = {
  under25: { icon: '💸', blurb: 'Big joy, small price' },
  gift: { icon: '🎁', blurb: 'Ready-to-wrap winners' },
  decor: { icon: '🏠', blurb: 'Make your space glow' },
  trending: { icon: '🔥', blurb: 'What everyone is saving' },
};

function Categories({ products, onPick }: { products: Product[]; onPick: (id: string) => void }) {
  return (
    <div className="wrap">
      <div className="cats">
        {FILTERS.filter((f) => CAT_META[f.id]).map((f, i) => (
          <Reveal key={f.id} delay={i}>
            <button className="cat" style={{ width: '100%' }} onClick={() => onPick(f.id)}>
              <em>{products.filter(f.test).length}</em>
              <span className="ic" aria-hidden="true">{CAT_META[f.id].icon}</span>
              <b>{f.label}</b>
              <span>{CAT_META[f.id].blurb}</span>
            </button>
          </Reveal>
        ))}
      </div>
    </div>
  );
}

/* ───────── spotlight ───────── */
function Spotlight({ product: p }: { product: Product }) {
  return (
    <Reveal className="wrap section" >
      <div className="sec-head"><div><span className="kicker">Editor’s choice</span><h2 className="h2">Our number one right now</h2></div></div>
      <article className="spot">
        <div className="spot-visual"><SafeImage src={p.image} alt={p.title} emoji={p.emoji} className="tile" /></div>
        <div className="spot-body">
          <span className="tag">★ Top pick</span>
          <h3>{p.title}</h3>
          <p>{p.why}</p>
          <div className="meta"><span>{p.category}</span><span>Best for: {p.bestFor}</span></div>
          <div className="buy">
            <span className="price">{formatPrice(p)}</span>
            <a href={p.url} target="_blank" rel="nofollow sponsored noopener" className="pz-btn pz-btn-accent">View deal <Arrow /></a>
          </div>
        </div>
      </article>
    </Reveal>
  );
}

/* ───────── gift finder ───────── */
const BUDGETS = [{ max: 25, label: 'Under $25' }, { max: 50, label: 'Under $50' }, { max: Infinity, label: 'Any budget' }];
const WHO_ICON: Record<string, string> = { 'For Her': '👩', 'For Him': '👨', Friends: '🧑‍🤝‍🧑', Home: '🏡' };
function GiftFinder({ products }: { products: Product[] }) {
  const [who, setWho] = useState<string | null>(null);
  const [max, setMax] = useState<number>(Infinity);
  const matches = useMemo(() => !who ? [] : products
    .filter((p) => p.recipients.includes(who) && p.price <= max)
    .sort((a, b) => Number(b.badge === 'Top Pick') - Number(a.badge === 'Top Pick') || a.price - b.price).slice(0, 3), [products, who, max]);
  return (
    <Reveal as="section" className="wrap section">
      <div id="finder" className="finder" aria-labelledby="finder-h" style={{ scrollMarginTop: 90 }}>
        <div className="finder-ctl">
          <span className="kicker">Gift finder</span>
          <h3 id="finder-h">Two taps to the perfect gift.</h3>
          <p>Tell us who it’s for and what you want to spend. We’ll do the rest.</p>
          <div className="step" role="group" aria-label="Who is it for?">
            <div className="lbl"><span className="num">1</span>Who’s it for?</div>
            <div className="chips">{RECIPIENTS.map((w) => <button key={w} className="pz-chip" aria-pressed={who === w} onClick={() => setWho(w)}><span aria-hidden="true">{WHO_ICON[w] ?? '🎁'}</span>{w}</button>)}</div>
          </div>
          <div className="step" role="group" aria-label="Budget">
            <div className="lbl"><span className="num">2</span>Your budget</div>
            <div className="chips">{BUDGETS.map((b) => <button key={b.label} className="pz-chip" aria-pressed={max === b.max} onClick={() => setMax(b.max)}>{b.label}</button>)}</div>
          </div>
        </div>
        <div className="finder-out" aria-live="polite">
          {!who && <p className="empty-hint"><span className="big" aria-hidden="true">🎯</span>Pick who the gift is for and your best matches show up here.</p>}
          {who && matches.length === 0 && <p className="empty-hint"><span className="big" aria-hidden="true">🤔</span>Nothing at that budget yet. Try a higher one.</p>}
          {matches.map((p) => (
            <a key={p.id} className="match" href={p.url} target="_blank" rel="nofollow sponsored noopener">
              <span className="t" style={{ background: tileBg(p.title) }} aria-hidden="true">{p.emoji}</span>
              <span style={{ minWidth: 0 }}><span className="n" style={{ display: 'block' }}>{p.title}</span><span className="s" style={{ display: 'block' }}>{formatPrice(p)} · {p.bestFor}</span></span>
              <span className="go">Shop →</span>
            </a>
          ))}
        </div>
      </div>
    </Reveal>
  );
}

/* ───────── product card ───────── */
function ProductCard({ product: p, index, saved, comparing, highlighted, onSave, onCompare, onShare }: { product: Product; index: number; saved: boolean; comparing: boolean; highlighted: boolean; onSave: () => void; onCompare: () => void; onShare: () => void }) {
  const [ref, shown] = useReveal<HTMLElement>();
  return (
    <article ref={ref} id={`p-${p.id}`} style={{ ['--i' as string]: index % 3 }} className={`card reveal ${shown ? 'in' : ''} ${highlighted ? 'hl' : ''} ${comparing ? 'cmp' : ''}`}>
      <div className="card-media">
        <SafeImage src={p.image} alt={p.title} emoji={p.emoji} className="tile" />
        {p.badge && <span className={`badge ${p.badge === 'Top Pick' ? 'top' : 'trend'}`}>{p.badge === 'Top Pick' ? '★ Top Pick' : '🔥 Trending'}</span>}
        <button onClick={onSave} aria-pressed={saved} aria-label={saved ? `Remove ${p.title} from My Picks` : `Save ${p.title} to My Picks`} className="heart"><IconHeart /></button>
      </div>
      <div className="card-body">
        <span className="cat-line">{p.category}</span>
        <div className="title-row"><h3>{p.title}</h3><span className="price">{formatPrice(p)}</span></div>
        {p.bestFor && <span className="best"><IconCheck size={14} />Best for: {p.bestFor}</span>}
        <p className="why">{p.why}</p>
        <div className="actions">
          <a href={p.url} target="_blank" rel="nofollow sponsored noopener" className="pz-btn pz-btn-accent">View deal <Arrow /></a>
          <button onClick={onCompare} aria-pressed={comparing} aria-label={comparing ? `Remove ${p.title} from comparison` : `Compare ${p.title}`} title="Compare" className="sq"><IconCompare /></button>
          <button onClick={onShare} aria-label={`Share ${p.title}`} title="Share" className="sq"><IconShare /></button>
        </div>
      </div>
    </article>
  );
}

function ProductSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="pgrid" aria-busy="true" aria-label="Loading picks">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skel">
          <div className="b" style={{ aspectRatio: '5/4', borderRadius: 0 }} />
          <div style={{ padding: 20, display: 'grid', gap: 12 }}><div className="b" style={{ height: 14, width: '40%' }} /><div className="b" style={{ height: 22, width: '80%' }} /><div className="b" style={{ height: 14 }} /><div className="b" style={{ height: 48, marginTop: 8 }} /></div>
        </div>
      ))}
    </div>
  );
}

/* ───────── compare + saved ───────── */
function CompareModal({ items, onClose, onRemove }: { items: Product[]; onClose: () => void; onRemove: (id: string) => void }) {
  useEscape(onClose);
  const lowest = Math.min(...items.map((p) => p.price));
  return (
    <div className="overlay center" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Compare products" onClick={(e) => e.stopPropagation()} className="modal">
        <div className="modal-h"><h2>Side by side</h2><button onClick={onClose} className="close" aria-label="Close comparison">✕</button></div>
        <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
          <div className="cmp-grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(230px, 1fr))` }}>
            {items.map((p) => {
              const win = p.price === lowest;
              return (
                <div key={p.id} className={`cmp-col ${win ? 'win' : ''}`}>
                  {win && <span className="lowest">Lowest price</span>}
                  <SafeImage src={p.image} alt={p.title} emoji={p.emoji} className="tile" />
                  <h3>{p.title}</h3>
                  <span className="price">{formatPrice(p)}</span>
                  <dl>
                    <div><dt>Best for</dt><dd>{p.bestFor || '—'}</dd></div>
                    <div><dt>Why we picked it</dt><dd>{p.why || '—'}</dd></div>
                    <div><dt>Our rating</dt><dd>{p.badge ?? 'Curated pick'}</dd></div>
                  </dl>
                  <a href={p.url} target="_blank" rel="nofollow sponsored noopener" className="pz-btn pz-btn-accent" style={{ marginTop: 'auto' }}>View deal <Arrow /></a>
                  <button onClick={() => onRemove(p.id)} className="linkbtn">Remove</button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function SavedDrawer({ items, onClose, onRemove }: { items: Product[]; onClose: () => void; onRemove: (id: string) => void }) {
  useEscape(onClose);
  return (
    <div className="overlay" onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-label="My Picks" onClick={(e) => e.stopPropagation()} className="drawer">
        <div className="drawer-h"><h2>My Picks</h2><button onClick={onClose} className="close" aria-label="Close My Picks">✕</button></div>
        {items.length === 0 ? <p className="empty"><span className="big" aria-hidden="true">💝</span>Nothing saved yet. Tap the heart on any pick and it will wait for you here.</p> : (
          <ul>
            {items.map((p) => (
              <li key={p.id}>
                <span className="t" style={{ background: tileBg(p.title) }} aria-hidden="true">{p.emoji}</span>
                <span style={{ minWidth: 0, flex: 1 }}><span className="n" style={{ display: 'block' }}>{p.title}</span><span className="s" style={{ display: 'block' }}>{formatPrice(p)}</span></span>
                <a href={p.url} target="_blank" rel="nofollow sponsored noopener" className="pz-btn pz-btn-accent pz-btn-sm">Shop</a>
                <button className="rm" onClick={() => onRemove(p.id)} aria-label={`Remove ${p.title}`}>✕</button>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}

/* ───────── static sections ───────── */
function HowItWorks() {
  const steps = [
    { icon: '🔎', title: 'We search', text: 'We scan what people actually buy, save and rave about, then cut it down to the few worth your time.' },
    { icon: '⚖️', title: 'We compare', text: 'Price, quality and who it suits best, lined up side by side so you can decide in seconds, not tabs.' },
    { icon: '🛒', title: 'You shop smarter', text: 'Tap through to the retailer. You pay the same price; we may earn a small thank-you that keeps this free.' },
  ];
  return (
    <section id="how" className="wrap section" style={{ scrollMarginTop: 80 }}>
      <Reveal><div className="sec-head"><div><span className="kicker">How we pick</span><h2 className="h2">Less scrolling. Better gifts.</h2><p className="lead">Every pick earns its spot. No filler, no paid placements.</p></div></div></Reveal>
      <div className="how">
        {steps.map((s, i) => (
          <Reveal key={s.title} delay={i}><div className="how-i"><span className="no" aria-hidden="true">{i + 1}</span><div className="ic" aria-hidden="true">{s.icon}</div><h3>{s.title}</h3><p>{s.text}</p></div></Reveal>
        ))}
      </div>
    </section>
  );
}

function Faq() {
  const items = [
    ['How does PickerZone make money?', 'When you buy through a link on this site, the retailer may pay us a small commission. It never changes the price you pay.'],
    ['Do affiliate links affect which products you recommend?', 'No. Picks are chosen on value, quality and fit first. If we would not gift it to a friend, it does not make the list.'],
    ['Are the prices always current?', 'Prices and availability can change at any time, so always confirm on the retailer’s page before you buy.'],
    ['Can I save things for later?', 'Yes. Tap the heart on any pick and it is kept in My Picks on this device, no account needed.'],
  ];
  return (
    <section id="faq" className="wrap section" style={{ scrollMarginTop: 80 }}>
      <Reveal><div className="sec-head"><div><span className="kicker">Good to know</span><h2 className="h2">Questions, answered.</h2></div></div></Reveal>
      <Reveal className="faq">{items.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</Reveal>
    </section>
  );
}

function Footer({ onJump }: { onJump: (filterId: string) => void }) {
  return (
    <footer className="foot">
      <div className="wrap">
        <div className="foot-cta">
          <h2>Find your next favourite thing, before everyone else does.</h2>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {BRAND.socials.map((s) => <a key={s.label} href={s.href} target="_blank" rel="noopener" className="pz-btn pz-btn-accent">Follow on {s.label}</a>)}
          </div>
        </div>
        <div className="foot-grid">
          <div>
            <Logo light />
            <p id="disclosure" className="disclosure" style={{ scrollMarginTop: 120 }}><b>Affiliate disclosure.</b> {BRAND.disclosure}</p>
          </div>
          <nav aria-label="Jump to a category"><h4>Shop by</h4>
            <ul>{FILTERS.filter((f) => f.id !== 'all').map((f) => <li key={f.id}><button onClick={() => onJump(f.id)}>{f.label}</button></li>)}</ul>
          </nav>
          <div><h4>Follow</h4>
            <ul>{BRAND.socials.map((s) => <li key={s.label}><a href={s.href} target="_blank" rel="noopener">{s.label}</a></li>)}</ul>
          </div>
        </div>
        <div className="foot-bar"><span>© {new Date().getFullYear()} {BRAND.name}. {BRAND.tagline}</span><span>Prices and availability can change.</span></div>
      </div>
    </footer>
  );
}

/* ───────── home page ───────── */
const MAX_COMPARE = 3;
type Sort = 'featured' | 'low' | 'high';
const rank = (p: Product) => (p.badge === 'Top Pick' ? 0 : p.badge === 'Trending' ? 1 : 2);

function Home() {
  const { loading, season, products } = useCatalog();
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const reducedMotion = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState<Sort>('featured');
  const [saved, setSaved] = useLocalStorage<string[]>('pz:saved', []);
  const [snowOn, setSnowOn] = useLocalStorage<boolean>('pz:snow', true);
  const [compare, setCompare] = useState<string[]>([]);
  const [showSaved, setShowSaved] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(params.get('pick'));
  const [toast, setToast] = useState('');
  const scrolled = useScrolled(700);

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
    const out = products.filter((p) => f.test(p) && (!q || `${p.title} ${p.category} ${p.bestFor} ${p.why}`.toLowerCase().includes(q)));
    if (sort === 'low') out.sort((a, b) => a.price - b.price);
    else if (sort === 'high') out.sort((a, b) => b.price - a.price);
    else out.sort((a, b) => rank(a) - rank(b));
    return out;
  }, [products, filter, query, sort]);

  const spotlight = useMemo(() => products.find((p) => p.badge === 'Top Pick') ?? products[0], [products]);
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
  const toPicks = () => document.getElementById('picks')?.scrollIntoView();
  const jump = (id: string) => { setFilter(id); setQuery(''); window.setTimeout(toPicks, 30); };
  const snowVisible = season.snow && snowOn && !reducedMotion;
  const filtered = filter !== 'all' || query.trim() !== '';

  return (
    <>
      {snowVisible && <Snow />}
      <Announce season={season} />
      <Header savedCount={savedProducts.length} onOpenSaved={() => setShowSaved(true)} snowAvailable={season.snow && !reducedMotion} snowOn={snowOn} onToggleSnow={() => setSnowOn(!snowOn)} />
      <main id="top">
        <Hero season={season} products={products} query={query} onQuery={setQuery} onSearch={() => { setFilter('all'); toPicks(); }} onFilter={jump} />
        {!loading && <Categories products={products} onPick={jump} />}
        {!loading && spotlight && !filtered && <Spotlight product={spotlight} />}
        {!loading && <GiftFinder products={products} />}

        <section id="picks" aria-label="All picks" className="wrap section" style={{ scrollMarginTop: 80 }}>
          <div className="sec-head">
            <div><span className="kicker">The full list</span><h2 className="h2">All picks, compared.</h2></div>
            <p className="result-count" aria-live="polite"><b>{list.length}</b> {list.length === 1 ? 'pick' : 'picks'}{filtered && ' match'}</p>
          </div>
          <div className="toolbar">
            <div className="toolbar-top">
              <label className="field"><IconSearch /><input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search lights, mugs, gifts…" aria-label="Search picks" />{query && <button type="button" className="x" onClick={() => setQuery('')} aria-label="Clear search">✕</button>}</label>
              <div className="select"><select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort picks"><option value="featured">Featured first</option><option value="low">Price: low to high</option><option value="high">Price: high to low</option></select></div>
            </div>
            <div className="chip-row no-scrollbar" role="group" aria-label="Filters">
              {FILTERS.map((f) => <button key={f.id} className="pz-chip" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</button>)}
            </div>
          </div>
          {loading ? <ProductSkeleton /> : list.length === 0 ? (
            <div className="none"><span className="big" aria-hidden="true">🔍</span>No picks match that.<br /><button className="pz-btn pz-btn-ink pz-btn-sm" onClick={() => { setQuery(''); setFilter('all'); }}>Clear search and filters</button></div>
          ) : (
            <div className="pgrid">
              {list.map((p, i) => <ProductCard key={p.id} product={p} index={i} saved={saved.includes(p.id)} comparing={compare.includes(p.id)} highlighted={focusId === p.id} onSave={() => toggleSave(p.id)} onCompare={() => toggleCompare(p.id)} onShare={() => share(p)} />)}
            </div>
          )}
        </section>

        <HowItWorks />
        <Faq />
      </main>
      <Footer onJump={jump} />

      {compareProducts.length > 0 && (
        <div className="cmpbar" role="region" aria-label="Comparison">
          <div className="em" aria-hidden="true">{compareProducts.map((p) => <span key={p.id}>{p.emoji}</span>)}</div>
          <p><b>{compareProducts.length}/{MAX_COMPARE} selected</b>{compareProducts.length < 2 ? 'Pick one more to compare' : 'Ready to compare'}</p>
          <button className="clear" onClick={() => setCompare([])}>Clear</button>
          <button className="pz-btn pz-btn-accent pz-btn-sm" disabled={compareProducts.length < 2} onClick={() => setShowCompare(true)}>Compare <Arrow /></button>
        </div>
      )}
      {showCompare && compareProducts.length >= 2 && <CompareModal items={compareProducts} onClose={() => setShowCompare(false)} onRemove={(id) => { const next = compare.filter((x) => x !== id); setCompare(next); if (next.length < 2) setShowCompare(false); }} />}
      {showSaved && <SavedDrawer items={savedProducts} onClose={() => setShowSaved(false)} onRemove={toggleSave} />}
      {toast && <div className="toast" role="status">{toast}</div>}
      <button className={`totop ${scrolled && compareProducts.length === 0 ? '' : 'hide'}`} aria-label="Back to top" onClick={() => window.scrollTo({ top: 0 })}><IconUp /></button>
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
