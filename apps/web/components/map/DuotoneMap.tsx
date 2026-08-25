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

export interface BuildingPoint {
  id: string;
  lng: number;
  lat: number;
}

interface Props {
  markers?: FieldMarker[];
  rings?: FieldRing[];
  /** Many buildings (2k+): rendered as a native clustered layer, not overlays. */
  buildings?: BuildingPoint[];
  center?: [number, number];
  zoom?: number;
  selectedId?: string | null;
  onMarkerClick?: (id: string) => void;
  onBuildingClick?: (id: string) => void;
  flyTo?: [number, number];
  fitKey?: number; // bump to fit-all
  className?: string;
}

const POSITRON = 'https://tiles.openfreemap.org/styles/positron';

function metersPerPixel(lat: number, zoom: number) {
  return (40075016.686 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom + 9);
}

const BLD_SRC = 'buildings-src';

export function DuotoneMap({
  markers = [],
  rings = [],
  buildings = [],
  center = MAP_DEFAULT.center,
  zoom = MAP_DEFAULT.zoom,
  selectedId,
  onMarkerClick,
  onBuildingClick,
  flyTo,
  fitKey,
  className,
}: Props) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const onBuildingClickRef = useRef(onBuildingClick);
  onBuildingClickRef.current = onBuildingClick;
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

    // Native clustered buildings layer (scales to thousands).
    const installBuildings = () => {
      if (!map.isStyleLoaded() || map.getSource(BLD_SRC)) return;
      map.addSource(BLD_SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, cluster: true, clusterRadius: 48, clusterMaxZoom: 15 });
      map.addLayer({ id: 'bld-cluster', type: 'circle', source: BLD_SRC, filter: ['has', 'point_count'], paint: { 'circle-color': '#5980a6', 'circle-opacity': 0.92, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5, 'circle-radius': ['step', ['get', 'point_count'], 13, 25, 17, 100, 22] } });
      map.addLayer({ id: 'bld-cluster-count', type: 'symbol', source: BLD_SRC, filter: ['has', 'point_count'], layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 11, 'text-font': ['Noto Sans Regular'] }, paint: { 'text-color': '#fff' } });
      map.addLayer({ id: 'bld-point', type: 'circle', source: BLD_SRC, filter: ['!', ['has', 'point_count']], paint: { 'circle-color': '#5980a6', 'circle-radius': 5, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5, 'circle-opacity': 0.95 } });
      map.on('click', 'bld-cluster', (e) => {
        const f = e.features?.[0];
        const cid = f?.properties?.cluster_id;
        const src = map.getSource(BLD_SRC) as maplibregl.GeoJSONSource;
        if (cid != null && src.getClusterExpansionZoom) {
          src.getClusterExpansionZoom(cid).then((z) => map.easeTo({ center: (f!.geometry as GeoJSON.Point).coordinates as [number, number], zoom: z }));
        }
      });
      map.on('click', 'bld-point', (e) => { const id = e.features?.[0]?.properties?.id as string | undefined; if (id) onBuildingClickRef.current?.(id); });
      map.on('mouseenter', 'bld-point', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'bld-point', () => { map.getCanvas().style.cursor = ''; });
      map.on('mouseenter', 'bld-cluster', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'bld-cluster', () => { map.getCanvas().style.cursor = ''; });
    };
    map.on('load', installBuildings);
    map.on('styledata', installBuildings);
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

  // Push buildings into the native clustered source when they change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const src = map.getSource(BLD_SRC) as maplibregl.GeoJSONSource | undefined;
      if (!src) return false;
      src.setData({ type: 'FeatureCollection', features: buildings.map((b) => ({ type: 'Feature', properties: { id: b.id }, geometry: { type: 'Point', coordinates: [b.lng, b.lat] } })) });
      return true;
    };
    if (!apply()) { const t = setTimeout(apply, 400); return () => clearTimeout(t); }
  }, [buildings, tick]);

  // Ease to a point (search / selection).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyTo) return;
    map.easeTo({ center: flyTo, zoom: Math.max(map.getZoom(), 15), duration: 700 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyTo?.[0], flyTo?.[1]]);

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
