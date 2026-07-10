import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Edit2, Trash2, X } from 'lucide-react';

export default function CatalogCRUD({ title, endpoint, columns, formFields, hideCreate, hideDelete, canDeleteItem }) {
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
      const data = { ...item };
      if (Array.isArray(data.variants)) {
        data.variants = data.variants_text || data.variants.join(', ');
      }
      setFormData(data);
    } else {
      setEditingId(null);
      const initialData = {};
      formFields.forEach(f => initialData[f.key] = f.defaultValue || '');
      setFormData(initialData);
    }
    setIsModalOpen(true);
  };

  useEffect(() => {
    if (!isModalOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isModalOpen]);

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

  const isDeletable = (item) => {
    if (hideDelete) return false;
    if (typeof canDeleteItem === 'function') return canDeleteItem(item);
    return !item.is_required;
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
          const errText = await res.text();
          alert(errText || "Error al eliminar.");
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
                    {item.is_required && (
                      <span className="inline-block mr-2 px-2 py-0.5 text-xs font-bold rounded-lg bg-amber-50 text-amber-700 border border-amber-200">
                        Obligatorio
                      </span>
                    )}
                    <button onClick={() => openModal(item)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg">
                      <Edit2 size={16} />
                    </button>
                    {isDeletable(item) && (
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

      {isModalOpen && createPortal(
        <div
          className="modal-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) setIsModalOpen(false); }}
        >
          <div className="modal-overlay-inner">
            <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
              <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 sticky top-0">
                <h3 className="font-bold text-lg text-gray-800">{editingId ? 'Editar' : 'Nuevo'} Registro</h3>
                <button type="button" onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-2">
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                {formFields.map(f => {
                  const lockName = editingId && formData.is_required && f.key === 'name';
                  return (
                  <div key={f.key}>
                    <label className="block text-sm font-bold text-gray-700 mb-1">{f.label}</label>
                    {f.type === 'select' ? (
                      <select
                        value={formData[f.key] || ''}
                        onChange={e => setFormData({...formData, [f.key]: e.target.value})}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-900 bg-white text-base"
                        required={f.required}
                        disabled={lockName}
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
                        className={`w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-900 text-base ${lockName ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                        required={f.required}
                        readOnly={lockName}
                      />
                    )}
                    {lockName && (
                      <p className="mt-1 text-xs text-amber-700">Este conjunto es obligatorio; solo se pueden editar las variantes.</p>
                    )}
                  </div>
                  );
                })}
                <div className="pt-2 flex gap-3">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 px-4 py-3 bg-gray-100 text-gray-600 font-bold rounded-xl">
                    Cancelar
                  </button>
                  <button type="submit" className="flex-1 px-4 py-3 bg-indigo-600 text-white font-bold rounded-xl">
                    Guardar
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
