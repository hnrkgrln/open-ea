// Spreadsheet of the organizations table. Values only: names and labels, no ids.
// This is separate from the settings archive in portableRecords.ts.

export type OrganizationExportNode = {
  name: string;
  description?: string | null;
  type?: string | null;
  children?: OrganizationExportNode[];
  ownedApplications?: { name?: string | null }[];
  informationObjects?: { name?: string | null }[];
};

export const ORGANIZATION_EXPORT_HEADERS = [
  'Organization',
  'Part of',
  'Type',
  'Applications',
  'Information Objects',
  'Description',
] as const;

const csvCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const sortedNames = (rows: { name?: string | null }[] | undefined) =>
  [...(rows || [])]
    .map((row) => String(row?.name ?? '').trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

// Depth-first, same order as the table. Part of is the parent name the indent shows.
export function organizationTableRows(
  nodes: readonly OrganizationExportNode[],
  typeLabel: (value?: string | null) => string,
  parentName = '',
): string[][] {
  const rows: string[][] = [];
  for (const node of nodes) {
    rows.push([
      node.name,
      parentName,
      typeLabel(node.type) || '',
      sortedNames(node.ownedApplications).join('; '),
      sortedNames(node.informationObjects).join('; '),
      node.description || '',
    ]);
    if (node.children && node.children.length > 0) {
      rows.push(...organizationTableRows(node.children, typeLabel, node.name));
    }
  }
  return rows;
}

export function organizationsTableCsv(
  nodes: readonly OrganizationExportNode[],
  typeLabel: (value?: string | null) => string,
): string {
  const lines = organizationTableRows(nodes, typeLabel).map((row) => row.map(csvCell).join(','));
  return [ORGANIZATION_EXPORT_HEADERS.join(','), ...lines].join('\n');
}
