import { Env, RepoIndex, CACHE_TTL, SYSTEM_PROMPT, QUERY_ANALYZER_PROMPT, createHeaders } from "./utils";
import { ExecutionContext } from "@cloudflare/workers-types/experimental";
import { 
    parseGitHubUrl, 
    indexRepository, 
    fetchFilesContent, 
    buildContext,
    parseQueryAnalysis
} from "./tools";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    console.log("Received request for:", url.pathname);
        
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        };
        
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }
        
    if (url.pathname.startsWith("/api/")) {
            try {
      switch (url.pathname) {
        case "/api/index-repo": {
                        const result = await handleRepoIndexing(request, env);
                        return new Response(JSON.stringify(result), {
                            status: result.success ? 200 : 500,
                            headers: { 'Content-Type': 'application/json', ...corsHeaders }
                        });
        }
        case "/api/ask": {
                        const body = await request.json() as { url: string; question: string };
                        const result = await handleQuestion(body.url, body.question, env);
                        return new Response(JSON.stringify(result), {
                            status: 200,
                            headers: { 'Content-Type': 'application/json', ...corsHeaders }
                        });
                    }
                    case "/api/repo-status": {
                        const body = await request.json() as { url: string };
                        const index = await getRepoIndex(body.url, env);
                        return new Response(JSON.stringify({
                            indexed: !!index,
                            indexedAt: index?.indexedAt || null,
                            issuesCount: index?.issues.length || 0,
                            filesCount: index?.fileTree.length || 0
                        }), {
                            status: 200,
                            headers: { 'Content-Type': 'application/json', ...corsHeaders }
                        });
                    }
                }
            } catch (error) {
                console.error("API Error:", error);
                return new Response(JSON.stringify({ 
                    error: error instanceof Error ? error.message : 'Unknown error' 
                }), {
                    status: 500,
                    headers: { 'Content-Type': 'application/json', ...corsHeaders }
                });
            }
        }
        
    return new Response(null, { status: 404 });
  }
};

async function getRepoIndex(url: string, env: Env): Promise<RepoIndex | null> {
    const cacheKey = `repo:${url}`;
    const cached = await env.CACHE_KV.get(cacheKey);
    if (cached) {
        return JSON.parse(cached) as RepoIndex;
    }
    return null;
}

async function handleRepoIndexing(request: Request, env: Env): Promise<{ success: boolean; message: string; stats?: object }> {
    const body = await request.json() as { url: string };
    const url = body.url;
    
    console.log("Indexing repository:", url);
    
    const existing = await getRepoIndex(url, env);
    if (existing) {
        const indexedTime = new Date(existing.indexedAt).getTime();
        const now = Date.now();
        const age = (now - indexedTime) / 1000;
        
        if (age < CACHE_TTL) {
            console.log("Using cached index, age:", age, "seconds");
            const goodFirstCount = existing.issues.filter(i => 
                i.labels.some(l => l.toLowerCase().includes('good first'))
            ).length;
            const helpWantedCount = existing.issues.filter(i => 
                i.labels.some(l => l.toLowerCase().includes('help wanted'))
            ).length;
            
            return {
                success: true,
                message: "Repository already indexed",
                stats: {
                    name: existing.name,
                    fullName: existing.fullName,
                    description: existing.description,
                    language: existing.language,
                    stars: existing.stars,
                    forks: existing.forks,
                    openIssues: existing.openIssuesCount,
                    filesIndexed: existing.fileTree.length,
                    recentIssuesLoaded: existing.issues.length,
                    recentPRsLoaded: existing.pullRequests.length,
                    goodFirstIssues: goodFirstCount > 0 ? goodFirstCount : null,
                    helpWantedIssues: helpWantedCount > 0 ? helpWantedCount : null,
                    hasReadme: !!existing.readme,
                    hasContributing: !!existing.contributing,
                    cached: true,
                    indexedAt: existing.indexedAt
                }
            };
        }
    }
    
    const headers = createHeaders(env);
    const index = await indexRepository(url, headers);
    
    if (!index) {
        return {
            success: false,
            message: "Failed to index repository. Check if the URL is correct and the repository is public."
        };
    }
    
    const cacheKey = `repo:${url}`;
    await env.CACHE_KV.put(cacheKey, JSON.stringify(index), { expirationTtl: CACHE_TTL });
    
    const goodFirstCount = index.issues.filter(i => 
        i.labels.some(l => l.toLowerCase().includes('good first'))
    ).length;
    const helpWantedCount = index.issues.filter(i => 
        i.labels.some(l => l.toLowerCase().includes('help wanted'))
    ).length;
    
    return {
        success: true,
        message: "Repository indexed successfully",
        stats: {
            name: index.name,
            fullName: index.fullName,
            description: index.description,
                    language: index.language,
                    stars: index.stars,
                    forks: index.forks,
                    openIssues: index.openIssuesCount,
                    filesIndexed: index.fileTree.length,
            recentIssuesLoaded: index.issues.length,
            recentPRsLoaded: index.pullRequests.length,
            goodFirstIssues: goodFirstCount > 0 ? goodFirstCount : null,
            helpWantedIssues: helpWantedCount > 0 ? helpWantedCount : null,
            hasReadme: !!index.readme,
            hasContributing: !!index.contributing,
            indexedAt: index.indexedAt
        }
    };
}

interface ThinkingStep {
    step: string;
    detail: string;
    status: 'done' | 'working';
}

