# Water Sources

Browse Tanzanian water point records in the browser. The records live in a SQLite database normalized to third normal form, and a view rebuilds the original flat rows so nothing is lost in the split.

The bundled dataset has 2,720 water points across 21 regions, 123 local government authorities, and 1,284 wards.

## Quick start

Requires Node.js 20 or newer.

```bash
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000). Copy `.env.example` to `.env` and change `PORT` to listen somewhere else.

If `db/water_sources.db` is missing, build it first:

```bash
npm run db:build
npm start
```

`npm run dev` restarts the server when `src/server.js` changes.

## What you can do

| Page | What it shows |
| --- | --- |
| [Water points](http://localhost:3000/) | Search, filter, and sort the records. Filters cover region, LGA, basin, water point type, extraction, source, quantity, quality, payment, and management. The LGA list follows the selected region. |
| [A water point](http://localhost:3000/water-points/1) | Location, infrastructure, water, and management for one record, plus other points in the same ward. Coordinates open in OpenStreetMap. |
| [Reference data](http://localhost:3000/reference) | Lookup hierarchies (extraction, source, management, quality, and the rest) with how many points use each value. |
| [Data model](http://localhost:3000/schema) | Every table and view, with columns, keys, and foreign keys. |

The list shows 25 rows per page. Column headers toggle sort direction. Summary counts at the top follow the active filters.

## Data

`db/source/dummy_data.sql` is the flat source table. `npm run db:build` turns it into `db/water_sources.db`:

1. Load the flat rows into a staging table.
2. Create the normalized schema from `db/schema.sql`.
3. Fill the lookup tables and `water_points` from `db/normalize.sql`.
4. Compare staging with the `water_sources` view in both directions, and run a foreign-key check. The build stops if any row differs.
5. Drop staging, vacuum, and replace the database file.

The app opens the database read-only. Lookups that repeat in the source (region, ward, extraction class, and so on) are stored once and referenced by foreign key. `quantity_group` matches `quantity` in the source, so the table stores that value once and the view still returns both columns.

Query the flat shape directly:

```bash
sqlite3 db/water_sources.db "SELECT id, wpt_name, region, lga, quantity FROM water_sources LIMIT 5;"
```

## Project layout

```
db/
  schema.sql              normalized tables and the water_sources view
  normalize.sql           staging → normalized inserts
  source/dummy_data.sql   flat source data
  water_sources.db        built database
public/css/styles.css
scripts/build-db.js
src/
  server.js               Express routes
  db.js                   read-only SQLite connection
  queries.js              list, detail, reference, and schema queries
views/                    EJS templates
```

## Scripts

| Command | Purpose |
| --- | --- |
| `npm start` | Serve the app |
| `npm run dev` | Serve the app and restart on changes to `src/server.js` |
| `npm run db:build` | Rebuild `db/water_sources.db` from the SQL sources |
