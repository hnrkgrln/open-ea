import { AsyncLocalStorage } from 'node:async_hooks';
import { Prisma, PrismaClient } from '@prisma/client';

export const CURRENT_STATE_ID = 'current';
export const landscapeContext = new AsyncLocalStorage<string>();

export class LandscapeStateError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'LandscapeStateError';
    this.status = status;
  }
}

export const basePrisma = new PrismaClient();

const PORTFOLIO = new Set([
  'Application',
  'Capability',
  'StrategicGoal',
  'Organization',
  'InformationObject',
  'Integration',
]);

const READ_SCOPED = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'count',
  'aggregate',
  'groupBy',
  'updateMany',
  'deleteMany',
]);

type Delegate = {
  findUnique: (args: { where: { id: string }; select: { stateId: true } }) => Promise<{ stateId: string } | null>;
};

function delegate(model: string): Delegate | null {
  switch (model) {
    case 'Application': return basePrisma.application;
    case 'Capability': return basePrisma.capability;
    case 'StrategicGoal': return basePrisma.strategicGoal;
    case 'Organization': return basePrisma.organization;
    case 'InformationObject': return basePrisma.informationObject;
    case 'Integration': return basePrisma.integration;
    default: return null;
  }
}

function activeStateId() {
  return landscapeContext.getStore() || CURRENT_STATE_ID;
}

function notFound(model: string): never {
  throw new Prisma.PrismaClientKnownRequestError(`${model} not found`, {
    code: 'P2025',
    clientVersion: '6.19.3',
  });
}

async function ownsRecord(model: string, id: unknown, stateId: string) {
  if (typeof id !== 'string' || !id) return false;
  const row = await delegate(model)?.findUnique({ where: { id }, select: { stateId: true } });
  return !!row && row.stateId === stateId;
}

async function stampCreate(model: string, data: unknown, stateId: string): Promise<unknown> {
  if (Array.isArray(data)) return Promise.all(data.map((row) => stampCreate(model, row, stateId)));
  if (!data || typeof data !== 'object') return data;
  const next = { ...(data as Record<string, unknown>), stateId };
  delete next.state;
  if (typeof next.id === 'string' && next.id) {
    const row = await delegate(model)?.findUnique({ where: { id: next.id }, select: { stateId: true } });
    if (row && row.stateId !== stateId) delete next.id;
  }
  return next;
}

function stripState(data: unknown) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  const next = { ...(data as Record<string, unknown>) };
  delete next.stateId;
  delete next.state;
  return next;
}

export const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!model || !PORTFOLIO.has(model)) return query(args);
        const stateId = activeStateId();
        const next = { ...(args as Record<string, unknown> | undefined) };

        if (READ_SCOPED.has(operation)) {
          next.where = { AND: [next.where ?? {}, { stateId }] };
          return query(next);
        }

        if (operation === 'findUnique' || operation === 'findUniqueOrThrow') {
          const where = (next.where ?? {}) as { id?: string };
          const owned = await ownsRecord(model, where.id, stateId);
          if (!owned) {
            if (operation === 'findUnique') return null;
            notFound(model);
          }
          return query(args);
        }

        if (operation === 'update' || operation === 'delete') {
          const where = (next.where ?? {}) as { id?: string };
          if (!(await ownsRecord(model, where.id, stateId))) notFound(model);
          if (operation === 'update') next.data = stripState(next.data);
          return query(next);
        }

        if (operation === 'create') {
          next.data = await stampCreate(model, next.data, stateId);
          return query(next);
        }

        if (operation === 'createMany') {
          next.data = await stampCreate(model, next.data, stateId);
          return query(next);
        }

        if (operation === 'upsert') {
          const where = (next.where ?? {}) as { id?: string };
          if (!(await ownsRecord(model, where.id, stateId))) notFound(model);
          next.update = stripState(next.update);
          next.create = await stampCreate(model, next.create, stateId);
          return query(next);
        }

        return query(args);
      },
    },
  },
}) as unknown as PrismaClient;

let knownStateIds = new Set<string>([CURRENT_STATE_ID]);

export function resolveStateId(header: string | undefined) {
  const id = header?.trim() || '';
  return id && knownStateIds.has(id) ? id : CURRENT_STATE_ID;
}

