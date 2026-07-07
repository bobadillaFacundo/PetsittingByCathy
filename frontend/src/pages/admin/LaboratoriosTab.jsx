import { useState, useEffect } from 'react';
import { Plus, FileText, Link as LinkIcon } from 'lucide-react';

export default function LaboratoriosTab({ animalId, token }) {
  const [labs, setLabs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newLab, setNewLab] = useState({ date: '', title: '' });
  const [selectedFile, setSelectedFile] = useState(null);

  const fetchLabs = async () => {
    try {
      const res = await fetch(`/api/animals/${animalId}/lab_results`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) setLabs(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLabs();
  }, [animalId]);

  const handleAdd = async () => {
    if (!selectedFile) return alert("Debes seleccionar un archivo PDF o imagen.");
    
    const formData = new FormData();
    formData.append("file", selectedFile);
    if (newLab.title) formData.append("title", newLab.title);
    if (newLab.date) formData.append("date", newLab.date);

    try {
      const res = await fetch(`/api/animals/${animalId}/lab_results/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });
      if (res.ok) {
        setNewLab({ date: '', title: '' });
        setSelectedFile(null);
        // Reseteamos el input file
        const fileInput = document.getElementById('labFileInput');
        if (fileInput) fileInput.value = '';
        fetchLabs();
      } else {
        alert("Error al subir el archivo de laboratorio");
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Cargando...</div>;

  return (
    <div className="p-6 space-y-6 overflow-y-auto max-h-[60vh]">
      <div className="bg-gray-50 p-4 rounded-xl space-y-3">
        <h4 className="font-bold text-gray-800 text-sm">Nuevo Resultado de Laboratorio</h4>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Fecha</label>
            <input type="date" value={newLab.date} onChange={e => setNewLab({...newLab, date: e.target.value})} className="w-full text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-900" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Título / Estudio</label>
            <input type="text" placeholder="Ej. Análisis de Sangre" value={newLab.title} onChange={e => setNewLab({...newLab, title: e.target.value})} className="w-full text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-900" />
          </div>
        </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Subir Archivo PDF o Imagen</label>
            <div className="flex gap-2">
              <input type="file" id="labFileInput" accept=".pdf,image/*" onChange={e => setSelectedFile(e.target.files[0])} className="flex-1 text-sm file:mr-4 file:py-1.5 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 border border-gray-200 rounded-lg p-1 text-gray-900" />
              <button onClick={handleAdd} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-1">
                <Plus size={16} /> Subir
              </button>
            </div>
          </div>
        </div>

        <ul className="space-y-3">
          {labs.length === 0 && <li className="text-sm text-gray-400 italic text-center py-4">No hay laboratorios registrados.</li>}
          {labs.map(lab => (
            <li key={lab.id} className="bg-white border border-gray-200 p-4 rounded-xl flex items-center gap-4 hover:shadow-md transition-shadow">
              <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <FileText size={20} />
              </div>
              <div className="flex-1">
                <h5 className="font-bold text-gray-900 text-sm">{lab.title || 'Estudio de laboratorio'}</h5>
                <p className="text-xs text-gray-500">Fecha: {lab.date}</p>
              </div>
              <a href={lab.document_url.startsWith('http') ? lab.document_url : `http://127.0.0.1:8000${lab.document_url}`} target="_blank" rel="noreferrer" className="text-blue-600 bg-blue-50 hover:bg-blue-100 p-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors">
                <LinkIcon size={16} /> Ver Archivo
              </a>
            </li>
          ))}
        </ul>
    </div>
  );
}
