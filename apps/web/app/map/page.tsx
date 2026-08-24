import Link from 'next/link';
import { ArrowLeft, MapPin } from 'lucide-react';
import { resolveMapStyle } from '@/lib/env';
import { LiveMapContainer } from '@/components/map/LiveMapContainer';

export default function MapPage() {
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
        <LiveMapContainer />
      </div>
    </div>
  );
}
