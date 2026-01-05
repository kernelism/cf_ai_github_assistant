import { FileNode, IssueInfo, PRInfo, RepoIndex } from "./utils";

function parseGitHubUrl(url: string): { owner: string; repo: string } {
    const regex = /(?:https?:\/\/)?github\.com\/([^\/]+)\/([^\/\s?#]+)/;
    const match = url.match(regex);
    if (!match) {
        throw new Error("Invalid GitHub repository URL");
    }
    return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
}

async function githubFetch<T>(url: string, headers: Record<string, string>): Promise<T | null> {
    try {
        const response = await fetch(url, { headers });
        if (!response.ok) {
            console.log(`GitHub API error for ${url}: ${response.status}`);
            return null;
        }
        return await response.json() as T;
    } catch (error) {
        console.log(`Fetch error for ${url}:`, error);
        return null;
    }
}

async function fetchRepoMetadata(owner: string, repo: string, headers: Record<string, string>) {
    const url = `https://api.github.com/repos/${owner}/${repo}`;
    return githubFetch<{
        name: string;
        full_name: string;
        description: string | null;
        html_url: string;
        default_branch: string;
        language: string | null;
        topics: string[];
        stargazers_count: number;
        forks: number;
        open_issues_count: number;
    }>(url, headers);
}

async function fetchFileContent(owner: string, repo: string, path: string, headers: Record<string, string>): Promise<string | null> {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const data = await githubFetch<{ content?: string; encoding?: string }>(url, headers);
    
    if (data?.content && data.encoding === 'base64') {
        try {
            return atob(data.content.replace(/\n/g, ''));
        } catch {
            return null;
        }
    }
    return null;
}

async function fetchFileTree(owner: string, repo: string, headers: Record<string, string>, path: string = '', depth: number = 0, maxDepth: number = 3): Promise<FileNode[]> {
    if (depth > maxDepth) return [];
    
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const data = await githubFetch<Array<{ path: string; type: string; size?: number }>>(url, headers);
    
    if (!data || !Array.isArray(data)) return [];
    
    const nodes: FileNode[] = [];
    const dirPromises: Promise<FileNode[]>[] = [];
    
    for (const item of data) {
        nodes.push({
            path: item.path,
            type: item.type === 'dir' ? 'dir' : 'file',
            size: item.size
        });
        
        if (item.type === 'dir' && !shouldSkipDirectory(item.path)) {
            dirPromises.push(fetchFileTree(owner, repo, headers, item.path, depth + 1, maxDepth));
        }
    }
    
    const nestedResults = await Promise.all(dirPromises);
    for (const nested of nestedResults) {
        nodes.push(...nested);
    }
    
    return nodes;
}

function shouldSkipDirectory(path: string): boolean {
    const skipDirs = [
        'node_modules', '.git', 'dist', 'build', 'coverage', 
        '.next', '.nuxt', 'vendor', '__pycache__', '.venv',
        'target', 'out', '.idea', '.vscode', 'assets', 'public/assets'
    ];
    const dirName = path.split('/').pop() || '';
    return skipDirs.includes(dirName) || dirName.startsWith('.');
}

async function fetchIssues(owner: string, repo: string, headers: Record<string, string>, limit: number = 30): Promise<IssueInfo[]> {
    const url = `https://api.github.com/repos/${owner}/${repo}/issues?state=open&per_page=${limit}&sort=updated`;
    const data = await githubFetch<Array<{
        number: number;
        title: string;
        body: string | null;
        state: string;
        labels: Array<{ name: string }>;
        user: { login: string };
        created_at: string;
        comments: number;
        html_url: string;
        pull_request?: unknown;
    }>>(url, headers);
    
    if (!data) return [];
    
    return data
        .filter(item => !item.pull_request)
        .map(issue => ({
            number: issue.number,
            title: issue.title,
            body: issue.body ? truncateText(issue.body, 500) : null,
            state: issue.state,
            labels: issue.labels.map(l => l.name),
            author: issue.user.login,
            createdAt: issue.created_at,
            commentsCount: issue.comments,
            url: issue.html_url
        }));
}

async function fetchPullRequests(owner: string, repo: string, headers: Record<string, string>, limit: number = 15): Promise<PRInfo[]> {
    const url = `https://api.github.com/repos/${owner}/${repo}/pulls?state=open&per_page=${limit}&sort=updated`;
    const data = await githubFetch<Array<{
        number: number;
        title: string;
        body: string | null;
        state: string;
        user: { login: string };
        created_at: string;
        html_url: string;
        draft: boolean;
    }>>(url, headers);
    
    if (!data) return [];
    
    return data.map(pr => ({
        number: pr.number,
        title: pr.title,
        body: pr.body ? truncateText(pr.body, 300) : null,
        state: pr.state,
        author: pr.user.login,
        createdAt: pr.created_at,
        url: pr.html_url,
        draft: pr.draft
    }));
}

async function fetchLanguages(owner: string, repo: string, headers: Record<string, string>): Promise<Record<string, number>> {
    const url = `https://api.github.com/repos/${owner}/${repo}/languages`;
    const data = await githubFetch<Record<string, number>>(url, headers);
    return data || {};
}

function truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

async function indexRepository(url: string, headers: Record<string, string>): Promise<RepoIndex | null> {
    const { owner, repo } = parseGitHubUrl(url);
    console.log(`Indexing repository: ${owner}/${repo}`);
    
    const [metadata, readme, contributing, fileTree, issues, pullRequests, languages] = await Promise.all([
        fetchRepoMetadata(owner, repo, headers),
        fetchFileContent(owner, repo, 'README.md', headers),
        fetchFileContent(owner, repo, 'CONTRIBUTING.md', headers),
        fetchFileTree(owner, repo, headers),
        fetchIssues(owner, repo, headers),
        fetchPullRequests(owner, repo, headers),
        fetchLanguages(owner, repo, headers)
    ]);
    
    if (!metadata) {
        console.log('Failed to fetch repository metadata');
        return null;
    }
    
    const index: RepoIndex = {
        name: metadata.name,
        fullName: metadata.full_name,
        description: metadata.description,
        htmlUrl: metadata.html_url,
        defaultBranch: metadata.default_branch,
        language: metadata.language,
        topics: metadata.topics || [],
        stars: metadata.stargazers_count,
        forks: metadata.forks,
        openIssuesCount: metadata.open_issues_count,
        readme: readme ? truncateText(readme, 8000) : null,
        contributing: contributing ? truncateText(contributing, 3000) : null,
        fileTree,
        issues,
        pullRequests,
        indexedAt: new Date().toISOString(),
        languages
    };
    
    console.log(`Indexed: ${fileTree.length} files, ${issues.length} issues, ${pullRequests.length} PRs`);
    return index;
}

async function fetchFilesContent(owner: string, repo: string, paths: string[], headers: Record<string, string>): Promise<Record<string, string>> {
    const results: Record<string, string> = {};
    
    const promises = paths.slice(0, 5).map(async (path) => {
        const content = await fetchFileContent(owner, repo, path, headers);
        if (content) {
            results[path] = truncateText(content, 6000);
        }
    });
    
    await Promise.all(promises);
    return results;
}

function buildContext(index: RepoIndex, additionalFiles?: Record<string, string>): string {
    const sections: string[] = [];
    
    sections.push(`## Repository: ${index.fullName}`);
    sections.push(`**Description:** ${index.description || 'No description'}`);
    sections.push(`**Primary Language:** ${index.language || 'Unknown'}`);
    sections.push(`**Stars:** ${index.stars} | **Forks:** ${index.forks} | **Open Issues:** ${index.openIssuesCount}`);
    
    if (index.topics.length > 0) {
        sections.push(`**Topics:** ${index.topics.join(', ')}`);
    }
    
    const totalBytes = Object.values(index.languages).reduce((a, b) => a + b, 0);
    if (totalBytes > 0) {
        const langBreakdown = Object.entries(index.languages)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([lang, bytes]) => `${lang} (${Math.round(bytes / totalBytes * 100)}%)`)
            .join(', ');
        sections.push(`**Languages:** ${langBreakdown}`);
    }
    
    sections.push('\n## File Structure');
    const importantFiles = index.fileTree
        .filter(f => f.type === 'file')
        .filter(f => isImportantFile(f.path))
        .slice(0, 30)
        .map(f => f.path);
    
    if (importantFiles.length > 0) {
        sections.push('Key files:\n' + importantFiles.map(f => `- ${f}`).join('\n'));
    }
    
    const dirs = Array.from(new Set(index.fileTree.filter(f => f.type === 'dir').map(f => f.path.split('/')[0])));
    if (dirs.length > 0) {
        sections.push('\nTop-level directories: ' + dirs.slice(0, 15).join(', '));
    }
    
    if (index.readme) {
        sections.push('\n## README (excerpt)');
        sections.push(truncateText(index.readme, 2000));
    }
    
    if (index.contributing) {
        sections.push('\n## Contributing Guidelines (excerpt)');
        sections.push(truncateText(index.contributing, 1000));
    }
    
    if (index.issues.length > 0) {
        sections.push('\n## Open Issues');
        sections.push('(IMPORTANT: When mentioning ANY issue, use the markdown link format shown below with the exact URL)');
        
        const goodFirstIssues = index.issues.filter(i => 
            i.labels.some(l => l.toLowerCase().includes('good first') || l.toLowerCase().includes('beginner'))
        );
        
        if (goodFirstIssues.length > 0) {
            sections.push('\n### Good First Issues');
            for (const issue of goodFirstIssues.slice(0, 5)) {
                sections.push(formatIssue(issue));
            }
        }
        
        const helpWanted = index.issues.filter(i => 
            i.labels.some(l => l.toLowerCase().includes('help wanted'))
        );
        
        if (helpWanted.length > 0) {
            sections.push('\n### Help Wanted');
            for (const issue of helpWanted.slice(0, 5)) {
                sections.push(formatIssue(issue));
            }
        }
        
        sections.push('\n### Recent Issues');
        for (const issue of index.issues.slice(0, 10)) {
            sections.push(formatIssue(issue));
        }
    }
    
    if (index.pullRequests.length > 0) {
        sections.push('\n## Open Pull Requests');
        sections.push('(Use these exact URLs when linking to PRs)');
        for (const pr of index.pullRequests.slice(0, 5)) {
            sections.push(`- [#${pr.number}](${pr.url}) ${pr.title} by @${pr.author}${pr.draft ? ' (draft)' : ''}`);
        }
    }
    
    if (additionalFiles && Object.keys(additionalFiles).length > 0) {
        sections.push('\n## File Contents (ACTUAL CODE - you may quote this)');
        for (const [path, content] of Object.entries(additionalFiles)) {
            const ext = path.split('.').pop() || '';
            sections.push(`\n### ${path}`);
            sections.push('```' + ext);
            sections.push(content);
            sections.push('```');
        }
    } else {
        sections.push('\n## Note: No file contents loaded');
        sections.push('To see actual code, the user should ask about specific files. Do NOT make up code.');
    }
    
    return sections.join('\n');
}

function formatIssue(issue: IssueInfo): string {
    const labels = issue.labels.length > 0 ? ` [${issue.labels.join(', ')}]` : '';
    const comments = issue.commentsCount > 0 ? ` (${issue.commentsCount} comments)` : '';
    let result = `- [#${issue.number}](${issue.url}) ${issue.title}${labels}${comments}`;
    if (issue.body) {
        result += `\n  > ${truncateText(issue.body, 150).replace(/\n/g, ' ')}`;
    }
    return result;
}

function isImportantFile(path: string): boolean {
    const importantPatterns = [
        /^readme/i, /^contributing/i, /^changelog/i, /^license/i,
        /package\.json$/, /tsconfig\.json$/, /\.config\.(js|ts|mjs)$/,
        /^src\/index\.(ts|js|tsx|jsx)$/, /^src\/main\.(ts|js|tsx|jsx)$/,
        /^src\/app\.(ts|js|tsx|jsx)$/, /^index\.(ts|js|tsx|jsx)$/,
        /^main\.(ts|js|py|go|rs)$/, /^app\.(ts|js|py)$/,
        /requirements\.txt$/, /pyproject\.toml$/, /Cargo\.toml$/,
        /go\.mod$/, /Makefile$/, /Dockerfile$/,
        /\.github\/workflows\//, /^\.env\.example$/
    ];
    return importantPatterns.some(pattern => pattern.test(path));
}

function parseQueryAnalysis(response: string): { needsFiles: boolean; files: string[] } {
    try {
        const cleaned = response.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
        const parsed = JSON.parse(cleaned);
        return {
            needsFiles: Boolean(parsed.needsFiles),
            files: Array.isArray(parsed.files) ? parsed.files : []
        };
    } catch {
        return { needsFiles: false, files: [] };
    }
}

export {
    parseGitHubUrl,
    indexRepository,
    fetchFilesContent,
    buildContext,
    parseQueryAnalysis,
    truncateText
};
