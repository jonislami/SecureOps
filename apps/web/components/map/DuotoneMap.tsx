'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MAP_DEFAULT } from '@/lib/env';

export type FieldStatus = 'on_post' | 'moving' | 'idle' | 'offline' | 'sos';

export interface FieldMarker {
  id: string;
  lng: number;
  lat: number;
  initials: string;
  status: FieldStatus;
  label?: string;
}
export interface FieldRing {
  id: string;
  lng: number;
  lat: number;
  radiusM: number;
  tone: 'accent' | 'alarm' | 'neutral';
}

interface Props {
  markers?: FieldMarker[];
  rings?: FieldRing[];
  center?: [number, number];
  zoom?: number;
  selectedId?: string | null;
  onMarkerClick?: (id: string) => void;
  fitKey?: number; // bump to fit-all
  className?: string;
}

const POSITRON = 'https://tiles.openfreemap.org/styles/positron';

function metersPerPixel(lat: number, zoom: number) {
  return (40075016.686 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom + 9);
}

export function DuotoneMap({
  markers = [],
  rings = [],
  center = MAP_DEFAULT.center,
  zoom = MAP_DEFAULT.zoom,
  selectedId,
  onMarkerClick,
  fitKey,
  className,
}: Props) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [tick, setTick] = useState(0); // recompute overlay positions on map move

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: POSITRON,
      center,
      zoom,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    const rerender = () => setTick((n) => n + 1);
    map.on('move', rerender);
    map.on('moveend', rerender);
    map.on('zoom', rerender);
    map.on('load', rerender);
    map.on('idle', rerender);
    // Fallbacks so the overlay positions even if 'load'/'idle' are delayed.
    const t1 = setTimeout(rerender, 300);
    const t2 = setTimeout(rerender, 1200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fit all markers when requested.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || fitKey === undefined || markers.length === 0) return;
    const b = new maplibregl.LngLatBounds();
    markers.forEach((m) => b.extend([m.lng, m.lat]));
    rings.forEach((r) => b.extend([r.lng, r.lat]));
    try {
      map.fitBounds(b, { padding: 120, maxZoom: 15, duration: 600 });
    } catch {
      /* single point / empty */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  const map = mapRef.current;
  const project = (lng: number, lat: number) => map?.project([lng, lat]) ?? { x: -9999, y: -9999 };
  const z = map?.getZoom() ?? zoom;

  const ringEls = useMemo(() => {
    if (!map) return null;
    return rings.map((r) => {
      const p = project(r.lng, r.lat);
      const mpp = metersPerPixel(r.lat, z);
      const d = (r.radiusM / mpp) * 2;
      const color =
        r.tone === 'alarm' ? 'var(--color-alarm)' : r.tone === 'neutral' ? 'var(--color-neutral-600)' : 'var(--color-accent)';
      const dashed = r.tone !== 'accent';
      return (
        <div
          key={r.id}
          style={{
            position: 'absolute',
            left: p.x,
            top: p.y,
            width: d,
            height: d,
            transform: 'translate(-50%,-50%)',
            border: `${r.tone === 'alarm' ? 1.5 : 1}px ${dashed ? 'dashed' : 'solid'} ${color}`,
            borderRadius: '50%',
            background: r.tone === 'neutral' ? 'transparent' : `color-mix(in srgb, ${color} 9%, transparent)`,
            pointerEvents: 'none',
          }}
        />
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rings, map, z, tick]);

  const markerEls = useMemo(() => {
    if (!map) return null;
    return markers.map((m) => {
      const p = project(m.lng, m.lat);
      const sel = m.id === selectedId;
      const sos = m.status === 'sos';
      const size = sos ? 32 : 28;
      let boxStyle: CSSProperties;
      if (m.status === 'on_post')
        boxStyle = { background: 'var(--color-accent)', color: 'var(--color-bg)', boxShadow: 'var(--shadow-md)' };
      else if (m.status === 'moving')
        boxStyle = { background: 'var(--color-bg)', color: 'var(--color-accent-800)', border: '1.5px solid var(--color-accent)', boxShadow: 'var(--shadow-sm)' };
      else if (sos)
        boxStyle = { background: 'var(--color-alarm)', color: '#f2f2f3', boxShadow: '0 0 0 6px color-mix(in srgb, var(--color-alarm) 22%, transparent)' };
      else
        boxStyle = {
          background: 'var(--color-bg)',
          color: 'var(--color-neutral-800)',
          border: `1.5px ${m.status === 'offline' ? 'dashed' : 'solid'} var(--color-neutral-500)`,
          opacity: m.status === 'offline' ? 0.6 : 1,
        };

      return (
        <div
          key={m.id}
          style={{
            position: 'absolute',
            left: p.x,
            top: p.y,
            transform: 'translate(-50%,-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            pointerEvents: 'auto',
            cursor: onMarkerClick ? 'pointer' : 'default',
            zIndex: sel || sos ? 3 : 1,
          }}
          onClick={() => onMarkerClick?.(m.id)}
        >
          <div
            style={{
              width: size,
              height: size,
              display: 'grid',
              placeItems: 'center',
              font: '600 11px/1 var(--font-heading)',
              letterSpacing: '.03em',
              outline: sel ? '2px solid var(--color-text)' : 'none',
              outlineOffset: 2,
              ...boxStyle,
            }}
          >
            {m.initials}
          </div>
          {m.label && (
            <span
              style={{
                font: '600 10px/1.3 var(--font-heading)',
                letterSpacing: '.09em',
                textTransform: 'uppercase',
                background: sos ? 'var(--color-alarm)' : 'var(--color-neutral-900)',
                color: '#f2f2f3',
                padding: '3px 7px',
                whiteSpace: 'nowrap',
              }}
            >
              {m.label}
            </span>
          )}
        </div>
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers, selectedId, map, z, tick, onMarkerClick]);

  return (
    <div className={className} style={{ overflow: 'hidden' }}>
      <div ref={mapContainer} className="duotone-tiles" style={{ position: 'absolute', inset: 0 }} />
      <div className="duotone-wash" />
      <div className="duotone-vignette" />
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {ringEls}
        {markerEls}
      </div>
    </div>
  );
}
