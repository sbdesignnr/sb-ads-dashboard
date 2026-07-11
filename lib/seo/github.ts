/**
 * Minimal GitHub REST client for the SEO web autopilot. Reads a file from the
 * site repo, commits an AI-generated change to a fresh branch, opens a PR, and
 * later merges it — so the user always reviews a diff + a Vercel preview before
 * anything reaches production. A fine-grained token scoped to just the one repo
 * (Contents + Pull requests: read/write) drives it.
 */

const API = "https://api.github.com";

export function githubConfigured(): boolean {
  return Boolean(process.env.GITHUB_TOKEN?.trim() && process.env.GITHUB_REPO?.trim());
}

function repo(): string {
  const r = process.env.GITHUB_REPO?.trim();
  if (!r) throw new Error("GITHUB_REPO nie je nastavený.");
  return r;
}

async function gh<T>(path: string, init?: RequestInit): Promise<T> {
  const token = process.env.GITHUB_TOKEN?.trim();
  if (!token) throw new Error("GITHUB_TOKEN nie je nastavený.");
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub ${init?.method ?? "GET"} ${path} → ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export async function defaultBranch(): Promise<string> {
  const info = await gh<{ default_branch: string }>(`/repos/${repo()}`);
  return info.default_branch;
}

export interface RepoFile {
  content: string; // decoded UTF-8
  sha: string; // blob sha (needed to update)
}

/** Read a file's content + blob sha at `ref` (branch/sha), or null if absent. */
export async function getFile(path: string, ref?: string): Promise<RepoFile | null> {
  try {
    const data = await gh<{ content: string; encoding: string; sha: string }>(
      `/repos/${repo()}/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}${ref ? `?ref=${ref}` : ""}`,
    );
    const content = data.encoding === "base64" ? Buffer.from(data.content, "base64").toString("utf8") : data.content;
    return { content, sha: data.sha };
  } catch {
    return null;
  }
}

/** Branch head SHA. */
async function branchSha(branch: string): Promise<string> {
  const ref = await gh<{ object: { sha: string } }>(`/repos/${repo()}/git/ref/heads/${branch}`);
  return ref.object.sha;
}

/** Create `branch` off the default branch's current head. */
export async function createBranch(branch: string): Promise<void> {
  const base = await defaultBranch();
  const sha = await branchSha(base);
  await gh(`/repos/${repo()}/git/refs`, {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }),
  });
}

/** Commit new content for a single file on `branch` (updates if `sha` given). */
export async function commitFile(
  branch: string,
  path: string,
  content: string,
  message: string,
  sha?: string,
): Promise<void> {
  await gh(`/repos/${repo()}/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}`, {
    method: "PUT",
    body: JSON.stringify({
      message,
      content: Buffer.from(content, "utf8").toString("base64"),
      branch,
      ...(sha ? { sha } : {}),
    }),
  });
}

export interface PullRequest {
  number: number;
  html_url: string;
  state: string;
  merged?: boolean;
}

export async function openPr(head: string, title: string, body: string): Promise<PullRequest> {
  const base = await defaultBranch();
  return gh<PullRequest>(`/repos/${repo()}/pulls`, {
    method: "POST",
    body: JSON.stringify({ title, head, base, body, maintainer_can_modify: true }),
  });
}

export async function getPr(number: number): Promise<PullRequest> {
  return gh<PullRequest>(`/repos/${repo()}/pulls/${number}`);
}

/** Squash-merge a PR. Throws if not mergeable (e.g. failing checks / conflicts). */
export async function mergePr(number: number): Promise<void> {
  await gh(`/repos/${repo()}/pulls/${number}/merge`, {
    method: "PUT",
    body: JSON.stringify({ merge_method: "squash" }),
  });
}