async function handleQuestion(url: string, question: string, env: Env): Promise<{ answer: string; thinking: ThinkingStep[]; debug?: object }> {
    console.log("Question:", question);
    
    const thinking: ThinkingStep[] = [];
    
    thinking.push({ step: "Loading repository data", detail: "Checking cached index", status: 'done' });
    
    let index = await getRepoIndex(url, env);
    
    if (!index) {
        thinking.push({ step: "Rebuilding index", detail: "Cache expired, fetching fresh data", status: 'done' });
        console.log("Index not found, rebuilding...");
        const headers = createHeaders(env);
        index = await indexRepository(url, headers);
        
        if (!index) {
            return {
                answer: "I couldn't access this repository. Please make sure the URL is correct and the repository is public, then try indexing it again.",
                thinking: [{ step: "Error", detail: "Failed to access repository", status: 'done' }]
            };
        }
        
        const cacheKey = `repo:${url}`;
        await env.CACHE_KV.put(cacheKey, JSON.stringify(index), { expirationTtl: CACHE_TTL });
    }
    
    thinking.push({ 
        step: "Repository loaded", 
        detail: `${index.fileTree.length} files, ${index.issues.length} issues indexed`, 
        status: 'done' 
    });
    
    const { owner, repo } = parseGitHubUrl(url);
    
    thinking.push({ step: "Analyzing question", detail: "Determining what data is needed", status: 'done' });
    
    let additionalFiles: Record<string, string> = {};
    const shouldFetchFiles = await analyzeQuery(question, index, env);
    
    if (shouldFetchFiles.needsFiles && shouldFetchFiles.files.length > 0) {
        thinking.push({ 
            step: "Fetching source files", 
            detail: shouldFetchFiles.files.map(f => f.split('/').pop()).join(', '), 
            status: 'done' 
        });
        console.log("Fetching additional files:", shouldFetchFiles.files);
        const headers = createHeaders(env);
        additionalFiles = await fetchFilesContent(owner, repo, shouldFetchFiles.files, headers);
        
        const fetchedFiles = Object.keys(additionalFiles);
        if (fetchedFiles.length > 0) {
            thinking.push({ 
                step: "Files loaded", 
                detail: fetchedFiles.map(f => `\`${f}\``).join(', '), 
                status: 'done' 
            });
        }
    } else {
        thinking.push({ 
            step: "Using indexed data", 
            detail: "No additional file fetching needed", 
            status: 'done' 
        });
    }
    
    thinking.push({ step: "Building context", detail: "Preparing repository context for analysis", status: 'done' });
    const context = buildContext(index, additionalFiles);
    
    thinking.push({ step: "Generating response", detail: "Analyzing with AI", status: 'done' });
    const answer = await generateAnswer(question, context, env);
    
    return {
        answer,
        thinking,
        debug: {
            filesInIndex: index.fileTree.length,
            issuesInIndex: index.issues.length,
            additionalFilesFetched: Object.keys(additionalFiles).length,
            contextLength: context.length
        }
    };
}

async function analyzeQuery(question: string, index: RepoIndex, env: Env): Promise<{ needsFiles: boolean; files: string[] }> {
    const lowerQuestion = question.toLowerCase();
    
    const issueOnlyPatterns = [
        /^(find|list|show).*(issue|bug|pr|pull request)/i,
        /good first issue/i,
        /help wanted/i,
        /how (do i|can i|to) contribute/i,
        /contribution guide/i
    ];
    
    if (issueOnlyPatterns.some(p => p.test(question))) {
        return { needsFiles: false, files: [] };
    }
    
    const needsCodePatterns = [
        /architect/i,
        /structure/i,
        /how does .+ work/i,
        /explain/i,
        /code/i,
        /implementation/i,
        /where is/i,
        /show me/i,
        /what does .+ do/i,
        /entry point/i,
        /main file/i,
        /config/i,
        /setup/i,
        /snippet/i
    ];
    
    const likelyNeedsCode = needsCodePatterns.some(p => p.test(question));
    
    if (!likelyNeedsCode) {
        return { needsFiles: false, files: [] };
    }
    
    // Use LLM to determine specific files needed
    const fileList = index.fileTree
        .filter(f => f.type === 'file')
        .map(f => f.path)
        .slice(0, 100)
        .join('\n');
    
    const prompt = `Question: ${question}

Available files:
${fileList}

${QUERY_ANALYZER_PROMPT}`;
    
    try {
        const response = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
            messages: [{ role: "user", content: prompt }],
            max_tokens: 256
        });
        
        const responseText = extractResponseText(response);
        return parseQueryAnalysis(responseText);
    } catch (error) {
        console.log("Query analysis error:", error);
        return { needsFiles: false, files: [] };
    }
}

async function generateAnswer(question: string, context: string, env: Env): Promise<string> {
    const userMessage = `${context}

---

**User Question:** ${question}

Please provide a helpful, well-structured response. Use markdown formatting appropriately.`;
    
    try {
        const response = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: userMessage }
            ],
            max_tokens: 2048
        });
        
        return extractResponseText(response) || "I apologize, but I couldn't generate a response. Please try rephrasing your question.";
    } catch (error) {
        console.error("LLM Error:", error);
        return "An error occurred while generating the response. Please try again.";
    }
}

function extractResponseText(response: unknown): string {
    if (typeof response === 'string') {
        return response;
    }
    if (response && typeof response === 'object') {
        const resp = response as Record<string, unknown>;
        if (typeof resp.response === 'string') {
            return resp.response;
        }
    }
    return '';
}
