const db = require('./db');

const PAGE_SIZE = 25;

const JOINS = `
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
JOIN waterpoint_type_groups wtg  ON wtg.id = wt.group_id`;

const lookup = (table) => db.prepare(`SELECT id, name FROM ${table} ORDER BY name`);

const FILTERS = [
  { key: 'region', label: 'Region', column: 'r.id', options: lookup('regions') },
  {
    key: 'lga',
    label: 'LGA',
    column: 'l.id',
    options: db.prepare('SELECT id, name FROM lgas WHERE (@region IS NULL OR region_id = @region) ORDER BY name'),
  },
  { key: 'basin', label: 'Basin', column: 'b.id', options: lookup('basins') },
  { key: 'waterpoint', label: 'Water point type', column: 'wtg.id', options: lookup('waterpoint_type_groups') },
  { key: 'extraction', label: 'Extraction class', column: 'etc.id', options: lookup('extraction_type_classes') },
  { key: 'source', label: 'Source class', column: 'sc.id', options: lookup('source_classes') },
  { key: 'quantity', label: 'Quantity', column: 'q.id', options: lookup('quantities') },
  { key: 'quality', label: 'Water quality', column: 'qg.id', options: lookup('quality_groups') },
  { key: 'payment', label: 'Payment', column: 'p.id', options: lookup('payments') },
  { key: 'management', label: 'Management', column: 'mg.id', options: lookup('management_groups') },
];

const SORTS = {
  id: 'wp.id',
  name: 'wp.name COLLATE NOCASE',
  region: 'r.name, l.name, w.name',
  recorded: 'wp.date_recorded',
  population: 'wp.population',
  year: 'wp.construction_year',
};

const toId = (value) => (/^[1-9]\d*$/.test(value ?? '') ? Number(value) : null);

function parseQuery(query) {
  const filters = Object.fromEntries(FILTERS.map(({ key }) => [key, toId(query[key])]));
  const sort = Object.hasOwn(SORTS, query.sort) ? query.sort : 'id';
  const dir = query.dir === 'desc' ? 'desc' : 'asc';
  const page = toId(query.page) ?? 1;
  const q = typeof query.q === 'string' ? query.q.trim().slice(0, 100) : '';
  return { filters, sort, dir, page, q };
}

