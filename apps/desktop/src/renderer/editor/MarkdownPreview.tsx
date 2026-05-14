import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownPreviewProps {
  content: string;
  onLinkClick?: (target: string) => void;
}

function preprocessWikiLinks(markdown: string): string {
  return markdown.replace(/\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g, (_match, target, alias) => {
    const display = alias ?? target;
    return `[${display}](graphmind://note/${encodeURIComponent(target.trim())})`;
  });
}

export function MarkdownPreview({ content, onLinkClick }: MarkdownPreviewProps) {
  const processed = preprocessWikiLinks(content);
  return (
    <div className="markdown-preview h-full overflow-y-auto p-6 scrollbar-thin">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            if (href?.startsWith('graphmind://note/')) {
              const noteId = decodeURIComponent(href.replace('graphmind://note/', ''));
              return (
                <button
                  onClick={() => onLinkClick?.(noteId)}
                  className="text-primary-400 underline decoration-primary-400/30 hover:text-primary-300 hover:decoration-primary-300"
                >
                  {children}
                </button>
              );
            }
            return <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary-400 underline hover:text-primary-300">{children}</a>;
          },
          h1: ({ children }) => <h1 className="mb-3 mt-6 text-2xl font-bold text-[var(--color-text-primary)] first:mt-0">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-2 mt-5 text-xl font-semibold text-[var(--color-text-primary)]">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-2 mt-4 text-lg font-semibold text-[var(--color-text-primary)]">{children}</h3>,
          h4: ({ children }) => <h4 className="mb-1 mt-3 text-base font-semibold text-[var(--color-text-primary)]">{children}</h4>,
          p: ({ children }) => <p className="mb-3 leading-7 text-[var(--color-text-primary)]">{children}</p>,
          ul: ({ children }) => <ul className="mb-3 ml-6 list-disc space-y-1 text-[var(--color-text-primary)]">{children}</ul>,
          ol: ({ children }) => <ol className="mb-3 ml-6 list-decimal space-y-1 text-[var(--color-text-primary)]">{children}</ol>,
          li: ({ children }) => <li className="leading-6">{children}</li>,
          blockquote: ({ children }) => <blockquote className="mb-3 border-l-2 border-primary-500/40 pl-4 italic text-[var(--color-text-secondary)]">{children}</blockquote>,
          code: ({ className, children, ...props }) => {
            const isInline = !className;
            if (isInline) {
              return <code className="rounded bg-[var(--color-surface-overlay)]/50 px-1 py-0.5 text-sm font-mono text-primary-300" {...props}>{children}</code>;
            }
            return <code className={`block rounded-lg bg-[var(--color-surface-overlay)]/50 p-3 font-mono text-sm text-[var(--color-text-primary)] ${className ?? ''}`} {...props}>{children}</code>;
          },
          pre: ({ children }) => <pre className="mb-3 overflow-x-auto rounded-lg bg-[var(--color-surface-overlay)]/30 p-3">{children}</pre>,
          table: ({ children }) => <table className="mb-3 w-full border-collapse border border-[var(--color-border-subtle)]">{children}</table>,
          th: ({ children }) => <th className="border border-[var(--color-border-subtle)] bg-[var(--color-surface-overlay)]/30 px-3 py-1.5 text-left text-sm font-semibold text-[var(--color-text-primary)]">{children}</th>,
          td: ({ children }) => <td className="border border-[var(--color-border-subtle)] px-3 py-1.5 text-sm text-[var(--color-text-primary)]">{children}</td>,
          hr: () => <hr className="my-4 border-[var(--color-border-subtle)]" />,
          img: ({ src, alt }) => <img src={src} alt={alt} className="mb-3 max-w-full rounded" />,
          strong: ({ children }) => <strong className="font-bold text-[var(--color-text-primary)]">{children}</strong>,
          em: ({ children }) => <em className="italic text-[var(--color-text-secondary)]">{children}</em>,
        }}
      >
        {processed}
      </ReactMarkdown>
    </div>
  );
}
