'use client';

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { resolveMapStyle } from '@/lib/env';

export interface MapMarker {
  id: string;
  lng: number;
  lat: number;
  label?: string;
  /** CSS color for the marker (defaults to primary blue). */
  color?: string;
}

interface LiveMapProps {
  center?: [number, number]; // [lng, lat]
  zoom?: number;
  markers?: MapMarker[];
  className?: string;
}

/**
 * MapLibre GL map. Provider-agnostic: the tile style is resolved from env
 * (keyless OpenFreeMap by default, MapTiler when a key is set, or a custom
 * style URL). Swapping to Mapbox later is a localized change here.
 */
export function LiveMap({
  center = [19.8187, 41.3275], // Tirana as a sensible default
  zoom = 12,
  markers = [],
  className,
}: LiveMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerObjs = useRef<maplibregl.Marker[]>([]);

  // Initialise the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: resolveMapStyle(),
      center,
      zoom,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync markers whenever they change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markerObjs.current.forEach((m) => m.remove());
    markerObjs.current = [];

    for (const mk of markers) {
      const marker = new maplibregl.Marker({ color: mk.color ?? '#3B82F6' }).setLngLat([
        mk.lng,
        mk.lat,
      ]);
      if (mk.label) {
        marker.setPopup(new maplibregl.Popup({ offset: 24 }).setText(mk.label));
      }
      marker.addTo(map);
      markerObjs.current.push(marker);
    }
  }, [markers]);

  return <div ref={containerRef} className={className} />;
}
