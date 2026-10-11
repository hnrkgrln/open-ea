import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Boxes, Database, FileText, Layers, Lightbulb, Network } from 'lucide-react';
import { TIME_OPTIONS, getAppTimeAssessment, type TimeThresholds } from '../App';
import { InventoryChat } from './InventoryChat';

interface Named {
  id: string;
  name: string;
}

interface InsightApp extends Named {
  owner?: string | null;
  ownerOrgId?: string | null;
  ownerOrg?: { name?: string | null } | null;
  lifecycle?: string | null;
  type?: string | null;
  criticality?: string | null;
  cost?: string | null;
  functionalFit?: string | null;
  technicalFit?: string | null;
  contractEndDate?: string | null;
  capabilities?: { id: string }[];
  processedInformationObjects?: InsightInformation[];
}

interface InsightCapability extends Named {
  criticality?: string | null;
  applications?: { id: string }[];
}

interface InsightInformation extends Named {
  confidentiality?: string | null;
  integrity?: string | null;
  availability?: string | null;
  piiCategory?: string | null;
  appOwnerId?: string | null;
  processingApplications?: { id: string }[];
}

interface InsightIntegration {
  sourceAppId?: string | null;
  targetAppId?: string | null;
}

interface Props {
  apps: InsightApp[];
  capabilities: InsightCapability[];
  organizations: Named[];
  informationObjects: InsightInformation[];
  integrations: InsightIntegration[];
  thresholds: TimeThresholds;
}

const ATTENTION_LIMIT = 8;
const CONTRACT_WINDOW_DAYS = 183;
const TIME_ORDER = ['INVEST', 'MIGRATE', 'TOLERATE', 'ELIMINATE'] as const;
const LIFECYCLE_ORDER = ['Mainstream', 'Onboarding', 'Discovery', 'Legacy', 'Decommissioned', 'Not set'];
const LIFECYCLE_COLOR: Record<string, string> = {
  mainstream: '#2b8a3e',
  onboarding: '#6741d9',
  discovery: '#1971c2',
  legacy: '#e67700',
  decommissioned: '#868e96',
  'not set': '#adb5bd',
};
const GAUGE_COLORS = ['#1971c2', '#6741d9', '#0ca678', '#e67700', '#2b8a3e'];
const STAT_ACCENTS = ['#343a40', '#0ca678', '#6741d9', '#1971c2', '#e67700'];
const COST_COLORS = ['#2b8a3e', '#94d82d', '#fab005', '#e67700', '#c92a2a'];
const RISK_COLOR = '#c92a2a';

interface PickOption {
  value: string;
  label: string;
  color?: string | null;
  order?: number;
}

const score = (value: string | null | undefined) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const isDecommissioned = (app: InsightApp) => (app.lifecycle || '').toLowerCase() === 'decommissioned';

const isContractDue = (app: InsightApp) => {
  if (!app.contractEndDate) return false;
  const days = dayDiff(app.contractEndDate);
  return days !== null && days <= CONTRACT_WINDOW_DAYS;
};

const isHighSensitivity = (info: InsightInformation) => {
  const cia = [info.confidentiality, info.integrity, info.availability].some((value) => {
    const parsed = score(value);
    return parsed !== null && parsed >= 4;
  });
  const pii = score(info.piiCategory);
  return cia || (pii !== null && pii >= 3);
};

const recordedScore = (value: string | null | undefined) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const sortScores = (values: Set<string>) => [...values].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));

const dayDiff = (iso: string) => {
  const end = new Date(iso);
  if (Number.isNaN(end.getTime())) return null;
  const today = new Date();
  const utcToday = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const utcEnd = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  return Math.round((utcEnd - utcToday) / 86_400_000);
};

const dueLabel = (days: number) => {
  if (days < 0) {
    const ago = Math.abs(days);
    return ago === 1 ? 'Ended yesterday' : `Ended ${ago} days ago`;
  }
  if (days === 0) return 'Ends today';
  if (days === 1) return 'Ends tomorrow';
  return `Ends in ${days} days`;
};

