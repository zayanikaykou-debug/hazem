import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { fetchPublicBootstrap } from './lib/api';
import { resolveImageUrl } from './lib/images';
import type {
  BusinessHour,
  GalleryImage,
  PublicBootstrapData,
  ServiceItem,
  ShopSettings,
} from './types/barbershop';
import { Navbar } from './components/Navbar';
import { HeroSection } from './components/HeroSection';
import { ServicesSection } from './components/ServicesSection';
import { AboutAndPillarsSection } from './components/AboutAndPillarsSection';
import { GalleryAndReviewsSection } from './components/GalleryAndReviewsSection';
import { ContactAndFooter } from './components/ContactAndFooter';

const BookingModal = lazy(() =>
  import('./components/BookingModal').then((m) => ({ default: m.BookingModal }))
);
const AdminDashboard = lazy(() =>
  import('./components/AdminDashboard').then((m) => ({ default: m.AdminDashboard }))
);

const BOOTSTRAP_CACHE_KEY = 'hazem_coiff_bootstrap_v1';

const FALLBACK_HOURS: BusinessHour[] = [
  { day_of_week: 1, day_name: 'Lundi', is_open: 1, open_time: '13:00', close_time: '20:30' },
  { day_of_week: 2, day_name: 'Mardi', is_open: 1, open_time: '10:00', close_time: '20:30' },
  { day_of_week: 3, day_name: 'Mercredi', is_open: 1, open_time: '10:00', close_time: '20:30' },
  { day_of_week: 4, day_name: 'Jeudi', is_open: 1, open_time: '10:00', close_time: '20:30' },
  { day_of_week: 5, day_name: 'Vendredi', is_open: 1, open_time: '10:00', close_time: '20:30' },
  { day_of_week: 6, day_name: 'Samedi', is_open: 1, open_time: '10:00', close_time: '20:30' },
  { day_of_week: 0, day_name: 'Dimanche', is_open: 1, open_time: '10:00', close_time: '20:30' },
];

const FALLBACK_SETTINGS: ShopSettings = {
  shop_name: 'Hazem Coiff',
  tagline: 'Salon de coiffure & Barbier · Boumhel El Bassatine',
  address: '52 Av. de Paris',
  city: 'Boumhel El Bassatine',
  phone: '25 180 013',
  email: 'hazemcoiffmegrine@gmail.com',
  instagram_url: 'https://www.instagram.com/hazemcoiff/',
  facebook_url: 'https://www.facebook.com/profile.php?id=61552967307064',
  slot_interval_minutes: '30',
  barber_name: 'Hazem',
  barber_role: 'Maître Coiffeur & Barbier · Note 5,0 / 5 (15 avis)',
  about_title: 'Le souci du détail, l’accueil et la maîtrise du geste.',
  about_bio:
    'Installé au 52 Avenue de Paris à Boumhel El Bassatine, Hazem Coiff vous accueille 7 jours sur 7 dans une salle propre, moderne et soigneusement équipée. Chaque coupe, coiffure de mariage, brushing ou taille de barbe est réalisé avec écoute, précision et attention aux moindres détails.',
  hero_image: '/assets/optimized/hero.webp',
  about_image: '/assets/optimized/about.webp',
  logo_image: '/assets/optimized/logo.webp',
};

const FALLBACK_SERVICES: ServiceItem[] = [
  {
    id: 1,
    name: 'Coupe classique',
    description:
      'Diagnostic morphologique, coupe sur mesure aux ciseaux et finitions précises au coupe-chou, suivie d’un brushing soigné.',
    price: 20,
    duration_minutes: 30,
    image_url: '/src/assets/images/service_classic_cut_1794507920274.jpg',
    is_active: 1,
    sort_order: 1,
  },
  {
    id: 2,
    name: 'Dégradé (Fade)',
    description:
      'Dégradé à blanc, bas ou progressif d’une netteté chirurgicale, contours sculptés et transition sans aucune démarcation.',
    price: 25,
    duration_minutes: 40,
    image_url: '/src/assets/images/service_skin_fade_1794507920405.jpg',
    is_active: 1,
    sort_order: 2,
  },
  {
    id: 3,
    name: 'Coupe + Barbe',
    description:
      'Notre formule signature : coupe personnalisée, brushing, taille et tracé de barbe au rasoir, serviette chaude et soin hydratant.',
    price: 35,
    duration_minutes: 60,
    image_url: '/src/assets/images/service_cut_beard_1794507920251.jpg',
    is_active: 1,
    sort_order: 3,
  },
  {
    id: 4,
    name: 'Taille de barbe',
    description:
      'Restructuration complète des volumes, tracé des joues et du cou à la lame, application d’huile nourrissante.',
    price: 15,
    duration_minutes: 30,
    image_url: '/src/assets/images/service_beard_trim_1794507921722.jpg',
    is_active: 1,
    sort_order: 4,
  },
  {
    id: 5,
    name: 'Rasage traditionnel',
    description:
      'Rituel authentique : serviettes chaudes, montage au blaireau, double passage au rasoir droit et soin apaisant après-rasage.',
    price: 25,
    duration_minutes: 45,
    image_url: '/src/assets/images/service_hot_shave_1794507921391.jpg',
    is_active: 1,
    sort_order: 5,
  },
  {
    id: 6,
    name: 'Coupe enfant',
    description:
      'Coupe adaptée et patiente pour les jeunes clients, réalisée avec douceur aux ciseaux ou à la tondeuse.',
    price: 15,
    duration_minutes: 30,
    image_url: '/src/assets/images/service_classic_cut_1794507920274.jpg',
    is_active: 1,
    sort_order: 6,
  },
];

