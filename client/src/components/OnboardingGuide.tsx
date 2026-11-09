import React, { useState, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Boxes,
  Target,
  Layers,
  FileText,
  Database,
  Network,
  Sparkles,
  Upload,
  Download,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Shield,
  ArrowRight,
  Loader2,
  Eye,
  Trash2,
  Plus,
  AlertCircle,
  Check,
  Wand2,
  FileSpreadsheet,
} from 'lucide-react';
import { useAccess } from '../access';
import { BrandLogo } from './BrandLogo';
import { ImportExport } from './ImportExport';
import { toCsv, CSV_HEADERS, type ArtifactType } from '../portableRecords';
import { normalizeWorkspaceSettings, type WorkspaceSettings } from '../workspaceSettings';

export type ExampleConceptKey =
  | 'capabilities'
  | 'strategic-goals'
  | 'organizations'
  | 'information-objects'
  | 'applications'
  | 'integrations';

export interface ExampleConceptStatus {
  concept: ExampleConceptKey;
  title: string;
  description: string;
  totalCount: number;
  installedCount: number;
  active: boolean;
  requires: ExampleConceptKey[];
  sampleRecords: { id: string; name: string; detail: string }[];
}

export type FlatCsvTargetEntity =
  | 'Application'
  | 'Capability'
  | 'StrategicGoal'
  | 'Organization'
  | 'InformationObject'
  | 'Integration'
  | 'Ignore';

export interface FlatCsvColumnMapping {
  column: string;
  targetEntity: FlatCsvTargetEntity;
  targetField: string;
  separator: string;
  confidence: 'high' | 'medium' | 'low';
  assumption: string;
}

export interface FlatCsvMappingResponse {
  usedAi: boolean;
  providerName: string | null;
  summaryNote: string;
  mappings: FlatCsvColumnMapping[];
  fieldCatalog: Record<FlatCsvTargetEntity, { field: string; label: string; description: string; multi?: boolean }[]>;
}

export interface FlatCsvImportSummary {
  totalRows: number;
  created: Record<string, number>;
  updated: Record<string, number>;
  linkedRelations: number;
  warnings: string[];
}

export const EXAMPLE_CSV_ROWS: Record<ArtifactType, Record<string, string>[]> = {
  capabilities: [
    {
      id: 'example-cap-customer',
      name: 'Customer Management',
      description: 'Acquire, onboard, and support customers across digital and assisted channels.',
      criticality: '5',
      parentId: '',
      metadata: '',
      references: '',
      applicationIds: '',
    },
    {
      id: 'example-cap-onboarding',
      name: 'Customer Onboarding & KYC',
      description: 'Verify identity, capture consent, and provision customer accounts.',
      criticality: '5',
      parentId: 'example-cap-customer',
      metadata: '',
      references: '',
      applicationIds: 'example-app-crm;example-app-iam',
    },
    {
      id: 'example-cap-finance',
      name: 'Financial Management',
      description: 'General ledger, accounts payable/receivable, treasury, and statutory reporting.',
      criticality: '5',
      parentId: '',
      metadata: '',
      references: '',
      applicationIds: 'example-app-erp',
    },
  ],
  'strategic-goals': [
    {
      id: 'example-goal-digital',
      name: 'Digital Customer Experience',
      description: 'Deliver frictionless self-service onboarding and omnichannel support.',
      parentId: '',
      references: '',
      capabilityIds: 'example-cap-customer;example-cap-onboarding',
    },
    {
      id: 'example-goal-efficiency',
      name: 'Operational Excellence & Automation',
      description: 'Standardize core ERP and order-to-cash workflows to reduce manual handoffs.',
      parentId: '',
      references: '',
      capabilityIds: 'example-cap-finance',
    },
  ],
  organizations: [
    {
      id: 'example-org-commercial',
      name: 'Commercial & Digital Division',
      description: 'Accountable for customer acquisition, digital channels, and revenue growth.',
      type: 'Division',
      parentId: '',
      references: '',
      supportedCapabilityIds: 'example-cap-customer;example-cap-onboarding',
    },
    {
      id: 'example-org-finance',
      name: 'Corporate Finance & Operations',
      description: 'Manages accounting, billing, procurement, and financial compliance.',
      type: 'Division',
      parentId: '',
      references: '',
      supportedCapabilityIds: 'example-cap-finance',
    },
  ],
  'information-objects': [
    {
      id: 'example-info-customer',
      name: 'Customer Profile',
      aliases: 'Client Master, Account Holder',
      description: 'Master record of customer identity, contact preferences, and KYC status.',
      confidentiality: '3',
      integrity: '4',
      availability: '3',
      piiCategory: '3',
      type: 'Master Data',
      businessOwnerId: 'example-org-commercial',
      appOwnerId: 'example-app-crm',
      metadata: '',
      references: '',
    },
    {
      id: 'example-info-invoice',
      name: 'Customer Invoice & Ledger Entry',
      aliases: 'Billing Document, AR Posting',
      description: 'Financial billing statement, tax calculation, and general ledger posting.',
      confidentiality: '3',
      integrity: '4',
      availability: '3',
      piiCategory: '2',
      type: 'Transactional Data',
      businessOwnerId: 'example-org-finance',
      appOwnerId: 'example-app-erp',
      metadata: '',
      references: '',
    },
  ],
  applications: [
    {
      id: 'example-app-crm',
      name: 'Salesforce CRM',
      description: 'Enterprise customer relationship management and onboarding workspace.',
      owner: 'VP Commercial Operations',
      ownerOrgId: 'example-org-commercial',
      lifecycle: 'Mainstream',
      lifecycleStartDate: '2022-01-15',
      lifecycleEndDate: '2028-12-31',
      contractStartDate: '2024-01-01',
      contractEndDate: '2026-12-31',
      contractDetails: 'Enterprise SaaS subscription',
      vendorName: 'Salesforce',
      vendorUrl: 'https://www.salesforce.com',
      vendorSummary: 'Cloud CRM platform.',
      type: 'Business Application',
      criticality: '5',
      annualCost: '420000',
      cost: '4',
      functionalFit: '5',
      technicalFit: '4',
      timeRationale: 'Strategic Invest platform for customer operations.',
      metadata: '',
      references: '',
      capabilityIds: 'example-cap-customer;example-cap-onboarding',
      processedInformationObjectIds: 'example-info-customer',
    },
    {
      id: 'example-app-erp',
      name: 'SAP S/4HANA Finance',
      description: 'Core enterprise resource planning for general ledger, billing, and procurement.',
      owner: 'Head of Enterprise Finance Systems',
      ownerOrgId: 'example-org-finance',
      lifecycle: 'Mainstream',
      lifecycleStartDate: '2021-06-01',
      lifecycleEndDate: '2030-06-01',
      contractStartDate: '2023-06-01',
      contractEndDate: '2028-05-31',
      contractDetails: 'RISE with SAP managed cloud contract',
      vendorName: 'SAP',
      vendorUrl: 'https://www.sap.com',
      vendorSummary: 'Enterprise ERP software provider.',
      type: 'Business Application',
      criticality: '5',
      annualCost: '850000',
      cost: '5',
      functionalFit: '4',
      technicalFit: '4',
      timeRationale: 'Core financial system of record (Invest).',
      metadata: '',
      references: '',
      capabilityIds: 'example-cap-finance',
      processedInformationObjectIds: 'example-info-invoice',
    },
  ],
  integrations: [
    {
      id: 'example-int-crm-erp',
      name: 'CRM to ERP Customer & Order Sync',
      description: 'Synchronizes verified customer accounts and commercial orders into SAP S/4HANA.',
      sourceAppId: 'example-app-crm',
      targetAppId: 'example-app-erp',
      infoObjectId: 'example-info-customer',
      pattern: 'API',
      type: 'API',
      frequency: 'Real-time',
      crud: 'C,U',
      references: '',
    },
  ],
};

