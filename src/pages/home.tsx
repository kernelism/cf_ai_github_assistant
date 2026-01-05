import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

interface ThinkingStep {
  step: string;
  detail: string;
  status: 'done' | 'working';
}

interface Message {
  id: string;
  type: 'user' | 'assistant' | 'system';
  content: string;
  thinking?: ThinkingStep[];
  timestamp: Date;
}

interface RepoStats {
  name: string;
  fullName: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  openIssues: number;
  filesIndexed: number;
  recentIssuesLoaded: number;
  recentPRsLoaded: number;
  goodFirstIssues: number | null;
  helpWantedIssues: number | null;
  hasReadme: boolean;
  hasContributing: boolean;
  indexedAt: string;
}

const formatNumber = (num: number): string => {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
  return num.toString();
};

const Home = () => {
  const [indexingPhase, setIndexingPhase] = useState<'idle' | 'indexing' | 'indexed'>('idle');
  const [url, setUrl] = useState('');
  const [isIndexing, setIsIndexing] = useState(false);
  const [error, setError] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isWaiting, setIsWaiting] = useState(false);
  const [repoStats, setRepoStats] = useState<RepoStats | null>(null);
  const [currentThinking, setCurrentThinking] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, currentThinking]);

  const validateGitHubUrl = (inputUrl: string): boolean => {
    const githubUrlPattern = /^(https:\/\/)?(github\.com\/)?[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+\/?$/;
    return githubUrlPattern.test(inputUrl);
  };

  const handleIndexRepo = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!url.trim()) {
      setError('Please enter a GitHub URL or repository');
      return;
    }

    if (!validateGitHubUrl(url)) {
      setError('Invalid GitHub URL format. Use: github.com/owner/repo');
      return;
    }

    setIsIndexing(true);
    setIndexingPhase('indexing');

    try {
      const response = await fetch('/api/index-repo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.message || 'Failed to index repository');
      }

      setRepoStats(data.stats);
      setIndexingPhase('indexed');
      
      const stats = data.stats as RepoStats;
      let welcomeMsg = `Repository **${stats.fullName}** is ready.\n\n`;
      
      if (stats.description) {
        welcomeMsg += `> ${stats.description}\n\n`;
      }
      
      welcomeMsg += `---\n\n`;
      welcomeMsg += `**What would you like to know?**\n\n`;
      welcomeMsg += `- Find contribution opportunities\n\n`;
      welcomeMsg += `- Understand the codebase structure\n\n`;
      welcomeMsg += `- Explore open issues\n\n`;
      welcomeMsg += `- Get setup instructions`;

      setMessages([{
        id: '1',
        type: 'system',
        content: welcomeMsg,
        timestamp: new Date(),
      }]);
      
      inputRef.current?.focus();
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
      setIndexingPhase('idle');
    } finally {
      setIsIndexing(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!inputValue.trim() || isWaiting) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: inputValue,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsWaiting(true);
    setCurrentThinking(['Loading repository data...']);

    const placeholderId = (Date.now() + 1).toString();
    setMessages((prev) => [
      ...prev,
      {
        id: placeholderId,
        type: 'assistant',
        content: '',
        timestamp: new Date(),
      },
    ]);

    try {
      setTimeout(() => setCurrentThinking(prev => [...prev, 'Analyzing question...']), 600);
      setTimeout(() => setCurrentThinking(prev => [...prev, 'Building context...']), 1400);
      setTimeout(() => setCurrentThinking(prev => [...prev, 'Generating response...']), 2200);

      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: userMessage.content,
          url: url,
        }),
      });

      const data = await response.json();
      setCurrentThinking([]);
      
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === placeholderId
            ? { ...msg, content: data.answer || 'No response received', thinking: data.thinking }
            : msg
        )
      );
    } catch (err: any) {
      console.error('Error fetching AI response:', err);
      setCurrentThinking([]);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === placeholderId
            ? {
                ...msg,
                content: `Error: ${err.message || 'Failed to get response'}`,
                type: 'system',
              }
            : msg
        )
      );
    } finally {
      setIsWaiting(false);
      inputRef.current?.focus();
    }
  };

  const ThinkingIndicator = ({ steps }: { steps: string[] }) => (
    <div className="space-y-2.5 py-1">
      {steps.map((step, i) => (
        <div key={i} className="flex items-center gap-3 text-[13px]">
          {i === steps.length - 1 ? (
            <div className="w-3.5 h-3.5 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" />
          ) : (
            <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          )}
          <span className={i === steps.length - 1 ? 'text-slate-300' : 'text-slate-500'}>{step}</span>
        </div>
      ))}
    </div>
  );

  const ThinkingSteps = ({ steps }: { steps: ThinkingStep[] }) => (
    <div className="mb-5 pb-5 border-b border-slate-800">
      <button 
        className="flex items-center gap-2 text-[11px] font-medium text-slate-500 uppercase tracking-wider hover:text-slate-400 transition-colors"
        onClick={(e) => {
          const target = e.currentTarget.nextElementSibling as HTMLElement;
          if (target) target.classList.toggle('hidden');
        }}
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        Analysis Steps
      </button>
      <div className="mt-3 space-y-1.5">
        {steps.map((step, i) => (
          <div key={i} className="flex items-start gap-2.5 text-[12px]">
            <svg className="w-3 h-3 text-emerald-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-slate-500">
              <span className="text-slate-400">{step.step}</span>
              {step.detail && <span className="text-slate-600"> · {step.detail}</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );

  if (indexingPhase === 'idle') {
    return (
      <div className="min-h-screen bg-[#09090b] text-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-white/5 border border-white/10 mb-4">
              <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-white mb-2">GitHub Assistant</h1>
            <p className="text-sm text-slate-500">Explore repositories and find contribution opportunities</p>
          </div>

          <div className="bg-[#0f0f12] border border-slate-800 rounded-xl p-6">
            <form onSubmit={handleIndexRepo} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2">Repository URL</label>
                <input
                  type="text"
                  placeholder="github.com/owner/repo"
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    setError('');
                  }}
                  disabled={isIndexing}
                  className="w-full px-3.5 py-2.5 bg-[#09090b] border border-slate-800 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-slate-700 focus:ring-1 focus:ring-slate-700 disabled:opacity-50 transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={isIndexing}
                className="w-full py-2.5 bg-white text-black text-sm font-medium rounded-lg hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {isIndexing ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Indexing...
                  </>
                ) : (
                  'Index Repository'
                )}
              </button>
            </form>

            {error && (
              <div className="mt-4 px-3 py-2.5 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-slate-100 flex flex-col">
      {/* Header */}
      <div className="border-b border-slate-800 bg-[#09090b] sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
              </div>
              <div className="min-w-0">
                <h1 className="text-sm font-medium text-white truncate">{repoStats?.fullName || 'Repository'}</h1>
                {repoStats && (
                  <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                    {repoStats.language && <span>{repoStats.language}</span>}
                    <span className="flex items-center gap-1">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12 .587l3.668 7.568 8.332 1.151-6.064 5.828 1.48 8.279-7.416-3.967-7.417 3.967 1.481-8.279-6.064-5.828 8.332-1.151z"/></svg>
                      {formatNumber(repoStats.stars)}
                    </span>
                    <span>{formatNumber(repoStats.openIssues)} issues</span>
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={() => {
                setIndexingPhase('idle');
                setMessages([]);
                setUrl('');
                setRepoStats(null);
              }}
              className="px-3 py-1.5 text-xs text-slate-400 hover:text-white border border-slate-800 hover:border-slate-700 rounded-lg transition-colors"
            >
              Change
            </button>
          </div>
        </div>
      </div>

      {/* Stats bar */}
      {repoStats && (
        <div className="border-b border-slate-800/50 bg-[#0c0c0f]">
          <div className="max-w-4xl mx-auto px-4 py-2.5">
            <div className="flex items-center gap-4 text-xs text-slate-500 overflow-x-auto">
              <span className="flex items-center gap-1.5 whitespace-nowrap">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                {formatNumber(repoStats.filesIndexed)} files indexed
              </span>
              <span className="text-slate-700">|</span>
              <span className="whitespace-nowrap">{repoStats.recentIssuesLoaded} recent issues loaded</span>
              {repoStats.goodFirstIssues && repoStats.goodFirstIssues > 0 && (
                <>
                  <span className="text-slate-700">|</span>
                  <span className="text-emerald-500 whitespace-nowrap">{repoStats.goodFirstIssues} good first issues</span>
                </>
              )}
              {repoStats.hasContributing && (
                <>
                  <span className="text-slate-700">|</span>
                  <span className="whitespace-nowrap">Contributing guide available</span>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {message.type !== 'user' && (
                <div className="flex-shrink-0 mt-1">
                  <div className={`w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-semibold ${
                    message.type === 'system' 
                      ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' 
                      : 'bg-slate-800 text-slate-400 border border-slate-700'
                  }`}>
                    {message.type === 'system' ? '✓' : 'AI'}
                  </div>
                </div>
              )}

              <div
                className={`max-w-[85%] sm:max-w-2xl rounded-xl ${
                  message.type === 'user'
                    ? 'bg-slate-800 text-slate-100 px-4 py-2.5'
                    : message.type === 'system'
                    ? 'bg-[#0f0f12] border border-slate-800 px-4 py-3'
                    : 'bg-[#0f0f12] border border-slate-800 px-5 py-4'
                }`}
              >
                {message.type === 'assistant' && message.content === '' ? (
                  <ThinkingIndicator steps={currentThinking} />
                ) : (
                  <>
                    {message.type === 'assistant' && message.thinking && message.thinking.length > 0 && (
                      <ThinkingSteps steps={message.thinking} />
                    )}
                    <div className="prose-custom">
                      <ReactMarkdown
                        components={{
                          code: ({ inline, className, children, ...props }: any) => {
                            const match = /language-(\w+)/.exec(className || '');
                            const lang = match ? match[1] : '';
                            
                            if (inline) {
                              return (
                                <code className="px-1.5 py-0.5 bg-slate-800 rounded text-emerald-400 text-[13px] font-mono" {...props}>
                                  {children}
                                </code>
                              );
                            }
                            
                            return (
                              <div className="my-4 rounded-lg overflow-hidden border border-slate-800 bg-[#0a0a0c]">
                                {lang && (
                                  <div className="px-4 py-2 bg-slate-800/50 text-[11px] text-slate-500 font-mono border-b border-slate-800">
                                    {lang}
                                  </div>
                                )}
                                <pre className="p-4 overflow-x-auto">
                                  <code className="text-[13px] font-mono text-slate-300 leading-relaxed" {...props}>
                                    {children}
                                  </code>
                                </pre>
                              </div>
                            );
                          },
                          pre: ({ children }) => <>{children}</>,
                          h1: ({ children, ...props }) => (
                            <h1 className="text-lg font-semibold text-white mt-6 mb-3 pb-2 border-b border-slate-800" {...props}>{children}</h1>
                          ),
                          h2: ({ children, ...props }) => (
                            <h2 className="text-base font-semibold text-white mt-6 mb-3" {...props}>{children}</h2>
                          ),
                          h3: ({ children, ...props }) => (
                            <h3 className="text-sm font-semibold text-slate-200 mt-5 mb-2" {...props}>{children}</h3>
                          ),
                          p: ({ children, ...props }) => (
                            <p className="text-[14px] text-slate-300 leading-relaxed mb-4" {...props}>{children}</p>
                          ),
                          a: ({ href, children, ...props }) => (
                            <a 
                              href={href} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2" 
                              {...props}
                            >
                              {children}
                            </a>
                          ),
                          ul: ({ children, ...props }) => (
                            <ul className="list-disc list-outside ml-4 my-4 space-y-2 text-[14px] text-slate-300" {...props}>{children}</ul>
                          ),
                          ol: ({ children, ...props }) => (
                            <ol className="list-decimal list-outside ml-4 my-4 space-y-2 text-[14px] text-slate-300" {...props}>{children}</ol>
                          ),
                          li: ({ children, ...props }) => (
                            <li className="leading-relaxed pl-1" {...props}>{children}</li>
                          ),
                          blockquote: ({ children, ...props }) => (
                            <blockquote className="border-l-2 border-slate-700 pl-4 my-4 text-slate-400" {...props}>
                              {children}
                            </blockquote>
                          ),
                          hr: () => <hr className="my-6 border-slate-800" />,
                          strong: ({ children, ...props }) => (
                            <strong className="font-semibold text-white" {...props}>{children}</strong>
                          ),
                          table: ({ children, ...props }) => (
                            <div className="my-4 overflow-x-auto rounded-lg border border-slate-800">
                              <table className="w-full text-sm" {...props}>{children}</table>
                            </div>
                          ),
                          thead: ({ children, ...props }) => (
                            <thead className="bg-slate-800/50" {...props}>{children}</thead>
                          ),
                          th: ({ children, ...props }) => (
                            <th className="px-4 py-2 text-left font-medium text-slate-300 border-b border-slate-800" {...props}>{children}</th>
                          ),
                          td: ({ children, ...props }) => (
                            <td className="px-4 py-2 border-b border-slate-800/50 text-slate-400" {...props}>{children}</td>
                          ),
                        }}
                      >
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  </>
                )}
              </div>

              {message.type === 'user' && (
                <div className="flex-shrink-0 mt-1">
                  <div className="w-7 h-7 rounded-md bg-slate-800 border border-slate-700 flex items-center justify-center text-[9px] font-semibold text-slate-400 uppercase tracking-wider">
                    You
                  </div>
                </div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-slate-800 bg-[#09090b] sticky bottom-0">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <form onSubmit={handleSendMessage} className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              placeholder="Ask about the repository..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              disabled={isWaiting}
              autoFocus
              className="flex-1 px-3.5 py-2.5 bg-[#0f0f12] border border-slate-800 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-slate-700 focus:ring-1 focus:ring-slate-700 disabled:opacity-50 transition-colors"
            />
            <button
              type="submit"
              disabled={isWaiting || !inputValue.trim()}
              className="px-4 py-2.5 bg-white text-black text-sm font-medium rounded-lg hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Home;
