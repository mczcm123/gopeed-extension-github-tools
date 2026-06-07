export function parseGitHubUrl(url) {
  try {
    const u = new URL(url);
    if (!['github.com', 'www.github.com'].includes(u.hostname)) {
      return null;
    }
    
    const pathParts = u.pathname.substring(1).split('/').filter(p => p);
    if (pathParts.length < 2) return null;
    
    const [owner, repo] = pathParts;
    const rest = pathParts.slice(2);
    
    if (rest.length === 0) {
      return { owner, repo, type: 'repo', ref: 'main', path: '' };
    }
    
    if (rest[0] === 'tree') {
      const refEnd = rest.slice(1).findIndex(p => p === 'tree' || p === 'blob');
      const ref = refEnd === -1 
        ? rest.slice(1).join('/')
        : rest.slice(1, refEnd + 1).join('/');
      const path = refEnd === -1 ? '' : rest.slice(refEnd + 1).join('/');
      return { owner, repo, type: 'tree', ref, path };
    }
    
    if (rest[0] === 'blob') {
      const filePath = rest.slice(1).join('/');
      const refMatch = filePath.match(/^([^\/]+)\/(.+)$/);
      if (refMatch) {
        return { owner, repo, type: 'blob', ref: refMatch[1], path: refMatch[2] };
      }
    }
    
    if (rest[0] === 'releases') {
      if (rest.length === 1) {
        return { owner, repo, type: 'releases', tag: 'latest' };
      }
      return { owner, repo, type: 'releases', tag: rest[1] };
    }
    
    if (rest[0] === 'archive') {
      return { owner, repo, type: 'archive', filename: rest[rest.length - 1] };
    }
    
    return { owner, repo, type: 'repo', ref: 'main', path: '' };
  } catch {
    return null;
  }
}
