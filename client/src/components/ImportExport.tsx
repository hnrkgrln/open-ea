import React, { useRef, useState } from 'react';
import { Download, Upload, CheckCircle2, XCircle, Loader2, X } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { orderByParent, prepareImportPayload, toCsv, type ArtifactType } from '../portableRecords';

interface ImportExportProps {
  type: ArtifactType;
  onImportSuccess: () => void;
}

const CRC_TABLE = new Uint32Array(256).map((_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});

const crc32 = (bytes: Uint8Array) => {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const zipStored = (files: { name: string; text: string }[]) => {
  const encoder = new TextEncoder();
  const now = new Date();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const name = encoder.encode(file.name);
    const payload = encoder.encode(file.text);
    const checksum = crc32(payload);
    const local = new Uint8Array(30 + name.length + payload.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0x0800, true);
    view.setUint16(10, time, true);
    view.setUint16(12, date, true);
    view.setUint32(14, checksum, true);
    view.setUint32(18, payload.length, true);
    view.setUint32(22, payload.length, true);
    view.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(payload, 30 + name.length);
    parts.push(local);

    const directory = new Uint8Array(46 + name.length);
    const directoryView = new DataView(directory.buffer);
    directoryView.setUint32(0, 0x02014b50, true);
    directoryView.setUint16(4, 20, true);
    directoryView.setUint16(6, 20, true);
    directoryView.setUint16(8, 0x0800, true);
    directoryView.setUint16(12, time, true);
    directoryView.setUint16(14, date, true);
    directoryView.setUint32(16, checksum, true);
    directoryView.setUint32(20, payload.length, true);
    directoryView.setUint32(24, payload.length, true);
    directoryView.setUint16(28, name.length, true);
    directoryView.setUint32(42, offset, true);
    directory.set(name, 46);
    central.push(directory);
    offset += local.length;
  }

  const directorySize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, directorySize, true);
  endView.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end], { type: 'application/zip' });
};

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

interface ImportStatus {
  total: number;
  current: number;
  success: number;
  error: number;
  isFinished: boolean;
}

export const ImportExport = ({ type, onImportSuccess }: ImportExportProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showStatus, setShowStatus] = useState(false);
  const [status, setStatus] = useState<ImportStatus>({
    total: 0,
    current: 0,
    success: 0,
    error: 0,
    isFinished: false
  });

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

      let importedData = dataRows.map(values => {
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
      if (type === 'organizations' || type === 'capabilities') importedData = orderByParent(importedData);

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
          const { id, payload } = prepareImportPayload(type, item);

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

const IMPORT_STEPS = [
  {
    title: 'Capabilities',
    reason: 'Initial hierarchy',
    description: 'Import the business capability map first. Organizations and applications link to it.',
    type: 'capabilities' as const,
    dataKey: 'capabilities' as const,
    file: '01-capabilities.csv',
  },
  {
    title: 'Organizations',
    reason: 'Owner references',
    description: 'Import accountability structures next, including the capabilities each one supports. Later files point at these owners.',
    type: 'organizations' as const,
    dataKey: 'organizations' as const,
    file: '02-organizations.csv',
  },
  {
    title: 'Information Model',
    reason: 'Payload definitions',
    description: 'Import business data objects before integrations use them as payloads.',
    type: 'information-objects' as const,
    dataKey: 'informationObjects' as const,
    file: '03-information.csv',
  },
  {
    title: 'Applications',
    reason: 'Links to owners and capabilities',
    description: 'Import the inventory after the owners and capabilities it refers to.',
    type: 'applications' as const,
    dataKey: 'apps' as const,
    file: '04-applications.csv',
  },
  {
    title: 'Integrations',
    reason: 'Links apps and payloads together',
    description: 'Import last. Each integration needs both applications and a payload.',
    type: 'integrations' as const,
    dataKey: 'integrations' as const,
    file: '05-integrations.csv',
  },
];

export const ImportExportSettings = ({ onRefresh, apps, capabilities, organizations, informationObjects, integrations }: { onRefresh: () => void, apps: any[], capabilities: any[], organizations: any[], informationObjects: any[], integrations: any[] }) => {
  const dataByKey = { apps, capabilities, organizations, informationObjects, integrations };

  const exportAll = () => {
    const files = IMPORT_STEPS.map((step) => ({
      name: step.file,
      text: toCsv(step.type, dataByKey[step.dataKey]),
    }));
    const day = new Date().toISOString().split('T')[0];
    downloadBlob(zipStored(files), `openea_export_${day}.zip`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '1rem', flexWrap: 'wrap', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
        <div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Data Portability</h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)', marginTop: '0.25rem', maxWidth: '40rem' }}>
            The numbered steps are the import order. Export downloads every model at once, as CSV files in one archive.
          </p>
        </div>
        <button onClick={exportAll} className="secondary" style={{ height: '2.2rem', padding: '0 0.85rem', display: 'flex', gap: '0.4rem', alignItems: 'center', fontSize: '0.85rem', flexShrink: 0 }}>
          <Download size={15} /> Export all
        </button>
      </div>

      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
        {IMPORT_STEPS.map((step, index) => {
          const isLast = index === IMPORT_STEPS.length - 1;
          return (
            <li key={step.type} style={{ display: 'grid', gridTemplateColumns: '2.75rem minmax(0, 1fr)', columnGap: '0.85rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }} aria-hidden="true">
                <div style={{
                  width: '2rem',
                  height: '2rem',
                  borderRadius: '999px',
                  background: 'var(--brand-focus)',
                  color: '#fff',
                  display: 'grid',
                  placeItems: 'center',
                  fontWeight: 800,
                  fontSize: '0.85rem',
                  flexShrink: 0,
                  boxShadow: '0 0 0 4px color-mix(in srgb, var(--brand-focus) 16%, transparent)',
                }}>{index + 1}</div>
                {!isLast && (
                  <div style={{ width: '2px', flex: 1, minHeight: '0.75rem', margin: '0.35rem 0', background: 'color-mix(in srgb, var(--brand-focus) 55%, var(--border))' }} />
                )}
              </div>
              <div className="card" style={{ padding: '1rem 1.1rem', marginBottom: isLast ? 0 : '0.35rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--brand-focus)', marginBottom: '0.2rem' }}>{step.reason}</div>
                    <h3 style={{ fontSize: '1rem', fontWeight: 800, letterSpacing: '-0.01em', margin: 0 }}>{step.title}</h3>
                    <p style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)', margin: '0.3rem 0 0' }}>{step.description}</p>
                  </div>
                  <ImportExport type={step.type} onImportSuccess={onRefresh} />
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <div style={{ padding: '0.75rem 0.9rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--muted)' }}>
        <p style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)', margin: 0 }}>
          <strong style={{ color: 'var(--foreground)' }}>Updating records.</strong> Include the <code>id</code> column to update existing rows. Leave <code>id</code> empty to create new ones. Relation columns such as <code>ownerOrgId</code>, <code>parentId</code>, and <code>capabilityIds</code> use ids from an earlier step. A blank nullable field clears that value.
        </p>
      </div>
    </div>
  );
};
