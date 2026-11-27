import { resolveImageUrl } from '../lib/images';
import type { ShopSettings } from '../types/barbershop';

interface AboutAndPillarsSectionProps {
  settings: ShopSettings;
  onOpenBooking: () => void;
}

const PILLARS = [
  {
    number: '01.',
    title: 'Professionnalisme',
    description:
      'Maîtrise technique des coupes sur mesure, coiffures de mariage, dégradés nets, brushings et taille de barbe.',
  },
  {
    number: '02.',
    title: 'Hygiène et qualité',
    description:
      'Salle propre, soigneusement équipée, stérilisation systématique de l’outillage et lames neuves à chaque rendez-vous.',
  },
  {
    number: '03.',
    title: 'Produits professionnels',
    description:
      'Utilisation de soins capillaires, huiles et cires de coiffage sélectionnés pour respecter la fibre et le cuir chevelu.',
  },
  {
    number: '04.',
    title: 'Service personnalisé',
    description:
      'Une équipe attentive et à l’écoute pour vous conseiller la coupe la plus adaptée à votre visage et à votre style.',
  },
  {
    number: '05.',
    title: 'Respect des horaires',
    description:
      'Ouvert 7 jours sur 7 avec réservation rapide en ligne pour vous accueillir à l’heure convenue, sans attente inutile.',
  },
];

export function AboutAndPillarsSection({
  settings,
  onOpenBooking,
}: AboutAndPillarsSectionProps) {
  const aboutSrc = resolveImageUrl(settings.about_image || '/assets/optimized/about.webp');

  return (
    <section id="apropos" className="py-20 lg:py-28 bg-[#09090A] border-b border-[#8C8889]/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* À propos split */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-stretch mb-20">
          <div className="lg:col-span-5">
            <div className="h-full min-h-[380px] lg:min-h-[520px] rounded-lg overflow-hidden border border-[#8C8889]/25 bg-[#0D0D0F] group">
              <img
                src={aboutSrc}
                alt={`${settings.barber_name} — ${settings.shop_name}`}
                width={800}
                height={1000}
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover object-center transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.02]"
              />
            </div>
          </div>

          <div className="lg:col-span-7 flex flex-col justify-center">
            <p className="text-xs font-medium tracking-[0.2em] uppercase text-[#8C8889] mb-3">
              À propos du salon
            </p>
            <h2 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl font-semibold text-[#FFFFFF] tracking-tight mb-4">
              {settings.about_title}
            </h2>
            <p className="text-sm font-medium text-[#CFCFD3] mb-6">
              {settings.barber_name} — {settings.barber_role}
            </p>

            <p className="text-base text-[#CFCFD3] leading-relaxed mb-6">
              {settings.about_bio}
            </p>
            <p className="text-base text-[#8C8889] leading-relaxed mb-8">
              Au {settings.address} à {settings.city}, notre équipe privilégie un accueil chaleureux,
              une écoute attentive et un travail soigné jusque dans les moindres finitions — que ce
              soit pour votre coupe quotidienne, un brushing ou la préparation d’un grand événement
              comme votre mariage.
            </p>

            <div className="flex flex-wrap items-center gap-6 pt-6 border-t border-[#8C8889]/20">
              <button
                type="button"
                onClick={onOpenBooking}
                className="px-6 py-3.5 text-sm font-semibold text-[#000000] bg-[#FFFFFF] hover:bg-[#CFCFD3] hover:-translate-y-0.5 active:scale-[0.98] rounded transition-all duration-200 cursor-pointer whitespace-nowrap shrink-0"
              >
                Prendre rendez-vous
              </button>
              <div className="text-sm text-[#8C8889] tabular-nums">
                <span className="text-[#FFFFFF] font-semibold">5,0 / 5</span> sur 15 avis clients Google
              </div>
            </div>
          </div>
        </div>

        {/* Why choose us — 5 architectural pillars */}
        <div className="pt-14 border-t border-[#8C8889]/20">
          <div className="max-w-2xl mb-10">
            <p className="text-xs font-medium tracking-[0.2em] uppercase text-[#8C8889] mb-3">
              Nos Engagements
            </p>
            <h2 className="font-[family-name:var(--font-display)] text-2xl sm:text-3xl font-semibold text-[#FFFFFF] tracking-tight">
              Pourquoi choisir <span className="italic font-medium text-[#CFCFD3]">{settings.shop_name}</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
            {PILLARS.map((pillar) => (
              <div
                key={pillar.number}
                className="p-6 bg-[#0D0D0F] border border-[#8C8889]/25 hover:border-[#CFCFD3]/60 hover:-translate-y-0.5 rounded-lg flex flex-col transition-all duration-200"
              >
                <span className="font-[family-name:var(--font-mono)] text-xs font-semibold text-[#CFCFD3] mb-3">
                  {pillar.number}
                </span>
                <h3 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[#FFFFFF] mb-2.5">
                  {pillar.title}
                </h3>
                <p className="text-sm text-[#8C8889] leading-relaxed">
                  {pillar.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
