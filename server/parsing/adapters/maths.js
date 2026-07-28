// Maths repos: chapters/{chapterSlug}/{branchCode}.tex + common.tex, images
// at chapters/{chapterSlug}/img/{BRANCH}/... referenced in the .tex as a
// path already relative to the repo root (no rewriting needed). Branch
// files are discovered by filename, not by config, so a new branch just
// needs a new {code}.tex file in the chapter folder to show up. Chapter
// display names are pulled straight out of main.tex's
// \ChapterWithBranches{folder}{subject}{name}{syllabus} calls.

const { findCommandInvocations, unescapeLatexText } = require('../texTokenizer');

const FILE_PATTERN = /^chapters\/([^/]+)\/([^/]+)\.tex$/;

const BRANCH_NAMES = {
  EC: 'Electronics & Communication Engineering',
  EE: 'Electrical Engineering',
  IN: 'Instrumentation Engineering',
  CS: 'Computer Science & IT',
  ME: 'Mechanical Engineering',
  CE: 'Civil Engineering',
  CH: 'Chemical Engineering',
  PI: 'Production & Industrial Engineering'
};

// Two conventions appear in these repos: a full repo-root-relative path
// (chapters/<chapter>/img/<BRANCH>/x.png), and a bare filename (x.png) meant
// to resolve against the current chapter+branch image folder. A path with no
// slash can only be the latter, so it is prefixed with the folder recorded
// for the file being parsed; anything already containing a slash is trusted
// as-is.
function resolveImagePath(rawSrc, context) {
  if (!rawSrc) {
    return rawSrc;
  }
  const normalized = rawSrc.replace(/\\/g, '/').replace(/^\.\//, '');
  if (!normalized.includes('/') && context && context.imgFolder) {
    return `${context.imgFolder}/${normalized}`;
  }
  return normalized;
}

function humanizeSlug(slug) {
  const withoutChapterPrefix = slug.replace(/^ch\d+_/i, '');
  return withoutChapterPrefix
    .split(/[_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

async function loadChapterNames(fetchText) {
  const names = new Map();
  let mainTex;
  try {
    mainTex = await fetchText('main.tex');
  } catch (error) {
    return names;
  }
  const invocations = findCommandInvocations(mainTex, 'ChapterWithBranches');
  for (const { args } of invocations) {
    const folder = (args[0] || '').replace(/\\/g, '/').replace(/^chapters\//, '');
    const chapterName = unescapeLatexText(args[2] || '');
    if (folder && chapterName) {
      names.set(folder, chapterName);
    }
  }
  return names;
}

async function discoverHierarchy({ files, fetchText }) {
  const chapterSlugs = new Map();
  for (const file of files) {
    const match = FILE_PATTERN.exec(file);
    if (!match) {
      continue;
    }
    const [, slug, base] = match;
    if (!chapterSlugs.has(slug)) {
      chapterSlugs.set(slug, []);
    }
    if (base.toLowerCase() !== 'common') {
      chapterSlugs.get(slug).push({ branchCode: base, path: file });
    }
  }

  const chapterNames = await loadChapterNames(fetchText);

  const hierarchy = [];
  const fileEntries = [];
  for (const slug of Array.from(chapterSlugs.keys()).sort()) {
    const branches = chapterSlugs.get(slug).sort((a, b) => a.branchCode.localeCompare(b.branchCode));
    if (branches.length === 0) {
      continue;
    }
    const chapterName = chapterNames.get(slug) || humanizeSlug(slug);
    hierarchy.push({
      key: slug,
      label: chapterName,
      branches: branches.map((b) => ({
        branchCode: b.branchCode.toUpperCase(),
        label: BRANCH_NAMES[b.branchCode.toUpperCase()] || b.branchCode.toUpperCase(),
        fileId: `${slug}/${b.branchCode}`
      }))
    });
    for (const b of branches) {
      fileEntries.push({
        fileId: `${slug}/${b.branchCode}`,
        path: b.path,
        label: `${chapterName} · ${BRANCH_NAMES[b.branchCode.toUpperCase()] || b.branchCode.toUpperCase()}`,
        chapterFolder: `chapters/${slug}`,
        // Where a bare filename resolves for this chapter+branch.
        imgFolder: `chapters/${slug}/img/${b.branchCode.toUpperCase()}`,
        imgResolution: 'repo-root'
      });
    }
  }

  return { hierarchy, files: fileEntries };
}

// chapters/ch7_numerical_methods/ce.tex -> chapters/ch7_numerical_methods/sol_CE.tex
function solutionPathCandidates(questionPath) {
  const match = /^(chapters\/[^/]+)\/([^/]+)\.tex$/.exec(questionPath);
  if (!match) {
    return [];
  }
  const [, folder, branch] = match;
  return [
    `${folder}/sol_${branch.toUpperCase()}.tex`,
    `${folder}/sol_${branch}.tex`,
    `${folder}/${branch}_solutions.tex`
  ];
}

module.exports = {
  id: 'maths-chapter-branch',
  argMap: ['chapterNum', 'year', 'questionNum', 'marks', 'answer', 'content'],
  solutionArgMap: ['chapterNum', 'year', 'questionNum', 'marks', 'answer', 'difficulty', 'video', 'content'],
  solutionPathCandidates,
  resolveImagePath,
  discoverHierarchy
};