const FALLBACK_GALLERY: GalleryImage[] = [
  {
    id: 1,
    title: 'Dégradé propre & finitions',
    category: 'Dégradés',
    image_url: '/assets/optimized/gallery_1.webp',
    sort_order: 1,
  },
  {
    id: 2,
    title: 'Coupe & barbe soignée',
    category: 'Coupes',
    image_url: '/assets/optimized/gallery_2.webp',
    sort_order: 2,
  },
  {
    id: 3,
    title: 'Accueil & satisfaction client',
    category: 'Salon',
    image_url: '/assets/optimized/gallery_3.webp',
    sort_order: 3,
  },
  {
    id: 4,
    title: 'Coiffure mariage & événement',
    category: 'Coupes',
    image_url: '/assets/optimized/gallery_4.webp',
    sort_order: 4,
  },
];

const INITIAL_BOOTSTRAP_DATA: PublicBootstrapData = {
  services: FALLBACK_SERVICES,
  businessHours: FALLBACK_HOURS,
  daysOff: [],
  gallery: FALLBACK_GALLERY,
  settings: FALLBACK_SETTINGS,
};

function normalizeBootstrapData(parsed: Partial<PublicBootstrapData>): PublicBootstrapData {
  const mergedSettings: ShopSettings = { ...FALLBACK_SETTINGS };
  if (parsed.settings && typeof parsed.settings === 'object') {
    for (const [k, v] of Object.entries(parsed.settings)) {
      if (typeof v === 'string' && v.trim().length > 0) {
        (mergedSettings as unknown as Record<string, string>)[k] = v;
      }
    }
  }
  return {
    services:
      Array.isArray(parsed.services) && parsed.services.length > 0
        ? parsed.services
        : FALLBACK_SERVICES,
    businessHours:
      Array.isArray(parsed.businessHours) && parsed.businessHours.length > 0
        ? parsed.businessHours
        : FALLBACK_HOURS,
    daysOff: Array.isArray(parsed.daysOff) ? parsed.daysOff : [],
    gallery:
      Array.isArray(parsed.gallery) && parsed.gallery.length > 0
        ? parsed.gallery
        : FALLBACK_GALLERY,
    settings: mergedSettings,
  };
}

function readCachedBootstrap(): PublicBootstrapData {
  try {
    const raw = window.localStorage.getItem(BOOTSTRAP_CACHE_KEY);
    if (!raw) return INITIAL_BOOTSTRAP_DATA;
    const parsed = JSON.parse(raw) as Partial<PublicBootstrapData>;
    if (
      parsed &&
      Array.isArray(parsed.services) &&
      Array.isArray(parsed.businessHours) &&
      Array.isArray(parsed.gallery) &&
      parsed.settings &&
      typeof parsed.settings.shop_name === 'string'
    ) {
      return normalizeBootstrapData(parsed);
    }
  } catch {
    // ignore storage errors
  }
  return INITIAL_BOOTSTRAP_DATA;
}

function isAdminLocation(): boolean {
  const cleanPath = window.location.pathname.replace(/\/+$/, '');
  const hash = window.location.hash;
  const search = new URLSearchParams(window.location.search);
  return (
    cleanPath === '/admin' ||
    cleanPath.startsWith('/admin/') ||
    hash === '#admin' ||
    hash.startsWith('#/admin') ||
    search.has('admin')
  );
}