const costSlices = (counts: Record<string, number>, options: PickOption[]): ChartSlice[] => {
  const known = new Set<string>();
  const ordered = [...options].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const slices: ChartSlice[] = ordered.map((option, index) => {
    const key = String(option.value);
    known.add(key);
    return {
      key,
      label: option.label || key,
      value: counts[key] ?? 0,
      color: option.color || COST_COLORS[index % COST_COLORS.length] || '#868e96',
    };
  });
  if (slices.length === 0) {
    for (let level = 1; level <= 5; level += 1) {
      const key = String(level);
      known.add(key);
      slices.push({ key, label: key, value: counts[key] ?? 0, color: COST_COLORS[level - 1] || '#868e96' });
    }
  }
  for (const [key, value] of Object.entries(counts)) {
    if (key === 'unset' || known.has(key) || value === 0) continue;
    slices.push({ key, label: key, value, color: '#868e96' });
  }
  if ((counts.unset ?? 0) > 0) slices.push({ key: 'unset', label: 'Not set', value: counts.unset ?? 0, color: '#adb5bd' });
  return slices;
};

const cardTitle = (title: string, detail: string) => (
  <div style={{ marginBottom: '0.9rem' }}>
    <h2 style={{ fontSize: '0.95rem', fontWeight: 800, margin: 0 }}>{title}</h2>
    <p style={{ color: 'var(--muted-foreground)', fontSize: '0.75rem', margin: '0.25rem 0 0' }}>{detail}</p>
  </div>
);

