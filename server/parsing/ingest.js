const github = require('../github/client');
const { getAdapter } = require('./adapters');
const { parseQuestions, parseSolutions } = require('./texTokenizer');

function slugifyBookId(input) {
  return String(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function collectImageSrcs(question) {
  const srcs = [];
  for (const node of question.body || []) {
    if (node.type === 'image' && node.src) {
      srcs.push(node.src);
    }
  }
  for (const option of question.options || []) {
    for (const image of option.images || []) {
      if (image.src) {
        srcs.push(image.src);
      }
    }
  }
  return srcs;
}

// Checked against the repo tree we already fetched — no extra network calls.
function checkImagesExist(questions, knownPaths) {
  const warnings = [];
  for (const question of questions) {
    for (const src of collectImageSrcs(question)) {
      if (!knownPaths.has(src)) {
        warnings.push({
          command: question.questionType,
          message: `Image not found in repo: ${src} (Q${question.questionNum}, ${question.year})`,
          raw: src
        });
      }
    }
  }
  return warnings;
}

// Runs a full sync for one registered book: fetch the repo tree, let the
// subject adapter discover the hierarchy + tex files, then parse every file
// for question stubs (ordinal/type/year) and warnings. Returns the full
// book document to be written by the caller via kbStore.
async function syncBook({ bookId, subject, parserProfile, domain, branch, label, repo, solutionRepo, token }) {
  const adapter = getAdapter(parserProfile);
  const owner = repo.owner;
  const repoName = repo.name;
  const branchName = repo.branch || (await github.getDefaultBranch(owner, repoName, token));
  const rootPath = String(repo.rootPath || '').replace(/^\/+|\/+$/g, '');

  const allPaths = await github.getRepoTree(owner, repoName, branchName, token);
  const scoped = rootPath
    ? allPaths
        .filter((p) => p === rootPath || p.startsWith(`${rootPath}/`))
        .map((p) => p.slice(rootPath.length + 1))
    : allPaths;
  const texFiles = scoped.filter((p) => p.toLowerCase().endsWith('.tex'));
  const knownPaths = new Set(scoped);

  const fetchText = (relativePath) => {
    const full = rootPath ? `${rootPath}/${relativePath}` : relativePath;
    return github.getFileText(owner, repoName, branchName, full, token);
  };

  const bookMeta = { subject, domain: domain || null, branch: branch || null, label };
  const { hierarchy, files } = await adapter.discoverHierarchy({ files: texFiles, fetchText, bookMeta });

  // A solution repo mirrors the question repo's directory tree, but the file
  // names differ per subject (sol.tex / sol_CE.tex / *_solutions.tex), so the
  // mapping comes from the adapter. Resolved once here so a missing repo just
  // means "no solutions yet" rather than an error.
  const solution = solutionRepo && solutionRepo.name ? { ...solutionRepo } : null;
  let solutionPaths = new Set();
  if (solution) {
    solution.rootPath = String(solution.rootPath || '').replace(/^\/+|\/+$/g, '');
    solution.branch = solution.branch || (await github.getDefaultBranch(solution.owner, solution.name, token));
    const solTree = await github.getRepoTree(solution.owner, solution.name, solution.branch, token);
    solutionPaths = new Set(
      solution.rootPath
        ? solTree.filter((p) => p.startsWith(`${solution.rootPath}/`)).map((p) => p.slice(solution.rootPath.length + 1))
        : solTree
    );
  }

  const fetchSolutionText = (relativePath) => {
    const full = solution.rootPath ? `${solution.rootPath}/${relativePath}` : relativePath;
    return github.getFileText(solution.owner, solution.name, solution.branch, full, token);
  };

  let questionCount = 0;
  let warningCount = 0;
  let solutionCount = 0;
  const fileResults = [];

  for (const fileEntry of files) {
    let tex;
    try {
      tex = await fetchText(fileEntry.path);
    } catch (error) {
      warningCount += 1;
      fileResults.push({
        fileId: fileEntry.fileId,
        path: fileEntry.path,
        label: fileEntry.label,
        imgResolution: fileEntry.imgResolution,
        chapterFolder: fileEntry.chapterFolder || '',
        questionCount: 0,
        questions: [],
        warnings: [{ command: null, message: `Failed to fetch file: ${error.message}`, raw: '', excluded: true }]
      });
      continue;
    }

    const { questions, warnings } = parseQuestions(tex, adapter, {
      chapterFolder: fileEntry.chapterFolder || '',
      imgFolder: fileEntry.imgFolder || ''
    });
    const allWarnings = warnings.concat(checkImagesExist(questions, knownPaths));
    questionCount += questions.length;

    // Index which question numbers have a solution, so the website can show a
    // "solution available" hint without fetching the solution file first.
    let solutionPath = null;
    // key "year:questionNum" -> video URL from the LaTeX source ('' if none),
    // so the exported CSV can pre-fill links that already exist upstream.
    const solvedVideos = new Map();
    if (solution && adapter.solutionPathCandidates) {
      const candidate = adapter
        .solutionPathCandidates(fileEntry.path)
        .find((p) => solutionPaths.has(p));
      if (candidate) {
        solutionPath = candidate;
        try {
          const solTex = await fetchSolutionText(candidate);
          const parsed = parseSolutions(solTex, adapter, {
            chapterFolder: fileEntry.chapterFolder || '',
            imgFolder: fileEntry.imgFolder || ''
          });
          // Keyed by year+number: chapter files restart question numbering
          // each year, so the number alone would match the wrong solution.
          for (const s of parsed.solutions) {
            solvedVideos.set(`${s.year}:${s.questionNum}`, s.video || '');
          }
          solutionCount += parsed.solutions.length;
          for (const w of parsed.warnings) {
            allWarnings.push({ ...w, message: `[solutions] ${w.message}` });
          }
        } catch (error) {
          allWarnings.push({
            command: null,
            message: `[solutions] Failed to read ${candidate}: ${error.message}`,
            raw: '',
            excluded: true
          });
        }
      }
    }

    warningCount += allWarnings.length;

    fileResults.push({
      fileId: fileEntry.fileId,
      path: fileEntry.path,
      label: fileEntry.label,
      imgResolution: fileEntry.imgResolution,
      chapterFolder: fileEntry.chapterFolder || '',
      imgFolder: fileEntry.imgFolder || '',
      solutionPath,
      solutionCount: solvedVideos.size,
      questionCount: questions.length,
      questions: questions.map((q) => {
        const key = `${q.year}:${q.questionNum}`;
        return {
          ordinal: q.ordinal,
          questionId: q.questionId,
          questionType: q.questionType,
          starred: q.starred,
          year: q.year,
          questionNum: q.questionNum,
          hasSolution: solvedVideos.has(key),
          video: solvedVideos.get(key) || ''
        };
      }),
      warnings: allWarnings
    });
  }

  return {
    bookId,
    subject,
    domain: domain || null,
    branch: branch || null,
    label,
    repo: { owner, name: repoName, branch: branchName, rootPath },
    solutionRepo: solution
      ? { owner: solution.owner, name: solution.name, branch: solution.branch, rootPath: solution.rootPath }
      : null,
    parserProfile,
    hierarchy,
    files: fileResults,
    lastSyncedAt: new Date().toISOString(),
    questionCount,
    solutionCount,
    warningCount
  };
}

function bookToSummary(book) {
  return {
    bookId: book.bookId,
    subject: book.subject,
    domain: book.domain,
    branch: book.branch,
    label: book.label,
    repo: book.repo,
    solutionRepo: book.solutionRepo || null,
    parserProfile: book.parserProfile,
    lastSyncedAt: book.lastSyncedAt,
    questionCount: book.questionCount,
    solutionCount: book.solutionCount || 0,
    warningCount: book.warningCount
  };
}

module.exports = { syncBook, slugifyBookId, bookToSummary };
