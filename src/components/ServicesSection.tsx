import { Clock, ArrowUpRight } from 'lucide-react';
import type { ServiceItem } from '../types/barbershop';
import { formatPriceFr } from '../lib/api';
import { BarberImage } from './BarberImage';

interface ServicesSectionProps {
  services: ServiceItem[];
  onSelectServiceForBooking: (service: ServiceItem) => void;
}

export function ServicesSection({
  services,
  onSelectServiceForBooking,
}: ServicesSectionProps) {
  return (
    <section id="services" className="py-20 lg:py-28 bg-[#000000] border-b border-[#8C8889]/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-14">
          <div className="max-w-2xl">
            <p className="text-xs font-medium tracking-[0.2em] uppercase text-[#8C8889] mb-3">
              La Carte des Soins
            </p>
            <h2 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl font-semibold text-[#FFFFFF] tracking-tight">
              Nos prestations <span className="italic font-medium text-[#CFCFD3]">sur mesure</span>
            </h2>
          </div>
          <p className="text-sm sm:text-base text-[#8C8889] max-w-md leading-relaxed">
            Chaque rendez-vous débute par une consultation attentive afin d’harmoniser
            la coupe et la barbe avec votre style naturel.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {services.map((service) => (
            <article
              key={service.id}
              className="group flex flex-col bg-[#0D0D0F] border border-[#8C8889]/25 hover:border-[#CFCFD3]/70 hover:-translate-y-1 rounded-lg overflow-hidden transition-all duration-300"
            >
              <div className="aspect-[4/3] w-full overflow-hidden bg-[#070708] relative">
                <BarberImage
                  src={service.image_url}
                  alt={service.name}
                  title={service.name}
                  className="w-full h-full object-cover transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.05]"
                />
              </div>

              <div className="p-6 flex flex-col flex-1">
                <div className="flex items-baseline justify-between gap-4 mb-2.5">
                  <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold text-[#FFFFFF]">
                    {service.name}
                  </h3>
                  <span className="font-[family-name:var(--font-mono)] text-lg font-semibold text-[#FFFFFF] tabular-nums whitespace-nowrap shrink-0">
                    {formatPriceFr(service.price)}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-xs text-[#8C8889] mb-4 tabular-nums">
                  <Clock className="w-3.5 h-3.5 text-[#CFCFD3]" />
                  <span>Durée estimée : {service.duration_minutes} min</span>
                </div>

                <p className="text-sm text-[#CFCFD3]/80 leading-relaxed mb-6 flex-1">
                  {service.description}
                </p>

                <button
                  type="button"
                  onClick={() => onSelectServiceForBooking(service)}
                  className="w-full inline-flex items-center justify-between px-4 py-3 text-sm font-medium text-[#FFFFFF] bg-[#161619] hover:bg-[#FFFFFF] hover:text-[#000000] border border-[#8C8889]/30 hover:border-[#FFFFFF] rounded transition-all duration-200 active:scale-[0.99] cursor-pointer"
                >
                  <span>Réserver cette prestation</span>
                  <ArrowUpRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
