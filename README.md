# GitHub Contribution Assistant

A specialized AI assistant that helps developers understand GitHub repositories and find meaningful contribution opportunities. Built with React, TypeScript, and Cloudflare Workers, it combines real-time repository data with intelligent analysis to provide actionable insights.

## About

The GitHub Contribution Assistant is designed to solve a common problem: when you discover an interesting open source project, understanding its structure, finding good first issues, and figuring out where to start can be overwhelming. This tool bridges that gap by automatically indexing repositories and providing contextual answers about code structure, open issues, and contribution opportunities.

Unlike generic AI assistants, this tool has direct access to the repository's actual data—file structure, README content, open issues, pull requests, and even specific source code files when needed. It doesn't guess or hallucinate; it works with real, up-to-date information from the GitHub API.

## Features

**Real-time Repository Data**
- Fetches current information directly from GitHub's API, including the latest issues, file structure, and repository metadata
- Automatically indexes repository metadata, file structure, README, and contributing guidelines
- Indexes open issues and pull requests with labels and metadata
- Analyzes language distribution and repository topics
- Caches results for 30 minutes to reduce API calls

**Context-Aware Responses**
- Provides answers tailored to the specific repository you're exploring, not generic advice
- Understands natural language questions about the repository
- Automatically determines when to fetch additional source files based on your question
- Provides structured responses with proper markdown formatting

**Accurate Information**
- Uses actual issue numbers and URLs from the repository when mentioning issues or pull requests
- Intelligently determines which source files to examine based on your question, then fetches and analyzes the actual code
- Explicitly designed to only use information it has actually retrieved, preventing made-up code snippets or incorrect details
- Builds a comprehensive index of the repository including file tree, languages, topics, and contribution guidelines

**Smart Context Building**
- Analyzes your question to determine what information is needed
- Fetches specific source files only when necessary
- Prioritizes entry points, config files, and core source files
- Limits file fetching to prevent token overflow

**Transparent Process**
- Shows thinking steps so you understand what the assistant is doing
- Displays which files were loaded and why
- Provides repository statistics after indexing

## Setup for Local Development

### Prerequisites

- Node.js 18 or higher
- npm or yarn
- A GitHub Personal Access Token with `public_repo` scope (or `repo` for private repositories)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd github-assistant
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.dev.vars` file in the root directory:
```bash
GITHUB_PAT=your_github_personal_access_token_here
```

To create a GitHub Personal Access Token:
- Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
- Click "Generate new token (classic)"
- Give it a descriptive name
- Select the `public_repo` scope (or `repo` for private repos)
- Copy the token and paste it into your `.dev.vars` file

4. Configure `wrangler.toml` for Cloudflare Workers:

Create or update `wrangler.toml` in the root directory with the following configuration:

```toml
name = "github-assistant"
compatibility_date = "2025-04-03"
assets = { not_found_handling = "single-page-application" }
main = "./worker/index.ts"

[ai]
binding = "AI"

[[kv_namespaces]]
binding = "CACHE_KV"
id = "your-kv-namespace-id-here"
```

**Important**: Replace `your-kv-namespace-id-here` with your actual KV namespace ID. To create a KV namespace:

```bash
wrangler kv:namespace create "CACHE_KV"
```

This will output a namespace ID. Copy that ID and replace it in `wrangler.toml`.

5. Connect to your Cloudflare account:

```bash
wrangler login
```

This will open a browser window for you to authenticate with your Cloudflare account.

6. Start the development server:

```bash
npm run dev
```

The application will be available at `http://localhost:5173` (or the port Vite assigns).

### Building for Production

```bash
npm run build
```

For Cloudflare Workers deployment, set the secret in production:

```bash
wrangler secret put GITHUB_PAT
```

This will securely store your token in Cloudflare's encrypted secret storage.

## How to Use

### Step 1: Index a Repository

Enter a GitHub repository URL in the format `github.com/owner/repo` or `https://github.com/owner/repo`. Click "Index Repository" to start the process.

The assistant will:
- Fetch repository metadata (description, stars, forks, languages)
- Read the README and CONTRIBUTING files
- Build a file tree of the repository structure
- Load open issues and pull requests
- Cache everything for 30 minutes

### Step 2: Ask Questions

Once indexed, you can ask questions like:

- "What are some good first issues I could work on?"
- "How is this project structured?"
- "Explain how the authentication system works"
- "What files should I look at to understand the API?"
- "Show me the entry point of this application"
- "What open pull requests need review?"

The assistant will:
- Analyze your question to determine what information is needed
- Fetch additional source files if your question requires code analysis
- Provide a detailed answer with proper formatting and links
- Show you the thinking process it went through

### Example Workflow

1. You paste `github.com/facebook/react` and click index
2. The system indexes the repository and shows you stats
3. You ask: "What are good first issues for beginners?"
4. The assistant analyzes the indexed issues, filters for "good first issue" labels, and provides links to specific issues with context
5. You ask: "How does the component rendering work?"
6. The assistant determines it needs to look at source files, fetches relevant files like `ReactDOM.js` and `ReactComponent.js`, then explains based on actual code

### Tips for Best Results

- Be specific: "How does authentication work?" is better than "Tell me about this repo"
- Ask follow-up questions: The repository stays indexed, so you can have a conversation
- Reference specific features: "Where is the API rate limiting implemented?" will trigger file fetching
- Use natural language: You don't need to use technical jargon

## Technical Details

This project uses:
- **Frontend**: React 19 with TypeScript, Tailwind CSS, and Vite
- **Backend**: Cloudflare Workers with TypeScript
- **AI**: Cloudflare AI (Llama 3.3 70B) for question analysis and answer generation
- **Storage**: Cloudflare KV for caching repository indexes
- **API**: GitHub REST API v3

The architecture separates concerns cleanly:
- `worker/index.ts` handles HTTP requests and routing
- `worker/tools.ts` contains all GitHub API interaction logic
- `worker/utils.ts` defines types, constants, and helper functions
- The frontend provides a clean chat interface with markdown rendering

Repository indexes are cached for 30 minutes to balance freshness with API rate limits. The system intelligently fetches additional files only when needed, keeping token usage efficient.

## Contributing

Contributions are welcome! If you find bugs or have feature ideas, please open an issue. For code contributions, make sure to:

1. Follow the existing code style
2. Add appropriate error handling
3. Test your changes locally
4. Update documentation if needed

## License

MIT