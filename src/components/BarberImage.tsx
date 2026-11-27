import { useEffect, useState } from 'react';
import { Scissors } from 'lucide-react';
import { resolveImageUrl } from '../lib/images';

interface BarberImageProps {
  src: string;
  alt: string;
  className?: string;
  title?: string;
  width?: number;
  height?: number;
}

export function BarberImage({
  src,
  alt,
  className = '',
  title,
  width = 800,
  height = 600,
}: BarberImageProps) {
  const [hasError, setHasError] = useState(false);
  const resolved = resolveImageUrl(src);

  useEffect(() => {
    setHasError(false);
  }, [src]);

  if (hasError || !resolved) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-[#141416] via-[#0B0B0D] to-[#000000] text-[#8C8889] p-6 text-center ${className}`}
      >
        <Scissors className="w-8 h-8 text-[#CFCFD3]/70 mb-2" strokeWidth={1.5} />
        <span className="text-xs font-medium tracking-wide text-[#CFCFD3]">
          {title || alt}
        </span>
      </div>
    );
  }

  return (
    <img
      src={resolved}
      alt={alt}
      width={width}
      height={height}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setHasError(true)}
      className={className}
    />
  );
}
