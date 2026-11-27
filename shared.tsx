// Shared by the public site (main.tsx) and the admin panel (admin.tsx):
// config, types, seasons, seed products, Firebase init, small UI pieces.
import { useEffect, useState } from 'react';
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';

/* ───────── Brand ───────── */
export const BRAND = {
  name: 'PickerZone',
  tagline: 'Search • Compare • Shop Smarter',
  // Logo: upload public/logo.png to GitHub, or put any image URL here. Falls back to the built-in mark.
  logoSrc: '/logo.png',
  disclosure: 'As an Amazon Associate and eBay Partner, I earn from qualifying purchases.',
  socials: [
    { label: 'TikTok', href: 'https://tiktok.com/@pickerzone' },
    { label: 'Instagram', href: 'https://instagram.com/pickerzone' },
  ],
};

/* ───────── Types ───────── */
export const TAGS = ['Gift Ideas', 'Room & Decor', 'Trending'] as const;
export const RECIPIENTS = ['For Her', 'For Him', 'Friends', 'Home'] as const;
export type Badge = 'Top Pick' | 'Trending';

export interface Product {
  id: string;
  title: string;
  season: string;
  category: string;
  tags: string[];
  recipients: string[];
  badge?: Badge;
  bestFor: string;
  why: string;
  url: string;
  image?: string;
  emoji: string;
  isActive: boolean;
}

export interface Season {
  id: string; name: string; badge: string; headline: string; subline: string;
  heroClass: string; countdown?: { label: string; date: string }; snow: boolean;
}

/* ───────── Seasons (look & copy). The LIVE season is chosen in /admin. ───────── */
export const SEASONS: Record<string, Season> = {
  'new-year': {
    id: 'new-year', name: 'New Year Edition', badge: 'New Year Edition',
    headline: 'Start the year with *picks worth keeping.*',
    subline: 'Cozy lights, gift-ready mugs, and desk decor, compared so you do not have to.',
    heroClass: 'theme-new-year',
    countdown: { label: 'until the New Year', date: '2027-01-01T00:00:00' },
    snow: true,
  },
  valentines: {
    id: 'valentines', name: "Valentine's Day Edition", badge: "Valentine's Day Edition",
    headline: 'Gifts that say it *better than a card.*',
    subline: 'Thoughtful finds for every taste, side by side.',
    heroClass: 'theme-valentines',
    countdown: { label: 'until Valentine’s Day', date: '2027-02-14T00:00:00' },
    snow: false,
  },
  // Add more seasons here, e.g. 'spring-tech': { ... }
};
export const ACTIVE_SEASON = 'new-year'; // fallback only; the live value lives in Firestore
export const getSeason = (id?: string): Season => SEASONS[id ?? ''] ?? SEASONS[ACTIVE_SEASON];

/* ───────── Filters & helpers ───────── */
export const FILTERS: { id: string; label: string; test: (p: Product) => boolean }[] = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'gift', label: 'Gift Ideas', test: (p) => p.tags.includes('Gift Ideas') },
  { id: 'decor', label: 'Room & Decor', test: (p) => p.tags.includes('Room & Decor') },
  { id: 'trending', label: 'Trending', test: (p) => p.badge === 'Trending' || p.tags.includes('Trending') },
];

const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);
const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
export function normalizeProduct(id: string, d: Record<string, unknown>): Product {
  const badge = str(d.badge);
  return {
    id, title: str(d.title, 'Untitled'),
    season: str(d.season), category: str(d.category),
    tags: arr(d.tags), recipients: arr(d.recipients),
    badge: badge === 'Top Pick' || badge === 'Trending' ? (badge as Badge) : undefined,
    bestFor: str(d.bestFor), why: str(d.why), url: str(d.url, '#'), image: str(d.image) || undefined,
    emoji: str(d.emoji, '🛍️'), isActive: d.isActive !== false,
  };
}

/* ───────── Seed products (fallback + "Import Initial Demo Products") ───────── */
const G = 'Gift Ideas', D = 'Room & Decor';
const HER = 'For Her', HIM = 'For Him', FR = 'Friends', HOME = 'Home';
const P = (season: string, id: string, title: string, category: string, tags: string[],
  recipients: string[], badge: Badge | undefined, bestFor: string, why: string, emoji: string): Product =>
  ({ id, title, season, category, tags, recipients, badge, bestFor, why, url: `https://example.com/aff/${id}`, emoji, isActive: true });

