import { ArrowRight } from 'lucide-react';
import { resolveImageUrl } from '../lib/images';
import type { ShopSettings } from '../types/barbershop';

interface HeroSectionProps {
  settings: ShopSettings;
  onOpenBooking: () => void;
}

export function HeroSection({ settings, onOpenBooking }: HeroSectionProps) {
  const heroSrc = resolveImageUrl(settings.hero_image || '/assets/optimized/hero.webp');

  const scrollToServices = () => {
    const el = document.querySelector('#services');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section id="accueil" className="relative bg-[#000000] border-b border-[#8C8889]/20">
      <div className="relative min-h-[80vh] lg:min-h-[86vh] flex items-center overflow-hidden">
        <img
          src={heroSrc}
          alt={`Salon ${settings.shop_name} — ${settings.address}, ${settings.city}`}
          width={1280}
          height={960}
          fetchPriority="high"
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover object-[center_25%]"
        />

        <div
          className="absolute inset-0 bg-gradient-to-r from-[#000000] via-[#000000]/82 to-[#000000]/35"
          aria-hidden="true"
        />
        <div
          className="absolute inset-0 bg-gradient-to-t from-[#000000] via-transparent to-[#000000]/45"
          aria-hidden="true"
        />

        <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-28">
          <div className="max-w-2xl">
            <p className="text-xs sm:text-sm font-medium tracking-[0.2em] uppercase text-[#CFCFD3] mb-5">
              {settings.tagline}
            </p>

            <h1 className="font-[family-name:var(--font-display)] text-4xl sm:text-5xl lg:text-[4.25rem] font-semibold leading-[1.06] tracking-tight text-[#FFFFFF] mb-6">
              Votre style. <span className="italic font-medium text-[#CFCFD3]">Notre passion.</span>
            </h1>

            <p className="text-base sm:text-lg text-[#CFCFD3] leading-relaxed max-w-xl mb-10">
              Situé au {settings.address} à {settings.city}, {settings.shop_name} vous accueille
              7j/7 pour des coupes sur mesure, dégradés de précision, coiffures de mariage,
              brushings et taille de barbe soignée.
            </p>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
              <button
                type="button"
                onClick={onOpenBooking}
                className="group inline-flex items-center justify-center gap-2.5 px-7 py-4 text-sm font-semibold text-[#000000] bg-[#FFFFFF] hover:bg-[#CFCFD3] hover:-translate-y-0.5 active:scale-[0.98] rounded transition-all duration-200 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CFCFD3]"
              >
                <span>Réserver maintenant</span>
                <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
              </button>

              <button
                type="button"
                onClick={scrollToServices}
                className="inline-flex items-center justify-center px-7 py-4 text-sm font-medium text-[#FFFFFF] bg-[#0D0D0F]/85 hover:bg-[#161619] hover:-translate-y-0.5 active:scale-[0.98] border border-[#8C8889]/40 hover:border-[#CFCFD3] rounded transition-all duration-200 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CFCFD3]"
              >
                Découvrir nos services
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Full-width 4-column architectural strip below hero */}
      <div className="bg-[#0A0A0B] border-t border-[#8C8889]/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[#8C8889]/20">
            <div className="py-5 sm:px-6 first:sm:pl-0">
              <p className="text-xs text-[#8C8889] mb-1">Satisfaction clients</p>
              <p className="text-sm font-medium text-[#FFFFFF] tabular-nums">5,0 / 5 · 15 avis vérifiés</p>
            </div>
            <div className="py-5 sm:px-6">
              <p className="text-xs text-[#8C8889] mb-1">Horaires d’ouverture</p>
              <p className="text-sm font-medium text-[#FFFFFF] tabular-nums">Ouvert 7j/7 jusqu’à 20:30</p>
            </div>
            <div className="py-5 sm:px-6">
              <p className="text-xs text-[#8C8889] mb-1">Téléphone direct</p>
              <p className="text-sm font-medium text-[#FFFFFF] font-[family-name:var(--font-mono)] tabular-nums">
                {settings.phone}
              </p>
            </div>
            <div className="py-5 sm:px-6 last:lg:pr-0">
              <p className="text-xs text-[#8C8889] mb-1">Adresse du salon</p>
              <p className="text-sm font-medium text-[#FFFFFF]">
                {settings.address}, {settings.city}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
