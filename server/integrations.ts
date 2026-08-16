import axios from "axios";

const GITHUB_API = "https://api.github.com";

export type GitHubProfile = { id: number; login: string; name: string | null; bio: string | null; avatar_url: string; location: string | null; blog: string | null; followers?: number; following?: number };
export type GitHubRepo = { id: number; name: string; description: string | null; language: string | null; stargazers_count: number; forks_count: number; html_url: string; homepage: string | null; updated_at?: string | null; topics?: string[]; archived?: boolean; fork?: boolean; owner?: { login?: string; type?: string }; license?: { name?: string | null; spdx_id?: string | null }; default_branch?: string; open_issues_count?: number };

export async function getGitHubProfile(token: string): Promise<GitHubProfile> {
  const { data } = await axios.get(`${GITHUB_API}/user`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } });
  return data;
}
export async function getGitHubPinnedRepositoryIds(token: string): Promise<number[] | null> {
  try {
    const { data } = await axios.post("https://api.github.com/graphql", { query: "query { viewer { pinnedItems(first: 100, types: REPOSITORY) { nodes { ... on Repository { databaseId } } } } }" }, { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } });
    const nodes = data?.data?.viewer?.pinnedItems?.nodes;
    if (!Array.isArray(nodes)) return null;
    return nodes.map((node: { databaseId?: number | null }) => Number(node.databaseId)).filter((id: number) => Number.isInteger(id) && id > 0);
  } catch { return null; }
}
export async function getGitHubRepos(token: string): Promise<GitHubRepo[]> {
  const { data } = await axios.get(`${GITHUB_API}/user/repos?visibility=public&affiliation=owner&sort=updated&per_page=100`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } });
  return data;
}
export async function getGitHubOpenPullRequestCount(token: string, repository: GitHubRepo): Promise<number> {
  const owner = repository.owner?.login;
  if (!owner) return 0;
  try {
    const { data } = await axios.get(`${GITHUB_API}/search/issues`, { params: { q: `repo:${owner}/${repository.name} is:pr is:open`, per_page: 1 }, headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } });
    return Number.isFinite(data?.total_count) ? Math.max(0, Number(data.total_count)) : 0;
  } catch { return 0; }
}
export async function getGitHubLanguageBreakdown(token: string, repository: GitHubRepo): Promise<Record<string, number>> {
  const owner = repository.owner?.login;
  if (!owner) return {};
  try {
    const { data } = await axios.get(`${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository.name)}/languages`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } });
    if (!data || typeof data !== "object") return {};
    return Object.fromEntries(Object.entries(data).filter((entry): entry is [string, unknown] => typeof entry[0] === "string" && typeof entry[1] === "number").slice(0, 20).map(([language, bytes]) => [language, Math.max(0, Number(bytes))]));
  } catch { return {}; }
}
export async function getGitHubContributorCount(token: string, repository: GitHubRepo): Promise<number> {
  const owner = repository.owner?.login;
  if (!owner) return 0;
  try {
    const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" };
    let total = 0;
    for (let page = 1; page <= 10; page++) {
      const { data } = await axios.get(`${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository.name)}/contributors?anon=true&per_page=100&page=${page}`, { headers });
      if (!Array.isArray(data)) break;
      total += data.length;
      if (data.length < 100) break;
    }
    return total;
  } catch { return 0; }
}
export function summarizeCommitActivity(activity: unknown): string {
  const weeks = Array.isArray(activity) ? activity.filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0) : [];
  if (!weeks.length) return "No recent commit activity data";
  const total = weeks.reduce((sum, value) => sum + value, 0);
  const activeWeeks = weeks.filter((value) => value > 0).length;
  const peak = Math.max(...weeks);
  return `${total} commits across ${activeWeeks}/${weeks.length} recent weeks; peak week ${peak}`;
}
export async function getGitHubLatestRelease(token: string, repository: GitHubRepo): Promise<{ tag: string | null; publishedAt: string | null }> {
  const owner = repository.owner?.login;
  if (!owner) return { tag: null, publishedAt: null };
  try {
    const { data } = await axios.get(`${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository.name)}/releases/latest`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } });
    return { tag: typeof data?.tag_name === "string" ? data.tag_name.slice(0, 180) : null, publishedAt: typeof data?.published_at === "string" ? data.published_at : null };
  } catch { return { tag: null, publishedAt: null }; }
}
export async function getGitHubCommitActivity(token: string, repository: GitHubRepo): Promise<number[]> {
  const owner = repository.owner?.login;
  if (!owner) return [];
  try {
    const { data } = await axios.get(`${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository.name)}/stats/commit_activity`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } });
    return Array.isArray(data) ? data.slice(-12).map((week: { total?: number }) => Math.max(0, Number(week.total || 0))) : [];
  } catch { return []; }
}
export async function getGitHubOrganizationRepos(token: string): Promise<GitHubRepo[]> {
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" };
  const { data: organizations } = await axios.get(`${GITHUB_API}/user/orgs?per_page=100`, { headers });
  const repositories = await Promise.all((Array.isArray(organizations) ? organizations : []).slice(0, 50).map(async (organization: { login?: string }) => {
    if (!organization.login) return [] as GitHubRepo[];
    const { data } = await axios.get(`${GITHUB_API}/orgs/${encodeURIComponent(organization.login)}/repos?type=all&sort=updated&per_page=100`, { headers });
    return Array.isArray(data) ? data as GitHubRepo[] : [];
  }));
  return repositories.flat();
}
export type SummaryTone = "thoughtful" | "technical" | "playful";
export type SummaryLength = "short" | "standard" | "detailed";
export type SummaryOptions = { tone?: SummaryTone; length?: SummaryLength };