export function rememberState(id: string) {
  knownStateIds.add(id);
}

export function forgetState(id: string) {
  if (id !== CURRENT_STATE_ID) knownStateIds.delete(id);
}

export async function refreshStates() {
  await basePrisma.landscapeState.upsert({
    where: { id: CURRENT_STATE_ID },
    create: { id: CURRENT_STATE_ID, name: 'Current' },
    update: {},
  });
  const rows = await basePrisma.landscapeState.findMany({ select: { id: true } });
  knownStateIds = new Set(rows.map((row) => row.id));
  knownStateIds.add(CURRENT_STATE_ID);
}

export type LandscapeStateView = {
  id: string;
  name: string;
  sourceStateId: string | null;
  isCurrent: boolean;
};

function present(row: { id: string; name: string; sourceStateId: string | null }): LandscapeStateView {
  return {
    id: row.id,
    name: row.name,
    sourceStateId: row.sourceStateId,
    isCurrent: row.id === CURRENT_STATE_ID,
  };
}

function cleanName(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

async function assertName(name: string, ignoreId?: string) {
  if (!name || name.length > 80) {
    throw new LandscapeStateError(400, 'Give the state a name of up to 80 characters.');
  }
  if (name.toLowerCase() === 'current') {
    throw new LandscapeStateError(400, 'Current is reserved for the landscape as it is now.');
  }
  const rows = await basePrisma.landscapeState.findMany({ select: { id: true, name: true } });
  if (rows.some((row) => row.id !== ignoreId && row.name.toLowerCase() === name.toLowerCase())) {
    throw new LandscapeStateError(400, 'A state with that name already exists.');
  }
}

export async function listLandscapeStates(): Promise<LandscapeStateView[]> {
  const rows = await basePrisma.landscapeState.findMany();
  rows.sort((a, b) => {
    if (a.id === CURRENT_STATE_ID) return -1;
    if (b.id === CURRENT_STATE_ID) return 1;
    return a.name.localeCompare(b.name, undefined, { numeric: true });
  });
  return rows.map(present);
}

async function deletePortfolio(stateId: string) {
  await basePrisma.$transaction(async (tx) => {
    await tx.integration.deleteMany({ where: { stateId } });
    await tx.informationObject.deleteMany({ where: { stateId } });
    await tx.application.deleteMany({ where: { stateId } });
    await tx.strategicGoal.deleteMany({ where: { stateId } });
    await tx.capability.deleteMany({ where: { stateId } });
    await tx.organization.deleteMany({ where: { stateId } });
  });
}

export async function deleteLandscapeState(id: string) {
  if (id === CURRENT_STATE_ID) throw new LandscapeStateError(400, 'The current state cannot be deleted.');
  const existing = await basePrisma.landscapeState.findUnique({ where: { id } });
  if (!existing) throw new LandscapeStateError(404, 'State not found.');
  await deletePortfolio(id);
  await basePrisma.landscapeState.delete({ where: { id } });
  forgetState(id);
}

export async function renameLandscapeState(id: string, rawName: string): Promise<LandscapeStateView> {
  if (id === CURRENT_STATE_ID) throw new LandscapeStateError(400, 'The current state cannot be renamed.');
  const existing = await basePrisma.landscapeState.findUnique({ where: { id } });
  if (!existing) throw new LandscapeStateError(404, 'State not found.');
  const name = cleanName(rawName);
  await assertName(name, id);
  const row = await basePrisma.landscapeState.update({ where: { id }, data: { name } });
  return present(row);
}

function mapped(map: Map<string, string>, id: string | null | undefined) {
  if (!id) return null;
  const next = map.get(id);
  return next ?? null;
}

function connect(ids: Array<string | null>) {
  const links = ids.filter((id): id is string => !!id);
  return links.length > 0 ? { connect: links.map((id) => ({ id })) } : undefined;
}

export async function createLandscapeState(rawName: string, sourceStateId: string): Promise<LandscapeStateView> {
  const name = cleanName(rawName);
  await assertName(name);
  const source = await basePrisma.landscapeState.findUnique({ where: { id: sourceStateId } });
  if (!source) throw new LandscapeStateError(404, 'The state to copy was not found.');

  const id = crypto.randomUUID();
  await basePrisma.landscapeState.create({ data: { id, name, sourceStateId } });
  try {
    await copyPortfolio(sourceStateId, id);
  } catch (err) {
    await deletePortfolio(id).catch(() => undefined);
    await basePrisma.landscapeState.delete({ where: { id } }).catch(() => undefined);
    throw err;
  }
  rememberState(id);
  const row = await basePrisma.landscapeState.findUniqueOrThrow({ where: { id } });
  return present(row);
}

async function copyPortfolio(sourceStateId: string, stateId: string) {
  await basePrisma.$transaction(async (tx) => {
    const organizations = await tx.organization.findMany({
      where: { stateId: sourceStateId },
      include: { supportedCapabilities: { select: { id: true } } },
    });
    const capabilities = await tx.capability.findMany({ where: { stateId: sourceStateId } });
    const goals = await tx.strategicGoal.findMany({
      where: { stateId: sourceStateId },
      include: { capabilities: { select: { id: true } } },
    });
    const applications = await tx.application.findMany({
      where: { stateId: sourceStateId },
      include: { capabilities: { select: { id: true } } },
    });
    const information = await tx.informationObject.findMany({
      where: { stateId: sourceStateId },
      include: { processingApplications: { select: { id: true } } },
    });
    const integrations = await tx.integration.findMany({ where: { stateId: sourceStateId } });

    const orgIds = new Map<string, string>();
    for (const row of organizations) {
      const nextId = crypto.randomUUID();
      orgIds.set(row.id, nextId);
      await tx.organization.create({
        data: {
          id: nextId,
          stateId,
          name: row.name,
          description: row.description,
          type: row.type,
          references: row.references,
          parentId: null,
          createdAt: row.createdAt,
        },
      });
    }
    for (const row of organizations) {
      const parentId = mapped(orgIds, row.parentId);
      if (!parentId) continue;
      await tx.organization.update({ where: { id: orgIds.get(row.id)! }, data: { parentId } });
    }

    const capabilityIds = new Map<string, string>();
    for (const row of capabilities) {
      const nextId = crypto.randomUUID();
      capabilityIds.set(row.id, nextId);
      await tx.capability.create({
        data: {
          id: nextId,
          stateId,
          name: row.name,
          description: row.description,
          criticality: row.criticality,
          metadata: row.metadata,
          references: row.references,
          parentId: null,
          createdAt: row.createdAt,
        },
      });
    }
    for (const row of capabilities) {
      const parentId = mapped(capabilityIds, row.parentId);
      if (!parentId) continue;
      await tx.capability.update({ where: { id: capabilityIds.get(row.id)! }, data: { parentId } });
    }

    const goalIds = new Map<string, string>();
    for (const row of goals) {
      const nextId = crypto.randomUUID();
      goalIds.set(row.id, nextId);
      await tx.strategicGoal.create({
        data: {
          id: nextId,
          stateId,
          name: row.name,
          description: row.description,
          references: row.references,
          parentId: null,
          createdAt: row.createdAt,
          capabilities: connect(row.capabilities.map((capability) => mapped(capabilityIds, capability.id))),
        },
      });
    }
    for (const row of goals) {
      const parentId = mapped(goalIds, row.parentId);
      if (!parentId) continue;
      await tx.strategicGoal.update({ where: { id: goalIds.get(row.id)! }, data: { parentId } });
    }

    const applicationIds = new Map<string, string>();
    for (const row of applications) {
      const nextId = crypto.randomUUID();
      applicationIds.set(row.id, nextId);
      await tx.application.create({
        data: {
          id: nextId,
          stateId,
          name: row.name,
          description: row.description,
          owner: row.owner,
          ownerOrgId: mapped(orgIds, row.ownerOrgId),
          lifecycle: row.lifecycle,
          lifecycleStartDate: row.lifecycleStartDate,
          lifecycleEndDate: row.lifecycleEndDate,
          contractStartDate: row.contractStartDate,
          contractEndDate: row.contractEndDate,
          contractDetails: row.contractDetails,
          vendorName: row.vendorName,
          vendorUrl: row.vendorUrl,
          vendorSummary: row.vendorSummary,
          type: row.type,
          criticality: row.criticality,
          cost: row.cost,
          functionalFit: row.functionalFit,
          technicalFit: row.technicalFit,
          timeRationale: row.timeRationale,
          metadata: row.metadata,
          references: row.references,
          createdAt: row.createdAt,
          capabilities: connect(row.capabilities.map((capability) => mapped(capabilityIds, capability.id))),
        },
      });
    }

    const informationIds = new Map<string, string>();
    for (const row of information) {
      const nextId = crypto.randomUUID();
      informationIds.set(row.id, nextId);
      await tx.informationObject.create({
        data: {
          id: nextId,
          stateId,
          name: row.name,
          aliases: row.aliases,
          description: row.description,
          confidentiality: row.confidentiality,
          integrity: row.integrity,
          availability: row.availability,
          piiCategory: row.piiCategory,
          type: row.type,
          metadata: row.metadata,
          references: row.references,
          businessOwnerId: mapped(orgIds, row.businessOwnerId),
          appOwnerId: mapped(applicationIds, row.appOwnerId),
          createdAt: row.createdAt,
          processingApplications: connect(row.processingApplications.map((app) => mapped(applicationIds, app.id))),
        },
      });
    }

    for (const row of integrations) {
      const sourceAppId = mapped(applicationIds, row.sourceAppId);
      const targetAppId = mapped(applicationIds, row.targetAppId);
      if (!sourceAppId || !targetAppId) continue;
      await tx.integration.create({
        data: {
          id: crypto.randomUUID(),
          stateId,
          name: row.name,
          description: row.description,
          sourceAppId,
          targetAppId,
          infoObjectId: mapped(informationIds, row.infoObjectId),
          pattern: row.pattern,
          frequency: row.frequency,
          crud: row.crud,
          references: row.references,
          createdAt: row.createdAt,
        },
      });
    }

    for (const row of organizations) {
      const links = connect(row.supportedCapabilities.map((capability) => mapped(capabilityIds, capability.id)));
      if (!links) continue;
      await tx.organization.update({
        where: { id: orgIds.get(row.id)! },
        data: { supportedCapabilities: links },
      });
    }
  }, { timeout: 180000, maxWait: 10000 });
}

export const MERGE_DOMAINS = [
  'organizations',
  'applications',
  'capabilities',
  'strategicGoals',
  'informationObjects',
  'integrations',
] as const;

export type MergeDomain = (typeof MERGE_DOMAINS)[number];

export type LandscapeStateSummary = {
  state: LandscapeStateView;
  counts: Record<MergeDomain, { current: number; target: number }>;
};

export type MergeLandscapeStateOptions = {
  domains?: MergeDomain[];
  backupCurrent?: boolean;
  backupName?: string;
  deleteSource?: boolean;
};

export type MergeLandscapeStateResult = {
  mergedDomains: MergeDomain[];
  backupState: LandscapeStateView | null;
  deletedSourceId: string | null;
};

export async function getLandscapeStateSummary(id: string): Promise<LandscapeStateSummary> {
  if (id === CURRENT_STATE_ID) {
    throw new LandscapeStateError(400, 'Current is already the active baseline state.');
  }
  const existing = await basePrisma.landscapeState.findUnique({ where: { id } });
  if (!existing) throw new LandscapeStateError(404, 'State not found.');

  const [
    curOrgs, tgtOrgs,
    curApps, tgtApps,
    curCaps, tgtCaps,
    curGoals, tgtGoals,
    curInfo, tgtInfo,
    curInts, tgtInts,
  ] = await Promise.all([
    basePrisma.organization.count({ where: { stateId: CURRENT_STATE_ID } }),
    basePrisma.organization.count({ where: { stateId: id } }),
    basePrisma.application.count({ where: { stateId: CURRENT_STATE_ID } }),
    basePrisma.application.count({ where: { stateId: id } }),
    basePrisma.capability.count({ where: { stateId: CURRENT_STATE_ID } }),
    basePrisma.capability.count({ where: { stateId: id } }),
    basePrisma.strategicGoal.count({ where: { stateId: CURRENT_STATE_ID } }),
    basePrisma.strategicGoal.count({ where: { stateId: id } }),
    basePrisma.informationObject.count({ where: { stateId: CURRENT_STATE_ID } }),
    basePrisma.informationObject.count({ where: { stateId: id } }),
    basePrisma.integration.count({ where: { stateId: CURRENT_STATE_ID } }),
    basePrisma.integration.count({ where: { stateId: id } }),
  ]);

  return {
    state: present(existing),
    counts: {
      organizations: { current: curOrgs, target: tgtOrgs },
      applications: { current: curApps, target: tgtApps },
      capabilities: { current: curCaps, target: tgtCaps },
      strategicGoals: { current: curGoals, target: tgtGoals },
      informationObjects: { current: curInfo, target: tgtInfo },
      integrations: { current: curInts, target: tgtInts },
    },
  };
}

function normKey(name: string) {
  return name.trim().toLowerCase();
}

function buildDomainIdMaps(
  isSelected: boolean,
  curRows: ReadonlyArray<{ id: string; name: string }>,
  tgtRows: ReadonlyArray<{ id: string; name: string }>,
) {
  const targetToCurrent = new Map<string, string>();
  const currentToCurrent = new Map<string, string>();
  const nextIdForTarget = new Map<string, string>();

  if (isSelected) {
    const tgtByName = new Map<string, string>();
    for (const row of tgtRows) {
      const nextId = crypto.randomUUID();
      nextIdForTarget.set(row.id, nextId);
      targetToCurrent.set(row.id, nextId);
      const key = normKey(row.name);
      if (!tgtByName.has(key)) tgtByName.set(key, nextId);
    }
    for (const row of curRows) {
      const match = tgtByName.get(normKey(row.name));
      if (match) currentToCurrent.set(row.id, match);
    }
  } else {
    const curByName = new Map<string, string>();
    for (const row of curRows) {
      currentToCurrent.set(row.id, row.id);
      const key = normKey(row.name);
      if (!curByName.has(key)) curByName.set(key, row.id);
    }
    for (const row of tgtRows) {
      const match = curByName.get(normKey(row.name));
      if (match) targetToCurrent.set(row.id, match);
    }
  }

  return { targetToCurrent, currentToCurrent, nextIdForTarget };
}

function setIds(ids: Array<string | null>) {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  return { set: unique.map((id) => ({ id })) };
}

async function resolveUniqueBackupName(rawBase: string): Promise<string> {
  const base = cleanName(rawBase).slice(0, 72) || 'Before merge';
  const rows = await basePrisma.landscapeState.findMany({ select: { name: true } });
  const taken = new Set(rows.map((r) => r.name.toLowerCase()));
  taken.add('current');
  if (!taken.has(base.toLowerCase())) return base;
  for (let suffix = 2; suffix < 1000; suffix++) {
    const candidate = `${base} (${suffix})`.slice(0, 80);
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${base.slice(0, 68)} ${Date.now().toString(36)}`;
}

export async function mergeLandscapeStateIntoCurrent(
  sourceStateId: string,
  options: MergeLandscapeStateOptions,
): Promise<MergeLandscapeStateResult> {
  if (sourceStateId === CURRENT_STATE_ID) {
    throw new LandscapeStateError(400, 'Current cannot be merged into itself.');
  }
  const source = await basePrisma.landscapeState.findUnique({ where: { id: sourceStateId } });
  if (!source) throw new LandscapeStateError(404, 'The target state to merge was not found.');

  const requestedDomains = options.domains ?? [...MERGE_DOMAINS];
  const mergedDomains = MERGE_DOMAINS.filter((d) => requestedDomains.includes(d));
  if (mergedDomains.length === 0) {
    throw new LandscapeStateError(400, 'Select at least one artifact domain to merge.');
  }
  const selected = new Set<MergeDomain>(mergedDomains);

  let backupState: LandscapeStateView | null = null;
  if (options.backupCurrent) {
    const requestedName = options.backupName?.trim() || `Before ${source.name}`;
    const backupName = await resolveUniqueBackupName(requestedName);
    backupState = await createLandscapeState(backupName, CURRENT_STATE_ID);
  }

  await basePrisma.$transaction(async (tx) => {
    const [
      curOrgs, tgtOrgs,
      curCaps, tgtCaps,
      curGoals, tgtGoals,
      curApps, tgtApps,
      curInfo, tgtInfo,
      curInts, tgtInts,
    ] = await Promise.all([
      tx.organization.findMany({
        where: { stateId: CURRENT_STATE_ID },
        include: { supportedCapabilities: { select: { id: true } } },
      }),
      tx.organization.findMany({
        where: { stateId: sourceStateId },
        include: { supportedCapabilities: { select: { id: true } } },
      }),
      tx.capability.findMany({ where: { stateId: CURRENT_STATE_ID } }),
      tx.capability.findMany({ where: { stateId: sourceStateId } }),
      tx.strategicGoal.findMany({
        where: { stateId: CURRENT_STATE_ID },
        include: { capabilities: { select: { id: true } } },
      }),
      tx.strategicGoal.findMany({
        where: { stateId: sourceStateId },
        include: { capabilities: { select: { id: true } } },
      }),
      tx.application.findMany({
        where: { stateId: CURRENT_STATE_ID },
        include: { capabilities: { select: { id: true } } },
      }),
      tx.application.findMany({
        where: { stateId: sourceStateId },
        include: { capabilities: { select: { id: true } } },
      }),
      tx.informationObject.findMany({
        where: { stateId: CURRENT_STATE_ID },
        include: { processingApplications: { select: { id: true } } },
      }),
      tx.informationObject.findMany({
        where: { stateId: sourceStateId },
        include: { processingApplications: { select: { id: true } } },
      }),
      tx.integration.findMany({ where: { stateId: CURRENT_STATE_ID } }),
      tx.integration.findMany({ where: { stateId: sourceStateId } }),
    ]);

    const orgMaps = buildDomainIdMaps(selected.has('organizations'), curOrgs, tgtOrgs);
    const capMaps = buildDomainIdMaps(selected.has('capabilities'), curCaps, tgtCaps);
    const goalMaps = buildDomainIdMaps(selected.has('strategicGoals'), curGoals, tgtGoals);
    const appMaps = buildDomainIdMaps(selected.has('applications'), curApps, tgtApps);
    const infoMaps = buildDomainIdMaps(selected.has('informationObjects'), curInfo, tgtInfo);

    // Delete in reverse-dependency order for selected domains.
    // Note: Integration has onDelete: Cascade on sourceAppId and targetAppId, so if
    // applications are replaced while integrations are not selected, we also clear
    // and recreate the surviving integrations mapped to the new application IDs.
    if (selected.has('integrations') || selected.has('applications')) {
      await tx.integration.deleteMany({ where: { stateId: CURRENT_STATE_ID } });
    }
    if (selected.has('informationObjects')) {
      await tx.informationObject.deleteMany({ where: { stateId: CURRENT_STATE_ID } });
    }
    if (selected.has('applications')) {
      await tx.application.deleteMany({ where: { stateId: CURRENT_STATE_ID } });
    }
    if (selected.has('strategicGoals')) {
      await tx.strategicGoal.deleteMany({ where: { stateId: CURRENT_STATE_ID } });
    }
    if (selected.has('capabilities')) {
      await tx.capability.deleteMany({ where: { stateId: CURRENT_STATE_ID } });
    }
    if (selected.has('organizations')) {
      await tx.organization.deleteMany({ where: { stateId: CURRENT_STATE_ID } });
    }

    // 1. Organizations
    if (selected.has('organizations')) {
      for (const row of tgtOrgs) {
        await tx.organization.create({
          data: {
            id: orgMaps.nextIdForTarget.get(row.id)!,
            stateId: CURRENT_STATE_ID,
            name: row.name,
            description: row.description,
            type: row.type,
            references: row.references,
            parentId: null,
            createdAt: row.createdAt,
          },
        });
      }
      for (const row of tgtOrgs) {
        const parentId = mapped(orgMaps.targetToCurrent, row.parentId);
        if (!parentId) continue;
        await tx.organization.update({
          where: { id: orgMaps.nextIdForTarget.get(row.id)! },
          data: { parentId },
        });
      }
    }

    // 2. Capabilities
    if (selected.has('capabilities')) {
      for (const row of tgtCaps) {
        await tx.capability.create({
          data: {
            id: capMaps.nextIdForTarget.get(row.id)!,
            stateId: CURRENT_STATE_ID,
            name: row.name,
            description: row.description,
            criticality: row.criticality,
            metadata: row.metadata,
            references: row.references,
            parentId: null,
            createdAt: row.createdAt,
          },
        });
      }
      for (const row of tgtCaps) {
        const parentId = mapped(capMaps.targetToCurrent, row.parentId);
        if (!parentId) continue;
        await tx.capability.update({
          where: { id: capMaps.nextIdForTarget.get(row.id)! },
          data: { parentId },
        });
      }
    }

    // 3. Strategic Goals
    if (selected.has('strategicGoals')) {
      for (const row of tgtGoals) {
        await tx.strategicGoal.create({
          data: {
            id: goalMaps.nextIdForTarget.get(row.id)!,
            stateId: CURRENT_STATE_ID,
            name: row.name,
            description: row.description,
            references: row.references,
            parentId: null,
            createdAt: row.createdAt,
            capabilities: connect(row.capabilities.map((c) => mapped(capMaps.targetToCurrent, c.id))),
          },
        });
      }
      for (const row of tgtGoals) {
        const parentId = mapped(goalMaps.targetToCurrent, row.parentId);
        if (!parentId) continue;
        await tx.strategicGoal.update({
          where: { id: goalMaps.nextIdForTarget.get(row.id)! },
          data: { parentId },
        });
      }
    } else if (selected.has('capabilities')) {
      for (const row of curGoals) {
        if (row.capabilities.length === 0) continue;
        await tx.strategicGoal.update({
          where: { id: row.id },
          data: {
            capabilities: setIds(row.capabilities.map((c) => mapped(capMaps.currentToCurrent, c.id))),
          },
        });
      }
    }

    // 4. Applications
    if (selected.has('applications')) {
      for (const row of tgtApps) {
        await tx.application.create({
          data: {
            id: appMaps.nextIdForTarget.get(row.id)!,
            stateId: CURRENT_STATE_ID,
            name: row.name,
            description: row.description,
            owner: row.owner,
            ownerOrgId: mapped(orgMaps.targetToCurrent, row.ownerOrgId),
            lifecycle: row.lifecycle,
            lifecycleStartDate: row.lifecycleStartDate,
            lifecycleEndDate: row.lifecycleEndDate,
            contractStartDate: row.contractStartDate,
            contractEndDate: row.contractEndDate,
            contractDetails: row.contractDetails,
            vendorName: row.vendorName,
            vendorUrl: row.vendorUrl,
            vendorSummary: row.vendorSummary,
            type: row.type,
            criticality: row.criticality,
            cost: row.cost,
            functionalFit: row.functionalFit,
            technicalFit: row.technicalFit,
            timeRationale: row.timeRationale,
            metadata: row.metadata,
            references: row.references,
            createdAt: row.createdAt,
            capabilities: connect(row.capabilities.map((c) => mapped(capMaps.targetToCurrent, c.id))),
          },
        });
      }
    } else if (selected.has('organizations') || selected.has('capabilities')) {
      for (const row of curApps) {
        const data: Prisma.ApplicationUncheckedUpdateInput = {};
        if (selected.has('organizations') && row.ownerOrgId) {
          data.ownerOrgId = mapped(orgMaps.currentToCurrent, row.ownerOrgId);
        }
        if (selected.has('capabilities') && row.capabilities.length > 0) {
          data.capabilities = setIds(row.capabilities.map((c) => mapped(capMaps.currentToCurrent, c.id)));
        }
        if (Object.keys(data).length > 0) {
          await tx.application.update({ where: { id: row.id }, data });
        }
      }
    }

    // 5. Information Objects
    if (selected.has('informationObjects')) {
      for (const row of tgtInfo) {
        await tx.informationObject.create({
          data: {
            id: infoMaps.nextIdForTarget.get(row.id)!,
            stateId: CURRENT_STATE_ID,
            name: row.name,
            aliases: row.aliases,
            description: row.description,
            confidentiality: row.confidentiality,
            integrity: row.integrity,
            availability: row.availability,
            piiCategory: row.piiCategory,
            type: row.type,
            metadata: row.metadata,
            references: row.references,
            businessOwnerId: mapped(orgMaps.targetToCurrent, row.businessOwnerId),
            appOwnerId: mapped(appMaps.targetToCurrent, row.appOwnerId),
            createdAt: row.createdAt,
            processingApplications: connect(row.processingApplications.map((a) => mapped(appMaps.targetToCurrent, a.id))),
          },
        });
      }
    } else if (selected.has('organizations') || selected.has('applications')) {
      for (const row of curInfo) {
        const data: Prisma.InformationObjectUncheckedUpdateInput = {};
        if (selected.has('organizations') && row.businessOwnerId) {
          data.businessOwnerId = mapped(orgMaps.currentToCurrent, row.businessOwnerId);
        }
        if (selected.has('applications')) {
          if (row.appOwnerId) {
            data.appOwnerId = mapped(appMaps.currentToCurrent, row.appOwnerId);
          }
          if (row.processingApplications.length > 0) {
            data.processingApplications = setIds(row.processingApplications.map((a) => mapped(appMaps.currentToCurrent, a.id)));
          }
        }
        if (Object.keys(data).length > 0) {
          await tx.informationObject.update({ where: { id: row.id }, data });
        }
      }
    }

    // 6. Integrations
    if (selected.has('integrations')) {
      for (const row of tgtInts) {
        const sourceAppId = mapped(appMaps.targetToCurrent, row.sourceAppId);
        const targetAppId = mapped(appMaps.targetToCurrent, row.targetAppId);
        if (!sourceAppId || !targetAppId) continue;
        await tx.integration.create({
          data: {
            id: crypto.randomUUID(),
            stateId: CURRENT_STATE_ID,
            name: row.name,
            description: row.description,
            sourceAppId,
            targetAppId,
            infoObjectId: mapped(infoMaps.targetToCurrent, row.infoObjectId),
            pattern: row.pattern,
            frequency: row.frequency,
            crud: row.crud,
            references: row.references,
            createdAt: row.createdAt,
          },
        });
      }
    } else if (selected.has('applications')) {
      for (const row of curInts) {
        const sourceAppId = mapped(appMaps.currentToCurrent, row.sourceAppId);
        const targetAppId = mapped(appMaps.currentToCurrent, row.targetAppId);
        if (!sourceAppId || !targetAppId) continue;
        await tx.integration.create({
          data: {
            id: row.id,
            stateId: CURRENT_STATE_ID,
            name: row.name,
            description: row.description,
            sourceAppId,
            targetAppId,
            infoObjectId: mapped(infoMaps.currentToCurrent, row.infoObjectId),
            pattern: row.pattern,
            frequency: row.frequency,
            crud: row.crud,
            references: row.references,
            createdAt: row.createdAt,
          },
        });
      }
    } else if (selected.has('informationObjects')) {
      for (const row of curInts) {
        if (!row.infoObjectId) continue;
        await tx.integration.update({
          where: { id: row.id },
          data: { infoObjectId: mapped(infoMaps.currentToCurrent, row.infoObjectId) },
        });
      }
    }

    // 7. Organization -> Supported Capabilities
    if (selected.has('organizations')) {
      for (const row of tgtOrgs) {
        const links = connect(row.supportedCapabilities.map((c) => mapped(capMaps.targetToCurrent, c.id)));
        if (!links) continue;
        await tx.organization.update({
          where: { id: orgMaps.nextIdForTarget.get(row.id)! },
          data: { supportedCapabilities: links },
        });
      }
    } else if (selected.has('capabilities')) {
      for (const row of curOrgs) {
        if (row.supportedCapabilities.length === 0) continue;
        await tx.organization.update({
          where: { id: row.id },
          data: {
            supportedCapabilities: setIds(row.supportedCapabilities.map((c) => mapped(capMaps.currentToCurrent, c.id))),
          },
        });
      }
    }
  }, { timeout: 180000, maxWait: 10000 });

  let deletedSourceId: string | null = null;
  if (options.deleteSource) {
    await deleteLandscapeState(sourceStateId);
    deletedSourceId = sourceStateId;
  }

  return {
    mergedDomains,
    backupState,
    deletedSourceId,
  };
}
