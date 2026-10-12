-- Normalized (3NF) schema for the water point dataset.
-- Every lookup hierarchy found in the flat data (type -> group -> class, ward -> LGA -> region, ...)
-- is held in its own table so each fact is stored exactly once.

PRAGMA foreign_keys = ON;

-- Administrative geography -------------------------------------------------

CREATE TABLE regions (
    id   INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE lgas (
    id        INTEGER PRIMARY KEY,
    name      TEXT NOT NULL UNIQUE,
    region_id INTEGER NOT NULL REFERENCES regions (id)
);

-- Ward names repeat across LGAs, so a ward is identified by (lga, name).
CREATE TABLE wards (
    id     INTEGER PRIMARY KEY,
    name   TEXT NOT NULL,
    lga_id INTEGER NOT NULL REFERENCES lgas (id),
    UNIQUE (lga_id, name)
);

-- A NULL name is the "unspecified subvillage" of a ward.
CREATE TABLE subvillages (
    id            INTEGER PRIMARY KEY,
    name          TEXT,
    ward_id       INTEGER NOT NULL REFERENCES wards (id),
    region_code   INTEGER NOT NULL,
    district_code INTEGER NOT NULL
);
CREATE UNIQUE INDEX subvillages_ward_name ON subvillages (ward_id, COALESCE(name, ''));

CREATE TABLE basins (
    id   INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);

-- People and organisations -------------------------------------------------

-- Shared by funders and installers.
CREATE TABLE organizations (
    id   INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE recorders (
    id   INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE schemes (
    id   INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE scheme_management_types (
    id   INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE management_groups (
    id   INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE management_types (
    id                  INTEGER PRIMARY KEY,
    name                TEXT NOT NULL UNIQUE,
    management_group_id INTEGER NOT NULL REFERENCES management_groups (id)
);

-- Payment and payment type are one-to-one, so both are candidate keys of one table.
CREATE TABLE payments (
    id   INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL UNIQUE
);

-- Extraction ---------------------------------------------------------------

CREATE TABLE extraction_type_classes (
    id   INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE extraction_type_groups (
    id       INTEGER PRIMARY KEY,
    name     TEXT NOT NULL UNIQUE,
    class_id INTEGER NOT NULL REFERENCES extraction_type_classes (id)
);

CREATE TABLE extraction_types (
    id       INTEGER PRIMARY KEY,
    name     TEXT NOT NULL UNIQUE,
    group_id INTEGER NOT NULL REFERENCES extraction_type_groups (id)
);

-- Water --------------------------------------------------------------------

CREATE TABLE quality_groups (
    id   INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE water_qualities (
    id               INTEGER PRIMARY KEY,
    name             TEXT NOT NULL UNIQUE,
    quality_group_id INTEGER NOT NULL REFERENCES quality_groups (id)
);

-- quantity_group is identical to quantity in the source data, so it is not stored twice.
CREATE TABLE quantities (
    id   INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE source_classes (
    id   INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE source_types (
    id       INTEGER PRIMARY KEY,
    name     TEXT NOT NULL UNIQUE,
    class_id INTEGER NOT NULL REFERENCES source_classes (id)
);

CREATE TABLE sources (
    id      INTEGER PRIMARY KEY,
    name    TEXT NOT NULL UNIQUE,
    type_id INTEGER NOT NULL REFERENCES source_types (id)
);

CREATE TABLE waterpoint_type_groups (
    id   INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE waterpoint_types (
    id       INTEGER PRIMARY KEY,
    name     TEXT NOT NULL UNIQUE,
    group_id INTEGER NOT NULL REFERENCES waterpoint_type_groups (id)
);

-- Facts --------------------------------------------------------------------

CREATE TABLE water_points (
    id                        INTEGER PRIMARY KEY,
    name                      TEXT NOT NULL,
    date_recorded             TEXT NOT NULL CHECK (date(date_recorded) = date_recorded),
    recorder_id               INTEGER NOT NULL REFERENCES recorders (id),
    amount_tsh                REAL NOT NULL,
    gps_height                INTEGER NOT NULL,
    longitude                 REAL NOT NULL,
    latitude                  REAL NOT NULL,
    num_private               INTEGER NOT NULL,
    basin_id                  INTEGER NOT NULL REFERENCES basins (id),
    subvillage_id             INTEGER NOT NULL REFERENCES subvillages (id),
    population                INTEGER NOT NULL,
    public_meeting            INTEGER CHECK (public_meeting IN (0, 1)),
    funder_id                 INTEGER REFERENCES organizations (id),
    installer_id              INTEGER REFERENCES organizations (id),
    scheme_id                 INTEGER REFERENCES schemes (id),
    scheme_management_type_id INTEGER REFERENCES scheme_management_types (id),
    permit                    INTEGER CHECK (permit IN (0, 1)),
    construction_year         INTEGER NOT NULL,
    extraction_type_id        INTEGER NOT NULL REFERENCES extraction_types (id),
    management_type_id        INTEGER NOT NULL REFERENCES management_types (id),
    payment_id                INTEGER NOT NULL REFERENCES payments (id),
    water_quality_id          INTEGER NOT NULL REFERENCES water_qualities (id),
    quantity_id               INTEGER NOT NULL REFERENCES quantities (id),
    source_id                 INTEGER NOT NULL REFERENCES sources (id),
    waterpoint_type_id        INTEGER NOT NULL REFERENCES waterpoint_types (id)
);

CREATE INDEX water_points_subvillage      ON water_points (subvillage_id);
CREATE INDEX water_points_basin           ON water_points (basin_id);
CREATE INDEX water_points_extraction_type ON water_points (extraction_type_id);
CREATE INDEX water_points_management_type ON water_points (management_type_id);
CREATE INDEX water_points_payment         ON water_points (payment_id);
CREATE INDEX water_points_water_quality   ON water_points (water_quality_id);
CREATE INDEX water_points_quantity        ON water_points (quantity_id);
CREATE INDEX water_points_source          ON water_points (source_id);
CREATE INDEX water_points_waterpoint_type ON water_points (waterpoint_type_id);
CREATE INDEX water_points_funder          ON water_points (funder_id);
CREATE INDEX water_points_installer       ON water_points (installer_id);

-- Rebuilds the original flat record, with the same columns in the same order.
CREATE VIEW water_sources AS
SELECT
    wp.id,
    wp.amount_tsh,
    wp.date_recorded,
    f.name    AS funder,
    wp.gps_height,
    i.name    AS installer,
    wp.longitude,
    wp.latitude,
    wp.name   AS wpt_name,
    wp.num_private,
    b.name    AS basin,
    sv.name   AS subvillage,
    r.name    AS region,
    sv.region_code,
    sv.district_code,
    l.name    AS lga,
    w.name    AS ward,
    wp.population,
    wp.public_meeting,
    rec.name  AS recorded_by,
    smt.name  AS scheme_management,
    sch.name  AS scheme_name,
    wp.permit,
    wp.construction_year,
    et.name   AS extraction_type,
    etg.name  AS extraction_type_group,
    etc.name  AS extraction_type_class,
    mt.name   AS management,
    mg.name   AS management_group,
    p.name    AS payment,
    p.type    AS payment_type,
    wq.name   AS water_quality,
    qg.name   AS quality_group,
    q.name    AS quantity,
    q.name    AS quantity_group,
    s.name    AS source,
    st.name   AS source_type,
    sc.name   AS source_class,
    wt.name   AS waterpoint_type,
    wtg.name  AS waterpoint_type_group
FROM water_points wp
JOIN subvillages sv              ON sv.id  = wp.subvillage_id
JOIN wards w                     ON w.id   = sv.ward_id
JOIN lgas l                      ON l.id   = w.lga_id
JOIN regions r                   ON r.id   = l.region_id
JOIN basins b                    ON b.id   = wp.basin_id
JOIN recorders rec               ON rec.id = wp.recorder_id
LEFT JOIN organizations f        ON f.id   = wp.funder_id
LEFT JOIN organizations i        ON i.id   = wp.installer_id
LEFT JOIN schemes sch            ON sch.id = wp.scheme_id
LEFT JOIN scheme_management_types smt ON smt.id = wp.scheme_management_type_id
JOIN extraction_types et         ON et.id  = wp.extraction_type_id
JOIN extraction_type_groups etg  ON etg.id = et.group_id
JOIN extraction_type_classes etc ON etc.id = etg.class_id
JOIN management_types mt         ON mt.id  = wp.management_type_id
JOIN management_groups mg        ON mg.id  = mt.management_group_id
JOIN payments p                  ON p.id   = wp.payment_id
JOIN water_qualities wq          ON wq.id  = wp.water_quality_id
JOIN quality_groups qg           ON qg.id  = wq.quality_group_id
JOIN quantities q                ON q.id   = wp.quantity_id
JOIN sources s                   ON s.id   = wp.source_id
JOIN source_types st             ON st.id  = s.type_id
JOIN source_classes sc           ON sc.id  = st.class_id
JOIN waterpoint_types wt         ON wt.id  = wp.waterpoint_type_id
JOIN waterpoint_type_groups wtg  ON wtg.id = wt.group_id;