export const InsightsView = ({
  apps,
  capabilities,
  organizations,
  informationObjects,
  integrations,
  thresholds,
}: Props) => {
  const navigate = useNavigate();
  const { data: picklists } = useQuery<Array<{ name: string; options?: PickOption[] }>>({
    queryKey: ['picklists'],
    queryFn: async () => {
      const res = await fetch('/api/picklists');
      return res.json();
    },
  });
  const costOptions = picklists?.find((picklist) => picklist.name === 'application_cost')?.options ?? [];

  const model = useMemo(() => {
    const active = apps.filter((app) => !isDecommissioned(app));
    const techCutoff = thresholds.technicalFit ?? 3;
    const costCutoff = thresholds.cost ?? 4;
    const byTime = {
      INVEST: [] as InsightApp[],
      MIGRATE: [] as InsightApp[],
      TOLERATE: [] as InsightApp[],
      ELIMINATE: [] as InsightApp[],
      UNSCORED: [] as InsightApp[],
    };
    for (const app of active) {
      const value = getAppTimeAssessment(app, thresholds)?.value;
      if (value === 'INVEST' || value === 'MIGRATE' || value === 'TOLERATE' || value === 'ELIMINATE') byTime[value].push(app);
      else byTime.UNSCORED.push(app);
    }
    const attention = [...byTime.MIGRATE, ...byTime.TOLERATE, ...byTime.ELIMINATE].sort((a, b) => {
      const byCrit = (score(b.criticality) ?? 0) - (score(a.criticality) ?? 0);
      if (byCrit !== 0) return byCrit;
      return a.name.localeCompare(b.name);
    });
    const contracts = active.flatMap((app) => {
      if (!isContractDue(app) || !app.contractEndDate) return [];
      const days = dayDiff(app.contractEndDate);
      if (days === null) return [];
      return [{ app, days }];
    }).sort((a, b) => a.days - b.days);
    const costCounts: Record<string, number> = {};
    let highCost = 0;
    let lowTech = 0;
    let dataRisk = 0;
    let riskAny = 0;
    let riskMulti = 0;
    const lowTechValues = new Set<string>();
    const highCostValues = new Set<string>();
    const dataRiskIds = new Set<string>();
    for (const info of informationObjects) {
      if (!isHighSensitivity(info)) continue;
      if (info.appOwnerId) dataRiskIds.add(info.appOwnerId);
      for (const app of info.processingApplications ?? []) {
        if (app.id) dataRiskIds.add(app.id);
      }
    }
    for (const app of active) {
      const rawCost = (app.cost ?? '').trim();
      const costKey = rawCost || 'unset';
      costCounts[costKey] = (costCounts[costKey] ?? 0) + 1;
      const high = (recordedScore(rawCost) ?? 1) >= costCutoff;
      const low = (recordedScore(app.technicalFit) ?? techCutoff) < techCutoff;
      const due = isContractDue(app);
      const sensitiveData = dataRiskIds.has(app.id) || (app.processedInformationObjects ?? []).some(isHighSensitivity);
      if (high) {
        highCost += 1;
        highCostValues.add(rawCost || '1');
      }
      if (low && app.technicalFit) {
        lowTech += 1;
        lowTechValues.add(String(app.technicalFit));
      }
      if (sensitiveData) dataRisk += 1;
      const signals = Number(sensitiveData) + Number(low) + Number(due);
      if (signals > 0) riskAny += 1;
      if (signals > 1) riskMulti += 1;
    }
    const sensitive = informationObjects.filter((info) => {
      const confidentiality = score(info.confidentiality);
      const pii = score(info.piiCategory);
      return (confidentiality !== null && confidentiality >= 4) || (pii !== null && pii >= 3);
    }).sort((a, b) => (score(b.confidentiality) ?? 0) - (score(a.confidentiality) ?? 0) || a.name.localeCompare(b.name));
    const unsupported = capabilities
      .filter((capability) => (capability.applications?.length ?? 0) === 0)
      .sort((a, b) => (score(b.criticality) ?? 0) - (score(a.criticality) ?? 0) || a.name.localeCompare(b.name, undefined, { numeric: true }));
    const linkedApps = new Set<string>();
    for (const integration of integrations) {
      if (integration.sourceAppId) linkedApps.add(integration.sourceAppId);
      if (integration.targetAppId) linkedApps.add(integration.targetAppId);
    }
    const filled = (pick: (app: InsightApp) => boolean) => active.filter(pick).length;
    const lifecycleCounts = new Map<string, number>();
    for (const app of apps) {
      const label = (app.lifecycle || '').trim() || 'Not set';
      lifecycleCounts.set(label, (lifecycleCounts.get(label) ?? 0) + 1);
    }
    const lifecycle = [...lifecycleCounts.entries()]
      .map(([label, value]) => ({
        label,
        value,
        color: LIFECYCLE_COLOR[label.toLowerCase()] ?? '#868e96',
      }))
      .sort((a, b) => {
        const rank = (label: string) => {
          const index = LIFECYCLE_ORDER.findIndex((item) => item.toLowerCase() === label.toLowerCase());
          return index === -1 ? 99 : index;
        };
        return rank(a.label) - rank(b.label) || b.value - a.value;
      });
    return {
      activeCount: active.length,
      decommissioned: apps.length - active.length,
      byTime,
      attention,
      contracts,
      costCounts,
      highCost,
      lowTech,
      dataRisk,
      lowTechValues: sortScores(lowTechValues),
      highCostValues: sortScores(highCostValues),
      riskAny,
      riskMulti,
      missingContractDate: active.filter((app) => !app.contractEndDate).length,
      sensitive,
      unsupported,
      linkedApps: linkedApps.size,
      lifecycle,
      completeness: [
        { label: 'Named owner', done: filled((app) => !!app.owner?.trim()) },
        { label: 'Owning organization', done: filled((app) => !!(app.ownerOrgId || app.ownerOrg)) },
        { label: 'Supports a capability', done: filled((app) => (app.capabilities?.length ?? 0) > 0) },
        { label: 'Application type', done: filled((app) => !!app.type?.trim()) },
        { label: 'Lifecycle beyond Discovery', done: filled((app) => {
          const lifecycle = (app.lifecycle || '').trim().toLowerCase();
          return lifecycle !== '' && lifecycle !== 'discovery';
        }) },
      ],
    };
  }, [apps, capabilities, informationObjects, integrations, thresholds]);

  const openInventory = (patch: { time?: string[]; lifecycle?: string[]; cost?: string[]; technicalFit?: string[] }) => {
    localStorage.setItem('openea_inventory_filters', JSON.stringify({
      search: '',
      owner: [] as string[],
      ownerOrgId: [] as string[],
      lifecycle: patch.lifecycle ?? [],
      type: [] as string[],
      criticality: [] as string[],
      cost: patch.cost ?? [],
      functionalFit: [] as string[],
      technicalFit: patch.technicalFit ?? [],
      time: patch.time ?? [],
      custom: {} as Record<string, string[]>,
    }));
    localStorage.setItem('openea_inventory_view', JSON.stringify('list'));
    navigate('/apps');
  };

  const timeTotal = model.activeCount;
  const investCount = model.byTime.INVEST.length;
  const investPct = timeTotal ? Math.round((investCount / timeTotal) * 100) : 0;
  const costCutoff = thresholds.cost ?? 4;
  const techCutoff = thresholds.technicalFit ?? 3;
  const highCostPct = timeTotal ? Math.round((model.highCost / timeTotal) * 100) : 0;
  const riskPct = timeTotal ? Math.round((model.riskAny / timeTotal) * 100) : 0;
  const costs = costSlices(model.costCounts, costOptions);
  const shownAttention = model.attention.slice(0, ATTENTION_LIMIT);
  const hiddenAttention = model.attention.length - shownAttention.length;
  const timeSlices = [
    ...TIME_ORDER.map((value) => {
      const option = TIME_OPTIONS.find((item) => item.value === value);
      return {
        key: value,
        label: option?.label ?? value,
        value: model.byTime[value].length,
        color: option?.color ?? '#868e96',
      };
    }),
    ...(model.byTime.UNSCORED.length > 0 ? [{ key: 'UNSCORED', label: 'Not scored', value: model.byTime.UNSCORED.length, color: '#868e96' }] : []),
  ];

  return (
    <div className="insights-page">
      <div style={{ marginBottom: '1.25rem' }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <Lightbulb size={24} /> Insights
        </h1>
        <p style={{ fontSize: '0.95rem', fontWeight: 650, marginTop: '0.35rem' }}>
          {timeTotal === 0
            ? 'No applications are in use yet.'
            : `${investPct}% of applications in use are Invest. ${model.attention.length} need a different decision.`}
        </p>
        <p style={{ color: 'var(--muted-foreground)', fontSize: '0.75rem', marginTop: '0.2rem' }}>
          TIME treats functional fit {thresholds.functionalFit} and technical fit {thresholds.technicalFit} as high.
        </p>
      </div>

      <InventoryChat />

      <div className="insights-stats">
        <Stat to="/apps" accent={STAT_ACCENTS[0]} icon={<Database size={14} />} label="Applications" value={apps.length} detail={model.decommissioned > 0 ? `${model.decommissioned} decommissioned` : `${model.activeCount} in the portfolio`} />
        <Stat to="/capabilities" accent={STAT_ACCENTS[1]} icon={<Boxes size={14} />} label="Capabilities" value={capabilities.length} detail={model.unsupported.length > 0 ? `${model.unsupported.length} have no application` : 'Each has an application'} />
        <Stat to="/organizations" accent={STAT_ACCENTS[2]} icon={<Layers size={14} />} label="Organizations" value={organizations.length} detail="Accountability hierarchy" />
        <Stat to="/information" accent={STAT_ACCENTS[3]} icon={<FileText size={14} />} label="Information" value={informationObjects.length} detail={model.sensitive.length > 0 ? `${model.sensitive.length} sensitive` : 'No high sensitivity'} />
        <Stat to="/integrations" accent={STAT_ACCENTS[4]} icon={<Network size={14} />} label="Integrations" value={integrations.length} detail={integrations.length > 0 ? `${model.linkedApps} applications linked` : 'None recorded'} />
      </div>

      <div className="insights-split">
        <section className="card" style={{ padding: '1.15rem 1.25rem' }}>
          {cardTitle('TIME disposition', 'Applications still in use. Select a slice to open that set.')}
          <div className="insights-donut">
            <Donut slices={timeSlices} center={timeTotal ? `${investPct}%` : '—'} caption="Invest" />
            <ChartLegend
              items={timeSlices.map((slice) => ({ ...slice, total: timeTotal }))}
              onSelect={(key) => {
                if (key !== 'UNSCORED' && timeSlices.find((slice) => slice.key === key)?.value) openInventory({ time: [key] });
              }}
            />
          </div>
        </section>

        <section className="card" style={{ padding: '1.15rem 1.25rem' }}>
          {cardTitle('Lifecycle', 'Where the portfolio sits, including decommissioned applications.')}
          <div className="insights-donut">
            <Donut slices={model.lifecycle.map((slice) => ({ key: slice.label, ...slice }))} center={String(apps.length)} caption="Applications" />
            <ChartLegend
              items={model.lifecycle.map((slice) => ({ key: slice.label, ...slice, total: apps.length }))}
              onSelect={(key) => {
                if (model.lifecycle.find((slice) => slice.label === key)?.value) openInventory({ lifecycle: [key] });
              }}
            />
          </div>
        </section>
      </div>

      <div className="insights-split">
        <section className="card" style={{ padding: '1.15rem 1.25rem' }}>
          {cardTitle('Cost', `Applications still in use. ${costCutoff} and above is high cost. Select a level to open that set.`)}
          <div className="insights-donut">
            <Donut slices={costs} center={timeTotal ? `${highCostPct}%` : '—'} caption="High cost" />
            <ChartLegend
              items={costs.map((slice) => ({ ...slice, total: timeTotal, navigable: slice.key !== 'unset' }))}
              onSelect={(key) => {
                if (costs.find((slice) => slice.key === key)?.value) openInventory({ cost: [key] });
              }}
            />
          </div>
        </section>

        <section className="card" style={{ padding: '1.15rem 1.25rem' }}>
          {cardTitle('Risk', `Technical fit below ${techCutoff}, high PII or CIA, or a contract ending within 6 months.`)}
          <div className="insights-donut">
            <Donut
              slices={[
                { key: 'risk', label: 'At risk', value: model.riskAny, color: RISK_COLOR },
                { key: 'clear', label: 'Clear', value: Math.max(timeTotal - model.riskAny, 0), color: 'var(--muted)' },
              ]}
              center={timeTotal ? `${riskPct}%` : '—'}
              caption="At risk"
            />
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <RiskMeter
                label="Low technical fit"
                detail={`Technical fit below ${techCutoff}.`}
                value={model.lowTech}
                total={timeTotal}
                color="#e67700"
                onClick={model.lowTechValues.length > 0 ? () => openInventory({ technicalFit: model.lowTechValues }) : undefined}
              />
              <RiskMeter
                label="High PII or CIA"
                detail="Processes or owns information with CIA at 4, or PII at 3 or higher."
                value={model.dataRisk}
                total={timeTotal}
                color="#c92a2a"
              />
              <RiskMeter
                label="Contract ending"
                detail="Ended, or due within 6 months."
                value={model.contracts.length}
                total={timeTotal}
                color="#1971c2"
              />
              {model.riskMulti > 0 && (
                <p style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)', margin: '0.2rem 0.4rem 0' }}>
                  {model.riskMulti} {model.riskMulti === 1 ? 'application is' : 'applications are'} in more than one of these.
                </p>
              )}
            </div>
          </div>
        </section>
      </div>

      <section className="card" style={{ padding: '1.15rem 1.25rem', marginBottom: '0.75rem' }}>
        {cardTitle('Portfolio completeness', `Share of ${model.activeCount} applications still in use that have each fact recorded.`)}
        <div className="insights-gauges">
          {model.completeness.map((item, index) => {
            const pct = model.activeCount ? Math.round((item.done / model.activeCount) * 100) : 0;
            return (
              <RingGauge
                key={item.label}
                pct={pct}
                color={GAUGE_COLORS[index % GAUGE_COLORS.length] ?? '#1971c2'}
                label={item.label}
                caption={`${item.done} of ${model.activeCount}`}
              />
            );
          })}
        </div>
      </section>

      <div className="insights-split">
        <section className="card" style={{ padding: '1.15rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
            {cardTitle('Outside Invest', 'Migrate, Tolerate, and Eliminate, highest criticality first.')}
            {model.attention.length > 0 && (
              <button type="button" className="secondary" onClick={() => openInventory({ time: ['MIGRATE', 'TOLERATE', 'ELIMINATE'] })} style={{ height: '1.8rem', fontSize: '0.72rem', flexShrink: 0 }}>
                Show in inventory
              </button>
            )}
          </div>
          {shownAttention.length === 0 ? (
            <Empty>Every application still in use is Invest at these cutoffs.</Empty>
          ) : shownAttention.map((app) => {
            const time = getAppTimeAssessment(app, thresholds);
            return (
              <Row key={app.id} onClick={() => navigate(`/apps/${app.id}`)}>
                <span>
                  <span style={{ display: 'block', fontWeight: 700, fontSize: '0.82rem' }}>{app.name}</span>
                  <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--muted-foreground)', marginTop: '0.12rem' }}>
                    Criticality {app.criticality || '—'}{app.lifecycle ? ` · ${app.lifecycle}` : ''}
                  </span>
                </span>
                {time && (
                  <span style={{ fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', color: time.color, background: time.bg, border: `1px solid ${time.border}`, borderRadius: 4, padding: '0.12rem 0.4rem', flexShrink: 0 }}>
                    {time.label}
                  </span>
                )}
              </Row>
            );
          })}
          {hiddenAttention > 0 && (
            <p style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)', margin: '0.45rem 0 0' }}>{hiddenAttention} more are also outside Invest.</p>
          )}
        </section>

        <section className="card" style={{ padding: '1.15rem' }}>
          {cardTitle('Capabilities with no application', 'No application is recorded as supporting them.')}
          {model.unsupported.length === 0 ? (
            <Empty>Every capability has at least one supporting application.</Empty>
          ) : model.unsupported.slice(0, ATTENTION_LIMIT).map((capability) => (
            <Row key={capability.id} onClick={() => navigate(`/capabilities/${capability.id}`)}>
              <span style={{ fontWeight: 700, fontSize: '0.82rem', flex: 1, minWidth: 0 }}>{capability.name}</span>
              <span style={{ fontSize: '0.7rem', color: 'var(--muted-foreground)', flexShrink: 0 }}>Criticality {capability.criticality || '—'}</span>
            </Row>
          ))}
          {model.unsupported.length > ATTENTION_LIMIT && (
            <p style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)', margin: '0.45rem 0 0' }}>{model.unsupported.length - ATTENTION_LIMIT} more have no application.</p>
          )}
        </section>
      </div>

      <div className="insights-split">
        <section className="card" style={{ padding: '1.15rem' }}>
          {cardTitle('Contracts due', 'End dates already passed, or inside the next 6 months.')}
          {model.contracts.length === 0 ? (
            <Empty>
              {model.missingContractDate === model.activeCount
                ? 'No application has a contract end date.'
                : `Nothing is due in the next 6 months. ${model.missingContractDate} applications have no contract end date.`}
            </Empty>
          ) : (
            <>
              {model.contracts.map(({ app, days }) => (
                <Row key={app.id} onClick={() => navigate(`/apps/${app.id}`)}>
                  <span style={{ fontWeight: 700, fontSize: '0.82rem' }}>{app.name}</span>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: days < 0 ? '#c92a2a' : '#e67700', flexShrink: 0 }}>{dueLabel(days)}</span>
                </Row>
              ))}
              {model.missingContractDate > 0 && (
                <p style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)', margin: '0.45rem 0 0' }}>{model.missingContractDate} applications have no contract end date.</p>
              )}
            </>
          )}
        </section>

        <section className="card" style={{ padding: '1.15rem' }}>
          {cardTitle('Sensitive information', 'Confidentiality of 4 or higher, or a PII score of 3 or higher.')}
          {model.sensitive.length === 0 ? (
            <Empty>No information object is at this sensitivity.</Empty>
          ) : model.sensitive.map((info) => (
            <Row key={info.id} onClick={() => navigate(`/information/${info.id}`)}>
              <span>
                <span style={{ display: 'block', fontWeight: 700, fontSize: '0.82rem' }}>{info.name}</span>
                <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--muted-foreground)', marginTop: '0.12rem' }}>
                  C {info.confidentiality || '—'} · I {info.integrity || '—'} · A {info.availability || '—'} · PII {info.piiCategory || '—'}
                </span>
              </span>
            </Row>
          ))}
        </section>
      </div>
    </div>
  );
};

