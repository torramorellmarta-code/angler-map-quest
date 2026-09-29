import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useGoogleMaps } from "@/lib/use-google-maps";
import {
  getSpots,
  getSpotWeather,
  getMyVisits,
  saveVisit,
  removeVisit,
} from "@/lib/spots.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Caladero — Mapa de sitios de pesca" },
      {
        name: "description",
        content:
          "Explora en el mapa los mejores sitios para pescar: requisitos, peces de la zona, tiempo y presión atmosférica. Guarda los lugares que ya has visitado.",
      },
      { property: "og:title", content: "Caladero — Mapa de sitios de pesca" },
      {
        property: "og:description",
        content:
          "Explora spots de pesca con peces, requisitos y tiempo en directo. Guarda tus caladeros visitados.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MapPage,
});

type Spot = {
  id: string;
  name: string;
  description: string | null;
  lat: number;
  lng: number;
  water_type: string;
  requirements: string | null;
  fish_species: string[];
  parent_id: string | null;
};

const WATER_LABEL: Record<string, string> = {
  rio: "Río",
  embalse: "Embalse",
  mar: "Mar",
  lago: "Lago",
};

function MapPage() {
  const { ready, error: mapsError } = useGoogleMaps();
  const queryClient = useQueryClient();
  const fetchSpots = useServerFn(getSpots);
  const fetchVisits = useServerFn(getMyVisits);
  const fetchWeather = useServerFn(getSpotWeather);
  const doSaveVisit = useServerFn(saveVisit);
  const doRemoveVisit = useServerFn(removeVisit);

  const [user, setUser] = useState<any>(null);
  const [selected, setSelected] = useState<Spot | null>(null);
  const [notes, setNotes] = useState("");
  const [rating, setRating] = useState(0);
  const [showVisitedOnly, setShowVisitedOnly] = useState(false);

  const mapRef = useRef<HTMLDivElement>(null);
  const mapObj = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null));
    return () => subscription.unsubscribe();
  }, []);

  const { data: spots = [] } = useQuery({
    queryKey: ["spots"],
    queryFn: () => fetchSpots(),
  });

  const { data: visits = [] } = useQuery({
    queryKey: ["visits"],
    queryFn: () => fetchVisits(),
    enabled: !!user,
  });

  const visitedIds = useMemo(() => new Set(visits.map((v: any) => v.spot_id)), [visits]);

  const { data: weather, isFetching: weatherLoading } = useQuery({
    queryKey: ["weather", selected?.id],
    queryFn: () => fetchWeather({ data: { lat: selected!.lat, lng: selected!.lng } }),
    enabled: !!selected,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      doSaveVisit({
        data: { spotId: selected!.id, notes: notes || undefined, rating: rating || undefined },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["visits"] }),
  });

  const removeMutation = useMutation({
    mutationFn: () => doRemoveVisit({ data: { spotId: selected!.id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["visits"] }),
  });

  const visibleSpots = useMemo(
    () =>
      (showVisitedOnly ? spots.filter((s: Spot) => visitedIds.has(s.id)) : spots).filter(
        (s: Spot) => !s.parent_id,
      ),
    [spots, showVisitedOnly, visitedIds],
  );

  // Puntos de pesca dentro del sitio seleccionado (p. ej. dentro de un pantano)
  const childSpots = useMemo(() => {
    if (!selected) return [];
    const parentId = selected.parent_id ?? selected.id;
    return spots.filter((s: Spot) => s.parent_id === parentId);
  }, [spots, selected]);

  const selectSpot = (spot: Spot, zoomIn = true) => {
    setSelected(spot);
    setNotes("");
    setRating(0);
    if (!mapObj.current) return;
    mapObj.current.panTo({ lat: spot.lat, lng: spot.lng });
    if (zoomIn && !spot.parent_id && spots.some((s: Spot) => s.parent_id === spot.id)) {
      mapObj.current.setZoom(12);
    }
  };

  // Init map
  useEffect(() => {
    if (!ready || !mapRef.current || mapObj.current) return;
    mapObj.current = new window.google.maps.Map(mapRef.current, {
      center: { lat: 41.7, lng: 1.6 },
      zoom: 8,
      clickableIcons: false,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      styles: [
        { featureType: "poi", stylers: [{ visibility: "off" }] },
        { elementType: "geometry", stylers: [{ color: "#1d2b33" }] },
        { elementType: "labels.text.fill", stylers: [{ color: "#9db4bd" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#16222a" }] },
        { featureType: "water", elementType: "geometry", stylers: [{ color: "#2f6f8f" }] },
        { featureType: "road", elementType: "geometry", stylers: [{ color: "#2a3d47" }] },
        { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#22323b" }] },
      ],
    });
  }, [ready]);

  // Markers
  useEffect(() => {
    if (!mapObj.current || !window.google) return;
    markersRef.current.forEach((m) => m.setMap(null));
    const mainMarkers = visibleSpots.map((spot: Spot) => {
      const visited = visitedIds.has(spot.id);
      const marker = new window.google.maps.Marker({
        position: { lat: spot.lat, lng: spot.lng },
        map: mapObj.current,
        title: spot.name,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: visited ? "#e8c96a" : "#5fd3bc",
          fillOpacity: 1,
          strokeColor: "#0f1a20",
          strokeWeight: 2,
        },
      });
      marker.addListener("click", () => selectSpot(spot));
      return marker;
    });
    // Puntos de pesca dentro del sitio seleccionado
    const childMarkers = childSpots.map((spot: Spot) => {
      const marker = new window.google.maps.Marker({
        position: { lat: spot.lat, lng: spot.lng },
        map: mapObj.current,
        title: spot.name,
        zIndex: 10,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 7,
          fillColor: selected?.id === spot.id ? "#e8c96a" : "#f0875a",
          fillOpacity: 1,
          strokeColor: "#0f1a20",
          strokeWeight: 2,
        },
      });
      marker.addListener("click", () => selectSpot(spot, false));
      return marker;
    });
    markersRef.current = [...mainMarkers, ...childMarkers];
  }, [visibleSpots, visitedIds, childSpots, selected?.id]);

  const selectedVisit = selected ? visits.find((v: any) => v.spot_id === selected.id) : null;

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <header className="z-10 flex items-center justify-between border-b border-border bg-card px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🎣</span>
          <div>
            <h1 className="font-display text-xl font-semibold leading-none text-foreground">
              Caladero
            </h1>
            <p className="text-xs text-muted-foreground">Tu mapa de pesca</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowVisitedOnly(!showVisitedOnly)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              showVisitedOnly
                ? "bg-accent text-accent-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            {showVisitedOnly ? "★ Mis visitados" : "Ver visitados"}
          </button>
          {user ? (
            <button
              onClick={() => supabase.auth.signOut()}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary"
            >
              Salir
            </button>
          ) : (
            <Link
              to="/auth"
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Entrar
            </Link>
          )}
        </div>
      </header>

      <div className="relative flex flex-1 overflow-hidden">
        {/* Map */}
        <div className="relative flex-1">
          {mapsError ? (
            <div className="flex h-full items-center justify-center text-sm text-destructive">
              {mapsError}
            </div>
          ) : (
            <div ref={mapRef} className="h-full w-full" />
          )}

          {/* Spot list overlay (mobile: bottom chips, desktop: left list) */}
          <div className="absolute left-3 top-3 hidden max-h-[calc(100%-1.5rem)] w-72 flex-col gap-2 overflow-y-auto md:flex">
            {visibleSpots.map((spot: Spot) => (
              <button
                key={spot.id}
                onClick={() => {
                  setSelected(spot);
                  setNotes(selectedVisit?.notes ?? "");
                  setRating(selectedVisit?.rating ?? 0);
                  mapObj.current?.panTo({ lat: spot.lat, lng: spot.lng });
                }}
                className={`panel-glass rounded-xl p-3 text-left transition-all hover:scale-[1.02] ${
                  selected?.id === spot.id ? "ring-2 ring-primary" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display text-sm font-semibold text-foreground">
                    {spot.name}
                  </span>
                  {visitedIds.has(spot.id) && <span className="text-accent">★</span>}
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full bg-secondary px-2 py-0.5">
                    {WATER_LABEL[spot.water_type] ?? spot.water_type}
                  </span>
                  <span>{spot.fish_species.slice(0, 2).join(" · ")}</span>
                </div>
              </button>
            ))}
          </div>

          {/* Mobile: hint + horizontal spot chips */}
          {!selected && (
            <div className="absolute inset-x-0 bottom-0 z-10 space-y-2 p-3 md:hidden">
              <p className="panel-glass mx-auto w-fit rounded-full px-3 py-1 text-xs text-foreground">
                Toca un sitio para ver el tiempo 🌤️
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {visibleSpots.map((spot: Spot) => (
                  <button
                    key={spot.id}
                    onClick={() => {
                      setSelected(spot);
                      mapObj.current?.panTo({ lat: spot.lat, lng: spot.lng });
                    }}
                    className="panel-glass shrink-0 rounded-xl px-3 py-2 text-left"
                  >
                    <div className="whitespace-nowrap text-sm font-semibold text-foreground">
                      {spot.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {WATER_LABEL[spot.water_type] ?? spot.water_type}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <aside className="absolute inset-x-0 bottom-0 z-20 max-h-[70%] overflow-y-auto rounded-t-2xl border-t border-border bg-card p-5 shadow-2xl md:static md:h-full md:max-h-none md:w-96 md:rounded-none md:border-l md:border-t-0">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl font-semibold text-foreground">
                  {selected.name}
                </h2>
                <span className="mt-1 inline-block rounded-full bg-secondary px-2.5 py-0.5 text-xs text-secondary-foreground">
                  {WATER_LABEL[selected.water_type] ?? selected.water_type}
                </span>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>


            {/* Weather */}
            <section className="mt-4 rounded-xl bg-secondary/60 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Tiempo ahora
              </h3>
              {weatherLoading ? (
                <p className="mt-2 text-sm text-muted-foreground">Consultando el cielo…</p>
              ) : weather ? (
                <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-2xl font-semibold text-foreground">
                      {weather.temperature != null ? `${Math.round(weather.temperature)}°` : "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">{weather.condition ?? ""}</div>
                  </div>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <div>
                      Presión:{" "}
                      <span className="font-medium text-foreground">
                        {weather.pressure != null ? `${Math.round(weather.pressure)} hPa` : "—"}
                      </span>
                    </div>
                    <div>
                      Viento:{" "}
                      <span className="font-medium text-foreground">
                        {weather.windSpeed != null
                          ? `${Math.round(weather.windSpeed)} km/h ${weather.windDirection ?? ""}`
                          : "—"}
                      </span>
                    </div>
                    <div>
                      Lluvia:{" "}
                      <span className="font-medium text-foreground">
                        {weather.precipitation != null ? `${weather.precipitation}%` : "—"}
                      </span>
                    </div>
                    <div>
                      Humedad:{" "}
                      <span className="font-medium text-foreground">
                        {weather.humidity != null ? `${weather.humidity}%` : "—"}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">Tiempo no disponible</p>
              )}
            </section>

            {selected.description && (
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {selected.description}
              </p>
            )}


            {/* Fish */}
            <section className="mt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Peces de la zona
              </h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {selected.fish_species.map((f) => (
                  <span
                    key={f}
                    className="rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
                  >
                    🐟 {f}
                  </span>
                ))}
              </div>
            </section>

            {/* Requirements */}
            {selected.requirements && (
              <section className="mt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Qué necesitas
                </h3>
                <p className="mt-2 rounded-xl border border-border bg-background/50 p-3 text-sm leading-relaxed text-foreground">
                  {selected.requirements}
                </p>
              </section>
            )}

            {/* Visit tracking */}
            <section className="mt-5 border-t border-border pt-4">
              {user ? (
                selectedVisit ? (
                  <div>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-accent">
                        ★ Visitado el {selectedVisit.visited_at}
                      </p>
                      <button
                        onClick={() => removeMutation.mutate()}
                        className="text-xs text-muted-foreground underline-offset-2 hover:text-destructive hover:underline"
                      >
                        Quitar
                      </button>
                    </div>
                    {selectedVisit.notes && (
                      <p className="mt-2 text-sm italic text-muted-foreground">
                        “{selectedVisit.notes}”
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-foreground">
                      ¿Has pescado aquí? Guárdalo
                    </h3>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((r) => (
                        <button
                          key={r}
                          onClick={() => setRating(r)}
                          className={`text-xl transition-transform hover:scale-110 ${
                            r <= rating ? "text-accent" : "text-muted"
                          }`}
                          aria-label={`${r} estrellas`}
                        >
                          ★
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Notas: cebo usado, capturas, mejor hora…"
                      rows={2}
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <button
                      onClick={() => saveMutation.mutate()}
                      disabled={saveMutation.isPending}
                      className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                    >
                      {saveMutation.isPending ? "Guardando…" : "Marcar como visitado"}
                    </button>
                  </div>
                )
              ) : (
                <div className="rounded-xl border border-dashed border-border p-4 text-center">
                  <p className="text-sm text-muted-foreground">
                    Entra para guardar este lugar en tu diario de pesca
                  </p>
                  <Link
                    to="/auth"
                    className="mt-3 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                  >
                    Entrar / Crear cuenta
                  </Link>
                </div>
              )}
            </section>
          </aside>
        )}
      </div>
    </div>
  );
}
