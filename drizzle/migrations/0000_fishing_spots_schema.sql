CREATE TABLE public.spots (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  lat double precision not null,
  lng double precision not null,
  water_type text not null default 'rio',
  requirements text,
  fish_species text[] not null default '{}',
  created_at timestamptz not null default now()
);
GRANT SELECT ON public.spots TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.spots TO authenticated;
GRANT ALL ON public.spots TO service_role;
ALTER TABLE public.spots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Spots are public" ON public.spots FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Authenticated users can add spots" ON public.spots FOR INSERT TO authenticated WITH CHECK (true);

CREATE TABLE public.visited_spots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  spot_id uuid not null references public.spots(id) on delete cascade,
  visited_at date not null default current_date,
  notes text,
  rating int,
  created_at timestamptz not null default now(),
  unique (user_id, spot_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.visited_spots TO authenticated;
GRANT ALL ON public.visited_spots TO service_role;
ALTER TABLE public.visited_spots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own visits" ON public.visited_spots FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users add own visits" ON public.visited_spots FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own visits" ON public.visited_spots FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own visits" ON public.visited_spots FOR DELETE TO authenticated USING (auth.uid() = user_id);

INSERT INTO public.spots (name, description, lat, lng, water_type, requirements, fish_species) VALUES
('Embalse de Santillana', 'Embalse amplio cerca de Manzanares el Real, muy popular para pesca de black bass y lucio desde orilla y embarcación.', 40.7275, -3.8876, 'embalse', 'Licencia de pesca de la Comunidad de Madrid. Permiso especial de navegación si se usa embarcación. Cebo vivo prohibido.', ARRAY['Black bass','Lucio','Carpa','Barbo']),
('Río Jarama - Mejorada del Campo', 'Tramo de río tranquilo con buenas zonas de barbo y carpa, acceso fácil desde el aparcamiento del parque regional.', 40.3989, -3.4817, 'rio', 'Licencia de pesca Comunidad de Madrid. Tramo de pesca libre, respetar vedas de trucha en temporada.', ARRAY['Barbo','Carpa común','Trucha común']),
('Embalse de Valmayor', 'Segundo embalse en capacidad de Madrid, aguas limpias rodeadas de pinar. Buen spot de lucio y black bass.', 40.5328, -4.0378, 'embalse', 'Licencia de pesca Comunidad de Madrid. Zona de especial protección: consultar zonas restringidas.', ARRAY['Lucio','Black bass','Carpa','Perca sol']),
('Río Tajo - Aranjuez', 'Tramo histórico del Tajo con abundante vegetación de ribera. Excelente para carpa y barbo de gran tamaño.', 40.0311, -3.6027, 'rio', 'Licencia de pesca Comunidad de Madrid. Pesca libre todo el año salvo veda de especies autóctonas.', ARRAY['Carpa común','Barbo','Lucio','Black bass']),
('Embalse de Picadas', 'Embalse tranquilo en la sierra oeste madrileña, ideal para pesca de carpa y barbo en jornadas relajadas.', 40.3742, -4.3078, 'embalse', 'Licencia de pesca Comunidad de Madrid. Acceso a pie desde la presa; no se permite baño ni embarcación a motor.', ARRAY['Carpa','Barbo','Trucha arcoíris']),
('Pantano de San Juan', 'La playa de Madrid. Pesca deportiva permitida en zonas señalizadas, muy buen black bass.', 40.3817, -4.2458, 'embalse', 'Licencia de pesca Comunidad de Madrid. Solo zonas habilitadas; alta afluencia de bañistas en verano.', ARRAY['Black bass','Lucio','Perca sol','Carpa']);
