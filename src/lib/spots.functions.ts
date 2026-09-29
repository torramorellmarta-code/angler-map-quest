import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- Spots (public read) ----------

export const getSpots = createServerFn({ method: "GET" }).handler(async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const supabase = createClient(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
  const { data, error } = await supabase
    .from("spots")
    .select("id, name, description, lat, lng, water_type, requirements, fish_species, parent_id")
    .order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
});

// ---------- Weather + pressure via Google Maps Weather API (gateway) ----------

export const getSpotWeather = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ lat: z.number(), lng: z.number() }).parse(data))
  .handler(async ({ data }) => {
    const LOVABLE_API_KEY = process.env["LOVABLE_API_KEY"];
    const GOOGLE_MAPS_API_KEY = process.env["GOOGLE_MAPS_API_KEY"];
    if (!LOVABLE_API_KEY || !GOOGLE_MAPS_API_KEY) {
      throw new Error("Google Maps no está configurado");
    }
    const url = `https://connector-gateway.lovable.dev/google_maps/weather/v1/currentConditions:lookup?location.latitude=${data.lat}&location.longitude=${data.lng}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": GOOGLE_MAPS_API_KEY,
      },
    });
    if (!response.ok) {
      const body = await response.text();
      console.error(`Weather request failed [${response.status}]: ${body}`);
      throw new Error(`No se pudo obtener el tiempo [${response.status}]`);
    }
    const w = await response.json();
    const CARDINALS: Record<string, string> = {
      NORTH: "N", NORTH_NORTHEAST: "NNE", NORTHEAST: "NE", EAST_NORTHEAST: "ENE",
      EAST: "E", EAST_SOUTHEAST: "ESE", SOUTHEAST: "SE", SOUTH_SOUTHEAST: "SSE",
      SOUTH: "S", SOUTH_SOUTHWEST: "SSO", SOUTHWEST: "SO", WEST_SOUTHWEST: "OSO",
      WEST: "O", WEST_NORTHWEST: "ONO", NORTHWEST: "NO", NORTH_NORTHWEST: "NNO",
    };
    const CONDITIONS: Record<string, string> = {
      "Cloudy": "Nublado", "Mostly cloudy": "Muy nuboso", "Partly cloudy": "Parcialmente nublado",
      "Clear": "Despejado", "Mostly clear": "Casi despejado", "Sunny": "Soleado",
      "Rain": "Lluvia", "Light rain": "Lluvia ligera", "Heavy rain": "Lluvia fuerte",
      "Drizzle": "Llovizna", "Thunderstorm": "Tormenta", "Snow": "Nieve",
      "Fog": "Niebla", "Mist": "Neblina", "Windy": "Ventoso", "Overcast": "Cubierto",
    };
    const rawCondition: string | null = w.weatherCondition?.description?.text ?? null;
    return {
      temperature: w.temperature?.degrees ?? null,
      feelsLike: w.feelsLikeTemperature?.degrees ?? null,
      condition: rawCondition ? (CONDITIONS[rawCondition] ?? rawCondition) : null,
      humidity: w.relativeHumidity ?? null,
      windSpeed: w.wind?.speed?.value ?? null,
      windDirection: w.wind?.direction?.cardinal
        ? (CARDINALS[w.wind.direction.cardinal] ?? w.wind.direction.cardinal)
        : null,
      pressure: w.airPressure?.meanSeaLevelMillibars ?? null,
      pressureTrend: w.currentConditionsHistory?.pressureTrend ?? null,
      uvIndex: w.uvIndex ?? null,
      precipitation: w.precipitation?.probability?.percent ?? null,
    };
  });

// ---------- Visited spots (authenticated) ----------

export const getMyVisits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("visited_spots")
      .select("id, spot_id, visited_at, notes, rating")
      .order("visited_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const saveVisit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        spotId: z.string().uuid(),
        notes: z.string().max(1000).optional(),
        rating: z.number().int().min(1).max(5).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("visited_spots").upsert(
      {
        user_id: context.userId,
        spot_id: data.spotId,
        notes: data.notes ?? null,
        rating: data.rating ?? null,
      },
      { onConflict: "user_id,spot_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeVisit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ spotId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("visited_spots")
      .delete()
      .eq("user_id", context.userId)
      .eq("spot_id", data.spotId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
