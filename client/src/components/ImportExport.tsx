import React, { useRef } from 'react';
import { Download, Upload, AlertCircle } from 'lucide-react';

interface ImportExportProps {
  type: 'applications' | 'capabilities';
  onImportSuccess: () => void;
  data: any[];
}

export const ImportExport = ({ type, onImportSuccess, data }: ImportExportProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const exportToCSV = () => {
    if (!data || data.length === 0) return;

    let headers: string[] = [];
    if (type === 'applications') {
      headers = ['id', 'name', 'description', 'owner', 'lifecycle', 'type', 'criticality', 'functionalFit', 'technicalFit', 'metadata', 'capabilityIds'];
    } else {
      headers = ['id', 'name', 'description', 'criticality', 'parentId', 'metadata', 'applicationIds'];
    }

    const csvRows = data.map(item => {
      return headers.map(header => {
        let val = item[header];
        
        // Handle special fields
        if (header === 'capabilityIds' && type === 'applications') {
          val = (item.capabilities || []).map((c: any) => c.id).join(';');
        } else if (header === 'applicationIds' && type === 'capabilities') {
          val = (item.applications || []).map((a: any) => a.id).join(';');
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
    link.setAttribute('download', `${type}_export_${new Date().toISOString().split('T')[0]}.csv`);
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
      const lines = text.split('\n');
      if (lines.length < 2) return;

      const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
      const rows = lines.slice(1).filter(line => line.trim() !== '');

      const importedData = rows.map(line => {
        const values: any[] = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          const nextChar = line[i + 1];

          if (char === '"') {
            if (inQuotes && nextChar === '"') {
              // Escaped quote: "" -> "
              current += '"';
              i++; // Skip the next quote
            } else {
              // Toggle quote mode
              inQuotes = !inQuotes;
            }
          } else if (char === ',' && !inQuotes) {
            values.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        values.push(current.trim());

        const obj: any = {};
        headers.forEach((header, index) => {
          let val = values[index];
          // Remove wrapping quotes if they exist
          if (val && val.startsWith('"') && val.endsWith('"')) {
            val = val.substring(1, val.length - 1);
          }
          obj[header] = val;
        });

        return obj;
      });

      // Process imports
      let successCount = 0;
      let errorCount = 0;

      for (const item of importedData) {
        try {
          const { id, ...payload } = item;
          
          // Handle specific transformations
          if (type === 'applications') {
            payload.capabilityIds = payload.capabilityIds ? payload.capabilityIds.split(';').filter((id: string) => id !== '') : [];
          } else if (type === 'capabilities') {
            payload.applicationIds = payload.applicationIds ? payload.applicationIds.split(';').filter((id: string) => id !== '') : [];
            if (payload.parentId === '') payload.parentId = null;
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
      }

      alert(`Import complete! Success: ${successCount}, Errors: ${errorCount}`);
      onImportSuccess();
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  return (
    <div style={{ display: 'flex', gap: '0.5rem' }}>
      <button onClick={exportToCSV} className="secondary" style={{ height: '2rem', padding: '0 0.75rem', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
        <Download size={14} /> Export CSV
      </button>
      <button onClick={() => fileInputRef.current?.click()} className="secondary" style={{ height: '2rem', padding: '0 0.75rem', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
        <Upload size={14} /> Import CSV
      </button>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleImport}
        accept=".csv"
        style={{ display: 'none' }}
      />
    </div>
  );
};

export const ImportExportSettings = ({ onRefresh, apps, capabilities }: { onRefresh: () => void, apps: any[], capabilities: any[] }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Data Portability</h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>Bulk import and export of your architecture artifacts.</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        <div style={{ padding: '1.25rem', background: 'var(--muted)', borderRadius: 'var(--radius)' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Applications</h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', marginBottom: '1rem' }}>
            Import or export your application inventory. Use CSV format with headers.
          </p>
          <ImportExport type="applications" data={apps} onImportSuccess={onRefresh} />
        </div>
        <div style={{ padding: '1.25rem', background: 'var(--muted)', borderRadius: 'var(--radius)' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Capabilities</h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', marginBottom: '1rem' }}>
            Import or export your business capability map. Maintain hierarchy using parentId.
          </p>
          <ImportExport type="capabilities" data={capabilities} onImportSuccess={onRefresh} />
        </div>
      </div>
      <div style={{ marginTop: '1.5rem', padding: '1rem', borderRadius: 'var(--radius)', border: '1px solid var(--accent)', display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
        <AlertCircle size={20} style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />
        <div style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>
          <strong>Pro tip:</strong> To update existing records, include the <code>id</code> column in your CSV. To create new records, leave the <code>id</code> empty or omit the column.
        </div>
      </div>
    </div>
  );
};
