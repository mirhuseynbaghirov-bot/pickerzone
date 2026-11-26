// Admin panel (/admin): Firebase email/password login, live season switcher, product CRUD, demo import.
// Loaded lazily, so normal visitors never download this file.
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { collection, deleteDoc, doc, getDoc, getDocs, getFirestore, onSnapshot, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import {
  ACTIVE_SEASON, app, formatPrice, isFirebaseConfigured, Logo, normalizeProduct, RECIPIENTS, SafeImage, SEASONS,
  SEED_PRODUCTS, TAGS, useEscape, type Product,
} from './shared';

/* ───────── Firestore helpers ───────── */
const db = () => getFirestore(app!);
const clean = <T extends object>(o: T) => JSON.parse(JSON.stringify(o)) as T; // Firestore rejects undefined

const subscribeProducts = (cb: (p: Product[]) => void, onError: (e: Error) => void) =>
  onSnapshot(collection(db(), 'products'), (s) => cb(s.docs.map((d) => normalizeProduct(d.id, d.data()))), onError);
const subscribeActiveSeason = (cb: (id: string | undefined) => void) =>
  onSnapshot(doc(db(), 'settings', 'general'), (s) => cb(s.data()?.activeSeason as string | undefined), () => cb(undefined));
const setActiveSeason = (id: string) => setDoc(doc(db(), 'settings', 'general'), { activeSeason: id, updatedAt: serverTimestamp() }, { merge: true });
const saveProduct = (p: Product) => { const { id, ...data } = p; return setDoc(doc(db(), 'products', id), { ...clean(data), updatedAt: serverTimestamp() }, { merge: true }); };
const setProductActive = (id: string, isActive: boolean) => setDoc(doc(db(), 'products', id), { isActive, updatedAt: serverTimestamp() }, { merge: true });
const deleteProduct = (id: string) => deleteDoc(doc(db(), 'products', id));

// Adds only the demo products that are missing; never overwrites your edits.
async function importSeed(): Promise<number> {
  const existing = new Set((await getDocs(collection(db(), 'products'))).docs.map((d) => d.id));
  const settingsRef = doc(db(), 'settings', 'general');
  const hasSettings = (await getDoc(settingsRef)).exists();
  const batch = writeBatch(db());
  let added = 0;
  for (const p of SEED_PRODUCTS) {
    if (existing.has(p.id)) continue;
    const { id, ...data } = p;
    batch.set(doc(db(), 'products', id), { ...clean(data), createdAt: serverTimestamp() });
    added++;
  }
  if (!hasSettings) batch.set(settingsRef, { activeSeason: ACTIVE_SEASON, updatedAt: serverTimestamp() });
  if (added > 0 || !hasSettings) await batch.commit();
  return added;
}

/* ───────── Login ───────── */
function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><Logo />{children}</div>
    </div>
  );
}

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await signInWithEmailAndPassword(getAuth(app!), email.trim(), password); }
    catch (err) {
      const code = (err as { code?: string }).code ?? '';
      setError(code === 'auth/too-many-requests' ? 'Too many attempts. Wait a few minutes and try again.' : code === 'auth/network-request-failed' ? 'Network error. Check your connection.' : 'Wrong email or password.');
    } finally { setBusy(false); }
  };
  return (
    <Shell>
      <h1 className="mt-5 font-display text-xl font-extrabold text-navy">Admin sign in</h1>
      <p className="mt-1 text-sm text-slate-500">Accounts are created by the site owners in Firebase.</p>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <label className="block text-sm font-medium text-navy">Email<input className="input mt-1" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="block text-sm font-medium text-navy">Password<input className="input mt-1" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </Shell>
  );
}

/* ───────── Product form ───────── */
const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'product';
const blank = (season: string): Product => ({ id: '', title: '', price: 0, priceLabel: '', season, category: '', tags: [], recipients: [], badge: undefined, bestFor: '', why: '', url: '', image: '', emoji: '🛍️', isActive: true });

