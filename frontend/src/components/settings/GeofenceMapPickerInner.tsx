'use client';

import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Search, MapPin, Navigation, Loader2 } from 'lucide-react';

const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

interface SearchResult {
  placeId: string | number;
  name: string;
  displayName: string;
  latitude: number;
  longitude: number;
}

interface GeofenceMapPickerInnerProps {
  lat: number;
  lng: number;
  radiusMeters: number;
  locationName: string;
  onSelectLocation: (lat: number, lng: number, name?: string) => void;
  height?: string;
}

export default function GeofenceMapPickerInner({
  lat,
  lng,
  radiusMeters,
  locationName,
  onSelectLocation,
  height = '420px',
}: GeofenceMapPickerInnerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [noResults, setNoResults] = useState(false);

  // Initialize Map
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const initialLat = Number.isFinite(lat) && lat !== 0 ? lat : 16.9048;
    const initialLng = Number.isFinite(lng) && lng !== 0 ? lng : 82.2369;

    const map = L.map(el, {
      center: [initialLat, initialLng],
      zoom: 15,
      scrollWheelZoom: true,
    });

    const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    });

    const hybridLayer = L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
      maxZoom: 20,
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    });

    hybridLayer.addTo(map);
    L.control.layers({ 'Satellite Hybrid': hybridLayer, Street: streetLayer }).addTo(map);

    // Draggable Marker
    const marker = L.marker([initialLat, initialLng], {
      icon: defaultIcon,
      draggable: true,
    }).addTo(map);

    if (locationName) {
      marker.bindPopup(locationName).openPopup();
    }

    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      onSelectLocation(
        Number(pos.lat.toFixed(6)),
        Number(pos.lng.toFixed(6))
      );
    });

    // Geofence Radius Circle
    const circle = L.circle([initialLat, initialLng], {
      radius: radiusMeters || 500,
      color: '#10b981',
      fillColor: '#10b981',
      fillOpacity: 0.2,
      weight: 2,
    }).addTo(map);

    // Map Click to move marker
    map.on('click', (e: L.LeafletMouseEvent) => {
      const clickLat = Number(e.latlng.lat.toFixed(6));
      const clickLng = Number(e.latlng.lng.toFixed(6));
      marker.setLatLng([clickLat, clickLng]);
      circle.setLatLng([clickLat, clickLng]);
      onSelectLocation(clickLat, clickLng);
    });

    mapRef.current = map;
    markerRef.current = marker;
    circleRef.current = circle;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
    };
  }, []);

  // Sync prop updates (lat, lng, radius, locationName) to Map, Marker, and Circle
  useEffect(() => {
    if (!mapRef.current || !markerRef.current || !circleRef.current) return;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const currentPos = markerRef.current.getLatLng();
    if (Math.abs(currentPos.lat - lat) > 0.00001 || Math.abs(currentPos.lng - lng) > 0.00001) {
      markerRef.current.setLatLng([lat, lng]);
      circleRef.current.setLatLng([lat, lng]);
      mapRef.current.panTo([lat, lng]);
    }

    if (circleRef.current.getRadius() !== radiusMeters) {
      circleRef.current.setRadius(radiusMeters || 500);
    }
  }, [lat, lng, radiusMeters]);

  // Live debounced search while typing (350ms delay)
  useEffect(() => {
    if (!searchQuery || searchQuery.trim().length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      setNoResults(false);
      return;
    }
    const timer = setTimeout(() => {
      performSearch(searchQuery);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Execute Search via Backend Proxy or Photon fallback
  const performSearch = async (queryText: string) => {
    if (!queryText.trim() || queryText.trim().length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      setNoResults(false);
      return;
    }

    setIsSearching(true);
    setNoResults(false);
    try {
      const { api } = await import('@/lib/api');
      const res = await api.searchGeofenceLocation(queryText.trim());

      let resultsList: SearchResult[] = [];
      if (res && res.success && Array.isArray(res.data)) {
        resultsList = res.data;
      }

      // Direct fallback if backend proxy returns empty
      if (resultsList.length === 0) {
        const fallbackRes = await fetch(
          `https://photon.komoot.io/api/?q=${encodeURIComponent(queryText.trim())}&limit=5`
        );
        const pData = await fallbackRes.json();
        if (pData?.features?.length) {
          resultsList = pData.features.map((f: any, idx: number) => ({
            placeId: idx,
            name: f.properties?.name || f.properties?.city || 'Location',
            displayName: [f.properties?.name, f.properties?.street, f.properties?.city, f.properties?.state, f.properties?.country].filter(Boolean).join(', '),
            latitude: f.geometry?.coordinates?.[1] || 0,
            longitude: f.geometry?.coordinates?.[0] || 0,
          }));
        }
      }

      setSearchResults(resultsList);
      setShowDropdown(true);
      setNoResults(resultsList.length === 0);
    } catch (err) {
      console.warn('Geofence search failed:', err);
      setSearchResults([]);
      setNoResults(true);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectSearchResult = (result: SearchResult) => {
    const selectedLat = Number(result.latitude.toFixed(6));
    const selectedLng = Number(result.longitude.toFixed(6));

    if (mapRef.current && markerRef.current && circleRef.current) {
      mapRef.current.setView([selectedLat, selectedLng], 16);
      markerRef.current.setLatLng([selectedLat, selectedLng]);
      circleRef.current.setLatLng([selectedLat, selectedLng]);
    }

    onSelectLocation(selectedLat, selectedLng, result.name);

    setShowDropdown(false);
    setSearchQuery(result.displayName);
  };

  const handleLocateMe = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      const curLat = Number(pos.coords.latitude.toFixed(6));
      const curLng = Number(pos.coords.longitude.toFixed(6));
      if (mapRef.current && markerRef.current && circleRef.current) {
        mapRef.current.setView([curLat, curLng], 16);
        markerRef.current.setLatLng([curLat, curLng]);
        circleRef.current.setLatLng([curLat, curLng]);
      }
      onSelectLocation(curLat, curLng);
    });
  };

  return (
    <div className="space-y-3">
      {/* Map Search Bar (DIV container - no nested form to prevent page refresh) */}
      <div className="relative z-[1000]">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                const text = e.target.value;
                setSearchQuery(text);
                if (!text) {
                  setShowDropdown(false);
                  setNoResults(false);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  performSearch(searchQuery);
                }
              }}
              placeholder="Search address or location (e.g. Kakinada, Hyderabad, Office Park)..."
              className="w-full pl-10 pr-4 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
            />
            {isSearching && (
              <Loader2 className="w-4 h-4 absolute right-3 top-3 animate-spin text-emerald-500" />
            )}
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              performSearch(searchQuery);
            }}
            disabled={isSearching}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm rounded-xl shadow-sm flex items-center gap-1.5 disabled:opacity-50 transition-colors cursor-pointer"
          >
            {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            <span>Search</span>
          </button>
          <button
            type="button"
            onClick={handleLocateMe}
            title="Use My Current GPS Position"
            className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl border border-slate-300 dark:border-slate-700 cursor-pointer"
          >
            <Navigation className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </button>
        </div>

        {/* Search Results Dropdown */}
        {showDropdown && searchResults.length > 0 && (
          <div className="absolute z-[9999] top-full left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto">
            {searchResults.map((result) => (
              <button
                key={result.placeId}
                type="button"
                onClick={() => handleSelectSearchResult(result)}
                className="w-full text-left px-4 py-2.5 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 border-b border-slate-100 dark:border-slate-800/60 last:border-0 flex items-start gap-2.5 transition-colors"
              >
                <MapPin className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div className="overflow-hidden">
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {result.name}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">
                    {result.displayName}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {showDropdown && noResults && !isSearching && (
          <div className="absolute z-[9999] top-full left-0 right-0 mt-1 p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl text-center text-xs text-slate-500">
            No matching locations found. Try searching for a city, landmark, or street name.
          </div>
        )}
      </div>

      {/* Map Display */}
      <div
        ref={containerRef}
        className="rounded-2xl overflow-hidden border border-slate-300 dark:border-slate-700 shadow-inner z-0"
        style={{ height }}
      />
      <div className="text-[11px] text-slate-500 flex items-center justify-between px-1">
        <span>Click on the map or drag the pin to position geofence center</span>
        <span className="font-semibold text-emerald-600 dark:text-emerald-400">Green circle = {radiusMeters}m perimeter</span>
      </div>
    </div>
  );
}
