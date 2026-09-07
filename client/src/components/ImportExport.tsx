import React, { useRef, useState } from 'react';
import { Download, Upload, AlertCircle, CheckCircle2, XCircle, Loader2, X } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';

interface Application {
  id: string;
  name: string;
  capabilities?: { id: string }[];
  metadata?: string;
  lifecycle: string;
  [key: string]: any;
}

interface Capability {
  id: string;
  name: string;
  applications?: { id: string }[];
  metadata?: string;
  [key: string]: any;
}

interface Organization {
  id: string;
  name: string;
  [key: string]: any;
}

interface InformationObject {
  id: string;
  name: string;
  [key: string]: any;
}

interface Integration {
  id: string;
  sourceAppId: string;
  targetAppId: string;
  infoObjectId?: string | null;
  pattern?: string;
  frequency?: string;
  crud?: string;
  [key: string]: any;
}

interface ImportExportProps {
  type: 'applications' | 'capabilities' | 'organizations' | 'information-objects' | 'integrations';
  onImportSuccess: () => void;
  data: any[];
}

interface ImportStatus {
  total: number;
  current: number;
  success: number;
  error: number;
  isFinished: boolean;
}

export const ImportExport = ({ type, onImportSuccess, data }: ImportExportProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showStatus, setShowStatus] = useState(false);
  const [status, setStatus] = useState<ImportStatus>({
    total: 0,
    current: 0,
    success: 0,
    error: 0,
    isFinished: false
  });

  const exportToCSV = () => {
    if (!data || data.length === 0) return;

    let headers: string[] = [];
    if (type === 'applications') {
      headers = ['id', 'name', 'description', 'owner', 'lifecycle', 'lifecycleStartDate', 'lifecycleEndDate', 'contractStartDate', 'contractEndDate', 'contractDetails', 'type', 'criticality', 'cost', 'functionalFit', 'technicalFit', 'metadata', 'capabilityIds'];
    } else if (type === 'capabilities') {
      headers = ['id', 'name', 'description', 'criticality', 'parentId', 'metadata', 'applicationIds'];
    } else if (type === 'organizations') {
      headers = ['id', 'name', 'description', 'type', 'parentId'];
    } else if (type === 'information-objects') {
      headers = ['id', 'name', 'aliases', 'description', 'confidentiality', 'integrity', 'availability', 'piiCategory', 'type', 'businessOwnerId', 'appOwnerId', 'metadata'];
    } else {
      headers = ['id', 'name', 'sourceAppId', 'targetAppId', 'infoObjectId', 'pattern', 'frequency', 'crud'];
    }

    const csvRows = data.map(item => {
      return headers.map(header => {
        let val = (item as any)[header];
        
        // Handle special fields
        if (header === 'capabilityIds' && type === 'applications') {
          val = ((item as Application).capabilities || []).map(c => c.id).join(';');
        } else if (header === 'applicationIds' && type === 'capabilities') {
          val = ((item as Capability).applications || []).map(a => a.id).join(';');
        } else if ((header === 'lifecycleStartDate' || header === 'lifecycleEndDate' || header === 'contractStartDate' || header === 'contractEndDate') && val) {
          val = val.split('T')[0];
        }
        
        const escaped = ('' + (val || '')).replace(/"/g, '""');
        return `"${escaped}"`;
      }).join(',');
    });

    const csvContent = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const filenameType = type === 'information-objects' ? 'information' : type;
    link.setAttribute('download', `${filenameType}_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      
      // Robust CSV Parser handling quotes and newlines within fields
      const rows: string[][] = [];
      let currentRow: string[] = [];
      let currentCell = '';
      let inQuotes = false;
      
      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];

        if (char === '"') {
          if (inQuotes && nextChar === '"') {
            // Escaped quote
            currentCell += '"';
            i++; // skip next quote
          } else {
            // Toggle quote state
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          // End of cell
          currentRow.push(currentCell.trim());
          currentCell = '';
        } else if ((char === '\n' || (char === '\r' && nextChar === '\n')) && !inQuotes) {
          // End of row
          if (char === '\r') i++; // skip \n
          currentRow.push(currentCell.trim());
          if (currentRow.some(cell => cell !== '')) {
            rows.push(currentRow);
          }
          currentRow = [];
          currentCell = '';
        } else {
          currentCell += char;
        }
      }
      // Push the very last cell/row if file doesn't end with newline
      if (currentCell || currentRow.length > 0) {
        currentRow.push(currentCell.trim());
        if (currentRow.some(cell => cell !== '')) {
          rows.push(currentRow);
        }
      }

      if (rows.length < 2) return;

      const headers = rows[0].map(h => h.replace(/^"|"$/g, ''));
      const dataRows = rows.slice(1);

      const importedData = dataRows.map(values => {
        const obj: any = {};
        headers.forEach((header, index) => {
          let val = values[index];
          if (val && val.startsWith('"') && val.endsWith('"')) {
            val = val.substring(1, val.length - 1);
          }
          obj[header] = val;
        });
        return obj;
      });

      // Initialize status
      setStatus({
        total: importedData.length,
        current: 0,
        success: 0,
        error: 0,
        isFinished: false
      });
      setShowStatus(true);

      // Process imports
      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < importedData.length; i++) {
        const item = importedData[i];
        try {
          const { id, ...payload } = item;
          
          // Handle specific transformations
          if (type === 'applications') {
            payload.capabilityIds = payload.capabilityIds ? payload.capabilityIds.split(';').filter((id: string) => id !== '') : [];
            if (payload.lifecycleStartDate) payload.lifecycleStartDate = new Date(payload.lifecycleStartDate).toISOString();
            if (payload.lifecycleEndDate) payload.lifecycleEndDate = new Date(payload.lifecycleEndDate).toISOString();
            if (payload.contractStartDate) payload.contractStartDate = new Date(payload.contractStartDate).toISOString();
            if (payload.contractEndDate) payload.contractEndDate = new Date(payload.contractEndDate).toISOString();
            if (!payload.contractDetails) payload.contractDetails = payload.contractDetails || null;
          } else if (type === 'capabilities') {
            payload.applicationIds = payload.applicationIds ? payload.applicationIds.split(';').filter((id: string) => id !== '') : [];
            if (payload.parentId === '') payload.parentId = null;
          } else if (type === 'organizations') {
            if (payload.parentId === '') payload.parentId = null;
          } else if (type === 'information-objects') {
             if (payload.businessOwnerId === '') payload.businessOwnerId = null;
             if (payload.appOwnerId === '') payload.appOwnerId = null;
          } else if (type === 'integrations') {
             if (payload.infoObjectId === '') payload.infoObjectId = null;
          }

          // Decide method and handle potentially missing records
          let res;
          if (id && id.trim() !== '') {
            // Try update first
            res = await fetch(`/api/${type}/${id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });

            // If not found, try to create with this ID
            if (res.status === 404 || !res.ok) {
              res = await fetch(`/api/${type}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...payload, id }),
              });
            }
          } else {
            // Standard create
            res = await fetch(`/api/${type}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });
          }

          if (res.ok) successCount++;
          else {
            const errBody = await res.text();
            console.error(`Import failed for item: ${item.name || item.id}`, errBody);
            errorCount++;
          }
        } catch (err) {
          console.error('Import error for item:', item, err);
          errorCount++;
        }

        // Update progress
        setStatus(prev => ({
          ...prev,
          current: i + 1,
          success: successCount,
          error: errorCount
        }));
      }

      setStatus(prev => ({ ...prev, isFinished: true }));
      onImportSuccess();
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const progressPercentage = status.total > 0 ? Math.round((status.current / status.total) * 100) : 0;

  return (
    <>
      <div style={{ display: 'flex', gap: '0.4rem' }}>
        <button onClick={exportToCSV} className="secondary" style={{ height: '1.8rem', padding: '0 0.6rem', display: 'flex', gap: '0.35rem', alignItems: 'center', fontSize: '0.8rem' }}>
          <Download size={13} /> Export CSV
        </button>
        <button onClick={() => fileInputRef.current?.click()} className="secondary" style={{ height: '1.8rem', padding: '0 0.6rem', display: 'flex', gap: '0.35rem', alignItems: 'center', fontSize: '0.8rem' }}>
          <Upload size={13} /> Import CSV
        </button>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleImport}
          accept=".csv"
          style={{ display: 'none' }}
        />
      </div>

      <Dialog.Root open={showStatus} onOpenChange={(open) => { if (!open && status.isFinished) setShowStatus(false); }}>
        <Dialog.Portal>
          <Dialog.Overlay style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200 }} />
          <Dialog.Content style={{ 
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            width: '90vw', maxWidth: '380px', background: 'var(--card)', color: 'var(--card-foreground)', 
            padding: '1.25rem', borderRadius: 'var(--radius)', zIndex: 250, border: '1px solid var(--border)',
            boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.25)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <Dialog.Title style={{ fontWeight: 700, fontSize: '1rem' }}>
                {status.isFinished ? 'Import Complete' : `Importing ${type}...`}
              </Dialog.Title>
              {status.isFinished && (
                <Dialog.Close asChild>
                  <button style={{ border: 'none', background: 'transparent', padding: '0.2rem', cursor: 'pointer' }}><X size={16} /></button>
                </Dialog.Close>
              )}
            </div>
            <Dialog.Description style={{ display: 'none' }}>Data import progress and summary.</Dialog.Description>

            {!status.isFinished ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                  <span>Processing item {status.current} of {status.total}</span>
                  <span>{progressPercentage}%</span>
                </div>
                <div style={{ height: '6px', background: 'var(--secondary)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div 
                    style={{ 
                      height: '100%', 
                      background: 'var(--primary)', 
                      width: `${progressPercentage}%`, 
                      transition: 'width 0.2s ease-out' 
                    }} 
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'center', color: 'var(--muted-foreground)', fontSize: '0.8rem' }}>
                  <Loader2 size={14} className="spin" />
                  <span>Please wait, do not close this window...</span>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div style={{ padding: '0.75rem', background: 'var(--muted)', borderRadius: 'var(--radius)', textAlign: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', color: 'var(--primary)', marginBottom: '0.4rem' }}>
                      <CheckCircle2 size={18} />
                      <strong style={{ fontSize: '1.1rem' }}>{status.success}</strong>
                    </div>
                    <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 600, color: 'var(--muted-foreground)' }}>Success</span>
                  </div>
                  <div style={{ padding: '0.75rem', background: 'var(--muted)', borderRadius: 'var(--radius)', textAlign: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', color: status.error > 0 ? 'var(--destructive)' : 'var(--muted-foreground)', marginBottom: '0.4rem' }}>
                      <XCircle size={18} />
                      <strong style={{ fontSize: '1.1rem' }}>{status.error}</strong>
                    </div>
                    <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 600, color: 'var(--muted-foreground)' }}>Failed</span>
                  </div>
                </div>
                {status.error > 0 && (
                  <p style={{ fontSize: '0.7rem', color: 'var(--muted-foreground)', textAlign: 'center' }}>
                    Check the browser console for details on failed items.
                  </p>
                )}
                <button 
                  onClick={() => setShowStatus(false)} 
                  className="primary" 
                  style={{ width: '100%', marginTop: '0.4rem', height: '2rem', fontSize: '0.85rem' }}
                >
                  Close
                </button>
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
};

export const ImportExportSettings = ({ onRefresh, apps, capabilities, organizations, informationObjects, integrations }: { onRefresh: () => void, apps: any[], capabilities: any[], organizations: any[], informationObjects: any[], integrations: any[] }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Data Portability</h2>
        <p style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)' }}>Bulk import and export of your architecture artifacts.</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
        <div style={{ padding: '1rem', background: 'var(--muted)', borderRadius: 'var(--radius)' }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.4rem' }}>Applications</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)', marginBottom: '0.75rem' }}>
            Import or export your application inventory.
          </p>
          <ImportExport type="applications" data={apps} onImportSuccess={onRefresh} />
        </div>
        <div style={{ padding: '1rem', background: 'var(--muted)', borderRadius: 'var(--radius)' }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.4rem' }}>Capabilities</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)', marginBottom: '0.75rem' }}>
            Import or export your business capability map.
          </p>
          <ImportExport type="capabilities" data={capabilities} onImportSuccess={onRefresh} />
        </div>
        <div style={{ padding: '1rem', background: 'var(--muted)', borderRadius: 'var(--radius)' }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.4rem' }}>Organizations</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)', marginBottom: '0.75rem' }}>
            Import or export accountability structures.
          </p>
          <ImportExport type="organizations" data={organizations} onImportSuccess={onRefresh} />
        </div>
        <div style={{ padding: '1rem', background: 'var(--muted)', borderRadius: 'var(--radius)' }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.4rem' }}>Information Model</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)', marginBottom: '0.75rem' }}>
            Import or export conceptual business data objects.
          </p>
          <ImportExport type="information-objects" data={informationObjects} onImportSuccess={onRefresh} />
        </div>
        <div style={{ padding: '1rem', background: 'var(--muted)', borderRadius: 'var(--radius)' }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.4rem' }}>Integrations</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)', marginBottom: '0.75rem' }}>
            Import or export system-to-system dependencies.
          </p>
          <ImportExport type="integrations" data={integrations} onImportSuccess={onRefresh} />
        </div>
      </div>
      <div style={{ marginTop: '1rem', padding: '1rem', borderRadius: 'var(--radius)', background: 'var(--accent)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
          <AlertCircle size={18} style={{ color: 'var(--primary)' }} />
          <strong style={{ fontSize: '0.8rem' }}>Recommended Import Sequence</strong>
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--foreground)', lineHeight: 1.4 }}>
          To correctly restore all relationships between your data, please import files in this specific order:
          <ol style={{ marginTop: '0.4rem', paddingLeft: '1.25rem' }}>
            <li><strong>Organizations</strong> (Owner references)</li>
            <li><strong>Capabilities</strong> (Initial hierarchy)</li>
            <li><strong>Information Model</strong> (Payload definitions)</li>
            <li><strong>Applications</strong> (Links to owners and capabilities)</li>
            <li><strong>Integrations</strong> (Links apps and payloads together)</li>
          </ol>
        </div>
      </div>

      <div style={{ marginTop: '0.75rem', padding: '0.75rem', borderRadius: 'var(--radius)', border: '1px solid var(--accent)', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
        <div style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)' }}>
          <strong>Pro tip:</strong> To update existing records, include the <code>id</code> column in your CSV. To create new records, leave the <code>id</code> empty or omit the column.
        </div>
      </div>
    </div>
  );
};
