import { useState, useEffect } from 'react';
import { Plus, FileText, Link as LinkIcon, Trash2 } from 'lucide-react';
import { API_BASE, mediaUrl } from '../../lib/api';

export default function LaboratoriosTab({ animalId, token }) {
  const [labs, setLabs] = useState([]);
  const [catalogs, setCatalogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [newLab, setNewLab] = useState({ date: '', laboratory_id: '' });
  const [selectedFiles, setSelectedFiles] = useState([]);

  const fetchLabs = async () => {
    try {
      const resLabs = await fetch(`${API_BASE}/animals/${animalId}/lab_results`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (resLabs.ok) setLabs(await resLabs.json());

      const resCat = await fetch(`${API_BASE}/animals/catalogs/laboratories`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (resCat.ok) setCatalogs(await resCat.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchLabs();
  }, [animalId]);

  const handleAdd = async () => {
    if (!selectedFiles.length) return alert("Debes seleccionar al menos un archivo PDF o imagen.");
    if (!newLab.laboratory_id) return alert("Debes seleccionar el tipo de estudio.");

    const formData = new FormData();
    selectedFiles.forEach((file) => formData.append("files", file));

    const params = new URLSearchParams({ laboratory_id: String(newLab.laboratory_id) });
    if (newLab.date) params.set('date', newLab.date);

    setUploading(true);
    try {
      const res = await fetch(`${API_BASE}/animals/${animalId}/lab_results/upload?${params}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });
      if (res.ok) {
        const data = await res.json();
        setNewLab({ date: '', laboratory_id: '' });
        setSelectedFiles([]);
        const fileInput = document.getElementById('labFileInput');
        if (fileInput) fileInput.value = '';
        fetchLabs();
        if (data.errors?.length) {
          alert(`Se subieron ${data.count} archivo(s). Algunos fallaron:\n${data.errors.join('\n')}`);
        }
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.detail || "Error al subir los archivos de laboratorio");
      }
    } catch (err) {
      console.error(err);
      alert("Error de conexión al subir archivos");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("¿Seguro que quieres eliminar este estudio?")) return;
    try {
      const res = await fetch(`${API_BASE}/animals/${animalId}/lab_results/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        fetchLabs();
      } else {
        alert("Error al eliminar el estudio");
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="modal-tab-content">
      {loading ? (
        <div className="modal-tab-loading">Cargando...</div>
      ) : (
        <div className="space-y-6 w-full">
          <div className="bg-gray-50 p-4 rounded-xl space-y-3">
            <h4 className="font-bold text-gray-800 text-sm">Nuevo Resultado de Laboratorio</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Fecha</label>
                <input
                  type="date"
                  value={newLab.date}
                  onChange={(e) => setNewLab({ ...newLab, date: e.target.value })}
                  className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 text-gray-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de Estudio</label>
                <select
                  value={newLab.laboratory_id}
                  onChange={(e) => setNewLab({ ...newLab, laboratory_id: e.target.value })}
                  className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 text-gray-900 bg-white"
                >
                  <option value="">Seleccione un estudio...</option>
                  {catalogs.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Subir archivos PDF o imágenes (varios a la vez)
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="file"
                  id="labFileInput"
                  accept=".pdf,image/*"
                  multiple
                  onChange={(e) => setSelectedFiles(Array.from(e.target.files || []))}
                  className="flex-1 text-sm file:mr-4 file:py-1.5 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 border border-gray-200 rounded-lg p-1 text-gray-900 w-full"
                />
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={uploading}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-1 w-full sm:w-auto disabled:opacity-60 shrink-0"
                >
                  <Plus size={16} /> {uploading ? 'Subiendo...' : 'Subir'}
                </button>
              </div>
              {selectedFiles.length > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  {selectedFiles.length} archivo(s): {selectedFiles.map((f) => f.name).join(', ')}
                </p>
              )}
            </div>
          </div>

          <ul className="space-y-3 w-full">
            {labs.length === 0 && (
              <li className="text-sm text-gray-400 italic text-center py-4">
                No hay laboratorios registrados.
              </li>
            )}
            {labs.map((lab) => (
              <li
                key={lab.id}
                className="bg-white border border-gray-200 p-4 rounded-xl flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 hover:shadow-md transition-shadow w-full"
              >
                <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <FileText size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <h5 className="font-bold text-gray-900 text-sm">
                    {lab.laboratory?.name || 'Estudio de laboratorio'}
                  </h5>
                  <p className="text-xs text-gray-500">Fecha: {lab.date}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={lab.document_url.startsWith('http') ? lab.document_url : `${API_BASE}${lab.document_url}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 bg-blue-50 hover:bg-blue-100 p-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors"
                  >
                    <LinkIcon size={16} /> Ver Archivo
                  </a>
                  <button
                    type="button"
                    onClick={() => handleDelete(lab.id)}
                    className="text-red-600 bg-red-50 hover:bg-red-100 p-2 rounded-lg flex items-center transition-colors"
                    title="Eliminar estudio"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
