/**
 * DARLEK CANN ARCHITECTURAL HEADER
 * File: src/utils/github.ts
 * Role: Core system component participating in autonomous cognitive evolution cycles.
 * Architecture: Type-safe modular unit with resilient state interfaces.
 */

export const b64ToUtf8 = (str: string): string => {
  try {
    return decodeURIComponent(
      atob(str.replace(/\s/g, ''))
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
  } catch {
    try {
      return atob(str);
    } catch {
      return str;
    }
  }
};

export const utf8ToB64 = (str: string): string => {
  try {
    return btoa(
      encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) =>
        String.fromCharCode(Number('0x' + p1))
      )
    );
  } catch {
    return btoa(str);
  }
};

export interface GitHubFileItem {
  path: string;
  mode: string;
  type: string;
  sha: string;
  size?: number;
  url: string;
}

export interface GitHubRepoInfo {
  name: string;
  full_name: string;
  default_branch: string;
  private: boolean;
  stargazers_count: number;
}

export interface GitHubUserRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  description: string | null;
  default_branch: string;
  stargazers_count: number;
  language: string | null;
  updated_at: string;
  html_url: string;
  owner: {
    login: string;
    avatar_url: string;
  };
}

export async function fetchUserRepositories(token: string): Promise<GitHubUserRepo[]> {
  if (!token || !token.trim()) {
    return [];
  }
  const cleanToken = token.trim();
  
  // Try client-side direct request first with fallback to server proxy
  try {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      Authorization: `Bearer ${cleanToken}`,
    };

    const res = await fetch(
      'https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member',
      { headers }
    );

    if (res.ok) {
      return await res.json();
    }
    
    // If client request returned an auth/rate error, throw meaningful error
    if (res.status === 401) {
      throw new Error('GitHub Authorization Failed: Invalid token or expired.');
    }
    if (res.status === 403) {
      throw new Error('GitHub Authorization Error: Rate limit or missing "repo" scope.');
    }
  } catch (err: any) {
    if (err.message && (err.message.includes('Authorization') || err.message.includes('Rate limit'))) {
      throw err;
    }
    // Fall back to server proxy
    try {
      const proxyRes = await fetch('/api/github/user-repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: cleanToken }),
      });
      if (!proxyRes.ok) {
        const errJson = await proxyRes.json().catch(() => ({}));
        throw new Error(errJson.error || `GitHub Handshake failed (${proxyRes.status})`);
      }
      return await proxyRes.json();
    } catch (proxyErr: any) {
      throw new Error(proxyErr.message || 'Unable to fetch GitHub repositories.');
    }
  }

  return [];
}

export async function fetchRepoDetails(repo: string, token: string): Promise<GitHubRepoInfo> {
  const cleanRepo = repo.trim().replace(/^https:\/\/github\.com\//, '').replace(/\/$/, '');
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
  };
  if (token && token.trim()) {
    headers.Authorization = `Bearer ${token.trim()}`;
  }

  const res = await fetch(`https://api.github.com/repos/${cleanRepo}`, { headers });
  if (!res.ok) {
    if (res.status === 404) throw new Error(`Repository "${cleanRepo}" not found (check name or token scope).`);
    if (res.status === 401) throw new Error('GitHub Authorization Failed: Invalid token.');
    if (res.status === 403) throw new Error('GitHub Rate Limit exceeded or insufficient repo permissions.');
    throw new Error(`GitHub Handshake Error (${res.status}): ${res.statusText}`);
  }
  return res.json();
}

export async function fetchRepoTree(repo: string, branch: string, token: string): Promise<GitHubFileItem[]> {
  const cleanRepo = repo.trim().replace(/^https:\/\/github\.com\//, '').replace(/\/$/, '');
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
  };
  if (token && token.trim()) {
    headers.Authorization = `Bearer ${token.trim()}`;
  }

  const res = await fetch(
    `https://api.github.com/repos/${cleanRepo}/git/trees/${branch}?recursive=1`,
    { headers }
  );

  if (!res.ok) {
    throw new Error(`Failed to fetch file tree for ${branch}: ${res.statusText}`);
  }

  const data = await res.json();
  return (data.tree || []).filter(
    (item: GitHubFileItem) =>
      item.type === 'blob' &&
      /\.(js|jsx|ts|tsx|py|html|css|json|rs|go|c|cpp|h)$/i.test(item.path) &&
      !item.path.includes('node_modules') &&
      !item.path.includes('dist/') &&
      !item.path.includes('.git/') &&
      !item.path.includes('package-lock.json') &&
      !item.path.includes('bun.lock')
  );
}

export async function fetchFileContent(
  repo: string,
  filePath: string,
  token: string
): Promise<{ content: string; sha: string }> {
  const cleanRepo = repo.trim().replace(/^https:\/\/github\.com\//, '').replace(/\/$/, '');
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
  };
  if (token && token.trim()) {
    headers.Authorization = `Bearer ${token.trim()}`;
  }

  const res = await fetch(
    `https://api.github.com/repos/${cleanRepo}/contents/${filePath}`,
    { headers }
  );

  if (!res.ok) {
    throw new Error(`Failed to retrieve file contents for ${filePath}: ${res.statusText}`);
  }

  const data = await res.json();
  return {
    content: b64ToUtf8(data.content || ''),
    sha: data.sha,
  };
}

export async function commitFileUpdate(
  repo: string,
  filePath: string,
  content: string,
  sha: string,
  token: string,
  commitMessage: string
): Promise<{ commitSha: string }> {
  const cleanRepo = repo.trim().replace(/^https:\/\/github\.com\//, '').replace(/\/$/, '');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/vnd.github.v3+json',
    Authorization: `Bearer ${token.trim()}`,
  };

  const body = {
    message: commitMessage,
    content: utf8ToB64(content),
    sha: sha,
  };

  const res = await fetch(
    `https://api.github.com/repos/${cleanRepo}/contents/${filePath}`,
    {
      method: 'PUT',
      headers,
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Commit mutation failed (${res.status}): ${errorText}`);
  }

  const data = await res.json();
  return { commitSha: data.commit?.sha || 'unknown' };
}
