import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import ReactFlow, {
  Background,
  Controls,
  Handle,
  Position,
  MarkerType,
  type Node,
  type Edge,
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BarChart3,
  Boxes,
  Building2,
  Calendar,
  CheckCircle2,
  Edit3,
  ExternalLink,
  GitBranch,
  GitCompareArrows,
  GitMerge,
  Layers,
  Network,
  Plus,
  Search,
  Sparkles,
  Trash2,
  User,
  Workflow,
  X,
} from 'lucide-react';
import { TimeMatrix } from './TimeMatrix';
import { getAppTimeAssessment, type TimeThresholds } from '../timeAssessment';
import { setLandscapeStateId } from '../landscapeState';
import { type LandscapeState } from './StateMenu';
import {
  STATUS_META,
  type TransformationAction,
  type TransformationEntityType,
  type TransformationStatus,
} from './TransformationsView';

const API_BASE = '/api';

interface HydratedEntity {
  id: string;
  entityType: TransformationEntityType;
  name: string;
  description?: string | null;
  subtitle?: string;
  ownerOrg?: { id: string; name: string; type?: string | null } | null;
  lifecycle?: string | null;
  criticality?: string | null;
  cost?: string | null;
  functionalFit?: string | null;
  technicalFit?: string | null;
  timeRationale?: string | null;
  vendorName?: string | null;
  capabilities?: Array<{ id: string; name: string; criticality?: string | null }>;
  type?: string | null;
  parent?: { id: string; name: string } | null;
  sourceApp?: { id: string; name: string };
  targetApp?: { id: string; name: string };
  payload?: { id: string; name: string } | null;
  pattern?: string | null;
  frequency?: string | null;
}

interface HydratedTransformationStep {
  id: string;
  transformationId: string;
  entityType: TransformationEntityType;
  action: TransformationAction;
  title: string | null;
  notes: string | null;
  predecessorIds: string[];
  successorIds: string[];
  predecessors: HydratedEntity[];
  successors: HydratedEntity[];
  order: number;
}

interface SuggestedStep {
  key: string;
  entityType: TransformationEntityType;
  action: TransformationAction;
  title: string;
  notes: string;
  predecessorIds: string[];
  successorIds: string[];
  predecessors: Array<{ id: string; name: string; subtitle?: string }>;
  successors: Array<{ id: string; name: string; subtitle?: string }>;
}

interface CatalogItem {
  id: string;
  name: string;
  subtitle?: string;
}

interface TransformationDetail {
  id: string;
  name: string;
  description: string | null;
  status: TransformationStatus;
  owner: string | null;
  startDate: string | null;
  targetDate: string | null;
  fromStateId: string;
  toStateId: string;
  references: string | null;
  createdAt: string;
  updatedAt: string;
  fromState: LandscapeState;
  toState: LandscapeState;
  steps: HydratedTransformationStep[];
  suggestedSteps: SuggestedStep[];
  impact: {
    predecessorApps: HydratedEntity[];
    successorApps: HydratedEntity[];
    metrics: {
      predecessorAppCount: number;
      successorAppCount: number;
      appCountDelta: number;
      avgTechFitBefore: number;
      avgTechFitAfter: number;
      techFitDelta: number;
      avgFuncFitBefore: number;
      avgFuncFitAfter: number;
      funcFitDelta: number;
      totalCostBefore: number;
      totalCostAfter: number;
      costDelta: number;
      retiredCount: number;
      introducedCount: number;
      consolidatedCount: number;
      evolvedCount: number;
      atRiskIntegrationCount: number;
      affectedCapabilityCount: number;
    };
    integrations: Array<{
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
    }>;
    capabilities: Array<{
      name: string;
      criticality: string;
      fromCapabilityId: string | null;
      toCapabilityId: string | null;
      beforeApps: Array<{ id: string; name: string }>;
      afterApps: Array<{ id: string; name: string }>;
      status: 'consolidated' | 'maintained' | 'expanded' | 'new_coverage' | 'gap_risk';
    }>;
  };
  catalogs: {
    fromState: {
      applications: CatalogItem[];
      organizations: CatalogItem[];
      capabilities: CatalogItem[];
      integrations: CatalogItem[];
    };
    toState: {
      applications: CatalogItem[];
      organizations: CatalogItem[];
      capabilities: CatalogItem[];
      integrations: CatalogItem[];
    };
  };
}

const ACTION_META: Record<
  TransformationAction,
  { label: string; color: string; bg: string; border: string; description: string }
> = {
  REPLACE: {
    label: 'Replace (1→1)',
    color: '#3b82f6',
    bg: 'rgba(59, 130, 246, 0.14)',
    border: 'rgba(59, 130, 246, 0.4)',
    description: 'Replace predecessor artifact with a successor artifact',
  },
  CONSOLIDATE: {
    label: 'Consolidate (N→1)',
    color: '#8b5cf6',
    bg: 'rgba(139, 92, 246, 0.14)',
    border: 'rgba(139, 92, 246, 0.4)',
    description: 'Consolidate multiple predecessors into fewer successors',
  },
  SPLIT: {
    label: 'Split (1→M)',
    color: '#ec4899',
    bg: 'rgba(236, 72, 153, 0.14)',
    border: 'rgba(236, 72, 153, 0.4)',
    description: 'Decompose a predecessor into multiple specialized successors',
  },
  RETIRE: {
    label: 'Retire (N→0)',
    color: '#ef4444',
    bg: 'rgba(239, 68, 68, 0.14)',
    border: 'rgba(239, 68, 68, 0.4)',
    description: 'Decommission predecessor without direct replacement',
  },
  INTRODUCE: {
    label: 'Introduce (0→M)',
    color: '#10b981',
    bg: 'rgba(16, 185, 129, 0.14)',
    border: 'rgba(16, 185, 129, 0.4)',
    description: 'Introduce net-new target state artifact',
  },
  EVOLVE: {
    label: 'Evolve / Reassign',
    color: '#f59e0b',
    bg: 'rgba(245, 158, 11, 0.14)',
    border: 'rgba(245, 158, 11, 0.4)',
    description: 'Modernize, re-platform, or transfer ownership across states',
  },
};

