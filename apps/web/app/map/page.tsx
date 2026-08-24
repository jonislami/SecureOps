import Link from 'next/link';
import { ArrowLeft, MapPin } from 'lucide-react';
import { resolveMapStyle } from '@/lib/env';
import { LiveMap, type MapMarker } from '@/components/map/LiveMap';

export default function MapPage() {
  // Placeholder marker so the map is visibly working before GPS data exists.
  // Real markers (current_location + sites) are wired in during Phase 2.
  const demoMarkers: MapMarker[] = [
    { id: 'demo', lng: 19.8187, lat: 41.3275, label: 'Example marker (demo) — Tirana', color: '#3B82F6' },
  ];

  const usingFreeTiles = resolveMapStyle().includes('openfreemap');

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-14 items-center justify-between border-b bg-card px-4">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </Link>
          <span className="text-border">|</span>
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            <span className="font-semibold">Live Map</span>
          </div>
        </div>
        <span className="text-xs text-muted-foreground">
          {usingFreeTiles ? 'Tiles: OpenFreeMap (free)' : 'Tiles: custom'}
        </span>
      </header>

      <div className="relative flex-1">
        <LiveMap markers={demoMarkers} className="absolute inset-0 h-full w-full" />
      </div>
    </div>
  );
}
