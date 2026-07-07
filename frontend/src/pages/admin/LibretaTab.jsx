import { useState, useEffect } from 'react';
import { Plus, Shield, ShieldAlert, CheckCircle } from 'lucide-react';

export default function LibretaTab({ animalId, token }) {
  const [vaccines, setVaccines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newVaccine, setNewVaccine] = useState({
    name: '',
    date_administered: '',
    next_due_date: '',
    lot_number: '',
    veterinarian_name: ''
  });

  const fetchVaccines = async () => {
    try {
      const res = await fetch(`/api/animals/${animalId}/vaccines`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) setVaccines(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVaccines();
  }, [animalId]);

  const handleAdd = async () => {
    if (!newVaccine.name) return alert("El nombre de la vacuna es obligatorio.");
    try {
      const res = await fetch(`/api/animals/${animalId}/vaccines`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newVaccine)
      });
      if (res.ok) {
        setNewVaccine({ name: '', date_administered: '', next_due_date: '', lot_number: '', veterinarian_name: '' });
        fetchVaccines();
      } else {
        alert("Error al guardar la vacuna");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const isExpired = (dateString) => {
    if (!dateString) return false;
    return new Date(dateString) < new Date();
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Cargando libreta...</div>;

  return (
    <div className="p-6 space-y-6 overflow-y-auto max-h-[60vh]">
      <div className="bg-gray-50 p-4 rounded-xl space-y-3">
        <h4 className="font-bold text-gray-800 text-sm flex items-center gap-2">
          <Shield size={18} className="text-blue-600" /> Registrar Nueva Vacuna
        </h4>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Vacuna (ej. Séxtuple, Antirrábica)</label>
            <input type="text" value={newVaccine.name} onChange={e => setNewVaccine({...newVaccine, name: e.target.value})} className="w-full text-sm px-3 py-1.5 rounded-lg border border-gray-200" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nº de Lote (opcional)</label>
            <input type="text" value={newVaccine.lot_number} onChange={e => setNewVaccine({...newVaccine, lot_number: e.target.value})} className="w-full text-sm px-3 py-1.5 rounded-lg border border-gray-200" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Fecha de Aplicación</label>
            <input type="date" value={newVaccine.date_administered} onChange={e => setNewVaccine({...newVaccine, date_administered: e.target.value})} className="w-full text-sm px-3 py-1.5 rounded-lg border border-gray-200" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Próxima Dosis / Vencimiento</label>
            <input type="date" value={newVaccine.next_due_date} onChange={e => setNewVaccine({...newVaccine, next_due_date: e.target.value})} className="w-full text-sm px-3 py-1.5 rounded-lg border border-gray-200" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Veterinario que aplicó</label>
          <div className="flex gap-2">
            <input type="text" value={newVaccine.veterinarian_name} onChange={e => setNewVaccine({...newVaccine, veterinarian_name: e.target.value})} className="flex-1 text-sm px-3 py-1.5 rounded-lg border border-gray-200" placeholder="Dr. / Dra." />
            <button onClick={handleAdd} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-1">
              <Plus size={16} /> Añadir
            </button>
          </div>
        </div>
      </div>

      <div>
        <h4 className="font-bold text-gray-800 mb-3 text-sm">Historial de Vacunación</h4>
        <ul className="space-y-3">
          {vaccines.length === 0 && <li className="text-sm text-gray-400 italic text-center py-4">No hay vacunas registradas en la libreta.</li>}
          {vaccines.map(v => {
            const expired = isExpired(v.next_due_date);
            return (
              <li key={v.id} className={`bg-white border p-4 rounded-xl flex items-center gap-4 shadow-sm transition-shadow ${expired ? 'border-red-200 bg-red-50/30' : 'border-gray-200'}`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${expired ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                  {expired ? <ShieldAlert size={20} /> : <CheckCircle size={20} />}
                </div>
                <div className="flex-1">
                  <h5 className="font-bold text-gray-900 text-sm">{v.name}</h5>
                  <p className="text-xs text-gray-500">Aplicada: {v.date_administered} {v.veterinarian_name && `por ${v.veterinarian_name}`}</p>
                  {v.lot_number && <p className="text-[10px] text-gray-400 mt-0.5">Lote: {v.lot_number}</p>}
                </div>
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
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
