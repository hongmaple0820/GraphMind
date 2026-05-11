import { useState, useCallback, useRef, useEffect } from 'react';
import { useAppStore } from '../stores/app-store';

interface ToolLog {
  tool: string;
  args: Record<string, unknown>;
  result?: string;
  status: 'running' | 'done' | 'error';
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
  toolLogs?: ToolLog[];
  model?: string;
}

export function AgentPanel() {
  const collapsed = useAppStore((s) => s.agentPanelCollapsed);
  const toggleAgentPanel = useAppStore((s) => s.toggleAgentPanel);
  const vaultPath = useAppStore((s) => s.vaultPath);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 'welcome', role: 'assistant', content: 'Hello! I\'m GraphMind Agent. Ask me anything about your knowledge base, or use `/summarize`, `/search`, or `/graph` commands.' },
  ]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeModel, setActiveModel] = useState<string | null>(null);
  const [showToolLogs, setShowToolLogs] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    const loadModel = async () => {
      try {
        const result = await (window as any).graphmind?.agent?.models?.();
        if (result?.models) {
          const enabled = result.models.filter((m: any) => m.enabled);
          if (enabled.length > 0) setActiveModel(enabled[0].name);
        }
      } catch {}
    };
    loadModel();
  }, []);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isStreaming) return;
    const userMsg = input.trim();
    setInput('');

    const userId = `user-${Date.now()}`;
    const assistantId = `asst-${Date.now()}`;
    setMessages((prev) => [...prev, { id: userId, role: 'user', content: userMsg }]);
    setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '', streaming: true }]);
    setIsStreaming(true);

    try {
      if ((window as any).graphmind?.agent) {
        const hasStream = !!(window as any).graphmind.agent.chatStream;

        if (hasStream) {
          const port = (window as any).graphmind.agent.chatStream({ message: userMsg, vaultPath: vaultPath ?? undefined });
          let fullContent = '';

          port.onmessage = (event: MessageEvent) => {
            const data = event.data;
            if (data.type === 'token') {
              fullContent += data.content;
              setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: fullContent } : m));
            } else if (data.type === 'done') {
              const toolLogs: ToolLog[] = [];
              if (data.toolCalls) {
                for (const tc of data.toolCalls) {
                  toolLogs.push({ tool: tc.name, args: tc.args, result: tc.result, status: 'done' });
                }
              }
              const citations = data.citations ?? [];
              if (citations.length > 0) {
                fullContent += '\n\n---\n**Sources:** ' + citations.map((c: any) => `[[${c.source}]]`).join(', ');
              }
              setMessages((prev) => prev.map((m) => m.id === assistantId ? {
                ...m,
                content: fullContent,
                streaming: false,
                toolLogs: toolLogs.length > 0 ? toolLogs : undefined,
                model: data.model,
              } : m));
              if (data.model) setActiveModel(data.model);
              setIsStreaming(false);
            } else if (data.type === 'error') {
              setMessages((prev) => prev.map((m) => m.id === assistantId ? {
                ...m, content: `Error: ${data.error}`, streaming: false,
              } : m));
              setIsStreaming(false);
            }
          };

          port.onmessageerror = () => {
            setIsStreaming(false);
          };
        } else {
          const result = await (window as any).graphmind.agent.chat({ message: userMsg, vaultPath: vaultPath ?? undefined });
          const toolLogs: ToolLog[] = [];
          if (result.toolCalls) {
            for (const tc of result.toolCalls) {
              toolLogs.push({ tool: tc.name, args: tc.args, result: tc.result, status: 'done' });
            }
          }
          let content = result.content;
          const citations = result.citations ?? [];
          if (citations.length > 0) {
            content += '\n\n---\n**Sources:** ' + citations.map((c: any) => `[[${c.source}]]`).join(', ');
          }
          setMessages((prev) => prev.map((m) => m.id === assistantId ? {
            ...m, content, streaming: false,
            toolLogs: toolLogs.length > 0 ? toolLogs : undefined,
            model: result.model,
          } : m));
          if (result.model) setActiveModel(result.model);
        }
      } else {
        const demoResponse = generateDemoResponse(userMsg);
        for (let i = 0; i < demoResponse.length; i++) {
          await new Promise((r) => setTimeout(r, 15));
          setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: demoResponse.slice(0, i + 1) } : m));
        }
        setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, streaming: false } : m));
      }
    } catch (err) {
      setMessages((prev) => prev.map((m) => m.id === assistantId ? {
        ...m,
        content: `Error: ${err}\n\nCheck your LLM configuration in Settings (Ctrl+,).`,
        streaming: false,
      } : m));
    } finally {
      setIsStreaming(false);
    }
  }, [input, isStreaming, vaultPath]);

  if (collapsed) return null;

  return (
    <div className="flex h-72 flex-col border-t border-border-subtle bg-surface-raised">
      <div className="flex items-center justify-between border-b border-border-subtle px-3 py-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-primary-400">Agent</span>
          {activeModel && (
            <span className="rounded bg-surface-overlay px-1.5 py-0.5 text-xs text-text-secondary">{activeModel}</span>
          )}
          {!activeModel && (
            <span className="rounded bg-warning/20 px-1.5 py-0.5 text-xs text-warning">No model</span>
          )}
        </div>
        <button onClick={toggleAgentPanel} className="topbar-btn" aria-label="Close">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 6.94L4.53 3.47 3.47 4.53 6.94 8 3.47 11.47l1.06 1.06L8 9.06l3.47 3.47 1.06-1.06L9.06 8l3.47-3.47-1.06-1.06L8 6.94z" /></svg>
        </button>
      </div>
      <div ref={listRef} className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex items-start gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${msg.role === 'user' ? 'bg-primary-500/20 text-primary-400' : 'bg-success/20 text-success'}`}>
              {msg.role === 'user' ? 'U' : 'AI'}
            </div>
            <div className="flex max-w-[80%] flex-col gap-1">
              <div className={`rounded-lg px-3 py-2 text-sm ${msg.role === 'user' ? 'bg-primary-500/20 text-primary-200' : 'bg-surface-overlay/50 text-text-primary'}`}>
                {msg.content || '\u00A0'}
                {msg.streaming && <span className="ml-0.5 inline-block h-3 w-0.5 animate-typing-cursor bg-primary-400" />}
              </div>
              {msg.toolLogs && msg.toolLogs.length > 0 && (
                <div className="space-y-0.5">
                  {msg.toolLogs.map((log, idx) => (
                    <button
                      key={idx}
                      onClick={() => setShowToolLogs(showToolLogs === `${msg.id}-${idx}` ? null : `${msg.id}-${idx}`)}
                      className="flex w-full items-center gap-1 rounded bg-surface-overlay/30 px-2 py-0.5 text-xs text-text-secondary hover:text-text-primary"
                    >
                      <span className={log.status === 'done' ? 'text-success' : log.status === 'error' ? 'text-error' : 'text-warning'}>
                        {log.status === 'done' ? '>' : log.status === 'error' ? 'x' : '~'}
                      </span>
                      <span className="font-mono">{log.tool}</span>
                      {showToolLogs === `${msg.id}-${idx}` && log.result && (
                        <span className="ml-1 truncate text-text-disabled">{log.result.slice(0, 80)}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-border-subtle p-2">
        <div className="flex items-center gap-2 rounded-md bg-surface-overlay/50 px-3 py-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Ask Agent... (Enter to send)"
            className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-disabled focus:outline-none"
            disabled={isStreaming}
          />
          <button onClick={handleSend} disabled={isStreaming || !input.trim()} className="rounded bg-primary-500 px-2.5 py-1 text-xs text-white hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed">
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

function generateDemoResponse(query: string): string {
  return `[Demo] You asked: "${query}"\n\nIn production, the Agent would:\n1. Parse your intent\n2. Search knowledge base (Vector + BM25 + Graph)\n3. Rerank results with Cross-Encoder\n4. Generate response with citations\n\nConnect a local LLM (llama.cpp) or cloud API to enable real AI responses.`;
}
