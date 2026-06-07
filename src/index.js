import { parseGitHubUrl } from './utils/parseUrl.js';
import { 
  getRepositoryTree, 
  getReleaseAssets, 
  checkLfsPointer, 
  getLfsDownloadUrl 
} from './utils/api.js';

const GH_PROXY = 'https://gh-proxy.com/';

function proxyUrl(url) {
  if (gopeed.settings.get('useGhproxy') === 'true' || gopeed.settings.get('useGhproxy') === true) {
    return GH_PROXY + url;
  }
  return url;
}

function buildReq(url, token) {
  const req = { url: proxyUrl(url) };
  if (token) {
    req.extra = { header: { Authorization: `token ${token}` } };
  }
  return req;
}

gopeed.events.onResolve(async (ctx) => {
  try {
    gopeed.logger.info('[GitHub Ext] Processing:', ctx.req.url);
    
    const parsed = parseGitHubUrl(ctx.req.url);
    if (!parsed) {
      ctx.res = { name: 'Error: Invalid GitHub URL', files: [] };
      return;
    }
    
    const token = gopeed.settings.get('token');
    const { owner, repo, type } = parsed;
    
    let result;
    switch (type) {
      case 'tree':
        result = await handleTree(owner, repo, parsed.ref, parsed.path, token);
        break;
      case 'blob':
        result = await handleBlob(owner, repo, parsed.ref, parsed.path, token);
        break;
      case 'releases':
        result = await handleReleases(owner, repo, parsed.tag, token);
        break;
      case 'archive':
        result = await handleArchive(owner, repo, parsed.filename, token);
        break;
      default:
        result = await handleRepo(owner, repo, token);
    }
    
    ctx.res = result;
  } catch (err) {
    gopeed.logger.error('[GitHub Ext] Error:', err.message);
    ctx.res = { 
      name: `Error: ${err.message}`, 
      files: [] 
    };
  }
});

async function handleTree(owner, repo, ref, path, token) {
  const tree = await getRepositoryTree(owner, repo, ref, path, token);
  const files = [];
  
  for (const item of tree) {
    if (item.type !== 'blob') continue;
    
    let filePath = item.path;
    if (path) filePath = filePath.substring(path.length + 1);
    
    const lfs = await checkLfsPointer(owner, repo, ref, item.path, token);
    let req;
    
    if (lfs) {
      const lfsUrl = await getLfsDownloadUrl(owner, repo, ref, lfs.oid, token);
      if (lfsUrl) {
        req = buildReq(lfsUrl, token);
      } else {
        req = buildReq(
          `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${item.path}`,
          token
        );
      }
    } else {
      req = buildReq(
        `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${item.path}`,
        token
      );
    }
    
    files.push({
      name: filePath,
      size: lfs?.size || item.size,
      req
    });
  }
  
  return {
    name: path ? `${repo}/${path}` : repo,
    files
  };
}

async function handleBlob(owner, repo, ref, filePath, token) {
  const lfs = await checkLfsPointer(owner, repo, ref, filePath, token);
  let req;
  
  if (lfs) {
    const lfsUrl = await getLfsDownloadUrl(owner, repo, ref, lfs.oid, token);
    req = lfsUrl ? buildReq(lfsUrl, token) : null;
  }
  
  if (!req) {
    req = buildReq(
      `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${filePath}`,
      token
    );
  }
  
  return {
    name: filePath.split('/').pop(),
    files: [{
      name: filePath.split('/').pop(),
      size: lfs?.size,
      req
    }]
  };
}

async function handleReleases(owner, repo, tag, token) {
  const assets = await getReleaseAssets(owner, repo, tag, token);
  const files = assets.map(asset => ({
    name: asset.name,
    size: asset.size,
    req: buildReq(asset.browser_download_url, token)
  }));
  
  return {
    name: `${repo}-releases-${tag}`,
    files
  };
}

async function handleArchive(owner, repo, filename, token) {
  return {
    name: filename,
    files: [{
      name: filename,
      req: buildReq(`https://github.com/${owner}/${repo}/archive/${filename}`, token)
    }]
  };
}

async function handleRepo(owner, repo, token) {
  return {
    name: repo,
    files: [
      { name: 'README.md', req: buildReq(`https://raw.githubusercontent.com/${owner}/${repo}/main/README.md`, token) },
      { name: 'package.json', req: buildReq(`https://raw.githubusercontent.com/${owner}/${repo}/main/package.json`, token) },
      { name: 'LICENSE', req: buildReq(`https://raw.githubusercontent.com/${owner}/${repo}/main/LICENSE`, token) },
      { name: `${repo}-main.zip`, req: buildReq(`https://github.com/${owner}/${repo}/archive/refs/heads/main.zip`, token) }
    ]
  };
}
