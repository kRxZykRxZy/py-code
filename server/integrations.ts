import axios from "axios";

const GITHUB_API = "https://api.github.com";

export type GitHubProfile = { id: number; login: string; name: string | null; bio: string | null; avatar_url: string; location: string | null; blog: string | null };
export type GitHubRepo = { id: number; name: string; description: string | null; language: string | null; stargazers_count: number; forks_count: number; html_url: string; homepage: string | null };

export async function getGitHubProfile(token: string): Promise<GitHubProfile> {
  const { data } = await axios.get(`${GITHUB_API}/user`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } });
  return data;
}
export async function getGitHubRepos(token: string): Promise<GitHubRepo[]> {
  const { data } = await axios.get(`${GITHUB_API}/user/repos?visibility=public&affiliation=owner&sort=updated&per_page=100`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } });
  return data;
}
export async function summarizeRepository(repo: { name: string; description?: string | null; language?: string | null }) {
  const prompt = `Write a concise, specific 2-sentence portfolio summary for the GitHub repository ${repo.name}. Description: ${repo.description || "No description"}. Primary language: ${repo.language || "Not specified"}. Focus on what it does and the engineering intent. Do not use hype or markdown.`;
  const base = process.env.POLLINATIONS_API_URL || (process.env.POLLINATIONS_API_KEY ? "https://gen.pollinations.ai" : "https://text.pollinations.ai");
  try {
    const url = `${base.replace(/\/$/, "")}/text/${encodeURIComponent(prompt)}?model=openai&seed=42`;
    const response = await axios.get(url, { timeout: 15000, headers: process.env.POLLINATIONS_API_KEY ? { Authorization: `Bearer ${process.env.POLLINATIONS_API_KEY}` } : undefined });
    return typeof response.data === "string" ? response.data.trim() : response.data?.text || "A focused project with a clear engineering point of view.";
  } catch { return "A focused project with a clear engineering point of view."; }
}

export const integrationConfig = {
  githubConfigured: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
  supabaseConfigured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
  paddleConfigured: Boolean(process.env.PADDLE_API_KEY && process.env.PADDLE_PRICE_ID),
  pollinationsEndpoint: process.env.POLLINATIONS_API_URL || (process.env.POLLINATIONS_API_KEY ? "https://gen.pollinations.ai" : "https://text.pollinations.ai"),
  storageMode: process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY ? "supabase" : "local-sqlite",
  paidTiers: process.env.PADDLE_API_KEY && process.env.PADDLE_PRICE_ID ? ["pro", "pro-plus"] : [],
};
