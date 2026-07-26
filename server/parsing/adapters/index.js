const aptitude = require('./aptitude');
const maths = require('./maths');
const technical = require('./technical');

const registry = {
  [aptitude.id]: aptitude,
  [maths.id]: maths,
  [technical.id]: technical
};

// One parser profile per subject key — a subject maps 1:1 to a repo layout
// today. If a subject ever needs more than one layout, registerBook can
// accept an explicit parserProfile override instead of deriving it here.
const subjectToProfile = {
  aptitude: aptitude.id,
  maths: maths.id,
  technical: technical.id
};

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

module.exports = { registry, getAdapter, profileForSubject };
