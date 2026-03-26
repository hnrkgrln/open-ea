import React, { useRef } from 'react';
import { Download, Upload, FileText, AlertCircle } from 'lucide-react';

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
        // Simple CSV parser that handles quotes
        const values: any[] = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            inQuotes = !inQuotes;
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
          const val = values[index]?.replace(/^"|"$/g, '').replace(/""/g, '"');
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
          if (type === 'applications' && payload.capabilityIds) {
            payload.capabilityIds = payload.capabilityIds.split(';').filter((id: string) => id !== '');
          } else if (type === 'capabilities' && payload.applicationIds) {
            payload.applicationIds = payload.applicationIds.split(';').filter((id: string) => id !== '');
          }

          const method = id ? 'PUT' : 'POST';
          const url = id ? `/api/${type}/${id}` : `/api/${type}`;

          const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

          if (res.ok) successCount++;
          else errorCount++;
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
    <div className="card" style={{ marginTop: '2rem' }}>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <FileText size={24} /> Data Portability
      </h2>
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
