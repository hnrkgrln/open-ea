const DIAGRAM_PATH = '/diagrams';

// A chat diagram is only an in-app /diagrams URL. embed is added for the preview
// and removed from the link that opens the full view.
export function diagramPath(href: string | undefined | null): string | null {
  if (!href) return null;
  let url: URL;
  try {
    url = new URL(href, 'https://openea.local');
  } catch {
    return null;
  }
  if (url.origin !== 'https://openea.local' || url.pathname !== DIAGRAM_PATH) return null;
  url.searchParams.delete('embed');
  const query = url.searchParams.toString();
  return query ? `${DIAGRAM_PATH}?${query}` : DIAGRAM_PATH;
}

export function diagramEmbedPath(href: string): string | null {
  const path = diagramPath(href);
  if (!path) return null;
  const url = new URL(path, 'https://openea.local');
  url.searchParams.set('embed', '1');
  const query = url.searchParams.toString();
  return `${DIAGRAM_PATH}?${query}`;
}