function EntityNodeCard({ data }: { data: any }) {
  const isFrom = data.side === 'from';
  const borderColor = isFrom ? 'rgba(148, 163, 184, 0.5)' : 'rgba(245, 158, 11, 0.65)';
  const pillBg = isFrom ? 'var(--secondary)' : 'rgba(245, 158, 11, 0.16)';
  const pillColor = isFrom ? 'var(--muted-foreground)' : '#f59e0b';

  return (
    <div
      style={{
        width: 240,
        padding: '0.65rem 0.8rem',
        borderRadius: '0.6rem',
        background: 'var(--card)',
        border: `1.5px solid ${borderColor}`,
        boxShadow: '0 4px 14px rgba(0, 0, 0, 0.14)',
        cursor: 'pointer',
        fontSize: '0.8rem',
      }}
    >
      {!isFrom && <Handle type="target" position={Position.Left} style={{ background: '#f59e0b' }} />}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.35rem', marginBottom: '0.25rem' }}>
        <span
          style={{
            fontSize: '0.64rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            padding: '0.1rem 0.4rem',
            borderRadius: '999px',
            background: pillBg,
            color: pillColor,
          }}
        >
          {data.stateLabel} · {data.entity.entityType}
        </span>
        {data.entity.lifecycle && (
          <span style={{ fontSize: '0.65rem', color: 'var(--muted-foreground)' }}>
            {data.entity.lifecycle}
          </span>
        )}
      </div>
      <div style={{ fontWeight: 700, color: 'var(--foreground)', fontSize: '0.86rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {data.entity.name}
      </div>
      {data.entity.subtitle && (
        <div style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)', marginTop: '0.15rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {data.entity.subtitle}
        </div>
      )}
      {isFrom && <Handle type="source" position={Position.Right} style={{ background: '#6366f1' }} />}
    </div>
  );
}

function ActionStepNodeCard({ data }: { data: any }) {
  const step = data.step as HydratedTransformationStep;
  const meta = ACTION_META[step.action as TransformationAction] || ACTION_META.REPLACE;
  return (
    <div
      title="Click to edit this transition step"
      style={{
        width: 245,
        padding: '0.65rem 0.85rem',
        borderRadius: '0.75rem',
        background: `color-mix(in srgb, ${meta.color} 12%, var(--card))`,
        border: `1.5px solid ${meta.border}`,
        boxShadow: '0 4px 14px rgba(0, 0, 0, 0.14)',
        textAlign: 'left',
        cursor: 'pointer',
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: meta.color }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.4rem', marginBottom: '0.28rem' }}>
        <span
          style={{
            fontSize: '0.64rem',
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: meta.color,
          }}
        >
          {meta.label}
        </span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.22rem',
            fontSize: '0.66rem',
            fontWeight: 600,
            padding: '0.1rem 0.42rem',
            borderRadius: '999px',
            background: 'var(--card)',
            border: '1px solid var(--border)',
            color: 'var(--foreground)',
          }}
        >
          <Edit3 size={10} />
          Edit
        </span>
      </div>
      <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--foreground)' }}>
        {step.title || `${step.entityType} Transition`}
      </div>
      {step.notes && (
        <div
          style={{
            fontSize: '0.7rem',
            color: 'var(--muted-foreground)',
            marginTop: '0.2rem',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {step.notes}
        </div>
      )}
      <div style={{ marginTop: '0.35rem', fontSize: '0.68rem', color: 'var(--muted-foreground)', fontWeight: 600 }}>
        {step.predecessorIds.length} pred → {step.successorIds.length} succ
      </div>
      <Handle type="source" position={Position.Right} style={{ background: meta.color }} />
    </div>
  );
}

const TRANSITION_NODE_TYPES = {
  entityNode: EntityNodeCard,
  actionStepNode: ActionStepNodeCard,
};

export const TransformationDetailsView: React.FC<{ timeThresholds?: TimeThresholds }> = ({
  timeThresholds,
}) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'diagram' | 'steps' | 'impact'>('diagram');
  const [diagramEntityFilter, setDiagramEntityFilter] = useState<string>('all');
  const [selectedEntityPopup, setSelectedEntityPopup] = useState<{
    entity: HydratedEntity;
    stateId: string;
    stateName: string;
  } | null>(null);

  // Step Modal State
  const [stepModalOpen, setStepModalOpen] = useState(false);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [stepEntityType, setStepEntityType] = useState<TransformationEntityType>('Application');
  const [stepAction, setStepAction] = useState<TransformationAction>('REPLACE');
  const [stepTitle, setStepTitle] = useState('');
  const [stepNotes, setStepNotes] = useState('');
  const [stepPredIds, setStepPredIds] = useState<string[]>([]);
  const [stepSuccIds, setStepSuccIds] = useState<string[]>([]);
  const [predSearch, setPredSearch] = useState('');
  const [succSearch, setSuccSearch] = useState('');
  const [savingSteps, setSavingSteps] = useState(false);

  // Suggestions filter
  const [suggestionFilter, setSuggestionFilter] = useState<string>('all');
  const [suggestionSearch, setSuggestionSearch] = useState<string>('');

  // Edit Transformation Metadata Modal
  const [editMetaOpen, setEditMetaOpen] = useState(false);
  const [metaName, setMetaName] = useState('');
  const [metaDesc, setMetaDesc] = useState('');
  const [metaStatus, setMetaStatus] = useState<TransformationStatus>('Planned');
  const [metaOwner, setMetaOwner] = useState('');
  const [metaStartDate, setMetaStartDate] = useState('');
  const [metaTargetDate, setMetaTargetDate] = useState('');

  // Apply Transformation Modal
  const [applyOpen, setApplyOpen] = useState(false);
  const [backupFromState, setBackupFromState] = useState(true);
  const [backupName, setBackupName] = useState('');
  const [retireMode, setRetireMode] = useState<'delete' | 'decommission'>('delete');
  const [markCompleted, setMarkCompleted] = useState(true);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState('');

  const { data: detail, isLoading, error } = useQuery<TransformationDetail>({
    queryKey: ['transformation', id],
    enabled: !!id,
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/transformations/${id}`);
      if (!res.ok) throw new Error('Transformation not found');
      return res.json();
    },
  });

  const saveStepsList = async (nextSteps: Array<{
    id?: string;
    entityType: TransformationEntityType;
    action: TransformationAction;
    title?: string | null;
    notes?: string | null;
    predecessorIds: string[];
    successorIds: string[];
    order?: number;
  }>) => {
    if (!detail) return;
    setSavingSteps(true);
    try {
      const res = await fetch(`${API_BASE}/transformations/${detail.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          steps: nextSteps.map((s, idx) => ({
            id: s.id,
            entityType: s.entityType,
            action: s.action,
            title: s.title || null,
            notes: s.notes || null,
            predecessorIds: s.predecessorIds,
            successorIds: s.successorIds,
            order: idx,
          })),
        }),
      });
      if (!res.ok) throw new Error('Failed to update transformation steps');
      const updated = await res.json();
      queryClient.setQueryData(['transformation', detail.id], updated);
      queryClient.invalidateQueries({ queryKey: ['transformations'] });
    } finally {
      setSavingSteps(false);
    }
  };

  const openNewStepModal = () => {
    setEditingStepId(null);
    setStepEntityType('Application');
    setStepAction('REPLACE');
    setStepTitle('');
    setStepNotes('');
    setStepPredIds([]);
    setStepSuccIds([]);
    setPredSearch('');
    setSuccSearch('');
    setStepModalOpen(true);
  };

  const openEditStepModal = (step: HydratedTransformationStep) => {
    setEditingStepId(step.id);
    setStepEntityType(step.entityType);
    setStepAction(step.action);
    setStepTitle(step.title || '');
    setStepNotes(step.notes || '');
    setStepPredIds(step.predecessorIds);
    setStepSuccIds(step.successorIds);
    setPredSearch('');
    setSuccSearch('');
    setStepModalOpen(true);
  };

  const handleSaveStepModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    const currentSteps = detail.steps.map((s) => ({
      id: s.id,
      entityType: s.entityType,
      action: s.action,
      title: s.title,
      notes: s.notes,
      predecessorIds: s.predecessorIds,
      successorIds: s.successorIds,
    }));

    const draft = {
      id: editingStepId || undefined,
      entityType: stepEntityType,
      action: stepAction,
      title: stepTitle.trim() || null,
      notes: stepNotes.trim() || null,
      predecessorIds: stepPredIds,
      successorIds: stepSuccIds,
    };

    const nextSteps = editingStepId
      ? currentSteps.map((s) => (s.id === editingStepId ? draft : s))
      : [...currentSteps, draft];

    await saveStepsList(nextSteps);
    setStepModalOpen(false);
  };

  const handleDeleteStep = async (stepId: string) => {
    if (!detail) return;
    const nextSteps = detail.steps.filter((s) => s.id !== stepId);
    await saveStepsList(nextSteps);
  };

  const handleMoveStep = async (index: number, direction: -1 | 1) => {
    if (!detail) return;
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= detail.steps.length) return;
    const copy = [...detail.steps];
    const [moved] = copy.splice(index, 1);
    if (!moved) return;
    copy.splice(targetIdx, 0, moved);
    await saveStepsList(copy);
  };

  const handleAddSuggestion = async (sug: SuggestedStep) => {
    if (!detail) return;
    const nextSteps = [
      ...detail.steps,
      {
        entityType: sug.entityType,
        action: sug.action,
        title: sug.title,
        notes: sug.notes,
        predecessorIds: sug.predecessorIds,
        successorIds: sug.successorIds,
      },
    ];
    await saveStepsList(nextSteps);
  };

  const handleAddAllSuggestions = async (suggestionsToAdd: SuggestedStep[]) => {
    if (!detail || suggestionsToAdd.length === 0) return;
    const nextSteps = [
      ...detail.steps,
      ...suggestionsToAdd.map((sug) => ({
        entityType: sug.entityType,
        action: sug.action,
        title: sug.title,
        notes: sug.notes,
        predecessorIds: sug.predecessorIds,
        successorIds: sug.successorIds,
      })),
    ];
    await saveStepsList(nextSteps);
  };

  const openEditMeta = () => {
    if (!detail) return;
    setMetaName(detail.name);
    setMetaDesc(detail.description || '');
    setMetaStatus(detail.status);
    setMetaOwner(detail.owner || '');
    setMetaStartDate(detail.startDate ? detail.startDate.slice(0, 10) : '');
    setMetaTargetDate(detail.targetDate ? detail.targetDate.slice(0, 10) : '');
    setEditMetaOpen(true);
  };

  const handleSaveMeta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail || !metaName.trim()) return;
    const res = await fetch(`${API_BASE}/transformations/${detail.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: metaName.trim(),
        description: metaDesc.trim() || null,
        status: metaStatus,
        owner: metaOwner.trim() || null,
        startDate: metaStartDate || null,
        targetDate: metaTargetDate || null,
      }),
    });
    if (res.ok) {
      const updated = await res.json();
      queryClient.setQueryData(['transformation', detail.id], updated);
      queryClient.invalidateQueries({ queryKey: ['transformations'] });
      setEditMetaOpen(false);
    }
  };

  const openApplyModal = () => {
    if (!detail) return;
    const today = new Date().toISOString().slice(0, 10);
    setBackupFromState(true);
    setBackupName(`Before ${detail.name} (${today})`.slice(0, 80));
    setRetireMode('delete');
    setMarkCompleted(true);
    setApplyError('');
    setApplyOpen(true);
  };

  const handleApplyTransformation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    setApplying(true);
    setApplyError('');
    try {
      const res = await fetch(`${API_BASE}/transformations/${detail.id}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          backupFromState,
          backupName: backupFromState ? backupName.trim() : undefined,
          retireMode,
          markCompleted,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error || 'Could not apply transformation.');
      }
      await queryClient.invalidateQueries({ queryKey: ['transformation', detail.id] });
      await queryClient.invalidateQueries({ queryKey: ['transformations'] });
      await queryClient.invalidateQueries({ queryKey: ['landscape-states'] });
      await queryClient.invalidateQueries({
        predicate: (q) => q.queryKey[0] !== 'landscape-states',
      });
      setApplyOpen(false);
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : 'Could not apply transformation.');
    } finally {
      setApplying(false);
    }
  };

  // Build ReactFlow nodes and edges for the Transition Map
  const { flowNodes, flowEdges } = useMemo(() => {
    if (!detail) return { flowNodes: [] as Node[], flowEdges: [] as Edge[] };

    const visibleSteps = detail.steps.filter(
      (s) => diagramEntityFilter === 'all' || s.entityType === diagramEntityFilter,
    );

    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const placedFromNodes = new Map<string, string>();
    const placedToNodes = new Map<string, string>();

    let currentY = 40;

    for (const step of visibleSteps) {
      const meta = ACTION_META[step.action] || ACTION_META.REPLACE;
      // Cap predecessor/successor nodes per step at 8 in the visual diagram to avoid overwhelming vertical stacks
      const preds = step.predecessors.slice(0, 8);
      const succs = step.successors.slice(0, 8);
      const rowSlots = Math.max(preds.length, succs.length, 1);
      const blockHeight = rowSlots * 92;
      const stepCenterY = currentY + (blockHeight - 72) / 2;

      const stepNodeId = `step-${step.id}`;
      nodes.push({
        id: stepNodeId,
        type: 'actionStepNode',
        position: { x: 370, y: stepCenterY },
        data: { step },
      });

      preds.forEach((pred, idx) => {
        const key = `from:${pred.entityType}:${pred.id}`;
        let nodeId = placedFromNodes.get(key);
        if (!nodeId) {
          nodeId = `pred-${step.id}-${pred.id}`;
          placedFromNodes.set(key, nodeId);
          const predY =
            currentY + (blockHeight - preds.length * 88) / 2 + idx * 88;
          nodes.push({
            id: nodeId,
            type: 'entityNode',
            position: { x: 30, y: predY },
            data: {
              side: 'from',
              stateId: detail.fromStateId,
              stateLabel: detail.fromState.name,
              entity: pred,
            },
          });
        }
        edges.push({
          id: `e-${nodeId}-${stepNodeId}`,
          source: nodeId,
          target: stepNodeId,
          animated: true,
          style: { stroke: meta.color, strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: meta.color },
        });
      });

      succs.forEach((succ, idx) => {
        const key = `to:${succ.entityType}:${succ.id}`;
        let nodeId = placedToNodes.get(key);
        if (!nodeId) {
          nodeId = `succ-${step.id}-${succ.id}`;
          placedToNodes.set(key, nodeId);
          const succY =
            currentY + (blockHeight - succs.length * 88) / 2 + idx * 88;
          nodes.push({
            id: nodeId,
            type: 'entityNode',
            position: { x: 700, y: succY },
            data: {
              side: 'to',
              stateId: detail.toStateId,
              stateLabel: detail.toState.name,
              entity: succ,
            },
          });
        }
        edges.push({
          id: `e-${stepNodeId}-${nodeId}`,
          source: stepNodeId,
          target: nodeId,
          animated: true,
          style: { stroke: meta.color, strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: meta.color },
        });
      });

      currentY += blockHeight + 36;
    }

    return { flowNodes: nodes, flowEdges: edges };
  }, [detail, diagramEntityFilter]);

  const filteredSuggestions = useMemo(() => {
    if (!detail) return [];
    return detail.suggestedSteps.filter((s) => {
      if (suggestionFilter !== 'all' && s.entityType !== suggestionFilter) return false;
      if (suggestionSearch.trim()) {
        const q = suggestionSearch.toLowerCase();
        if (!`${s.title} ${s.notes}`.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [detail, suggestionFilter, suggestionSearch]);

  const catalogForEntityType = (side: 'fromState' | 'toState', entityType: TransformationEntityType): CatalogItem[] => {
    if (!detail) return [];
    const cat = detail.catalogs[side];
    switch (entityType) {
      case 'Application':
        return cat.applications;
      case 'Organization':
        return cat.organizations;
      case 'Capability':
        return cat.capabilities;
      case 'Integration':
        return cat.integrations;
    }
  };

  const navigateToConceptInState = (entity: HydratedEntity, stateId: string) => {
    setLandscapeStateId(stateId);
    queryClient.invalidateQueries({
      predicate: (q) => q.queryKey[0] !== 'landscape-states',
    });
    const pathMap: Record<TransformationEntityType, string> = {
      Application: `/apps/${entity.id}`,
      Organization: `/organizations/${entity.id}`,
      Capability: `/capabilities/${entity.id}`,
      Integration: `/integrations/${entity.id}`,
    };
    navigate(pathMap[entity.entityType], { state: { from: `/transformations/${id}` } });
  };

  if (isLoading) {
    return (
      <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted-foreground)' }}>
        Loading transformation details…
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="card" style={{ padding: '2.5rem', textAlign: 'center' }}>
        <p style={{ color: 'var(--muted-foreground)' }}>Transformation not found.</p>
        <button type="button" className="primary" onClick={() => navigate('/transformations')}>
          Back to Transformations
        </button>
      </div>
    );
  }

  const stMeta = STATUS_META[detail.status] || STATUS_META.Planned;
  const { metrics } = detail.impact;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Top Breadcrumb + Header Card */}
      <div className="card" style={{ padding: '1.25rem 1.4rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => navigate('/transformations')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.35rem 0.7rem',
                fontSize: '0.8rem',
              }}
            >
              <ArrowLeft size={14} />
              Transformations
            </button>

            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                padding: '0.3rem 0.75rem',
                borderRadius: '999px',
                background: 'var(--muted)',
                border: '1px solid var(--border)',
                fontSize: '0.8rem',
                fontWeight: 600,
              }}
            >
              <GitBranch size={13} style={{ color: 'var(--brand-focus)' }} />
              <span>{detail.fromState.name}</span>
              <ArrowRight size={13} style={{ color: 'var(--muted-foreground)' }} />
              <span style={{ color: '#f59e0b' }}>{detail.toState.name}</span>
            </div>

            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontSize: '0.78rem',
                fontWeight: 600,
                padding: '0.26rem 0.65rem',
                borderRadius: '999px',
                color: stMeta.color,
                background: stMeta.bg,
                border: `1px solid ${stMeta.border}`,
              }}
            >
              {stMeta.icon}
              {detail.status}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={openEditMeta}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem' }}
            >
              <Edit3 size={14} />
              Edit Details
            </button>
            <button
              type="button"
              className="primary"
              onClick={openApplyModal}
              disabled={detail.steps.length === 0}
              title={`Promote this transformation's changes from ${detail.toState.name} into ${detail.fromState.name}`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem' }}
            >
              <GitMerge size={14} />
              Apply to {detail.fromState.name}…
            </button>
          </div>
        </div>

        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>{detail.name}</h1>
          {detail.description && (
            <p style={{ margin: '0.35rem 0 0', color: 'var(--muted-foreground)', fontSize: '0.9rem', maxWidth: '60rem' }}>
              {detail.description}
            </p>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
            paddingTop: '0.75rem',
            borderTop: '1px solid var(--border)',
            fontSize: '0.82rem',
            color: 'var(--muted-foreground)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <User size={14} />
              Owner: <strong style={{ color: 'var(--foreground)' }}>{detail.owner || 'Unassigned'}</strong>
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <Calendar size={14} />
              Timeline:{' '}
              <strong style={{ color: 'var(--foreground)' }}>
                {detail.startDate ? detail.startDate.slice(0, 10) : 'TBD'} →{' '}
                {detail.targetDate ? detail.targetDate.slice(0, 10) : 'TBD'}
              </strong>
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', flexWrap: 'wrap' }}>
            <span>
              Steps: <strong style={{ color: 'var(--foreground)' }}>{detail.steps.length}</strong>
            </span>
            <span>
              Predecessor Apps: <strong style={{ color: 'var(--foreground)' }}>{metrics.predecessorAppCount}</strong>
            </span>
            <span>
              Successor Apps: <strong style={{ color: 'var(--foreground)' }}>{metrics.successorAppCount}</strong>
            </span>
            {metrics.atRiskIntegrationCount > 0 && (
              <span style={{ color: '#ef4444', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                <AlertTriangle size={13} />
                {metrics.atRiskIntegrationCount} at-risk integrations
              </span>
            )}
          </div>
        </div>
      </div>

      {/* View Switcher Tabs */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div
          style={{
            display: 'inline-flex',
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: '0.6rem',
            padding: '0.25rem',
            gap: '0.25rem',
          }}
        >
          {[
            { id: 'diagram' as const, label: 'Transition Map', icon: <Workflow size={15} />, badge: detail.steps.length },
            {
              id: 'steps' as const,
              label: 'Steps & Diff Builder',
              icon: <Layers size={15} />,
              badge: detail.suggestedSteps.length > 0 ? `+${detail.suggestedSteps.length} suggested` : `${detail.steps.length}`,
            },
            {
              id: 'impact' as const,
              label: 'Impact & TIME Delta',
              icon: <BarChart3 size={15} />,
              badge: metrics.atRiskIntegrationCount > 0 ? `${metrics.atRiskIntegrationCount} risk` : undefined,
            },
          ].map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  padding: '0.48rem 0.95rem',
                  borderRadius: '0.45rem',
                  border: 'none',
                  background: active ? 'var(--primary)' : 'transparent',
                  color: active ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
                  fontWeight: 600,
                  fontSize: '0.84rem',
                  cursor: 'pointer',
                  height: 'auto',
                }}
              >
                {tab.icon}
                <span>{tab.label}</span>
                {tab.badge !== undefined && (
                  <span
                    style={{
                      fontSize: '0.7rem',
                      padding: '0.08rem 0.42rem',
                      borderRadius: '999px',
                      background: active ? 'color-mix(in srgb, var(--primary-foreground) 18%, transparent)' : 'var(--secondary)',
                      color: active ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
                    }}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {activeTab === 'diagram' && detail.steps.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveTab('steps')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem' }}
            >
              <Edit3 size={14} />
              Manage & Edit Steps ({detail.steps.length})
            </button>
          )}
          <button
            type="button"
            className="primary"
            onClick={openNewStepModal}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.84rem' }}
          >
            <Plus size={15} />
            Add Transition Step
          </button>
        </div>
      </div>

      {/* TAB 1: VISUAL TRANSITION MAP */}
      {activeTab === 'diagram' && (
        <div className="card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem' }}>
                Predecessor ({detail.fromState.name}) → Transition Action → Successor ({detail.toState.name})
              </h3>
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--muted-foreground)' }}>
                Click any central <strong>Transition Action</strong> card (<strong>Edit</strong>) to modify its predecessors, successors, action, or notes — or click any artifact card to inspect it.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.78rem', color: 'var(--muted-foreground)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                Concept Filter:
              </label>
              <select
                value={diagramEntityFilter}
                onChange={(e) => setDiagramEntityFilter(e.target.value)}
                style={{ fontSize: '0.82rem', marginTop: 0 }}
              >
                <option value="all">All Concepts ({detail.steps.length} steps)</option>
                <option value="Application">Applications</option>
                <option value="Organization">Organizations</option>
                <option value="Integration">Integrations</option>
                <option value="Capability">Capabilities</option>
              </select>
            </div>
          </div>

          {flowNodes.length === 0 ? (
            <div
              style={{
                padding: '3.5rem 2rem',
                textAlign: 'center',
                border: '1px dashed var(--border)',
                borderRadius: '0.6rem',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.75rem',
              }}
            >
              <GitCompareArrows size={28} style={{ color: 'var(--muted-foreground)' }} />
              <div style={{ fontWeight: 600 }}>No transition steps in this view yet</div>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--muted-foreground)', maxWidth: '30rem' }}>
                Add transition steps manually or switch to the <strong>Steps & Diff Builder</strong> tab to import
                auto-detected differences between <strong>{detail.fromState.name}</strong> and{' '}
                <strong>{detail.toState.name}</strong>.
              </p>
              <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.25rem' }}>
                <button type="button" className="primary" onClick={openNewStepModal}>
                  <Plus size={14} /> Add Transition Step
                </button>
                {detail.suggestedSteps.length > 0 && (
                  <button type="button" onClick={() => setActiveTab('steps')}>
                    <Sparkles size={14} /> View {detail.suggestedSteps.length} Suggested Diffs
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div style={{ height: '620px', width: '100%', borderRadius: '0.6rem', overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--muted)' }}>
              <ReactFlow
                nodes={flowNodes}
                edges={flowEdges}
                nodeTypes={TRANSITION_NODE_TYPES}
                fitView
                fitViewOptions={{ padding: 0.18 }}
                minZoom={0.2}
                maxZoom={1.6}
                onNodeClick={(_e: React.MouseEvent, node: Node) => {
                  if (node.type === 'entityNode' && node.data?.entity) {
                    setSelectedEntityPopup({
                      entity: node.data.entity as HydratedEntity,
                      stateId: node.data.stateId as string,
                      stateName: node.data.stateLabel as string,
                    });
                  } else if (node.type === 'actionStepNode' && node.data?.step) {
                    openEditStepModal(node.data.step as HydratedTransformationStep);
                  }
                }}
              >
                <Background gap={20} size={1} />
                <Controls />
              </ReactFlow>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: STEPS & DIFF BUILDER */}
      {activeTab === 'steps' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
            gap: '1.25rem',
            alignItems: 'start',
          }}
        >
          {/* Left Column: Mapped Transformation Steps */}
          <div className="card" style={{ padding: '1.15rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.02rem' }}>
                  Mapped Transition Steps ({detail.steps.length})
                </h3>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: 'var(--muted-foreground)' }}>
                  Ordered Predecessor ({detail.fromState.name}) ↔ Successor ({detail.toState.name}) transitions. Click <strong>Edit</strong> on any step to change its action or artifacts.
                </p>
              </div>
              <button type="button" className="primary" onClick={openNewStepModal} style={{ fontSize: '0.78rem', padding: '0 0.75rem', gap: '0.3rem' }}>
                <Plus size={13} /> Add Step
              </button>
            </div>

            {detail.steps.length === 0 ? (
              <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '0.86rem', border: '1px dashed var(--border)', borderRadius: '0.5rem' }}>
                No transition steps added yet. Click <strong>+ Add Step</strong> or select from the{' '}
                <strong>Auto-Suggested State Diffs</strong> panel.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {detail.steps.map((step, idx) => {
                  const act = ACTION_META[step.action] || ACTION_META.REPLACE;
                  return (
                    <div
                      key={step.id}
                      style={{
                        padding: '0.9rem 1rem',
                        borderRadius: '0.6rem',
                        border: '1px solid var(--border)',
                        background: 'var(--muted)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.65rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <div
                          onClick={() => openEditStepModal(step)}
                          title="Click to edit transition step"
                          style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap', cursor: 'pointer' }}
                        >
                          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--muted-foreground)' }}>
                            #{idx + 1}
                          </span>
                          <span
                            style={{
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              padding: '0.15rem 0.5rem',
                              borderRadius: '999px',
                              background: act.bg,
                              color: act.color,
                              border: `1px solid ${act.border}`,
                            }}
                          >
                            {act.label}
                          </span>
                          <span
                            style={{
                              fontSize: '0.68rem',
                              fontWeight: 600,
                              padding: '0.15rem 0.45rem',
                              borderRadius: '0.3rem',
                              background: 'var(--card)',
                              color: 'var(--muted-foreground)',
                              border: '1px solid var(--border)',
                            }}
                          >
                            {step.entityType}
                          </span>
                          <strong style={{ fontSize: '0.88rem', color: 'var(--foreground)' }}>
                            {step.title || `${step.entityType} Transition`}
                          </strong>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <button
                            type="button"
                            onClick={() => openEditStepModal(step)}
                            title="Edit step predecessors, successors, action, or notes"
                            style={{
                              height: '1.75rem',
                              padding: '0 0.6rem',
                              fontSize: '0.76rem',
                              gap: '0.3rem',
                              background: 'var(--card)',
                              border: '1px solid var(--border)',
                              color: 'var(--foreground)',
                              fontWeight: 600,
                            }}
                          >
                            <Edit3 size={12} />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveStep(idx, -1)}
                            disabled={idx === 0 || savingSteps}
                            title="Move up"
                            style={{ height: '1.75rem', width: '1.75rem', padding: 0, background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--muted-foreground)' }}
                          >
                            <ArrowUp size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveStep(idx, 1)}
                            disabled={idx === detail.steps.length - 1 || savingSteps}
                            title="Move down"
                            style={{ height: '1.75rem', width: '1.75rem', padding: 0, background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--muted-foreground)' }}
                          >
                            <ArrowDown size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteStep(step.id)}
                            title="Delete step"
                            style={{ height: '1.75rem', width: '1.75rem', padding: 0, background: 'var(--card)', border: '1px solid color-mix(in srgb, var(--destructive) 35%, var(--border))', color: 'var(--destructive)' }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      {step.notes && (
                        <div style={{ fontSize: '0.78rem', color: 'var(--muted-foreground)' }}>
                          {step.notes}
                        </div>
                      )}

                      {/* Predecessor <-> Successor Pills */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '0.6rem', alignItems: 'center' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                          {step.predecessors.length === 0 ? (
                            <button
                              type="button"
                              onClick={() => openEditStepModal(step)}
                              style={{
                                height: 'auto',
                                padding: '0.2rem 0.5rem',
                                fontSize: '0.73rem',
                                background: 'transparent',
                                border: '1px dashed var(--border)',
                                color: 'var(--muted-foreground)',
                                fontStyle: 'italic',
                              }}
                            >
                              + Add predecessors ({detail.fromState.name})
                            </button>
                          ) : (
                            step.predecessors.slice(0, 6).map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() =>
                                  setSelectedEntityPopup({
                                    entity: p,
                                    stateId: detail.fromStateId,
                                    stateName: detail.fromState.name,
                                  })
                                }
                                style={{
                                  height: 'auto',
                                  fontSize: '0.73rem',
                                  padding: '0.2rem 0.5rem',
                                  borderRadius: '0.35rem',
                                  background: 'var(--card)',
                                  border: '1px solid var(--border)',
                                  color: 'var(--foreground)',
                                  cursor: 'pointer',
                                  textAlign: 'left',
                                }}
                              >
                                {p.name}
                                {p.subtitle ? <span style={{ color: 'var(--muted-foreground)' }}> · {p.subtitle}</span> : null}
                              </button>
                            ))
                          )}
                          {step.predecessors.length > 6 && (
                            <button
                              type="button"
                              onClick={() => openEditStepModal(step)}
                              title="Click to view and edit all predecessors in this step"
                              style={{
                                height: 'auto',
                                padding: '0.18rem 0.45rem',
                                fontSize: '0.72rem',
                                background: 'var(--card)',
                                border: '1px dashed var(--border)',
                                color: 'var(--brand-focus)',
                                fontWeight: 600,
                              }}
                            >
                              +{step.predecessors.length - 6} more (edit)
                            </button>
                          )}
                        </div>

                        <ArrowRight size={15} style={{ color: act.color }} />

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                          {step.successors.length === 0 ? (
                            <button
                              type="button"
                              onClick={() => openEditStepModal(step)}
                              style={{
                                height: 'auto',
                                padding: '0.2rem 0.5rem',
                                fontSize: '0.73rem',
                                background: 'transparent',
                                border: '1px dashed var(--border)',
                                color: 'var(--muted-foreground)',
                                fontStyle: 'italic',
                              }}
                            >
                              {step.action === 'RETIRE'
                                ? `Retired in ${detail.toState.name} (click to edit)`
                                : `+ Add successors (${detail.toState.name})`}
                            </button>
                          ) : (
                            step.successors.slice(0, 6).map((s) => (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() =>
                                  setSelectedEntityPopup({
                                    entity: s,
                                    stateId: detail.toStateId,
                                    stateName: detail.toState.name,
                                  })
                                }
                                style={{
                                  height: 'auto',
                                  fontSize: '0.73rem',
                                  padding: '0.2rem 0.5rem',
                                  borderRadius: '0.35rem',
                                  background: 'rgba(245, 158, 11, 0.1)',
                                  border: '1px solid rgba(245, 158, 11, 0.35)',
                                  color: 'var(--foreground)',
                                  cursor: 'pointer',
                                  textAlign: 'left',
                                }}
                              >
                                {s.name}
                                {s.subtitle ? <span style={{ color: 'var(--muted-foreground)' }}> · {s.subtitle}</span> : null}
                              </button>
                            ))
                          )}
                          {step.successors.length > 6 && (
                            <button
                              type="button"
                              onClick={() => openEditStepModal(step)}
                              title="Click to view and edit all successors in this step"
                              style={{
                                height: 'auto',
                                padding: '0.18rem 0.45rem',
                                fontSize: '0.72rem',
                                background: 'var(--card)',
                                border: '1px dashed var(--border)',
                                color: 'var(--brand-focus)',
                                fontWeight: 600,
                              }}
                            >
                              +{step.successors.length - 6} more (edit)
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: Auto-Suggested State Diffs */}
          <div className="card" style={{ padding: '1.15rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.02rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Sparkles size={16} style={{ color: '#f59e0b' }} />
                  Auto-Detected State Diffs ({filteredSuggestions.length})
                </h3>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: 'var(--muted-foreground)' }}>
                  Unmapped differences detected between <strong>{detail.fromState.name}</strong> and{' '}
                  <strong>{detail.toState.name}</strong>.
                </p>
              </div>

              {filteredSuggestions.length > 0 && (
                <button
                  type="button"
                  onClick={() => handleAddAllSuggestions(filteredSuggestions)}
                  disabled={savingSteps}
                  style={{ fontSize: '0.76rem', padding: '0.35rem 0.7rem' }}
                >
                  + Add All ({filteredSuggestions.length})
                </button>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="Filter suggestions..."
                value={suggestionSearch}
                onChange={(e) => setSuggestionSearch(e.target.value)}
                style={{ flex: 1, fontSize: '0.8rem', padding: '0.38rem 0.65rem' }}
              />
              <select
                value={suggestionFilter}
                onChange={(e) => setSuggestionFilter(e.target.value)}
                style={{ fontSize: '0.8rem' }}
              >
                <option value="all">All Types</option>
                <option value="Application">Applications</option>
                <option value="Organization">Organizations</option>
                <option value="Integration">Integrations</option>
              </select>
            </div>

            {filteredSuggestions.length === 0 ? (
              <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '0.84rem' }}>
                <CheckCircle2 size={22} style={{ color: '#10b981', marginBottom: '0.4rem' }} />
                <div>All detected differences between these states are already mapped in your steps!</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: '580px', overflowY: 'auto', paddingRight: '0.25rem' }}>
                {filteredSuggestions.map((sug) => {
                  const act = ACTION_META[sug.action] || ACTION_META.EVOLVE;
                  return (
                    <div
                      key={sug.key}
                      style={{
                        padding: '0.75rem 0.85rem',
                        borderRadius: '0.55rem',
                        border: '1px solid var(--border)',
                        background: 'var(--muted)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '0.75rem',
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                          <span
                            style={{
                              fontSize: '0.65rem',
                              fontWeight: 700,
                              padding: '0.1rem 0.42rem',
                              borderRadius: '999px',
                              background: act.bg,
                              color: act.color,
                              border: `1px solid ${act.border}`,
                            }}
                          >
                            {act.label}
                          </span>
                          <span style={{ fontSize: '0.68rem', color: 'var(--muted-foreground)', fontWeight: 600 }}>
                            {sug.entityType}
                          </span>
                        </div>
                        <div style={{ fontWeight: 600, fontSize: '0.84rem', color: 'var(--foreground)' }}>
                          {sug.title}
                        </div>
                        {sug.notes && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
                            {sug.notes}
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleAddSuggestion(sug)}
                        disabled={savingSteps}
                        style={{
                          flexShrink: 0,
                          fontSize: '0.76rem',
                          padding: '0.35rem 0.65rem',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          color: 'var(--brand-focus)',
                          borderColor: 'var(--brand-focus)',
                        }}
                      >
                        <Plus size={13} /> Add
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: IMPACT & TIME DELTA */}
      {activeTab === 'impact' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Delta KPI Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))', gap: '0.85rem' }}>
            <div className="card" style={{ padding: '0.9rem 1.1rem' }}>
              <div style={{ fontSize: '0.74rem', color: 'var(--muted-foreground)', fontWeight: 600, textTransform: 'uppercase' }}>
                Scoped Applications
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, marginTop: '0.25rem' }}>
                {metrics.predecessorAppCount} → {metrics.successorAppCount}
              </div>
              <div style={{ fontSize: '0.76rem', color: metrics.appCountDelta <= 0 ? '#10b981' : '#f59e0b', marginTop: '0.15rem' }}>
                {metrics.appCountDelta > 0 ? `+${metrics.appCountDelta}` : metrics.appCountDelta} net app delta
              </div>
            </div>

            <div className="card" style={{ padding: '0.9rem 1.1rem' }}>
              <div style={{ fontSize: '0.74rem', color: 'var(--muted-foreground)', fontWeight: 600, textTransform: 'uppercase' }}>
                Avg Technical Fit
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, marginTop: '0.25rem' }}>
                {metrics.avgTechFitBefore} → {metrics.avgTechFitAfter}
              </div>
              <div style={{ fontSize: '0.76rem', color: metrics.techFitDelta >= 0 ? '#10b981' : '#ef4444', marginTop: '0.15rem' }}>
                {metrics.techFitDelta >= 0 ? `+${metrics.techFitDelta}` : metrics.techFitDelta} score shift
              </div>
            </div>

            <div className="card" style={{ padding: '0.9rem 1.1rem' }}>
              <div style={{ fontSize: '0.74rem', color: 'var(--muted-foreground)', fontWeight: 600, textTransform: 'uppercase' }}>
                Avg Functional Fit
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, marginTop: '0.25rem' }}>
                {metrics.avgFuncFitBefore} → {metrics.avgFuncFitAfter}
              </div>
              <div style={{ fontSize: '0.76rem', color: metrics.funcFitDelta >= 0 ? '#10b981' : '#ef4444', marginTop: '0.15rem' }}>
                {metrics.funcFitDelta >= 0 ? `+${metrics.funcFitDelta}` : metrics.funcFitDelta} score shift
              </div>
            </div>

            <div className="card" style={{ padding: '0.9rem 1.1rem' }}>
              <div style={{ fontSize: '0.74rem', color: 'var(--muted-foreground)', fontWeight: 600, textTransform: 'uppercase' }}>
                Relative Cost Sum
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, marginTop: '0.25rem' }}>
                {metrics.totalCostBefore} → {metrics.totalCostAfter}
              </div>
              <div style={{ fontSize: '0.76rem', color: metrics.costDelta <= 0 ? '#10b981' : '#f59e0b', marginTop: '0.15rem' }}>
                {metrics.costDelta > 0 ? `+${metrics.costDelta}` : metrics.costDelta} cost index delta
              </div>
            </div>

            <div className="card" style={{ padding: '0.9rem 1.1rem' }}>
              <div style={{ fontSize: '0.74rem', color: 'var(--muted-foreground)', fontWeight: 600, textTransform: 'uppercase' }}>
                Integration Risk
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, marginTop: '0.25rem', color: metrics.atRiskIntegrationCount > 0 ? '#ef4444' : '#10b981' }}>
                {metrics.atRiskIntegrationCount} At-Risk
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--muted-foreground)', marginTop: '0.15rem' }}>
                of {detail.impact.integrations.length} connected flows
              </div>
            </div>
          </div>

          {/* Side-by-side TIME Matrices */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.25rem' }}>
            <div className="card" style={{ padding: '1.15rem' }}>
              <div style={{ marginBottom: '0.75rem' }}>
                <h3 style={{ margin: 0, fontSize: '0.98rem' }}>
                  Predecessor Portfolio TIME ({detail.fromState.name})
                </h3>
                <span style={{ fontSize: '0.76rem', color: 'var(--muted-foreground)' }}>
                  {detail.impact.predecessorApps.length} scoped predecessor applications
                </span>
              </div>
              <div style={{ maxWidth: '420px', margin: '0 auto' }}>
                <TimeMatrix
                  apps={detail.impact.predecessorApps.map((a) => ({
                    id: a.id,
                    name: a.name,
                    technicalFit: a.technicalFit || '3',
                    functionalFit: a.functionalFit || '3',
                    criticality: a.criticality || '3',
                    cost: a.cost || '1',
                  }))}
                  thresholds={timeThresholds}
                  onSelectApp={(appId) => {
                    const found = detail.impact.predecessorApps.find((a) => a.id === appId);
                    if (found) {
                      setSelectedEntityPopup({
                        entity: found,
                        stateId: detail.fromStateId,
                        stateName: detail.fromState.name,
                      });
                    }
                  }}
                />
              </div>
            </div>

            <div className="card" style={{ padding: '1.15rem' }}>
              <div style={{ marginBottom: '0.75rem' }}>
                <h3 style={{ margin: 0, fontSize: '0.98rem' }}>
                  Successor Portfolio TIME ({detail.toState.name})
                </h3>
                <span style={{ fontSize: '0.76rem', color: 'var(--muted-foreground)' }}>
                  {detail.impact.successorApps.length} scoped successor applications
                </span>
              </div>
              <div style={{ maxWidth: '420px', margin: '0 auto' }}>
                <TimeMatrix
                  apps={detail.impact.successorApps.map((a) => ({
                    id: a.id,
                    name: a.name,
                    technicalFit: a.technicalFit || '3',
                    functionalFit: a.functionalFit || '3',
                    criticality: a.criticality || '3',
                    cost: a.cost || '1',
                  }))}
                  thresholds={timeThresholds}
                  onSelectApp={(appId) => {
                    const found = detail.impact.successorApps.find((a) => a.id === appId);
                    if (found) {
                      setSelectedEntityPopup({
                        entity: found,
                        stateId: detail.toStateId,
                        stateName: detail.toState.name,
                      });
                    }
                  }}
                />
              </div>
            </div>
          </div>

          {/* Integration Impact Table */}
          <div className="card" style={{ padding: '1.15rem' }}>
            <h3 style={{ margin: '0 0 0.25rem', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <Network size={16} style={{ color: 'var(--brand-focus)' }} />
              Integration Impact & Dependency Analysis ({detail.impact.integrations.length})
            </h3>
            <p style={{ margin: '0 0 0.9rem', fontSize: '0.8rem', color: 'var(--muted-foreground)' }}>
              Inbound, outbound, and internal integrations connected to the transformation's applications.
            </p>

            {detail.impact.integrations.length === 0 ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '0.84rem' }}>
                No integrations connected to the currently scoped applications.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={{ width: '100%', fontSize: '0.82rem' }}>
                  <thead>
                    <tr>
                      <th>Integration</th>
                      <th>Source → Target</th>
                      <th>Payload / Pattern</th>
                      <th>Transition Status</th>
                      <th>Assessment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.impact.integrations.map((intg) => {
                      const badgeMap = {
                        at_risk: { label: 'At Risk', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.14)' },
                        migrated: { label: 'Migrated', color: '#10b981', bg: 'rgba(16, 185, 129, 0.14)' },
                        explicitly_mapped: { label: 'In Step', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.14)' },
                        new_in_target: { label: 'New in Target', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.14)' },
                      }[intg.status];
                      return (
                        <tr key={`${intg.status}-${intg.id}`}>
                          <td style={{ fontWeight: 600 }}>{intg.name}</td>
                          <td>
                            {intg.sourceApp.name} <ArrowRight size={12} style={{ verticalAlign: 'middle' }} />{' '}
                            {intg.targetApp.name}
                          </td>
                          <td style={{ color: 'var(--muted-foreground)' }}>
                            {[intg.payloadName, intg.pattern].filter(Boolean).join(' · ') || '—'}
                          </td>
                          <td>
                            <span
                              style={{
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                padding: '0.18rem 0.5rem',
                                borderRadius: '999px',
                                color: badgeMap.color,
                                background: badgeMap.bg,
                              }}
                            >
                              {badgeMap.label}
                            </span>
                          </td>
                          <td style={{ color: 'var(--muted-foreground)' }}>{intg.reason}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Affected Business Capabilities Table */}
          <div className="card" style={{ padding: '1.15rem' }}>
            <h3 style={{ margin: '0 0 0.25rem', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <Boxes size={16} style={{ color: 'var(--brand-focus)' }} />
              Affected Business Capabilities ({detail.impact.capabilities.length})
            </h3>
            <p style={{ margin: '0 0 0.9rem', fontSize: '0.8rem', color: 'var(--muted-foreground)' }}>
              How business capability realization shifts from predecessor applications to successor applications.
            </p>

            {detail.impact.capabilities.length === 0 ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '0.84rem' }}>
                No business capabilities linked to the currently scoped applications.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={{ width: '100%', fontSize: '0.82rem' }}>
                  <thead>
                    <tr>
                      <th>Business Capability</th>
                      <th>Predecessor Apps ({detail.fromState.name})</th>
                      <th>Successor Apps ({detail.toState.name})</th>
                      <th>Coverage Impact</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.impact.capabilities.map((cap) => {
                      const statusMeta = {
                        consolidated: { label: 'Consolidated', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.14)' },
                        maintained: { label: 'Maintained', color: '#10b981', bg: 'rgba(16, 185, 129, 0.14)' },
                        expanded: { label: 'Expanded', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.14)' },
                        new_coverage: { label: 'New Coverage', color: '#10b981', bg: 'rgba(16, 185, 129, 0.14)' },
                        gap_risk: { label: 'Coverage Gap Risk', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.14)' },
                      }[cap.status];

                      return (
                        <tr key={cap.name}>
                          <td style={{ fontWeight: 600 }}>{cap.name}</td>
                          <td>{cap.beforeApps.map((a) => a.name).join(', ') || '—'}</td>
                          <td>{cap.afterApps.map((a) => a.name).join(', ') || '—'}</td>
                          <td>
                            <span
                              style={{
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                padding: '0.18rem 0.5rem',
                                borderRadius: '999px',
                                color: statusMeta.color,
                                background: statusMeta.bg,
                              }}
                            >
                              {statusMeta.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Concept Inspector Popup (matches ApplicationDiagram popup with TimeMatrix + Details ↗) */}
      {selectedEntityPopup && (
        <div
          className="state-dialog-backdrop"
          onMouseDown={() => setSelectedEntityPopup(null)}
          style={{ zIndex: 1100 }}
        >
          <div
            className="card"
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              width: selectedEntityPopup.entity.entityType === 'Application' ? 'min(52rem, 96vw)' : 'min(34rem, 94vw)',
              maxHeight: '88vh',
              overflowY: 'auto',
              padding: '1.35rem 1.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
              boxShadow: '0 22px 48px rgba(0, 0, 0, 0.45)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.25rem' }}>
                  <span className="target-state-pill">
                    <GitBranch size={11} />
                    {selectedEntityPopup.stateName}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', fontWeight: 600 }}>
                    {selectedEntityPopup.entity.entityType}
                  </span>
                </div>
                <h2 style={{ margin: 0, fontSize: '1.25rem' }}>{selectedEntityPopup.entity.name}</h2>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="primary"
                  onClick={() => navigateToConceptInState(selectedEntityPopup.entity, selectedEntityPopup.stateId)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', padding: '0.38rem 0.75rem' }}
                >
                  <span>Details</span>
                  <ExternalLink size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedEntityPopup(null)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--muted-foreground)', cursor: 'pointer', padding: '0.25rem' }}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {selectedEntityPopup.entity.entityType === 'Application' ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                  gap: '1.25rem',
                  alignItems: 'start',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {selectedEntityPopup.entity.description && (
                    <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--muted-foreground)', lineHeight: 1.5 }}>
                      {selectedEntityPopup.entity.description}
                    </p>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', fontSize: '0.82rem' }}>
                    <div style={{ padding: '0.55rem 0.7rem', borderRadius: '0.45rem', background: 'var(--muted)' }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--muted-foreground)' }}>Owning Organization</div>
                      <div style={{ fontWeight: 600, marginTop: '0.15rem' }}>
                        {selectedEntityPopup.entity.ownerOrg?.name || 'Unassigned'}
                      </div>
                    </div>
                    <div style={{ padding: '0.55rem 0.7rem', borderRadius: '0.45rem', background: 'var(--muted)' }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--muted-foreground)' }}>Lifecycle</div>
                      <div style={{ fontWeight: 600, marginTop: '0.15rem' }}>
                        {selectedEntityPopup.entity.lifecycle || '—'}
                      </div>
                    </div>
                  </div>

                  {(() => {
                    const assessment = getAppTimeAssessment(selectedEntityPopup.entity, timeThresholds);
                    if (!assessment) return null;
                    return (
                      <div
                        style={{
                          padding: '0.65rem 0.8rem',
                          borderRadius: '0.5rem',
                          background: 'var(--muted)',
                          borderLeft: `3px solid ${assessment.color}`,
                          fontSize: '0.8rem',
                        }}
                      >
                        <div style={{ fontWeight: 700, color: assessment.color }}>
                          TIME Quadrant: {assessment.label}
                        </div>
                        <div style={{ color: 'var(--muted-foreground)', marginTop: '0.2rem' }}>
                          Tech Fit: <strong>{selectedEntityPopup.entity.technicalFit || '3'}</strong> · Func Fit:{' '}
                          <strong>{selectedEntityPopup.entity.functionalFit || '3'}</strong> · Criticality:{' '}
                          <strong>{selectedEntityPopup.entity.criticality || '3'}</strong> · Cost:{' '}
                          <strong>{selectedEntityPopup.entity.cost || '1'}</strong>
                        </div>
                      </div>
                    );
                  })()}

                  {selectedEntityPopup.entity.capabilities && selectedEntityPopup.entity.capabilities.length > 0 && (
                    <div>
                      <div style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--muted-foreground)', marginBottom: '0.35rem' }}>
                        Supported Business Capabilities ({selectedEntityPopup.entity.capabilities.length})
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                        {selectedEntityPopup.entity.capabilities.map((c) => (
                          <span
                            key={c.id}
                            style={{
                              fontSize: '0.74rem',
                              padding: '0.18rem 0.5rem',
                              borderRadius: '0.35rem',
                              background: 'var(--muted)',
                              border: '1px solid var(--border)',
                            }}
                          >
                            {c.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <TimeMatrix
                    singleApp={{
                      id: selectedEntityPopup.entity.id,
                      name: selectedEntityPopup.entity.name,
                      technicalFit: selectedEntityPopup.entity.technicalFit || '3',
                      functionalFit: selectedEntityPopup.entity.functionalFit || '3',
                      criticality: selectedEntityPopup.entity.criticality || '3',
                      cost: selectedEntityPopup.entity.cost || '1',
                    }}
                    thresholds={timeThresholds}
                  />
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.86rem' }}>
                {selectedEntityPopup.entity.subtitle && (
                  <div>
                    <strong style={{ color: 'var(--muted-foreground)' }}>Context: </strong>
                    {selectedEntityPopup.entity.subtitle}
                  </div>
                )}
                {selectedEntityPopup.entity.description && (
                  <p style={{ margin: 0, color: 'var(--muted-foreground)' }}>
                    {selectedEntityPopup.entity.description}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add / Edit Step Modal */}
      {stepModalOpen && (
        <div className="state-dialog-backdrop" onMouseDown={() => setStepModalOpen(false)}>
          <form
            className="state-dialog state-merge-dialog"
            style={{ width: 'min(52rem, calc(100vw - 2rem))', maxHeight: '90vh', overflowY: 'auto' }}
            onMouseDown={(e) => e.stopPropagation()}
            onSubmit={handleSaveStepModal}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0 }}>{editingStepId ? 'Edit Transition Step' : 'Add Transition Step'}</h2>
              <button
                type="button"
                onClick={() => setStepModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--muted-foreground)', cursor: 'pointer', padding: '0.25rem' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.85rem' }}>
              <div>
                <label className="label">Concept Type</label>
                <select
                  value={stepEntityType}
                  onChange={(e) => {
                    setStepEntityType(e.target.value as TransformationEntityType);
                    setStepPredIds([]);
                    setStepSuccIds([]);
                  }}
                >
                  <option value="Application">Application</option>
                  <option value="Organization">Organization</option>
                  <option value="Integration">Integration</option>
                  <option value="Capability">Capability</option>
                </select>
              </div>

              <div>
                <label className="label">Transition Action</label>
                <select
                  value={stepAction}
                  onChange={(e) => setStepAction(e.target.value as TransformationAction)}
                >
                  {(Object.keys(ACTION_META) as TransformationAction[]).map((actKey) => (
                    <option key={actKey} value={actKey}>
                      {ACTION_META[actKey].label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <label className="label" style={{ marginTop: '0.75rem' }}>
              Step Title
            </label>
            <input
              value={stepTitle}
              onChange={(e) => setStepTitle(e.target.value)}
              placeholder="e.g. Consolidate legacy billing systems into target ERP"
            />

            <label className="label" style={{ marginTop: '0.75rem' }}>
              Notes / Migration Rationale
            </label>
            <input
              value={stepNotes}
              onChange={(e) => setStepNotes(e.target.value)}
              placeholder="Optional notes, cutover wave, or dependencies..."
            />

            {/* Predecessor <-> Successor Dual Picker */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
              {/* Predecessors Picker */}
              {(() => {
                const fromCatalog = catalogForEntityType('fromState', stepEntityType);
                const fromById = new Map(fromCatalog.map((item) => [item.id, item]));
                const predSelectedSet = new Set(stepPredIds);
                const sortedFrom = [...fromCatalog]
                  .filter(
                    (item) =>
                      !predSearch.trim() ||
                      `${item.name} ${item.subtitle || ''}`.toLowerCase().includes(predSearch.toLowerCase()),
                  )
                  .sort((a, b) => {
                    const aSel = predSelectedSet.has(a.id) ? 0 : 1;
                    const bSel = predSelectedSet.has(b.id) ? 0 : 1;
                    return aSel !== bSel ? aSel - bSel : a.name.localeCompare(b.name);
                  });

                return (
                  <div style={{ border: '1px solid var(--border)', borderRadius: '0.55rem', padding: '0.75rem', background: 'var(--muted)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.82rem' }}>
                        Predecessors in {detail.fromState.name} ({stepPredIds.length})
                      </span>
                      {stepPredIds.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setStepPredIds([])}
                          style={{ height: 'auto', padding: '0.1rem 0.4rem', fontSize: '0.7rem', background: 'transparent', border: 'none', color: 'var(--muted-foreground)' }}
                        >
                          Clear all
                        </button>
                      )}
                    </div>

                    {stepPredIds.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginBottom: '0.5rem', maxHeight: '84px', overflowY: 'auto' }}>
                        {stepPredIds.map((pid) => {
                          const item = fromById.get(pid);
                          return (
                            <span
                              key={pid}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.28rem',
                                fontSize: '0.72rem',
                                padding: '0.15rem 0.45rem',
                                borderRadius: '999px',
                                background: 'var(--card)',
                                border: '1px solid var(--border)',
                                color: 'var(--foreground)',
                              }}
                            >
                              {item?.name || pid}
                              <button
                                type="button"
                                onClick={() => setStepPredIds((prev) => prev.filter((x) => x !== pid))}
                                title="Remove predecessor"
                                style={{ height: 'auto', padding: 0, background: 'transparent', border: 'none', color: 'var(--muted-foreground)', display: 'inline-flex' }}
                              >
                                <X size={11} />
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}

                    <input
                      type="text"
                      placeholder={`Search ${stepEntityType.toLowerCase()}s...`}
                      value={predSearch}
                      onChange={(e) => setPredSearch(e.target.value)}
                      style={{ width: '100%', fontSize: '0.78rem', padding: '0.35rem 0.55rem', marginBottom: '0.5rem' }}
                    />
                    <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      {sortedFrom.map((item) => {
                        const checked = predSelectedSet.has(item.id);
                        return (
                          <label
                            key={item.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.45rem',
                              fontSize: '0.78rem',
                              padding: '0.25rem 0.4rem',
                              borderRadius: '0.35rem',
                              background: checked ? 'color-mix(in srgb, var(--brand-focus) 14%, var(--card))' : 'transparent',
                              cursor: 'pointer',
                            }}
                          >
                            <input
                              type="checkbox"
                              className="table-select-check"
                              checked={checked}
                              onChange={() =>
                                setStepPredIds((prev) =>
                                  checked ? prev.filter((x) => x !== item.id) : [...prev, item.id],
                                )
                              }
                            />
                            <span style={{ fontWeight: checked ? 600 : 400 }}>
                              {item.name}
                              {item.subtitle ? (
                                <span style={{ color: 'var(--muted-foreground)', fontSize: '0.72rem' }}>
                                  {' '}
                                  ({item.subtitle})
                                </span>
                              ) : null}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Successors Picker */}
              {(() => {
                const toCatalog = catalogForEntityType('toState', stepEntityType);
                const toById = new Map(toCatalog.map((item) => [item.id, item]));
                const succSelectedSet = new Set(stepSuccIds);
                const sortedTo = [...toCatalog]
                  .filter(
                    (item) =>
                      !succSearch.trim() ||
                      `${item.name} ${item.subtitle || ''}`.toLowerCase().includes(succSearch.toLowerCase()),
                  )
                  .sort((a, b) => {
                    const aSel = succSelectedSet.has(a.id) ? 0 : 1;
                    const bSel = succSelectedSet.has(b.id) ? 0 : 1;
                    return aSel !== bSel ? aSel - bSel : a.name.localeCompare(b.name);
                  });

                return (
                  <div style={{ border: '1px solid var(--border)', borderRadius: '0.55rem', padding: '0.75rem', background: 'var(--muted)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.82rem' }}>
                        Successors in {detail.toState.name} ({stepSuccIds.length})
                      </span>
                      {stepSuccIds.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setStepSuccIds([])}
                          style={{ height: 'auto', padding: '0.1rem 0.4rem', fontSize: '0.7rem', background: 'transparent', border: 'none', color: 'var(--muted-foreground)' }}
                        >
                          Clear all
                        </button>
                      )}
                    </div>

                    {stepSuccIds.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginBottom: '0.5rem', maxHeight: '84px', overflowY: 'auto' }}>
                        {stepSuccIds.map((sid) => {
                          const item = toById.get(sid);
                          return (
                            <span
                              key={sid}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.28rem',
                                fontSize: '0.72rem',
                                padding: '0.15rem 0.45rem',
                                borderRadius: '999px',
                                background: 'rgba(245, 158, 11, 0.14)',
                                border: '1px solid rgba(245, 158, 11, 0.4)',
                                color: 'var(--foreground)',
                              }}
                            >
                              {item?.name || sid}
                              <button
                                type="button"
                                onClick={() => setStepSuccIds((prev) => prev.filter((x) => x !== sid))}
                                title="Remove successor"
                                style={{ height: 'auto', padding: 0, background: 'transparent', border: 'none', color: 'var(--muted-foreground)', display: 'inline-flex' }}
                              >
                                <X size={11} />
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}

                    <input
                      type="text"
                      placeholder={`Search ${stepEntityType.toLowerCase()}s...`}
                      value={succSearch}
                      onChange={(e) => setSuccSearch(e.target.value)}
                      style={{ width: '100%', fontSize: '0.78rem', padding: '0.35rem 0.55rem', marginBottom: '0.5rem' }}
                    />
                    <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      {sortedTo.map((item) => {
                        const checked = succSelectedSet.has(item.id);
                        return (
                          <label
                            key={item.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.45rem',
                              fontSize: '0.78rem',
                              padding: '0.25rem 0.4rem',
                              borderRadius: '0.35rem',
                              background: checked ? 'rgba(245, 158, 11, 0.16)' : 'transparent',
                              cursor: 'pointer',
                            }}
                          >
                            <input
                              type="checkbox"
                              className="table-select-check"
                              checked={checked}
                              onChange={() =>
                                setStepSuccIds((prev) =>
                                  checked ? prev.filter((x) => x !== item.id) : [...prev, item.id],
                                )
                              }
                            />
                            <span style={{ fontWeight: checked ? 600 : 400 }}>
                              {item.name}
                              {item.subtitle ? (
                                <span style={{ color: 'var(--muted-foreground)', fontSize: '0.72rem' }}>
                                  {' '}
                                  ({item.subtitle})
                                </span>
                              ) : null}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="state-dialog-actions" style={{ marginTop: '1.1rem', justifyContent: editingStepId ? 'space-between' : 'flex-end' }}>
              {editingStepId && (
                <button
                  type="button"
                  disabled={savingSteps}
                  onClick={async () => {
                    await handleDeleteStep(editingStepId);
                    setStepModalOpen(false);
                  }}
                  style={{
                    color: 'var(--destructive)',
                    borderColor: 'color-mix(in srgb, var(--destructive) 40%, var(--border))',
                    gap: '0.35rem',
                  }}
                >
                  <Trash2 size={14} />
                  Delete Step
                </button>
              )}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" className="secondary" onClick={() => setStepModalOpen(false)}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary"
                  disabled={savingSteps || (stepPredIds.length === 0 && stepSuccIds.length === 0)}
                >
                  {savingSteps ? 'Saving…' : editingStepId ? 'Save Changes' : 'Add Step'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Edit Metadata Modal */}
      {editMetaOpen && (
        <div className="state-dialog-backdrop" onMouseDown={() => setEditMetaOpen(false)}>
          <form
            className="state-dialog"
            style={{ width: 'min(34rem, calc(100vw - 2rem))' }}
            onMouseDown={(e) => e.stopPropagation()}
            onSubmit={handleSaveMeta}
          >
            <h2>Edit Transformation Details</h2>

            <label className="label">Name</label>
            <input
              value={metaName}
              onChange={(e) => setMetaName(e.target.value)}
            />

            <label className="label" style={{ marginTop: '0.75rem' }}>
              Description / Business Case
            </label>
            <textarea
              rows={3}
              value={metaDesc}
              onChange={(e) => setMetaDesc(e.target.value)}
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.75rem' }}>
              <div>
                <label className="label">Status</label>
                <select
                  value={metaStatus}
                  onChange={(e) => setMetaStatus(e.target.value as TransformationStatus)}
                >
                  <option value="Planned">Planned</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Completed">Completed</option>
                  <option value="On Hold">On Hold</option>
                </select>
              </div>
              <div>
                <label className="label">Owner</label>
                <input
                  value={metaOwner}
                  onChange={(e) => setMetaOwner(e.target.value)}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.75rem' }}>
              <div>
                <label className="label">Start Date</label>
                <input
                  type="date"
                  value={metaStartDate}
                  onChange={(e) => setMetaStartDate(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Target Completion Date</label>
                <input
                  type="date"
                  value={metaTargetDate}
                  onChange={(e) => setMetaTargetDate(e.target.value)}
                />
              </div>
            </div>

            <div className="state-dialog-actions" style={{ marginTop: '1.1rem' }}>
              <button type="button" className="secondary" onClick={() => setEditMetaOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="primary">
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Apply Transformation Dialog */}
      {applyOpen && (
        <div className="state-dialog-backdrop" onMouseDown={() => !applying && setApplyOpen(false)}>
          <form
            className="state-dialog state-merge-dialog"
            onMouseDown={(e) => e.stopPropagation()}
            onSubmit={handleApplyTransformation}
          >
            <div className="state-merge-header">
              <span className="target-state-pill">
                <GitMerge size={12} />
                Execute Transformation
              </span>
              <h2>Apply "{detail.name}" to {detail.fromState.name}</h2>
              <p>
                This promotes the <strong>{detail.steps.length} scoped transition steps</strong> from{' '}
                <strong>{detail.toState.name}</strong> into <strong>{detail.fromState.name}</strong> (creating/updating
                successor artifacts, re-pointing integrations, and retiring replaced predecessors).
              </p>
            </div>

            <div className="state-merge-options">
              <label className="state-merge-option-check">
                <input
                  type="checkbox"
                  className="table-select-check"
                  checked={backupFromState}
                  onChange={(e) => setBackupFromState(e.target.checked)}
                  disabled={applying}
                />
                <span>Create a backup snapshot of {detail.fromState.name} first</span>
              </label>

              {backupFromState && (
                <input
                  value={backupName}
                  onChange={(e) => setBackupName(e.target.value)}
                  disabled={applying}
                  placeholder="Backup snapshot name"
                />
              )}

              <div style={{ paddingTop: '0.35rem' }}>
                <label className="label">How should retired/replaced predecessor applications be handled?</label>
                <select
                  value={retireMode}
                  onChange={(e) => setRetireMode(e.target.value as 'delete' | 'decommission')}
                  disabled={applying}
                >
                  <option value="delete">Remove predecessor record from {detail.fromState.name}</option>
                  <option value="decommission">Keep predecessor record and set Lifecycle to "Decommissioned"</option>
                </select>
              </div>

              <label className="state-merge-option-check" style={{ marginTop: '0.35rem' }}>
                <input
                  type="checkbox"
                  className="table-select-check"
                  checked={markCompleted}
                  onChange={(e) => setMarkCompleted(e.target.checked)}
                  disabled={applying}
                />
                <span>Mark transformation status as Completed</span>
              </label>
            </div>

            {applyError && <p className="state-dialog-error">{applyError}</p>}

            <div className="state-dialog-actions">
              <button type="button" className="secondary" onClick={() => setApplyOpen(false)} disabled={applying}>
                Cancel
              </button>
              <button type="submit" className="primary" disabled={applying}>
                <GitMerge size={14} />
                {applying ? 'Applying Transformation…' : `Apply to ${detail.fromState.name}`}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
