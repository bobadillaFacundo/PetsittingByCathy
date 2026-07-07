import { useState, useEffect } from 'react';
import { Pencil, Trash2, Plus, X, Save, Syringe, FileText, UserCircle, BookHeart } from 'lucide-react';
import DesparasitacionesTab from './DesparasitacionesTab';
import LaboratoriosTab from './LaboratoriosTab';
import LibretaTab from './LibretaTab';

export default function MascotasCRUD() {
  const [mascotas, setMascotas] = useState([]);
  const [speciesList, setSpeciesList] = useState([]);
  const [breedsList, setBreedsList] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [modalTab, setModalTab] = useState('basic');
  
  const [formData, setFormData] = useState({
    name: '',
    species_id: '',
    breed_id: '',
    sex: '',
    is_castrated: false,
    is_active: true
  });

  const token = localStorage.getItem('token');

  useEffect(() => {
    fetchMascotas();
    fetchSpecies();
    fetchBreeds();
  }, []);

  const fetchMascotas = async () => {
    try {
      const res = await fetch(`/api/animals/`, {
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
      const res = await fetch(`/api/animals/species`, {
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

  const fetchBreeds = async () => {
    try {
      const res = await fetch(`/api/animals/breeds`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setBreedsList(Array.isArray(data) ? data : []);
      }
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
        breed_id: mascota.breed_id || '',
        sex: mascota.sex || '',
        is_castrated: mascota.is_castrated || false,
        is_active: mascota.is_active
      });
    } else {
      setEditingId(null);
      setFormData({
        name: '',
        species_id: speciesList.length > 0 ? speciesList[0].id : '',
        breed_id: '',
        sex: 'M',
        is_castrated: false,
        is_active: true
      });
    }
    setModalTab('basic');
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const url = editingId 
      ? `/api/animals/${editingId}`
      : `/api/animals/`;
    
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
        const res = await fetch(`/api/animals/${id}`, {
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
      <div className="p-4 sm:p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 rounded-t-2xl gap-2">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-gray-800">Directorio de Mascotas</h2>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5 sm:mt-1">Gestiona los pacientes de la guardería</p>
        </div>
        <button 
          onClick={() => openModal()}
          className="bg-indigo-600 hover:bg-indigo-700 text-white p-2.5 sm:px-4 sm:py-2 rounded-xl font-medium flex items-center gap-2 transition-colors shadow-sm shrink-0 active:scale-95"
        >
          <Plus size={20} /> <span className="hidden sm:inline">Nueva Mascota</span>
        </button>
      </div>

      {/* Grid de Tarjetas (Móvil) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:hidden">
        {mascotas.map((m) => (
          <div key={m.id} onClick={() => openModal(m)} className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5 flex flex-col justify-between hover:shadow-md transition-shadow cursor-pointer">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-xl font-black text-gray-900 tracking-tight">{m.name}</h3>
                <span className="inline-block mt-1 px-3 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700">
                  {getSpeciesName(m.species_id)}
                </span>
              </div>
              {m.is_active ? (
                <span className="flex items-center gap-1.5 bg-green-50 text-green-700 px-3 py-1.5 rounded-full text-xs font-bold border border-green-100">
                  <span className="w-2 h-2 rounded-full bg-green-500"></span> Activo
                </span>
              ) : (
                <span className="flex items-center gap-1.5 bg-red-50 text-red-700 px-3 py-1.5 rounded-full text-xs font-bold border border-red-100">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span> Inactivo
                </span>
              )}
            </div>
            
            <div className="flex justify-between items-center mt-2 pt-4 border-t border-gray-50">
              <span className="text-sm font-bold text-gray-400 uppercase tracking-wider">
                {m.sex === 'M' ? 'Macho' : m.sex === 'F' ? 'Hembra' : 'No def.'}
              </span>
              <div className="flex gap-2">
                <button 
                  onClick={(e) => { e.stopPropagation(); openModal(m); }}
                  className="p-3 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-all active:scale-95 shadow-sm"
                  title="Editar"
                >
                  <Pencil size={18} />
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); handleDelete(m.id, m.name); }}
                  className="p-3 text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition-all active:scale-95 shadow-sm"
                  title="Dar de baja"
                  disabled={!m.is_active}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          </div>
        ))}
        {mascotas.length === 0 && (
          <div className="col-span-full bg-white rounded-3xl p-12 text-center text-gray-500 border border-dashed border-gray-200">
            <span className="text-4xl mb-4 block">🐶</span>
            <p className="font-medium text-lg">No hay mascotas registradas.</p>
          </div>
        )}
      </div>

      {/* Tabla (Desktop) */}
      <div className="hidden md:block overflow-x-auto bg-white rounded-2xl shadow-sm border border-gray-200">
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
              <tr key={m.id} onClick={() => openModal(m)} className="hover:bg-gray-50/50 transition-colors cursor-pointer">
                <td className="px-6 py-4 font-bold text-gray-900">{m.name}</td>
                <td className="px-6 py-4 text-gray-600">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                    {getSpeciesName(m.species_id)}
                  </span>
                </td>
                <td className="px-6 py-4 text-gray-600 text-sm font-medium">
                  {m.sex === 'M' ? 'Macho' : m.sex === 'F' ? 'Hembra' : 'No definido'}
                </td>
                <td className="px-6 py-4">
                  {m.is_active ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-green-700 font-bold bg-green-50 px-2 py-1 rounded-full border border-green-100">
                      <span className="w-2 h-2 rounded-full bg-green-500"></span> Activo
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs text-red-700 font-bold bg-red-50 px-2 py-1 rounded-full border border-red-100">
                      <span className="w-2 h-2 rounded-full bg-red-500"></span> Inactivo
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 flex justify-end gap-2">
                  <button 
                    onClick={(e) => { e.stopPropagation(); openModal(m); }}
                    className="p-2 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 rounded-xl transition-colors active:scale-95"
                    title="Editar"
                  >
                    <Pencil size={18} />
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleDelete(m.id, m.name); }}
                    className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-xl transition-colors active:scale-95"
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
                <td colSpan="5" className="text-center py-12 text-gray-500">
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
            
            {editingId && (
              <div className="flex border-b border-gray-100 px-2 mt-2">
                <button 
                  onClick={() => setModalTab('basic')} 
                  className={`flex items-center gap-2 px-4 py-3 font-bold text-sm border-b-2 transition-colors ${modalTab === 'basic' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                  <UserCircle size={18} /> Básicos
                </button>
                <button 
                  onClick={() => setModalTab('libreta')} 
                  className={`flex items-center gap-2 px-4 py-3 font-bold text-sm border-b-2 transition-colors ${modalTab === 'libreta' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                  <BookHeart size={18} /> Libreta Sanitaria
                </button>
                <button 
                  onClick={() => setModalTab('deworming')} 
                  className={`flex items-center gap-2 px-4 py-3 font-bold text-sm border-b-2 transition-colors ${modalTab === 'deworming' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                  <Syringe size={18} /> Desparasitaciones
                </button>
                <button 
                  onClick={() => setModalTab('labs')} 
                  className={`flex items-center gap-2 px-4 py-3 font-bold text-sm border-b-2 transition-colors ${modalTab === 'labs' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                  <FileText size={18} /> Laboratorios
                </button>
              </div>
            )}

            {modalTab === 'basic' && (
              <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Nombre</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-gray-900"
                  placeholder="Nombre de la mascota"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Especie</label>
                <select
                  required
                  value={formData.species_id}
                  onChange={(e) => setFormData({...formData, species_id: parseInt(e.target.value), breed_id: ''})}
                  className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-gray-900"
                >
                  <option value="">Seleccione una especie</option>
                  {speciesList.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Raza</label>
                <select
                  value={formData.breed_id}
                  onChange={(e) => setFormData({...formData, breed_id: e.target.value ? parseInt(e.target.value) : null})}
                  className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-gray-900"
                >
                  <option value="">Desconocida / Sin raza</option>
                  {breedsList
                    .filter(b => b.species_id === formData.species_id)
                    .map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Sexo</label>
                <select
                  value={formData.sex}
                  onChange={(e) => setFormData({...formData, sex: e.target.value})}
                  className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-gray-900"
                >
                  <option value="">No definido</option>
                  <option value="M">Macho</option>
                  <option value="F">Hembra</option>
                </select>
              </div>

              <div className="flex items-center gap-2 mt-2">
                <input
                  type="checkbox"
                  id="isCastrated"
                  checked={formData.is_castrated}
                  onChange={e => setFormData({...formData, is_castrated: e.target.checked})}
                  className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                />
                <label htmlFor="isCastrated" className="text-sm font-medium text-gray-700">
                  Animal Castrado
                </label>
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
            )}

            {modalTab === 'libreta' && <LibretaTab animalId={editingId} token={token} />}
            {modalTab === 'deworming' && <DesparasitacionesTab animalId={editingId} token={token} />}
            {modalTab === 'labs' && <LaboratoriosTab animalId={editingId} token={token} />}
          </div>
        </div>
      )}
    </div>
  );
}
