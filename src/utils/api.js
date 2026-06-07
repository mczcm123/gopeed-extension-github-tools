export async function fetchGitHubApi(url, token) {
  const headers = { 
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'Gopeed GitHub Extension'
  };
  if (token) {
    headers.Authorization = `token ${token}`;
  }
  
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`);
  }
  return await response.json();
}

export async function getRepositoryTree(owner, repo, ref, path, token) {
  const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${ref}?recursive=1`;
  const data = await fetchGitHubApi(url, token);
  
  if (data.truncated) {
    return await fetchTreeRecursive(owner, repo, ref, path, token);
  }
  
  return data.tree.filter(item => {
    if (!path) return true;
    return item.path.startsWith(path);
  });
}

async function fetchTreeRecursive(owner, repo, ref, path, token) {
  const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${ref}`;
  const data = await fetchGitHubApi(url, token);
  const results = [];
  
  for (const item of data.tree) {
    if (item.type === 'tree') {
      const subTree = await getRepositoryTree(owner, repo, item.sha, '', token);
      results.push(...subTree.map(t => ({ ...t, path: `${item.path}/${t.path}` })));
    } else {
      results.push(item);
    }
  }
  
  return results;
}

export async function getReleaseAssets(owner, repo, tag, token) {
  const url = tag === 'latest' 
    ? `https://api.github.com/repos/${owner}/${repo}/releases/latest`
    : `https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`;
  
  const data = await fetchGitHubApi(url, token);
  return data.assets || [];
}

export async function checkLfsPointer(owner, repo, ref, filePath, token) {
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${filePath}`;
  const headers = {};
  if (token) headers.Authorization = `token ${token}`;
  headers.Range = 'bytes=0-511';
  
  try {
    const response = await fetch(url, { headers });
    if (!response.ok) return null;
    
    const text = await response.text();
    if (text.startsWith('version https://git-lfs.github.com/spec/v1')) {
      const oidMatch = text.match(/oid sha256:([a-f0-9]{64})/);
      const sizeMatch = text.match(/size (\d+)/);
      
      if (oidMatch && sizeMatch) {
        return { oid: oidMatch[1], size: parseInt(sizeMatch[1]) };
      }
    }
  } catch {
    return null;
  }
  return null;
}

export async function getLfsDownloadUrl(owner, repo, ref, oid, token) {
  const url = `https://api.github.com/repos/${owner}/${repo}/git/lfs/objects/batch`;
  const headers = {
    'Accept': 'application/vnd.git-lfs+json',
    'Content-Type': 'application/vnd.git-lfs+json'
  };
  if (token) headers.Authorization = `token ${token}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      operation: 'download',
      transfers: ['basic'],
      objects: [{ oid, size: 0 }]
    })
  });
  
  if (!response.ok) return null;
  
  const data = await response.json();
  if (data.objects && data.objects[0]?.actions?.download) {
    return data.objects[0].actions.download.href;
  }
  return null;
}
