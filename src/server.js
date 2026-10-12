const path = require('node:path');
const express = require('express');
const { listWaterPoints, getWaterPoint, getReference, getSchema } = require('./queries');

const app = express();
const port = Number(process.env.PORT) || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.disable('x-powered-by');

app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: app.get('env') === 'production' ? '1h' : 0 }));

const numberFormat = new Intl.NumberFormat('en-US');

app.locals.fmt = {
  number: (value) => (value === null || value === undefined ? '—' : numberFormat.format(value)),
  text: (value) => (value === null || value === undefined || value === '' ? '—' : value),
  yesNo: (value) => (value === null || value === undefined ? 'Unknown' : value ? 'Yes' : 'No'),
  year: (value) => (value ? String(value) : 'Unknown'),
  date: (value) =>
    value
      ? new Date(`${value}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
      : '—',
};

app.use((req, res, next) => {
  res.locals.currentPath = req.path;
  next();
});

app.get('/', (req, res) => {
  const result = listWaterPoints(req.query);

  const base = { q: result.q, sort: result.sort, dir: result.dir };
  for (const { key, value } of result.filters) if (value) base[key] = value;

  const link = (overrides = {}) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...base, ...overrides })) {
      if (value !== null && value !== undefined && value !== '') params.set(key, value);
    }
    if (params.get('sort') === 'id' && params.get('dir') === 'asc') {
      params.delete('sort');
      params.delete('dir');
    }
    const qs = params.toString();
    return qs ? `/?${qs}` : '/';
  };

  const sortLink = (key) => link({ sort: key, dir: result.sort === key && result.dir === 'asc' ? 'desc' : 'asc', page: null });

  res.render('index', { title: 'Water points', ...result, link, sortLink });
});

app.get('/water-points/:id', (req, res, next) => {
  if (!/^[1-9]\d*$/.test(req.params.id)) return next();
  const found = getWaterPoint(Number(req.params.id));
  if (!found) return next();
  res.render('water-point', { title: found.point.name, ...found });
});

app.get('/reference', (req, res) => {
  res.render('reference', { title: 'Reference data', sections: getReference() });
});

app.get('/schema', (req, res) => {
  res.render('schema', { title: 'Data model', objects: getSchema() });
});

app.use((req, res) => {
  res.status(404).render('error', { title: 'Not found', message: 'That page or water point does not exist.' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', { title: 'Something went wrong', message: 'An unexpected error occurred.' });
});

app.listen(port, () => {
  console.log(`Water sources running at http://localhost:${port}`);
});
