// Aptitude repos: {Year}/Session{N}/common.tex (main.tex fallback), images
// live beside the tex file at {Year}/Session{N}/img/... and are referenced
// in the .tex as a path relative to that folder (e.g. "img/Q5_22.png").

const FILE_PATTERN = /^(\d{4})\/Session(\d+)\/(common|main)\.tex$/i;

function resolveImagePath(rawSrc, context) {
  if (!rawSrc) {
    return rawSrc;
  }
  const normalized = rawSrc.replace(/\\/g, '/');
  const chapterFolder = context.chapterFolder || '';
  if (normalized.startsWith('img/') && chapterFolder) {
    return `${chapterFolder}/${normalized}`;
  }
  if (normalized.startsWith('./img/') && chapterFolder) {
    return `${chapterFolder}/${normalized.slice(2)}`;
  }
  return normalized;
}

async function discoverHierarchy({ files }) {
  const bySessionKey = new Map();
  for (const file of files) {
    const match = FILE_PATTERN.exec(file);
    if (!match) {
      continue;
    }
    const [, year, session, base] = match;
    const key = `${year}/Session${session}`;
    const existing = bySessionKey.get(key);
    if (existing && existing.base === 'common' && base !== 'common') {
      continue;
    }
    bySessionKey.set(key, { year: Number(year), session: Number(session), base, path: file, key });
  }

  const sortedEntries = Array.from(bySessionKey.values()).sort((a, b) =>
    a.key.localeCompare(b.key, undefined, { numeric: true })
  );

  const yearMap = new Map();
  const fileEntries = [];
  for (const entry of sortedEntries) {
    if (!yearMap.has(entry.year)) {
      yearMap.set(entry.year, []);
    }
    yearMap.get(entry.year).push({ session: entry.session, fileId: entry.key, label: `Session ${entry.session}` });
    fileEntries.push({
      fileId: entry.key,
      path: entry.path,
      label: `${entry.year} · Session ${entry.session}`,
      chapterFolder: entry.key,
      imgResolution: 'folder-relative'
    });
  }

  const hierarchy = Array.from(yearMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([year, sessions]) => ({
      key: String(year),
      label: String(year),
      sessions: sessions.sort((a, b) => a.session - b.session)
    }));

  return { hierarchy, files: fileEntries };
}

// Aptitude solution files sit beside their question file in the same
// {Year}/Session{N}/ folder, named sol.tex rather than common.tex.
function solutionPathCandidates(questionPath) {
  if (!/\/(common|main)\.tex$/i.test(questionPath)) {
    return [];
  }
  const folder = questionPath.replace(/\/(common|main)\.tex$/i, '');
  return [`${folder}/sol.tex`, `${folder}/solutions.tex`, `${folder}/common.tex`];
}

// Aptitude repos disagree on the first macro argument: the 2010-2014 books
// write \MCQ{1}{...} while the 2021-2026 books write \MCQ{GA}{...}. Both mean
// the same single "General Aptitude" chapter, so the printed id is normalised
// to 1 and stays consistent with every other subject (1.21.1, not GA.21.1).
function questionIdPrefix(fields) {
  const numeric = Number(String(fields.subjectCode).trim());
  return Number.isFinite(numeric) ? String(numeric) : '1';
}

module.exports = {
  id: 'aptitude-session',
  argMap: ['subjectCode', 'year', 'questionNum', 'session', 'answer', 'content'],
  // Aptitude drops the documented leading {chapter} argument — it has
  // sessions, not chapters — so its solution macros take 7 arguments.
  solutionArgMap: ['year', 'questionNum', 'marks', 'answer', 'difficulty', 'video', 'content'],
  solutionPathCandidates,
  questionIdPrefix,
  resolveImagePath,
  discoverHierarchy
};
