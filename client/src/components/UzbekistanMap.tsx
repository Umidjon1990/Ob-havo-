import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { regions } from '@/data/regions';

interface UzbekistanMapProps {
  onRegionSelect?: (regionId: string) => void;
  className?: string;
  selectedRegion?: string | null;
}

const ID_MAP: Record<string, string> = {
  'UZAN': 'andijon',
  'UZBU': 'buxoro',
  'UZFA': 'fargona',
  'UZJI': 'jizzax',
  'UZNG': 'namangan',
  'UZNW': 'navoiy',
  'UZQA': 'qarshi',
  'UZQR': 'nukus',
  'UZSA': 'samarqand',
  'UZSI': 'guliston',
  'UZSU': 'termiz',
  'UZTK': 'toshkent',
  'UZTO': 'toshkent',
  'UZXO': 'urganch'
};

export const UzbekistanMap: React.FC<UzbekistanMapProps> = ({ onRegionSelect, className, selectedRegion }) => {
  const [svgContent, setSvgContent] = useState<string | null>(null);

  useEffect(() => {
    fetch('/map.svg')
      .then(res => res.text())
      .then(text => {
        // Clean up the SVG to allow our CSS to control colors
        // Remove fill attributes so CSS can take over
        const cleanText = text
          .replace(/fill="#[a-fA-F0-9]{6}"/g, '')
          .replace(/style="[^"]*"/g, '');
        setSvgContent(cleanText);
      })
      .catch(err => console.error('Failed to load map', err));
  }, []);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const path = target.closest('path');
    if (path && path.id) {
      const regionId = ID_MAP[path.id];
      if (regionId && onRegionSelect) {
        onRegionSelect(regionId);
      }
    }
  };

  if (!svgContent) return (
    <div className="w-full h-full flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
    </div>
  );

  return (
    <div 
      className={cn(
        "w-full h-full relative uzbekistan-map-container",
        className
      )}
      onClick={handleClick}
      dangerouslySetInnerHTML={{ __html: svgContent }}
    />
  );
};
