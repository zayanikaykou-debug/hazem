import { MapPin, Phone, Mail, Clock, Instagram, Facebook, Lock, Navigation, ExternalLink } from 'lucide-react';
import type { BusinessHour, ShopSettings } from '../types/barbershop';

interface ContactAndFooterProps {
  settings: ShopSettings;
  businessHours: BusinessHour[];
  onOpenBooking: () => void;
  onOpenAdmin: () => void;
}

export function ContactAndFooter({
  settings,
  businessHours,
  onOpenBooking,
  onOpenAdmin,
}: ContactAndFooterProps) {
  const scrollTo = (href: string) => {
    const el = document.querySelector(href);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  const safePhone = String(settings?.phone || '25 180 013');
  const safeShopName = String(settings?.shop_name || 'Hazem Coiff');
  const safeAddress = String(settings?.address || '52 Av. de Paris');
  const safeCity = String(settings?.city || 'Boumhel El Bassatine');
  const safeEmail = String(settings?.email || 'hazemcoiffmegrine@gmail.com');
  const safeHours = Array.isArray(businessHours) ? businessHours : [];

  const mapsSearchQuery = encodeURIComponent(`${safeShopName} ${safeAddress} ${safeCity}`);

  return (
    <>
      <section id="contact" className="py-20 lg:py-28 bg-[#09090A] border-b border-[#8C8889]/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mb-12">
            <p className="text-xs font-medium tracking-[0.2em] uppercase text-[#8C8889] mb-3">
              Rendez-nous visite
            </p>
            <h2 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl font-semibold text-[#FFFFFF] tracking-tight">
              Contact & <span className="italic font-medium text-[#CFCFD3]">Horaires d’ouverture</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
            <div className="lg:col-span-5 bg-[#0D0D0F] border border-[#8C8889]/25 rounded-lg p-6 sm:p-8 flex flex-col justify-between gap-8">
              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <MapPin className="w-5 h-5 text-[#CFCFD3] shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-[#8C8889] mb-1">Adresse</p>
                    <p className="text-base font-medium text-[#FFFFFF]">{safeAddress}</p>
                    <p className="text-sm text-[#8C8889]">{safeCity} · P7JX+RP</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <Phone className="w-5 h-5 text-[#CFCFD3] shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-[#8C8889] mb-1">Téléphone</p>
                    <a
                      href={`tel:${safePhone.replace(/\s+/g, '')}`}
                      className="text-base font-medium text-[#FFFFFF] hover:text-[#CFCFD3] transition-colors font-[family-name:var(--font-mono)] tabular-nums"
                    >
                      {safePhone}
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <Mail className="w-5 h-5 text-[#CFCFD3] shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-[#8C8889] mb-1">E-mail</p>
                    <a
                      href={`mailto:${safeEmail}`}
                      className="text-base font-medium text-[#FFFFFF] hover:text-[#CFCFD3] transition-colors"
                    >
                      {safeEmail}
                    </a>
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-[#8C8889]/20">
                <div className="flex items-center gap-2 mb-4">
                  <Clock className="w-4 h-4 text-[#CFCFD3]" />
                  <h3 className="text-sm font-semibold text-[#FFFFFF]">Horaires du salon</h3>
                </div>
                <dl className="space-y-2 text-sm">
                  {safeHours.map((h) => (
                    <div
                      key={h.day_of_week}
                      className="flex items-center justify-between py-1 border-b border-[#8C8889]/10 last:border-0"
                    >
                      <dt className="text-[#8C8889]">{h.day_name}</dt>
                      <dd className="font-[family-name:var(--font-mono)] text-xs sm:text-sm text-[#FFFFFF] tabular-nums">
                        {h.is_open ? `${h.open_time} – ${h.close_time}` : 'Fermé'}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-[#8C8889]/20">
                <span className="text-xs text-[#8C8889]">Suivre {settings.shop_name}</span>
                <div className="flex items-center gap-3">
                  <a
                    href={settings.instagram_url || 'https://www.instagram.com/hazemcoiff/'}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Instagram"
                    className="w-10 h-10 flex items-center justify-center rounded border border-[#8C8889]/25 text-[#CFCFD3] hover:text-[#FFFFFF] hover:border-[#FFFFFF] transition-colors duration-200"
                  >
                    <Instagram className="w-4 h-4" />
                  </a>
                  <a
                    href={settings.facebook_url || 'https://www.facebook.com/profile.php?id=61552967307064'}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Facebook"
                    className="w-10 h-10 flex items-center justify-center rounded border border-[#8C8889]/25 text-[#CFCFD3] hover:text-[#FFFFFF] hover:border-[#FFFFFF] transition-colors duration-200"
                  >
                    <Facebook className="w-4 h-4" />
                  </a>
                </div>
              </div>
            </div>

            <div className="lg:col-span-7 bg-[#0D0D0F] border border-[#8C8889]/25 rounded-lg overflow-hidden flex flex-col min-h-[380px]">
              <div className="relative flex-1 bg-[#050506] overflow-hidden p-6 flex flex-col justify-between">
                <svg
                  viewBox="0 0 800 480"
                  className="absolute inset-0 w-full h-full opacity-40 pointer-events-none"
                  aria-hidden="true"
                >
                  <defs>
                    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#8C8889" strokeOpacity="0.14" strokeWidth="1" />
                    </pattern>
                  </defs>
                  <rect width="800" height="480" fill="url(#grid)" />
                  <path d="M 60 120 L 740 80" stroke="#8C8889" strokeWidth="6" strokeOpacity="0.3" />
                  <path d="M 80 260 L 720 290" stroke="#CFCFD3" strokeWidth="8" strokeOpacity="0.45" />
                  <path d="M 100 390 L 750 360" stroke="#8C8889" strokeWidth="5" strokeOpacity="0.25" />
                  <path d="M 220 30 L 180 450" stroke="#8C8889" strokeWidth="6" strokeOpacity="0.3" />
                  <path d="M 420 20 L 395 460" stroke="#8C8889" strokeWidth="6" strokeOpacity="0.3" />
                  <path d="M 610 40 L 640 440" stroke="#8C8889" strokeWidth="6" strokeOpacity="0.3" />
                  <circle cx="408" cy="275" r="56" fill="#CFCFD3" fillOpacity="0.08" stroke="#FFFFFF" strokeOpacity="0.35" strokeWidth="1.5" />
                </svg>

                <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
                  <div className="bg-[#0D0D0F]/95 border border-[#8C8889]/30 px-4 py-2.5 rounded">
                    <p className="text-xs text-[#CFCFD3] font-medium">Localisation · Plan d’accès</p>
                    <p className="text-sm font-medium text-[#FFFFFF]">
                      {settings.address}, {settings.city}
                    </p>
                  </div>
                  <div className="bg-[#0D0D0F]/95 border border-[#8C8889]/30 px-3.5 py-2 rounded text-xs font-[family-name:var(--font-mono)] text-[#CFCFD3]">
                    P7JX+RP Boumhel El Bassatine
                  </div>
                </div>

                <div className="relative z-10 my-auto flex flex-col items-center text-center py-8">
                  <div className="w-12 h-12 rounded-full bg-[#FFFFFF] text-[#000000] flex items-center justify-center shadow-lg mb-3 transition-transform duration-200 hover:scale-105">
                    <MapPin className="w-6 h-6" />
                  </div>
                  <div className="bg-[#0D0D0F]/95 border border-[#CFCFD3]/40 px-5 py-3 rounded-lg">
                    <p className="font-[family-name:var(--font-display)] italic text-lg font-semibold text-[#FFFFFF]">
                      {settings.shop_name}
                    </p>
                    <p className="text-xs text-[#8C8889] mt-0.5">
                      {settings.address} · {settings.city}
                    </p>
                  </div>
                </div>

                <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-[#8C8889]/20">
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${mapsSearchQuery}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-[#FFFFFF] bg-[#141416] hover:bg-[#1E1E22] border border-[#8C8889]/30 rounded transition-colors duration-200 whitespace-nowrap shrink-0"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Itinéraire Google Maps</span>
                  </a>
                  <button
                    type="button"
                    onClick={onOpenBooking}
                    className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-[#000000] bg-[#FFFFFF] hover:bg-[#CFCFD3] hover:-translate-y-0.5 active:scale-[0.98] rounded transition-all duration-200 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                    <span>Réserver un créneau</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="bg-[#000000] py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-10 pb-12 border-b border-[#8C8889]/20">
            <div className="md:col-span-4">
              <p className="font-[family-name:var(--font-display)] italic text-2xl font-semibold text-[#FFFFFF] mb-3">
                {settings.shop_name}
              </p>
              <p className="text-sm text-[#8C8889] leading-relaxed max-w-xs">
                {settings.tagline}. Coupes sur mesure, coiffures mariage, brushings et taille de
                barbe 7j/7.
              </p>
            </div>

            <div className="md:col-span-3">
              <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-[#CFCFD3] mb-4">
                Navigation
              </h4>
              <ul className="space-y-2.5 text-sm text-[#8C8889]">
                <li>
                  <a href="#accueil" onClick={(e) => { e.preventDefault(); scrollTo('#accueil'); }} className="hover:text-[#FFFFFF] transition-colors">
                    Accueil
                  </a>
                </li>
                <li>
                  <a href="#services" onClick={(e) => { e.preventDefault(); scrollTo('#services'); }} className="hover:text-[#FFFFFF] transition-colors">
                    Nos services
                  </a>
                </li>
                <li>
                  <a href="#galerie" onClick={(e) => { e.preventDefault(); scrollTo('#galerie'); }} className="hover:text-[#FFFFFF] transition-colors">
                    Galerie
                  </a>
                </li>
                <li>
                  <a href="#apropos" onClick={(e) => { e.preventDefault(); scrollTo('#apropos'); }} className="hover:text-[#FFFFFF] transition-colors">
                    À propos
                  </a>
                </li>
                <li>
                  <a href="#contact" onClick={(e) => { e.preventDefault(); scrollTo('#contact'); }} className="hover:text-[#FFFFFF] transition-colors">
                    Contact
                  </a>
                </li>
              </ul>
            </div>

            <div className="md:col-span-3">
              <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-[#CFCFD3] mb-4">
                Coordonnées
              </h4>
              <ul className="space-y-2.5 text-sm text-[#8C8889]">
                <li>{settings.address}</li>
                <li>{settings.city}</li>
                <li className="font-[family-name:var(--font-mono)] tabular-nums text-[#FFFFFF]">{settings.phone}</li>
                <li>{settings.email}</li>
                <li className="pt-2 flex items-center gap-3">
                  <a
                    href={settings.instagram_url || 'https://www.instagram.com/hazemcoiff/'}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Instagram"
                    className="text-[#8C8889] hover:text-[#FFFFFF] transition-colors"
                  >
                    <Instagram className="w-4 h-4" />
                  </a>
                  <a
                    href={settings.facebook_url || 'https://www.facebook.com/profile.php?id=61552967307064'}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Facebook"
                    className="text-[#8C8889] hover:text-[#FFFFFF] transition-colors"
                  >
                    <Facebook className="w-4 h-4" />
                  </a>
                </li>
              </ul>
            </div>

            <div className="md:col-span-2 flex flex-col justify-between items-start md:items-end">
              <button
                type="button"
                onClick={onOpenBooking}
                className="px-5 py-2.5 text-xs font-semibold text-[#000000] bg-[#FFFFFF] hover:bg-[#CFCFD3] rounded transition-colors duration-200 cursor-pointer whitespace-nowrap shrink-0"
              >
                Prendre rendez-vous
              </button>

              <button
                type="button"
                onClick={onOpenAdmin}
                className="mt-6 inline-flex items-center gap-1.5 text-xs text-[#8C8889] hover:text-[#FFFFFF] transition-colors duration-200 cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Espace Barbier</span>
              </button>
            </div>
          </div>

          <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#8C8889]">
            <p>© {new Date().getFullYear()} {settings.shop_name} — Tous droits réservés.</p>
            <p>52 Av. de Paris, Boumhel El Bassatine · Réservation en ligne</p>
          </div>
        </div>
      </footer>
    </>
  );
}
