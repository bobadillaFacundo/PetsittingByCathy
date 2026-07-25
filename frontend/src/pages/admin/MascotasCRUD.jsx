import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Pencil, Trash2, Plus, X, Save, Syringe, FileText, UserCircle, BookHeart, RotateCcw, StickyNote } from 'lucide-react';
import DesparasitacionesTab from './DesparasitacionesTab';
import LaboratoriosTab from './LaboratoriosTab';
import LibretaTab from './LibretaTab';
import MedicacionTab from './MedicacionTab';
import ObservacionesTab from './ObservacionesTab';
import { redirectToLogin } from '../../lib/auth';
import { API_BASE, mediaUrl } from '../../lib/api';

const SPECIES_INFO = {
  1: { name: "Perros", emoji: "🐶" },
  2: { name: "Gatos", emoji: "🐱" },
  3: { name: "Loros", emoji: "🦜" },
  4: { name: "Conejos", emoji: "🐰" },
  5: { name: "Tortugas", emoji: "🐢" },
  6: { name: "Erizos", emoji: "🦔" }
};

const TRAIT_OPTIONS = [
  { key: 'is_blind', label: 'Ciego' },
  { key: 'is_deaf', label: 'Sordo' },
  { key: 'no_smell', label: 'Sin olfato' },
  { key: 'has_neurological', label: 'Temas neurológicos' },
  { key: 'has_involuntary_movements', label: 'Movimientos involuntarios' },
];

const emptyForm = (daycareOnly, speciesId = '') => ({
  name: '',
  species_id: speciesId,
  breed_id: '',
  sex: 'M',
  is_castrated: false,
  weight_kg: '',
  is_active: true,
  is_daycare: daycareOnly,
  coat_color: '',
  is_rescue: false,
  age_years: '',
  age_estimate_min: '',
  age_estimate_max: '',
  is_simil_breed: false,
  is_blind: false,
  is_deaf: false,
  no_smell: false,
  has_neurological: false,
  has_involuntary_movements: false,
  residence: ''
});

function formatAge(m) {
  if (m.is_rescue) {
    const min = m.age_estimate_min;
    const max = m.age_estimate_max;
    if (min != null && max != null) return `~${min}–${max} años`;
    if (min != null) return `desde ~${min} años`;
    if (max != null) return `hasta ~${max} años`;
    return 'Edad estimada';
  }
  if (m.age_years != null && m.age_years !== '') return `${m.age_years} años`;
  return null;
}

function traitLabels(m) {
  return TRAIT_OPTIONS.filter(t => m[t.key]).map(t => t.label);
}

function CastrationBadge({ isCastrated }) {
  return isCastrated ? (
    <span className="text-[10px] font-bold uppercase tracking-wide bg-sky-100 text-sky-800 px-2 py-0.5 rounded-full border border-sky-200">
      Castrado
    </span>
  ) : (
    <span className="text-[10px] font-bold uppercase tracking-wide bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full border border-gray-200">
      No castrado
    </span>
  );
}

function WeightBadge({ weightKg }) {
  if (weightKg == null || weightKg === '') return null;
  const n = Number(weightKg);
  if (Number.isNaN(n)) return null;
  const label = Number.isInteger(n) ? `${n} kg` : `${n.toFixed(1)} kg`;
  return (
    <span className="text-[10px] font-bold uppercase tracking-wide bg-violet-100 text-violet-800 px-2 py-0.5 rounded-full border border-violet-200">
      {label}
    </span>
  );
}

function CastrationWeightBadges({ isCastrated, weightKg }) {
  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      <CastrationBadge isCastrated={isCastrated} />
      <WeightBadge weightKg={weightKg} />
    </span>
  );
}

function sexLabel(sex) {
  if (sex === 'M') return 'Macho';
  if (sex === 'F') return 'Hembra';
  return 'No def.';
}

function modalTabButtonClass(active) {
  return `flex-1 min-w-0 flex flex-col sm:flex-row items-center justify-center gap-1 px-1.5 sm:px-3 py-2.5 sm:py-3 font-bold text-[11px] sm:text-sm border-b-2 transition-colors whitespace-nowrap ${
    active
      ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50'
      : 'border-transparent text-gray-500 hover:text-gray-700'
  }`;
}

