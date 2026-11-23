"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Tight markdown renderer for short prescriptions / explanation cards.
 * Mirrors the chat bubble styling so the whole app reads consistently.
 */
export function PrescriptionMarkdown({ content }: { content: string }) {
  return (
    <div className="text-xs leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>,
          h2: ({ children }) => (
            <h2 className="text-[11px] font-bold mt-3 first:mt-0 mb-1 uppercase tracking-wider text-blue-300">
              {children}
            </h2>
          ),
          h3: ({ children }) => <h3 className="text-xs font-semibold mt-2 first:mt-0 mb-1">{children}</h3>,
          strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          ul: ({ children }) => <ul className="my-1.5 ml-4 space-y-0.5 list-disc marker:text-muted-foreground">{children}</ul>,
          ol: ({ children }) => <ol className="my-1.5 ml-4 space-y-0.5 list-decimal marker:text-muted-foreground">{children}</ol>,
          li: ({ children }) => <li className="pl-1 leading-snug">{children}</li>,
          code: ({ children }) => (
            <code className="px-1 py-0.5 rounded bg-muted text-blue-300 font-mono text-[10px]">{children}</code>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
