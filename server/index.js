const express = require('express');
const path = require('path');
const fs = require('fs');
const booksRouter = require('./routes/books');

const app = express();
app.use(express.json());
// Video-link CSVs are posted back as raw text; a whole book's worth of rows
// comfortably exceeds the default body limit.
app.use(express.text({ type: 'text/csv', limit: '10mb' }));

app.get('/health', (req, res) => {
  res.json({ ok: true, hasToken: Boolean(process.env.GITHUB_TOKEN) });
});

app.use('/api/books', booksRouter);

// Serve the built admin UI in production; in dev, run `npm run dev` inside web/ separately.
const webDist = path.join(__dirname, '..', 'web', 'dist');
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(webDist, 'index.html'));
  });
}

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: error.message });
});

const port = process.env.PORT || 4001;
app.listen(port, () => {
  console.log(`kb-ingest API listening on http://localhost:${port}`);
});
