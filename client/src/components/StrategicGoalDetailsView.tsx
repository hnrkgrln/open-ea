import React, { useMemo } from 'react';
import { Boxes, ChevronLeft, Edit2, Target } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ReferencesList } from './References';
import { nativeFieldEnabled, type NativeFieldId } from '../nativeFields';
import { fetchWorkspaceSettings } from '../workspaceSettings';

interface Props {
  goalId: string | null;
  onBack: () => void;
  onRefresh: () => void;
}

export const StrategicGoalDetailsView = ({ goalId, onBack }: Props) => {
  const navigate = useNavigate();
  const { data: goal, isLoading } = useQuery<any>({
    queryKey: ['strategic-goal', goalId],
    queryFn: () => fetch(`/api/strategic-goals/${goalId}`).then((res) => res.json()),
    enabled: !!goalId && goalId !== 'undefined',
  });
  const { data: allGoals } = useQuery<any[]>({
    queryKey: ['strategic-goals'],
    queryFn: () => fetch('/api/strategic-goals').then((res) => res.json()),
  });
  const { data: workspace } = useQuery({ queryKey: ['workspace'], queryFn: fetchWorkspaceSettings });
  const showField = (id: NativeFieldId) => nativeFieldEnabled(workspace?.disabledNativeFields, id);
  const parent = useMemo(() => allGoals?.find((item) => item.id === goal?.parentId), [allGoals, goal]);
  const children = useMemo(
    () => (allGoals || []).filter((item) => item.parentId === goalId).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
    [allGoals, goalId],
  );

  if (isLoading || !goal || goal.error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '1rem', opacity: 0.8 }}>
        <div className="loading-logo" style={{ fontSize: '1.5rem' }}>OpenEA</div>
        <div className="loading-text" style={{ fontSize: '0.75rem' }}>Retrieving strategic goal...</div>
      </div>
    );
  }

  const required = [...(goal.capabilities || [])].sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--background)' }}>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div className="main-container" style={{ padding: '3rem 2rem 6rem 2rem', maxWidth: '1400px', position: 'relative' }}>
          <button onClick={onBack} style={{ position: 'absolute', top: '3rem', left: '-1rem', background: 'none', border: 'none', padding: '0.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--muted-foreground)', borderRadius: '6px' }} className="row-hover" title="Go Back">
            <ChevronLeft size={24} />
          </button>

          <div style={{ marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '0.65rem', fontWeight: 900, textTransform: 'uppercase', padding: '0.2rem 0.6rem', borderRadius: '4px', background: '#5f3dc4', color: 'white', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Target size={12} /> Strategic Goal
                </span>
              </div>
              <h1 style={{ fontSize: '2.25rem', fontWeight: 800, margin: 0, letterSpacing: '-0.03em' }}>{goal.name}</h1>
              {showField('strategicGoal.description') && (
                <p style={{ fontSize: '1.125rem', color: 'var(--foreground)', lineHeight: 1.6, margin: '1rem 0 0', maxWidth: '900px', opacity: 0.8 }}>
                  {goal.description || 'No description provided for this strategic goal.'}
                </p>
              )}
              {showField('strategicGoal.parent') && parent && (
                <div style={{ marginTop: '1rem' }}>
                  <span onClick={() => navigate(`/strategic-goals/${parent.id}`)} style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', padding: '0.25rem 0.5rem', borderRadius: '4px' }} className="row-hover">
                    <Target size={16} /> Part of <strong>{parent.name}</strong>
                  </span>
                </div>
              )}
            </div>
            <button onClick={() => navigate(`/strategic-goals/${goal.id}/edit`)} className="primary" style={{ height: '3rem', gap: '0.75rem', padding: '0 1.5rem', fontSize: '1rem', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
              <Edit2 size={18} /> Edit Strategic Goal
            </button>
          </div>

          {children.length > 0 && (
            <section style={{ marginBottom: '3rem' }}>
              <h3 style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '1.5rem', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Target size={16} /> Sub-goals
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                {children.map((child) => (
                  <div key={child.id} onClick={() => navigate(`/strategic-goals/${child.id}`)} style={{ cursor: 'pointer', padding: '1.25rem', background: 'var(--card)', borderRadius: '12px', border: '1px solid var(--border)', borderLeft: '4px solid #5f3dc4', display: 'flex', alignItems: 'center', gap: '0.75rem' }} className="row-hover">
                    <Target size={16} style={{ color: '#5f3dc4', flexShrink: 0 }} />
                    <span style={{ fontWeight: 700 }}>{child.name}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {showField('strategicGoal.capabilities') && (
            <section>
              <h3 style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '1.5rem', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Boxes size={16} /> Required Capabilities
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                {required.length > 0 ? required.map((capability: { id: string; name: string }) => (
                  <div key={capability.id} onClick={() => navigate(`/capabilities/${capability.id}`)} style={{ cursor: 'pointer', padding: '1.25rem', background: 'var(--card)', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.75rem' }} className="row-hover">
                    <div style={{ background: 'var(--secondary)', padding: '0.4rem', borderRadius: '8px' }}>
                      <Boxes size={16} />
                    </div>
                    <span style={{ fontWeight: 700 }}>{capability.name}</span>
                  </div>
                )) : (
                  <div style={{ color: 'var(--muted-foreground)', fontSize: '0.875rem', fontStyle: 'italic' }}>This goal does not require any capabilities yet.</div>
                )}
              </div>
            </section>
          )}

          {showField('strategicGoal.references') && (
            <div style={{ marginTop: '3rem' }}>
              <ReferencesList raw={goal.references} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
