"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type { Map as LeafletMap } from "leaflet";

/** CVC, at the end of Common Way in Charlotte. */
const CVC: [number, number] = [44.2905, -73.2485];

const VIEWS = {
  // Charlotte, with Lake Champlain to the west.
  street: {
    center: [44.305, -73.27] as [number, number],
    zoom: 11,
    tiles: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
    label: "Street map of Charlotte, Vermont, with CVC marked",
  },
  // The neighborhood and its fields, woods, and garden.
  satellite: {
    center: CVC,
    zoom: 16,
    tiles: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics",
    maxZoom: 18,
    label: "Satellite view of CVC's land",
  },
};

/**
 * A map of where CVC is: a street map, or a satellite view of the land. It
 * doesn't take the scroll wheel (or, on phones, one-finger drags), so the
 * page scrolls past it as usual.
 */
export function LandMap({ view, className = "" }: { view: keyof typeof VIEWS; className?: string }) {
  const container = useRef<HTMLDivElement>(null);
  const { label } = VIEWS[view];

  useEffect(() => {
    let map: LeafletMap | null = null;
    let cancelled = false;
    void import("leaflet").then((L) => {
      if (cancelled || !container.current) return;
      const settings = VIEWS[view];
      map = L.map(container.current, {
        center: settings.center,
        zoom: settings.zoom,
        scrollWheelZoom: false,
        dragging: !L.Browser.mobile,
      });
      L.tileLayer(settings.tiles, { attribution: settings.attribution, maxZoom: settings.maxZoom }).addTo(map);
      const pin = L.divIcon({ className: "", html: '<span class="cvc-map-pin"></span>', iconSize: [20, 20], iconAnchor: [10, 10] });
      const marker = L.marker(CVC, { icon: pin, title: "CVC", keyboard: false }).addTo(map);
      if (view === "street") marker.bindTooltip("CVC", { permanent: true, direction: "right", offset: [10, 0], className: "cvc-map-label" });
    });
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [view]);

  return <div ref={container} role="region" aria-label={label} className={`isolate z-0 overflow-hidden rounded-2xl bg-accent shadow-elev ${className}`} />;
}