function buildWhere({ filters, q }) {
  const clauses = [];
  const params = {};
  for (const { key, column } of FILTERS) {
    if (filters[key] !== null) {
      clauses.push(`${column} = @${key}`);
      params[key] = filters[key];
    }
  }
  if (q) {
    clauses.push(`(wp.name LIKE @q ESCAPE '\\' OR sv.name LIKE @q ESCAPE '\\'
      OR w.name LIKE @q ESCAPE '\\' OR l.name LIKE @q ESCAPE '\\')`);
    params.q = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
  }
  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

function listWaterPoints(query) {
  const state = parseQuery(query);
  const { where, params } = buildWhere(state);

  const stats = db
    .prepare(
      `SELECT COUNT(*) AS points,
              COALESCE(SUM(wp.population), 0) AS population,
              COUNT(DISTINCT r.id) AS regions,
              COUNT(DISTINCT w.id) AS wards,
              MIN(NULLIF(wp.construction_year, 0)) AS oldest,
              MAX(wp.date_recorded) AS latestRecord
       ${JOINS} ${where}`,
    )
    .get(params);

  const quantities = db
    .prepare(`SELECT q.name, COUNT(*) AS points ${JOINS} ${where} GROUP BY q.id ORDER BY points DESC`)
    .all(params);

  const pages = Math.max(1, Math.ceil(stats.points / PAGE_SIZE));
  const page = Math.min(state.page, pages);

  const rows = db
    .prepare(
      `SELECT wp.id, wp.name, r.name AS region, l.name AS lga, w.name AS ward, sv.name AS subvillage,
              wt.name AS waterpointType, et.name AS extractionType, q.name AS quantity,
              wq.name AS waterQuality, wp.population, wp.construction_year AS constructionYear,
              wp.date_recorded AS dateRecorded
       ${JOINS} ${where}
       ORDER BY ${SORTS[state.sort]} ${state.dir}, wp.id
       LIMIT @limit OFFSET @offset`,
    )
    .all({ ...params, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });

  const filters = FILTERS.map(({ key, label, options }) => ({
    key,
    label,
    value: state.filters[key],
    options: key === 'lga' ? options.all({ region: state.filters.region }) : options.all(),
  }));

  return { ...state, page, pages, rows, stats, quantities, filters };
}

const detailQuery = db.prepare(
  `SELECT wp.*, sv.name AS subvillage, sv.region_code, sv.district_code,
          w.id AS ward_id, w.name AS ward, l.id AS lga_id, l.name AS lga, r.id AS region_id, r.name AS region,
          b.name AS basin, rec.name AS recorded_by, f.name AS funder, i.name AS installer,
          sch.name AS scheme_name, smt.name AS scheme_management,
          et.name AS extraction_type, etg.name AS extraction_type_group, etc.name AS extraction_type_class,
          mt.name AS management, mg.name AS management_group, p.name AS payment, p.type AS payment_type,
          wq.name AS water_quality, qg.name AS quality_group, q.name AS quantity,
          s.name AS source, st.name AS source_type, sc.name AS source_class,
          wt.name AS waterpoint_type, wtg.name AS waterpoint_type_group
   ${JOINS}
   WHERE wp.id = ?`,
);

const neighboursQuery = db.prepare(
  `SELECT wp.id, wp.name, sv.name AS subvillage, wt.name AS waterpointType
   FROM water_points wp
   JOIN subvillages sv     ON sv.id = wp.subvillage_id
   JOIN waterpoint_types wt ON wt.id = wp.waterpoint_type_id
   WHERE sv.ward_id = ? AND wp.id <> ?
   ORDER BY wp.name COLLATE NOCASE
   LIMIT 10`,
);

function getWaterPoint(id) {
  const point = detailQuery.get(id);
  if (!point) return null;
  return { point, neighbours: neighboursQuery.all(point.ward_id, id) };
}

const REFERENCE_SECTIONS = [
  {
    title: 'Extraction types',
    columns: ['Class', 'Group', 'Type'],
    sql: `SELECT c.name, g.name, t.name, COUNT(wp.id)
          FROM extraction_types t
          JOIN extraction_type_groups g ON g.id = t.group_id
          JOIN extraction_type_classes c ON c.id = g.class_id
          LEFT JOIN water_points wp ON wp.extraction_type_id = t.id
          GROUP BY t.id ORDER BY c.name, g.name, t.name`,
  },
  {
    title: 'Sources',
    columns: ['Class', 'Type', 'Source'],
    sql: `SELECT c.name, t.name, s.name, COUNT(wp.id)
          FROM sources s
          JOIN source_types t ON t.id = s.type_id
          JOIN source_classes c ON c.id = t.class_id
          LEFT JOIN water_points wp ON wp.source_id = s.id
          GROUP BY s.id ORDER BY c.name, t.name, s.name`,
  },
  {
    title: 'Water point types',
    columns: ['Group', 'Type'],
    sql: `SELECT g.name, t.name, COUNT(wp.id)
          FROM waterpoint_types t
          JOIN waterpoint_type_groups g ON g.id = t.group_id
          LEFT JOIN water_points wp ON wp.waterpoint_type_id = t.id
          GROUP BY t.id ORDER BY g.name, t.name`,
  },
  {
    title: 'Management',
    columns: ['Group', 'Type'],
    sql: `SELECT g.name, t.name, COUNT(wp.id)
          FROM management_types t
          JOIN management_groups g ON g.id = t.management_group_id
          LEFT JOIN water_points wp ON wp.management_type_id = t.id
          GROUP BY t.id ORDER BY g.name, t.name`,
  },
  {
    title: 'Scheme management',
    columns: ['Type'],
    sql: `SELECT t.name, COUNT(wp.id)
          FROM scheme_management_types t
          LEFT JOIN water_points wp ON wp.scheme_management_type_id = t.id
          GROUP BY t.id ORDER BY t.name`,
  },
  {
    title: 'Water quality',
    columns: ['Group', 'Quality'],
    sql: `SELECT g.name, q.name, COUNT(wp.id)
          FROM water_qualities q
          JOIN quality_groups g ON g.id = q.quality_group_id
          LEFT JOIN water_points wp ON wp.water_quality_id = q.id
          GROUP BY q.id ORDER BY g.name, q.name`,
  },
  {
    title: 'Quantity',
    columns: ['Quantity'],
    sql: `SELECT q.name, COUNT(wp.id)
          FROM quantities q LEFT JOIN water_points wp ON wp.quantity_id = q.id
          GROUP BY q.id ORDER BY q.name`,
  },
  {
    title: 'Payment',
    columns: ['Payment', 'Type'],
    sql: `SELECT p.name, p.type, COUNT(wp.id)
          FROM payments p LEFT JOIN water_points wp ON wp.payment_id = p.id
          GROUP BY p.id ORDER BY p.name`,
  },
  {
    title: 'Basins',
    columns: ['Basin'],
    sql: `SELECT b.name, COUNT(wp.id)
          FROM basins b LEFT JOIN water_points wp ON wp.basin_id = b.id
          GROUP BY b.id ORDER BY b.name`,
  },
  {
    title: 'Regions',
    columns: ['Region', 'LGAs', 'Wards'],
    sql: `SELECT r.name,
                 (SELECT COUNT(*) FROM lgas WHERE region_id = r.id),
                 (SELECT COUNT(*) FROM wards w JOIN lgas l ON l.id = w.lga_id WHERE l.region_id = r.id),
                 (SELECT COUNT(*) FROM water_points wp
                    JOIN subvillages sv ON sv.id = wp.subvillage_id
                    JOIN wards w ON w.id = sv.ward_id
                    JOIN lgas l ON l.id = w.lga_id
                  WHERE l.region_id = r.id)
          FROM regions r ORDER BY r.name`,
  },
].map((section) => ({ ...section, statement: db.prepare(section.sql).raw() }));

function getReference() {
  return REFERENCE_SECTIONS.map(({ title, columns, statement }) => ({
    title,
    columns: [...columns, 'Points'],
    rows: statement.all(),
  }));
}

function getSchema() {
  const objects = db
    .prepare("SELECT name, type FROM sqlite_schema WHERE type IN ('table', 'view') ORDER BY type, name")
    .all();

  return objects.map(({ name, type }) => {
    const references = Object.fromEntries(
      type === 'table'
        ? db.pragma(`foreign_key_list("${name}")`).map((fk) => [fk.from, `${fk.table}.${fk.to}`])
        : [],
    );
    const columns = db.pragma(`table_info("${name}")`).map((col) => ({
      name: col.name,
      type: col.type,
      primaryKey: col.pk > 0,
      notNull: col.notnull === 1,
      references: references[col.name] ?? null,
    }));
    const rows = db.prepare(`SELECT COUNT(*) AS n FROM "${name}"`).get().n;
    return { name, type, columns, rows };
  });
}

module.exports = { listWaterPoints, getWaterPoint, getReference, getSchema, SORTS };
