# kb-ingest

Admin tool for the PrepFusion question bank. Register a GitHub repo of LaTeX
question files, and it crawls the repo, parses every question, and writes an
index into the shared knowledge base (`kb-data`).

Pairs with [`kb-website`](../kb-website), which renders what this produces.

## Running

```bash
npm install
npm start          # API on http://localhost:4001
```

The React admin UI is a separate Vite app:

```bash
npm --prefix web install
npm --prefix web run dev   # UI on http://localhost:5173
```

### Configuration (`.env`, not committed)

```
GITHUB_TOKEN=<PAT with read access to the content repos>
DEFAULT_ACCOUNT=<github org/user owning the content repos>
KB_DATA_DIR=../kb-data
```

## What it does

Register a repo through the UI (or `POST /api/books`) with its subject, and
it will:

1. Fetch the repo tree and discover the hierarchy for that subject.
2. Parse every `.tex` file for `\MCQ` / `\MSQ` / `\NAT` questions.
3. Write `kb-data/books/<bookId>.json` plus a `kb-data/catalog.json` entry.

The knowledge base stores an **index**, not a copy of the content: question
text and images are always fetched live from GitHub at render time.

## Subject adapters

Each subject family has its own repo layout, so the parser is split into a
subject-agnostic tokenizer plus one adapter per layout
(`server/parsing/adapters/`):

| Subject | Layout | Macro arguments |
|---|---|---|
| Aptitude | `{Year}/Session{N}/common.tex` | `{SubjectCode}{Year}{QNum}{Session}{Answer}{Content}` |
| Maths | `chapters/{chapter}/{branch}.tex` | `{ChapterNum}{Year}{QNum}{Marks}{Answer}{Content}` |
| Technical | `chapters/{chapter}.tex`, one repo per domain+branch | same as Maths |

Adding a repo that follows an existing layout needs no code changes. A genuinely
new layout means a new adapter implementing
`{ argMap, resolveImagePath, discoverHierarchy }`.

## Warnings

Real source files contain mistakes, so parsing never aborts on one bad
question. Instead each problem is recorded as a warning, and a question is
**excluded** from the site only when showing it would be misleading —
missing options, or content we genuinely cannot render (nested tables,
tikz diagrams). Everything else renders with the offending markup dropped.

Warnings are browsable per book in the UI and exportable as CSV
(`/api/books/warnings.csv`), which includes a direct GitHub link per row so
each row is one click from the file to fix.

## Tests

```bash
npm test
```

Covers all documented option styles, table/colspan parsing, image path
resolution per subject, and the malformed-source cases found in the real
repos.
