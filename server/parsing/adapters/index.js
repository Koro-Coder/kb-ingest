const aptitude = require('./aptitude');
const maths = require('./maths');
const technical = require('./technical');

const registry = {
  [aptitude.id]: aptitude,
  [maths.id]: maths,
  [technical.id]: technical
};

// The one place a subject is declared. Everything else — the parser profile,
// the navigation tree shape, whether domain/branch are required, the entries
// written into the `subjects` collection, the dropdown in the admin UI — is
// derived from this list, so adding a subject is a single edit rather than
// five that must agree.
//
// Nexus X, Silicon X and Power X all use the technical adapter: same repo
// layout, same parser, same Domain > Branch > Chapter navigation. They are
// separate subjects purely so they appear as separate entries on the site.
//
// The adapter is still called "technical" — it names a repo LAYOUT, which
// these three share — but there is deliberately no longer a subject by that
// name for a book to be filed under.
const SUBJECTS = [
  { key: 'aptitude', label: 'Aptitude', adapter: aptitude },
  { key: 'maths', label: 'Maths', adapter: maths },
  { key: 'nexus_x', label: 'Nexus X', adapter: technical },
  { key: 'silicon_x', label: 'Silicon X', adapter: technical },
  { key: 'power_x', label: 'Power X', adapter: technical }
];

const subjectToProfile = Object.fromEntries(SUBJECTS.map((s) => [s.key, s.adapter.id]));

function getAdapter(parserProfile) {
  const adapter = registry[parserProfile];
  if (!adapter) {
    throw new Error(`Unknown parser profile: ${parserProfile}`);
  }
  return adapter;
}

function profileForSubject(subject) {
  const profile = subjectToProfile[subject];
  if (!profile) {
    throw new Error(`Unknown subject: ${subject}`);
  }
  return profile;
}

// {key, label, parserProfile} for the admin UI's dropdown and for seeding the
// `subjects` collection the public site reads.
function listSubjects() {
  return SUBJECTS.map(({ key, label, adapter }) => ({ key, label, parserProfile: adapter.id }));
}

// Only the technical layout splits a subject across repos by domain and
// branch; the others carry the whole subject in one repo.
function requiresDomainBranch(subject) {
  return subjectToProfile[subject] === technical.id;
}

module.exports = {
  registry,
  getAdapter,
  profileForSubject,
  listSubjects,
  requiresDomainBranch,
  SUBJECTS,
  subjectToProfile
};