export async function summarizeRepository(repo: { name: string; description?: string | null; language?: string | null }, options: SummaryOptions = {}) {
  const tone = options.tone ?? "thoughtful";
  const length = options.length ?? "standard";
  const sentenceTarget = length === "short" ? "one sentence" : length === "detailed" ? "three sentences" : "two sentences";
  const prompt = `Write a concise, specific ${sentenceTarget} portfolio summary for the GitHub repository ${repo.name}. Description: ${repo.description || "No description"}. Primary language: ${repo.language || "Not specified"}. Use a ${tone} voice. Focus on what it does and the engineering intent. Do not use hype or markdown.`;
  const base = process.env.POLLINATIONS_API_URL || (process.env.POLLINATIONS_API_KEY ? "https://gen.pollinations.ai" : "https://text.pollinations.ai");
  try {
    const url = `${base.replace(/\/$/, "")}/text/${encodeURIComponent(prompt)}?model=openai&seed=42`;
    const response = await axios.get(url, { timeout: 15000, headers: process.env.POLLINATIONS_API_KEY ? { Authorization: `Bearer ${process.env.POLLINATIONS_API_KEY}` } : undefined });
    return typeof response.data === "string" ? response.data.trim() : response.data?.text || "A focused project with a clear engineering point of view.";
  } catch { return "A focused project with a clear engineering point of view."; }
}

type NarrativeInput = { bio?: string | null; repositories: Array<{ name: string; description?: string | null; language?: string | null }> };

function fallbackNarrative(input: NarrativeInput) {
  const languages = Array.from(new Set(input.repositories.map((repo) => repo.language).filter((language): language is string => Boolean(language)))).slice(0, 4);
  const lead = languages.slice(0, 2).join(" and ") || "thoughtful software";
  return {
    headline: `Building thoughtful products with ${lead}.`,
    skills: languages.length ? languages : ["Product engineering", "Interface systems", "Developer tools"],
  };
}

export async function generatePortfolioNarrative(input: NarrativeInput) {
  const fallback = fallbackNarrative(input);
  const repositoryContext = input.repositories.slice(0, 12).map((repo) => `${repo.name} (${repo.language || "unknown"}): ${repo.description || "no description"}`).join("; ");
  const prompt = `Create a precise developer portfolio headline and 3 to 5 concise technology or craft skill clusters. Return valid JSON only with this exact shape: {"headline":"...","skills":["..."]}. Bio: ${input.bio || "not provided"}. Repositories: ${repositoryContext || "none"}. Avoid hype, markdown, and generic phrases.`;
  const base = process.env.POLLINATIONS_API_URL || (process.env.POLLINATIONS_API_KEY ? "https://gen.pollinations.ai" : "https://text.pollinations.ai");
  try {
    const url = `${base.replace(/\/$/, "")}/text/${encodeURIComponent(prompt)}?model=openai&seed=67`;
    const response = await axios.get(url, { timeout: 15000, headers: process.env.POLLINATIONS_API_KEY ? { Authorization: `Bearer ${process.env.POLLINATIONS_API_KEY}` } : undefined });
    const raw = typeof response.data === "string" ? response.data : response.data?.text;
    const json = typeof raw === "string" ? raw.replace(/```json|```/gi, "").match(/\{[\s\S]*\}/)?.[0] : null;
    if (!json) return fallback;
    const parsed = JSON.parse(json) as { headline?: unknown; skills?: unknown };
    const headline = typeof parsed.headline === "string" && parsed.headline.trim() ? parsed.headline.trim().slice(0, 160) : fallback.headline;
    const skills = Array.isArray(parsed.skills) ? parsed.skills.filter((skill): skill is string => typeof skill === "string" && Boolean(skill.trim())).map((skill) => skill.trim().slice(0, 48)).slice(0, 5) : fallback.skills;
    return { headline, skills: skills.length ? skills : fallback.skills };
  } catch {
    return fallback;
  }
}

export const integrationConfig = {
  githubConfigured: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
  supabaseConfigured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
  paddleConfigured: Boolean(process.env.PADDLE_API_KEY && process.env.PADDLE_PRICE_ID),
  pollinationsEndpoint: process.env.POLLINATIONS_API_URL || (process.env.POLLINATIONS_API_KEY ? "https://gen.pollinations.ai" : "https://text.pollinations.ai"),
  storageMode: process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY ? "supabase" : "local-sqlite",
  paidTiers: process.env.PADDLE_API_KEY && process.env.PADDLE_PRICE_ID ? ["pro", "pro-plus"] : [],
};