export const SEED_PRODUCTS: Product[] = [
  P('new-year', 'warm-fairy-lights', 'Warm LED Fairy Lights (33 ft)', 'Lights', [D, G], [HER, HIM, FR, HOME], 'Top Pick', 'Instant cozy corners', 'Soft warm glow, USB powered, and the easiest room upgrade there is.', '✨'),
  P('new-year', 'holiday-mug-set', 'Aesthetic Holiday Mug Set (2)', 'Mugs', [G], [HER, HIM, FR, HOME], undefined, 'Couples & coworkers', 'Dishwasher safe, matte finish, ships gift-ready.', '☕'),
  P('new-year', 'desk-snow-globe', 'Desk Snow Globe', 'Decor', [D, G], [FR, HOME], 'Trending', 'Desk & shelf styling', 'Swirling snow and a warm LED base; the one everyone asks about on video.', '🔮'),
  P('new-year', 'smart-ambient-lamp', 'Smart Ambient Lamp', 'Lights', [D], [HOME, HER, HIM], 'Top Pick', 'Mood lighting from your phone', 'Millions of colors, app and voice control, and a clean modern shape.', '💡'),
  P('new-year', 'new-year-gift-bundle', 'New Year Gift Bundle Box', 'Gift Bundles', [G], [HOME, HER, HIM, FR], undefined, 'One-click, no-stress gifting', 'Candle, tea, and notebook in a ready-to-give box.', '🎁'),
  P('new-year', 'sherpa-throw', 'Cozy Sherpa Throw Blanket', 'Cozy', [D, G], [HOME, HER, HIM], 'Trending', 'Cold-night movie marathons', 'Double-sided fleece that stays soft after repeated washes.', '🧣'),
  P('new-year', 'countdown-party-kit', 'Midnight Countdown Party Kit', 'Party', [G], [FR], undefined, 'Hosting a great party', 'Everything for the toast: crowns, poppers, and a countdown banner.', '🎉'),
  P('new-year', 'scented-candle-trio', 'Scented Candle Trio', 'Candles', [G, D], [HER, HIM, HOME, FR], undefined, 'Easy thank-you gifts', 'Three winter scents with a clean burn and a long life.', '🕯️'),
  P('new-year', 'star-projector', 'Mini Star Projector Light', 'Lights', [D], [HOME, FR, HER, HIM], 'Trending', 'Bedroom & stream backdrops', 'Turns any wall into a night sky, with a timer and remote.', '🌌'),
  P('new-year', 'goal-planner-2027', '2027 Goal Planner', 'Stationery', [G], [HOME, FR], undefined, 'Fresh-start resolutions', 'Quarterly goal pages plus weekly layouts, in a lay-flat binding.', '📓'),
  P('valentines', 'rose-gold-heart-necklace', 'Rose Gold Heart Necklace', 'Jewelry', [G], [HER, HIM], 'Top Pick', 'A classic, wearable keepsake', 'Hypoallergenic finish and a gift box included.', '💝'),
  P('valentines', 'preserved-rose-dome', 'Preserved Rose Glass Dome', 'Decor', [G, D], [HER, HIM, HOME], 'Trending', 'Flowers that last a year', 'Real preserved rose under glass with a soft LED base.', '🌹'),
  P('valentines', 'couples-mug-pair', 'Couples Mug Pair', 'Mugs', [G], [HER, HIM, FR], undefined, 'Sweet and simple', 'Matching set with a clean modern print.', '☕'),
  P('valentines', 'heart-neon-light', 'Heart LED Neon Light', 'Lights', [D], [HOME, FR, HER, HIM], 'Trending', 'Room glow-ups', 'Low-heat LED neon that mounts or stands.', '❤️'),
];

/* ───────── Firebase (keys come from Vercel / .env) ───────── */
const cfg = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
export const isFirebaseConfigured = Boolean(cfg.apiKey && cfg.projectId && cfg.appId);
export const app: FirebaseApp | null = isFirebaseConfigured ? (getApps().length ? getApp() : initializeApp(cfg)) : null;

/* ───────── Small shared UI ───────── */
export function useEscape(handler: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handler(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handler]);
}

export function LogoMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden="true">
      <ellipse cx="24" cy="26" rx="21" ry="9" transform="rotate(-22 24 26)" stroke="#FF6B00" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="46 8" />
      <path d="M10 14h5l4 15h14l4-11H17" stroke="#0B1E4A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="21" cy="35" r="2.4" fill="#0B1E4A" /><circle cx="32" cy="35" r="2.4" fill="#0B1E4A" />
      <path d="M36 5l1.8 4.6L42 11l-4.2 1.4L36 17l-1.8-4.6L30 11l4.2-1.4z" fill="#FF6B00" />
    </svg>
  );
}

export function Logo({ light = false }: { light?: boolean }) {
  const [failed, setFailed] = useState(false);
  return (
    <a href="/" className={`logo ${light ? 'light' : ''}`} aria-label={BRAND.name}>
      <span className="logo-badge">
        {failed ? <LogoMark /> : <img src={BRAND.logoSrc} alt="" onError={() => setFailed(true)} />}
      </span>
      <span className="logo-text">
        <span className="logo-name">Picker<span>Zone</span></span>
        <span className="logo-tag">{BRAND.tagline}</span>
      </span>
    </a>
  );
}

/* Soft pastel palettes for products without a photo; picked deterministically from the title. */
const TILES: [string, string][] = [
  ['#FFE3C7', '#FFB36B'], ['#D9E6FF', '#8FB4FF'], ['#FFD9E4', '#FF9DBA'],
  ['#D8F5E6', '#7ED9A8'], ['#EADCFF', '#B995FF'], ['#FFF0B8', '#FFD14D'],
];
export const tileBg = (seed: string) => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const [a, b] = TILES[h % TILES.length];
  return `linear-gradient(145deg, ${a}, ${b})`;
};

// Shows the image, or a colourful emoji tile if the URL is missing or fails.
export function SafeImage({ src, alt, emoji, className = '' }: { src?: string; alt: string; emoji: string; className?: string }) {
  const [bad, setBad] = useState(!src);
  if (bad) {
    return (
      <div role="img" aria-label={alt} className={`tile ${className}`} style={{ background: tileBg(alt) }}>
        <span aria-hidden="true">{emoji}</span>
      </div>
    );
  }
  return <img src={src} alt={alt} loading="lazy" decoding="async" onError={() => setBad(true)} className={`object-cover ${className}`} />;
}
