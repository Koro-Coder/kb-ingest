const express = require('express');
const path = require('path');
const fs = require('fs');
const booksRouter = require('./routes/books');
const reportsRouter = require('./routes/reports');
const mongo = require('./store/mongo');

const app = express();
app.use(express.json());
// Video-link CSVs are posted back as raw text; a whole book's worth of rows
// comfortably exceeds the default body limit.
app.use(express.text({ type: 'text/csv', limit: '10mb' }));

// `ok` now reflects database reachability too — with the knowledge base over
// the network, a process that is listening is no longer proof it can serve.
app.get('/health', async (req, res) => {
  let db = false;
  try {
    db = await mongo.ping();
  } catch (error) {
    db = false;
  }
  res.json({
    ok: db,
    hasToken: Boolean(process.env.GITHUB_TOKEN),
    db: db ? 'up' : 'down',
    database: mongo.databaseName()
  });
});

app.use('/api/books', booksRouter);
app.use('/api/reports', reportsRouter);

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

// Connect before listening so a bad MONGODB_URI fails loudly at startup
// instead of turning every request into a 500.
mongo
  .ensureIndexes()
  .then(() => {
    app.listen(port, () => {
      console.log(`kb-ingest API listening on http://localhost:${port} (db: ${mongo.databaseName()})`);
    });
  })
  .catch((error) => {
    console.error('Failed to connect to MongoDB:', error.message);
    process.exit(1);
  });