function ProductForm({ initial, defaultSeason, onCancel, onSave }: { initial: Product | null; defaultSeason: string; onCancel: () => void; onSave: (p: Product) => Promise<void> }) {
  const [d, setD] = useState<Product>(initial ?? blank(defaultSeason));
  const [priceText, setPriceText] = useState(initial ? String(initial.price) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEscape(onCancel);
  const set = <K extends keyof Product>(k: K, v: Product[K]) => setD((p) => ({ ...p, [k]: v }));
  const toggle = (k: 'tags' | 'recipients', v: string) => set(k, d[k].includes(v) ? d[k].filter((x) => x !== v) : [...d[k], v]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const price = Number(priceText);
    if (!d.title.trim()) return setError('Title is required.');
    if (!priceText || Number.isNaN(price) || price < 0) return setError('Enter a valid price number.');
    if (!/^https?:\/\//i.test(d.url.trim())) return setError('Affiliate URL must start with http:// or https://');
    setBusy(true); setError('');
    try {
      await onSave({ ...d, title: d.title.trim(), price, priceLabel: d.priceLabel?.trim() || undefined, url: d.url.trim(), image: d.image?.trim() || undefined, emoji: d.emoji.trim() || '🛍️', id: d.id || `${slug(d.title)}-${Math.random().toString(36).slice(2, 6)}` });
    } catch (err) { setError((err as Error).message || 'Could not save.'); setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/60 sm:items-center" onClick={onCancel}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={initial ? 'Edit product' : 'Add product'} className="max-h-[92vh] w-full max-w-2xl space-y-4 overflow-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl">
        <div className="flex items-center justify-between"><h2 className="font-display text-xl font-extrabold text-navy">{initial ? 'Edit product' : 'Add product'}</h2><button type="button" onClick={onCancel} className="btn-ghost" aria-label="Close">✕</button></div>
        <label className="block text-sm font-medium text-navy">Title<input className="input mt-1" value={d.title} onChange={(e) => set('title', e.target.value)} required /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-medium text-navy">Price (number)<input className="input mt-1" inputMode="decimal" value={priceText} onChange={(e) => setPriceText(e.target.value)} placeholder="14.99" required /></label>
          <label className="block text-sm font-medium text-navy">Price text (optional)<input className="input mt-1" value={d.priceLabel ?? ''} onChange={(e) => set('priceLabel', e.target.value)} placeholder="From $14.99" /></label>
          <label className="block text-sm font-medium text-navy">Season<select className="input mt-1" value={d.season} onChange={(e) => set('season', e.target.value)}>{Object.values(SEASONS).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <label className="block text-sm font-medium text-navy">Category<input className="input mt-1" value={d.category} onChange={(e) => set('category', e.target.value)} placeholder="Lights" /></label>
        </div>
        <fieldset><legend className="text-sm font-medium text-navy">Tags (filters)</legend><div className="mt-1 flex flex-wrap gap-2">{TAGS.map((t) => <button type="button" key={t} className="pill" aria-pressed={d.tags.includes(t)} onClick={() => toggle('tags', t)}>{t}</button>)}</div></fieldset>
        <fieldset><legend className="text-sm font-medium text-navy">Who is it for? (Gift Finder)</legend><div className="mt-1 flex flex-wrap gap-2">{RECIPIENTS.map((t) => <button type="button" key={t} className="pill" aria-pressed={d.recipients.includes(t)} onClick={() => toggle('recipients', t)}>{t}</button>)}</div></fieldset>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-medium text-navy">Badge<select className="input mt-1" value={d.badge ?? ''} onChange={(e) => set('badge', (e.target.value || undefined) as Product['badge'])}><option value="">None</option><option>Top Pick</option><option>Trending</option></select></label>
          <label className="block text-sm font-medium text-navy">Best for<input className="input mt-1" value={d.bestFor} onChange={(e) => set('bestFor', e.target.value)} placeholder="Cozy corners" /></label>
        </div>
        <div className="grid grid-cols-[1fr_auto] items-end gap-3">
          <label className="block text-sm font-medium text-navy">Image URL<input className="input mt-1" value={d.image ?? ''} onChange={(e) => set('image', e.target.value)} placeholder="https://…" /></label>
          <label className="block w-20 text-sm font-medium text-navy">Emoji<input className="input mt-1 text-center" value={d.emoji} onChange={(e) => set('emoji', e.target.value)} maxLength={4} /></label>
        </div>
        <SafeImage key={d.image ?? ''} src={d.image || undefined} alt="Preview" emoji={d.emoji || '🛍️'} className="h-28 w-40 rounded-lg" />
        <label className="block text-sm font-medium text-navy">Affiliate URL<input className="input mt-1" type="url" value={d.url} onChange={(e) => set('url', e.target.value)} placeholder="https://…" required /></label>
        <label className="block text-sm font-medium text-navy">Why we picked it<textarea className="input mt-1" rows={3} value={d.why} onChange={(e) => set('why', e.target.value)} /></label>
        <label className="flex items-center gap-2 text-sm font-medium text-navy"><input type="checkbox" checked={d.isActive} onChange={(e) => set('isActive', e.target.checked)} className="h-4 w-4 accent-[#FF6B00]" />Active (visible on the public site)</label>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button><button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save product'}</button></div>
      </form>
    </div>
  );
}

/* ───────── Dashboard ───────── */
function Dashboard({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [live, setLive] = useState<string | undefined>();
  const [q, setQ] = useState('');
  const [seasonFilter, setSeasonFilter] = useState('all');
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);

  const say = (text: string, error = false) => { setMsg({ text, error }); window.setTimeout(() => setMsg(null), 4000); };
  const fail = (e: unknown) => say((e as Error).message?.includes('permission') ? 'Permission denied. Check that the Firestore rules are published and you are signed in.' : (e as Error).message || 'Something went wrong.', true);

  useEffect(() => {
    const u1 = subscribeProducts(setProducts, fail);
    const u2 = subscribeActiveSeason(setLive);
    return () => { u1(); u2(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const liveSeason = live && SEASONS[live] ? live : ACTIVE_SEASON;
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (products ?? []).filter((p) => (seasonFilter === 'all' || p.season === seasonFilter) && (!t || `${p.title} ${p.category}`.toLowerCase().includes(t)))
      .sort((a, b) => a.season.localeCompare(b.season) || a.title.localeCompare(b.title));
  }, [products, q, seasonFilter]);

  const copyLink = async (p: Product) => {
    try { await navigator.clipboard.writeText(`${window.location.origin}/?pick=${p.id}`); say('Share link copied.'); } catch { say('Could not copy the link.', true); }
  };

  return (
    <div className="min-h-screen bg-surface pb-16">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Logo />
          <div className="flex items-center gap-3 text-sm"><span className="hidden text-slate-500 sm:inline">{user.email}</span><button className="btn-ghost" onClick={onSignOut}>Sign out</button></div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl space-y-5 px-4 pt-5">
        <section className="rounded-xl border border-slate-200 bg-white p-4" aria-labelledby="season-h">
          <h2 id="season-h" className="font-display text-lg font-extrabold text-navy">Live season</h2>
          <p className="text-sm text-slate-500">Visitors see this edition, its products and its effects. Changes go live on their next page load.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.values(SEASONS).map((s) => <button key={s.id} className="pill" aria-pressed={liveSeason === s.id} onClick={() => setActiveSeason(s.id).then(() => say(`${s.name} is now live.`)).catch(fail)}>{s.name}</button>)}
          </div>
        </section>

        <section aria-labelledby="prod-h" className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="prod-h" className="mr-auto font-display text-lg font-extrabold text-navy">Products {products && <span className="text-sm font-normal text-slate-500">({products.length})</span>}</h2>
            <button className="btn-ghost" onClick={async () => {
              if (!window.confirm('Add the demo products that are not in Firestore yet? Existing products are not changed.')) return;
              try { const n = await importSeed(); say(n ? `Imported ${n} demo products.` : 'All demo products already exist.'); } catch (e) { fail(e); }
            }}>Import Initial Demo Products</button>
            <button className="btn-primary" onClick={() => setEditing('new')}>+ Add product</button>
          </div>
          <div className="flex flex-wrap gap-2">
            <input className="input max-w-xs" type="search" placeholder="Search products" aria-label="Search products" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="input max-w-[12rem]" aria-label="Filter by season" value={seasonFilter} onChange={(e) => setSeasonFilter(e.target.value)}>
              <option value="all">All seasons</option>{Object.values(SEASONS).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          {products === null ? <p className="text-sm text-slate-500">Loading…</p> : products.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">No products in Firestore yet. Click “Import Initial Demo Products” to start with the sample catalog.</p>
          ) : list.length === 0 ? <p className="text-sm text-slate-500">No products match.</p> : (
            <ul className="space-y-2">
              {list.map((p) => (
                <li key={p.id} className={`flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 ${p.isActive ? '' : 'opacity-60'}`}>
                  <SafeImage src={p.image} alt={p.title} emoji={p.emoji} className="h-14 w-14 shrink-0 rounded-lg text-2xl" />
                  <div className="min-w-0 flex-1 basis-40">
                    <p className="truncate font-bold text-navy">{p.title}</p>
                    <p className="text-xs text-slate-500">{SEASONS[p.season]?.name ?? (p.season || 'No season')} · {formatPrice(p)}{p.category && ` · ${p.category}`}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <button className="pill py-1" aria-pressed={p.isActive} onClick={() => setProductActive(p.id, !p.isActive).catch(fail)}>{p.isActive ? 'Active' : 'Hidden'}</button>
                    <button className="btn-ghost" onClick={() => copyLink(p)}>Copy link</button>
                    <button className="btn-ghost" onClick={() => setEditing(p)}>Edit</button>
                    <button className="btn-ghost text-red-600" onClick={() => { if (window.confirm(`Delete “${p.title}”? This cannot be undone.`)) deleteProduct(p.id).then(() => say('Product deleted.')).catch(fail); }}>Delete</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
      {editing && <ProductForm initial={editing === 'new' ? null : editing} defaultSeason={liveSeason} onCancel={() => setEditing(null)} onSave={async (p) => { await saveProduct(p); setEditing(null); say('Product saved.'); }} />}
      {msg && <div role="status" className="pointer-events-none fixed inset-x-0 bottom-5 z-[60] flex justify-center px-4"><span className={`rounded-full px-4 py-2 text-sm text-white shadow-lg ${msg.error ? 'bg-red-600' : 'bg-navy'}`}>{msg.text}</span></div>}
    </div>
  );
}

/* ───────── Page (auth gate) ───────── */
export default function AdminPage() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    document.title = 'PickerZone Admin';
    const meta = document.createElement('meta');
    meta.name = 'robots'; meta.content = 'noindex,nofollow'; document.head.appendChild(meta);
    return () => { meta.remove(); document.title = 'PickerZone — Search • Compare • Shop Smarter'; };
  }, []);
  useEffect(() => { if (!app) return; return onAuthStateChanged(getAuth(app), (u) => { setUser(u); setReady(true); }); }, []);

  if (!isFirebaseConfigured) {
    return <Shell><h1 className="mt-5 font-display text-xl font-extrabold text-navy">Firebase is not set up</h1><p className="mt-2 text-sm text-slate-600">Add the 6 VITE_FIREBASE_* environment variables in Vercel and redeploy. See QURASDIRMA_TELIMATI.md.</p></Shell>;
  }
  if (!ready) return <Shell><p className="mt-5 text-sm text-slate-500">Checking session…</p></Shell>;
  if (!user) return <Login />;
  return <Dashboard user={user} onSignOut={() => signOut(getAuth(app!))} />;
}
