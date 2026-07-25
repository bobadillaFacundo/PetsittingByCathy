import { useState, useEffect } from 'react';
import { Plus, Shield, ShieldAlert, CheckCircle, Camera, ScanLine, Link as LinkIcon, Trash2, ListPlus, Save } from 'lucide-react';
import { API_BASE, mediaUrl } from '../../lib/api';

const emptyVaccineForm = () => ({
  vaccine_id: '',
  date_administered: '',
  next_due_date: '',
  lot_number: '',
  veterinarian_id: '',
});

const newPendingRow = (data = {}) => ({
  key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  selected: true,
  vaccine_id: data.vaccine_id ? String(data.vaccine_id) : '',
  date_administered: data.date_administered || '',
  next_due_date: data.next_due_date || '',
  lot_number: data.lot_number || '',
  veterinarian_id: data.veterinarian_id ? String(data.veterinarian_id) : '',
  vaccine_name: data.vaccine_name || '',
});

export default function LibretaTab({ animalId, token }) {
  const [vaccines, setVaccines] = useState([]);
  const [catalogs, setCatalogs] = useState([]);
  const [veterinarians, setVeterinarians] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [scanPreview, setScanPreview] = useState(null);
  const [pendingRows, setPendingRows] = useState([]);
  const [newVaccine, setNewVaccine] = useState(emptyVaccineForm);

  const fetchData = async () => {
    try {
      const [resVac, resCat, resVet] = await Promise.all([
        fetch(`${API_BASE}/animals/${animalId}/vaccines`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE}/animals/catalogs/vaccines`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE}/animals/veterinarians`, { headers: { Authorization: `Bearer ${token}` } }),
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
    setNewVaccine(emptyVaccineForm());
    setPendingRows([]);
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

  const rowsFromScan = (data) => {
    const list = Array.isArray(data.vaccines) && data.vaccines.length
      ? data.vaccines
      : [data];
    return list.map((item) => newPendingRow({
      vaccine_id: item.vaccine_id,
      vaccine_name: item.vaccine_name,
      lot_number: item.lot_number,
      date_administered: item.date_administered,
      next_due_date: item.next_due_date,
      veterinarian_id: matchVeterinarianId(item.veterinarian_name, veterinarians),
    }));
  };

  const handleScan = async () => {
    if (!selectedFile) return alert('Selecciona una imagen del certificado o libreta de vacunas.');
    const formData = new FormData();
    formData.append('file', selectedFile);
    setScanning(true);
    try {
      const res = await fetch(`${API_BASE}/animals/${animalId}/vaccines/scan`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const detail = err.detail;
        const msg = Array.isArray(detail)
          ? detail.map((d) => d.msg || JSON.stringify(d)).join(', ')
          : (typeof detail === 'string' ? detail : 'Error al analizar la imagen');
        alert(msg);
        return;
      }
      const data = await res.json();
      setScanPreview(data);
      const rows = rowsFromScan(data);
      if (!rows.length) {
        alert('No se detectaron vacunas en la imagen.');
        return;
      }
      setPendingRows(rows);
      if (rows.length === 1) {
        setNewVaccine({
          vaccine_id: rows[0].vaccine_id,
          date_administered: rows[0].date_administered,
          next_due_date: rows[0].next_due_date,
          lot_number: rows[0].lot_number,
          veterinarian_id: rows[0].veterinarian_id,
        });
      }
      const unmatched = rows.filter((r) => r.vaccine_name && !r.vaccine_id);
      if (unmatched.length) {
        alert(`Se detectaron ${rows.length} vacuna(s). Revisá las que no coinciden con el catálogo.`);
      } else if (rows.length > 1) {
        alert(`Se detectaron ${rows.length} vacunas. Revisá el lote y guardá todas juntas.`);
      }
    } catch (err) {
      console.error(err);
      alert('Error de conexión al escanear la imagen');
    } finally {
      setScanning(false);
    }
  };

  const addCurrentToBatch = () => {
    if (!newVaccine.vaccine_id) return alert('Seleccioná la vacuna antes de agregar al lote.');
    setPendingRows((prev) => [...prev, newPendingRow(newVaccine)]);
    setNewVaccine(emptyVaccineForm());
  };

  const updatePendingRow = (key, field, value) => {
    setPendingRows((prev) => prev.map((row) => (row.key === key ? { ...row, [field]: value } : row)));
  };

  const removePendingRow = (key) => {
    setPendingRows((prev) => prev.filter((row) => row.key !== key));
  };

  const selectedPending = pendingRows.filter((r) => r.selected && r.vaccine_id);

  const savePendingRows = async () => {
    if (!selectedPending.length) return alert('Agregá al menos una vacuna al lote con nombre seleccionado.');
    setSaving(true);
    try {
      const payload = selectedPending.map((row) => ({
        vaccine_id: Number(row.vaccine_id),
        date_administered: row.date_administered || null,
        next_due_date: row.next_due_date || null,
        lot_number: row.lot_number || null,
        veterinarian_id: row.veterinarian_id ? Number(row.veterinarian_id) : null,
      }));

      let res;
      if (selectedFile) {
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('vaccines', JSON.stringify(payload));
        res = await fetch(`${API_BASE}/animals/${animalId}/vaccines/bulk-with-document`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
      } else {
        res = await fetch(`${API_BASE}/animals/${animalId}/vaccines/bulk`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ vaccines: payload }),
        });
      }

      if (res.ok) {
        const data = await res.json();
        resetForm();
        fetchData();
        if (data.count > 1) {
          alert(`Se guardaron ${data.count} vacunas correctamente.`);
        }
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.detail || 'Error al guardar las vacunas');
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
        headers: { Authorization: `Bearer ${token}` },
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
            <Shield size={18} className="text-blue-600" /> Registrar Vacunas
          </h4>

          <div className="bg-white border border-dashed border-blue-200 rounded-lg p-3 space-y-2">
            <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1">
              <Camera size={14} /> Foto de libreta / certificado (opcional)
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="file"
                id="vaccineFileInput"
                accept="image/jpeg,image/png,image/webp,.pdf"
                onChange={(e) => {
                  setSelectedFile(e.target.files?.[0] || null);
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
            {selectedFile && <p className="text-xs text-gray-500">Archivo: {selectedFile.name}</p>}
            {scanPreview?.count > 1 && (
              <p className="text-xs text-indigo-700 font-medium">
                {scanPreview.count} vacunas detectadas en la imagen
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Vacuna</label>
              <select
                value={newVaccine.vaccine_id}
                onChange={(e) => setNewVaccine({ ...newVaccine, vaccine_id: e.target.value })}
                className="w-full text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-900 bg-white"
              >
                <option value="">Seleccione una vacuna...</option>
                {catalogs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nº de Lote</label>
              <input
                type="text"
                value={newVaccine.lot_number}
                onChange={(e) => setNewVaccine({ ...newVaccine, lot_number: e.target.value })}
                className="w-full text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Fecha de Aplicación</label>
              <input
                type="date"
                value={newVaccine.date_administered}
                onChange={(e) => setNewVaccine({ ...newVaccine, date_administered: e.target.value })}
                className="w-full text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Próxima Dosis / Vencimiento</label>
              <input
                type="date"
                value={newVaccine.next_due_date}
                onChange={(e) => setNewVaccine({ ...newVaccine, next_due_date: e.target.value })}
                className="w-full text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-900"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Veterinario</label>
            <select
              value={newVaccine.veterinarian_id}
              onChange={(e) => setNewVaccine({ ...newVaccine, veterinarian_id: e.target.value })}
              className="w-full text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-900 bg-white"
            >
              <option value="">Seleccione veterinario (opcional)...</option>
              {veterinarians.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={addCurrentToBatch}
              className="flex-1 bg-white border border-blue-300 text-blue-700 px-3 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-1"
            >
              <ListPlus size={16} /> Agregar al lote
            </button>
            <button
              type="button"
              onClick={savePendingRows}
              disabled={saving || !selectedPending.length}
              className="flex-1 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-1 disabled:opacity-60"
            >
              <Save size={16} />
              {saving ? 'Guardando...' : `Guardar ${selectedPending.length || ''} vacuna${selectedPending.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>

        {pendingRows.length > 0 && (
          <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 space-y-3">
            <h4 className="font-bold text-indigo-900 text-sm">
              Lote pendiente ({pendingRows.length})
            </h4>
            <ul className="space-y-3">
              {pendingRows.map((row) => (
                <li key={row.key} className="bg-white border border-indigo-100 rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={row.selected}
                      onChange={(e) => updatePendingRow(row.key, 'selected', e.target.checked)}
                      className="w-4 h-4"
                    />
                    <select
                      value={row.vaccine_id}
                      onChange={(e) => updatePendingRow(row.key, 'vaccine_id', e.target.value)}
                      className="flex-1 text-sm px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-900"
                    >
                      <option value="">Vacuna...</option>
                      {catalogs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <button
                      type="button"
                      onClick={() => removePendingRow(row.key)}
                      className="text-red-500 p-1.5 hover:bg-red-50 rounded-lg"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  {row.vaccine_name && !row.vaccine_id && (
                    <p className="text-[10px] text-amber-700">Detectada: {row.vaccine_name}</p>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <input
                      type="date"
                      value={row.date_administered}
                      onChange={(e) => updatePendingRow(row.key, 'date_administered', e.target.value)}
                      className="text-xs px-2 py-1.5 rounded border border-gray-200 text-gray-900"
                      title="Fecha aplicación"
                    />
                    <input
                      type="date"
                      value={row.next_due_date}
                      onChange={(e) => updatePendingRow(row.key, 'next_due_date', e.target.value)}
                      className="text-xs px-2 py-1.5 rounded border border-gray-200 text-gray-900"
                      title="Próxima dosis"
                    />
                    <input
                      type="text"
                      value={row.lot_number}
                      onChange={(e) => updatePendingRow(row.key, 'lot_number', e.target.value)}
                      placeholder="Lote"
                      className="text-xs px-2 py-1.5 rounded border border-gray-200 text-gray-900"
                    />
                    <select
                      value={row.veterinarian_id}
                      onChange={(e) => updatePendingRow(row.key, 'veterinarian_id', e.target.value)}
                      className="text-xs px-2 py-1.5 rounded border border-gray-200 bg-white text-gray-900"
                    >
                      <option value="">Vet...</option>
                      {veterinarians.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <h4 className="font-bold text-gray-800 mb-3 text-sm">Historial de Vacunación</h4>
          <ul className="space-y-3">
            {vaccines.length === 0 && (
              <li className="text-sm text-gray-400 italic text-center py-4">No hay vacunas registradas en la libreta.</li>
            )}
            {vaccines.map((v) => {
              const expired = isExpired(v.next_due_date);
              return (
                <li
                  key={v.id}
                  className={`bg-white border p-4 rounded-xl flex items-center gap-4 shadow-sm ${expired ? 'border-red-200 bg-red-50/30' : 'border-gray-200'}`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${expired ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                    {expired ? <ShieldAlert size={20} /> : <CheckCircle size={20} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h5 className="font-bold text-gray-900 text-sm">{v.vaccine_catalog?.name || 'Vacuna'}</h5>
                    <p className="text-xs text-gray-500">
                      Aplicada: {v.date_administered} {v.veterinarian_name && `por ${v.veterinarian_name}`}
                    </p>
                    {v.lot_number && <p className="text-[10px] text-gray-400 mt-0.5">Lote: {v.lot_number}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {v.document_url && (
                      <a
                        href={mediaUrl(v.document_url)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 bg-blue-50 hover:bg-blue-100 p-2 rounded-lg flex items-center gap-1 text-xs font-medium"
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
                      className="text-red-600 bg-red-50 hover:bg-red-100 p-2 rounded-lg"
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
