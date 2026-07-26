// Technical repos: one repo = one domain+branch (e.g. "Network Theory / EE"),
// supplied by the admin at registration time since it isn't derivable from
// the repo layout. Chapters live directly at chapters/{chapterFile}.tex (no
// branch subfolder), images at img/{chapterSlug}/... referenced in the .tex
// as a path already relative to the repo root. Chapter display names come
// from each file's own \ChapterDivider{domain}{chapterName}{syllabus} call.

const { findCommandInvocations, unescapeLatexText } = require('../texTokenizer');

const FILE_PATTERN = /^chapters\/([^/]+)\.tex$/;

function resolveImagePath(rawSrc, _context) {
  if (!rawSrc) {
    return rawSrc;
  }
  return rawSrc.replace(/\\/g, '/');
}

function humanizeSlug(slug) {
  const withoutChapterPrefix = slug.replace(/^ch\d+[_-]?/i, '');
  return withoutChapterPrefix
    .split(/[_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

async function chapterNameFor(path, slug, fetchText) {
  try {
    const text = await fetchText(path);
    const [first] = findCommandInvocations(text, 'ChapterDivider');
    if (first && first.args[1]) {
      return unescapeLatexText(first.args[1]);
    }
  } catch (error) {
    // fall through to the humanized slug
  }
  return humanizeSlug(slug);
}

async function discoverHierarchy({ files, fetchText, bookMeta }) {
  const chapterFiles = files.filter((file) => FILE_PATTERN.test(file)).sort();

  const hierarchy = [];
  const fileEntries = [];
  for (const file of chapterFiles) {
    const [, slug] = FILE_PATTERN.exec(file);
    const label = await chapterNameFor(file, slug, fetchText);
    hierarchy.push({ key: slug, label, fileId: slug });
    fileEntries.push({
      fileId: slug,
      path: file,
      label: `${bookMeta.domain || ''} ${bookMeta.branch ? `(${bookMeta.branch})` : ''} · ${label}`.trim(),
      chapterFolder: '',
      imgResolution: 'repo-root'
    });
  }

  return { hierarchy, files: fileEntries };
}

module.exports = {
  id: 'technical-chapter-file',
  argMap: ['chapterNum', 'year', 'questionNum', 'marks', 'answer', 'content'],
  resolveImagePath,
  discoverHierarchy
};
