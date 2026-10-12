-- Populates the normalized tables from the flat `staging` table loaded from source/dummy_data.sql.

INSERT INTO regions (name)
SELECT DISTINCT region FROM staging ORDER BY region;

INSERT INTO lgas (name, region_id)
SELECT DISTINCT s.lga, r.id
FROM staging s JOIN regions r ON r.name = s.region
ORDER BY s.lga;

INSERT INTO wards (name, lga_id)
SELECT DISTINCT s.ward, l.id
FROM staging s JOIN lgas l ON l.name = s.lga
ORDER BY l.id, s.ward;

INSERT INTO subvillages (name, ward_id, region_code, district_code)
SELECT DISTINCT s.subvillage, w.id, s.region_code, s.district_code
FROM staging s
JOIN lgas l  ON l.name = s.lga
JOIN wards w ON w.lga_id = l.id AND w.name = s.ward
ORDER BY w.id, s.subvillage;

INSERT INTO basins (name)
SELECT DISTINCT basin FROM staging ORDER BY basin;

INSERT INTO organizations (name)
SELECT funder FROM staging WHERE funder IS NOT NULL
UNION
SELECT installer FROM staging WHERE installer IS NOT NULL
ORDER BY 1;

INSERT INTO recorders (name)
SELECT DISTINCT recorded_by FROM staging ORDER BY recorded_by;

INSERT INTO schemes (name)
SELECT DISTINCT scheme_name FROM staging WHERE scheme_name IS NOT NULL ORDER BY scheme_name;

INSERT INTO scheme_management_types (name)
SELECT DISTINCT scheme_management FROM staging WHERE scheme_management IS NOT NULL ORDER BY scheme_management;

INSERT INTO management_groups (name)
SELECT DISTINCT management_group FROM staging ORDER BY management_group;

INSERT INTO management_types (name, management_group_id)
SELECT DISTINCT s.management, g.id
FROM staging s JOIN management_groups g ON g.name = s.management_group
ORDER BY s.management;

INSERT INTO payments (name, type)
SELECT DISTINCT payment, payment_type FROM staging ORDER BY payment;

INSERT INTO extraction_type_classes (name)
SELECT DISTINCT extraction_type_class FROM staging ORDER BY extraction_type_class;

INSERT INTO extraction_type_groups (name, class_id)
SELECT DISTINCT s.extraction_type_group, c.id
FROM staging s JOIN extraction_type_classes c ON c.name = s.extraction_type_class
ORDER BY s.extraction_type_group;

INSERT INTO extraction_types (name, group_id)
SELECT DISTINCT s.extraction_type, g.id
FROM staging s JOIN extraction_type_groups g ON g.name = s.extraction_type_group
ORDER BY s.extraction_type;

INSERT INTO quality_groups (name)
SELECT DISTINCT quality_group FROM staging ORDER BY quality_group;

INSERT INTO water_qualities (name, quality_group_id)
SELECT DISTINCT s.water_quality, g.id
FROM staging s JOIN quality_groups g ON g.name = s.quality_group
ORDER BY s.water_quality;

INSERT INTO quantities (name)
SELECT DISTINCT quantity FROM staging ORDER BY quantity;

INSERT INTO source_classes (name)
SELECT DISTINCT source_class FROM staging ORDER BY source_class;

INSERT INTO source_types (name, class_id)
SELECT DISTINCT s.source_type, c.id
FROM staging s JOIN source_classes c ON c.name = s.source_class
ORDER BY s.source_type;

INSERT INTO sources (name, type_id)
SELECT DISTINCT s.source, t.id
FROM staging s JOIN source_types t ON t.name = s.source_type
ORDER BY s.source;

INSERT INTO waterpoint_type_groups (name)
SELECT DISTINCT waterpoint_type_group FROM staging ORDER BY waterpoint_type_group;

INSERT INTO waterpoint_types (name, group_id)
SELECT DISTINCT s.waterpoint_type, g.id
FROM staging s JOIN waterpoint_type_groups g ON g.name = s.waterpoint_type_group
ORDER BY s.waterpoint_type;

INSERT INTO water_points (
    id, name, date_recorded, recorder_id, amount_tsh, gps_height, longitude, latitude,
    num_private, basin_id, subvillage_id, population, public_meeting, funder_id, installer_id,
    scheme_id, scheme_management_type_id, permit, construction_year, extraction_type_id,
    management_type_id, payment_id, water_quality_id, quantity_id, source_id, waterpoint_type_id
)
SELECT
    s.id, s.wpt_name, s.date_recorded, rec.id, s.amount_tsh, s.gps_height, s.longitude, s.latitude,
    s.num_private, b.id, sv.id, s.population, s.public_meeting, f.id, i.id,
    sch.id, smt.id, s.permit, s.construction_year, et.id,
    mt.id, p.id, wq.id, q.id, src.id, wt.id
FROM staging s
JOIN lgas l                ON l.name = s.lga
JOIN wards w               ON w.lga_id = l.id AND w.name = s.ward
JOIN subvillages sv        ON sv.ward_id = w.id AND sv.name IS s.subvillage
JOIN basins b              ON b.name = s.basin
JOIN recorders rec         ON rec.name = s.recorded_by
LEFT JOIN organizations f  ON f.name = s.funder
LEFT JOIN organizations i  ON i.name = s.installer
LEFT JOIN schemes sch      ON sch.name = s.scheme_name
LEFT JOIN scheme_management_types smt ON smt.name = s.scheme_management
JOIN extraction_types et   ON et.name = s.extraction_type
JOIN management_types mt   ON mt.name = s.management
JOIN payments p            ON p.name = s.payment
JOIN water_qualities wq    ON wq.name = s.water_quality
JOIN quantities q          ON q.name = s.quantity
JOIN sources src           ON src.name = s.source
JOIN waterpoint_types wt   ON wt.name = s.waterpoint_type
ORDER BY s.id;