export default function MascotasCRUD({ daycareOnly = true, title, subtitle }) {
  const [mascotas, setMascotas] = useState([]);
  const [speciesList, setSpeciesList] = useState([]);
  const [breedsList, setBreedsList] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [modalTab, setModalTab] = useState('basic');
  const [selectedSpeciesId, setSelectedSpeciesId] = useState(null);
  
  const [formData, setFormData] = useState(() => emptyForm(daycareOnly));

  const token = localStorage.getItem('token');
  const sectionTitle = title || (daycareOnly ? 'Guardería' : 'Mascotas');
  const sectionSubtitle = subtitle || (daycareOnly
    ? 'Pacientes que se alojan en la guardería'
    : 'Mascotas para servicios de veterinaria o baño (sin estadía)');

  useEffect(() => {
    setSelectedSpeciesId(null);
    setIsLoading(true);
    fetchMascotas();
    fetchSpecies();
    fetchBreeds();
  }, [daycareOnly]);

  const fetchMascotas = async () => {
    try {
      const res = await fetch(
        `${API_BASE}/animals/?is_daycare=${daycareOnly}&include_inactive=true`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );
      if (!res.ok) {
        if (res.status === 401) {
          redirectToLogin();
          return;
        }
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
      const res = await fetch(`${API_BASE}/animals/species`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        if (res.status === 401) {
          redirectToLogin();
          return;
        }
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
      const res = await fetch(`${API_BASE}/animals/breeds`, {
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
      loadAnimalIntoForm(mascota);
    } else {
      setEditingId(null);
      setFormData(emptyForm(daycareOnly, speciesList.length > 0 ? speciesList[0].id : ''));
    }
    setModalTab('basic');
    setIsModalOpen(true);
  };

  const loadAnimalIntoForm = (mascota) => {
    setEditingId(mascota.id);
    setFormData({
      name: mascota.name,
      species_id: mascota.species_id,
      breed_id: mascota.breed_id || '',
      sex: mascota.sex || '',
      is_castrated: mascota.is_castrated || false,
      weight_kg: mascota.weight_kg ?? '',
      is_active: mascota.is_active,
      is_daycare: mascota.is_daycare ?? daycareOnly,
      coat_color: mascota.coat_color || '',
      is_rescue: Boolean(mascota.is_rescue),
      age_years: mascota.age_years ?? '',
      age_estimate_min: mascota.age_estimate_min ?? '',
      age_estimate_max: mascota.age_estimate_max ?? '',
      is_simil_breed: Boolean(mascota.is_simil_breed),
      is_blind: Boolean(mascota.is_blind),
      is_deaf: Boolean(mascota.is_deaf),
      no_smell: Boolean(mascota.no_smell),
      has_neurological: Boolean(mascota.has_neurological),
      has_involuntary_movements: Boolean(mascota.has_involuntary_movements),
      residence: mascota.residence || ''
    });
  };

  const switchAnimalInModal = (mascota) => {
    loadAnimalIntoForm(mascota);
  };

  useEffect(() => {
    if (!isModalOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isModalOpen]);

  const handleRescueToggle = (checked) => {
    setFormData((prev) => ({
      ...prev,
      is_rescue: checked,
      is_simil_breed: checked ? true : prev.is_simil_breed,
      age_years: checked ? '' : prev.age_years,
      age_estimate_min: checked ? prev.age_estimate_min : '',
      age_estimate_max: checked ? prev.age_estimate_max : '',
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const url = editingId 
      ? `${API_BASE}/animals/${editingId}`
      : `${API_BASE}/animals/`;
    
    const method = editingId ? 'PUT' : 'POST';

    const payload = { ...formData };
    if (payload.breed_id === '') payload.breed_id = null;
    if (payload.coat_color === '') payload.coat_color = null;

    const toNumOrNull = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

    if (payload.is_rescue) {
      payload.age_years = null;
      payload.age_estimate_min = toNumOrNull(payload.age_estimate_min);
      payload.age_estimate_max = toNumOrNull(payload.age_estimate_max);
      if (
        payload.age_estimate_min != null &&
        payload.age_estimate_max != null &&
        payload.age_estimate_min > payload.age_estimate_max
      ) {
        alert('El rango de edad estimado es inválido (mínimo mayor que máximo).');
        return;
      }
    } else {
      payload.age_years = toNumOrNull(payload.age_years);
      payload.age_estimate_min = null;
      payload.age_estimate_max = null;
    }

    payload.weight_kg = toNumOrNull(payload.weight_kg);

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
        fetchMascotas();
      } else {
        const errorText = await res.text();
        alert(`Error al guardar la mascota: ${errorText}`);
      }
    } catch (err) {
      console.error(err);
      alert("Ocurrió un error al conectar con el servidor.");
    }
  };

  const handleDelete = async (id, name) => {
    if (window.confirm(`¿Dar de baja a ${name}? Seguirá visible aquí para reactivar o ver su historial; no aparecerá en la guardia.`)) {
      try {
        const res = await fetch(`${API_BASE}/animals/${id}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        if (res.ok) {
          fetchMascotas();
        } else {
          alert("Error al dar de baja la mascota.");
        }
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleReactivate = async (id, name) => {
    if (!window.confirm(`¿Dar de alta de nuevo a ${name}? Volverá a aparecer en la guardia.`)) return;
    try {
      const res = await fetch(`${API_BASE}/animals/${id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ is_active: true }),
      });
      if (res.ok) {
        fetchMascotas();
      } else {
        alert("Error al reactivar la mascota.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const getSpeciesName = (id) => {
    const s = speciesList.find(x => x.id === id);
    return s ? s.name : 'Desconocida';
  };

  const getBreedLabel = (m) => {
    if (!m.breed_id) return m.is_simil_breed ? 'SÍMIL (sin raza)' : null;
    const b = breedsList.find(x => x.id === m.breed_id);
    const name = b ? b.name : 'Raza';
    return m.is_simil_breed ? `SÍMIL ${name}` : name;
  };

  if (isLoading) return <div className="text-center p-8 text-gray-500">Cargando mascotas...</div>;

  const speciesPeers = selectedSpeciesId
    ? mascotas.filter((m) => m.species_id === selectedSpeciesId)
    : [];

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200">
      {/* Encabezado */}
      <div className="p-4 sm:p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 rounded-t-2xl gap-2">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-gray-800">{sectionTitle}</h2>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5 sm:mt-1">{sectionSubtitle}</p>
        </div>
        <button 
          onClick={() => openModal()}
          className="bg-indigo-600 hover:bg-indigo-700 text-white p-2.5 sm:px-4 sm:py-2 rounded-xl font-medium flex items-center gap-2 transition-colors shadow-sm shrink-0 active:scale-95"
        >
          <Plus size={20} /> <span className="hidden sm:inline">Nueva Mascota</span>
        </button>
      </div>

      {!selectedSpeciesId ? (
        <div className="p-6 md:p-10">
          <h2 className="text-2xl font-bold text-gray-800 mb-8 text-center">Selecciona la especie para gestionar</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
            {speciesList.map((s) => {
              const count = mascotas.filter(m => m.species_id === s.id).length;
              const emoji = SPECIES_INFO[s.id]?.emoji || "🐾";
              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedSpeciesId(s.id)}
                  className="p-6 bg-white rounded-2xl shadow-sm border border-gray-100 hover:border-indigo-400 hover:shadow-md transition-all flex flex-col items-center gap-3"
                >
                  <span className="text-5xl">{emoji}</span>
                  <span className="text-xl font-bold text-gray-800">{s.name}</span>
                  <span className="text-sm font-medium text-gray-500 bg-gray-100 px-3 py-1 rounded-full">{count} pacientes</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="animate-fade-in-up">
          <div className="p-4 border-b border-gray-100 bg-gray-50/30 flex items-center gap-4">
            <button 
              onClick={() => setSelectedSpeciesId(null)}
              className="p-2 bg-white border border-gray-200 text-gray-600 rounded-full hover:bg-gray-100 transition shadow-sm"
              title="Volver"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
            </button>
            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <span className="text-2xl">{SPECIES_INFO[selectedSpeciesId]?.emoji || "🐾"}</span>
              Pacientes: {speciesList.find(s => s.id === selectedSpeciesId)?.name || 'Desconocida'}
            </h2>
          </div>

          {/* Grid de Tarjetas (Móvil) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:hidden p-4">
            {mascotas.filter(m => m.species_id === selectedSpeciesId).map((m) => (
              <div
                key={m.id}
                onClick={() => openModal(m)}
                className={`bg-white rounded-3xl shadow-sm border p-5 flex flex-col justify-between hover:shadow-md transition-shadow cursor-pointer ${
                  m.is_active ? 'border-gray-100' : 'border-red-100 bg-red-50/30 opacity-90'
                }`}
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-xl font-black text-gray-900 tracking-tight flex items-center gap-2 flex-wrap">
                      {m.name}
                      {m.is_rescue && (
                        <span className="text-[10px] font-bold uppercase tracking-wide bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">Rescate</span>
                      )}
                      <CastrationWeightBadges isCastrated={m.is_castrated} weightKg={m.weight_kg} />
                    </h3>
                    <span className="inline-block mt-1 px-3 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700">
                      {getSpeciesName(m.species_id)}
                    </span>
                    {getBreedLabel(m) && (
                      <p className="text-sm text-gray-600 mt-1.5 font-medium">{getBreedLabel(m)}</p>
                    )}
                    <p className="text-xs text-gray-500 mt-1">
                      {[formatAge(m), m.coat_color].filter(Boolean).join(' · ') || 'Sin edad / pelaje'}
                      {m.residence && ` · ${m.residence}`}
                    </p>
                    {traitLabels(m).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {traitLabels(m).map((label) => (
                          <span key={label} className="text-[10px] font-bold bg-rose-50 text-rose-700 px-2 py-0.5 rounded-full border border-rose-100">
                            {label}
                          </span>
                        ))}
                      </div>
                    )}
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
                    {sexLabel(m.sex)}
                  </span>
                  <div className="flex gap-2">
                    <button 
                      onClick={(e) => { e.stopPropagation(); openModal(m); }}
                      className="p-3 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-all active:scale-95 shadow-sm"
                      title="Editar / historial"
                    >
                      <Pencil size={18} />
                    </button>
                    {m.is_active ? (
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleDelete(m.id, m.name); }}
                        className="p-3 text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition-all active:scale-95 shadow-sm"
                        title="Dar de baja"
                      >
                        <Trash2 size={18} />
                      </button>
                    ) : (
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleReactivate(m.id, m.name); }}
                        className="p-3 text-green-700 bg-green-50 hover:bg-green-100 rounded-xl transition-all active:scale-95 shadow-sm"
                        title="Dar de alta"
                      >
                        <RotateCcw size={18} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {mascotas.filter(m => m.species_id === selectedSpeciesId).length === 0 && (
              <div className="col-span-full bg-gray-50 rounded-3xl p-12 text-center text-gray-500 border border-dashed border-gray-200">
                <span className="text-4xl mb-4 block">🐾</span>
                <p className="font-medium text-lg">No hay mascotas registradas para esta especie.</p>
              </div>
            )}
          </div>

          {/* Tabla (Desktop) */}
          <div className="hidden md:block overflow-x-auto bg-white rounded-b-2xl">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-sm border-y border-gray-100">
                  <th className="px-6 py-4 font-medium">Nombre</th>
                  <th className="px-6 py-4 font-medium">Raza / Símil</th>
                  <th className="px-6 py-4 font-medium">Edad</th>
                  <th className="px-6 py-4 font-medium">Pelaje</th>
                  <th className="px-6 py-4 font-medium">Sexo</th>
                  <th className="px-6 py-4 font-medium">Castración / Peso</th>
                  {!daycareOnly && <th className="px-6 py-4 font-medium">Residencia</th>}
                  <th className="px-6 py-4 font-medium">Estado</th>
                  <th className="px-6 py-4 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {mascotas.filter(m => m.species_id === selectedSpeciesId).map((m) => (
                  <tr
                    key={m.id}
                    onClick={() => openModal(m)}
                    className={`hover:bg-gray-50/50 transition-colors cursor-pointer ${
                      !m.is_active ? 'bg-red-50/40' : ''
                    }`}
                  >
                    <td className="px-6 py-4 font-bold text-gray-900">
                      <div className="flex items-center gap-2 flex-wrap">
                        {m.name}
                        {m.is_rescue && (
                          <span className="text-[10px] font-bold uppercase tracking-wide bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">Rescate</span>
                        )}
                      </div>
                      {traitLabels(m).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {traitLabels(m).map((label) => (
                            <span key={label} className="text-[10px] font-bold bg-rose-50 text-rose-700 px-1.5 py-0.5 rounded-full">
                              {label}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-600 text-sm font-medium">
                      {getBreedLabel(m) || '—'}
                    </td>
                    <td className="px-6 py-4 text-gray-600 text-sm font-medium">
                      {formatAge(m) || '—'}
                    </td>
                    <td className="px-6 py-4 text-gray-600 text-sm font-medium">
                      {m.coat_color || '—'}
                    </td>
                    <td className="px-6 py-4 text-gray-600 text-sm font-medium">
                      {sexLabel(m.sex)}
                    </td>
                    <td className="px-6 py-4">
                      <CastrationWeightBadges isCastrated={m.is_castrated} weightKg={m.weight_kg} />
                    </td>
                    {!daycareOnly && (
                      <td className="px-6 py-4 text-gray-600 text-sm font-medium">
                        {m.residence || '—'}
                      </td>
                    )}
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
                        title="Editar / historial"
                      >
                        <Pencil size={18} />
                      </button>
                      {m.is_active ? (
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleDelete(m.id, m.name); }}
                          className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-xl transition-colors active:scale-95"
                          title="Dar de baja"
                        >
                          <Trash2 size={18} />
                        </button>
                      ) : (
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleReactivate(m.id, m.name); }}
                          className="p-2 text-green-600 hover:text-green-800 hover:bg-green-50 rounded-xl transition-colors active:scale-95"
                          title="Dar de alta"
                        >
                          <RotateCcw size={18} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {mascotas.filter(m => m.species_id === selectedSpeciesId).length === 0 && (
                  <tr>
                    <td colSpan="5" className="text-center py-12 text-gray-500">
                      No hay mascotas registradas para esta especie.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal / Formulario — portal a body para scroll en iOS */}
      {isModalOpen && createPortal(
        <div
          className="modal-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) setIsModalOpen(false); }}
        >
          <div className="modal-overlay-inner">
            <div className="modal-sheet modal-sheet--pet" onClick={(e) => e.stopPropagation()}>
              <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 sticky top-0 z-10 shrink-0">
                <div>
                  <h3 className="text-lg font-bold text-gray-800">
                    {editingId ? 'Editar Mascota' : 'Nueva Mascota'}
                  </h3>
                  {editingId && (
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-sm font-semibold text-gray-700">{formData.name}</span>
                      <span className="text-xs text-gray-500">{sexLabel(formData.sex)}</span>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600 hover:bg-gray-200 p-2 rounded-lg transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {editingId && daycareOnly && speciesPeers.length > 1 && (
                <div className="px-4 py-3 border-b border-gray-100 bg-white overflow-x-auto scroll-touch shrink-0">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-2 px-1">
                    Misma especie
                  </p>
                  <div className="flex gap-2 min-w-max pb-1">
                    {speciesPeers.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => switchAnimalInModal(m)}
                        className={`flex flex-col items-start gap-1 px-3 py-2 rounded-xl border text-left transition-all shrink-0 ${
                          m.id === editingId
                            ? 'border-indigo-500 bg-indigo-50 shadow-sm'
                            : 'border-gray-200 bg-gray-50 hover:border-indigo-300 hover:bg-indigo-50/50'
                        }`}
                      >
                        <span className="text-sm font-bold text-gray-900 whitespace-nowrap">{m.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {editingId && (
                <div className="flex border-b border-gray-100 shrink-0 bg-white">
                  <button
                    type="button"
                    onClick={() => setModalTab('basic')}
                    className={modalTabButtonClass(modalTab === 'basic')}
                  >
                    <UserCircle size={18} className="shrink-0" /> Básicos
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalTab('libreta')}
                    className={modalTabButtonClass(modalTab === 'libreta')}
                  >
                    <BookHeart size={18} className="shrink-0" /> Libreta
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalTab('deworming')}
                    className={modalTabButtonClass(modalTab === 'deworming')}
                  >
                    <Syringe size={18} className="shrink-0" /> Desparas.
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalTab('labs')}
                    className={modalTabButtonClass(modalTab === 'labs')}
                  >
                    <FileText size={18} className="shrink-0" /> Labs
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalTab('medicacion')}
                    className={modalTabButtonClass(modalTab === 'medicacion')}
                  >
                    <Syringe size={18} className="shrink-0" /> Medicación
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalTab('observaciones')}
                    className={modalTabButtonClass(modalTab === 'observaciones')}
                  >
                    <StickyNote size={18} className="shrink-0" /> Observaciones
                  </button>
                </div>
              )}

              <div className="modal-sheet-body">
                <div className="modal-tab-panel">
                  <div className="modal-tab-pane" hidden={modalTab !== 'basic'}>
                    <div className="modal-tab-content">
                <form onSubmit={handleSubmit} className="space-y-4 w-full">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Nombre</label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none text-gray-900 text-base"
                      placeholder="Nombre de la mascota"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Especie</label>
                    <select
                      required
                      value={formData.species_id}
                      onChange={(e) => setFormData({...formData, species_id: parseInt(e.target.value), breed_id: ''})}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none text-gray-900 text-base bg-white"
                    >
                      <option value="">Seleccione una especie</option>
                      {speciesList.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 border border-amber-100">
                    <input
                      type="checkbox"
                      id="isRescue"
                      checked={formData.is_rescue}
                      onChange={(e) => handleRescueToggle(e.target.checked)}
                      className="w-5 h-5 text-amber-600 rounded border-gray-300"
                    />
                    <label htmlFor="isRescue" className="text-sm font-bold text-amber-900">
                      Rescate
                    </label>
                    <span className="text-xs text-amber-700">Edad estimada y raza símil</span>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">
                      {formData.is_simil_breed ? 'Símil a (raza)' : 'Raza'}
                    </label>
                    <select
                      value={formData.breed_id}
                      onChange={(e) => setFormData({...formData, breed_id: e.target.value ? parseInt(e.target.value) : null})}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none text-gray-900 text-base bg-white"
                    >
                      <option value="">Desconocida / Sin raza</option>
                      {breedsList
                        .filter(b => b.species_id === formData.species_id)
                        .map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                    <label className="mt-2 flex items-center gap-2 text-sm text-gray-600">
                      <input
                        type="checkbox"
                        checked={formData.is_simil_breed}
                        onChange={(e) => setFormData({ ...formData, is_simil_breed: e.target.checked })}
                        className="w-4 h-4 text-indigo-600 rounded border-gray-300"
                      />
                      Marcar como SÍMIL (tamaño / carácter aproximado)
                    </label>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Color del pelaje</label>
                    <input
                      type="text"
                      value={formData.coat_color}
                      onChange={(e) => setFormData({ ...formData, coat_color: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none text-gray-900 text-base"
                      placeholder="Ej. negro y blanco, atigrado…"
                    />
                  </div>

                  {formData.is_rescue ? (
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1">Edad estimada (años)</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          inputMode="decimal"
                          value={formData.age_estimate_min}
                          onChange={(e) => setFormData({ ...formData, age_estimate_min: e.target.value })}
                          className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none text-gray-900 text-base"
                          placeholder="Desde"
                        />
                        <span className="text-gray-500 font-bold shrink-0">a</span>
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          inputMode="decimal"
                          value={formData.age_estimate_max}
                          onChange={(e) => setFormData({ ...formData, age_estimate_max: e.target.value })}
                          className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none text-gray-900 text-base"
                          placeholder="Hasta"
                        />
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1">Edad (años)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        inputMode="decimal"
                        value={formData.age_years}
                        onChange={(e) => setFormData({ ...formData, age_years: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none text-gray-900 text-base"
                        placeholder="Ej. 3 o 1.5"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Sexo</label>
                    <select
                      value={formData.sex}
                      onChange={(e) => setFormData({...formData, sex: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none text-gray-900 text-base bg-white"
                    >
                      <option value="">No definido</option>
                      <option value="M">Macho</option>
                      <option value="F">Hembra</option>
                    </select>
                  </div>

                  <div>
                    <p className="block text-sm font-bold text-gray-700 mb-2">Características especiales</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {TRAIT_OPTIONS.map((t) => (
                        <label
                          key={t.key}
                          className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-800"
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(formData[t.key])}
                            onChange={(e) => setFormData({ ...formData, [t.key]: e.target.checked })}
                            className="w-4 h-4 text-indigo-600 rounded border-gray-300"
                          />
                          {t.label}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="isCastrated"
                        checked={formData.is_castrated}
                        onChange={e => setFormData({...formData, is_castrated: e.target.checked})}
                        className="w-5 h-5 text-indigo-600 rounded border-gray-300"
                      />
                      <label htmlFor="isCastrated" className="text-sm font-medium text-gray-700">
                        Animal castrado
                      </label>
                    </div>
                    <div>
                      <label htmlFor="weightKg" className="block text-sm font-medium text-gray-700 mb-1">
                        Peso (kg)
                      </label>
                      <input
                        id="weightKg"
                        type="number"
                        min="0"
                        step="0.1"
                        placeholder="Ej. 12.5"
                        value={formData.weight_kg}
                        onChange={(e) => setFormData({ ...formData, weight_kg: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none text-gray-900 text-base bg-white"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="isActive"
                      checked={formData.is_active}
                      onChange={e => setFormData({...formData, is_active: e.target.checked})}
                      className="w-5 h-5 text-indigo-600 rounded border-gray-300"
                    />
                    <label htmlFor="isActive" className="text-sm font-medium text-gray-700">
                      Mascota activa (aparece en la guardia). Desmarcar = baja; marcar = alta de nuevo.
                    </label>
                  </div>

                  {!daycareOnly && (
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1">Residencia</label>
                      <select
                        value={formData.residence}
                        onChange={(e) => setFormData({...formData, residence: e.target.value})}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none text-gray-900 text-base bg-white"
                      >
                        <option value="">No definida</option>
                        <option value="BOUQUET">BOUQUET</option>
                        <option value="LA HERRADURA">LA HERRADURA</option>
                        <option value="EL BARRANCO">EL BARRANCO</option>
                      </select>
                    </div>
                  )}

                  <div className="pt-2 flex gap-3 sticky bottom-0 bg-white pb-2">
                    <button
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className="flex-1 px-4 py-3 text-gray-600 bg-gray-100 rounded-xl font-bold"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-xl font-bold flex items-center justify-center gap-2"
                    >
                      <Save size={18} /> {editingId ? 'Guardar' : 'Crear'}
                    </button>
                  </div>
                </form>
                    </div>
                  </div>

                  {editingId && (
                    <>
                      <div className="modal-tab-pane" hidden={modalTab !== 'libreta'}>
                        <LibretaTab animalId={editingId} token={token} />
                      </div>
                      <div className="modal-tab-pane" hidden={modalTab !== 'deworming'}>
                        <DesparasitacionesTab animalId={editingId} token={token} />
                      </div>
                      <div className="modal-tab-pane" hidden={modalTab !== 'labs'}>
                        <LaboratoriosTab animalId={editingId} token={token} />
                      </div>
                      <div className="modal-tab-pane" hidden={modalTab !== 'medicacion'}>
                        <MedicacionTab animalId={editingId} />
                      </div>
                      <div className="modal-tab-pane" hidden={modalTab !== 'observaciones'}>
                        <ObservacionesTab animalId={editingId} token={token} />
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