type ChartSlice = { key: string; label: string; value: number; color: string };

const Donut = ({ slices, size = 176, thickness = 24, center, caption }: { slices: ChartSlice[]; size?: number; thickness?: number; center: string; caption?: string }) => {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const radius = (size - thickness) / 2 - 1;
  const circumference = 2 * Math.PI * radius;
  const positive = slices.filter((slice) => slice.value > 0);
  const useGap = positive.length > 1;
  const mid = size / 2;
  let cursor = 0;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={positive.map((slice) => `${slice.label}: ${slice.value}`).join(', ') || 'No data'} style={{ flexShrink: 0, display: 'block' }}>
      <circle cx={mid} cy={mid} r={radius} fill="none" stroke="var(--muted)" strokeWidth={thickness} />
      <g transform={`rotate(-90 ${mid} ${mid})`}>
        {positive.map((slice) => {
          const length = total ? (slice.value / total) * circumference : 0;
          const inset = useGap && length > 10 ? 2.4 : 0;
          const draw = Math.max(length - inset, 0.8);
          const dashOffset = -cursor;
          cursor += length;
          return (
            <circle
              key={slice.key}
              cx={mid}
              cy={mid}
              r={radius}
              fill="none"
              stroke={slice.color}
              strokeWidth={thickness}
              strokeDasharray={`${draw} ${circumference - draw}`}
              strokeDashoffset={dashOffset}
            >
              <title>{`${slice.label}: ${slice.value}`}</title>
            </circle>
          );
        })}
      </g>
      <text x={mid} y={caption ? mid - 7 : mid} textAnchor="middle" dominantBaseline="central" fill="var(--foreground)" fontFamily="var(--font-sans)" fontSize={size > 120 ? 28 : 13} fontWeight={800}>
        {center}
      </text>
      {caption && (
        <text x={mid} y={mid + 16} textAnchor="middle" fill="var(--muted-foreground)" fontFamily="var(--font-sans)" fontSize={11} fontWeight={700}>
          {caption}
        </text>
      )}
    </svg>
  );
};

