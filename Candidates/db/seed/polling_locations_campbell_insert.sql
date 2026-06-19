-- Candidates/db/seed/polling_locations_campbell_insert.sql
-- Campbell County 2026 polling locations — 37 precincts, 7 venues.
-- Source: Campbell County GIS VotingInformation MapServer (Precinct Voting Locations layer).
-- https://gis.campbellcountywy.gov/arcgis/rest/services/Campbell_Public/VotingInformation/MapServer/0

INSERT INTO polling_locations
  (county, precinct_code, precinct_name, location_name, address, city, zip, election_year, county_clerk_url)
VALUES
  ('Campbell', '01-01', '01-01', 'CAM-PLEX Wyoming Center', '4101 Maverick Dr, Gillette, WY 82718', 'Gillette', '82718', 2026, 'https://www.campbellcountywy.gov/867/Elections'),
  ('Campbell', '01-02', '01-02', 'CAM-PLEX Wyoming Center', '4101 Maverick Dr, Gillette, WY 82718', 'Gillette', '82718', 2026, 'https://www.campbellcountywy.gov/867/Elections'),
  ('Campbell', '01-03', '01-03', 'CAM-PLEX Wyoming Center', '4101 Maverick Dr, Gillette, WY 82718', 'Gillette', '82718', 2026, 'https://www.campbellcountywy.gov/867/Elections'),
  ('Campbell', '01-05', '01-05', 'CAM-PLEX Wyoming Center', '4101 Maverick Dr, Gillette, WY 82718', 'Gillette', '82718', 2026, 'https://www.campbellcountywy.gov/867/Elections'),
  ('Campbell', '01-07', '01-07', 'CAM-PLEX Wyoming Center', '4101 Maverick Dr, Gillette, WY 82718', 'Gillette', '82718', 2026, 'https://www.campbellcountywy.gov/867/Elections'),
  ('Campbell', '01-09', '01-09', 'CAM-PLEX Wyoming Center', '4101 Maverick Dr, Gillette, WY 82718', 'Gillette', '82718', 2026, 'https://www.campbellcountywy.gov/867/Elections'),
  ('Campbell', '01-12', '01-12', 'CAM-PLEX Wyoming Center', '4101 Maverick Dr, Gillette, WY 82718', 'Gillette', '82718', 2026, 'https://www.campbellcountywy.gov/867/Elections'),
  ('Campbell', '01-14', '01-14', 'CAM-PLEX Wyoming Center', '4101 Maverick Dr, Gillette, WY 82718', 'Gillette', '82718', 2026, 'https://www.campbellcountywy.gov/867/Elections'),
  ('Campbell', '01-15', '01-15', 'CAM-PLEX Wyoming Center', '4101 Maverick Dr, Gillette, WY 82718', 'Gillette', '82718', 2026, 'https://www.campbellcountywy.gov/867/Elections'),
  ('Campbell', '01-16', '01-16', 'CAM-PLEX Wyoming Center', '4101 Maverick Dr, Gillette, WY 82718', 'Gillette', '82718', 2026, 'https://www.campbellcountywy.gov/867/Elections'),
  ('Campbell', '01-17', '01-17', 'CAM-PLEX Wyoming Center', '4101 Maverick Dr, Gillette, WY 82718', 'Gillette', '82718', 2026, 'https://www.campbellcountywy.gov/867/Elections'),
  ('Campbell', '01-18', '01-18', 'CAM-PLEX Wyoming Center', '4101 Maverick Dr, Gillette, WY 82718', 'Gillette', '82718', 2026, 'https://www.campbellcountywy.gov/867/Elections'),
  ('Campbell', '01-19', '01-19', 'CAM-PLEX Wyoming Center', '4101 Maverick Dr, Gillette, WY 82718', 'Gillette', '82718', 2026, 'https://www.campbellcountywy.gov/867/Elections'),
  ('Campbell', '01-20', '01-20', 'CAM-PLEX Wyoming Center', '4101 Maverick Dr, Gillette, WY 82718', 'Gillette', '82718', 2026, 'https://www.campbellcountywy.gov/867/Elections'),
  ('Campbell', '01-21', '01-21', 'CAM-PLEX Wyoming Center', '4101 Maverick Dr, Gillette, WY 82718', 'Gillette', '82718', 2026, 'https://www.campbellcountywy.gov/867/Elections'),
  ('Campbell', '01-22', '01-22', 'CAM-PLEX Wyoming Center', '4101 Maverick Dr, Gillette, WY 82718', 'Gillette', '82718', 2026, 'https://www.campbellcountywy.gov/867/Elections'),
  ('Campbell', '01-23', '01-23', 'CAM-PLEX Wyoming Center', '4101 Maverick Dr, Gillette, WY 82718', 'Gillette', '82718', 2026, 'https://www.campbellcountywy.gov/867/Elections'),
  ('Campbell', '01-24', '01-24', 'CAM-PLEX Wyoming Center', '4101 Maverick Dr, Gillette, WY 82718', 'Gillette', '82718', 2026, 'https://www.campbellcountywy.gov/867/Elections'),
  ('Campbell', '01-25', '01-25', 'CAM-PLEX Wyoming Center', '4101 Maverick Dr, Gillette, WY 82718', 'Gillette', '82718', 2026, 'https://www.campbellcountywy.gov/867/Elections'),
  ('Campbell', '01-26', '01-26', 'CAM-PLEX Wyoming Center', '4101 Maverick Dr, Gillette, WY 82718', 'Gillette', '82718', 2026, 'https://www.campbellcountywy.gov/867/Elections'),
  ('Campbell', '01-27', '01-27', 'CAM-PLEX Wyoming Center', '4101 Maverick Dr, Gillette, WY 82718', 'Gillette', '82718', 2026, 'https://www.campbellcountywy.gov/867/Elections'),
  ('Campbell', '02-01', '02-01', 'CAM-PLEX Wyoming Center', '4101 Maverick Dr, Gillette, WY 82718', 'Gillette', '82718', 2026, 'https://www.campbellcountywy.gov/867/Elections'),
  ('Campbell', '03-01', '03-01', 'CAM-PLEX Wyoming Center', '4101 Maverick Dr, Gillette, WY 82718', 'Gillette', '82718', 2026, 'https://www.campbellcountywy.gov/867/Elections'),
  ('Campbell', '04-01', '04-01', 'Rozet School', '14054 Hwy 51, Rozet, WY 82727', 'Rozet', '82727', 2026, 'https://www.campbellcountywy.gov/867/Elections'),
  ('Campbell', '06-01', '06-01', 'Rawhide School', '200 Prospector Pkwy, Gillette, WY 82716', 'Gillette', '82716', 2026, 'https://www.campbellcountywy.gov/867/Elections'),
  ('Campbell', '07-01', '07-01', 'Recluse Community Hall', '110 Greenough Rd, Recluse, WY 82725', 'Recluse', '82725', 2026, 'https://www.campbellcountywy.gov/867/Elections'),
  ('Campbell', '08-01', '08-01', 'Little Powder School', '15902 Hwy 59, Weston, WY 82731', 'Weston', '82731', 2026, 'https://www.campbellcountywy.gov/867/Elections'),
  ('Campbell', '09-01', '09-01', 'CAM-PLEX Wyoming Center', '4101 Maverick Dr, Gillette, WY 82718', 'Gillette', '82718', 2026, 'https://www.campbellcountywy.gov/867/Elections'),
  ('Campbell', '13-01', '13-01', '4-J School', '2830 Hwy 50, Gillette, WY 82718', 'Gillette', '82718', 2026, 'https://www.campbellcountywy.gov/867/Elections'),
  ('Campbell', '14-01', '14-01', 'Wright Town Hall', '395 Lariat Way, Wright, WY 82732', 'Wright', '82732', 2026, 'https://www.campbellcountywy.gov/867/Elections'),
  ('Campbell', '14-02', '14-02', 'Wright Town Hall', '395 Lariat Way, Wright, WY 82732', 'Wright', '82732', 2026, 'https://www.campbellcountywy.gov/867/Elections'),
  ('Campbell', '18-01', '18-01', 'CAM-PLEX Wyoming Center', '4101 Maverick Dr, Gillette, WY 82718', 'Gillette', '82718', 2026, 'https://www.campbellcountywy.gov/867/Elections'),
  ('Campbell', '19-01', '19-01', 'CAM-PLEX Wyoming Center', '4101 Maverick Dr, Gillette, WY 82718', 'Gillette', '82718', 2026, 'https://www.campbellcountywy.gov/867/Elections'),
  ('Campbell', '22-01', '22-01', 'CAM-PLEX Wyoming Center', '4101 Maverick Dr, Gillette, WY 82718', 'Gillette', '82718', 2026, 'https://www.campbellcountywy.gov/867/Elections'),
  ('Campbell', '23-01', '23-01', 'CAM-PLEX Wyoming Center', '4101 Maverick Dr, Gillette, WY 82718', 'Gillette', '82718', 2026, 'https://www.campbellcountywy.gov/867/Elections'),
  ('Campbell', '24-01', '24-01', 'CAM-PLEX Wyoming Center', '4101 Maverick Dr, Gillette, WY 82718', 'Gillette', '82718', 2026, 'https://www.campbellcountywy.gov/867/Elections'),
  ('Campbell', '26-01', '26-01', 'CAM-PLEX Wyoming Center', '4101 Maverick Dr, Gillette, WY 82718', 'Gillette', '82718', 2026, 'https://www.campbellcountywy.gov/867/Elections');