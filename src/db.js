const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');

const file = path.join(__dirname, '..', 'db', 'water_sources.db');

if (!fs.existsSync(file)) {
  console.error('Database not found. Run `npm run db:build` first.');
  process.exit(1);
}

const db = new Database(file, { readonly: true, fileMustExist: true });
db.pragma('foreign_keys = ON');

module.exports = db;
