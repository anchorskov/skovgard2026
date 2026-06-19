-- Candidates/db/seed/polling_locations_park_names_patch.sql
-- Park County official name and address corrections — verified 2026-06-19.
-- Source: Park County official 2026 polling place list.
-- Clark: Community Center → Clark Pioneer Recreation Center
UPDATE polling_locations
  SET location_name = 'Clark Pioneer Recreation Center',
      address       = '321 Road 1AB, Clark, WY 82435',
      zip           = '82435'
  WHERE county = 'Park' AND location_name = 'Clark Community Center';

-- Cody Rec Center: official name is Cody Recreation Center (address unchanged)
UPDATE polling_locations
  SET location_name = 'Cody Recreation Center'
  WHERE county = 'Park' AND location_name = 'Cody Rec Center';

-- Wapiti School: official name is Wapiti Elementary School; minor road name fix
UPDATE polling_locations
  SET location_name = 'Wapiti Elementary School',
      address       = '3167 North Fork Hwy, Cody, WY 82414'
  WHERE county = 'Park' AND location_name = 'Wapiti School';

-- Meeteetse: add verified street address
UPDATE polling_locations
  SET address = '1608 Kentucky Ave, Meeteetse, WY 82433'
  WHERE county = 'Park' AND location_name = 'Meeteetse Rec Center';

-- Park County Fairgrounds: official name + verified street address
UPDATE polling_locations
  SET location_name = 'Park County Fairgrounds - Heart Mountain Hall',
      address       = '655 E 5th St, Powell, WY 82435'
  WHERE county = 'Park' AND location_name = 'Park County Fairgrounds';

-- Heart Mountain: official name is Heart Mountain Clubhouse; correct address
UPDATE polling_locations
  SET location_name = 'Heart Mountain Clubhouse',
      address       = '1001 Road 18, Powell, WY 82435'
  WHERE county = 'Park' AND location_name = 'Heart Mountain Club House';

-- Garland precincts (6-1-1, 6-1-2): 2026 list moves these to Fairgrounds
UPDATE polling_locations
  SET location_name = 'Park County Fairgrounds - Heart Mountain Hall',
      address       = '655 E 5th St, Powell, WY 82435',
      zip           = '82435'
  WHERE county = 'Park' AND location_name = 'Garland Community Center';

-- Willwood precincts (10-2, 23-1): 2026 list moves these to Fairgrounds
UPDATE polling_locations
  SET location_name = 'Park County Fairgrounds - Heart Mountain Hall',
      address       = '655 E 5th St, Powell, WY 82435',
      zip           = '82435'
  WHERE county = 'Park' AND location_name = 'Willwood Community Center';
