import crypto from 'node:crypto';
import { basePrisma, createLandscapeState, LandscapeStateError, type LandscapeStateView } from './landscape.js';

export const TRANSFORMATION_STATUSES = ['Planned', 'In Progress', 'Completed', 'On Hold'] as const;
export type TransformationStatus = (typeof TRANSFORMATION_STATUSES)[number];

export const TRANSFORMATION_ENTITY_TYPES = ['Application', 'Integration', 'Organization', 'Capability'] as const;
export type TransformationEntityType = (typeof TRANSFORMATION_ENTITY_TYPES)[number];

export const TRANSFORMATION_ACTIONS = ['REPLACE', 'CONSOLIDATE', 'SPLIT', 'RETIRE', 'INTRODUCE', 'EVOLVE'] as const;
export type TransformationAction = (typeof TRANSFORMATION_ACTIONS)[number];

export type TransformationStepInput = {
  id?: string;
  entityType: TransformationEntityType;
  action: TransformationAction;
  title?: string | null;
  notes?: string | null;
  predecessorIds: string[];
  successorIds: string[];
  order?: number;
};

export type CreateTransformationInput = {
  name: string;
  description?: string | null;
  status?: TransformationStatus;
  owner?: string | null;
  startDate?: string | null;
  targetDate?: string | null;
  fromStateId?: string;
  toStateId: string;
  references?: string | null;
  autoPopulateFromDiff?: boolean;
  steps?: TransformationStepInput[];
};

export type UpdateTransformationInput = {
  name?: string;
  description?: string | null;
  status?: TransformationStatus;
  owner?: string | null;
  startDate?: string | null;
  targetDate?: string | null;
  fromStateId?: string;
  toStateId?: string;
  references?: string | null;
  steps?: TransformationStepInput[];
};

export type ApplyTransformationOptions = {
  backupFromState?: boolean;
  backupName?: string;
  retireMode?: 'delete' | 'decommission';
  markCompleted?: boolean;
};

function normKey(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function parseJsonIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
  } catch {
    return [];
  }
}

function serializeJsonIds(ids: string[] | undefined): string {
  if (!Array.isArray(ids)) return '[]';
  const unique = [...new Set(ids.map((s) => s.trim()).filter(Boolean))];
  return JSON.stringify(unique);
}

