import { useState } from 'react';
import { Star, X, ZoomIn } from 'lucide-react';
import type { GalleryImage } from '../types/barbershop';
import { BarberImage } from './BarberImage';

interface GalleryAndReviewsSectionProps {
  gallery: GalleryImage[];
}

const REVIEWS = [
  {
    name: 'Karim Youssef',
    context: 'Client vérifié · 2 avis',
    service: 'Coiffure mariage',
    text: 'Merci Hazem pour cette magnifique coiffure pour mon mariage ! Tu sais vraiment quelle coupe convient le mieux. Très beau travail.',
  },
  {
    name: 'Mahbouli Mohamed',
    context: 'Local Guide · 30 avis',
    service: 'Coupe & Brushing',
    text: 'Un grand merci à Monsieur Hazem pour son accueil chaleureux et son travail exceptionnel ! Je suis ravie de ma coupe et brushing. Je recommande les yeux fermés.',
  },
  {
    name: 'Lajmi Mohammad Adam',
    context: 'Client vérifié · 6 avis',
    service: 'Coupe & Soin',
    text: 'Service impeccable chez Hazem Coiff. Accueil chaleureux, coiffeur très professionnel et à l’écoute, même pour toute l’équipe, salle propre et bien équipée. Le résultat est exactement ce que je voulais avec beaucoup de soin dans les détails.',
  },
];

export function GalleryAndReviewsSection({ gallery }: GalleryAndReviewsSectionProps) {
  const [lightboxImage, setLightboxImage] = useState<GalleryImage | null>(null);

  return (
    <section id="galerie" className="py-20 lg:py-28 bg-[#000000] border-b border-[#8C8889]/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-12">
          <p className="text-xs font-medium tracking-[0.2em] uppercase text-[#8C8889] mb-3">
            Savoir-faire en images
          </p>
          <h2 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl font-semibold text-[#FFFFFF] tracking-tight">
            Galerie <span className="italic font-medium text-[#CFCFD3]">du salon</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-24">
          {gallery.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setLightboxImage(item)}
              aria-label={item.title}
              className="group relative aspect-[4/5] w-full overflow-hidden rounded-lg bg-[#0D0D0F] border border-[#8C8889]/25 hover:border-[#CFCFD3]/70 hover:-translate-y-0.5 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CFCFD3] transition-all duration-200"
            >
              <BarberImage
                src={item.image_url}
                alt={item.title}
                title={item.title}
                className="w-full h-full object-cover object-top transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.04]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#000000]/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200 w-8 h-8 rounded-full bg-[#000000]/80 border border-[#CFCFD3]/30 flex items-center justify-center">
                <ZoomIn className="w-4 h-4 text-[#FFFFFF]" />
              </div>
            </button>
          ))}
        </div>

        {/* Testimonials */}
        <div className="pt-16 border-t border-[#8C8889]/20">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
            <div>
              <p className="text-xs font-medium tracking-[0.2em] uppercase text-[#8C8889] mb-3">
                Avis clients Google · 5,0 / 5
              </p>
              <h2 className="font-[family-name:var(--font-display)] text-2xl sm:text-3xl font-semibold text-[#FFFFFF] tracking-tight">
                La confiance de <span className="italic font-medium text-[#CFCFD3]">nos clients</span>
              </h2>
            </div>
            <p className="text-sm text-[#8C8889] tabular-nums">
              Note globale 5,0 sur 15 avis vérifiés
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {REVIEWS.map((review) => (
              <blockquote
                key={review.name}
                className="p-6 bg-[#0D0D0F] border border-[#8C8889]/25 hover:border-[#CFCFD3]/55 hover:-translate-y-0.5 rounded-lg flex flex-col justify-between transition-all duration-200"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-4">
                    <div className="flex items-center gap-1 text-[#FFFFFF]" aria-label="Note 5 sur 5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className="w-3.5 h-3.5 fill-[#FFFFFF]" />
                      ))}
                    </div>
                    <span className="text-xs text-[#8C8889]">{review.service}</span>
                  </div>
                  <p className="text-sm text-[#CFCFD3] leading-relaxed mb-6">
                    « {review.text} »
                  </p>
                </div>

                <footer className="pt-4 border-t border-[#8C8889]/20">
                  <p className="text-sm font-semibold text-[#FFFFFF]">{review.name}</p>
                  <p className="text-xs text-[#8C8889] mt-0.5">{review.context}</p>
                </footer>
              </blockquote>
            ))}
          </div>
        </div>
      </div>

      {/* Lightbox Modal */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 bg-[#000000]/90 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setLightboxImage(null)}
          role="dialog"
          aria-modal="true"
          aria-label={lightboxImage.title}
        >
          <div
            className="relative max-w-4xl w-full bg-[#0D0D0F] border border-[#8C8889]/35 rounded-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setLightboxImage(null)}
              aria-label="Fermer l’aperçu"
              className="absolute top-4 right-4 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-[#000000]/80 text-[#FFFFFF] hover:text-[#CFCFD3] border border-[#8C8889]/30 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="aspect-[4/3] max-h-[75vh] w-full bg-[#000000]">
              <BarberImage
                src={lightboxImage.image_url}
                alt={lightboxImage.title}
                title={lightboxImage.title}
                className="w-full h-full object-contain"
              />
            </div>
            <div className="p-5 border-t border-[#8C8889]/25 flex items-center justify-between">
              <div>
                <p className="text-xs text-[#8C8889]">{lightboxImage.category}</p>
                <p className="text-base font-medium text-[#FFFFFF]">{lightboxImage.title}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
