import { createHash } from "node:crypto";

// File integrity check between the deployed Lovable bundle and the connected
// GitHub repository. Mirrors python_worker/ and src/routes/_authenticated/.
// Local file contents are embedded at build time via import.meta.glob so this
// works inside the Cloudflare Worker runtime (no filesystem at request time).

export const MIRROR_REPO = "Samoolino/free-cloud-arbitrage";
export const MIRROR_BRANCH = "main";
export const MIRRORED_PATHS = ["python_worker", "src/routes/_authenticated"] as const;

// Eagerly load every mirrored file as raw text. Both globs must be string
// literals for Vite to statically analyse them.
const localPython = import.meta.glob("/python_worker/**/*", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
const localAuthed = import.meta.glob("/src/routes/_authenticated/**/*", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const LOCAL_FILES: Record<string, string> = {};
for (const [k, v] of Object.entries({ ...localPython, ...localAuthed })) {
  // strip leading slash so keys match GitHub tree paths
  LOCAL_FILES[k.replace(/^\//, "")] = v;
}

/** Git's blob SHA1 = sha1("blob <byteLen>\0" + content). */
export function gitBlobSha1(content: string): string {
  const buf = Buffer.from(content, "utf8");
  const header = Buffer.from(`blob ${buf.length}\0`, "utf8");
  return createHash("sha1").update(Buffer.concat([header, buf])).digest("hex");
}

type GhCommit = { sha: string; commit: { author?: { date?: string }; message?: string } };
type GhTreeEntry = { path: string; type: "blob" | "tree"; sha: string; size?: number };
type GhTree = { sha: string; tree: GhTreeEntry[]; truncated: boolean };

async function gh<T>(url: string): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "lovable-arb-mirror",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${await r.text()}`);
  return (await r.json()) as T;
}

export async function fetchHeadCommit(): Promise<{ sha: string; date: string | null; message: string }> {
  const c = await gh<GhCommit>(
    `https://api.github.com/repos/${MIRROR_REPO}/commits/${MIRROR_BRANCH}`,
  );
  return { sha: c.sha, date: c.commit.author?.date ?? null, message: c.commit.message ?? "" };
}

export async function fetchRepoTree(sha: string): Promise<GhTreeEntry[]> {
  const t = await gh<GhTree>(
    `https://api.github.com/repos/${MIRROR_REPO}/git/trees/${sha}?recursive=1`,
  );
  return t.tree.filter((e) => e.type === "blob");
}

export async function fetchRawFile(sha: string, path: string): Promise<string> {
  const url = `https://raw.githubusercontent.com/${MIRROR_REPO}/${sha}/${path}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`raw ${path} ${r.status}`);
  return await r.text();
}

export type MirrorDiff = {
  path: string;
  status: "match" | "mismatch" | "missing_local" | "missing_remote";
  local_sha: string | null;
  remote_sha: string | null;
};

export type MirrorReport = {
  repo: string;
  branch: string;
  head_sha: string;
  head_date: string | null;
  files_checked: number;
  matches: number;
  mismatches: number;
  missing_local: number;
  missing_remote: number;
  in_sync: boolean;
  diffs: MirrorDiff[];
  checked_at: string;
};

function isMirrored(path: string): boolean {
  return MIRRORED_PATHS.some((p) => path === p || path.startsWith(p + "/"));
}

/** Pure comparison: GitHub tree vs in-bundle local files. */
export async function compareWithGitHub(): Promise<MirrorReport> {
  const head = await fetchHeadCommit();
  const tree = await fetchRepoTree(head.sha);
  const remote = new Map<string, string>();
  for (const e of tree) if (isMirrored(e.path)) remote.set(e.path, e.sha);

  const localKeys = new Set(Object.keys(LOCAL_FILES));
  const allPaths = new Set<string>([...remote.keys(), ...localKeys]);

  const diffs: MirrorDiff[] = [];
  let matches = 0, mismatches = 0, missingLocal = 0, missingRemote = 0;

  for (const path of allPaths) {
    const localContent = LOCAL_FILES[path];
    const localSha = localContent != null ? gitBlobSha1(localContent) : null;
    const remoteSha = remote.get(path) ?? null;
    let status: MirrorDiff["status"];
    if (localSha && remoteSha) status = localSha === remoteSha ? "match" : "mismatch";
    else if (!localSha) status = "missing_local";
    else status = "missing_remote";
    if (status === "match") matches++;
    else if (status === "mismatch") mismatches++;
    else if (status === "missing_local") missingLocal++;
    else missingRemote++;
    diffs.push({ path, status, local_sha: localSha, remote_sha: remoteSha });
  }

  diffs.sort((a, b) => (a.status === "match" ? 1 : -1) - (b.status === "match" ? 1 : -1) || a.path.localeCompare(b.path));

  return {
    repo: MIRROR_REPO,
    branch: MIRROR_BRANCH,
    head_sha: head.sha,
    head_date: head.date,
    files_checked: allPaths.size,
    matches,
    mismatches,
    missing_local: missingLocal,
    missing_remote: missingRemote,
    in_sync: mismatches === 0 && missingLocal === 0 && missingRemote === 0,
    diffs,
    checked_at: new Date().toISOString(),
  };
}

/** Returns the raw GitHub content for every mismatched/missing path so the
 *  user can apply the mirror by committing in their editor. Workers cannot
 *  write to the deployed bundle at runtime — the patch is intentionally
 *  surfaced as data instead of a silent overwrite. */
export async function fetchMirrorPatch(report: MirrorReport) {
  const needs = report.diffs.filter((d) => d.status !== "match" && d.status !== "missing_remote");
  const out: Array<{ path: string; content: string; sha: string | null }> = [];
  for (const d of needs) {
    try {
      const content = await fetchRawFile(report.head_sha, d.path);
      out.push({ path: d.path, content, sha: d.remote_sha });
    } catch (e) {
      out.push({ path: d.path, content: `// fetch failed: ${(e as Error).message}`, sha: d.remote_sha });
    }
  }
  return { head_sha: report.head_sha, files: out };
}