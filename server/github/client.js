// Thin GitHub REST client: repo tree listing + file contents. No SDK, just
// https + the contents/git-trees endpoints (mirrors what the original
// Latex Parser's parser.js did, generalized to take owner/repo/branch/token
// per call instead of baking one repo into the module).

const https = require('https');

function githubHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'kb-ingest',
    Authorization: `Bearer ${token}`
  };
}

function requestJson(url, headers) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`GitHub request failed (${res.statusCode}) for ${url}: ${body.slice(0, 300)}`));
          return;
        }
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on('error', reject);
  });
}

function encodePath(filePath) {
  return filePath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

// Accepts "https://github.com/owner/repo", ".../tree/branch", or "owner/repo".
function parseRepoUrl(input) {
  const trimmed = String(input || '').trim().replace(/\.git$/, '');
  const githubMatch = trimmed.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\/tree\/([^/]+))?\/?$/);
  if (githubMatch) {
    return { owner: githubMatch[1], repo: githubMatch[2], branch: githubMatch[3] || null };
  }
  const shortMatch = trimmed.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (shortMatch) {
    return { owner: shortMatch[1], repo: shortMatch[2], branch: null };
  }
  throw new Error(`Could not parse a GitHub owner/repo from: ${input}`);
}

async function getDefaultBranch(owner, repo, token) {
  const data = await requestJson(`https://api.github.com/repos/${owner}/${repo}`, githubHeaders(token));
  if (!data.default_branch) {
    throw new Error(`Could not resolve default branch for ${owner}/${repo}`);
  }
  return data.default_branch;
}

async function getRepoTree(owner, repo, branch, token) {
  const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`;
  const data = await requestJson(url, githubHeaders(token));
  if (data.truncated) {
    console.warn(`kb-ingest: tree for ${owner}/${repo}@${branch} was truncated by the GitHub API`);
  }
  return (data.tree || []).filter((item) => item.type === 'blob').map((item) => item.path);
}

async function getFileText(owner, repo, branch, filePath, token) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodePath(filePath)}?ref=${encodeURIComponent(branch)}`;
  const data = await requestJson(url, githubHeaders(token));
  if (!data.content) {
    throw new Error(`No content returned for ${filePath}`);
  }
  return Buffer.from(data.content, 'base64').toString('utf8');
}

module.exports = {
  parseRepoUrl,
  getDefaultBranch,
  getRepoTree,
  getFileText,
  requestJson,
  githubHeaders,
  encodePath
};
