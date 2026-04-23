-- CoolFTC dev seed data
-- Run after: supabase db push

-- Seed season
INSERT INTO public.seasons (year, name) VALUES (2025, 'DECODE') ON CONFLICT DO NOTHING;

-- Seed test event
INSERT INTO public.events (event_key, season_year, name, event_type, city, state_province, country, start_date, end_date)
VALUES ('2025-DECODE-TEST', 2025, 'DECODE Test Event', 'qualifier', 'Houston', 'TX', 'USA', '2025-11-01', '2025-11-02')
ON CONFLICT DO NOTHING;

-- Seed test FTC teams (realistic DECODE-era team numbers)
INSERT INTO public.ftc_teams (team_number, team_name, city, state_province, country, rookie_year) VALUES
  ('30439','Cool Name Pending','Houston','TX','USA',2022),
  ('23901','Voltage Drop','Austin','TX','USA',2020),
  ('12847','Iron Coders','Dallas','TX','USA',2018),
  ('18234','Quantum Bots','San Antonio','TX','USA',2021),
  ('7236','Recharged','Plano','TX','USA',2015),
  ('9947','Circuit Breakers','Frisco','TX','USA',2016),
  ('16547','Steel Magnolias','Houston','TX','USA',2019),
  ('21093','Binary Stars','Austin','TX','USA',2020),
  ('5143','Robo Raiders','Dallas','TX','USA',2014),
  ('19482','Clutch Cargo','The Woodlands','TX','USA',2021),
  ('28341','Flux Capacitors','Richardson','TX','USA',2022),
  ('14726','Peak Performers','Katy','TX','USA',2018),
  ('33012','Apex Robotics','Sugar Land','TX','USA',2023),
  ('11587','Infinite Loop','League City','TX','USA',2017),
  ('26904','Delta Force','Conroe','TX','USA',2021),
  ('8473','Electric Avocado','Pearland','TX','USA',2015),
  ('31205','Vortex Team','Spring','TX','USA',2022),
  ('17831','Solar Wind','Cypress','TX','USA',2019),
  ('24560','Algorithm Aces','Humble','TX','USA',2020),
  ('13789','Mechanical Mind','Pasadena','TX','USA',2017)
ON CONFLICT DO NOTHING;

-- Seed team stats cache for the test event
INSERT INTO public.team_stats_cache (event_key, team_number, season_year, rank, opr, dpr, epa, wins, losses, ties, plays, high_score, ranking_score)
VALUES
  ('2025-DECODE-TEST','23901',2025,1,34.2,18.1,31.5,7,1,0,8,112,56.4),
  ('2025-DECODE-TEST','30439',2025,2,31.8,19.4,28.9,6,2,0,8,98,50.1),
  ('2025-DECODE-TEST','12847',2025,3,29.1,20.2,26.8,6,2,0,8,94,48.7),
  ('2025-DECODE-TEST','7236',2025,4,27.4,21.0,24.3,5,3,0,8,87,44.2),
  ('2025-DECODE-TEST','18234',2025,5,26.8,22.1,23.9,5,3,0,8,84,43.1),
  ('2025-DECODE-TEST','9947',2025,6,25.3,20.8,22.4,5,3,0,8,81,41.8),
  ('2025-DECODE-TEST','16547',2025,7,24.1,21.5,21.0,4,4,0,8,79,38.6),
  ('2025-DECODE-TEST','21093',2025,8,23.7,22.3,20.8,4,4,0,8,77,37.9),
  ('2025-DECODE-TEST','5143',2025,9,22.9,21.9,20.1,4,4,0,8,74,36.4),
  ('2025-DECODE-TEST','19482',2025,10,21.4,23.1,18.9,3,5,0,8,70,33.2),
  ('2025-DECODE-TEST','28341',2025,11,20.8,22.4,18.4,3,5,0,8,68,32.1),
  ('2025-DECODE-TEST','14726',2025,12,19.3,24.0,17.2,3,5,0,8,65,30.9),
  ('2025-DECODE-TEST','33012',2025,13,18.1,23.7,16.0,2,6,0,8,61,28.4),
  ('2025-DECODE-TEST','11587',2025,14,17.4,24.2,15.5,2,6,0,8,58,27.1),
  ('2025-DECODE-TEST','26904',2025,15,16.2,25.1,14.3,2,6,0,8,54,25.8),
  ('2025-DECODE-TEST','8473',2025,16,14.8,26.0,13.1,1,7,0,8,49,23.1),
  ('2025-DECODE-TEST','31205',2025,17,13.4,25.4,12.0,1,7,0,8,46,21.4),
  ('2025-DECODE-TEST','17831',2025,18,12.1,26.8,11.0,1,7,0,8,42,19.7),
  ('2025-DECODE-TEST','24560',2025,19,11.8,27.2,10.6,0,8,0,8,38,18.2),
  ('2025-DECODE-TEST','13789',2025,20,10.4,28.1,9.4,0,8,0,8,34,16.8)
ON CONFLICT (event_key, team_number) DO NOTHING;
