-- A lot map can carry a satellite photo of the real lot under the drawing:
-- where it is (lat, lng), how it lines up with the map (x, y, scale, rotation)
-- and how strong it shows. Null when the map has no photo.

alter table public.lot_maps add column if not exists backdrop jsonb;
