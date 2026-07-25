import { useState, useEffect } from 'react';
import { Plus, Trash2, Calendar, Syringe } from 'lucide-react';
import { API_BASE, mediaUrl } from '../../lib/api';

export default function DesparasitacionesTab({ animalId, token }) {
  const [internas, setInternas] = useState([]);
  const [externas, setExternas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [catalogs, setCatalogs] = useState({ internal: [], external: [] });

  // Form states
  const [newInterna, setNewInterna] = useState({ date: '', product_id: '', next_due_date: '' });
  const [newExterna, setNewExterna] = useState({ date: '', product_id: '', next_due_date: '' });

  const fetchData = async () => {
    try {
      const [resInt, resExt, resCat] = await Promise.all([
        fetch(`${API_BASE}/animals/${animalId}/internal_dewormings`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`${API_BASE}/animals/${animalId}/external_dewormings`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`${API_BASE}/animals/catalogs/products`, { headers: { 'Authorization': `Bearer ${token}` } })
      ]);
      if (resInt.ok) setInternas(await resInt.json());
      if (resExt.ok) setExternas(await resExt.json());
      if (resCat.ok) {
        const products = await resCat.json();
        setCatalogs({
          internal: products.filter(p => p.type === 'INTERNAL'),
          external: products.filter(p => p.type === 'EXTERNAL')
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [animalId]);

  const handleAdd = async (type, data, setter) => {
    if (!data.product_id) return alert("Debes seleccionar un producto.");
    const url = type === 'interna' 
      ? `${API_BASE}/animals/${animalId}/internal_dewormings`
      : `${API_BASE}/animals/${animalId}/external_dewormings`;

    const payload = {
      product_id: Number(data.product_id),
      date: data.date || null,
      next_due_date: data.next_due_date || null,
    };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setter({ date: '', product_id: '', next_due_date: '' });
        fetchData();
      } else {
        alert("Error al guardar la desparasitación");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (type, id, productName) => {
    if (!window.confirm(`¿Eliminar la desparasitación "${productName}"?`)) return;
    const url = type === 'interna'
      ? `${API_BASE}/animals/${animalId}/internal_dewormings/${id}`
      : `${API_BASE}/animals/${animalId}/external_dewormings/${id}`;
    try {
      const res = await fetch(url, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        fetchData();
      } else {
        alert('Error al eliminar la desparasitación');
      }
    } catch (err) {
      console.error(err);
      alert('Error de conexión al eliminar');
    }
  };

  if (loading) return <div className="modal-tab-loading">Cargando...</div>;

  return (
    <div className="space-y-6">
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
              <select value={newInterna.product_id} onChange={e => setNewInterna({...newInterna, product_id: e.target.value})} className="flex-1 text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-900 bg-white">
                <option value="">Seleccione un producto...</option>
                {catalogs.internal.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button onClick={() => handleAdd('interna', newInterna, setNewInterna)} className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-1">
                <Plus size={16} /> Añadir
              </button>
            </div>
          </div>
        </div>
        <ul className="space-y-2">
          {internas.length === 0 && <li className="text-sm text-gray-400 italic">No hay registros</li>}
          {internas.map(item => (
            <li key={item.id} className="bg-white border border-gray-100 p-3 rounded-lg flex justify-between items-center shadow-sm gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-800 text-sm">{item.product?.name || 'Producto Desconocido'}</p>
                <p className="text-xs text-gray-500">Realizado: {item.date}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {item.next_due_date && (
                  <div className="text-right">
                    <p className="text-xs font-medium text-indigo-600">Próxima:</p>
                    <p className="text-xs font-bold text-indigo-700">{item.next_due_date}</p>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => handleDelete('interna', item.id, item.product?.name || 'esta desparasitación')}
                  className="text-red-600 bg-red-50 hover:bg-red-100 p-2 rounded-lg transition-colors"
                  title="Eliminar"
                >
                  <Trash2 size={16} />
                </button>
              </div>
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
              <select value={newExterna.product_id} onChange={e => setNewExterna({...newExterna, product_id: e.target.value})} className="flex-1 text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-900 bg-white">
                <option value="">Seleccione un producto...</option>
                {catalogs.external.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button onClick={() => handleAdd('externa', newExterna, setNewExterna)} className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-1">
                <Plus size={16} /> Añadir
              </button>
            </div>
          </div>
        </div>
        <ul className="space-y-2">
          {externas.length === 0 && <li className="text-sm text-gray-400 italic">No hay registros</li>}
          {externas.map(item => (
            <li key={item.id} className="bg-white border border-gray-100 p-3 rounded-lg flex justify-between items-center shadow-sm gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-800 text-sm">{item.product?.name || 'Producto Desconocido'}</p>
                <p className="text-xs text-gray-500">Realizado: {item.date}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {item.next_due_date && (
                  <div className="text-right">
                    <p className="text-xs font-medium text-emerald-600">Próxima:</p>
                    <p className="text-xs font-bold text-emerald-700">{item.next_due_date}</p>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => handleDelete('externa', item.id, item.product?.name || 'esta desparasitación')}
                  className="text-red-600 bg-red-50 hover:bg-red-100 p-2 rounded-lg transition-colors"
                  title="Eliminar"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
