import { useState, useEffect } from 'react';
import { Plus, Shield, ShieldAlert, CheckCircle, Camera, ScanLine, Link as LinkIcon, Trash2 } from 'lucide-react';
import { API_BASE, mediaUrl } from '../../lib/api';

export default function LibretaTab({ animalId, token }) {
  const [vaccines, setVaccines] = useState([]);
  const [catalogs, setCatalogs] = useState([]);
  const [veterinarians, setVeterinarians] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [scanPreview, setScanPreview] = useState(null);
  const [newVaccine, setNewVaccine] = useState({
    vaccine_id: '',
    date_administered: '',
    next_due_date: '',
    lot_number: '',
    veterinarian_id: ''
  });

  const fetchData = async () => {
    try {
      const [resVac, resCat, resVet] = await Promise.all([
        fetch(`${API_BASE}/animals/${animalId}/vaccines`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`${API_BASE}/animals/catalogs/vaccines`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`${API_BASE}/animals/veterinarians`, { headers: { 'Authorization': `Bearer ${token}` } })
      ]);
      if (resVac.ok) setVaccines(await resVac.json());
      if (resCat.ok) setCatalogs(await resCat.json());
      if (resVet.ok) setVeterinarians(await resVet.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [animalId]);

  const resetForm = () => {
    setNewVaccine({ vaccine_id: '', date_administered: '', next_due_date: '', lot_number: '', veterinarian_id: '' });
    setSelectedFile(null);
    setScanPreview(null);
    const fileInput = document.getElementById('vaccineFileInput');
    if (fileInput) fileInput.value = '';
  };

  const matchVeterinarianId = (name, vets) => {
    if (!name) return '';
    const lower = name.trim().toLowerCase();
    const found = vets.find((v) => v.name.toLowerCase() === lower)
      || vets.find((v) => v.name.toLowerCase().includes(lower) || lower.includes(v.name.toLowerCase()));
    return found ? String(found.id) : '';
  };

  const handleScan = async () => {
    if (!selectedFile) return alert('Selecciona una imagen del certificado o etiqueta de vacuna.');
    const formData = new FormData();
    formData.append('file', selectedFile);
    setScanning(true);
    try {
      const res = await fetch(
        `${API_BASE}/animals/${animalId}/vaccines/scan`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData,
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.detail || 'Error al analizar la imagen');
        return;
      }
      const data = await res.json();
      setScanPreview(data);
      setNewVaccine((prev) => ({
        ...prev,
        vaccine_id: data.vaccine_id ? String(data.vaccine_id) : prev.vaccine_id,
        lot_number: data.lot_number || prev.lot_number,
        date_administered: data.date_administered || prev.date_administered,
        next_due_date: data.next_due_date || prev.next_due_date,
        veterinarian_id: matchVeterinarianId(data.veterinarian_name, veterinarians) || prev.veterinarian_id,
      }));
      if (data.vaccine_name && !data.vaccine_id) {
        alert(`Se detectó "${data.vaccine_name}" pero no coincide con el catálogo. Selecciónala manualmente.`);
      }
      if (data.method && data.method !== 'groq') {
        console.info('Escaneo con fallback:', data.method, data.fallback_from);
      }
    } catch (err) {
      console.error(err);
      alert('Error de conexión al escanear la imagen');
    } finally {
      setScanning(false);
    }
  };

  const handleAdd = async () => {
    if (!newVaccine.vaccine_id) return alert('El nombre de la vacuna es obligatorio.');
    setSaving(true);
    try {
      let res;
      if (selectedFile) {
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('vaccine_id', String(newVaccine.vaccine_id));
        if (newVaccine.date_administered) formData.append('date_administered', newVaccine.date_administered);
        if (newVaccine.next_due_date) formData.append('next_due_date', newVaccine.next_due_date);
        if (newVaccine.lot_number) formData.append('lot_number', newVaccine.lot_number);
        if (newVaccine.veterinarian_id) formData.append('veterinarian_id', String(newVaccine.veterinarian_id));

        res = await fetch(`${API_BASE}/animals/${animalId}/vaccines/with-document`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData,
        });
      } else {
        const payload = {
          vaccine_id: Number(newVaccine.vaccine_id),
          date_administered: newVaccine.date_administered || null,
          next_due_date: newVaccine.next_due_date || null,
          lot_number: newVaccine.lot_number || null,
          veterinarian_id: newVaccine.veterinarian_id ? Number(newVaccine.veterinarian_id) : null,
        };
        res = await fetch(`${API_BASE}/animals/${animalId}/vaccines`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });
      }
      if (res.ok) {
        resetForm();
        fetchData();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.detail || 'Error al guardar la vacuna');
      }
    } catch (err) {
      console.error(err);
      alert('Error de conexión al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Seguro que quieres eliminar esta vacuna?')) return;
    try {
      const res = await fetch(`${API_BASE}/animals/${animalId}/vaccines/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) fetchData();
      else alert('Error al eliminar la vacuna');
    } catch (err) {
      console.error(err);
    }
  };

  const isExpired = (dateString) => {
    if (!dateString) return false;
    return new Date(dateString) < new Date();
  };

  if (loading) {
    return (
      <div className="modal-tab-content">
        <div className="modal-tab-loading">Cargando libreta...</div>
      </div>
    );
  }

  return (
    <div className="modal-tab-content">
      <div className="space-y-6 w-full">
        <div className="bg-gray-50 p-4 rounded-xl space-y-3">
          <h4 className="font-bold text-gray-800 text-sm flex items-center gap-2">
            <Shield size={18} className="text-blue-600" /> Registrar Nueva Vacuna
          </h4>

          <div className="bg-white border border-dashed border-blue-200 rounded-lg p-3 space-y-2">
            <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1">
              <Camera size={14} /> Foto del certificado / etiqueta (opcional)
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="file"
                id="vaccineFileInput"
                accept="image/jpeg,image/png,image/webp,.pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setSelectedFile(file);
                  setScanPreview(null);
                }}
                className="flex-1 text-sm file:mr-4 file:py-1.5 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 border border-gray-200 rounded-lg p-1 text-gray-900 w-full"
              />
              <button
                type="button"
                onClick={handleScan}
                disabled={!selectedFile || scanning}
                className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold flex items-center justify-center gap-1 shrink-0 disabled:opacity-60 w-full sm:w-auto"
              >
                <ScanLine size={16} /> {scanning ? 'Analizando...' : 'Escanear'}
              </button>
            </div>
            {selectedFile && (
              <p className="text-xs text-gray-500">Archivo: {selectedFile.name}</p>
            )}
            {scanPreview?.raw_text && (
              <details className="text-xs text-gray-500">
                <summary className="cursor-pointer text-indigo-600">Texto detectado</summary>
                <pre className="mt-1 whitespace-pre-wrap bg-gray-50 p-2 rounded max-h-32 overflow-y-auto">{scanPreview.raw_text}</pre>
              </details>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Vacuna (ej. Séxtuple, Antirrábica)</label>
              <select value={newVaccine.vaccine_id} onChange={(e) => setNewVaccine({ ...newVaccine, vaccine_id: e.target.value })} className="w-full text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-900 bg-white">
                <option value="">Seleccione una vacuna...</option>
                {catalogs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nº de Lote (opcional)</label>
              <input type="text" value={newVaccine.lot_number} onChange={(e) => setNewVaccine({ ...newVaccine, lot_number: e.target.value })} className="w-full text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-900" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Fecha de Aplicación</label>
              <input type="date" value={newVaccine.date_administered} onChange={(e) => setNewVaccine({ ...newVaccine, date_administered: e.target.value })} className="w-full text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-900" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Próxima Dosis / Vencimiento</label>
              <input type="date" value={newVaccine.next_due_date} onChange={(e) => setNewVaccine({ ...newVaccine, next_due_date: e.target.value })} className="w-full text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-900" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Veterinario que aplicó</label>
            <div className="flex gap-2">
              <select
                value={newVaccine.veterinarian_id}
                onChange={(e) => setNewVaccine({ ...newVaccine, veterinarian_id: e.target.value })}
                className="flex-1 text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-900 bg-white"
              >
                <option value="">Seleccione veterinario (opcional)...</option>
                {veterinarians.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
              <button
                type="button"
                onClick={handleAdd}
                disabled={saving}
                className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-1 disabled:opacity-60"
              >
                <Plus size={16} /> {saving ? 'Guardando...' : 'Añadir'}
              </button>
            </div>
          </div>
        </div>

        <div>
          <h4 className="font-bold text-gray-800 mb-3 text-sm">Historial de Vacunación</h4>
          <ul className="space-y-3">
            {vaccines.length === 0 && <li className="text-sm text-gray-400 italic text-center py-4">No hay vacunas registradas en la libreta.</li>}
            {vaccines.map((v) => {
              const expired = isExpired(v.next_due_date);
              return (
                <li key={v.id} className={`bg-white border p-4 rounded-xl flex items-center gap-4 shadow-sm transition-shadow ${expired ? 'border-red-200 bg-red-50/30' : 'border-gray-200'}`}>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${expired ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                    {expired ? <ShieldAlert size={20} /> : <CheckCircle size={20} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h5 className="font-bold text-gray-900 text-sm">{v.vaccine_catalog?.name || 'Vacuna'}</h5>
                    <p className="text-xs text-gray-500">Aplicada: {v.date_administered} {v.veterinarian_name && `por ${v.veterinarian_name}`}</p>
                    {v.lot_number && <p className="text-[10px] text-gray-400 mt-0.5">Lote: {v.lot_number}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {v.document_url && (
                      <a
                        href={mediaUrl(v.document_url)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 bg-blue-50 hover:bg-blue-100 p-2 rounded-lg flex items-center gap-1 text-xs font-medium transition-colors"
                        title="Ver certificado"
                      >
                        <LinkIcon size={14} /> Foto
                      </a>
                    )}
                    {v.next_due_date && (
                      <div className="text-right">
                        <p className={`text-xs font-medium ${expired ? 'text-red-600' : 'text-gray-500'}`}>
                          {expired ? 'Vencida el' : 'Próxima dosis'}
                        </p>
                        <p className={`text-sm font-bold ${expired ? 'text-red-700' : 'text-gray-800'}`}>
                          {v.next_due_date}
                        </p>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDelete(v.id)}
                      className="text-red-600 bg-red-50 hover:bg-red-100 p-2 rounded-lg flex items-center transition-colors"
                      title="Eliminar vacuna"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
