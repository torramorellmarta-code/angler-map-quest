ALTER TABLE public.spots ADD COLUMN parent_id uuid REFERENCES public.spots(id);
COMMENT ON COLUMN public.spots.parent_id IS 'Si tiene valor, este sitio es un punto de pesca concreto dentro de otro sitio (p. ej. un pantano)';
CREATE INDEX spots_parent_id_idx ON public.spots(parent_id) WHERE parent_id IS NOT NULL;