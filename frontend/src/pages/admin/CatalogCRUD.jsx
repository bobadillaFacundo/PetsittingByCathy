import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, X } from 'lucide-react';

export default function CatalogCRUD({ title, endpoint, columns, formFields, hideCreate, hideDelete }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({});
  const token = localStorage.getItem('token');

  const fetchItems = async () => {
    try {
      const res = await fetch(endpoint, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) setItems(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, [endpoint]);

  const openModal = (item = null) => {
    if (item) {
      setEditingId(item.id);
      setFormData(item);
    } else {
      setEditingId(null);
      const initialData = {};
      formFields.forEach(f => initialData[f.key] = f.defaultValue || '');
      setFormData(initialData);
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const url = editingId ? `${endpoint}/${editingId}` : endpoint;
    const method = editingId ? 'PUT' : 'POST';

    // Parse integers if needed based on formFields type
    const payload = { ...formData };
    formFields.forEach(f => {
      if (f.type === 'number' && payload[f.key]) {
        payload[f.key] = parseInt(payload[f.key], 10);
      }
    });

    try {
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setIsModalOpen(false);
        fetchItems();
      } else {
        alert("Error al guardar: " + await res.text());
      }
    } catch (err) {
      console.error(err);
      alert("Error de conexión");
    }
  };

  const handleDelete = async (id, name) => {
    if (window.confirm(`¿Eliminar ${name}?`)) {
      try {
        const res = await fetch(`${endpoint}/${id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          fetchItems();
        } else {
          alert("Error al eliminar.");
        }
      } catch (err) {
        console.error(err);
      }
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-bold text-gray-900">{title}</h3>
        {!hideCreate && (
          <button onClick={() => openModal()} className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-indigo-700">
            <Plus size={16} /> Nuevo
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-500">Cargando...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="py-3 px-4 font-bold text-gray-600 text-sm">ID</th>
                {columns.map(col => (
                  <th key={col.key} className="py-3 px-4 font-bold text-gray-600 text-sm">{col.label}</th>
                ))}
                <th className="py-3 px-4 font-bold text-gray-600 text-sm text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4 text-sm text-gray-500">#{item.id}</td>
                  {columns.map(col => (
                    <td key={col.key} className="py-3 px-4 text-sm font-medium text-gray-900">
                      {col.render ? col.render(item[col.key], item) : item[col.key]}
                    </td>
                  ))}
                  <td className="py-3 px-4 text-sm text-right space-x-2">
                    <button onClick={() => openModal(item)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg">
                      <Edit2 size={16} />
                    </button>
                    {!hideDelete && (
                      <button onClick={() => handleDelete(item.id, item.name)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg">
                        <Trash2 size={16} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={columns.length + 2} className="py-8 text-center text-gray-500 text-sm">No hay registros.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex justify-center items-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-lg text-gray-800">{editingId ? 'Editar' : 'Nuevo'} Registro</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {formFields.map(f => (
                <div key={f.key}>
                  <label className="block text-sm font-bold text-gray-700 mb-1">{f.label}</label>
                  {f.type === 'select' ? (
                    <select
                      value={formData[f.key] || ''}
                      onChange={e => setFormData({...formData, [f.key]: e.target.value})}
                      className="w-full px-4 py-2 rounded-xl border border-gray-200 text-gray-900 bg-white"
                      required={f.required}
                    >
                      <option value="">Seleccione...</option>
                      {f.options && f.options.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={f.type || 'text'}
                      value={formData[f.key] || ''}
                      onChange={e => setFormData({...formData, [f.key]: e.target.value})}
                      className="w-full px-4 py-2 rounded-xl border border-gray-200 text-gray-900"
                      required={f.required}
                    />
                  )}
                </div>
              ))}
              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 px-4 py-2 bg-gray-100 text-gray-600 font-bold rounded-xl hover:bg-gray-200">
                  Cancelar
                </button>
                <button type="submit" className="flex-1 px-4 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700">
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
