import { renderAsset } from '../assets';
import { center } from '../geometry';
import type { LotMap, MapItem } from '../types';

export const FONT = 'Inter, "Segoe UI", system-ui, -apple-system, sans-serif';

export function MapItems({ items }: { items: MapItem[] }) {
  return (
    <>
      {items.map((it) => {
        const c = center(it);
        return (
          <g key={it.id} data-id={it.id} transform={`translate(${c.x} ${c.y}) rotate(${it.rotation})`}>
            {renderAsset(it)}
          </g>
        );
      })}
    </>
  );
}

/** A standalone, non-interactive picture of a map (thumbnails and image export). */
export function MapSvg({ map, className }: { map: LotMap; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${map.width} ${map.height}`}
      width={map.width}
      height={map.height}
      className={className}
      fontFamily={FONT}
    >
      <rect width={map.width} height={map.height} fill={map.surface} />
      <MapItems items={map.items} />
    </svg>
  );
}
