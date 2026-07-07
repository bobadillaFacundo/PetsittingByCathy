import { useState, useEffect } from 'react';
import { Plus, Trash2, Calendar, Syringe } from 'lucide-react';

export default function DesparasitacionesTab({ animalId, token }) {
  const [internas, setInternas] = useState([]);
  const [externas, setExternas] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [newInterna, setNewInterna] = useState({ date: '', product_name: '', next_due_date: '' });
  const [newExterna, setNewExterna] = useState({ date: '', product_name: '', next_due_date: '' });

  const fetchDewormings = async () => {
    try {
      const [intRes, extRes] = await Promise.all([
        fetch(`/api/animals/${animalId}/internal_dewormings`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`/api/animals/${animalId}/external_dewormings`, { headers: { 'Authorization': `Bearer ${token}` } })
      ]);
      if (intRes.ok) setInternas(await intRes.json());
      if (extRes.ok) setExternas(await extRes.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDewormings();
  }, [animalId]);

  const handleAdd = async (type, data, resetForm) => {
    if (!data.product_name) return alert("El nombre del producto es obligatorio.");
    const url = type === 'interna' 
      ? `/api/animals/${animalId}/internal_dewormings`
      : `/api/animals/${animalId}/external_dewormings`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(data)
      });
      if (res.ok) {
        resetForm({ date: '', product_name: '', next_due_date: '' });
        fetchDewormings();
      } else {
        alert("Error al guardar la desparasitación");
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Cargando...</div>;

  return (
    <div className="p-6 space-y-8 overflow-y-auto max-h-[60vh]">
      {/* Internas */}
      <div>
        <h4 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
          <Syringe size={18} className="text-indigo-600" /> Desparasitación Interna
        </h4>
        <div className="bg-gray-50 p-4 rounded-xl space-y-3 mb-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Fecha</label>
              <input type="date" value={newInterna.date} onChange={e => setNewInterna({...newInterna, date: e.target.value})} className="w-full text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-900" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Próxima Dosis</label>
              <input type="date" value={newInterna.next_due_date} onChange={e => setNewInterna({...newInterna, next_due_date: e.target.value})} className="w-full text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-900" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Producto</label>
            <div className="flex gap-2">
              <input type="text" placeholder="Ej. Drontal" value={newInterna.product_name} onChange={e => setNewInterna({...newInterna, product_name: e.target.value})} className="flex-1 text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-900" />
              <button onClick={() => handleAdd('interna', newInterna, setNewInterna)} className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-1">
                <Plus size={16} /> Añadir
              </button>
            </div>
          </div>
        </div>
        <ul className="space-y-2">
          {internas.length === 0 && <li className="text-sm text-gray-400 italic">No hay registros</li>}
          {internas.map(item => (
            <li key={item.id} className="bg-white border border-gray-100 p-3 rounded-lg flex justify-between items-center shadow-sm">
              <div>
                <p className="font-bold text-gray-800 text-sm">{item.product_name}</p>
                <p className="text-xs text-gray-500">Realizado: {item.date}</p>
              </div>
              {item.next_due_date && (
                <div className="text-right">
                  <p className="text-xs font-medium text-indigo-600">Próxima:</p>
                  <p className="text-xs font-bold text-indigo-700">{item.next_due_date}</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      <hr className="border-gray-100" />

      {/* Externas */}
      <div>
        <h4 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
          <Syringe size={18} className="text-emerald-600" /> Desparasitación Externa
        </h4>
        <div className="bg-gray-50 p-4 rounded-xl space-y-3 mb-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Fecha</label>
              <input type="date" value={newExterna.date} onChange={e => setNewExterna({...newExterna, date: e.target.value})} className="w-full text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-900" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Próxima Dosis</label>
              <input type="date" value={newExterna.next_due_date} onChange={e => setNewExterna({...newExterna, next_due_date: e.target.value})} className="w-full text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-900" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Producto</label>
            <div className="flex gap-2">
              <input type="text" placeholder="Ej. Nexgard, Bravecto" value={newExterna.product_name} onChange={e => setNewExterna({...newExterna, product_name: e.target.value})} className="flex-1 text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-900" />
              <button onClick={() => handleAdd('externa', newExterna, setNewExterna)} className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-1">
                <Plus size={16} /> Añadir
              </button>
            </div>
          </div>
        </div>
        <ul className="space-y-2">
          {externas.length === 0 && <li className="text-sm text-gray-400 italic">No hay registros</li>}
          {externas.map(item => (
            <li key={item.id} className="bg-white border border-gray-100 p-3 rounded-lg flex justify-between items-center shadow-sm">
              <div>
                <p className="font-bold text-gray-800 text-sm">{item.product_name}</p>
                <p className="text-xs text-gray-500">Realizado: {item.date}</p>
              </div>
              {item.next_due_date && (
                <div className="text-right">
                  <p className="text-xs font-medium text-emerald-600">Próxima:</p>
                  <p className="text-xs font-bold text-emerald-700">{item.next_due_date}</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
