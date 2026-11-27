import heroAtelier from '../assets/images/hero_barber_atelier.webp';
import classicCut from '../assets/images/service_classic_cut.webp';
import skinFade from '../assets/images/service_skin_fade.webp';
import cutBeard from '../assets/images/service_cut_beard.webp';
import beardTrim from '../assets/images/service_beard_trim.webp';
import hotShave from '../assets/images/service_hot_shave.webp';

export const ASSET_IMAGES = {
  heroAtelier,
  classicCut,
  skinFade,
  cutBeard,
  beardTrim,
  hotShave,
  masterBarber: '/assets/optimized/about.webp',
} as const;

const PATH_MAP: Record<string, string> = {
  '/src/assets/images/hero_barber_atelier_1794507920116.jpg': heroAtelier,
  '/src/assets/images/service_classic_cut_1794507920274.jpg': classicCut,
  '/src/assets/images/service_skin_fade_1794507920405.jpg': skinFade,
  '/src/assets/images/service_cut_beard_1794507920251.jpg': cutBeard,
  '/src/assets/images/service_beard_trim_1794507921722.jpg': beardTrim,
  '/src/assets/images/service_hot_shave_1794507921391.jpg': hotShave,
  '/src/assets/images/about_master_barber_1794507921924.jpg': '/assets/optimized/about.webp',
  '/assets/aistudio/Capture_d__cran_2026-11-12_200313_cbb7a2be.png': '/assets/optimized/about.webp',
  '/assets/aistudio/image_1a42b0d4.png': '/assets/optimized/hero.webp',
  '/assets/aistudio/image_0d689771.png': '/assets/optimized/logo.webp',
  '/assets/aistudio/image_f9fbb45e.png': '/assets/optimized/gallery_1.webp',
  '/assets/aistudio/image_efcc1f05.png': '/assets/optimized/gallery_2.webp',
  '/assets/aistudio/image_ed194fa6.png': '/assets/optimized/gallery_3.webp',
  '/assets/aistudio/image_0a6acb80.png': '/assets/optimized/gallery_4.webp',
};

export const PRESET_IMAGE_OPTIONS = [
  { label: 'Dégradé au salon', value: '/assets/optimized/gallery_1.webp' },
  { label: 'Coupe & Barbe (extérieur)', value: '/assets/optimized/gallery_2.webp' },
  { label: 'Avec Hazem au salon', value: '/assets/optimized/gallery_3.webp' },
  { label: 'Coiffure de mariage', value: '/assets/optimized/gallery_4.webp' },
  {
    label: 'Portrait Hazem Coiff',
    value: '/assets/optimized/about.webp',
  },
  { label: 'Coupe classique', value: '/src/assets/images/service_classic_cut_1794507920274.jpg' },
  { label: 'Dégradé (Skin Fade)', value: '/src/assets/images/service_skin_fade_1794507920405.jpg' },
  { label: 'Coupe + Barbe', value: '/src/assets/images/service_cut_beard_1794507920251.jpg' },
  { label: 'Taille de barbe', value: '/src/assets/images/service_beard_trim_1794507921722.jpg' },
  { label: 'Rasage traditionnel', value: '/src/assets/images/service_hot_shave_1794507921391.jpg' },
];

export function resolveImageUrl(url: string): string {
  return PATH_MAP[url] || url;
}
