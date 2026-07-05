import { useState, useEffect } from 'react';
import { Pencil, Trash2, Plus, X, Save } from 'lucide-react';

export default function MascotasCRUD() {
  const [mascotas, setMascotas] = useState([]);
  const [speciesList, setSpeciesList] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  
  const [formData, setFormData] = useState({
    name: '',
    species_id: '',
    sex: '',
    is_active: true
  });

  const token = localStorage.getItem('token');

  useEffect(() => {
    fetchMascotas();
    fetchSpecies();
  }, []);

  const fetchMascotas = async () => {
    try {
      const res = await fetch('http://localhost:8000/animals/', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        if (res.status === 401) window.location.href = '/login';
        throw new Error();
      }
      const data = await res.json();
      setMascotas(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSpecies = async () => {
    try {
      const res = await fetch('http://localhost:8000/animals/species', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        if (res.status === 401) window.location.href = '/login';
        throw new Error();
      }
      const data = await res.json();
      setSpeciesList(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    }
  };

  const openModal = (mascota = null) => {
    if (mascota) {
      setEditingId(mascota.id);
      setFormData({
        name: mascota.name,
        species_id: mascota.species_id,
        sex: mascota.sex || '',
        is_active: mascota.is_active
      });
    } else {
      setEditingId(null);
      setFormData({
        name: '',
        species_id: speciesList.length > 0 ? speciesList[0].id : '',
        sex: 'M',
        is_active: true
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const url = editingId 
      ? `http://localhost:8000/animals/${editingId}`
      : `http://localhost:8000/animals/`;
    
    const method = editingId ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        setIsModalOpen(false);
        fetchMascotas();
      } else {
        alert("Error al guardar la mascota. Asegúrate de ser administrador.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id, name) => {
    if (window.confirm(`¿Estás seguro de que deseas eliminar (desactivar) a ${name}?`)) {
      try {
        const res = await fetch(`http://localhost:8000/animals/${id}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        if (res.ok) {
          fetchMascotas();
        } else {
          alert("Error al eliminar la mascota.");
        }
      } catch (err) {
        console.error(err);
      }
    }
  };

  const getSpeciesName = (id) => {
    const s = speciesList.find(x => x.id === id);
    return s ? s.name : 'Desconocida';
  };

  if (isLoading) return <div className="text-center p-8 text-gray-500">Cargando mascotas...</div>;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200">
      {/* Encabezado */}
      <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 rounded-t-2xl">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Directorio de Mascotas</h2>
          <p className="text-sm text-gray-500 mt-1">Gestiona los pacientes de la guardería</p>
        </div>
        <button 
          onClick={() => openModal()}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl font-medium flex items-center gap-2 transition-colors shadow-sm"
        >
          <Plus size={18} /> Nueva Mascota
        </button>
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 text-gray-500 text-sm border-b border-gray-100">
              <th className="px-6 py-4 font-medium">Nombre</th>
              <th className="px-6 py-4 font-medium">Especie</th>
              <th className="px-6 py-4 font-medium">Sexo</th>
              <th className="px-6 py-4 font-medium">Estado</th>
              <th className="px-6 py-4 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {mascotas.map((m) => (
              <tr key={m.id} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-6 py-4 font-medium text-gray-900">{m.name}</td>
                <td className="px-6 py-4 text-gray-600">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">
                    {getSpeciesName(m.species_id)}
                  </span>
                </td>
                <td className="px-6 py-4 text-gray-600">
                  {m.sex === 'M' ? 'Macho' : m.sex === 'F' ? 'Hembra' : 'No definido'}
                </td>
                <td className="px-6 py-4">
                  {m.is_active ? (
                    <span className="inline-flex items-center gap-1 text-sm text-green-600 font-medium">
                      <span className="w-2 h-2 rounded-full bg-green-500"></span> Activo
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-sm text-red-600 font-medium">
                      <span className="w-2 h-2 rounded-full bg-red-500"></span> Inactivo
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 flex justify-end gap-2">
                  <button 
                    onClick={() => openModal(m)}
                    className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                    title="Editar"
                  >
                    <Pencil size={18} />
                  </button>
                  <button 
                    onClick={() => handleDelete(m.id, m.name)}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Dar de baja"
                    disabled={!m.is_active}
                  >
                    <Trash2 size={18} />
                  </button>
                </td>
              </tr>
            ))}
            {mascotas.length === 0 && (
              <tr>
                <td colSpan="5" className="text-center py-8 text-gray-500">
                  No hay mascotas registradas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal / Formulario */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h3 className="text-lg font-bold text-gray-800">
                {editingId ? 'Editar Mascota' : 'Nueva Mascota'}
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 hover:bg-gray-200 p-1 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Nombre</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none bg-gray-50 focus:bg-white text-gray-900"
                  placeholder="Ej. Firulais"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Especie</label>
                <select
                  required
                  value={formData.species_id}
                  onChange={e => setFormData({...formData, species_id: parseInt(e.target.value)})}
                  className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-gray-50 focus:bg-white text-gray-900"
                >
                  <option value="">Seleccione una especie</option>
                  {speciesList.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Sexo</label>
                <select
                  value={formData.sex}
                  onChange={e => setFormData({...formData, sex: e.target.value})}
                  className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-gray-50 focus:bg-white text-gray-900"
                >
                  <option value="">No definido</option>
                  <option value="M">Macho</option>
                  <option value="F">Hembra</option>
                </select>
              </div>

              <div className="flex items-center gap-2 mt-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.is_active}
                  onChange={e => setFormData({...formData, is_active: e.target.checked})}
                  className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                />
                <label htmlFor="isActive" className="text-sm font-medium text-gray-700">
                  Mascota Activa (Aparece en la guardia)
                </label>
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium flex items-center gap-2 shadow-sm transition-colors"
                >
                  <Save size={18} /> {editingId ? 'Guardar Cambios' : 'Crear Mascota'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
