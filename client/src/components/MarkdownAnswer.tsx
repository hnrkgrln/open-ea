import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Link } from 'react-router-dom';
import remarkGfm from 'remark-gfm';

interface Props {
  text: string;
}

export const MarkdownAnswer = ({ text }: Props) => (
  <div className="md-answer">
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      skipHtml
      components={{
        a: ({ href, children }) => {
          if (!href) return <span>{children}</span>;
          if (href.startsWith('/') && !href.startsWith('//')) return <Link to={href}>{children}</Link>;
          return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
        },
        table: ({ children }) => (
          <div className="md-table-wrap">
            <table>{children}</table>
          </div>
        ),
      }}
    >
      {text}
    </ReactMarkdown>
  </div>
);
