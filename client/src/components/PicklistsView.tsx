import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Settings2, FileCode, Palette, Database, Boxes, Layers, FileText, Network, Sliders, RotateCcw, Sparkles, type LucideIcon } from 'lucide-react';
import { EditMetadataDialog } from './EditMetadataDialog';
import { EditRangePicklistDialog } from './EditRangePicklistDialog';
import { ImportExportSettings } from './ImportExport';
import { useLocalStorage, DEFAULT_TIME_THRESHOLDS, type TimeThresholds } from '../App';
import { ColoredSelect } from './ColoredSelect';
import { TimeMatrix } from './TimeMatrix';
import { AiProvidersSettings } from './AiProvidersSettings';
import { AiSystemPromptSettings } from './AiSystemPromptSettings';
import { isLockedNativeField, nativeFieldEnabled, type NativeFieldId } from '../nativeFields';
import { fetchWorkspaceSettings, parseDisabledNativeFields, type WorkspaceSettings } from '../workspaceSettings';

interface PicklistOption {
  id: string;
  value: string;
  label: string;
  description?: string;
  color: string;
  order: number;
}

interface Picklist {
  id: string;
  name: string;
  label: string;
  options: PicklistOption[];
}

interface MetadataDefinition {
  id: string;
  entityType: string;
  fieldName: string;
  fieldType: string;
  label: string;
  required: boolean;
  min?: number;
  max?: number;
  scaleType?: string;
}

const STRATEGIC_FIELD_NAMES = ['criticality', 'application_cost', 'functional_fit', 'technical_fit', 'cia_scale'];

const SETTINGS_TABS = ['artifact', 'metadata', 'branding', 'import-export', 'time_thresholds', 'ai', 'ai-prompt'] as const;
type SettingsTab = (typeof SETTINGS_TABS)[number];

function isSettingsTab(value: string): value is SettingsTab {
  return (SETTINGS_TABS as readonly string[]).includes(value);
}

interface ArtifactConfig {
  id: string;
  label: string;
  icon: LucideIcon;
  picklists: string[];
}

const ARTIFACTS: ArtifactConfig[] = [
  {
    id: 'Application',
    label: 'Applications',
    icon: Database,
    picklists: ['application_type', 'owner', 'lifecycle', 'criticality', 'application_cost', 'functional_fit', 'technical_fit'],
  },
  {
    id: 'Capability',
    label: 'Capabilities',
    icon: Boxes,
    picklists: ['criticality'],
  },
  {
    id: 'Organization',
    label: 'Organizations',
    icon: Layers,
    picklists: ['organization_type'],
  },
  {
    id: 'InformationObject',
    label: 'Information Model',
    icon: FileText,
    picklists: ['information_type', 'pii_category', 'cia_scale'],
  },
  {
    id: 'Integration',
    label: 'Integrations',
    icon: Network,
    picklists: ['integration_type', 'integration_pattern', 'integration_frequency', 'integration_crud'],
  },
];

function SettingsGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
      <div style={{ padding: '0 0.85rem', fontSize: '0.65rem', fontWeight: 800, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{title}</div>
      <div className="card" style={{ padding: '0.4rem', background: 'var(--card)' }}>
        {children}
      </div>
    </div>
  );
}

function SettingsNavButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', height: 'auto', justifyContent: 'flex-start', border: 'none',
        background: active ? 'var(--accent)' : 'transparent',
        color: active ? 'var(--foreground)' : 'var(--muted-foreground)',
        padding: '0.55rem 0.65rem', fontSize: '0.78rem', fontWeight: active ? 700 : 600,
        textAlign: 'left', borderRadius: '5px', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: '0.45rem',
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function ArtifactPicklistCard({ picklist, onChanged, heading }: { picklist: Picklist; onChanged: () => void; heading?: string }) {
  const isScale = STRATEGIC_FIELD_NAMES.includes(picklist.name);
  const options = [...picklist.options].sort((a, b) => a.order - b.order);

  return (
    <section className="card" style={{ padding: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '1rem' }}>
        <div>
          <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.25rem' }}>
            {isScale ? 'Assessment scale' : 'Picklist'}
          </div>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>{heading || picklist.label}</h3>
        </div>
        <EditRangePicklistDialog picklist={picklist} isScale={isScale} onSuccess={onChanged} />
      </div>

      {options.length === 0 ? (
        <div style={{ color: 'var(--muted-foreground)', fontSize: '0.8rem' }}>No options defined yet.</div>
      ) : isScale ? (
        <div style={{ padding: '1rem', background: 'var(--background)', borderRadius: '12px', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {options.map(opt => (
              <div key={opt.id} style={{ flex: 1, height: '34px', background: opt.color, borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(0,0,0,0.1)' }} title={opt.label}>
                <span style={{ fontSize: '0.7rem', fontWeight: 900, color: 'white', textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>{opt.value}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', padding: '0 0.15rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted-foreground)' }}>{options[0]?.label}</span>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted-foreground)' }}>{options[options.length - 1]?.label}</span>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.65rem' }}>
          {options.map(opt => (
            <div key={opt.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', padding: '0.65rem 0.75rem', background: 'var(--background)', borderRadius: '10px', border: '1px solid var(--border)' }}>
              <div style={{ width: '14px', height: '14px', borderRadius: '4px', background: opt.color || '#adb5bd', border: '1px solid var(--border)', flexShrink: 0, marginTop: '0.15rem' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700 }}>{opt.label}</div>
                {opt.description && (
                  <div style={{ fontSize: '0.7rem', color: 'var(--muted-foreground)', lineHeight: 1.35, marginTop: '0.2rem' }}>{opt.description}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

const FIELD_TYPE_LABELS: Record<string, string> = {
  string: 'Text',
  textarea: 'Long text',
  number: 'Number',
  range: 'Range',
  date: 'Date',
  boolean: 'Checkbox',
};

// Same fields and order as each artifact's edit form. Picklists stay configurable.
// Custom kinds expand to that artifact's custom attributes.
type ArtifactField =
  | { kind: 'builtin'; id: NativeFieldId; section: string; label: string; typeLabel: string; detail: string; locked?: boolean; lockedTitle?: string }
  | { kind: 'picklist'; section: string; name: string; label: string }
  | { kind: 'custom-range'; section: string; entityType: string }
  | { kind: 'custom-other'; section: string; entityType: string }
  | { kind: 'custom'; section: string; entityType: string; skipFieldNames?: string[] };

const APPLICATION_FIELDS: ArtifactField[] = [
  { kind: 'builtin', id: 'name', section: 'Basic information', label: 'Application Name', typeLabel: 'Text', detail: 'Required name of the application.', locked: true, lockedTitle: 'The application name is required' },
  { kind: 'builtin', id: 'description', section: 'Basic information', label: 'Description', typeLabel: 'Long text', detail: 'Purpose and primary functions.' },
  { kind: 'builtin', id: 'vendorName', section: 'Basic information', label: 'Vendor name', typeLabel: 'Text', detail: 'Name of the provider.' },
  { kind: 'builtin', id: 'vendorUrl', section: 'Basic information', label: 'Home page', typeLabel: 'Text', detail: 'Vendor home page.' },
  { kind: 'builtin', id: 'vendorSummary', section: 'Basic information', label: 'Vendor description', typeLabel: 'Long text', detail: 'One or two sentences about the vendor.' },
  { kind: 'picklist', section: 'Basic information', name: 'owner', label: 'Business Owner (Individual)' },
  { kind: 'builtin', id: 'ownerOrg', section: 'Basic information', label: 'Owning Organization', typeLabel: 'Relation', detail: 'Organization that owns the application.' },
  { kind: 'picklist', section: 'Basic information', name: 'application_type', label: 'Application Type' },
  { kind: 'picklist', section: 'Basic information', name: 'lifecycle', label: 'Lifecycle Status' },
  { kind: 'builtin', id: 'lifecycleStart', section: 'Basic information', label: 'Lifecycle Start Date', typeLabel: 'Date', detail: 'When this lifecycle stage starts.' },
  { kind: 'builtin', id: 'lifecycleEnd', section: 'Basic information', label: 'Lifecycle End Date', typeLabel: 'Date', detail: 'When this lifecycle stage ends.' },
  { kind: 'builtin', id: 'contractStart', section: 'Basic information', label: 'Contract Start Date', typeLabel: 'Date', detail: 'Start of the current contract.' },
  { kind: 'builtin', id: 'contractEnd', section: 'Basic information', label: 'Contract End Date', typeLabel: 'Date', detail: 'End of the current contract.' },
  { kind: 'builtin', id: 'contractDetails', section: 'Basic information', label: 'Contract Details / Notes (Optional)', typeLabel: 'Long text', detail: 'Agreement id, renewal terms, or other contract notes.' },
  { kind: 'picklist', section: 'Strategic assessment', name: 'criticality', label: 'Business Criticality' },
  { kind: 'picklist', section: 'Strategic assessment', name: 'application_cost', label: 'Cost' },
  { kind: 'picklist', section: 'Strategic assessment', name: 'functional_fit', label: 'Functional Fit' },
  { kind: 'picklist', section: 'Strategic assessment', name: 'technical_fit', label: 'Technical Fit' },
  { kind: 'custom-range', section: 'Strategic assessment', entityType: 'Application' },
  { kind: 'builtin', id: 'timeRationale', section: 'Strategic assessment', label: 'TIME rationale', typeLabel: 'Long text', detail: 'Why this TIME assessment holds.' },
  { kind: 'builtin', id: 'capabilities', section: 'Relations', label: 'Business Capabilities', typeLabel: 'Relation', detail: 'Capabilities this application supports.' },
  { kind: 'builtin', id: 'processedInformation', section: 'Relations', label: 'Processed Information', typeLabel: 'Relation', detail: 'Information objects this application processes.' },
  { kind: 'builtin', id: 'integrations', section: 'Relations', label: 'Integrations & Data Flows', typeLabel: 'Relation', detail: 'Inbound and outbound integrations.' },
  { kind: 'custom-other', section: 'Extended metadata', entityType: 'Application' },
  { kind: 'builtin', id: 'references', section: 'References', label: 'References', typeLabel: 'Links', detail: 'Titles and links attached to the application.' },
];

const CAPABILITY_FIELDS: ArtifactField[] = [
  { kind: 'builtin', id: 'capability.name', section: 'Functional definition', label: 'Capability Name', typeLabel: 'Text', detail: 'Required name of the capability.', locked: true, lockedTitle: 'The capability name is required' },
  { kind: 'builtin', id: 'capability.description', section: 'Functional definition', label: 'Purpose & Outcome', typeLabel: 'Long text', detail: 'Business outcomes this capability produces.' },
  { kind: 'builtin', id: 'capability.parent', section: 'Functional definition', label: 'Parent Capability', typeLabel: 'Relation', detail: 'Capability this one belongs to.' },
  { kind: 'picklist', section: 'Strategic importance', name: 'criticality', label: 'Business Criticality' },
  { kind: 'builtin', id: 'capability.applications', section: 'Relations', label: 'Supporting Applications', typeLabel: 'Relation', detail: 'Applications that support this capability.' },
  { kind: 'custom', section: 'Extended metadata', entityType: 'Capability', skipFieldNames: ['criticality'] },
  { kind: 'builtin', id: 'capability.references', section: 'References', label: 'References', typeLabel: 'Links', detail: 'Titles and links attached to the capability.' },
];

const ORGANIZATION_FIELDS: ArtifactField[] = [
  { kind: 'builtin', id: 'organization.name', section: 'Definition', label: 'Name', typeLabel: 'Text', detail: 'Required name of the organization.', locked: true, lockedTitle: 'The organization name is required' },
  { kind: 'builtin', id: 'organization.description', section: 'Definition', label: 'Description', typeLabel: 'Long text', detail: 'Accountabilities and scope.' },
  { kind: 'picklist', section: 'Definition', name: 'organization_type', label: 'Type' },
  { kind: 'builtin', id: 'organization.parent', section: 'Definition', label: 'Parent Organization / Manager', typeLabel: 'Relation', detail: 'Organization this one reports to.' },
  { kind: 'builtin', id: 'organization.capabilities', section: 'Relations', label: 'Supported Capabilities', typeLabel: 'Relation', detail: 'Capabilities this organization supports.' },
  { kind: 'builtin', id: 'organization.references', section: 'References', label: 'References', typeLabel: 'Links', detail: 'Titles and links attached to the organization.' },
];

const INFORMATION_FIELDS: ArtifactField[] = [
  { kind: 'builtin', id: 'information.name', section: 'Functional definition', label: 'Governed Name', typeLabel: 'Text', detail: 'Required name of the information object.', locked: true, lockedTitle: 'The governed name is required' },
  { kind: 'builtin', id: 'information.aliases', section: 'Functional definition', label: 'Aliases (Comma separated)', typeLabel: 'Text', detail: 'Other names for this concept.' },
  { kind: 'builtin', id: 'information.description', section: 'Functional definition', label: 'Business Definition', typeLabel: 'Long text', detail: 'What this concept represents.' },
  { kind: 'picklist', section: 'Functional definition', name: 'information_type', label: 'Information Type' },
  { kind: 'picklist', section: 'CIA model and compliance', name: 'cia_scale', label: 'Confidentiality, Integrity, and Availability' },
  { kind: 'picklist', section: 'CIA model and compliance', name: 'pii_category', label: 'PII Category' },
  { kind: 'builtin', id: 'information.businessOwner', section: 'Accountability', label: 'Business Owner', typeLabel: 'Relation', detail: 'Organization accountable for this concept.' },
  { kind: 'builtin', id: 'information.sourceOfTruth', section: 'Accountability', label: 'Source of Truth', typeLabel: 'Relation', detail: 'Application that masters this concept.' },
  { kind: 'custom', section: 'Extended metadata', entityType: 'InformationObject' },
  { kind: 'builtin', id: 'information.references', section: 'References', label: 'References', typeLabel: 'Links', detail: 'Titles and links attached to the information object.' },
];

const INTEGRATION_FIELDS: ArtifactField[] = [
  { kind: 'builtin', id: 'integration.description', section: 'Source and payload', label: 'Description', typeLabel: 'Long text', detail: 'Purpose of this data flow.' },
  { kind: 'builtin', id: 'integration.source', section: 'Source and payload', label: 'Source Application', typeLabel: 'Relation', detail: 'Application that sends the data.', locked: true, lockedTitle: 'The source application is required' },
  { kind: 'builtin', id: 'integration.payload', section: 'Source and payload', label: 'Information Object Payload', typeLabel: 'Relation', detail: 'Information object carried by this flow.' },
  { kind: 'builtin', id: 'integration.target', section: 'Source and payload', label: 'Target Application', typeLabel: 'Relation', detail: 'Application that receives the data.', locked: true, lockedTitle: 'The target application is required' },
  { kind: 'picklist', section: 'Delivery context', name: 'integration_pattern', label: 'Integration Pattern' },
  { kind: 'picklist', section: 'Delivery context', name: 'integration_frequency', label: 'Frequency' },
  { kind: 'picklist', section: 'Delivery context', name: 'integration_crud', label: 'CRUD Operations' },
  { kind: 'picklist', section: 'Delivery context', name: 'integration_type', label: 'Integration Type' },
  { kind: 'builtin', id: 'integration.references', section: 'References', label: 'References', typeLabel: 'Links', detail: 'Titles and links attached to the integration.' },
];

const ARTIFACT_FIELDS: Record<string, ArtifactField[]> = {
  Application: APPLICATION_FIELDS,
  Capability: CAPABILITY_FIELDS,
  Organization: ORGANIZATION_FIELDS,
  InformationObject: INFORMATION_FIELDS,
  Integration: INTEGRATION_FIELDS,
};

const ARTIFACT_SUBJECT: Record<string, string> = {
  Application: 'application',
  Capability: 'capability',
  Organization: 'organization',
  InformationObject: 'information object',
  Integration: 'integration',
};

function FieldToggle({ checked, locked, label, lockedTitle, subject, onChange }: { checked: boolean; locked?: boolean; label: string; lockedTitle?: string; subject: string; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      className="field-toggle"
      role="switch"
      aria-checked={checked}
      aria-label={locked ? `${label} is required` : `${label}, ${checked ? 'shown' : 'hidden'}`}
      disabled={locked}
      title={locked ? (lockedTitle || 'This field is required') : checked ? `Shown on the ${subject}` : `Hidden on the ${subject}`}
      onClick={() => onChange(!checked)}
    >
      <span className="field-toggle-knob" />
    </button>
  );
}

function BuiltinFieldCard({ label, typeLabel, detail, enabled, locked, lockedTitle, subject, onToggle }: { label: string; typeLabel: string; detail: string; enabled: boolean; locked?: boolean; lockedTitle?: string; subject?: string; onToggle?: (next: boolean) => void }) {
  return (
    <section className="card" style={{ padding: '0.9rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', opacity: enabled ? 1 : 0.55 }}>
      <div style={{ minWidth: 0 }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>{label}</h3>
        <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginTop: '0.2rem' }}>{detail}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexShrink: 0 }}>
        <span style={{ background: 'var(--secondary)', color: 'var(--secondary-foreground)', padding: '0.15rem 0.45rem', borderRadius: '4px', fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase' }}>{typeLabel}</span>
        {onToggle && <FieldToggle checked={enabled} locked={locked} label={label} lockedTitle={lockedTitle} subject={subject || 'record'} onChange={onToggle} />}
      </div>
    </section>
  );
}

function CustomAttributeCard({ definition, onChanged, onDelete }: { definition: MetadataDefinition; onChanged: () => void; onDelete: () => void }) {
  const typeLabel = FIELD_TYPE_LABELS[definition.fieldType] || definition.fieldType;
  return (
    <section className="card" style={{ padding: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.25rem' }}>
            Custom attribute
          </div>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>{definition.label}</h3>
          <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginTop: '0.25rem' }}>
            {typeLabel} · <span style={{ fontFamily: 'monospace' }}>{definition.fieldName}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexShrink: 0 }}>
          <EditMetadataDialog definition={definition} buttonLabel="Edit Field" onSuccess={onChanged} />
          <button onClick={onDelete} title="Delete field" style={{ border: 'none', background: 'transparent', color: 'var(--destructive)', padding: '0.4rem', cursor: 'pointer' }}>
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </section>
  );
}

function FieldSectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted-foreground)', margin: '0.35rem 0 0', letterSpacing: '0.06em' }}>{children}</h3>
  );
}

function buildArtifactSections(
  fields: ArtifactField[],
  subject: string,
  picklists: Picklist[],
  metaDefs: MetadataDefinition[],
  onPicklistsChanged: () => void,
  onMetaChanged: () => void,
  onDeleteMeta: (id: string) => void,
  disabledNativeFields: readonly string[],
  onToggleNativeField: (id: NativeFieldId, enabled: boolean) => void,
) {
  const byName = new Map(picklists.map((picklist) => [picklist.name, picklist]));
  const sections: { title: string; nodes: React.ReactNode[] }[] = [];

  const push = (title: string, node: React.ReactNode) => {
    let section = sections.find((item) => item.title === title);
    if (!section) {
      section = { title, nodes: [] };
      sections.push(section);
    }
    section.nodes.push(node);
  };

  const pushCustom = (section: string, defs: MetadataDefinition[]) => {
    defs.forEach((def) => push(section, (
      <CustomAttributeCard key={def.id} definition={def} onChanged={onMetaChanged} onDelete={() => onDeleteMeta(def.id)} />
    )));
  };

  for (const field of fields) {
    if (field.kind === 'picklist') {
      const picklist = byName.get(field.name);
      push(field.section, picklist ? (
        <ArtifactPicklistCard key={`${field.section}-${picklist.id}`} picklist={picklist} heading={field.label} onChanged={onPicklistsChanged} />
      ) : (
        <BuiltinFieldCard key={field.name} label={field.label} typeLabel="Picklist" detail="This list is not configured yet." enabled />
      ));
    } else if (field.kind === 'custom-range') {
      pushCustom(field.section, metaDefs.filter((def) => def.entityType === field.entityType && def.fieldType === 'range'));
    } else if (field.kind === 'custom-other') {
      pushCustom(field.section, metaDefs.filter((def) => def.entityType === field.entityType && def.fieldType !== 'range'));
    } else if (field.kind === 'custom') {
      const skip = new Set(field.skipFieldNames ?? []);
      pushCustom(field.section, metaDefs.filter((def) => def.entityType === field.entityType && !skip.has(def.fieldName)));
    } else {
      const enabled = nativeFieldEnabled(disabledNativeFields, field.id);
      push(field.section, (
        <BuiltinFieldCard
          key={field.id}
          label={field.label}
          typeLabel={field.typeLabel}
          detail={field.detail}
          enabled={enabled}
          locked={field.locked}
          lockedTitle={field.lockedTitle}
          subject={subject}
          onToggle={(next) => onToggleNativeField(field.id, next)}
        />
      ));
    }
  }

  return sections.filter((section) => section.nodes.length > 0);
}

interface Props {
  brandName: string;
  onUpdateBrand: (val: string) => void;
  brandError?: string;
  apps: any[];
  capabilities: any[];
  organizations: any[];
  informationObjects: any[];
  integrations: any[];
  onRefresh: () => void;
  timeThresholds?: TimeThresholds;
  onUpdateTimeThresholds?: (t: TimeThresholds) => void;
}

export const PicklistsView = ({ 
  brandName, 
  onUpdateBrand,
  brandError = '', 
  apps, 
  capabilities, 
  organizations, 
  informationObjects, 
  integrations, 
  onRefresh,
  timeThresholds: propTimeThresholds,
  onUpdateTimeThresholds: propOnUpdateTimeThresholds
}: Props) => {
  const queryClient = useQueryClient();
  const [storedTab, setActiveTab] = useLocalStorage<string>('openea_settings_tab', 'artifact');
  const [selectedArtifactId, setSelectedArtifactId] = useLocalStorage<string>('openea_settings_artifact', 'Application');
  const [legacyPicklistId] = useLocalStorage<string | null>('openea_settings_picklist', null);
  const activeTab: SettingsTab = isSettingsTab(storedTab) ? storedTab : 'artifact';
  const migratedLegacyTab = useRef(false);

  const [localTimeThresholds, setLocalTimeThresholds] = useLocalStorage<TimeThresholds>('openea_time_thresholds', DEFAULT_TIME_THRESHOLDS);
  const timeThresholds = propTimeThresholds || localTimeThresholds;
  const setTimeThresholds = propOnUpdateTimeThresholds || setLocalTimeThresholds;

  const previewApps = useMemo(() => {
    if (apps && apps.length >= 4) {
      return apps.slice(0, 25);
    }
    return [
      { id: 'sample-invest', name: 'Core ERP Platform', technicalFit: 4, functionalFit: 4, criticality: 5, cost: 4 },
      { id: 'sample-invest-2', name: 'Customer Portal', technicalFit: 5, functionalFit: 5, criticality: 4, cost: 2 },
      { id: 'sample-migrate', name: 'Legacy Billing', technicalFit: 2, functionalFit: 4, criticality: 4, cost: 5 },
      { id: 'sample-migrate-2', name: 'Warehouse Ops', technicalFit: 1, functionalFit: 4, criticality: 3, cost: 2 },
      { id: 'sample-tolerate', name: 'Internal Wiki', technicalFit: 4, functionalFit: 2, criticality: 2, cost: 1 },
      { id: 'sample-tolerate-2', name: 'Reporting Server', technicalFit: 5, functionalFit: 1, criticality: 3, cost: 4 },
      { id: 'sample-eliminate', name: 'Old Survey Tool', technicalFit: 2, functionalFit: 2, criticality: 1, cost: 4 },
      { id: 'sample-eliminate-2', name: 'Deprecated Chat', technicalFit: 1, functionalFit: 1, criticality: 1, cost: 1 },
    ];
  }, [apps]);
  
  // States for new metadata field
  const [metaLabel, setMetaLabel] = useState('');
  const [metaName, setMetaName] = useState('');
  const [metaType, setMetaType] = useState('string');
  const [metaEntity, setMetaEntity] = useState('Application');
  const [metaMin, setMetaMin] = useState(0);
  const [metaMax, setMetaMax] = useState(100);
  const [metaScale, setMetaScale] = useState('neutral');

  const { data: picklists, isLoading: loadingPicklists } = useQuery<Picklist[]>({
    queryKey: ['picklists'],
    queryFn: async () => {
      const res = await fetch('/api/picklists');
      return res.json();
    }
  });

  const { data: metaDefs, isLoading: loadingMeta } = useQuery<MetadataDefinition[]>({
    queryKey: ['metadata-definitions'],
    queryFn: async () => {
      const res = await fetch('/api/metadata-definitions');
      return res.json();
    }
  });

  const { data: workspace } = useQuery<WorkspaceSettings>({
    queryKey: ['workspace'],
    queryFn: fetchWorkspaceSettings,
  });

  // Older builds stored one page per picklist. Land on the artifact that owned that field.
  useEffect(() => {
    if (migratedLegacyTab.current) return;
    if (storedTab !== 'picklists') {
      migratedLegacyTab.current = true;
      return;
    }
    if (!picklists) return;
    migratedLegacyTab.current = true;
    const selected = picklists.find((picklist) => picklist.id === legacyPicklistId);
    const match = ARTIFACTS.find((artifact) => selected && artifact.picklists.includes(selected.name));
    if (match) setSelectedArtifactId(match.id);
    setActiveTab('artifact');
  }, [storedTab, picklists, legacyPicklistId, setActiveTab, setSelectedArtifactId]);

  if (loadingPicklists || loadingMeta) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading configuration...</div>;

  const handleAddMeta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!metaLabel || !metaName) return;

    try {
      const res = await fetch('/api/metadata-definitions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityType: metaEntity,
          fieldName: metaName,
          fieldType: metaType,
          label: metaLabel,
          required: false,
          min: metaType === 'range' ? Number(metaMin) : undefined,
          max: metaType === 'range' ? Number(metaMax) : undefined,
          scaleType: metaType === 'range' ? metaScale : undefined,
        }),
      });

      if (res.ok) {
        setMetaLabel('');
        setMetaName('');
        setMetaMin(0);
        setMetaMax(100);
        setMetaScale('neutral');
        queryClient.invalidateQueries({ queryKey: ['metadata-definitions'] });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteMeta = async (id: string) => {
    if (!confirm('Are you sure? This will permanently delete this field and all associated data from every record.')) return;
    try {
      const res = await fetch(`/api/metadata-definitions/${id}`, { method: 'DELETE' });
      if (res.ok) queryClient.invalidateQueries({ queryKey: ['metadata-definitions'] });
    } catch (err) {
      console.error(err);
    }
  };

  const selectedArtifact = ARTIFACTS.find((artifact) => artifact.id === selectedArtifactId) ?? ARTIFACTS[0];
  const ArtifactIcon = selectedArtifact.icon;
  const artifactPicklists = selectedArtifact.picklists
    .map((name) => picklists?.find((picklist) => picklist.name === name))
    .filter((picklist): picklist is Picklist => Boolean(picklist));
  const sharedPicklists = artifactPicklists.filter((picklist) =>
    ARTIFACTS.some((artifact) => artifact.id !== selectedArtifact.id && artifact.picklists.includes(picklist.name))
  );
  const sharedWith = ARTIFACTS.filter((artifact) =>
    artifact.id !== selectedArtifact.id && artifact.picklists.some((name) => sharedPicklists.some((picklist) => picklist.name === name))
  ).map((artifact) => artifact.label);
  const sharedFieldNote = sharedPicklists.length === 0
    ? ''
    : sharedPicklists.length === 1
      ? ` ${sharedPicklists[0].label} is shared with ${sharedWith.join(' and ')}.`
      : ` ${sharedPicklists.map((picklist) => picklist.label).join(' and ')} are shared with ${sharedWith.join(' and ')}.`;

  const refreshPicklists = () => queryClient.invalidateQueries({ queryKey: ['picklists'] });
  const refreshMeta = () => queryClient.invalidateQueries({ queryKey: ['metadata-definitions'] });
  const disabledNativeFields = workspace?.disabledNativeFields ?? [];
  const toggleNativeField = async (id: NativeFieldId, enabled: boolean) => {
    if (isLockedNativeField(id)) return;
    const current = workspace?.disabledNativeFields ?? [];
    const next = enabled ? current.filter((item) => item !== id) : [...new Set([...current, id])];
    const previous = queryClient.getQueryData<WorkspaceSettings>(['workspace']);
    queryClient.setQueryData<WorkspaceSettings>(['workspace'], (existing) => ({
      brandName: existing?.brandName ?? 'OpenEA',
      disabledNativeFields: next,
    }));
    try {
      const res = await fetch('/api/workspace', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ disabledNativeFields: next }),
      });
      if (!res.ok) throw new Error('Could not save field visibility');
      const saved = await res.json() as { brandName?: string; disabledNativeFields?: unknown };
      queryClient.setQueryData<WorkspaceSettings>(['workspace'], (existing) => ({
        brandName: typeof saved.brandName === 'string' ? saved.brandName : existing?.brandName ?? 'OpenEA',
        disabledNativeFields: parseDisabledNativeFields(saved.disabledNativeFields),
      }));
    } catch {
      queryClient.setQueryData(['workspace'], previous);
    }
  };
  const artifactSections = buildArtifactSections(
    ARTIFACT_FIELDS[selectedArtifact.id] ?? [],
    ARTIFACT_SUBJECT[selectedArtifact.id] ?? 'record',
    picklists ?? [],
    metaDefs ?? [],
    refreshPicklists,
    refreshMeta,
    handleDeleteMeta,
    disabledNativeFields,
    toggleNativeField,
  );

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 0.75rem' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em' }}>Settings & Configuration</h1>
        <p style={{ color: 'var(--muted-foreground)', fontSize: '0.9rem' }}>Configure the meta model, assessment frameworks, and workspace.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '2rem', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <SettingsGroup title="Meta Model Configuration">
            {ARTIFACTS.map((artifact) => {
              const Icon = artifact.icon;
              return (
                <SettingsNavButton
                  key={artifact.id}
                  active={activeTab === 'artifact' && selectedArtifact.id === artifact.id}
                  onClick={() => { setActiveTab('artifact'); setSelectedArtifactId(artifact.id); }}
                  icon={<Icon size={16} />}
                  label={artifact.label}
                />
              );
            })}
            <SettingsNavButton
              active={activeTab === 'metadata'}
              onClick={() => setActiveTab('metadata')}
              icon={<FileCode size={16} />}
              label="Custom Attributes"
            />
          </SettingsGroup>

          <SettingsGroup title="Frameworks">
            <SettingsNavButton
              active={activeTab === 'time_thresholds'}
              onClick={() => setActiveTab('time_thresholds')}
              icon={<Sliders size={16} />}
              label="TIME"
            />
          </SettingsGroup>

          <SettingsGroup title="AI">
            <SettingsNavButton
              active={activeTab === 'ai'}
              onClick={() => setActiveTab('ai')}
              icon={<Sparkles size={16} />}
              label="Providers"
            />
            <SettingsNavButton
              active={activeTab === 'ai-prompt'}
              onClick={() => setActiveTab('ai-prompt')}
              icon={<FileText size={16} />}
              label="System prompt"
            />
          </SettingsGroup>

          <SettingsGroup title="Workspace">
            <SettingsNavButton
              active={activeTab === 'branding'}
              onClick={() => setActiveTab('branding')}
              icon={<Palette size={16} />}
              label="Global Branding"
            />
            <SettingsNavButton
              active={activeTab === 'import-export'}
              onClick={() => setActiveTab('import-export')}
              icon={<Settings2 size={16} />}
              label="Data Management"
            />
          </SettingsGroup>
        </div>

        {/* Main Content Area */}
        <div style={{ minWidth: 0 }}>
          {activeTab === 'artifact' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div style={{ marginBottom: '0.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                  <ArtifactIcon size={18} />
                  <h2 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>{selectedArtifact.label}</h2>
                </div>
                <p style={{ color: 'var(--muted-foreground)', fontSize: '0.85rem', margin: 0 }}>
                  Fields and allowed values for this artifact.{sharedFieldNote}
                </p>
              </div>
              {artifactSections.map((section) => (
                <React.Fragment key={section.title}>
                  <FieldSectionTitle>{section.title}</FieldSectionTitle>
                  {section.nodes}
                </React.Fragment>
              ))}
              {artifactSections.length === 0 && (
                <div className="card" style={{ padding: '1.5rem', color: 'var(--muted-foreground)', fontSize: '0.85rem' }}>
                  No fields are configured for this artifact yet.
                </div>
              )}
            </div>
          ) : activeTab === 'metadata' ? (
            <div className="card" style={{ padding: '1.5rem' }}>
              <div style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Custom Attributes</h2>
                <p style={{ color: 'var(--muted-foreground)', fontSize: '0.85rem' }}>Inject dynamically rendered fields into any artifact type.</p>
              </div>

              <div style={{ marginBottom: '2rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '0.75rem', fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--muted-foreground)' }}>Target Artifact</th>
                      <th style={{ padding: '0.75rem', fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--muted-foreground)' }}>Label</th>
                      <th style={{ padding: '0.75rem', fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--muted-foreground)' }}>System Name</th>
                      <th style={{ padding: '0.75rem', fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--muted-foreground)' }}>Type</th>
                      <th style={{ padding: '0.75rem', textAlign: 'right' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {metaDefs?.map(def => (
                      <tr key={def.id} style={{ borderBottom: '1px solid var(--border)' }} className="row-hover">
                        <td style={{ padding: '0.75rem' }}>
                          <span style={{ background: 'var(--primary)', color: 'var(--primary-foreground)', padding: '0.15rem 0.4rem', borderRadius: '4px', fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase' }}>{def.entityType}</span>
                        </td>
                        <td style={{ padding: '0.75rem', fontSize: '0.85rem', fontWeight: 600 }}>{def.label}</td>
                        <td style={{ padding: '0.75rem', fontSize: '0.75rem', color: 'var(--muted-foreground)', fontFamily: 'monospace' }}>{def.fieldName}</td>
                        <td style={{ padding: '0.75rem' }}>
                          <span style={{ background: 'var(--secondary)', color: 'var(--secondary-foreground)', padding: '0.15rem 0.4rem', borderRadius: '4px', fontSize: '0.6rem', fontWeight: 700 }}>{def.fieldType}</span>
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                            <EditMetadataDialog 
                              definition={def} 
                              onSuccess={() => queryClient.invalidateQueries({ queryKey: ['metadata-definitions'] })} 
                            />
                            <button onClick={() => handleDeleteMeta(def.id)} style={{ border: 'none', background: 'transparent', color: 'var(--destructive)', padding: '0.4rem', cursor: 'pointer' }}>
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ background: 'var(--background)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '1rem' }}>Define New Attribute</h3>
                <form onSubmit={handleAddMeta}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                    <div className="field" style={{ margin: 0 }}>
                      <label className="label">Target Artifact</label>
                      <ColoredSelect
                        value={metaEntity}
                        onChange={setMetaEntity}
                        options={ARTIFACTS.map(art => ({ value: art.id, label: art.label }))}
                        style={{ height: '2rem', fontSize: '0.8rem' }}
                      />
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label className="label">Display Label</label>
                      <input 
                        value={metaLabel}
                        onChange={(e) => {
                          setMetaLabel(e.target.value);
                          if (!metaName) setMetaName(e.target.value.replace(/\s+/g, '_').toLowerCase());
                        }}
                        placeholder="e.g. Support Tier" required 
                        style={{ height: '2rem', fontSize: '0.8rem' }}
                      />
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label className="label">System Property Name</label>
                      <input value={metaName} onChange={(e) => setMetaName(e.target.value)} placeholder="e.g. support_tier" required style={{ height: '2rem', fontSize: '0.8rem' }} />
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label className="label">Input Type</label>
                      <ColoredSelect
                        value={metaType}
                        onChange={setMetaType}
                        options={[
                          { value: 'string', label: 'Text (Short)' },
                          { value: 'textarea', label: 'Text (Long)' },
                          { value: 'number', label: 'Number' },
                          { value: 'range', label: 'Range Slider' },
                          { value: 'date', label: 'Date' },
                          { value: 'boolean', label: 'Boolean (Checkbox)' },
                        ]}
                        style={{ height: '2rem', fontSize: '0.8rem' }}
                      />
                    </div>
                  </div>

                  {metaType === 'range' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem', padding: '1rem', background: 'var(--card)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                      <div className="field" style={{ margin: 0 }}>
                        <label className="label">Min Value</label>
                        <input type="number" value={metaMin} onChange={(e) => setMetaMin(Number(e.target.value))} style={{ height: '2rem', fontSize: '0.8rem' }} />
                      </div>
                      <div className="field" style={{ margin: 0 }}>
                        <label className="label">Max Value</label>
                        <input type="number" value={metaMax} onChange={(e) => setMetaMax(Number(e.target.value))} style={{ height: '2rem', fontSize: '0.8rem' }} />
                      </div>
                      <div className="field" style={{ margin: 0 }}>
                        <label className="label">Scale Color Logic</label>
                        <ColoredSelect
                          value={metaScale}
                          onChange={setMetaScale}
                          options={[
                            { value: 'neutral', label: 'Neutral (Blue)' },
                            { value: 'good-bad', label: 'Good to Bad (Green to Red)' },
                            { value: 'bad-good', label: 'Bad to Good (Red to Green)' },
                            { value: 'low-high', label: 'Low to High (Light to Dark)' },
                            { value: 'importance', label: 'Low to High (Gray to Purple)' },
                          ]}
                          style={{ height: '2rem', fontSize: '0.8rem' }}
                        />
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button type="submit" className="primary" style={{ height: '2.4rem', padding: '0 1.5rem', fontSize: '0.85rem' }}>
                      <Plus size={16} style={{ marginRight: '0.4rem' }} /> Create Attribute
                    </button>
                  </div>
                </form>
              </div>
            </div>
          ) : activeTab === 'time_thresholds' ? (
            <div className="card" style={{ padding: '1.5rem' }}>
              <div style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                  <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
                    Framework
                  </div>
                  <h2 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>TIME Assessment Thresholds</h2>
                  <p style={{ color: 'var(--muted-foreground)', fontSize: '0.85rem', marginTop: '0.35rem' }}>
                    Define the cutoff boundaries for categorizing applications into Invest, Migrate, Tolerate, and Eliminate quadrants.
                  </p>
                </div>
                <button
                  onClick={() => setTimeThresholds(DEFAULT_TIME_THRESHOLDS)}
                  className="secondary"
                  style={{ height: '2.2rem', padding: '0 0.85rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  <RotateCcw size={14} /> Reset Defaults
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(340px, 1fr) 320px', gap: '2rem', alignItems: 'start' }}>
                {/* Sliders and Configuration */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  {/* Technical Fit Cutoff */}
                  <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>Technical Fit Cutoff (X-Axis)</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
                          Score of <strong>{timeThresholds.technicalFit}</strong> and above is classified as <span style={{ color: '#2b8a3e', fontWeight: 700 }}>High Tech Fit</span> (Right side).
                        </div>
                      </div>
                      <div style={{ 
                        fontSize: '1.25rem', fontWeight: 900, minWidth: '42px', height: '36px',
                        background: 'var(--accent)', borderRadius: '8px', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)'
                      }}>
                        {timeThresholds.technicalFit}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '1rem' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted-foreground)' }}>1 (Low)</span>
                      <input 
                        type="range" 
                        min={1} 
                        max={5} 
                        step={1}
                        value={timeThresholds.technicalFit}
                        onChange={(e) => setTimeThresholds({ ...timeThresholds, technicalFit: Number(e.target.value) })}
                        style={{ flex: 1, accentColor: 'var(--primary)', cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted-foreground)' }}>5 (High)</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--muted-foreground)', marginTop: '0.4rem' }}>
                      <span>&lt; {timeThresholds.technicalFit}: Low (Migrate / Eliminate)</span>
                      <span>≥ {timeThresholds.technicalFit}: High (Invest / Tolerate)</span>
                    </div>
                  </div>

                  {/* Functional Fit Cutoff */}
                  <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>Functional Fit Cutoff (Y-Axis)</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
                          Score of <strong>{timeThresholds.functionalFit}</strong> and above is classified as <span style={{ color: '#2b8a3e', fontWeight: 700 }}>High Functional Fit</span> (Top side).
                        </div>
                      </div>
                      <div style={{ 
                        fontSize: '1.25rem', fontWeight: 900, minWidth: '42px', height: '36px',
                        background: 'var(--accent)', borderRadius: '8px', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)'
                      }}>
                        {timeThresholds.functionalFit}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '1rem' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted-foreground)' }}>1 (Low)</span>
                      <input 
                        type="range" 
                        min={1} 
                        max={5} 
                        step={1}
                        value={timeThresholds.functionalFit}
                        onChange={(e) => setTimeThresholds({ ...timeThresholds, functionalFit: Number(e.target.value) })}
                        style={{ flex: 1, accentColor: 'var(--primary)', cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted-foreground)' }}>5 (High)</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--muted-foreground)', marginTop: '0.4rem' }}>
                      <span>&lt; {timeThresholds.functionalFit}: Low (Tolerate / Eliminate)</span>
                      <span>≥ {timeThresholds.functionalFit}: High (Invest / Migrate)</span>
                    </div>
                  </div>

                  {/* Business Criticality Urgency Cutoff */}
                  <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>Business Criticality Urgency Cutoff</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
                          Criticality rating of <strong>{timeThresholds.businessCriticality}</strong> and above elevates strategic urgency and increases bubble visual weighting.
                        </div>
                      </div>
                      <div style={{ 
                        fontSize: '1.25rem', fontWeight: 900, minWidth: '42px', height: '36px',
                        background: 'var(--accent)', borderRadius: '8px', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)'
                      }}>
                        {timeThresholds.businessCriticality}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '1rem' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted-foreground)' }}>1 (Low)</span>
                      <input 
                        type="range" 
                        min={1} 
                        max={5} 
                        step={1}
                        value={timeThresholds.businessCriticality}
                        onChange={(e) => setTimeThresholds({ ...timeThresholds, businessCriticality: Number(e.target.value) })}
                        style={{ flex: 1, accentColor: 'var(--primary)', cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted-foreground)' }}>5 (High)</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--muted-foreground)', marginTop: '0.4rem' }}>
                      <span>&lt; {timeThresholds.businessCriticality}: Standard Operational Priority</span>
                      <span>≥ {timeThresholds.businessCriticality}: Elevated Mission-Critical Attention</span>
                    </div>
                  </div>

                  {/* Application Cost Cutoff */}
                  <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>Cost Alert Cutoff</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
                          Cost rating of <strong>{timeThresholds.cost ?? 4}</strong> and above flags applications as <span style={{ color: '#fd7e14', fontWeight: 700 }}>High Cost</span>, highlighting them for contract reviews and rationalization savings.
                        </div>
                      </div>
                      <div style={{ 
                        fontSize: '1.25rem', fontWeight: 900, minWidth: '42px', height: '36px',
                        background: 'var(--accent)', borderRadius: '8px', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)'
                      }}>
                        {timeThresholds.cost ?? 4}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '1rem' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted-foreground)' }}>1 (Low / Free)</span>
                      <input 
                        type="range" 
                        min={1} 
                        max={5} 
                        step={1}
                        value={timeThresholds.cost ?? 4}
                        onChange={(e) => setTimeThresholds({ ...timeThresholds, cost: Number(e.target.value) })}
                        style={{ flex: 1, accentColor: 'var(--primary)', cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted-foreground)' }}>5 (Very Expensive)</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--muted-foreground)', marginTop: '0.4rem' }}>
                      <span>&lt; {timeThresholds.cost ?? 4}: Standard / Acceptable Run Cost</span>
                      <span>≥ {timeThresholds.cost ?? 4}: Elevated / High TCO (Optimization Target)</span>
                    </div>
                  </div>
                </div>

                {/* Live Matrix Split Preview */}
                <div style={{ background: 'var(--secondary)', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.75rem', color: 'var(--foreground)' }}>
                    Live Matrix Preview
                  </div>
                  <p style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)', margin: '0 0 1rem 0', lineHeight: 1.4 }}>
                    Threshold cutoffs dynamically reclassify applications, scale mission-critical bubbles, and highlight high-cost items.
                  </p>

                  <div style={{ width: '100%', maxWidth: '340px', margin: '0 auto' }}>
                    <TimeMatrix
                      apps={previewApps}
                      thresholds={timeThresholds}
                      aspectRatio="1 / 1"
                      showLegend={true}
                    />
                  </div>

                  <div style={{ marginTop: '0.85rem', padding: '0.65rem', background: 'var(--card)', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '0.7rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--muted-foreground)' }}>Tech Fit Boundary:</span>
                      <strong style={{ color: 'var(--foreground)' }}>≥ {timeThresholds.technicalFit}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--muted-foreground)' }}>Functional Fit Boundary:</span>
                      <strong style={{ color: 'var(--foreground)' }}>≥ {timeThresholds.functionalFit}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--muted-foreground)' }}>Criticality Urgency:</span>
                      <strong style={{ color: 'var(--foreground)' }}>≥ {timeThresholds.businessCriticality} (Enlarges bubble)</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--muted-foreground)' }}>Cost Alert Cutoff:</span>
                      <strong style={{ color: '#fd7e14' }}>≥ {timeThresholds.cost ?? 4} (Amber halo ring)</strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : activeTab === 'branding' ? (
            <div className="card" style={{ padding: '1.5rem' }}>
              <div style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>Global Branding</h2>
                <p style={{ fontSize: '0.85rem', color: 'var(--muted-foreground)', marginTop: '0.35rem' }}>Customize the appearance and title of your enterprise architecture workspace.</p>
              </div>
              <div style={{ background: 'var(--background)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border)', maxWidth: '520px' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '1rem' }}>Application Name / Workspace Logo</h3>
                <div className="field">
                  <label className="label">Brand Name</label>
                  <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.4rem' }}>
                    <input 
                      value={brandName} 
                      onChange={(e) => onUpdateBrand(e.target.value)} 
                      placeholder="e.g. OpenEA or Enterprise Architecture"
                      style={{ height: '2.4rem', fontSize: '0.85rem' }}
                    />
                    <button onClick={() => onUpdateBrand('OpenEA')} className="secondary" style={{ height: '2.4rem', whiteSpace: 'nowrap' }}>
                      Reset
                    </button>
                  </div>
                  <p style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)', marginTop: '0.5rem', margin: 0 }}>
                    Saved for this workspace. The name appears in the header and the browser title on every computer.
                  </p>
                  {brandError && (
                    <p style={{ fontSize: '0.72rem', color: 'var(--destructive, #c92a2a)', marginTop: '0.45rem', marginBottom: 0 }}>{brandError}</p>
                  )}
                </div>
              </div>
            </div>
          ) : activeTab === 'import-export' ? (
            <ImportExportSettings apps={apps} capabilities={capabilities} organizations={organizations} informationObjects={informationObjects} integrations={integrations} onRefresh={onRefresh} />
          ) : activeTab === 'ai' ? (
            <AiProvidersSettings />
          ) : activeTab === 'ai-prompt' ? (
            <AiSystemPromptSettings />
          ) : (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--muted-foreground)', fontSize: '0.9rem' }}>
              Select a configuration category from the sidebar.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
