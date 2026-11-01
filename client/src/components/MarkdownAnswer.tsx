import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Link } from 'react-router-dom';
import remarkGfm from 'remark-gfm';
import { diagramEmbedPath, diagramPath } from '../diagramLink';
import { renderPlainMath } from '../plainMath';
import { useApplicationLinks } from '../useApplicationLinks';

interface Props {
  text: string;
}

function nodeText(children: React.ReactNode): string {
  return React.Children.toArray(children).map((child) => {
    if (typeof child === 'string' || typeof child === 'number') return String(child);
    if (React.isValidElement<{ children?: React.ReactNode }>(child)) return nodeText(child.props.children);
    return '';
  }).join('').replace(/\s+/g, ' ').trim();
}

function hasDiagram(children: React.ReactNode): boolean {
  return React.Children.toArray(children).some((child) => {
    if (!React.isValidElement<{ href?: string; children?: React.ReactNode }>(child)) return false;
    if (diagramPath(child.props.href)) return true;
    return hasDiagram(child.props.children);
  });
}

function DiagramLink({ href, label }: { href: string; label: string }) {
  const title = label || 'Diagram';
  return (
    <span className="md-diagram" data-diagram="true">
      <iframe className="md-diagram-frame" title={title} src={diagramEmbedPath(href) || href} tabIndex={-1} />
      <Link to={href} className="md-diagram-hit" aria-label={`Open diagram: ${title}`}>
        <span className="md-diagram-caption">{title}</span>
        <span className="md-diagram-open">Open diagram</span>
      </Link>
    </span>
  );
}

export const MarkdownAnswer = ({ text }: Props) => {
  const linkAnswer = useApplicationLinks();
  return (
    <div className="md-answer">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          p: ({ children }) => hasDiagram(children) ? <div className="md-answer-block">{children}</div> : <p>{children}</p>,
          a: ({ href, children }) => {
            const diagram = diagramPath(href);
            if (diagram) return <DiagramLink href={diagram} label={nodeText(children)} />;
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
        {renderPlainMath(linkAnswer(text))}
      </ReactMarkdown>
    </div>
  );
};
