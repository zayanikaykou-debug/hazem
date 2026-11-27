import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { resolveImageUrl } from '../lib/images';

interface NavbarProps {
  shopName: string;
  logoUrl?: string;
  onOpenBooking: () => void;
}

const NAV_LINKS = [
  { label: 'Accueil', href: '#accueil' },
  { label: 'Nos services', href: '#services' },
  { label: 'Galerie', href: '#galerie' },
  { label: 'À propos', href: '#apropos' },
  { label: 'Contact', href: '#contact' },
];

export function Navbar({ shopName, logoUrl, onOpenBooking }: NavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const resolvedLogo = resolveImageUrl(logoUrl || '/assets/optimized/logo.webp');

  const handleNavClick = (href: string) => {
    setMobileOpen(false);
    const el = document.querySelector(href);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-[#000000]/90 backdrop-blur-md border-b border-[#8C8889]/20 transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between gap-8">
        <a
          href="#accueil"
          onClick={(e) => {
            e.preventDefault();
            handleNavClick('#accueil');
          }}
          aria-label={shopName}
          className="inline-flex items-center shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CFCFD3] rounded transition-opacity duration-200 hover:opacity-85"
        >
          <img
            src={resolvedLogo}
            alt={shopName}
            width={140}
            height={56}
            decoding="async"
            className="h-13 sm:h-14 w-auto object-contain mix-blend-lighten"
          />
        </a>

        <nav className="hidden lg:flex items-center gap-7" aria-label="Navigation principale">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={(e) => {
                e.preventDefault();
                handleNavClick(link.href);
              }}
              className="relative py-1 text-sm font-medium text-[#CFCFD3] hover:text-[#FFFFFF] transition-colors duration-200 whitespace-nowrap shrink-0 after:content-[''] after:absolute after:left-0 after:bottom-0 after:w-0 after:h-px after:bg-[#FFFFFF] hover:after:w-full after:transition-all after:duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CFCFD3] rounded"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onOpenBooking}
            className="hidden sm:inline-flex items-center justify-center px-5 py-2.5 text-sm font-semibold text-[#000000] bg-[#FFFFFF] hover:bg-[#CFCFD3] hover:-translate-y-0.5 active:scale-[0.98] rounded transition-all duration-200 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CFCFD3]"
          >
            Prendre rendez-vous
          </button>

          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label={mobileOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
            aria-expanded={mobileOpen}
            className="lg:hidden inline-flex items-center justify-center w-11 h-11 text-[#FFFFFF] hover:text-[#CFCFD3] border border-[#8C8889]/30 rounded transition-colors duration-200 cursor-pointer"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="lg:hidden bg-[#0D0D0F] border-b border-[#8C8889]/25 px-4 py-4">
          <nav className="flex flex-col space-y-1" aria-label="Navigation mobile">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={(e) => {
                  e.preventDefault();
                  handleNavClick(link.href);
                }}
                className="px-3 py-3 text-base font-medium text-[#CFCFD3] hover:text-[#FFFFFF] hover:bg-white/[0.04] rounded transition-colors duration-200"
              >
                {link.label}
              </a>
            ))}
            <div className="pt-3 border-t border-[#8C8889]/20 mt-2">
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  onOpenBooking();
                }}
                className="w-full py-3.5 px-4 text-sm font-semibold text-[#000000] bg-[#FFFFFF] hover:bg-[#CFCFD3] rounded transition-colors duration-200 cursor-pointer"
              >
                Prendre rendez-vous
              </button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