const PREVIEW_KEY_COLUMNS: Record<ArtifactType, string[]> = {
  capabilities: ['id', 'name', 'parentId', 'criticality', 'description'],
  'strategic-goals': ['id', 'name', 'capabilityIds', 'description'],
  organizations: ['id', 'name', 'type', 'supportedCapabilityIds', 'description'],
  'information-objects': ['id', 'name', 'type', 'piiCategory', 'businessOwnerId', 'appOwnerId'],
  applications: ['id', 'name', 'vendorName', 'lifecycle', 'annualCost', 'functionalFit', 'technicalFit', 'ownerOrgId', 'capabilityIds'],
  integrations: ['id', 'name', 'sourceAppId', 'targetAppId', 'infoObjectId', 'pattern', 'frequency'],
};

const SAMPLE_FLAT_MATRIX_CSV = `Application Name,Application Description,Vendor,Lifecycle,Annual Cost,Functional Fit,Technical Fit,Owning Department,Parent Division,Business Capability,Parent Capability,Strategic Goal,Information Object,PII Category,Downstream App,Integration Pattern,Integration Frequency
Salesforce CRM,Customer relationship management and digital onboarding workspace,Salesforce,Mainstream,420000,5,4,Digital Sales & Service,Commercial & Digital Division,Customer Onboarding & KYC;Support Case Management,Customer Management,Digital Customer Experience,Customer Profile,3,SAP S/4HANA Finance;Snowflake Data Cloud,API,Real-time
SAP S/4HANA Finance,Core enterprise general ledger and order-to-cash billing platform,SAP,Mainstream,850000,4,4,Corporate Accounting,Corporate Finance & Operations,General Ledger & Invoicing,Financial Management,Operational Excellence & Automation,Customer Invoice & Ledger Entry,2,Snowflake Data Cloud,Batch,Hourly
Legacy Billing Engine,On-premise batch rating and invoice calculation engine,In-house,Legacy,310000,2,1,Corporate Accounting,Corporate Finance & Operations,General Ledger & Invoicing,Financial Management,Legacy Technical Debt Reduction,Customer Invoice & Ledger Entry,2,SAP S/4HANA Finance,Batch,Daily
Snowflake Data Cloud,Enterprise lakehouse for regulatory reporting and AI analytics,Snowflake,Mainstream,290000,5,5,Data & AI Platform Team,Technology & Security Office,Enterprise Data & Analytics,Data & Platform Engineering,Digital Customer Experience;Operational Excellence & Automation,Customer Profile;Customer Invoice & Ledger Entry,3,,,
Okta Workforce & CIAM,Unified identity provider for workforce SSO and customer authentication,Okta,Mainstream,165000,5,5,Cybersecurity & IAM,Technology & Security Office,Identity & Access Governance,Data & Platform Engineering,Zero-Trust Security & Compliance,Identity & Access Credential,3,Salesforce CRM,Event-driven,Real-time`;

function downloadTextFile(text: string, filename: string, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function parseCsvTextToMatrix(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const rawRows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentCell.trim());
      currentCell = '';
    } else if ((char === '\n' || (char === '\r' && nextChar === '\n')) && !inQuotes) {
      if (char === '\r') i++;
      currentRow.push(currentCell.trim());
      if (currentRow.some((cell) => cell !== '')) {
        rawRows.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += char;
    }
  }
  if (currentCell || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((cell) => cell !== '')) {
      rawRows.push(currentRow);
    }
  }

  if (rawRows.length === 0) return { headers: [], rows: [] };
  const headers = (rawRows[0] || []).map((h) => h.replace(/^"|"$/g, '').trim()).filter(Boolean);
  const rows = rawRows.slice(1).map((cells) => {
    const obj: Record<string, string> = {};
    headers.forEach((header, idx) => {
      let val = cells[idx] ?? '';
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1);
      }
      obj[header] = val;
    });
    return obj;
  });
  return { headers, rows };
}

