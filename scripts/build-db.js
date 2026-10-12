const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const dbDir = path.join(__dirname, '..', 'db');
const target = path.join(dbDir, 'water_sources.db');
const temp = `${target}.tmp`;

const read = (file) => fs.readFileSync(path.join(dbDir, file), 'utf8');

fs.rmSync(temp, { force: true });
const db = new Database(temp);

try {
  db.pragma('foreign_keys = ON');

  db.exec(read('source/dummy_data.sql'));
  db.exec('ALTER TABLE water_sources RENAME TO staging');

  db.transaction(() => {
    db.exec(read('schema.sql'));
    db.exec(read('normalize.sql'));
  })();

  const staged = db.prepare('SELECT COUNT(*) AS n FROM staging').get().n;
  const loaded = db.prepare('SELECT COUNT(*) AS n FROM water_points').get().n;
  const missing = db.prepare('SELECT COUNT(*) AS n FROM (SELECT * FROM staging EXCEPT SELECT * FROM water_sources)').get().n;
  const extra = db.prepare('SELECT COUNT(*) AS n FROM (SELECT * FROM water_sources EXCEPT SELECT * FROM staging)').get().n;
  const brokenKeys = db.pragma('foreign_key_check');

  if (staged !== loaded || missing || extra || brokenKeys.length) {
    throw new Error(
      `Normalization is lossy: staged=${staged} loaded=${loaded} missing=${missing} extra=${extra} brokenKeys=${brokenKeys.length}`,
    );
  }

  db.exec('DROP TABLE staging');
  db.exec('VACUUM');

  const tables = db
    .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name")
    .all()
    .map(({ name }) => `${name}: ${db.prepare(`SELECT COUNT(*) AS n FROM "${name}"`).get().n}`);

  db.close();
  fs.renameSync(temp, target);

  console.log(`Built ${path.relative(process.cwd(), target)} (${loaded} water points, lossless round trip)`);
  console.log(tables.map((t) => `  ${t}`).join('\n'));
} catch (err) {
  db.close();
  fs.rmSync(temp, { force: true });
  console.error(err.message);
  process.exit(1);
}