const ChartLegend = ({ items, onSelect }: { items: Array<ChartSlice & { total: number; navigable?: boolean }>; onSelect: (key: string) => void }) => (
  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
    {items.map((item) => {
      const pct = item.total ? Math.round((item.value / item.total) * 100) : 0;
      const canOpen = item.value > 0 && item.navigable !== false;
      return (
        <button
          key={item.key}
          type="button"
          className="row-hover"
          disabled={!canOpen}
          onClick={() => { if (canOpen) onSelect(item.key); }}
          style={{ width: '100%', height: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem', textAlign: 'left', background: 'transparent', border: 'none', borderRadius: 'var(--radius)', padding: '0.32rem 0.4rem', opacity: canOpen ? 1 : 0.45 }}
        >
          <span style={{ width: 9, height: 9, borderRadius: 99, background: item.color, flexShrink: 0 }} />
          <span style={{ fontWeight: 700, fontSize: '0.8rem' }}>{item.label}</span>
          <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--muted-foreground)', fontVariantNumeric: 'tabular-nums' }}>{item.value} · {pct}%</span>
        </button>
      );
    })}
  </div>
);

const RiskMeter = ({ label, detail, value, total, color, onClick }: { label: string; detail: string; value: number; total: number; color: string; onClick?: () => void }) => {
  const pct = total ? Math.round((value / total) * 100) : 0;
  const body = (
    <>
      <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem' }}>
        <span style={{ fontWeight: 700, fontSize: '0.8rem' }}>{label}</span>
        <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', fontVariantNumeric: 'tabular-nums' }}>{value} · {pct}%</span>
      </span>
      <span style={{ display: 'block', height: 8, borderRadius: 99, background: 'var(--muted)', overflow: 'hidden', marginTop: 6 }} aria-hidden="true">
        <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: color, borderRadius: 99, minWidth: value > 0 ? 4 : 0 }} />
      </span>
      <span style={{ display: 'block', fontSize: '0.68rem', color: 'var(--muted-foreground)', marginTop: 4 }}>{detail}</span>
    </>
  );
  if (!onClick) {
    return <div style={{ padding: '0.35rem 0.4rem' }} role="img" aria-label={`${label}: ${value} of ${total}. ${detail}`}>{body}</div>;
  }
  return (
    <button
      type="button"
      className="row-hover"
      onClick={onClick}
      aria-label={`${label}: ${value} of ${total}. ${detail}`}
      style={{ width: '100%', height: 'auto', display: 'block', textAlign: 'left', background: 'transparent', border: 'none', borderRadius: 'var(--radius)', padding: '0.35rem 0.4rem' }}
    >
      {body}
    </button>
  );
};

