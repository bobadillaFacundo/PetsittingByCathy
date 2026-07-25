import { useState, useEffect } from 'react';
import { Trash2, Pencil, Plus, Check } from 'lucide-react';
import { API_BASE, mediaUrl } from '../../lib/api';

export default function MedicacionTab({ animalId }) {
  const [medications, setMedications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(null);
  const token = localStorage.getItem('token');

  const emptyMed = {
    medication_name: '',
    dosage: '',
    frequency: '',
    is_current: true,
    amount_per_day: '',
    duration_days: '',
    is_forever: false,
    schedules: ['']
  };

  const [newMed, setNewMed] = useState(emptyMed);

  useEffect(() => {
    fetchMedications();
  }, [animalId]);

  const fetchMedications = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/animals/${animalId}/medications`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setMedications(await res.json());
      }
    } catch (err) {
      console.error(err);
    }
    setIsLoading(false);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!newMed.medication_name || !newMed.dosage || !newMed.frequency) return;

    const payload = {
      ...newMed,
      amount_per_day: newMed.amount_per_day || null,
      duration_days: newMed.duration_days ? parseInt(newMed.duration_days) : null,
      schedules: (newMed.schedules || [])
        .map(t => (t || '').trim().slice(0, 5))
        .filter(t => t !== '')
    };

    try {
      const url = isEditing
        ? `${API_BASE}/animals/${animalId}/medications/${isEditing}`
        : `${API_BASE}/animals/${animalId}/medications`;
      const method = isEditing ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        fetchMedications();
        setIsEditing(null);
        setNewMed(emptyMed);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("¿Eliminar esta medicación?")) return;
    try {
      const res = await fetch(`${API_BASE}/animals/${animalId}/medications/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) fetchMedications();
    } catch (err) {
      console.error(err);
    }
  };

  if (isLoading) return <div className="modal-tab-loading">Cargando...</div>;

  return (
    <div className="space-y-6">
      <form onSubmit={handleSave} className="bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-4">
        <h4 className="font-bold text-gray-800 flex items-center gap-2">
          <Plus size={16} /> {isEditing ? 'Editar Medicación' : 'Añadir Medicación'}
        </h4>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Nombre</label>
            <input 
              type="text" required
              value={newMed.medication_name}
              onChange={e => setNewMed({...newMed, medication_name: e.target.value})}
              className="w-full border rounded-lg p-2.5 text-sm"
              placeholder="Ej. Prednisona"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Dosis (x vez)</label>
            <input 
              type="text" required
              value={newMed.dosage}
              onChange={e => setNewMed({...newMed, dosage: e.target.value})}
              className="w-full border rounded-lg p-2.5 text-sm"
              placeholder="Ej. 1 pastilla / 0.5ml"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Frecuencia</label>
            <input 
              type="text" required
              value={newMed.frequency}
              onChange={e => setNewMed({...newMed, frequency: e.target.value})}
              className="w-full border rounded-lg p-2.5 text-sm"
              placeholder="Ej. Cada 12 horas"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Cantidad x día</label>
            <input 
              type="text"
              value={newMed.amount_per_day}
              onChange={e => setNewMed({...newMed, amount_per_day: e.target.value})}
              className="w-full border rounded-lg p-2.5 text-sm"
              placeholder="Ej. 2 pastillas"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-bold text-gray-700">Horarios Específicos (Opcional, max 4)</label>
          {(newMed.schedules || ['']).map((time, index) => (
            <div key={index} className="flex gap-2 items-center">
              <input
                type="time"
                value={time ? time.slice(0, 5) : ''}
                onChange={e => {
                  const newSchedules = [...(newMed.schedules || [''])];
                  // Normalizar a HH:MM (algunos browsers mandan HH:MM:SS)
                  newSchedules[index] = (e.target.value || '').slice(0, 5);
                  setNewMed({...newMed, schedules: newSchedules});
                }}
                className="w-32 border rounded-lg p-2 text-sm"
              />
              {(newMed.schedules || ['']).length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    const newSchedules = newMed.schedules.filter((_, i) => i !== index);
                    setNewMed({...newMed, schedules: newSchedules});
                  }}
                  className="p-1.5 text-red-500 hover:text-red-700 bg-red-50 rounded-md"
                >
                  <Trash2 size={16} />
                </button>
              )}
              {index === (newMed.schedules || ['']).length - 1 && (newMed.schedules || ['']).length < 4 && (
                <button
                  type="button"
                  onClick={() => {
                    setNewMed({...newMed, schedules: [...(newMed.schedules || ['']), '']});
                  }}
                  className="text-indigo-600 hover:text-indigo-800 flex items-center gap-1 text-xs font-bold px-2 py-1 bg-indigo-50 rounded-md"
                >
                  <Plus size={14} /> Añadir hora
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Días en total</label>
            <input 
              type="number" min="1"
              value={newMed.duration_days}
              onChange={e => setNewMed({...newMed, duration_days: e.target.value, is_forever: false})}
              className="w-full border rounded-lg p-2.5 text-sm"
              placeholder="Ej. 7"
              disabled={newMed.is_forever}
            />
          </div>
          <div className="flex items-center gap-2 h-10">
            <input 
              type="checkbox" id="is_forever"
              checked={newMed.is_forever}
              onChange={e => setNewMed({...newMed, is_forever: e.target.checked, duration_days: e.target.checked ? '' : newMed.duration_days})}
              className="w-4 h-4 text-indigo-600 rounded border-gray-300"
            />
            <label htmlFor="is_forever" className="text-sm font-bold text-gray-700">Por siempre (crónico)</label>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-2">
          <input 
            type="checkbox" id="is_current"
            checked={newMed.is_current}
            onChange={e => setNewMed({...newMed, is_current: e.target.checked})}
            className="w-4 h-4 text-indigo-600 rounded border-gray-300"
          />
          <label htmlFor="is_current" className="text-sm font-bold text-gray-700">Tratamiento actual</label>
        </div>

        <div className="flex gap-2 pt-2">
          <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2">
            <Check size={16} /> Guardar
          </button>
          {isEditing && (
            <button 
              type="button" 
              onClick={() => { setIsEditing(null); setNewMed(emptyMed); }}
              className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-bold"
            >
              Cancelar
            </button>
          )}
        </div>
      </form>

      <div className="space-y-3">
        {medications.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">No hay medicaciones registradas.</p>
        ) : (
          medications.map(m => (
            <div key={m.id} className={`flex justify-between items-center p-4 rounded-xl border ${m.is_current ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-100 opacity-70'}`}>
              <div>
                <h5 className="font-bold text-gray-800 flex items-center gap-2">
                  {m.medication_name}
                  {m.is_current ? (
                    <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full uppercase">Actual</span>
                  ) : (
                    <span className="text-[10px] bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full uppercase">Histórico</span>
                  )}
                </h5>
                <p className="text-xs text-gray-500 mt-1">
                  <span className="font-semibold text-gray-700">Dosis:</span> {m.dosage} | 
                  <span className="font-semibold text-gray-700 ml-1">Frec.:</span> {m.frequency}
                </p>
                {(m.amount_per_day || m.duration_days || m.is_forever || (m.schedules && m.schedules.length > 0)) && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    {m.amount_per_day && <><span className="font-semibold text-gray-700">Cant/día:</span> {m.amount_per_day} | </>}
                    <span className="font-semibold text-gray-700">Duración:</span> {m.is_forever ? 'Por siempre' : `${m.duration_days || '-'} días`}
                    {m.schedules && m.schedules.length > 0 && (
                      <> | <span className="font-semibold text-gray-700">Horarios:</span> {m.schedules.join(', ')}</>
                    )}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => { setIsEditing(m.id); setNewMed({...m, duration_days: m.duration_days || '', amount_per_day: m.amount_per_day || '', schedules: m.schedules?.length > 0 ? m.schedules : ['']}); }}
                  className="p-2 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                >
                  <Pencil size={16} />
                </button>
                <button 
                  onClick={() => handleDelete(m.id)}
                  className="p-2 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
