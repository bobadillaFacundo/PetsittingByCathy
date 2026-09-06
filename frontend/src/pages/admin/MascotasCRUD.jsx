import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Pencil, Trash2, Plus, X, Save, Syringe, FileText, UserCircle, BookHeart, RotateCcw, StickyNote } from 'lucide-react';
import DesparasitacionesTab from './DesparasitacionesTab';
import LaboratoriosTab from './LaboratoriosTab';
import LibretaTab from './LibretaTab';
import MedicacionTab from './MedicacionTab';
import ObservacionesTab from './ObservacionesTab';
import WeightHistoryList from '../../components/WeightHistoryList';
import { redirectToLogin, getToken } from '../../lib/auth';
import { API_BASE, apiUrl, mediaUrl } from '../../lib/api';
import {
  CARE_OPTIONS,
  DOG_SOCIABILITY_OPTIONS,
  FAMILIAR_ANIMAL_OPTIONS,
  HOUSING_OPTIONS,
  INTAKE_BOOL_DEFAULTS,
  TRAIT_OPTIONS,
  careLabels,
  joinFamiliarList,
  parseFamiliarList,
} from '../../lib/animalProfile';

const SPECIES_INFO = {
  1: { name: "Perros", emoji: "🐶" },
  2: { name: "Gatos", emoji: "🐱" },
  3: { name: "Loros", emoji: "🦜" },
  4: { name: "Conejos", emoji: "🐰" },
  5: { name: "Tortugas", emoji: "🐢" },
  6: { name: "Erizos", emoji: "🦔" }
};

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
  is_escapist: false,
  has_attachment_issues: false,
  dog_sociability: '',
  needs_medication: false,
  needs_diapers: false,
  needs_isolation: false,
  needs_muzzle: false,
  has_special_diet: false,
  care_notes: '',
  housing_type: '',
  ...INTAKE_BOOL_DEFAULTS,
  lives_with_dogs_count: '',
  familiar_with_animals: [],
  fears: '',
  destroys_what: '',
  food_brand: '',
  food_amount: '',
  food_times_per_day: '',
  special_diet_details: '',
  intake_vaccines: '',
  intake_medication: '',
  allergies: '',
  health_issues: '',
  contact_name: '',
  contact_phone: '',
  contact_email: '',
  contact_notes: '',
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
  return [
    ...TRAIT_OPTIONS.filter((t) => m[t.key]).map((t) => t.label),
    ...careLabels(m),
  ];
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
  return `pet-modal-tab ${active ? 'pet-modal-tab--active' : ''}`;
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
  const [weightHistory, setWeightHistory] = useState([]);
  
  const [formData, setFormData] = useState(() => emptyForm(daycareOnly));

  const token = getToken();

  const authHeaders = () => ({
    Authorization: `Bearer ${getToken()}`,
  });

  const sectionTitle = title || (daycareOnly ? 'Mascotas' : 'Guardería');
  const sectionSubtitle = subtitle || (daycareOnly
    ? 'Pacientes con estadía'
    : 'Vet, baño y servicios sin estadía permanente');

  useEffect(() => {
    setSelectedSpeciesId(null);
    setIsLoading(true);
    fetchMascotas();
    fetchSpecies();
    fetchBreeds();
  }, [daycareOnly]);

  useEffect(() => {
    if (!editingId || !isModalOpen) {
      setWeightHistory([]);
      return;
    }
    fetch(`${API_BASE}/animals/${editingId}/weights`, { headers: authHeaders() })
      .then((res) => (res.ok ? res.json() : []))
      .then((rows) => setWeightHistory(Array.isArray(rows) ? rows : []))
      .catch(() => setWeightHistory([]));
  }, [editingId, isModalOpen]);

  const fetchMascotas = async () => {
    try {
      const res = await fetch(
        apiUrl(`/animals?is_daycare=${daycareOnly}&include_inactive=true`),
        {
          headers: authHeaders(),
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
        headers: authHeaders(),
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
        headers: authHeaders(),
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
      is_escapist: Boolean(mascota.is_escapist),
      has_attachment_issues: Boolean(mascota.has_attachment_issues),
      dog_sociability: mascota.dog_sociability || '',
      needs_medication: Boolean(mascota.needs_medication),
      needs_diapers: Boolean(mascota.needs_diapers),
      needs_isolation: Boolean(mascota.needs_isolation),
      needs_muzzle: Boolean(mascota.needs_muzzle),
      has_special_diet: Boolean(mascota.has_special_diet),
      care_notes: mascota.care_notes || '',
      housing_type: mascota.housing_type || '',
      aversive_to_people: Boolean(mascota.aversive_to_people),
      aversive_to_dogs: Boolean(mascota.aversive_to_dogs),
      has_bitten_people: Boolean(mascota.has_bitten_people),
      has_bitten_dogs: Boolean(mascota.has_bitten_dogs),
      bites_often: Boolean(mascota.bites_often),
      lives_with_dogs: Boolean(mascota.lives_with_dogs),
      lives_with_dogs_count: mascota.lives_with_dogs_count ?? '',
      plays_with_dogs: Boolean(mascota.plays_with_dogs),
      familiar_with_animals: parseFamiliarList(mascota.familiar_with_animals),
      fears: mascota.fears || '',
      destroys_things: Boolean(mascota.destroys_things),
      destroys_what: mascota.destroys_what || '',
      likes_water: Boolean(mascota.likes_water),
      likes_pool: Boolean(mascota.likes_pool),
      food_brand: mascota.food_brand || '',
      food_amount: mascota.food_amount || '',
      food_times_per_day: mascota.food_times_per_day || '',
      special_diet_details: mascota.special_diet_details || '',
      intake_vaccines: mascota.intake_vaccines || '',
      intake_dewormed_internal: Boolean(mascota.intake_dewormed_internal),
      intake_dewormed_external: Boolean(mascota.intake_dewormed_external),
      intake_medication: mascota.intake_medication || '',
      allergies: mascota.allergies || '',
      health_issues: mascota.health_issues || '',
      walks_outside_neighborhood: Boolean(mascota.walks_outside_neighborhood),
      contact_name: mascota.contact_name || '',
      contact_phone: mascota.contact_phone || '',
      contact_email: mascota.contact_email || '',
      contact_notes: mascota.contact_notes || '',
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
      : apiUrl('/animals');
    
    const method = editingId ? 'PUT' : 'POST';

    const payload = { ...formData };
    if (payload.breed_id === '') payload.breed_id = null;
    if (payload.coat_color === '') payload.coat_color = null;
    if (payload.dog_sociability === '') payload.dog_sociability = null;
    if (payload.care_notes === '') payload.care_notes = null;
    if (payload.housing_type === '') payload.housing_type = null;
    payload.familiar_with_animals = joinFamiliarList(payload.familiar_with_animals) || null;
    [
      'fears', 'destroys_what', 'food_brand', 'food_amount', 'food_times_per_day',
      'special_diet_details', 'intake_vaccines', 'intake_medication', 'allergies',
      'health_issues', 'contact_name', 'contact_phone', 'contact_email', 'contact_notes',
    ].forEach((key) => {
      if (payload[key] === '') payload[key] = null;
    });

    const toNumOrNull = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
    payload.lives_with_dogs_count = toNumOrNull(payload.lives_with_dogs_count);

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
          ...authHeaders(),
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
            ...authHeaders(),
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
          'Content-Type': 'application/json',
          ...authHeaders(),
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
    <div className="pet-panel">
      {/* Encabezado */}
      <div className="pet-panel-header">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-gray-800">{sectionTitle}</h2>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5 sm:mt-1">{sectionSubtitle}</p>
        </div>
        <button 
          type="button"
          onClick={() => openModal()}
          className="pet-btn pet-btn--primary p-2.5 sm:px-4 sm:py-2 shrink-0"
        >
          <Plus size={20} /> <span className="hidden sm:inline">Nueva Mascota</span>
        </button>
      </div>

      {!selectedSpeciesId ? (
        <div className="p-6 md:p-10">
          <h2 className="text-2xl font-bold text-gray-800 mb-8 text-center">Selecciona la especie para gestionar</h2>
          <div className="pet-species-grid max-w-4xl mx-auto">
            {speciesList.map((s) => {
              const count = mascotas.filter(m => m.species_id === s.id).length;
              const emoji = SPECIES_INFO[s.id]?.emoji || "🐾";
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedSpeciesId(s.id)}
                  className="pet-species-tile"
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
              type="button"
              onClick={() => setSelectedSpeciesId(null)}
              className="pet-icon-btn pet-icon-btn--ghost p-2 rounded-full"
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
                role="button"
                tabIndex={0}
                onClick={() => openModal(m)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openModal(m); }}
                className={`pet-mascota-card ${
                  m.is_active ? '' : 'border-red-100 bg-red-50/30 opacity-90'
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
                      type="button"
                      onClick={(e) => { e.stopPropagation(); openModal(m); }}
                      className="pet-icon-btn pet-icon-btn--indigo p-3"
                      title="Editar / historial"
                    >
                      <Pencil size={18} />
                    </button>
                    {m.is_active ? (
                      <button 
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleDelete(m.id, m.name); }}
                        className="pet-icon-btn pet-icon-btn--red p-3"
                        title="Dar de baja"
                      >
                        <Trash2 size={18} />
                      </button>
                    ) : (
                      <button 
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleReactivate(m.id, m.name); }}
                        className="pet-icon-btn pet-icon-btn--green p-3"
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
                        type="button"
                        onClick={(e) => { e.stopPropagation(); openModal(m); }}
                        className="pet-icon-btn pet-icon-btn--indigo p-2"
                        title="Editar / historial"
                      >
                        <Pencil size={18} />
                      </button>
                      {m.is_active ? (
                        <button 
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleDelete(m.id, m.name); }}
                          className="pet-icon-btn pet-icon-btn--red p-2"
                          title="Dar de baja"
                        >
                          <Trash2 size={18} />
                        </button>
                      ) : (
                        <button 
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleReactivate(m.id, m.name); }}
                          className="pet-icon-btn pet-icon-btn--green p-2"
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
              <div className="pet-modal-header">
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
                  className="pet-modal-close"
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
                        className={`pet-modal-peer ${
                          m.id === editingId ? 'pet-modal-peer--active' : ''
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
                      className="pet-input text-base"
                      placeholder="Nombre de la mascota"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Especie</label>
                    <select
                      required
                      value={formData.species_id}
                      onChange={(e) => setFormData({...formData, species_id: parseInt(e.target.value), breed_id: ''})}
                      className="pet-select text-base"
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
                      className="pet-select text-base"
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
                      className="pet-input text-base"
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
                          className="pet-input text-base"
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
                          className="pet-input text-base"
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
                        className="pet-input text-base"
                        placeholder="Ej. 3 o 1.5"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Sexo</label>
                    <select
                      value={formData.sex}
                      onChange={(e) => setFormData({...formData, sex: e.target.value})}
                      className="pet-select text-base"
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

                  <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-100 space-y-4">
                    <div>
                      <p className="block text-sm font-bold text-amber-900 mb-1">Formulario de ingreso</p>
                      <p className="text-xs text-amber-800 mb-2">
                        Copiá acá lo que mandan los clientes en el Drive. No se importa solo: hay que tildar/completar y guardar. Después los chicos lo ven en el tablero y en la ficha.
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {CARE_OPTIONS.map((t) => (
                          <label
                            key={t.key}
                            className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-amber-200 bg-white text-sm text-gray-800"
                          >
                            <input
                              type="checkbox"
                              checked={Boolean(formData[t.key])}
                              onChange={(e) => setFormData({ ...formData, [t.key]: e.target.checked })}
                              className="w-4 h-4 text-amber-600 rounded border-gray-300"
                            />
                            {t.label}
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-bold text-amber-900 mb-1">Vive en</label>
                        <select
                          value={formData.housing_type}
                          onChange={(e) => setFormData({ ...formData, housing_type: e.target.value })}
                          className="pet-select text-base bg-white"
                        >
                          {HOUSING_OPTIONS.map((opt) => (
                            <option key={opt.value || 'none'} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-amber-900 mb-1">Cómo se lleva con otros perros</label>
                        <select
                          value={formData.dog_sociability}
                          onChange={(e) => setFormData({ ...formData, dog_sociability: e.target.value })}
                          className="pet-select text-base bg-white"
                        >
                          {DOG_SOCIABILITY_OPTIONS.map((opt) => (
                            <option key={opt.value || 'none'} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <label className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-amber-200 bg-white text-sm">
                        <input
                          type="checkbox"
                          checked={formData.lives_with_dogs}
                          onChange={(e) => setFormData({ ...formData, lives_with_dogs: e.target.checked })}
                          className="w-4 h-4 text-amber-600 rounded border-gray-300"
                        />
                        Convive con perros
                      </label>
                      <input
                        type="number"
                        min="0"
                        placeholder="¿Cuántos?"
                        value={formData.lives_with_dogs_count}
                        onChange={(e) => setFormData({ ...formData, lives_with_dogs_count: e.target.value })}
                        className="pet-input text-base bg-white"
                        disabled={!formData.lives_with_dogs}
                      />
                      <label className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-amber-200 bg-white text-sm sm:col-span-2">
                        <input
                          type="checkbox"
                          checked={formData.plays_with_dogs}
                          onChange={(e) => setFormData({ ...formData, plays_with_dogs: e.target.checked })}
                          className="w-4 h-4 text-amber-600 rounded border-gray-300"
                        />
                        Juega con otros perros
                      </label>
                    </div>

                    <div>
                      <p className="block text-sm font-bold text-amber-900 mb-1">Familiarizado con otros animales</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {FAMILIAR_ANIMAL_OPTIONS.map((opt) => {
                          const checked = (formData.familiar_with_animals || []).includes(opt.key);
                          return (
                            <label key={opt.key} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-amber-200 bg-white text-sm">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  const current = formData.familiar_with_animals || [];
                                  setFormData({
                                    ...formData,
                                    familiar_with_animals: e.target.checked
                                      ? [...current, opt.key]
                                      : current.filter((k) => k !== opt.key),
                                  });
                                }}
                                className="w-4 h-4 text-amber-600 rounded border-gray-300"
                              />
                              {opt.label}
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <label className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-amber-200 bg-white text-sm">
                        <input type="checkbox" checked={formData.likes_water} onChange={(e) => setFormData({ ...formData, likes_water: e.target.checked })} className="w-4 h-4 text-amber-600 rounded border-gray-300" />
                        Le gusta el agua
                      </label>
                      <label className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-amber-200 bg-white text-sm">
                        <input type="checkbox" checked={formData.likes_pool} onChange={(e) => setFormData({ ...formData, likes_pool: e.target.checked })} className="w-4 h-4 text-amber-600 rounded border-gray-300" />
                        Se mete a la pileta
                      </label>
                      <label className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-amber-200 bg-white text-sm sm:col-span-2">
                        <input type="checkbox" checked={formData.walks_outside_neighborhood} onChange={(e) => setFormData({ ...formData, walks_outside_neighborhood: e.target.checked })} className="w-4 h-4 text-amber-600 rounded border-gray-300" />
                        Autoriza pasear por los alrededores (además del barrio cerrado)
                      </label>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-bold text-amber-900 mb-1">Miedos</label>
                        <input value={formData.fears} onChange={(e) => setFormData({ ...formData, fears: e.target.value })} className="pet-input text-base bg-white w-full" placeholder="Truenos, hombres, motos…" />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-amber-900 mb-1">Si rompe cosas, ¿cuáles?</label>
                        <input value={formData.destroys_what} onChange={(e) => setFormData({ ...formData, destroys_what: e.target.value })} className="pet-input text-base bg-white w-full" placeholder="Almohadones, zapatos…" />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-amber-900 mb-1">Alimento (marca)</label>
                        <input value={formData.food_brand} onChange={(e) => setFormData({ ...formData, food_brand: e.target.value })} className="pet-input text-base bg-white w-full" />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-amber-900 mb-1">Cantidad y veces/día</label>
                        <div className="flex gap-2">
                          <input value={formData.food_amount} onChange={(e) => setFormData({ ...formData, food_amount: e.target.value })} className="pet-input text-base bg-white w-full" placeholder="Ej. 150 g" />
                          <input value={formData.food_times_per_day} onChange={(e) => setFormData({ ...formData, food_times_per_day: e.target.value })} className="pet-input text-base bg-white w-24" placeholder="Veces" />
                        </div>
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-sm font-bold text-amber-900 mb-1">Dieta especial (detalle)</label>
                        <input value={formData.special_diet_details} onChange={(e) => setFormData({ ...formData, special_diet_details: e.target.value })} className="pet-input text-base bg-white w-full" placeholder="Sin pollo, hipoalergénico…" />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-amber-900 mb-1">Vacunas que tiene</label>
                        <input value={formData.intake_vaccines} onChange={(e) => setFormData({ ...formData, intake_vaccines: e.target.value })} className="pet-input text-base bg-white w-full" placeholder="Antirrábica, séxtuple…" />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-amber-900 mb-1">Remedio que toma</label>
                        <input value={formData.intake_medication} onChange={(e) => setFormData({ ...formData, intake_medication: e.target.value })} className="pet-input text-base bg-white w-full" />
                      </div>
                      <label className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-amber-200 bg-white text-sm">
                        <input type="checkbox" checked={formData.intake_dewormed_internal} onChange={(e) => setFormData({ ...formData, intake_dewormed_internal: e.target.checked })} className="w-4 h-4 text-amber-600 rounded border-gray-300" />
                        Desparasitado interno
                      </label>
                      <label className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-amber-200 bg-white text-sm">
                        <input type="checkbox" checked={formData.intake_dewormed_external} onChange={(e) => setFormData({ ...formData, intake_dewormed_external: e.target.checked })} className="w-4 h-4 text-amber-600 rounded border-gray-300" />
                        Desparasitación externa
                      </label>
                      <div>
                        <label className="block text-sm font-bold text-amber-900 mb-1">Alergias</label>
                        <input value={formData.allergies} onChange={(e) => setFormData({ ...formData, allergies: e.target.value })} className="pet-input text-base bg-white w-full" />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-amber-900 mb-1">Problema de salud</label>
                        <input value={formData.health_issues} onChange={(e) => setFormData({ ...formData, health_issues: e.target.value })} className="pet-input text-base bg-white w-full" />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-bold text-amber-900 mb-1">Contacto (nombre)</label>
                        <input value={formData.contact_name} onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })} className="pet-input text-base bg-white w-full" />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-amber-900 mb-1">Teléfono</label>
                        <input value={formData.contact_phone} onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })} className="pet-input text-base bg-white w-full" />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-amber-900 mb-1">Email</label>
                        <input value={formData.contact_email} onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })} className="pet-input text-base bg-white w-full" />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-amber-900 mb-1">Notas de contacto</label>
                        <input value={formData.contact_notes} onChange={(e) => setFormData({ ...formData, contact_notes: e.target.value })} className="pet-input text-base bg-white w-full" placeholder="Horario, familiar, etc." />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-amber-900 mb-1">Otras notas de cuidado</label>
                      <textarea
                        value={formData.care_notes}
                        onChange={(e) => setFormData({ ...formData, care_notes: e.target.value })}
                        rows={3}
                        className="pet-input text-base bg-white w-full"
                        placeholder="Cualquier otro dato del formulario…"
                      />
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
                        className="pet-select text-base"
                      />
                      {editingId && (
                        <div className="mt-3">
                          <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">
                            Historial de peso
                          </p>
                          <WeightHistoryList items={weightHistory} compact />
                        </div>
                      )}
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
                        className="pet-select text-base"
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
                      className="pet-btn pet-btn--ghost flex-1 px-4 py-3 font-bold"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="pet-btn pet-btn--primary flex-1 px-4 py-3 font-bold"
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
