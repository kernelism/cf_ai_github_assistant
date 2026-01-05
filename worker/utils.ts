import { Ai } from "@cloudflare/workers-types/experimental";
import { KVNamespace } from "@cloudflare/workers-types/experimental";

interface Env {
    AI: Ai;
    CACHE_KV: KVNamespace;
    GITHUB_PAT: string;
}

interface RepoIndex {
    name: string;
    fullName: string;
    description: string | null;
    htmlUrl: string;
    defaultBranch: string;
    language: string | null;
    topics: string[];
    stars: number;
    forks: number;
    openIssuesCount: number;
    readme: string | null;
    contributing: string | null;
    fileTree: FileNode[];
    issues: IssueInfo[];
    pullRequests: PRInfo[];
    indexedAt: string;
    languages: Record<string, number>;
}

interface FileNode {
    path: string;
    type: 'file' | 'dir';
    size?: number;
}

interface IssueInfo {
    number: number;
    title: string;
    body: string | null;
    state: string;
    labels: string[];
    author: string;
    createdAt: string;
    commentsCount: number;
    url: string;
}

interface PRInfo {
    number: number;
    title: string;
    body: string | null;
    state: string;
    author: string;
    createdAt: string;
    url: string;
    draft: boolean;
}

function createHeaders(env: Env) {
    if (!env.GITHUB_PAT) {
        throw new Error('GITHUB_PAT environment variable is not set. Please set it in .dev.vars for local development or as a secret in Cloudflare.');
    }
    return {
        'User-Agent': 'GitHubContributionAssistant',
        'X-Github-Api-Version': '2022-11-28',
        'Authorization': `Bearer ${env.GITHUB_PAT}`
    };
}

const CACHE_TTL = 1800;

const SYSTEM_PROMPT = `You are an expert GitHub Contribution Assistant. Your role is to help developers understand repositories and find meaningful ways to contribute.

CRITICAL RULES:

1. **ONLY use information provided in the context** - NEVER hallucinate or make up code, file contents, or issue details
2. **If you don't have actual code for a file, say so** - Don't invent code snippets
3. **Always link issues and PRs** - When mentioning any issue or PR, ALWAYS include the full URL in markdown link format: [#123](https://github.com/owner/repo/issues/123)
4. **Use exact data from context** - Issue titles, numbers, labels, and URLs are provided - use them exactly

Response Format:
- Use clear section headers (##) to organize your response
- When mentioning issues: ALWAYS link them as [#NUMBER](URL) using the URL from the context
- When mentioning PRs: ALWAYS link them as [#NUMBER](URL) using the URL from the context
- Only show code snippets if actual file contents are provided in the "File Contents" section
- If asked about code but no file contents are provided, explain what files would be relevant and suggest which ones to look at
- Reference file paths using inline code: \`src/file.ts\`
- Keep paragraphs short (2-3 sentences max)

What you CAN do:
- Describe the project structure based on the file tree
- List and link to actual issues with their real titles and labels
- Explain what the README says (if provided)
- Suggest which files might be relevant based on names/paths
- Quote actual code from the "File Contents" section if provided

What you CANNOT do:
- Make up or guess code contents
- Invent issue numbers or details not in the context
- Hallucinate file contents or structure`;

const QUERY_ANALYZER_PROMPT = `You are analyzing a user's question to determine which source files to fetch.

Respond with JSON only:
{
  "needsFiles": true,
  "files": ["path/to/file1.ts", "path/to/file2.ts"],
  "reasoning": "brief explanation"
}

File Selection Priority:
1. Entry points: index.ts, main.ts, app.ts, index.js, main.py, etc.
2. Config files: package.json, tsconfig.json, Cargo.toml, pyproject.toml
3. Core source files in src/ or lib/ directories
4. Files mentioned or implied in the question

Rules:
- Select 3-5 most relevant files
- Prefer smaller, focused files over large ones
- For "architecture" questions: get entry points + key config files
- For "how does X work": get files likely to contain X
- ALWAYS include at least one source code file for code questions`;

export { 
    Env, 
    RepoIndex, 
    FileNode, 
    IssueInfo, 
    PRInfo, 
    createHeaders, 
    CACHE_TTL,
    SYSTEM_PROMPT,
    QUERY_ANALYZER_PROMPT
};
