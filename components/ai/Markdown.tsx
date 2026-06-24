"use client";

import ReactMarkdown, { type Components } from "react-markdown";

const components: Components = {
  p: ({ node, ...props }) => <p className="mb-2 last:mb-0 leading-relaxed" {...props} />,
  ul: ({ node, ...props }) => <ul className="mb-2 ml-4 list-disc space-y-1" {...props} />,
  ol: ({ node, ...props }) => <ol className="mb-2 ml-4 list-decimal space-y-1" {...props} />,
  li: ({ node, ...props }) => <li className="leading-relaxed" {...props} />,
  strong: ({ node, ...props }) => <strong className="font-semibold text-foreground" {...props} />,
  em: ({ node, ...props }) => <em className="italic" {...props} />,
  h1: ({ node, ...props }) => (
    <h2 className="mb-2 mt-4 text-base font-semibold text-foreground first:mt-0" {...props} />
  ),
  h2: ({ node, ...props }) => (
    <h2 className="mb-2 mt-4 text-base font-semibold text-foreground first:mt-0" {...props} />
  ),
  h3: ({ node, ...props }) => (
    <h3 className="mb-1 mt-3 text-sm font-semibold text-foreground" {...props} />
  ),
  code: ({ node, ...props }) => (
    <code className="rounded bg-surface px-1 py-0.5 text-xs text-primary" {...props} />
  ),
  hr: () => <hr className="my-3 border-border" />,
  a: ({ node, ...props }) => (
    <a className="text-primary underline" target="_blank" rel="noreferrer" {...props} />
  ),
  table: ({ node, ...props }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-xs" {...props} />
    </div>
  ),
  th: ({ node, ...props }) => (
    <th className="border border-border px-2 py-1 text-left font-medium text-foreground" {...props} />
  ),
  td: ({ node, ...props }) => <td className="border border-border px-2 py-1 text-muted" {...props} />,
};

export function Markdown({ children }: { children: string }) {
  return (
    <div className="text-sm text-foreground">
      <ReactMarkdown components={components}>{children}</ReactMarkdown>
    </div>
  );
}