const RingGauge = ({ pct, color, label, caption }: { pct: number; color: string; label: string; caption: string }) => (
  <div style={{ textAlign: 'center', minWidth: 0 }}>
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <Donut
        slices={[
          { key: 'done', label, value: pct, color },
          { key: 'rest', label: 'Remaining', value: Math.max(100 - pct, 0), color: 'var(--muted)' },
        ]}
        size={86}
        thickness={9}
        center={`${pct}%`}
      />
    </div>
    <div style={{ fontSize: '0.75rem', fontWeight: 700, marginTop: '0.4rem' }}>{label}</div>
    <div style={{ fontSize: '0.68rem', color: 'var(--muted-foreground)', marginTop: '0.1rem' }}>{caption}</div>
  </div>
);

const Stat = ({ to, accent, icon, label, value, detail }: { to: string; accent: string; icon: React.ReactNode; label: string; value: number; detail: string }) => {
  const navigate = useNavigate();
  return (
    <button type="button" className="card row-hover" onClick={() => navigate(to)} style={{ padding: '0.9rem 1rem', textAlign: 'left', height: 'auto', display: 'block', background: 'var(--card)', borderTop: `3px solid ${accent}` }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--muted-foreground)' }}>
        {icon} {label}
      </span>
      <span style={{ display: 'block', fontSize: '1.55rem', fontWeight: 800, letterSpacing: '-0.03em', marginTop: '0.2rem' }}>{value}</span>
      <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--muted-foreground)', marginTop: '0.15rem' }}>{detail}</span>
    </button>
  );
};

const Row = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
  <button type="button" className="row-hover" onClick={onClick} style={{ width: '100%', height: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', textAlign: 'left', background: 'transparent', border: 'none', borderRadius: 'var(--radius)', padding: '0.4rem 0.45rem' }}>
    {children}
  </button>
);

const Empty = ({ children }: { children: React.ReactNode }) => (
  <p style={{ fontSize: '0.78rem', color: 'var(--muted-foreground)', margin: 0 }}>{children}</p>
);
