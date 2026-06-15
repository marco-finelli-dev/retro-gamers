-- Retro-Gamers.it reader badge artwork paths.
-- Run this file manually in the Supabase SQL Editor.
-- It updates only the image_path values for the existing badge catalog.

update public.user_badges
set image_path = '/badges/reader/arcade-kid.webp'
where key = 'arcade_kid';

update public.user_badges
set image_path = '/badges/reader/eight-bit-player.webp'
where key = 'eight_bit_player';

update public.user_badges
set image_path = '/badges/reader/sixteen-bit-veteran.webp'
where key = 'sixteen_bit_veteran';

update public.user_badges
set image_path = '/badges/reader/amiga-user.webp'
where key = 'amiga_user';

update public.user_badges
set image_path = '/badges/reader/console-warrior.webp'
where key = 'console_warrior';

update public.user_badges
set image_path = '/badges/reader/point-click-lover.webp'
where key = 'point_click_lover';

update public.user_badges
set image_path = '/badges/reader/jrpg-explorer.webp'
where key = 'jrpg_explorer';

update public.user_badges
set image_path = '/badges/reader/retro-collector.webp'
where key = 'retro_collector';

notify pgrst, 'reload schema';
