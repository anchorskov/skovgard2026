-- Correct street addresses for Park County polling locations verified by user.
-- Wapiti School uses Cody WY 82414 mailing (North Fork Hwy), not 82450.
-- Willwood Community Center mailing address is Powell WY 82435.
UPDATE polling_locations SET address = '1240 Beck Ave, Cody, WY 82414'
  WHERE county = 'Park' AND location_name = 'Cody Auditorium';

UPDATE polling_locations SET address = '3 Road 6NQ, Cody, WY 82414'
  WHERE county = 'Park' AND location_name = 'South Fork Fire Hall';

UPDATE polling_locations SET address = '3167 N Fork Hwy, Cody, WY 82414', zip = '82414'
  WHERE county = 'Park' AND location_name = 'Wapiti School';

UPDATE polling_locations SET address = '900 Sheridan Ave, Garland, WY 82435', zip = '82435'
  WHERE county = 'Park' AND location_name = 'Garland Community Center';

UPDATE polling_locations SET address = '1306 Road 9, Powell, WY 82435'
  WHERE county = 'Park' AND location_name = 'Willwood Community Center';