export default function App() {
  const [data, setData] = useState<PublicBootstrapData>(() => readCachedBootstrap());
  const [bookingOpen, setBookingOpen] = useState(false);
  const [preselectedService, setPreselectedService] = useState<ServiceItem | null>(null);
  const [viewMode, setViewMode] = useState<'public' | 'admin'>(() =>
    isAdminLocation() ? 'admin' : 'public'
  );

  const lastSyncRef = useRef<number>(0);

  const loadBootstrap = useCallback(async () => {
    try {
      const res = await fetchPublicBootstrap();
      const normalized = normalizeBootstrapData(res);
      lastSyncRef.current = Date.now();
      setData(normalized);
      try {
        window.localStorage.setItem(BOOTSTRAP_CACHE_KEY, JSON.stringify(normalized));
      } catch {
        // ignore storage quota errors
      }
    } catch {
      // Keep rendering cached or instant fallback data so UI stays responsive
    }
  }, []);

  useEffect(() => {
    loadBootstrap();
  }, [loadBootstrap]);

  useEffect(() => {
    let source: EventSource | null = null;
    let pollTimer: number | null = null;
    let errorCount = 0;

    const startPollingFallback = () => {
      if (pollTimer !== null) return;
      pollTimer = window.setInterval(() => {
        if (document.visibilityState === 'visible') {
          loadBootstrap();
          window.dispatchEvent(new CustomEvent('hazem:sync'));
        }
      }, 25000);
    };

    try {
      source = new EventSource('/api/public/events');
      source.onmessage = (event) => {
        errorCount = 0;
        try {
          const parsed = JSON.parse(event.data);
          if (parsed?.serverless) {
            source?.close();
            source = null;
            startPollingFallback();
            return;
          }
          if (parsed?.type === 'refresh') {
            loadBootstrap();
            window.dispatchEvent(new CustomEvent('hazem:sync'));
          }
        } catch {
          // ignore malformed messages
        }
      };
      source.onerror = () => {
        errorCount += 1;
        if (errorCount >= 2) {
          source?.close();
          source = null;
          startPollingFallback();
        }
      };
    } catch {
      startPollingFallback();
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastSyncRef.current > 30000) {
        loadBootstrap();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      source?.close();
      if (pollTimer !== null) {
        window.clearInterval(pollTimer);
      }
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [loadBootstrap]);

  useEffect(() => {
    if (!data?.settings?.logo_image) return;
    const resolvedLogo = resolveImageUrl(data.settings.logo_image);
    const iconLink = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (iconLink) iconLink.href = resolvedLogo;
    const appleLink = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
    if (appleLink) appleLink.href = resolvedLogo;
  }, [data?.settings?.logo_image]);

  useEffect(() => {
    const syncRoute = () => {
      setViewMode(isAdminLocation() ? 'admin' : 'public');
    };
    window.addEventListener('popstate', syncRoute);
    window.addEventListener('hashchange', syncRoute);
    return () => {
      window.removeEventListener('popstate', syncRoute);
      window.removeEventListener('hashchange', syncRoute);
    };
  }, []);

  const openBooking = (service: ServiceItem | null = null) => {
    setPreselectedService(service);
    setBookingOpen(true);
  };

  const enterAdmin = () => {
    window.history.pushState({}, '', '/admin');
    setViewMode('admin');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const exitAdmin = () => {
    window.history.pushState({}, '', '/');
    setViewMode('public');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (viewMode === 'admin') {
    return (
      <Suspense
        fallback={
          <div className="min-h-screen bg-[#000000] flex items-center justify-center p-6 text-xs tracking-[0.2em] uppercase text-[#8C8889]">
            Chargement de l’espace admin...
          </div>
        }
      >
        <AdminDashboard
          initialHours={data.businessHours}
          initialSettings={data.settings}
          onExitAdmin={exitAdmin}
          onDataMutated={loadBootstrap}
        />
      </Suspense>
    );
  }

  return (
    <div className="min-h-screen bg-[#000000] text-[#FFFFFF]">
      <Navbar
        shopName={data.settings.shop_name}
        logoUrl={data.settings.logo_image}
        onOpenBooking={() => openBooking(null)}
      />

      <main>
        <HeroSection
          settings={data.settings}
          onOpenBooking={() => openBooking(null)}
        />

        <ServicesSection
          services={data.services}
          onSelectServiceForBooking={(svc) => openBooking(svc)}
        />

        <AboutAndPillarsSection
          settings={data.settings}
          onOpenBooking={() => openBooking(null)}
        />

        <GalleryAndReviewsSection gallery={data.gallery} />

        <ContactAndFooter
          settings={data.settings}
          businessHours={data.businessHours}
          onOpenBooking={() => openBooking(null)}
          onOpenAdmin={enterAdmin}
        />
      </main>

      {bookingOpen && (
        <Suspense fallback={null}>
          <BookingModal
            isOpen={bookingOpen}
            services={data.services}
            initialService={preselectedService}
            onClose={() => setBookingOpen(false)}
            onBookingCompleted={loadBootstrap}
          />
        </Suspense>
      )}
    </div>
  );
}