export const ExampleCsvPreview = ({
  type,
  filename,
  compact = false,
}: {
  type: ArtifactType;
  filename: string;
  compact?: boolean;
}) => {
  const rows = EXAMPLE_CSV_ROWS[type] || [];
  const keyCols = PREVIEW_KEY_COLUMNS[type] || CSV_HEADERS[type].slice(0, 5);
  const allHeaders = CSV_HEADERS[type];

  const handleDownload = () => {
    const csv = toCsv(type, rows);
    downloadTextFile(csv, filename);
  };

  return (
    <div
      style={{
        marginTop: compact ? '0.6rem' : '0.85rem',
        padding: '0.85rem',
        background: 'var(--background)',
        borderRadius: '10px',
        border: '1px solid var(--border)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '0.75rem',
          flexWrap: 'wrap',
          marginBottom: '0.65rem',
        }}
      >
        <div>
          <div style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--primary)' }}>
            Example CSV Structure ({rows.length} sample rows · {allHeaders.length} columns)
          </div>
          <div style={{ fontSize: '0.73rem', color: 'var(--muted-foreground)', marginTop: '0.15rem' }}>
            Columns: <code style={{ fontSize: '0.7rem' }}>{allHeaders.join(', ')}</code>
          </div>
        </div>
        <button
          type="button"
          onClick={handleDownload}
          className="secondary"
          style={{
            height: '1.85rem',
            padding: '0 0.7rem',
            fontSize: '0.76rem',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            flexShrink: 0,
          }}
        >
          <Download size={13} /> Download Example CSV ({filename})
        </button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', background: 'var(--muted)' }}>
              {keyCols.map((col) => (
                <th key={col} style={{ padding: '0.45rem 0.6rem', fontFamily: 'monospace', fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx} style={{ borderBottom: idx === rows.length - 1 ? 'none' : '1px solid var(--border)' }}>
                {keyCols.map((col) => (
                  <td
                    key={col}
                    style={{
                      padding: '0.45rem 0.6rem',
                      color: row[col] ? 'var(--foreground)' : 'var(--muted-foreground)',
                      maxWidth: '260px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={row[col] || ''}
                  >
                    {row[col] || <span style={{ opacity: 0.45 }}>—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const CONCEPT_ICONS: Record<ExampleConceptKey, React.ReactNode> = {
  capabilities: <Boxes size={18} />,
  'strategic-goals': <Target size={18} />,
  organizations: <Layers size={18} />,
  'information-objects': <FileText size={18} />,
  applications: <Database size={18} />,
  integrations: <Network size={18} />,
};

export const ExampleDataManager = ({ onRefresh }: { onRefresh: () => void }) => {
  const queryClient = useQueryClient();
  const [expandedKey, setExpandedKey] = useState<ExampleConceptKey | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const { data, isLoading, isError } = useQuery<{ concepts: ExampleConceptStatus[] }>({
    queryKey: ['example-data-status'],
    queryFn: async () => {
      const res = await fetch('/api/example-data/status');
      if (!res.ok) throw new Error('Could not load example data status');
      return res.json();
    },
  });

  const concepts = data?.concepts ?? [];
  const activeCount = concepts.filter((c) => c.active).length;

  const applyChanges = async (payload: Partial<Record<ExampleConceptKey, boolean>>, label: string) => {
    setPendingAction(label);
    setNotice(null);
    try {
      const res = await fetch('/api/example-data/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ concepts: payload }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || 'Failed to update example data.');
      }
      const body = await res.json();
      queryClient.setQueryData(['example-data-status'], { concepts: body.concepts });
      onRefresh();
      setNotice({ type: 'success', text: `Updated example data (${label}).` });
    } catch (err) {
      setNotice({ type: 'error', text: err instanceof Error ? err.message : 'Could not update example data.' });
    } finally {
      setPendingAction(null);
    }
  };

  const handleToggleConcept = (concept: ExampleConceptStatus) => {
    const nextState = !concept.active;
    void applyChanges(
      { [concept.concept]: nextState },
      `${nextState ? 'Activated' : 'Removed'} ${concept.title}`,
    );
  };

  const handleActivateAll = () => {
    void applyChanges(
      {
        capabilities: true,
        'strategic-goals': true,
        organizations: true,
        'information-objects': true,
        applications: true,
        integrations: true,
      },
      'Activated all 6 meta-model concepts',
    );
  };

  const handleDeactivateAll = () => {
    void applyChanges(
      {
        capabilities: false,
        'strategic-goals': false,
        organizations: false,
        'information-objects': false,
        applications: false,
        integrations: false,
      },
      'Removed all seeded example data',
    );
  };

  return (
    <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--primary)', marginBottom: '0.2rem' }}>
            Meta-Model Reference Dataset
          </div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0 }}>Seed Example Data per Meta-Model Concept</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)', margin: '0.3rem 0 0', maxWidth: '46rem', lineHeight: 1.45 }}>
            Activate or deactivate curated example records for any of the 6 meta-model concepts. Example records use deterministic IDs (<code>example-*</code>) so you can toggle them on to explore diagrams and insights, and cleanly remove them later without affecting your own records.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="secondary"
            disabled={Boolean(pendingAction) || activeCount === 0}
            onClick={handleDeactivateAll}
            style={{ height: '2rem', padding: '0 0.75rem', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
          >
            <Trash2 size={13} /> Remove All Example Data
          </button>
          <button
            type="button"
            className="primary"
            disabled={Boolean(pendingAction) || activeCount === concepts.length}
            onClick={handleActivateAll}
            style={{ height: '2rem', padding: '0 0.85rem', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
          >
            {pendingAction ? <Loader2 size={13} className="spin" /> : <Sparkles size={13} />}
            Activate All 6 Concepts
          </button>
        </div>
      </div>

      {notice && (
        <div
          style={{
            padding: '0.65rem 0.85rem',
            borderRadius: '8px',
            fontSize: '0.8rem',
            fontWeight: 600,
            background: notice.type === 'success' ? 'color-mix(in srgb, #2b8a3e 12%, var(--background))' : 'color-mix(in srgb, #c92a2a 12%, var(--background))',
            color: notice.type === 'success' ? '#2b8a3e' : 'var(--destructive, #c92a2a)',
            border: `1px solid ${notice.type === 'success' ? 'color-mix(in srgb, #2b8a3e 35%, transparent)' : 'color-mix(in srgb, #c92a2a 35%, transparent)'}`,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          {notice.type === 'success' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
          <span>{notice.text}</span>
        </div>
      )}

      {isLoading ? (
        <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '0.85rem' }}>
          Loading example dataset status...
        </div>
      ) : isError ? (
        <div style={{ padding: '1rem', color: 'var(--destructive)', fontSize: '0.85rem' }}>
          Could not load example data status.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: '0.85rem' }}>
          {concepts.map((concept) => {
            const isExpanded = expandedKey === concept.concept;
            return (
              <div
                key={concept.concept}
                style={{
                  background: 'var(--background)',
                  border: concept.active ? '1.5px solid var(--primary)' : '1px solid var(--border)',
                  borderRadius: '12px',
                  padding: '0.95rem 1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                      <div
                        style={{
                          width: '2rem',
                          height: '2rem',
                          borderRadius: '8px',
                          background: concept.active ? 'var(--primary)' : 'var(--secondary)',
                          color: concept.active ? 'var(--primary-foreground)' : 'var(--foreground)',
                          display: 'grid',
                          placeItems: 'center',
                          flexShrink: 0,
                        }}
                      >
                        {CONCEPT_ICONS[concept.concept]}
                      </div>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '0.92rem' }}>{concept.title}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--muted-foreground)' }}>
                          {concept.active
                            ? `${concept.installedCount} of ${concept.totalCount} example records active`
                            : `${concept.totalCount} curated example records`}
                        </div>
                      </div>
                    </div>
                    <span
                      style={{
                        padding: '0.15rem 0.45rem',
                        borderRadius: '999px',
                        fontSize: '0.62rem',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        background: concept.active ? 'color-mix(in srgb, #2b8a3e 16%, transparent)' : 'var(--secondary)',
                        color: concept.active ? '#2b8a3e' : 'var(--muted-foreground)',
                      }}
                    >
                      {concept.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <p style={{ fontSize: '0.76rem', color: 'var(--muted-foreground)', margin: '0.6rem 0 0', lineHeight: 1.4 }}>
                    {concept.description}
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={() => setExpandedKey(isExpanded ? null : concept.concept)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        padding: 0,
                        fontSize: '0.73rem',
                        fontWeight: 700,
                        color: 'var(--primary)',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                      }}
                    >
                      <Eye size={13} />
                      {isExpanded ? 'Hide sample records' : `Preview ${concept.totalCount} records`}
                      {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>

                    <button
                      type="button"
                      disabled={Boolean(pendingAction)}
                      onClick={() => handleToggleConcept(concept)}
                      className={concept.active ? 'secondary' : 'primary'}
                      style={{
                        height: '1.85rem',
                        padding: '0 0.75rem',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                      }}
                    >
                      {concept.active ? 'Deactivate / Remove' : 'Seed Concept'}
                    </button>
                  </div>

                  {isExpanded && (
                    <div
                      style={{
                        marginTop: '0.25rem',
                        padding: '0.6rem',
                        background: 'var(--card)',
                        borderRadius: '8px',
                        border: '1px solid var(--border)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.4rem',
                        maxHeight: '190px',
                        overflowY: 'auto',
                      }}
                    >
                      {concept.sampleRecords.map((rec) => (
                        <div
                          key={rec.id}
                          style={{
                            fontSize: '0.72rem',
                            paddingBottom: '0.35rem',
                            borderBottom: '1px solid var(--border)',
                          }}
                        >
                          <div style={{ fontWeight: 700, color: 'var(--foreground)' }}>{rec.name}</div>
                          <div style={{ color: 'var(--muted-foreground)', fontSize: '0.68rem' }}>{rec.detail}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const AI_PRESETS = [
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-6.1-sol', placeholder: 'gpt-6.1-sol' },
  { id: 'anthropic', label: 'Anthropic', baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-5-5', placeholder: 'claude-sonnet-5-5' },
  { id: 'ollama', label: 'Ollama Cloud', baseUrl: 'https://ollama.com/v1', model: 'gemma4:31b', placeholder: 'gemma4:31b' },
  { id: 'xai', label: 'SpaceXAI', baseUrl: 'https://api.x.ai/v1', model: 'grok-4.7', placeholder: 'grok-4.7' },
] as const;

const ENTITY_LABELS: Record<FlatCsvTargetEntity, string> = {
  Application: 'Application',
  Capability: 'Capability',
  StrategicGoal: 'Strategic Goal',
  Organization: 'Organization',
  InformationObject: 'Information Object',
  Integration: 'Integration',
  Ignore: 'Ignore Column',
};

export const FlatCsvAiImporter = ({ onRefresh }: { onRefresh: () => void }) => {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showProviderSetup, setShowProviderSetup] = useState(false);
  const [providerType, setProviderType] = useState<string>(AI_PRESETS[0].id);
  const [providerName, setProviderName] = useState<string>(AI_PRESETS[0].label);
  const [providerModel, setProviderModel] = useState<string>(AI_PRESETS[0].model);
  const [providerBaseUrl, setProviderBaseUrl] = useState<string>(AI_PRESETS[0].baseUrl);
  const [providerApiKey, setProviderApiKey] = useState<string>('');
  const [savingProvider, setSavingProvider] = useState(false);
  const [providerError, setProviderError] = useState('');

  const [fileName, setFileName] = useState<string>('');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisMeta, setAnalysisMeta] = useState<{
    usedAi: boolean;
    providerName: string | null;
    summaryNote: string;
  } | null>(null);
  const [mappings, setMappings] = useState<FlatCsvColumnMapping[]>([]);
  const [fieldCatalog, setFieldCatalog] = useState<FlatCsvMappingResponse['fieldCatalog'] | null>(null);
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<FlatCsvImportSummary | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const { data: providers = [] } = useQuery<any[]>({
    queryKey: ['llm-providers'],
    queryFn: async () => {
      const res = await fetch('/api/llm/providers');
      if (!res.ok) return [];
      return res.json();
    },
  });

  const activeProvider = useMemo(() => providers.find((p) => p.isActive) || null, [providers]);

  const handlePresetChange = (id: string) => {
    const preset = AI_PRESETS.find((p) => p.id === id) ?? AI_PRESETS[0];
    setProviderType(preset.id);
    setProviderName(preset.label);
    setProviderModel(preset.model);
    setProviderBaseUrl(preset.baseUrl);
  };

  const handleSaveProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProvider(true);
    setProviderError('');
    try {
      const res = await fetch('/api/llm/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: providerName.trim(),
          provider: providerType,
          model: providerModel.trim(),
          baseUrl: providerBaseUrl.trim(),
          apiKey: providerApiKey.trim(),
          isActive: true,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'Could not save AI provider');
      }
      setProviderApiKey('');
      setShowProviderSetup(false);
      await queryClient.invalidateQueries({ queryKey: ['llm-providers'] });
      if (csvHeaders.length > 0 && csvRows.length > 0) {
        void analyzeMatrix(csvHeaders, csvRows);
      }
    } catch (err) {
      setProviderError(err instanceof Error ? err.message : 'Failed to save provider');
    } finally {
      setSavingProvider(false);
    }
  };

  const analyzeMatrix = async (headers: string[], rows: Record<string, string>[]) => {
    setAnalyzing(true);
    setErrorMsg('');
    setImportSummary(null);
    try {
      const res = await fetch('/api/llm/csv-mapping-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          headers,
          sampleRows: rows.slice(0, 8),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || 'Could not analyze CSV columns');
      }
      const data: FlatCsvMappingResponse = await res.json();
      setMappings(data.mappings);
      setFieldCatalog(data.fieldCatalog);
      setAnalysisMeta({
        usedAi: data.usedAi,
        providerName: data.providerName,
        summaryNote: data.summaryNote,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to analyze CSV columns');
    } finally {
      setAnalyzing(false);
    }
  };

  const loadCsvText = (text: string, name: string) => {
    const parsed = parseCsvTextToMatrix(text);
    if (parsed.headers.length === 0 || parsed.rows.length === 0) {
      setErrorMsg('The CSV file must include a header row and at least one data row.');
      return;
    }
    setFileName(name);
    setCsvHeaders(parsed.headers);
    setCsvRows(parsed.rows);
    void analyzeMatrix(parsed.headers, parsed.rows);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = String(ev.target?.result ?? '');
      loadCsvText(text, file.name);
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const handleLoadSampleFlatCsv = () => {
    loadCsvText(SAMPLE_FLAT_MATRIX_CSV, 'sample-enterprise-flat-matrix.csv');
  };

  const handleDownloadSampleFlatCsv = () => {
    downloadTextFile(SAMPLE_FLAT_MATRIX_CSV, 'sample-enterprise-flat-matrix.csv');
  };

  const updateMapping = (idx: number, patch: Partial<FlatCsvColumnMapping>) => {
    setMappings((prev) =>
      prev.map((m, i) => {
        if (i !== idx) return m;
        const next = { ...m, ...patch };
        if (patch.targetEntity && patch.targetEntity !== m.targetEntity) {
          const catalogForEntity = fieldCatalog?.[patch.targetEntity] || [];
          next.targetField = catalogForEntity[0]?.field || (patch.targetEntity === 'Ignore' ? 'ignore' : 'name');
        }
        return next;
      }),
    );
  };

  const handleExecuteImport = async () => {
    if (csvRows.length === 0 || mappings.length === 0) return;
    setImporting(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/csv-flat-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: csvRows,
          mappings,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || 'Failed to import flat CSV matrix');
      }
      const summary: FlatCsvImportSummary = await res.json();
      setImportSummary(summary);
      onRefresh();
      await queryClient.invalidateQueries({ queryKey: ['example-data-status'] });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Flat CSV import failed');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--primary)', marginBottom: '0.2rem' }}>
            AI / LLM-Assisted Flat Matrix Import
          </div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0 }}>Map a Single Flat CSV Across Multiple Meta-Model Concepts</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)', margin: '0.3rem 0 0', maxWidth: '46rem', lineHeight: 1.45 }}>
            Have a single spreadsheet where each row contains an application, its owning organization, capabilities, strategic goals, data objects, and integrations? Upload it here—AI reads the column headers and sample values, explains its assumptions, and maps each column to the right meta-model object and relationship.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <div
            style={{
              padding: '0.3rem 0.65rem',
              borderRadius: '999px',
              fontSize: '0.73rem',
              fontWeight: 700,
              background: activeProvider ? 'color-mix(in srgb, #2b8a3e 15%, transparent)' : 'var(--secondary)',
              color: activeProvider ? '#2b8a3e' : 'var(--muted-foreground)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
          >
            <Sparkles size={13} />
            {activeProvider ? `AI Active: ${activeProvider.name} (${activeProvider.model})` : 'No AI Provider Configured (Using Smart Heuristics)'}
          </div>
          <button
            type="button"
            className="secondary"
            onClick={() => setShowProviderSetup((v) => !v)}
            style={{ height: '1.9rem', padding: '0 0.7rem', fontSize: '0.75rem' }}
          >
            {showProviderSetup ? 'Hide AI Setup' : activeProvider ? 'Change AI Provider' : 'Configure AI Provider'}
          </button>
        </div>
      </div>

      {showProviderSetup && (
        <form
          onSubmit={handleSaveProvider}
          style={{
            padding: '1rem',
            background: 'var(--background)',
            borderRadius: '10px',
            border: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.85rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: '0.85rem' }}>Configure Active AI / LLM Provider</strong>
            <span style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)' }}>
              API key is stored securely in your workspace database.
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
            <div className="field" style={{ margin: 0 }}>
              <label className="label">Provider</label>
              <select
                value={providerType}
                onChange={(e) => handlePresetChange(e.target.value)}
                style={{ height: '2rem', fontSize: '0.8rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--foreground)', padding: '0 0.5rem' }}
              >
                {AI_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label className="label">Display Name</label>
              <input value={providerName} onChange={(e) => setProviderName(e.target.value)} required style={{ height: '2rem', fontSize: '0.8rem' }} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label className="label">Model</label>
              <input value={providerModel} onChange={(e) => setProviderModel(e.target.value)} required style={{ height: '2rem', fontSize: '0.8rem' }} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label className="label">API Key</label>
              <input
                type="password"
                autoComplete="off"
                value={providerApiKey}
                onChange={(e) => setProviderApiKey(e.target.value)}
                placeholder="sk-..."
                required
                style={{ height: '2rem', fontSize: '0.8rem' }}
              />
            </div>
            <div className="field" style={{ margin: 0, gridColumn: '1 / -1' }}>
              <label className="label">Base URL</label>
              <input value={providerBaseUrl} onChange={(e) => setProviderBaseUrl(e.target.value)} required style={{ height: '2rem', fontSize: '0.8rem' }} />
            </div>
          </div>
          {providerError && <div style={{ color: 'var(--destructive)', fontSize: '0.78rem' }}>{providerError}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <button type="button" className="secondary" onClick={() => setShowProviderSetup(false)} style={{ height: '2rem', padding: '0 0.85rem', fontSize: '0.78rem' }}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={savingProvider} style={{ height: '2rem', padding: '0 1rem', fontSize: '0.78rem' }}>
              {savingProvider ? 'Saving...' : 'Save & Activate Provider'}
            </button>
          </div>
        </form>
      )}

      {/* Upload / Load Sample Bar */}
      <div
        style={{
          padding: '1rem',
          background: 'var(--background)',
          borderRadius: '10px',
          border: '1px dashed var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <FileSpreadsheet size={24} style={{ color: 'var(--primary)', flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.86rem' }}>
              {fileName ? `Loaded: ${fileName} (${csvRows.length} rows · ${csvHeaders.length} columns)` : 'Select a flat CSV file or try the sample multi-concept spreadsheet'}
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--muted-foreground)' }}>
              Each row can define an Application along with its Capabilities, Strategic Goals, Organization, Information Objects, and Integrations.
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="secondary"
            onClick={handleDownloadSampleFlatCsv}
            style={{ height: '2rem', padding: '0 0.75rem', fontSize: '0.76rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
          >
            <Download size={13} /> Sample Flat CSV
          </button>
          <button
            type="button"
            className="secondary"
            onClick={handleLoadSampleFlatCsv}
            style={{ height: '2rem', padding: '0 0.8rem', fontSize: '0.76rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
          >
            <Wand2 size={13} /> Load Sample Flat Matrix
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => fileInputRef.current?.click()}
            style={{ height: '2rem', padding: '0 0.9rem', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
          >
            <Upload size={13} /> Upload Flat CSV
          </button>
          <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileUpload} style={{ display: 'none' }} />
        </div>
      </div>

      {errorMsg && (
        <div style={{ padding: '0.65rem 0.85rem', borderRadius: '8px', background: 'color-mix(in srgb, #c92a2a 12%, var(--background))', color: 'var(--destructive, #c92a2a)', fontSize: '0.8rem', fontWeight: 600 }}>
          {errorMsg}
        </div>
      )}

      {analyzing && (
        <div style={{ padding: '1.5rem', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', color: 'var(--muted-foreground)', fontSize: '0.85rem' }}>
          <Loader2 size={16} className="spin" />
          <span>Analyzing column headers, sample values, and inferring meta-model relationships...</span>
        </div>
      )}

      {!analyzing && mappings.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {analysisMeta && (
            <div
              style={{
                padding: '0.75rem 0.95rem',
                borderRadius: '10px',
                background: 'color-mix(in srgb, var(--primary) 10%, var(--background))',
                border: '1px solid color-mix(in srgb, var(--primary) 30%, var(--border))',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '0.75rem',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', fontSize: '0.8rem' }}>
                <Sparkles size={16} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                <div>
                  <strong style={{ marginRight: '0.4rem' }}>
                    {analysisMeta.usedAi ? `AI Analysis (${analysisMeta.providerName}):` : 'Smart Heuristic Assumptions:'}
                  </strong>
                  <span>{analysisMeta.summaryNote}</span>
                </div>
              </div>
              <button
                type="button"
                className="secondary"
                onClick={() => void analyzeMatrix(csvHeaders, csvRows)}
                style={{ height: '1.75rem', padding: '0 0.65rem', fontSize: '0.72rem' }}
              >
                Re-analyze Columns
              </button>
            </div>
          )}

          <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: '10px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
              <thead>
                <tr style={{ background: 'var(--muted)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                  <th style={{ padding: '0.55rem 0.7rem' }}>CSV Column & Sample Values</th>
                  <th style={{ padding: '0.55rem 0.7rem' }}>Target Concept</th>
                  <th style={{ padding: '0.55rem 0.7rem' }}>Target Field</th>
                  <th style={{ padding: '0.55rem 0.7rem', width: '90px' }}>Delimiter</th>
                  <th style={{ padding: '0.55rem 0.7rem' }}>AI Assumption & Confidence</th>
                </tr>
              </thead>
              <tbody>
                {mappings.map((m, idx) => {
                  const samples = csvRows
                    .slice(0, 3)
                    .map((r) => r[m.column])
                    .filter(Boolean);
                  const entityFields = fieldCatalog?.[m.targetEntity] || [];
                  const selectedFieldMeta = entityFields.find((f) => f.field === m.targetField);
                  const confColor =
                    m.confidence === 'high' ? '#2b8a3e' : m.confidence === 'medium' ? '#e67700' : '#868e96';

                  return (
                    <tr key={m.column} style={{ borderBottom: idx === mappings.length - 1 ? 'none' : '1px solid var(--border)', opacity: m.targetEntity === 'Ignore' ? 0.55 : 1 }}>
                      <td style={{ padding: '0.55rem 0.7rem', maxWidth: '240px' }}>
                        <div style={{ fontWeight: 800, fontFamily: 'monospace', fontSize: '0.76rem' }}>{m.column}</div>
                        <div
                          style={{
                            fontSize: '0.68rem',
                            color: 'var(--muted-foreground)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={samples.join(' | ')}
                        >
                          {samples.length > 0 ? `e.g. ${samples.join(', ')}` : 'No sample values'}
                        </div>
                      </td>
                      <td style={{ padding: '0.55rem 0.7rem' }}>
                        <select
                          aria-label={`Target concept for ${m.column}`}
                          value={m.targetEntity}
                          onChange={(e) => updateMapping(idx, { targetEntity: e.target.value as FlatCsvTargetEntity })}
                          style={{
                            height: '1.85rem',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            borderRadius: '6px',
                            border: '1px solid var(--border)',
                            background: 'var(--card)',
                            color: 'var(--foreground)',
                            padding: '0 0.45rem',
                            width: '100%',
                          }}
                        >
                          {(Object.keys(ENTITY_LABELS) as FlatCsvTargetEntity[]).map((entity) => (
                            <option key={entity} value={entity}>
                              {ENTITY_LABELS[entity]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={{ padding: '0.55rem 0.7rem' }}>
                        <select
                          aria-label={`Target field for ${m.column}`}
                          value={m.targetField}
                          disabled={m.targetEntity === 'Ignore'}
                          onChange={(e) => updateMapping(idx, { targetField: e.target.value })}
                          style={{
                            height: '1.85rem',
                            fontSize: '0.75rem',
                            borderRadius: '6px',
                            border: '1px solid var(--border)',
                            background: 'var(--card)',
                            color: 'var(--foreground)',
                            padding: '0 0.45rem',
                            width: '100%',
                          }}
                        >
                          {entityFields.map((f) => (
                            <option key={f.field} value={f.field}>
                              {f.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={{ padding: '0.55rem 0.7rem' }}>
                        {selectedFieldMeta?.multi ? (
                          <input
                            type="text"
                            aria-label={`Delimiter for ${m.column}`}
                            value={m.separator}
                            maxLength={2}
                            placeholder=";"
                            onChange={(e) => updateMapping(idx, { separator: e.target.value })}
                            title="Character separating multiple names in a single cell (e.g. ; or ,)"
                            style={{ height: '1.85rem', width: '3.2rem', textAlign: 'center', fontFamily: 'monospace', fontSize: '0.78rem' }}
                          />
                        ) : (
                          <span style={{ color: 'var(--muted-foreground)', fontSize: '0.7rem' }}>Single</span>
                        )}
                      </td>
                      <td style={{ padding: '0.55rem 0.7rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span
                            style={{
                              padding: '0.1rem 0.38rem',
                              borderRadius: '4px',
                              fontSize: '0.6rem',
                              fontWeight: 800,
                              textTransform: 'uppercase',
                              background: `color-mix(in srgb, ${confColor} 15%, transparent)`,
                              color: confColor,
                              flexShrink: 0,
                            }}
                          >
                            {m.confidence}
                          </span>
                          <span style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)' }}>{m.assumption}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '0.76rem', color: 'var(--muted-foreground)' }}>
              Ready to import <strong>{csvRows.length}</strong> rows and automatically link cross-concept references by name.
            </div>
            <button
              type="button"
              className="primary"
              disabled={importing}
              onClick={handleExecuteImport}
              style={{ height: '2.25rem', padding: '0 1.25rem', fontSize: '0.82rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}
            >
              {importing ? <Loader2 size={15} className="spin" /> : <CheckCircle2 size={15} />}
              {importing ? 'Importing & Linking Objects...' : `Import ${csvRows.length} Flat Matrix Rows`}
            </button>
          </div>
        </div>
      )}

      {importSummary && (
        <div
          style={{
            padding: '1rem',
            borderRadius: '10px',
            background: 'color-mix(in srgb, #2b8a3e 10%, var(--background))',
            border: '1px solid color-mix(in srgb, #2b8a3e 35%, var(--border))',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.65rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#2b8a3e', fontWeight: 800, fontSize: '0.88rem' }}>
            <CheckCircle2 size={18} />
            <span>
              Flat Matrix Import Complete — Processed {importSummary.totalRows} rows and established {importSummary.linkedRelations} cross-model links!
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.5rem' }}>
            {(['Capability', 'StrategicGoal', 'Organization', 'InformationObject', 'Application', 'Integration'] as const).map((ent) => (
              <div key={ent} style={{ padding: '0.5rem 0.65rem', background: 'var(--card)', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '0.74rem' }}>
                <div style={{ fontWeight: 800 }}>{ENTITY_LABELS[ent]}s</div>
                <div style={{ color: 'var(--muted-foreground)', marginTop: '0.15rem' }}>
                  +{importSummary.created[ent] || 0} created · {importSummary.updated[ent] || 0} updated
                </div>
              </div>
            ))}
          </div>
          {importSummary.warnings.length > 0 && (
            <div style={{ fontSize: '0.73rem', color: '#e67700' }}>
              Warnings: {importSummary.warnings.slice(0, 3).join(' · ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const GUIDED_IMPORT_STEPS: {
  title: string;
  reason: string;
  description: string;
  type: ArtifactType;
  file: string;
}[] = [
  {
    title: 'Capabilities',
    reason: 'Step 1 · Initial hierarchy (Optional)',
    description: 'Import your business capability map first. Organizations, applications, and strategic goals link to it.',
    type: 'capabilities',
    file: '01-capabilities.csv',
  },
  {
    title: 'Strategic Goals',
    reason: 'Step 2 · Requires capabilities (Optional)',
    description: 'Import strategic goals after capabilities. Each goal links to the capabilities that deliver it.',
    type: 'strategic-goals',
    file: '02-strategic-goals.csv',
  },
  {
    title: 'Organizations',
    reason: 'Step 3 · Owner references (Optional)',
    description: 'Import accountability structures next, including the capabilities each organization supports.',
    type: 'organizations',
    file: '03-organizations.csv',
  },
  {
    title: 'Information Model',
    reason: 'Step 4 · Payload definitions (Optional)',
    description: 'Import business data objects before applications and integrations reference them.',
    type: 'information-objects',
    file: '04-information.csv',
  },
  {
    title: 'Applications',
    reason: 'Step 5 · Links to owners & capabilities (Optional)',
    description: 'Import your application inventory after the organizations, capabilities, and information objects it refers to.',
    type: 'applications',
    file: '05-applications.csv',
  },
  {
    title: 'Integrations',
    reason: 'Step 6 · Links apps & payloads (Optional)',
    description: 'Import integrations last so source applications, target applications, and information payloads resolve cleanly.',
    type: 'integrations',
    file: '06-integrations.csv',
  },
];

export const OnboardingGuide = ({
  brandName,
  onUpdateBrand,
  onComplete,
  onRefresh,
}: {
  brandName: string;
  onUpdateBrand: (name: string) => void;
  onComplete: () => void;
  onRefresh: () => void;
}) => {
  const access = useAccess();
  const queryClient = useQueryClient();

  // Step 1: Mandatory Admin Bootstrap state
  const [workspaceBrand, setWorkspaceBrand] = useState(brandName || 'OpenEA');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminError, setAdminError] = useState('');
  const [creatingAdmin, setCreatingAdmin] = useState(false);

  // Step 2: Data Onboarding Path state
  const [selectedPath, setSelectedPath] = useState<'traditional' | 'ai-flat' | 'example-seed'>('traditional');
  const [activeCsvStepIdx, setActiveCsvStepIdx] = useState(0);
  const [completing, setCompleting] = useState(false);

  const isAdminCreated = access.required;

  const handleBootstrapAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creatingAdmin) return;
    const trimmedName = adminName.trim();
    const trimmedBrand = workspaceBrand.trim() || 'OpenEA';
    if (!trimmedName) {
      setAdminError('Enter a display name for the administrator.');
      return;
    }
    setCreatingAdmin(true);
    setAdminError('');
    try {
      const res = await fetch('/api/access/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          email: adminEmail.trim(),
          password: adminPassword,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'Could not create administrator account.');
      }
      if (trimmedBrand !== brandName) {
        onUpdateBrand(trimmedBrand);
        await fetch('/api/workspace', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brandName: trimmedBrand, onboardingCompleted: false }),
        });
      }
      await access.refresh();
      await queryClient.invalidateQueries({ queryKey: ['workspace'] });
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : 'Could not reach server.');
    } finally {
      setCreatingAdmin(false);
    }
  };

  const handleFinishOnboarding = async () => {
    setCompleting(true);
    try {
      const res = await fetch('/api/workspace', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ onboardingCompleted: true }),
      });
      if (res.ok) {
        const saved = await res.json();
        queryClient.setQueryData(
          ['workspace'],
          normalizeWorkspaceSettings(saved, queryClient.getQueryData<WorkspaceSettings>(['workspace'])),
        );
      }
      onRefresh();
      onComplete();
    } finally {
      setCompleting(false);
    }
  };

  const activeStep = GUIDED_IMPORT_STEPS[activeCsvStepIdx] ?? GUIDED_IMPORT_STEPS[0]!;

  return (
    <div
      style={{
        height: '100%',
        minHeight: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
        background: 'var(--background)',
        color: 'var(--foreground)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Top Onboarding Header */}
      <header
        style={{
          borderBottom: '1px solid var(--border)',
          background: 'var(--card)',
          padding: '0.9rem 1.75rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
          flexWrap: 'wrap',
          flexShrink: 0,
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <BrandLogo />
          <div>
            <div style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--primary)' }}>
              New Instance Setup Guide
            </div>
            <h1 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>
              Welcome to {brandName || 'OpenEA'}
            </h1>
          </div>
        </div>

        {/* Step Indicator Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.35rem 0.75rem',
              borderRadius: '999px',
              fontSize: '0.76rem',
              fontWeight: 700,
              background: isAdminCreated ? 'color-mix(in srgb, #2b8a3e 15%, transparent)' : 'var(--primary)',
              color: isAdminCreated ? '#2b8a3e' : 'var(--primary-foreground)',
            }}
          >
            {isAdminCreated ? <Check size={14} /> : <Shield size={14} />}
            <span>1. Administrator Account {isAdminCreated ? '(Configured)' : '(Required)'}</span>
          </div>
          <ChevronRight size={15} style={{ color: 'var(--muted-foreground)' }} />
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.35rem 0.75rem',
              borderRadius: '999px',
              fontSize: '0.76rem',
              fontWeight: 700,
              background: isAdminCreated ? 'var(--primary)' : 'var(--secondary)',
              color: isAdminCreated ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
            }}
          >
            <Sparkles size={14} />
            <span>2. Data Onboarding & Seed Concepts (Optional)</span>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main
        style={{
          flex: '1 0 auto',
          maxWidth: '1120px',
          width: '100%',
          margin: '0 auto',
          padding: '2rem 1.5rem 3rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5rem',
        }}
      >
        {!isAdminCreated ? (
          /* STEP 1: MANDATORY ADMINISTRATOR SETUP */
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.75rem', alignItems: 'start' }}>
            <form onSubmit={handleBootstrapAdmin} className="card" style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
              <div>
                <div style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--primary)', marginBottom: '0.25rem' }}>
                  Step 1 of 2 · Mandatory Security Setup
                </div>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>Create the First Administrator Account</h2>
                <p style={{ fontSize: '0.84rem', color: 'var(--muted-foreground)', marginTop: '0.35rem', lineHeight: 1.45 }}>
                  Set up your workspace brand and primary administrator credentials. Creating this account initializes the <strong>Administrators</strong>, <strong>Architects</strong>, and <strong>Viewers</strong> access groups and unlocks the data onboarding paths.
                </p>
              </div>

              <div className="field" style={{ margin: 0 }}>
                <label className="label" htmlFor="onboard-brand">Workspace Brand Name</label>
                <input
                  id="onboard-brand"
                  value={workspaceBrand}
                  onChange={(e) => setWorkspaceBrand(e.target.value)}
                  placeholder="OpenEA"
                  required
                />
              </div>

              <div className="field" style={{ margin: 0 }}>
                <label className="label" htmlFor="onboard-admin-name">Administrator Display Name</label>
                <input
                  id="onboard-admin-name"
                  autoComplete="name"
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  placeholder="e.g. Jane Doe (Chief Architect)"
                  required
                />
              </div>

              <div className="field" style={{ margin: 0 }}>
                <label className="label" htmlFor="onboard-admin-email">Administrator Email</label>
                <input
                  id="onboard-admin-email"
                  type="email"
                  autoComplete="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="architect@company.com"
                  required
                />
              </div>

              <div className="field" style={{ margin: 0 }}>
                <label className="label" htmlFor="onboard-admin-password">Password (minimum 8 characters)</label>
                <input
                  id="onboard-admin-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  required
                />
              </div>

              {adminError && (
                <div style={{ padding: '0.65rem 0.85rem', borderRadius: '8px', background: 'color-mix(in srgb, #c92a2a 12%, var(--background))', color: 'var(--destructive, #c92a2a)', fontSize: '0.82rem', fontWeight: 600 }}>
                  {adminError}
                </div>
              )}

              <button
                type="submit"
                className="primary"
                disabled={creatingAdmin}
                style={{ height: '2.6rem', fontSize: '0.9rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
              >
                {creatingAdmin ? <Loader2 size={16} className="spin" /> : <ArrowRight size={16} />}
                {creatingAdmin ? 'Creating Administrator...' : 'Create Administrator & Continue to Step 2'}
              </button>
            </form>

            {/* Right-hand Overview of What Follows in Step 2 */}
            <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', background: 'var(--muted)' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted-foreground)' }}>
                What comes next in Step 2
              </div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0 }}>Three Flexible Ways to Populate Your Architecture</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div style={{ padding: '0.85rem', background: 'var(--card)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 800, fontSize: '0.86rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                    <Upload size={15} style={{ color: 'var(--primary)' }} />
                    1. Traditional 6-Step Guided CSV Import
                  </div>
                  <p style={{ fontSize: '0.76rem', color: 'var(--muted-foreground)', margin: '0.3rem 0 0', lineHeight: 1.4 }}>
                    Follow the dependency-safe order (Capabilities → Strategic Goals → Organizations → Information Model → Applications → Integrations). Every step is optional and includes example CSV previews and downloadable templates.
                  </p>
                </div>

                <div style={{ padding: '0.85rem', background: 'var(--card)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 800, fontSize: '0.86rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                    <Wand2 size={15} style={{ color: 'var(--primary)' }} />
                    2. AI / LLM-Assisted Flat Matrix Import
                  </div>
                  <p style={{ fontSize: '0.76rem', color: 'var(--muted-foreground)', margin: '0.3rem 0 0', lineHeight: 1.4 }}>
                    Connect an LLM provider and upload a single flat CSV spreadsheet. AI inspects the column headers and sample values, explains its assumptions, and maps columns across multiple meta-model concepts automatically.
                  </p>
                </div>

                <div style={{ padding: '0.85rem', background: 'var(--card)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 800, fontSize: '0.86rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                    <Sparkles size={15} style={{ color: 'var(--primary)' }} />
                    3. Seed Example Data per Meta-Model Concept
                  </div>
                  <p style={{ fontSize: '0.76rem', color: 'var(--muted-foreground)', margin: '0.3rem 0 0', lineHeight: 1.4 }}>
                    Seed interconnected example records for any of the 6 meta-model concepts now, or toggle them on and off anytime later in <strong>Settings → Data Management</strong>.
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* STEP 2: CHOOSE DATA ONBOARDING PATH */
          <>
            <div className="card" style={{ padding: '1.25rem 1.5rem' }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#2b8a3e' }}>
                Step 1 Complete · Signed in as {access.user?.name || access.user?.email || 'Administrator'}
              </div>
              <h2 style={{ fontSize: '1.3rem', fontWeight: 800, margin: '0.15rem 0 0' }}>
                Step 2: Choose How to Populate Your Workspace (All Steps Optional)
              </h2>
              <p style={{ fontSize: '0.82rem', color: 'var(--muted-foreground)', margin: '0.25rem 0 0' }}>
                Pick any path below—or combine them—to populate your architecture, then click <strong>Finish Setup & Open Workspace</strong> at the bottom of the page when you are ready. All tools remain available in <strong>Settings → Data Management</strong>.
              </p>
            </div>

            {/* 3 Path Selector Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
              <button
                type="button"
                onClick={() => setSelectedPath('traditional')}
                style={{
                  textAlign: 'left',
                  padding: '1.15rem',
                  borderRadius: '12px',
                  border: selectedPath === 'traditional' ? '2px solid var(--primary)' : '1px solid var(--border)',
                  background: selectedPath === 'traditional' ? 'color-mix(in srgb, var(--primary) 8%, var(--card))' : 'var(--card)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.45rem',
                  height: 'auto',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                  <span style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--primary)' }}>
                    Path 1 · Traditional Guided Import
                  </span>
                  {selectedPath === 'traditional' && <CheckCircle2 size={16} style={{ color: 'var(--primary)' }} />}
                </div>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--foreground)' }}>
                  6-Step Dependency-Ordered CSV Import
                </div>
                <div style={{ fontSize: '0.76rem', color: 'var(--muted-foreground)', lineHeight: 1.4, fontWeight: 500 }}>
                  Step through Capabilities, Strategic Goals, Organizations, Information, Applications, and Integrations with example data previews. Every step is optional.
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSelectedPath('ai-flat')}
                style={{
                  textAlign: 'left',
                  padding: '1.15rem',
                  borderRadius: '12px',
                  border: selectedPath === 'ai-flat' ? '2px solid var(--primary)' : '1px solid var(--border)',
                  background: selectedPath === 'ai-flat' ? 'color-mix(in srgb, var(--primary) 8%, var(--card))' : 'var(--card)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.45rem',
                  height: 'auto',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                  <span style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--primary)' }}>
                    Path 2 · AI / LLM Flat Matrix
                  </span>
                  {selectedPath === 'ai-flat' && <CheckCircle2 size={16} style={{ color: 'var(--primary)' }} />}
                </div>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--foreground)' }}>
                  AI-Assisted Flat Spreadsheet Mapping
                </div>
                <div style={{ fontSize: '0.76rem', color: 'var(--muted-foreground)', lineHeight: 1.4, fontWeight: 500 }}>
                  Configure an AI/LLM provider and upload a flat CSV matrix. AI reads column names, makes explicit assumptions, and maps each column across multiple meta-model objects.
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSelectedPath('example-seed')}
                style={{
                  textAlign: 'left',
                  padding: '1.15rem',
                  borderRadius: '12px',
                  border: selectedPath === 'example-seed' ? '2px solid var(--primary)' : '1px solid var(--border)',
                  background: selectedPath === 'example-seed' ? 'color-mix(in srgb, var(--primary) 8%, var(--card))' : 'var(--card)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.45rem',
                  height: 'auto',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                  <span style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--primary)' }}>
                    Path 3 · Instant Reference Architecture
                  </span>
                  {selectedPath === 'example-seed' && <CheckCircle2 size={16} style={{ color: 'var(--primary)' }} />}
                </div>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--foreground)' }}>
                  Seed Example Data per Concept
                </div>
                <div style={{ fontSize: '0.76rem', color: 'var(--muted-foreground)', lineHeight: 1.4, fontWeight: 500 }}>
                  Choose and activate example records for any of the 6 meta-model concepts. Can be activated or deactivated cleanly at any time in Settings.
                </div>
              </button>
            </div>

            {/* Active Path Content */}
            {selectedPath === 'traditional' && (
              <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--primary)' }}>
                      Guided 6-Step Data Portability
                    </div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: '0.15rem 0 0' }}>
                      Import CSV Files in Dependency Order (Every Step is Optional)
                    </h3>
                    <p style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)', margin: '0.25rem 0 0' }}>
                      Click any step below to view its example CSV data, download a template, import your own file, or skip ahead.
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.45rem' }}>
                    <button
                      type="button"
                      className="secondary"
                      disabled={activeCsvStepIdx === 0}
                      onClick={() => setActiveCsvStepIdx((i) => Math.max(0, i - 1))}
                      style={{ height: '2rem', padding: '0 0.75rem', fontSize: '0.78rem' }}
                    >
                      Previous Step
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      disabled={activeCsvStepIdx === GUIDED_IMPORT_STEPS.length - 1}
                      onClick={() => setActiveCsvStepIdx((i) => Math.min(GUIDED_IMPORT_STEPS.length - 1, i + 1))}
                      style={{ height: '2rem', padding: '0 0.75rem', fontSize: '0.78rem' }}
                    >
                      Skip / Next Step →
                    </button>
                  </div>
                </div>

                {/* Stepper Pills */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.5rem' }}>
                  {GUIDED_IMPORT_STEPS.map((step, idx) => {
                    const active = idx === activeCsvStepIdx;
                    return (
                      <button
                        key={step.type}
                        type="button"
                        onClick={() => setActiveCsvStepIdx(idx)}
                        style={{
                          padding: '0.6rem 0.75rem',
                          borderRadius: '10px',
                          border: active ? '1.5px solid var(--primary)' : '1px solid var(--border)',
                          background: active ? 'color-mix(in srgb, var(--primary) 10%, var(--background))' : 'var(--background)',
                          color: 'var(--foreground)',
                          textAlign: 'left',
                          cursor: 'pointer',
                          height: 'auto',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.55rem',
                        }}
                      >
                        <span
                          style={{
                            width: '1.5rem',
                            height: '1.5rem',
                            borderRadius: '999px',
                            background: active ? 'var(--primary)' : 'var(--secondary)',
                            color: active ? 'var(--primary-foreground)' : 'var(--foreground)',
                            fontSize: '0.72rem',
                            fontWeight: 800,
                            display: 'grid',
                            placeItems: 'center',
                            flexShrink: 0,
                          }}
                        >
                          {idx + 1}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: '0.78rem', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {step.title}
                          </div>
                          <div style={{ fontSize: '0.65rem', color: 'var(--muted-foreground)' }}>Optional</div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Active Step Card */}
                <div style={{ padding: '1.15rem', background: 'var(--background)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--primary)' }}>
                        {activeStep.reason}
                      </div>
                      <h4 style={{ fontSize: '1.05rem', fontWeight: 800, margin: '0.2rem 0' }}>{activeStep.title}</h4>
                      <p style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)', margin: 0 }}>{activeStep.description}</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <ImportExport type={activeStep.type} onImportSuccess={onRefresh} />
                      {activeCsvStepIdx < GUIDED_IMPORT_STEPS.length - 1 && (
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => setActiveCsvStepIdx((i) => i + 1)}
                          style={{ height: '1.8rem', padding: '0 0.7rem', fontSize: '0.78rem' }}
                        >
                          Skip this step →
                        </button>
                      )}
                    </div>
                  </div>

                  <ExampleCsvPreview type={activeStep.type} filename={activeStep.file} />
                </div>
              </div>
            )}

            {selectedPath === 'ai-flat' && <FlatCsvAiImporter onRefresh={onRefresh} />}

            {selectedPath === 'example-seed' && <ExampleDataManager onRefresh={onRefresh} />}

            {/* Bottom Completion Action Bar */}
            <div
              className="card"
              style={{
                padding: '1.25rem 1.5rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '1rem',
                flexWrap: 'wrap',
                borderColor: 'color-mix(in srgb, var(--primary) 35%, var(--border))',
              }}
            >
              <div>
                <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>
                  Ready to open your workspace?
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)', marginTop: '0.15rem' }}>
                  You can import additional CSVs, run AI matrix mapping, or toggle example datasets anytime in <strong>Settings → Data Management</strong>.
                </div>
              </div>
              <button
                type="button"
                className="primary"
                disabled={completing}
                onClick={handleFinishOnboarding}
                style={{ height: '2.6rem', padding: '0 1.35rem', fontSize: '0.88rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}
              >
                {completing ? <Loader2 size={16} className="spin" /> : <CheckCircle2 size={16} />}
                Finish Setup & Open Workspace
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
};