function parseDateOrNull(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseNum(raw: string | null | undefined, fallback = 0): number {
  const n = Number(raw ?? '');
  return Number.isFinite(n) ? n : fallback;
}

type StateSnapshot = Awaited<ReturnType<typeof loadStateSnapshot>>;

async function loadStateSnapshot(stateId: string) {
  const [state, applications, organizations, capabilities, integrations] = await Promise.all([
    basePrisma.landscapeState.findUnique({ where: { id: stateId } }),
    basePrisma.application.findMany({
      where: { stateId },
      include: {
        ownerOrg: { select: { id: true, name: true, type: true } },
        capabilities: { select: { id: true, name: true, criticality: true } },
      },
      orderBy: { name: 'asc' },
    }),
    basePrisma.organization.findMany({
      where: { stateId },
      include: {
        parent: { select: { id: true, name: true } },
        supportedCapabilities: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    }),
    basePrisma.capability.findMany({
      where: { stateId },
      include: {
        parent: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    }),
    basePrisma.integration.findMany({
      where: { stateId },
      include: {
        sourceApp: { select: { id: true, name: true } },
        targetApp: { select: { id: true, name: true } },
        payload: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    }),
  ]);

  if (!state) {
    throw new LandscapeStateError(404, `Landscape state '${stateId}' not found.`);
  }

  return {
    state: {
      id: state.id,
      name: state.name,
      sourceStateId: state.sourceStateId,
      isCurrent: state.id === 'current',
    } satisfies LandscapeStateView,
    applications,
    organizations,
    capabilities,
    integrations,
  };
}

export type SuggestedTransformationStep = {
  key: string;
  entityType: TransformationEntityType;
  action: TransformationAction;
  title: string;
  notes: string;
  predecessorIds: string[];
  successorIds: string[];
  predecessors: Array<{ id: string; name: string; subtitle?: string }>;
  successors: Array<{ id: string; name: string; subtitle?: string }>;
};

export function computeDiffSuggestionsFromSnapshots(
  fromSnap: StateSnapshot,
  toSnap: StateSnapshot,
  existingSteps: Array<{ entityType: string; predecessorIds: string[]; successorIds: string[] }> = [],
): SuggestedTransformationStep[] {
  const coveredPreds = new Set<string>();
  const coveredSuccs = new Set<string>();
  for (const step of existingSteps) {
    for (const id of step.predecessorIds) coveredPreds.add(`${step.entityType}:${id}`);
    for (const id of step.successorIds) coveredSuccs.add(`${step.entityType}:${id}`);
  }

  const suggestions: SuggestedTransformationStep[] = [];

  // 1. Applications diff
  const fromAppsByName = new Map<string, (typeof fromSnap.applications)[number]>();
  for (const app of fromSnap.applications) {
    fromAppsByName.set(normKey(app.name), app);
  }
  const toAppsByName = new Map<string, (typeof toSnap.applications)[number]>();
  for (const app of toSnap.applications) {
    toAppsByName.set(normKey(app.name), app);
  }

  const removedApps = fromSnap.applications.filter((app) => {
    const match = toAppsByName.get(normKey(app.name));
    if (!match) return true;
    const wasDecomm = normKey(app.lifecycle) === 'decommissioned';
    const isDecomm = normKey(match.lifecycle) === 'decommissioned';
    return !wasDecomm && isDecomm;
  });

  const addedApps = toSnap.applications.filter((app) => {
    const match = fromAppsByName.get(normKey(app.name));
    return !match && normKey(app.lifecycle) !== 'decommissioned';
  });

  const pairedRemovedIds = new Set<string>();
  const pairedAddedIds = new Set<string>();

  // Pair removed apps with added apps that share business capability names
  for (const added of addedApps) {
    const addedCapNames = new Set(added.capabilities.map((c) => normKey(c.name)));
    if (addedCapNames.size === 0) continue;

    const matchingRemoved = removedApps.filter(
      (rem) =>
        !pairedRemovedIds.has(rem.id) &&
        rem.capabilities.some((c) => addedCapNames.has(normKey(c.name))),
    );

    if (matchingRemoved.length > 0) {
      for (const rem of matchingRemoved) pairedRemovedIds.add(rem.id);
      pairedAddedIds.add(added.id);

      const sharedCaps = [
        ...new Set(
          matchingRemoved
            .flatMap((r) => r.capabilities.map((c) => c.name))
            .filter((name) => addedCapNames.has(normKey(name))),
        ),
      ];
      const action: TransformationAction = matchingRemoved.length > 1 ? 'CONSOLIDATE' : 'REPLACE';
      const predIds = matchingRemoved.map((r) => r.id);
      const succIds = [added.id];
      const isCovered =
        predIds.every((id) => coveredPreds.has(`Application:${id}`)) &&
        succIds.every((id) => coveredSuccs.has(`Application:${id}`));
      if (!isCovered) {
        suggestions.push({
          key: `app-pair-${predIds.join('_')}-${added.id}`,
          entityType: 'Application',
          action,
          title:
            action === 'CONSOLIDATE'
              ? `Consolidate ${matchingRemoved.map((r) => r.name).join(', ')} into ${added.name}`
              : `Replace ${matchingRemoved[0]!.name} with ${added.name}`,
          notes: `Shared capabilities: ${sharedCaps.slice(0, 4).join(', ')}`,
          predecessorIds: predIds,
          successorIds: succIds,
          predecessors: matchingRemoved.map((r) => ({
            id: r.id,
            name: r.name,
            subtitle: r.ownerOrg?.name || r.lifecycle || undefined,
          })),
          successors: [
            {
              id: added.id,
              name: added.name,
              subtitle: added.ownerOrg?.name || added.lifecycle || undefined,
            },
          ],
        });
      }
    }
  }

  // Remaining removed apps -> RETIRE
  for (const rem of removedApps) {
    if (pairedRemovedIds.has(rem.id)) continue;
    if (coveredPreds.has(`Application:${rem.id}`)) continue;
    const matchInTarget = toAppsByName.get(normKey(rem.name));
    suggestions.push({
      key: `app-retire-${rem.id}`,
      entityType: 'Application',
      action: 'RETIRE',
      title: `Retire ${rem.name}`,
      notes: matchInTarget
        ? `Marked as Decommissioned in ${toSnap.state.name}`
        : `Removed in ${toSnap.state.name}`,
      predecessorIds: [rem.id],
      successorIds: matchInTarget ? [matchInTarget.id] : [],
      predecessors: [
        {
          id: rem.id,
          name: rem.name,
          subtitle: rem.ownerOrg?.name || rem.lifecycle || undefined,
        },
      ],
      successors: matchInTarget
        ? [
            {
              id: matchInTarget.id,
              name: matchInTarget.name,
              subtitle: matchInTarget.lifecycle || undefined,
            },
          ]
        : [],
    });
  }

  // Remaining added apps -> INTRODUCE
  for (const added of addedApps) {
    if (pairedAddedIds.has(added.id)) continue;
    if (coveredSuccs.has(`Application:${added.id}`)) continue;
    suggestions.push({
      key: `app-intro-${added.id}`,
      entityType: 'Application',
      action: 'INTRODUCE',
      title: `Introduce ${added.name}`,
      notes: `New application in ${toSnap.state.name}${added.ownerOrg ? ` (${added.ownerOrg.name})` : ''}`,
      predecessorIds: [],
      successorIds: [added.id],
      predecessors: [],
      successors: [
        {
          id: added.id,
          name: added.name,
          subtitle: added.ownerOrg?.name || added.lifecycle || undefined,
        },
      ],
    });
  }

  // Check surviving apps that evolved between states
  const orgReassignmentGroups = new Map<
    string,
    {
      targetOrgName: string;
      pairs: Array<{
        fromApp: (typeof fromSnap.applications)[number];
        toApp: (typeof toSnap.applications)[number];
      }>;
    }
  >();

  for (const fromApp of fromSnap.applications) {
    const toApp = toAppsByName.get(normKey(fromApp.name));
    if (!toApp) continue;
    if (pairedRemovedIds.has(fromApp.id) || pairedAddedIds.has(toApp.id)) continue;
    if (
      normKey(fromApp.lifecycle) !== 'decommissioned' &&
      normKey(toApp.lifecycle) === 'decommissioned'
    ) {
      continue;
    }
    if (coveredPreds.has(`Application:${fromApp.id}`) || coveredSuccs.has(`Application:${toApp.id}`)) {
      continue;
    }

    const changes: string[] = [];
    const ownerChanged = normKey(fromApp.ownerOrg?.name) !== normKey(toApp.ownerOrg?.name);
    if (ownerChanged) {
      changes.push(`Owner: ${fromApp.ownerOrg?.name || 'Unassigned'} → ${toApp.ownerOrg?.name || 'Unassigned'}`);
    }
    if (normKey(fromApp.lifecycle) !== normKey(toApp.lifecycle)) {
      changes.push(`Lifecycle: ${fromApp.lifecycle || '—'} → ${toApp.lifecycle || '—'}`);
    }
    if (normKey(fromApp.technicalFit) !== normKey(toApp.technicalFit)) {
      changes.push(`Tech Fit: ${fromApp.technicalFit || '—'} → ${toApp.technicalFit || '—'}`);
    }
    if (normKey(fromApp.functionalFit) !== normKey(toApp.functionalFit)) {
      changes.push(`Func Fit: ${fromApp.functionalFit || '—'} → ${toApp.functionalFit || '—'}`);
    }
    if (normKey(fromApp.cost) !== normKey(toApp.cost)) {
      changes.push(`Cost: ${fromApp.cost || '—'} → ${toApp.cost || '—'}`);
    }

    const fromCaps = new Set(fromApp.capabilities.map((c) => normKey(c.name)));
    const toCaps = new Set(toApp.capabilities.map((c) => normKey(c.name)));
    const capsChanged =
      fromCaps.size !== toCaps.size || [...fromCaps].some((c) => !toCaps.has(c));
    if (capsChanged) {
      changes.push(`Capabilities: ${fromCaps.size} → ${toCaps.size}`);
    }

    if (changes.length === 0) continue;

    // If ONLY the owning organization changed, group by target org so bulk re-orgs stay clean
    if (changes.length === 1 && ownerChanged && toApp.ownerOrg?.name) {
      const key = normKey(toApp.ownerOrg.name);
      const group = orgReassignmentGroups.get(key) ?? {
        targetOrgName: toApp.ownerOrg.name,
        pairs: [],
      };
      group.pairs.push({ fromApp, toApp });
      orgReassignmentGroups.set(key, group);
    } else {
      suggestions.push({
        key: `app-evolve-${fromApp.id}-${toApp.id}`,
        entityType: 'Application',
        action: 'EVOLVE',
        title: `Evolve ${fromApp.name}`,
        notes: changes.join(' · '),
        predecessorIds: [fromApp.id],
        successorIds: [toApp.id],
        predecessors: [
          {
            id: fromApp.id,
            name: fromApp.name,
            subtitle: fromApp.ownerOrg?.name || fromApp.lifecycle || undefined,
          },
        ],
        successors: [
          {
            id: toApp.id,
            name: toApp.name,
            subtitle: toApp.ownerOrg?.name || toApp.lifecycle || undefined,
          },
        ],
      });
    }
  }

  for (const [key, group] of orgReassignmentGroups.entries()) {
    if (group.pairs.length === 1) {
      const { fromApp, toApp } = group.pairs[0]!;
      suggestions.push({
        key: `app-evolve-${fromApp.id}-${toApp.id}`,
        entityType: 'Application',
        action: 'EVOLVE',
        title: `Reassign ${fromApp.name} to ${group.targetOrgName}`,
        notes: `Owner: ${fromApp.ownerOrg?.name || 'Unassigned'} → ${group.targetOrgName}`,
        predecessorIds: [fromApp.id],
        successorIds: [toApp.id],
        predecessors: [{ id: fromApp.id, name: fromApp.name, subtitle: fromApp.ownerOrg?.name }],
        successors: [{ id: toApp.id, name: toApp.name, subtitle: group.targetOrgName }],
      });
    } else {
      const fromOrgs = [
        ...new Set(group.pairs.map((p) => p.fromApp.ownerOrg?.name || 'Unassigned')),
      ];
      suggestions.push({
        key: `app-org-group-${key}`,
        entityType: 'Application',
        action: 'EVOLVE',
        title: `Transition ${group.pairs.length} applications to ${group.targetOrgName}`,
        notes: `Previous owners: ${fromOrgs.slice(0, 4).join(', ')}${fromOrgs.length > 4 ? ` (+${fromOrgs.length - 4} more)` : ''}`,
        predecessorIds: group.pairs.map((p) => p.fromApp.id),
        successorIds: group.pairs.map((p) => p.toApp.id),
        predecessors: group.pairs.map((p) => ({
          id: p.fromApp.id,
          name: p.fromApp.name,
          subtitle: p.fromApp.ownerOrg?.name,
        })),
        successors: group.pairs.map((p) => ({
          id: p.toApp.id,
          name: p.toApp.name,
          subtitle: group.targetOrgName,
        })),
      });
    }
  }

  // 2. Organization diffs
  const fromOrgsByName = new Map(fromSnap.organizations.map((o) => [normKey(o.name), o]));
  const toOrgsByName = new Map(toSnap.organizations.map((o) => [normKey(o.name), o]));

  const addedOrgs = toSnap.organizations.filter(
    (o) => !fromOrgsByName.has(normKey(o.name)) && !coveredSuccs.has(`Organization:${o.id}`),
  );
  const removedOrgs = fromSnap.organizations.filter(
    (o) => !toOrgsByName.has(normKey(o.name)) && !coveredPreds.has(`Organization:${o.id}`),
  );

  for (const org of addedOrgs.slice(0, 15)) {
    suggestions.push({
      key: `org-intro-${org.id}`,
      entityType: 'Organization',
      action: 'INTRODUCE',
      title: `Establish organization ${org.name}`,
      notes: org.type ? `Organization type: ${org.type}` : `New organization in ${toSnap.state.name}`,
      predecessorIds: [],
      successorIds: [org.id],
      predecessors: [],
      successors: [{ id: org.id, name: org.name, subtitle: org.type || undefined }],
    });
  }

  for (const org of removedOrgs.slice(0, 15)) {
    suggestions.push({
      key: `org-retire-${org.id}`,
      entityType: 'Organization',
      action: 'RETIRE',
      title: `Retire organization ${org.name}`,
      notes: `Organization not present in ${toSnap.state.name}`,
      predecessorIds: [org.id],
      successorIds: [],
      predecessors: [{ id: org.id, name: org.name, subtitle: org.type || undefined }],
      successors: [],
    });
  }

  // 3. Integration diffs
  const intSignature = (i: (typeof fromSnap.integrations)[number]) =>
    `${normKey(i.sourceApp.name)}->${normKey(i.targetApp.name)}:${normKey(i.payload?.name || i.name)}`;

  const fromIntsBySig = new Map(fromSnap.integrations.map((i) => [intSignature(i), i]));
  const toIntsBySig = new Map(toSnap.integrations.map((i) => [intSignature(i), i]));

  for (const i of toSnap.integrations) {
    if (!fromIntsBySig.has(intSignature(i)) && !coveredSuccs.has(`Integration:${i.id}`)) {
      const label = i.name || `${i.sourceApp.name} → ${i.targetApp.name}`;
      suggestions.push({
        key: `int-intro-${i.id}`,
        entityType: 'Integration',
        action: 'INTRODUCE',
        title: `Introduce integration ${label}`,
        notes: `${i.sourceApp.name} → ${i.targetApp.name}${i.payload ? ` (${i.payload.name})` : ''}`,
        predecessorIds: [],
        successorIds: [i.id],
        predecessors: [],
        successors: [
          {
            id: i.id,
            name: label,
            subtitle: `${i.sourceApp.name} → ${i.targetApp.name}`,
          },
        ],
      });
    }
  }

  for (const i of fromSnap.integrations) {
    if (!toIntsBySig.has(intSignature(i)) && !coveredPreds.has(`Integration:${i.id}`)) {
      const label = i.name || `${i.sourceApp.name} → ${i.targetApp.name}`;
      suggestions.push({
        key: `int-retire-${i.id}`,
        entityType: 'Integration',
        action: 'RETIRE',
        title: `Decommission integration ${label}`,
        notes: `${i.sourceApp.name} → ${i.targetApp.name}${i.payload ? ` (${i.payload.name})` : ''}`,
        predecessorIds: [i.id],
        successorIds: [],
        predecessors: [
          {
            id: i.id,
            name: label,
            subtitle: `${i.sourceApp.name} → ${i.targetApp.name}`,
          },
        ],
        successors: [],
      });
    }
  }

  return suggestions;
}

export async function getStateDiffPreview(fromStateId: string, toStateId: string) {
  if (fromStateId === toStateId) {
    throw new LandscapeStateError(400, 'Select two different states to compare.');
  }
  const [fromSnap, toSnap] = await Promise.all([
    loadStateSnapshot(fromStateId),
    loadStateSnapshot(toStateId),
  ]);
  const suggestions = computeDiffSuggestionsFromSnapshots(fromSnap, toSnap, []);
  return {
    fromState: fromSnap.state,
    toState: toSnap.state,
    suggestions,
  };
}

export async function listTransformations(filterStateId?: string) {
  const rows = await basePrisma.transformation.findMany({
    where:
      filterStateId && filterStateId !== 'all'
        ? {
            OR: [{ fromStateId: filterStateId }, { toStateId: filterStateId }],
          }
        : undefined,
    include: {
      fromState: true,
      toState: true,
      steps: {
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  return rows.map((row) => {
    const predAppIds = new Set<string>();
    const succAppIds = new Set<string>();
    const predOrgIds = new Set<string>();
    const succOrgIds = new Set<string>();
    const predIntIds = new Set<string>();
    const succIntIds = new Set<string>();

    for (const s of row.steps) {
      const preds = parseJsonIds(s.predecessorIds);
      const succs = parseJsonIds(s.successorIds);
      if (s.entityType === 'Application') {
        preds.forEach((id) => predAppIds.add(id));
        succs.forEach((id) => succAppIds.add(id));
      } else if (s.entityType === 'Organization') {
        preds.forEach((id) => predOrgIds.add(id));
        succs.forEach((id) => succOrgIds.add(id));
      } else if (s.entityType === 'Integration') {
        preds.forEach((id) => predIntIds.add(id));
        succs.forEach((id) => succIntIds.add(id));
      }
    }

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      status: row.status,
      owner: row.owner,
      startDate: row.startDate ? row.startDate.toISOString() : null,
      targetDate: row.targetDate ? row.targetDate.toISOString() : null,
      fromStateId: row.fromStateId,
      toStateId: row.toStateId,
      references: row.references,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      fromState: {
        id: row.fromState.id,
        name: row.fromState.name,
        sourceStateId: row.fromState.sourceStateId,
        isCurrent: row.fromState.id === 'current',
      },
      toState: {
        id: row.toState.id,
        name: row.toState.name,
        sourceStateId: row.toState.sourceStateId,
        isCurrent: row.toState.id === 'current',
      },
      summary: {
        stepCount: row.steps.length,
        predecessorAppCount: predAppIds.size,
        successorAppCount: succAppIds.size,
        predecessorOrgCount: predOrgIds.size,
        successorOrgCount: succOrgIds.size,
        predecessorIntCount: predIntIds.size,
        successorIntCount: succIntIds.size,
      },
    };
  });
}

export async function getTransformationDetail(id: string) {
  const row = await basePrisma.transformation.findUnique({
    where: { id },
    include: {
      fromState: true,
      toState: true,
      steps: {
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      },
    },
  });

  if (!row) {
    throw new LandscapeStateError(404, 'Transformation not found.');
  }

  const [fromSnap, toSnap] = await Promise.all([
    loadStateSnapshot(row.fromStateId),
    loadStateSnapshot(row.toStateId),
  ]);

  const fromAppsById = new Map(fromSnap.applications.map((a) => [a.id, a]));
  const toAppsById = new Map(toSnap.applications.map((a) => [a.id, a]));
  const fromOrgsById = new Map(fromSnap.organizations.map((o) => [o.id, o]));
  const toOrgsById = new Map(toSnap.organizations.map((o) => [o.id, o]));
  const fromCapsById = new Map(fromSnap.capabilities.map((c) => [c.id, c]));
  const toCapsById = new Map(toSnap.capabilities.map((c) => [c.id, c]));
  const fromIntsById = new Map(fromSnap.integrations.map((i) => [i.id, i]));
  const toIntsById = new Map(toSnap.integrations.map((i) => [i.id, i]));

  const hydrateEntity = (entityType: string, entityId: string, side: 'from' | 'to') => {
    if (entityType === 'Application') {
      const app = side === 'from' ? fromAppsById.get(entityId) : toAppsById.get(entityId);
      if (!app) return null;
      return {
        id: app.id,
        entityType: 'Application' as const,
        name: app.name,
        description: app.description,
        subtitle: app.ownerOrg?.name || app.lifecycle || undefined,
        ownerOrg: app.ownerOrg,
        lifecycle: app.lifecycle,
        criticality: app.criticality,
        cost: app.cost,
        functionalFit: app.functionalFit,
        technicalFit: app.technicalFit,
        timeRationale: app.timeRationale,
        vendorName: app.vendorName,
        capabilities: app.capabilities,
      };
    }
    if (entityType === 'Organization') {
      const org = side === 'from' ? fromOrgsById.get(entityId) : toOrgsById.get(entityId);
      if (!org) return null;
      return {
        id: org.id,
        entityType: 'Organization' as const,
        name: org.name,
        description: org.description,
        subtitle: org.type || org.parent?.name || undefined,
        type: org.type,
        parent: org.parent,
      };
    }
    if (entityType === 'Capability') {
      const cap = side === 'from' ? fromCapsById.get(entityId) : toCapsById.get(entityId);
      if (!cap) return null;
      return {
        id: cap.id,
        entityType: 'Capability' as const,
        name: cap.name,
        description: cap.description,
        subtitle: cap.parent?.name ? `Under ${cap.parent.name}` : `Criticality ${cap.criticality || '3'}`,
        criticality: cap.criticality,
        parent: cap.parent,
      };
    }
    if (entityType === 'Integration') {
      const intg = side === 'from' ? fromIntsById.get(entityId) : toIntsById.get(entityId);
      if (!intg) return null;
      const label = intg.name || `${intg.sourceApp.name} → ${intg.targetApp.name}`;
      return {
        id: intg.id,
        entityType: 'Integration' as const,
        name: label,
        description: intg.description,
        subtitle: `${intg.sourceApp.name} → ${intg.targetApp.name}${intg.payload ? ` (${intg.payload.name})` : ''}`,
        sourceApp: intg.sourceApp,
        targetApp: intg.targetApp,
        payload: intg.payload,
        pattern: intg.pattern,
        frequency: intg.frequency,
      };
    }
    return null;
  };

  const hydratedSteps = row.steps.map((step) => {
    const predecessorIds = parseJsonIds(step.predecessorIds);
    const successorIds = parseJsonIds(step.successorIds);
    const predecessors = predecessorIds
      .map((pid) => hydrateEntity(step.entityType, pid, 'from'))
      .filter((item): item is NonNullable<typeof item> => item !== null);
    const successors = successorIds
      .map((sid) => hydrateEntity(step.entityType, sid, 'to'))
      .filter((item): item is NonNullable<typeof item> => item !== null);

    return {
      id: step.id,
      transformationId: step.transformationId,
      entityType: step.entityType as TransformationEntityType,
      action: step.action as TransformationAction,
      title: step.title,
      notes: step.notes,
      predecessorIds,
      successorIds,
      predecessors,
      successors,
      order: step.order,
    };
  });

  // Compute impact analysis across all application & integration steps
  const predAppMap = new Map<string, (typeof fromSnap.applications)[number]>();
  const succAppMap = new Map<string, (typeof toSnap.applications)[number]>();
  // Map predecessor App ID -> successor App IDs
  const predToSuccAppIds = new Map<string, Set<string>>();
  const retiredOrReplacedPredAppIds = new Set<string>();
  const explicitPredIntIds = new Set<string>();
  const explicitSuccIntIds = new Set<string>();

  let retiredCount = 0;
  let introducedCount = 0;
  let consolidatedCount = 0;
  let evolvedCount = 0;

  for (const step of hydratedSteps) {
    if (step.entityType === 'Application') {
      for (const pid of step.predecessorIds) {
        const app = fromAppsById.get(pid);
        if (app) predAppMap.set(pid, app);
        if (!predToSuccAppIds.has(pid)) predToSuccAppIds.set(pid, new Set());
        for (const sid of step.successorIds) {
          predToSuccAppIds.get(pid)!.add(sid);
        }
        if (
          step.action === 'RETIRE' ||
          step.action === 'REPLACE' ||
          step.action === 'CONSOLIDATE' ||
          step.action === 'SPLIT'
        ) {
          retiredOrReplacedPredAppIds.add(pid);
        }
      }
      for (const sid of step.successorIds) {
        const app = toAppsById.get(sid);
        if (app) succAppMap.set(sid, app);
      }

      if (step.action === 'RETIRE') retiredCount += step.predecessorIds.length;
      if (step.action === 'INTRODUCE') introducedCount += step.successorIds.length;
      if (step.action === 'CONSOLIDATE' || step.action === 'REPLACE') {
        consolidatedCount += step.predecessorIds.length;
      }
      if (step.action === 'EVOLVE') evolvedCount += step.predecessorIds.length;
    } else if (step.entityType === 'Integration') {
      step.predecessorIds.forEach((id) => explicitPredIntIds.add(id));
      step.successorIds.forEach((id) => explicitSuccIntIds.add(id));
    }
  }

  const predecessorApps = [...predAppMap.values()];
  const successorApps = [...succAppMap.values()];

  const avgMetric = (
    apps: ReadonlyArray<{ technicalFit?: string | null; functionalFit?: string | null; cost?: string | null }>,
    field: 'technicalFit' | 'functionalFit',
  ) => {
    if (apps.length === 0) return 0;
    const sum = apps.reduce((acc, a) => acc + parseNum(a[field], 3), 0);
    return Number((sum / apps.length).toFixed(2));
  };

  const sumCost = (apps: ReadonlyArray<{ cost?: string | null }>) =>
    apps.reduce((acc, a) => acc + parseNum(a.cost, 1), 0);

  const avgTechFitBefore = avgMetric(predecessorApps, 'technicalFit');
  const avgTechFitAfter = avgMetric(successorApps, 'technicalFit');
  const avgFuncFitBefore = avgMetric(predecessorApps, 'functionalFit');
  const avgFuncFitAfter = avgMetric(successorApps, 'functionalFit');
  const totalCostBefore = sumCost(predecessorApps);
  const totalCostAfter = sumCost(successorApps);

  // Integration Impact Analysis:
  // Find all integrations in fromState touching any predecessorApp
  const toAppsByName = new Map(toSnap.applications.map((a) => [normKey(a.name), a]));
  const resolveTargetSideAppIds = (fromAppId: string, fromAppName: string): Set<string> => {
    const mappedSuccs = predToSuccAppIds.get(fromAppId);
    if (mappedSuccs && mappedSuccs.size > 0) return mappedSuccs;
    if (retiredOrReplacedPredAppIds.has(fromAppId)) return new Set();
    const sameNameInTarget = toAppsByName.get(normKey(fromAppName));
    return sameNameInTarget ? new Set([sameNameInTarget.id]) : new Set();
  };

  const integrationImpacts: Array<{
    id: string;
    name: string;
    direction: 'inbound' | 'outbound' | 'internal';
    sourceApp: { id: string; name: string };
    targetApp: { id: string; name: string };
    payloadName: string | null;
    pattern: string | null;
    status: 'migrated' | 'at_risk' | 'explicitly_mapped' | 'new_in_target';
    successorIntegration: {
      id: string;
      name: string;
      sourceAppName: string;
      targetAppName: string;
    } | null;
    reason: string;
  }> = [];

  for (const intg of fromSnap.integrations) {
    const srcTouched = predAppMap.has(intg.sourceAppId);
    const tgtTouched = predAppMap.has(intg.targetAppId);
    if (!srcTouched && !tgtTouched && !explicitPredIntIds.has(intg.id)) continue;

    const direction: 'inbound' | 'outbound' | 'internal' =
      srcTouched && tgtTouched ? 'internal' : srcTouched ? 'outbound' : 'inbound';

    const expectedSrcTargetIds = resolveTargetSideAppIds(intg.sourceAppId, intg.sourceApp.name);
    const expectedTgtTargetIds = resolveTargetSideAppIds(intg.targetAppId, intg.targetApp.name);

    const matchingTargetInt = toSnap.integrations.find(
      (ti) =>
        expectedSrcTargetIds.has(ti.sourceAppId) &&
        expectedTgtTargetIds.has(ti.targetAppId),
    );

    let status: 'migrated' | 'at_risk' | 'explicitly_mapped' = 'migrated';
    let reason = 'Integration path preserved in target state';

    if (explicitPredIntIds.has(intg.id)) {
      status = 'explicitly_mapped';
      reason = 'Explicitly included in transformation steps';
    } else if (matchingTargetInt) {
      status = 'migrated';
      reason = `Mapped to ${matchingTargetInt.sourceApp.name} → ${matchingTargetInt.targetApp.name} in ${toSnap.state.name}`;
    } else if (
      retiredOrReplacedPredAppIds.has(intg.sourceAppId) ||
      retiredOrReplacedPredAppIds.has(intg.targetAppId)
    ) {
      status = 'at_risk';
      reason =
        expectedSrcTargetIds.size === 0 || expectedTgtTargetIds.size === 0
          ? 'Connected application is retired without a successor integration'
          : `No corresponding integration found between successor applications in ${toSnap.state.name}`;
    }

    integrationImpacts.push({
      id: intg.id,
      name: intg.name || `${intg.sourceApp.name} → ${intg.targetApp.name}`,
      direction,
      sourceApp: intg.sourceApp,
      targetApp: intg.targetApp,
      payloadName: intg.payload?.name || null,
      pattern: intg.pattern || null,
      status,
      successorIntegration: matchingTargetInt
        ? {
            id: matchingTargetInt.id,
            name:
              matchingTargetInt.name ||
              `${matchingTargetInt.sourceApp.name} → ${matchingTargetInt.targetApp.name}`,
            sourceAppName: matchingTargetInt.sourceApp.name,
            targetAppName: matchingTargetInt.targetApp.name,
          }
        : null,
      reason,
    });
  }

  // Also include new integrations in toState connected to successorApps that did not match any fromState integration
  const matchedTargetIntIds = new Set(
    integrationImpacts
      .map((i) => i.successorIntegration?.id)
      .filter((x): x is string => !!x),
  );
  for (const ti of toSnap.integrations) {
    if (matchedTargetIntIds.has(ti.id)) continue;
    const touchesSucc = succAppMap.has(ti.sourceAppId) || succAppMap.has(ti.targetAppId) || explicitSuccIntIds.has(ti.id);
    if (!touchesSucc) continue;
    integrationImpacts.push({
      id: ti.id,
      name: ti.name || `${ti.sourceApp.name} → ${ti.targetApp.name}`,
      direction:
        succAppMap.has(ti.sourceAppId) && succAppMap.has(ti.targetAppId)
          ? 'internal'
          : succAppMap.has(ti.sourceAppId)
            ? 'outbound'
            : 'inbound',
      sourceApp: ti.sourceApp,
      targetApp: ti.targetApp,
      payloadName: ti.payload?.name || null,
      pattern: ti.pattern || null,
      status: 'new_in_target',
      successorIntegration: {
        id: ti.id,
        name: ti.name || `${ti.sourceApp.name} → ${ti.targetApp.name}`,
        sourceAppName: ti.sourceApp.name,
        targetAppName: ti.targetApp.name,
      },
      reason: `New integration in ${toSnap.state.name}`,
    });
  }

  // Capability Impact Analysis:
  const capImpactMap = new Map<
    string,
    {
      name: string;
      criticality: string;
      fromCapabilityId: string | null;
      toCapabilityId: string | null;
      beforeApps: Array<{ id: string; name: string }>;
      afterApps: Array<{ id: string; name: string }>;
    }
  >();

  for (const app of predecessorApps) {
    for (const cap of app.capabilities) {
      const key = normKey(cap.name);
      const entry = capImpactMap.get(key) ?? {
        name: cap.name,
        criticality: cap.criticality || '3',
        fromCapabilityId: cap.id,
        toCapabilityId: null,
        beforeApps: [],
        afterApps: [],
      };
      if (!entry.beforeApps.some((a) => a.id === app.id)) {
        entry.beforeApps.push({ id: app.id, name: app.name });
      }
      capImpactMap.set(key, entry);
    }
  }

  for (const app of successorApps) {
    for (const cap of app.capabilities) {
      const key = normKey(cap.name);
      const entry = capImpactMap.get(key) ?? {
        name: cap.name,
        criticality: cap.criticality || '3',
        fromCapabilityId: null,
        toCapabilityId: cap.id,
        beforeApps: [],
        afterApps: [],
      };
      entry.toCapabilityId = cap.id;
      if (!entry.afterApps.some((a) => a.id === app.id)) {
        entry.afterApps.push({ id: app.id, name: app.name });
      }
      capImpactMap.set(key, entry);
    }
  }

  const capabilityImpacts = [...capImpactMap.values()]
    .map((entry) => {
      let status: 'consolidated' | 'maintained' | 'expanded' | 'new_coverage' | 'gap_risk' = 'maintained';
      if (entry.beforeApps.length > 0 && entry.afterApps.length === 0) {
        status = 'gap_risk';
      } else if (entry.beforeApps.length === 0 && entry.afterApps.length > 0) {
        status = 'new_coverage';
      } else if (entry.beforeApps.length > entry.afterApps.length) {
        status = 'consolidated';
      } else if (entry.afterApps.length > entry.beforeApps.length) {
        status = 'expanded';
      }
      return {
        ...entry,
        status,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const suggestedSteps = computeDiffSuggestionsFromSnapshots(fromSnap, toSnap, hydratedSteps);

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status as TransformationStatus,
    owner: row.owner,
    startDate: row.startDate ? row.startDate.toISOString() : null,
    targetDate: row.targetDate ? row.targetDate.toISOString() : null,
    fromStateId: row.fromStateId,
    toStateId: row.toStateId,
    references: row.references,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    fromState: fromSnap.state,
    toState: toSnap.state,
    steps: hydratedSteps,
    suggestedSteps,
    impact: {
      predecessorApps,
      successorApps,
      metrics: {
        predecessorAppCount: predecessorApps.length,
        successorAppCount: successorApps.length,
        appCountDelta: successorApps.length - predecessorApps.length,
        avgTechFitBefore,
        avgTechFitAfter,
        techFitDelta: Number((avgTechFitAfter - avgTechFitBefore).toFixed(2)),
        avgFuncFitBefore,
        avgFuncFitAfter,
        funcFitDelta: Number((avgFuncFitAfter - avgFuncFitBefore).toFixed(2)),
        totalCostBefore,
        totalCostAfter,
        costDelta: totalCostAfter - totalCostBefore,
        retiredCount,
        introducedCount,
        consolidatedCount,
        evolvedCount,
        atRiskIntegrationCount: integrationImpacts.filter((i) => i.status === 'at_risk').length,
        affectedCapabilityCount: capabilityImpacts.length,
      },
      integrations: integrationImpacts,
      capabilities: capabilityImpacts,
    },
    catalogs: {
      fromState: {
        applications: fromSnap.applications.map((a) => ({
          id: a.id,
          name: a.name,
          subtitle: a.ownerOrg?.name || a.lifecycle || undefined,
        })),
        organizations: fromSnap.organizations.map((o) => ({
          id: o.id,
          name: o.name,
          subtitle: o.type || undefined,
        })),
        capabilities: fromSnap.capabilities.map((c) => ({
          id: c.id,
          name: c.name,
          subtitle: c.parent?.name || undefined,
        })),
        integrations: fromSnap.integrations.map((i) => ({
          id: i.id,
          name: i.name || `${i.sourceApp.name} → ${i.targetApp.name}`,
          subtitle: `${i.sourceApp.name} → ${i.targetApp.name}`,
        })),
      },
      toState: {
        applications: toSnap.applications.map((a) => ({
          id: a.id,
          name: a.name,
          subtitle: a.ownerOrg?.name || a.lifecycle || undefined,
        })),
        organizations: toSnap.organizations.map((o) => ({
          id: o.id,
          name: o.name,
          subtitle: o.type || undefined,
        })),
        capabilities: toSnap.capabilities.map((c) => ({
          id: c.id,
          name: c.name,
          subtitle: c.parent?.name || undefined,
        })),
        integrations: toSnap.integrations.map((i) => ({
          id: i.id,
          name: i.name || `${i.sourceApp.name} → ${i.targetApp.name}`,
          subtitle: `${i.sourceApp.name} → ${i.targetApp.name}`,
        })),
      },
    },
  };
}

export async function createTransformation(input: CreateTransformationInput) {
  const name = input.name.trim();
  if (!name) {
    throw new LandscapeStateError(400, 'Give the transformation a name.');
  }
  const fromStateId = input.fromStateId?.trim() || 'current';
  const toStateId = input.toStateId.trim();
  if (fromStateId === toStateId) {
    throw new LandscapeStateError(
      400,
      'A transformation must move between two different landscape states.',
    );
  }

  const [fromSnap, toSnap] = await Promise.all([
    loadStateSnapshot(fromStateId),
    loadStateSnapshot(toStateId),
  ]);

  let initialSteps: TransformationStepInput[] = input.steps ?? [];
  if (input.autoPopulateFromDiff && initialSteps.length === 0) {
    const suggestions = computeDiffSuggestionsFromSnapshots(fromSnap, toSnap, []);
    initialSteps = suggestions.slice(0, 30).map((s, idx) => ({
      entityType: s.entityType,
      action: s.action,
      title: s.title,
      notes: s.notes,
      predecessorIds: s.predecessorIds,
      successorIds: s.successorIds,
      order: idx,
    }));
  }

  const created = await basePrisma.transformation.create({
    data: {
      name,
      description: input.description?.trim() || null,
      status: input.status || 'Planned',
      owner: input.owner?.trim() || null,
      startDate: parseDateOrNull(input.startDate),
      targetDate: parseDateOrNull(input.targetDate),
      fromStateId,
      toStateId,
      references: input.references || null,
      steps:
        initialSteps.length > 0
          ? {
              create: initialSteps.map((s, idx) => ({
                entityType: s.entityType,
                action: s.action,
                title: s.title?.trim() || null,
                notes: s.notes?.trim() || null,
                predecessorIds: serializeJsonIds(s.predecessorIds),
                successorIds: serializeJsonIds(s.successorIds),
                order: s.order ?? idx,
              })),
            }
          : undefined,
    },
  });

  return getTransformationDetail(created.id);
}

export async function updateTransformation(id: string, input: UpdateTransformationInput) {
  const existing = await basePrisma.transformation.findUnique({ where: { id } });
  if (!existing) {
    throw new LandscapeStateError(404, 'Transformation not found.');
  }

  const nextFromStateId = input.fromStateId?.trim() || existing.fromStateId;
  const nextToStateId = input.toStateId?.trim() || existing.toStateId;
  if (nextFromStateId === nextToStateId) {
    throw new LandscapeStateError(
      400,
      'From State and Target State must be two different landscape states.',
    );
  }

  await basePrisma.$transaction(async (tx) => {
    await tx.transformation.update({
      where: { id },
      data: {
        name: input.name !== undefined ? input.name.trim() : undefined,
        description:
          input.description !== undefined ? input.description?.trim() || null : undefined,
        status: input.status !== undefined ? input.status : undefined,
        owner: input.owner !== undefined ? input.owner?.trim() || null : undefined,
        startDate:
          input.startDate !== undefined ? parseDateOrNull(input.startDate) : undefined,
        targetDate:
          input.targetDate !== undefined ? parseDateOrNull(input.targetDate) : undefined,
        fromStateId: nextFromStateId,
        toStateId: nextToStateId,
        references: input.references !== undefined ? input.references || null : undefined,
      },
    });

    if (input.steps !== undefined) {
      await tx.transformationStep.deleteMany({ where: { transformationId: id } });
      if (input.steps.length > 0) {
        await tx.transformationStep.createMany({
          data: input.steps.map((s, idx) => ({
            id: s.id || crypto.randomUUID(),
            transformationId: id,
            entityType: s.entityType,
            action: s.action,
            title: s.title?.trim() || null,
            notes: s.notes?.trim() || null,
            predecessorIds: serializeJsonIds(s.predecessorIds),
            successorIds: serializeJsonIds(s.successorIds),
            order: s.order ?? idx,
          })),
        });
      }
    }
  });

  return getTransformationDetail(id);
}

export async function deleteTransformation(id: string) {
  const existing = await basePrisma.transformation.findUnique({ where: { id } });
  if (!existing) {
    throw new LandscapeStateError(404, 'Transformation not found.');
  }
  await basePrisma.transformation.delete({ where: { id } });
  return { ok: true };
}

export async function applyTransformation(id: string, options: ApplyTransformationOptions = {}) {
  const detail = await getTransformationDetail(id);
  const { fromStateId, toStateId } = detail;
  const retireMode = options.retireMode || 'delete';

  let backupState: LandscapeStateView | null = null;
  if (options.backupFromState) {
    const rawName =
      options.backupName?.trim() ||
      `Before ${detail.name}`.slice(0, 72);
    const states = await basePrisma.landscapeState.findMany({ select: { name: true } });
    const taken = new Set(states.map((s) => s.name.toLowerCase()));
    taken.add('current');
    let candidate = rawName;
    let suffix = 2;
    while (taken.has(candidate.toLowerCase())) {
      candidate = `${rawName.slice(0, 70)} (${suffix++})`;
    }
    backupState = await createLandscapeState(candidate, fromStateId);
  }

  let appliedOrganizations = 0;
  let appliedApplications = 0;
  let retiredApplications = 0;
  let appliedIntegrations = 0;

  await basePrisma.$transaction(async (tx) => {
    const [fromOrgs, toOrgs, fromCaps, toCaps, fromApps, toApps, fromInts, toInts] =
      await Promise.all([
        tx.organization.findMany({ where: { stateId: fromStateId } }),
        tx.organization.findMany({ where: { stateId: toStateId } }),
        tx.capability.findMany({ where: { stateId: fromStateId } }),
        tx.capability.findMany({ where: { stateId: toStateId } }),
        tx.application.findMany({
          where: { stateId: fromStateId },
          include: { capabilities: { select: { id: true } } },
        }),
        tx.application.findMany({
          where: { stateId: toStateId },
          include: {
            ownerOrg: { select: { id: true, name: true, type: true } },
            capabilities: { select: { id: true, name: true } },
          },
        }),
        tx.integration.findMany({ where: { stateId: fromStateId } }),
        tx.integration.findMany({
          where: { stateId: toStateId },
          include: {
            sourceApp: { select: { id: true, name: true } },
            targetApp: { select: { id: true, name: true } },
            payload: { select: { id: true, name: true } },
          },
        }),
      ]);

    const fromOrgsByName = new Map(fromOrgs.map((o) => [normKey(o.name), o]));
    const toOrgsById = new Map(toOrgs.map((o) => [o.id, o]));
    const fromCapsByName = new Map(fromCaps.map((c) => [normKey(c.name), c]));
    const toCapsById = new Map(toCaps.map((c) => [c.id, c]));
    const fromAppsById = new Map(fromApps.map((a) => [a.id, a]));
    const fromAppsByName = new Map(fromApps.map((a) => [normKey(a.name), a]));
    const toAppsById = new Map(toApps.map((a) => [a.id, a]));
    const toIntsById = new Map(toInts.map((i) => [i.id, i]));

    const ensureOrgInFromState = async (toOrgId: string | null | undefined): Promise<string | null> => {
      if (!toOrgId) return null;
      const toOrg = toOrgsById.get(toOrgId);
      if (!toOrg) return null;
      const existingOrg = fromOrgsByName.get(normKey(toOrg.name));
      if (existingOrg) return existingOrg.id;
      const createdOrg = await tx.organization.create({
        data: {
          stateId: fromStateId,
          name: toOrg.name,
          description: toOrg.description,
          type: toOrg.type,
          references: toOrg.references,
        },
      });
      fromOrgsByName.set(normKey(createdOrg.name), createdOrg);
      appliedOrganizations++;
      return createdOrg.id;
    };

    // 1. Apply Organization steps
    for (const step of detail.steps.filter((s) => s.entityType === 'Organization')) {
      for (const sid of step.successorIds) {
        await ensureOrgInFromState(sid);
      }
      if (step.action === 'RETIRE' || step.action === 'REPLACE' || step.action === 'CONSOLIDATE') {
        for (const pid of step.predecessorIds) {
          await tx.organization.deleteMany({ where: { id: pid, stateId: fromStateId } });
        }
      }
    }

    // 2. Apply Capability steps
    for (const step of detail.steps.filter((s) => s.entityType === 'Capability')) {
      for (const sid of step.successorIds) {
        const toCap = toCapsById.get(sid);
        if (!toCap) continue;
        const existingCap = fromCapsByName.get(normKey(toCap.name));
        if (!existingCap) {
          const createdCap = await tx.capability.create({
            data: {
              stateId: fromStateId,
              name: toCap.name,
              description: toCap.description,
              criticality: toCap.criticality,
              metadata: toCap.metadata,
              references: toCap.references,
            },
          });
          fromCapsByName.set(normKey(createdCap.name), createdCap);
        }
      }
    }

    // 3. Apply Application steps
    // Track mapping from toState appId -> resulting fromState appId
    const toAppToFromAppId = new Map<string, string>();
    const predToResultAppIds = new Map<string, string[]>();
    const keptFromAppIds = new Set<string>();

    for (const step of detail.steps.filter((s) => s.entityType === 'Application')) {
      const resultSuccIds: string[] = [];

      for (const sid of step.successorIds) {
        const toApp = toAppsById.get(sid);
        if (!toApp) continue;

        const ownerOrgId = await ensureOrgInFromState(toApp.ownerOrgId);
        const capConnections = toApp.capabilities
          .map((c) => fromCapsByName.get(normKey(c.name))?.id)
          .filter((cid): cid is string => !!cid);

        const existingByName = fromAppsByName.get(normKey(toApp.name));
        if (existingByName) {
          await tx.application.update({
            where: { id: existingByName.id },
            data: {
              description: toApp.description,
              owner: toApp.owner,
              ownerOrgId,
              lifecycle: toApp.lifecycle,
              lifecycleStartDate: toApp.lifecycleStartDate,
              lifecycleEndDate: toApp.lifecycleEndDate,
              contractStartDate: toApp.contractStartDate,
              contractEndDate: toApp.contractEndDate,
              contractDetails: toApp.contractDetails,
              vendorName: toApp.vendorName,
              vendorUrl: toApp.vendorUrl,
              vendorSummary: toApp.vendorSummary,
              type: toApp.type,
              criticality: toApp.criticality,
              cost: toApp.cost,
              functionalFit: toApp.functionalFit,
              technicalFit: toApp.technicalFit,
              timeRationale: toApp.timeRationale,
              metadata: toApp.metadata,
              references: toApp.references,
              capabilities: { set: capConnections.map((cid) => ({ id: cid })) },
            },
          });
          keptFromAppIds.add(existingByName.id);
          toAppToFromAppId.set(sid, existingByName.id);
          resultSuccIds.push(existingByName.id);
          appliedApplications++;
        } else {
          const createdApp = await tx.application.create({
            data: {
              stateId: fromStateId,
              name: toApp.name,
              description: toApp.description,
              owner: toApp.owner,
              ownerOrgId,
              lifecycle: toApp.lifecycle,
              lifecycleStartDate: toApp.lifecycleStartDate,
              lifecycleEndDate: toApp.lifecycleEndDate,
              contractStartDate: toApp.contractStartDate,
              contractEndDate: toApp.contractEndDate,
              contractDetails: toApp.contractDetails,
              vendorName: toApp.vendorName,
              vendorUrl: toApp.vendorUrl,
              vendorSummary: toApp.vendorSummary,
              type: toApp.type,
              criticality: toApp.criticality,
              cost: toApp.cost,
              functionalFit: toApp.functionalFit,
              technicalFit: toApp.technicalFit,
              timeRationale: toApp.timeRationale,
              metadata: toApp.metadata,
              references: toApp.references,
              capabilities: { connect: capConnections.map((cid) => ({ id: cid })) },
            },
          });
          fromAppsByName.set(normKey(createdApp.name), {
            ...createdApp,
            capabilities: capConnections.map((cid) => ({ id: cid })),
          });
          keptFromAppIds.add(createdApp.id);
          toAppToFromAppId.set(sid, createdApp.id);
          resultSuccIds.push(createdApp.id);
          appliedApplications++;
        }
      }

      for (const pid of step.predecessorIds) {
        if (resultSuccIds.length > 0) {
          predToResultAppIds.set(pid, resultSuccIds);
        }
        if (
          (step.action === 'RETIRE' ||
            step.action === 'REPLACE' ||
            step.action === 'CONSOLIDATE' ||
            step.action === 'SPLIT') &&
          !keptFromAppIds.has(pid) &&
          fromAppsById.has(pid)
        ) {
          // Re-point existing integrations in fromState to primary successor if available
          const primarySuccId = resultSuccIds[0];
          if (primarySuccId && primarySuccId !== pid) {
            await tx.integration.updateMany({
              where: { stateId: fromStateId, sourceAppId: pid },
              data: { sourceAppId: primarySuccId },
            });
            await tx.integration.updateMany({
              where: { stateId: fromStateId, targetAppId: pid },
              data: { targetAppId: primarySuccId },
            });
          }

          if (retireMode === 'decommission') {
            await tx.application.update({
              where: { id: pid },
              data: { lifecycle: 'Decommissioned' },
            });
          } else {
            await tx.application.deleteMany({ where: { id: pid, stateId: fromStateId } });
          }
          retiredApplications++;
        }
      }
    }

    // 4. Apply Integration steps
    for (const step of detail.steps.filter((s) => s.entityType === 'Integration')) {
      for (const sid of step.successorIds) {
        const toInt = toIntsById.get(sid);
        if (!toInt) continue;
        const srcId =
          toAppToFromAppId.get(toInt.sourceAppId) ||
          fromAppsByName.get(normKey(toInt.sourceApp.name))?.id;
        const tgtId =
          toAppToFromAppId.get(toInt.targetAppId) ||
          fromAppsByName.get(normKey(toInt.targetApp.name))?.id;
        if (!srcId || !tgtId) continue;

        const existingInt = fromInts.find(
          (fi) =>
            fi.sourceAppId === srcId &&
            fi.targetAppId === tgtId &&
            normKey(fi.name) === normKey(toInt.name),
        );
        if (!existingInt) {
          await tx.integration.create({
            data: {
              stateId: fromStateId,
              name: toInt.name,
              description: toInt.description,
              sourceAppId: srcId,
              targetAppId: tgtId,
              pattern: toInt.pattern,
              frequency: toInt.frequency,
              crud: toInt.crud,
              references: toInt.references,
            },
          });
          appliedIntegrations++;
        }
      }

      if (step.action === 'RETIRE' || step.action === 'REPLACE' || step.action === 'CONSOLIDATE') {
        for (const pid of step.predecessorIds) {
          await tx.integration.deleteMany({ where: { id: pid, stateId: fromStateId } });
        }
      }
    }

    if (options.markCompleted !== false) {
      await tx.transformation.update({
        where: { id },
        data: { status: 'Completed' },
      });
    }
  });

  const updated = await getTransformationDetail(id);
  return {
    transformation: updated,
    backupState,
    summary: {
      appliedOrganizations,
      appliedApplications,
      retiredApplications,
      appliedIntegrations,
    },
  };
}
