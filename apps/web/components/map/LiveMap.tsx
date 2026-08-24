'use client';

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { resolveMapStyle, MAP_DEFAULT } from '@/lib/env';

export interface MapMarker {
  id: string;
  lng: number;
  lat: number;
  label?: string;
  /** CSS color for the marker (defaults to primary blue). */
  color?: string;
}

export interface MapCircle {
  id: string;
  lng: number;
  lat: number;
  radiusM: number;
  color?: string;
}

interface LiveMapProps {
  center?: [number, number]; // [lng, lat]
  zoom?: number;
  markers?: MapMarker[];
  circles?: MapCircle[];
  /** Fires when the user clicks the map (e.g. to place a site). */
  onClick?: (lng: number, lat: number) => void;
  className?: string;
}

const GEOFENCE_SRC = 'geofences';

/** GeoJSON polygon approximating a circle of radiusM around [lng,lat]. */
function circleFeature(c: MapCircle): GeoJSON.Feature {
  const points = 64;
  const earth = 6378137;
  const dLat = (c.radiusM / earth) * (180 / Math.PI);
  const dLng = (c.radiusM / (earth * Math.cos((Math.PI * c.lat) / 180))) * (180 / Math.PI);
  const coords: [number, number][] = [];
  for (let i = 0; i <= points; i++) {
    const t = (i / points) * 2 * Math.PI;
    coords.push([c.lng + dLng * Math.cos(t), c.lat + dLat * Math.sin(t)]);
  }
  return {
    type: 'Feature',
    properties: { color: c.color ?? '#3B82F6' },
    geometry: { type: 'Polygon', coordinates: [coords] },
  };
}

/**
 * MapLibre GL map. Provider-agnostic: the tile style is resolved from env
 * (keyless OpenFreeMap by default). Supports markers, geofence circles, and an
 * onClick handler for placing points.
 */
export function LiveMap({
  center = MAP_DEFAULT.center,
  zoom = MAP_DEFAULT.zoom,
  markers = [],
  circles = [],
  onClick,
  className,
}: LiveMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerObjs = useRef<maplibregl.Marker[]>([]);
  const onClickRef = useRef(onClick);
  const styleReady = useRef(false);
  onClickRef.current = onClick;

  // Init once.
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
    map.on('click', (e) => onClickRef.current?.(e.lngLat.lng, e.lngLat.lat));

    map.on('load', () => {
      map.addSource(GEOFENCE_SRC, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'geofence-fill',
        type: 'fill',
        source: GEOFENCE_SRC,
        paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.12 },
      });
      map.addLayer({
        id: 'geofence-line',
        type: 'line',
        source: GEOFENCE_SRC,
        paint: { 'line-color': ['get', 'color'], 'line-width': 2, 'line-opacity': 0.7 },
      });
      styleReady.current = true;
      syncCircles();
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      styleReady.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync markers.
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
      if (mk.label) marker.setPopup(new maplibregl.Popup({ offset: 24 }).setText(mk.label));
      marker.addTo(map);
      markerObjs.current.push(marker);
    }
  }, [markers]);

  // Sync geofence circles.
  function syncCircles() {
    const map = mapRef.current;
    if (!map || !styleReady.current) return;
    const src = map.getSource(GEOFENCE_SRC) as maplibregl.GeoJSONSource | undefined;
    src?.setData({ type: 'FeatureCollection', features: circles.map(circleFeature) });
  }
  useEffect(syncCircles, [circles]);

  return <div ref={containerRef} className={className} />;
}
