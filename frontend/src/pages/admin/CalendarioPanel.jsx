import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { Plus, X, Calendar as CalendarIcon, Save, Trash2, Search } from 'lucide-react';
import { parseApiDateTime, toApiDateTime, formatForInput, isAllDayAlert } from '../../lib/datetimeAr';
import { API_BASE, apiUrl, mediaUrl } from '../../lib/api';
import AgendaGroupedView from './AgendaGroupedView';

const locales = {
  'es': es,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

const SERVICE_STATUSES = new Set([
  'Llevar Veterinaria',
  'Viene Veterinaria',
  'Llevar a Bañar',
  'Otras actividades',
]);

const DAYCARE_RESERVATION_STATUSES = [
  { value: 'Pendiente', label: 'Pendiente (Azul)' },
  { value: 'Confirmada', label: 'Confirmada (Verde)' },
  { value: 'Ingresada', label: 'Ingresada en Guardería (Violeta)' },
  { value: 'Finalizada', label: 'Finalizada (Gris)' },
  { value: 'Cancelada', label: 'Cancelada (Rojo)' },
];

const SERVICE_STATUS_LABELS = {
  'Llevar Veterinaria': 'Llevar Veterinaria (Naranja)',
  'Viene Veterinaria': 'Viene Veterinaria (Amarillo)',
  'Llevar a Bañar': 'Llevar a Bañar (Celeste)',
  'Otras actividades': 'Otras actividades (Gris)',
};

const isServiceEvent = (status) => SERVICE_STATUSES.has(status);
const isOtherActivity = (status) => status === 'Otras actividades';

/** 'reservation' = estadía con varios estados; otro valor = servicio fijo */
const getStatusMode = (status) => (isServiceEvent(status) ? status : 'reservation');

const getStatusOptions = (mode) => {
  if (mode === 'reservation') return DAYCARE_RESERVATION_STATUSES;
  const label = SERVICE_STATUS_LABELS[mode] || mode;
  return [{ value: mode, label }];
};

const reservationTitle = (r) => {
  const desc = r.notes?.trim();
  if (r.status === 'Otras actividades') {
    const speciesKey = r.species_id || r.species?.id;
    const speciesInfo = speciesKey ? SPECIES_INFO[speciesKey] : null;
    const speciesLabel = speciesInfo
      ? `${speciesInfo.emoji} ${speciesInfo.name}`
      : (r.species?.name || null);
    const animalName = r.animal?.name;
    const parts = [];
    if (speciesLabel) parts.push(speciesLabel);
    if (animalName) parts.push(animalName);
    if (desc) parts.push(desc);
    const title = parts.length ? parts.join(' - ') : 'Otras actividades';
    return r.series_id ? `🔁 ${title}` : title;
  }
  const name = r.animal?.name || (r.animal_id ? `Paciente #${r.animal_id}` : 'Actividad');
  const prefix = r.series_id ? '🔁 ' : '';
  return `${prefix}${name} - ${r.status}`;
};

const SPECIES_INFO = {
  1: { name: "Perros", emoji: "🐶" },
  2: { name: "Gatos", emoji: "🐱" },
  3: { name: "Loros", emoji: "🦜" },
  4: { name: "Conejos", emoji: "🐰" },
  5: { name: "Tortugas", emoji: "🐢" },
  6: { name: "Erizos", emoji: "🦔" }
};

function eventSearchText(ev) {
  const r = ev.resource || {};
  return [
    ev.title,
    ev.status,
    r.status,
    r.notes,
    r.animal?.name,
    r.animal_name,
    r.alert_type,
    r.product_name,
    r.species?.name,
    r.recurrence,
    r.series_id ? 'serie recurrente' : '',
  ].filter(Boolean).join(' ').toLowerCase();
}

const RECURRENCE_OPTIONS = [
  { value: 'none', label: 'No se repite' },
  { value: 'daily', label: 'Todos los días' },
  { value: 'weekly', label: 'Todas las semanas' },
  { value: 'monthly', label: 'Todos los meses' },
  { value: 'yearly', label: 'Todos los años' },
];

const RECURRENCE_MAX = { daily: 366, weekly: 104, monthly: 36, yearly: 10 };

function toLocalIsoDate(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function defaultUntilDate(startLocal, freq) {
  if (!startLocal || freq === 'none') return '';
  const d = new Date(startLocal);
  if (Number.isNaN(d.getTime())) return '';
  if (freq === 'daily') d.setDate(d.getDate() + 30);
  if (freq === 'weekly') d.setDate(d.getDate() + 12 * 7);
  if (freq === 'monthly') d.setMonth(d.getMonth() + 12);
  if (freq === 'yearly') d.setFullYear(d.getFullYear() + 5);
  return toLocalIsoDate(d);
}

function countRecurrencePreview(startLocal, freq, until) {
  if (!startLocal || !until || freq === 'none') return 1;
  const start = new Date(startLocal);
  const end = new Date(`${until}T23:59:59`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  const max = RECURRENCE_MAX[freq] || 1;
  let n = 0;
  const cursor = new Date(start);
  while (cursor <= end && n < max) {
    n += 1;
    if (freq === 'daily') cursor.setDate(cursor.getDate() + 1);
    else if (freq === 'weekly') cursor.setDate(cursor.getDate() + 7);
    else if (freq === 'monthly') cursor.setMonth(cursor.getMonth() + 1);
    else if (freq === 'yearly') cursor.setFullYear(cursor.getFullYear() + 1);
    else break;
  }
  return n;
}

export default function CalendarioPanel() {
  const [events, setEvents] = useState([]);
  const [animals, setAnimals] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  
  // For multiple animal selection
  const [selectedSpecies, setSelectedSpecies] = useState('');
  const [selectedAnimalIds, setSelectedAnimalIds] = useState([]);
  
  // For photos upload
  const [photosToUpload, setPhotosToUpload] = useState([]);
  /** Tipo de evento al abrir el modal: 'reservation' o un estado de servicio fijo */
  const [statusMode, setStatusMode] = useState('reservation');

  const [formData, setFormData] = useState({
    animal_id: '',
    start_date: '',
    end_date: '',
    status: 'Pendiente',
    notes: '',
    belongings_photos: null,
    recurrence: 'none',
    recurrence_until: '',
    series_id: null,
  });

  const token = localStorage.getItem('token');

  const role = localStorage.getItem('role');
  const isAdmin = role === 'admin';

  const fetchAnimals = async () => {
    try {
      const res = await fetch(apiUrl('/animals'), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAnimals(data);
      }
    } catch (err) {
      console.error("Error fetching animals:", err);
    }
  };

  const fetchReservationsAndAlerts = useCallback(async (rangeStart, rangeEnd) => {
    try {
      const start = rangeStart || startOfMonth(subMonths(new Date(), 1));
      const end = rangeEnd || endOfMonth(addMonths(new Date(), 2));
      const startStr = format(start, 'yyyy-MM-dd');
      const endStr = format(end, 'yyyy-MM-dd');

      const [resRes, resAlerts] = await Promise.all([
        fetch(apiUrl('/reservations'), { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`${API_BASE}/calendar/alerts?start=${startStr}&end=${endStr}`, { headers: { 'Authorization': `Bearer ${token}` } })
      ]);

      let calendarEvents = [];
      
      if (resRes.ok) {
        const data = await resRes.json();
        const resEvents = data.map(r => ({
          id: r.id,
          title: reservationTitle(r),
          start: parseApiDateTime(r.start_date),
          end: parseApiDateTime(r.end_date),
          resource: r,
          isAlert: false
        }));
        calendarEvents = [...calendarEvents, ...resEvents];
      }
      
      if (resAlerts.ok) {
        const data = await resAlerts.json();
        const alertEvents = data.map(a => {
          const isAllDay = isAllDayAlert(a.due_date);
          let startEv = parseApiDateTime(a.due_date);
          let endEv = startEv;
          
          if (isAllDay) {
            startEv = new Date(startEv.getFullYear(), startEv.getMonth(), startEv.getDate(), 12, 0, 0);
            endEv = startEv;
          } else {
            endEv = new Date(startEv.getTime() + 30 * 60000);
          }

          return {
            id: a.id,
            title: `${a.alert_type}: ${a.animal_name} (${a.product_name})`,
            start: startEv,
            end: endEv,
            allDay: isAllDay,
            status: 'Alerta',
            isAlert: true,
            resource: a
          };
        });
        calendarEvents = [...calendarEvents, ...alertEvents];
      }

      setEvents(calendarEvents);
    } catch (err) {
      console.error("Error fetching calendar data:", err);
    }
  }, [token]);

  const handleCalendarRangeChange = useCallback((range) => {
    // month view: Date[]; week/day: { start, end }
    let start;
    let end;
    if (Array.isArray(range)) {
      start = range[0];
      end = range[range.length - 1];
    } else if (range?.start && range?.end) {
      start = range.start;
      end = range.end;
    }
    if (start && end) {
      fetchReservationsAndAlerts(start, end);
    }
  }, [fetchReservationsAndAlerts]);

  useEffect(() => {
    fetchAnimals();
    fetchReservationsAndAlerts();
  }, [fetchReservationsAndAlerts]);

  const selectableAnimals = useMemo(() => {
    // Vet / baño: solo guardería externa (is_daycare)
    if (isServiceEvent(formData.status)) {
      return animals.filter(a => a.is_daycare === true);
    }
    // Nueva Reserva: solo guardería (is_daycare=false)
    return animals.filter(a => a.is_daycare === false);
  }, [animals, formData.status]);

  const openModal = (data, id = null) => {
    setFormData({
      recurrence: 'none',
      recurrence_until: '',
      series_id: null,
      ...data,
      recurrence: data.recurrence || 'none',
      recurrence_until: data.recurrence_until || '',
      series_id: data.series_id || null,
    });
    setEditingId(id);
    setStatusMode(getStatusMode(data.status));
    setSelectedSpecies('');
    setSelectedAnimalIds([]);
    setPhotosToUpload([]);
    setIsModalOpen(true);
  };

  const handleSelectSlot = ({ start, end }) => {
    if (!isAdmin) return;
    openModal({
      animal_id: '',
      start_date: formatForInput(start),
      end_date: formatForInput(end),
      status: 'Pendiente',
      notes: '',
      belongings_photos: null
    });
  };

  const handleSelectEvent = (event) => {
    if (event.isAlert) {
      alert(`${event.title}\n\nEste es un evento generado automáticamente por vencimientos.`);
      return;
    }
    const r = event.resource;
    openModal({
      animal_id: r.animal_id || '',
      start_date: formatForInput(r.start_date),
      end_date: formatForInput(r.end_date),
      status: r.status,
      notes: r.notes || '',
      belongings_photos: r.belongings_photos || null,
      recurrence: r.recurrence || 'none',
      recurrence_until: r.recurrence_until || '',
      series_id: r.series_id || null,
    }, r.id);
    setSelectedSpecies(r.species_id ? String(r.species_id) : '');
    setSelectedAnimalIds([]);
  };

  const handleStatusChange = (status) => {
    const allowed = getStatusOptions(statusMode).map((o) => o.value);
    if (!allowed.includes(status)) return;
    const next = { ...formData, status };
    if (formData.animal_id && statusMode === 'reservation') {
      const selected = animals.find(a => String(a.id) === String(formData.animal_id));
      if (selected?.is_daycare !== false) next.animal_id = '';
    }
    setFormData(next);
  };

  const statusOptions = useMemo(() => getStatusOptions(statusMode), [statusMode]);
  const statusLocked = statusMode !== 'reservation';

  const saveReservation = async () => {
    if (!isAdmin) return;

    if (!formData.start_date || !formData.end_date) {
      alert("Por favor, completa las fechas.");
      return;
    }

    const isOther = isOtherActivity(formData.status);
    const speciesId = selectedSpecies ? parseInt(selectedSpecies, 10) : null;
    const recurrence = editingId ? undefined : (formData.recurrence || 'none');
    const recurrenceUntil = !editingId && recurrence && recurrence !== 'none'
      ? formData.recurrence_until
      : undefined;

    if (!editingId && recurrence && recurrence !== 'none' && !recurrenceUntil) {
      alert("Indicá hasta cuándo se repite la actividad.");
      return;
    }

    if (isOther && !formData.notes?.trim()) {
      alert("Por favor, ingresa una descripción para la actividad.");
      return;
    }

    const isMultiple = !editingId && !isOther && isServiceEvent(formData.status) && selectedAnimalIds.length > 0;
    const isOtherMulti = !editingId && isOther && selectedAnimalIds.length > 0;

    if (!isOther && !isMultiple && !formData.animal_id) {
      alert("Por favor, selecciona un paciente.");
      return;
    }

    const validateDaycareAnimal = (aId) => {
      const selected = animals.find(a => String(a.id) === String(aId));
      if (!selected || selected.is_daycare !== true) {
        alert("Vet / Baño / otras actividades solo se puede asignar a guardería externa.");
        return false;
      }
      return true;
    };

    if (isOtherMulti) {
      for (const aId of selectedAnimalIds) {
        if (!validateDaycareAnimal(aId)) return;
      }
    } else if (!isOther) {
      const animalIdsToCheck = isMultiple ? selectedAnimalIds : [parseInt(formData.animal_id, 10)];
      for (const aId of animalIdsToCheck) {
        const selected = animals.find(a => String(a.id) === String(aId));
        if (isServiceEvent(formData.status)) {
          if (!validateDaycareAnimal(aId)) return;
        } else if (!selected || selected.is_daycare !== false) {
          alert("Las reservas solo se pueden asignar a pacientes internos.");
          return;
        }
      }
    } else if (isOther && editingId && formData.animal_id) {
      if (!validateDaycareAnimal(formData.animal_id)) return;
    }

    try {
      const method = editingId ? "PUT" : "POST";

      const postOrPut = async (payload, id = null) => {
        const url = id
          ? `${API_BASE}/reservations/${id}`
          : apiUrl('/reservations');
        const res = await fetch(url, {
          method: id ? "PUT" : "POST",
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          let errMsg = "Error al guardar reserva";
          const errText = await res.text();
          try {
            const errJson = JSON.parse(errText);
            errMsg = errJson.detail
              ? (typeof errJson.detail === "string" ? errJson.detail : JSON.stringify(errJson.detail))
              : errMsg;
          } catch {
            if (errText && !errText.startsWith("<!")) errMsg = errText;
          }
          alert(errMsg);
          return null;
        }
        return res.json();
      };

      const recurrenceFields = !editingId ? {
        recurrence: recurrence || 'none',
        recurrence_until: recurrenceUntil || null,
      } : {};

      if (isOther && editingId) {
        const savedData = await postOrPut({
          animal_id: formData.animal_id ? parseInt(formData.animal_id, 10) : null,
          species_id: speciesId,
          start_date: toApiDateTime(formData.start_date),
          end_date: toApiDateTime(formData.end_date),
          status: formData.status,
          notes: formData.notes,
        }, editingId);
        if (!savedData) return;
      } else if (isOtherMulti) {
        for (const aId of selectedAnimalIds) {
          const savedData = await postOrPut({
            animal_id: aId,
            species_id: speciesId,
            start_date: toApiDateTime(formData.start_date),
            end_date: toApiDateTime(formData.end_date),
            status: formData.status,
            notes: formData.notes,
            ...recurrenceFields,
          });
          if (!savedData) return;
        }
      } else if (isOther) {
        const savedData = await postOrPut({
          animal_id: null,
          species_id: speciesId,
          start_date: toApiDateTime(formData.start_date),
          end_date: toApiDateTime(formData.end_date),
          status: formData.status,
          notes: formData.notes,
          ...recurrenceFields,
        });
        if (!savedData) return;
      } else {
        const animalIdsToSave = isMultiple ? selectedAnimalIds : [parseInt(formData.animal_id, 10)];
        for (const aId of animalIdsToSave) {
          const savedData = await postOrPut({
            animal_id: aId,
            start_date: toApiDateTime(formData.start_date),
            end_date: toApiDateTime(formData.end_date),
            status: formData.status,
            notes: formData.notes,
            ...recurrenceFields,
          }, editingId || null);
          if (!savedData) return;

          if (photosToUpload.length > 0) {
            const formDataObj = new FormData();
            photosToUpload.forEach(p => formDataObj.append('photos', p));
            await fetch(`${API_BASE}/reservations/${savedData.id}/photos`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${token}` },
              body: formDataObj,
            });
          }
        }
        setIsModalOpen(false);
        fetchReservationsAndAlerts();
        return;
      }

      setIsModalOpen(false);
      fetchReservationsAndAlerts();
    } catch (err) {
      console.error(err);
      alert("Error de red al guardar");
    }
  };

  const deleteReservation = async (scope = 'one') => {
    if (!isAdmin) return;
    if (!editingId) return;
    const message = scope === 'following'
      ? "¿Borrar esta actividad y todas las siguientes de la serie?"
      : "¿Seguro que deseas cancelar/borrar esta reserva?";
    if (!window.confirm(message)) return;

    try {
      const qs = scope === 'following' ? '?scope=following' : '';
      const res = await fetch(`${API_BASE}/reservations/${editingId}${qs}`, {
        method: "DELETE",
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (res.ok) {
        setIsModalOpen(false);
        fetchReservationsAndAlerts();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const eventStyleGetter = (event) => {
    let backgroundColor = '#3b82f6';
    if (event.resource.status === 'Confirmada') backgroundColor = '#10b981';
    if (event.resource.status === 'Ingresada') backgroundColor = '#8b5cf6';
    if (event.resource.status === 'Llevar Veterinaria') backgroundColor = '#f97316';
    if (event.resource.status === 'Viene Veterinaria') backgroundColor = '#eab308';
    if (event.resource.status === 'Llevar a Bañar') backgroundColor = '#06b6d4';
    if (event.resource.status === 'Otras actividades') backgroundColor = '#64748b';
    if (event.resource.status === 'Cancelada') backgroundColor = '#ef4444';
    if (event.resource.status === 'Finalizada') backgroundColor = '#9ca3af';
    if (event.status === 'Alerta') {
      if (event.id && typeof event.id === 'string' && event.id.startsWith('alert-med-')) {
        backgroundColor = '#8b5cf6'; // Purple for medication
      } else {
        backgroundColor = '#ec4899'; // Pink for vaccine/deworming alerts
      }
    }
    
    return {
      style: {
        backgroundColor,
        borderRadius: '6px',
        opacity: 1,
        color: 'white',
        border: '2px solid #ffffff',
        display: 'block',
        fontWeight: 'bold',
        fontSize: '0.8rem',
        padding: '2px 4px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }
    };
  };

  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentView, setCurrentView] = useState('month');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  const frequentActivities = useMemo(() => {
    const counts = new Map();
    for (const ev of events) {
      if (ev.resource?.status !== 'Otras actividades') continue;
      const note = (ev.resource?.notes || '').trim();
      if (!note) continue;
      const key = note.toLowerCase();
      const prev = counts.get(key);
      if (prev) prev.count += 1;
      else counts.set(key, { note, count: 1 });
    }
    return [...counts.values()]
      .sort((a, b) => b.count - a.count || a.note.localeCompare(b.note, 'es'))
      .slice(0, 8);
  }, [events]);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return events
      .filter((ev) => eventSearchText(ev).includes(q))
      .sort((a, b) => (b.start?.getTime?.() || 0) - (a.start?.getTime?.() || 0))
      .slice(0, 12);
  }, [events, searchQuery]);

  const jumpToSearchResult = (event) => {
    setSearchOpen(false);
    setSearchQuery('');
    if (event.start) {
      setCurrentDate(event.start);
      setCurrentView('day');
    }
    handleSelectEvent(event);
  };

  const openQuickService = (status) => {
    const now = new Date();
    const in1h = new Date(now); in1h.setHours(now.getHours() + 1);
    openModal({
      animal_id: '',
      start_date: formatForInput(now),
      end_date: formatForInput(in1h),
      status,
      notes: ''
    });
  };

  const patientLabel = isServiceEvent(formData.status)
    ? 'Paciente (guardería externa)'
    : 'Paciente interno';

  return (
    <div className="pet-panel p-3 sm:p-6">
      <div className="flex flex-col gap-4 mb-4 sm:mb-6">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-gray-800 flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-500 shrink-0" />
            Calendario de Reservas
          </h2>
          <p className="text-gray-500 text-xs sm:text-sm mt-1">
            {isAdmin
              ? "Nueva Reserva: guardería. Vet/Baño/otras actividades: solo guardería externa."
              : "Haz clic en un evento para ver los detalles."}
          </p>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <button 
              onClick={() => openQuickService('Llevar Veterinaria')}
              className="bg-orange-500 text-white px-3 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1 hover:bg-orange-600 transition"
            >
              <Plus className="w-4 h-4" /> Llevar Vet
            </button>
            <button 
              onClick={() => openQuickService('Viene Veterinaria')}
              className="bg-yellow-500 text-white px-3 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1 hover:bg-yellow-600 transition"
            >
              <Plus className="w-4 h-4" /> Viene Vet
            </button>
            <button 
              onClick={() => openQuickService('Llevar a Bañar')}
              className="bg-cyan-500 text-white px-3 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1 hover:bg-cyan-600 transition"
            >
              <Plus className="w-4 h-4" /> Bañar
            </button>
            <button 
              onClick={() => openQuickService('Otras actividades')}
              className="bg-slate-600 text-white px-3 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1 hover:bg-slate-700 transition"
            >
              <Plus className="w-4 h-4" /> Otras actividades
            </button>
            <button 
              onClick={() => {
                const now = new Date();
                const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
                handleSelectSlot({ start: now, end: tomorrow });
              }}
              className="pet-btn pet-btn--primary px-3 sm:px-4 py-2.5 text-xs sm:text-sm"
            >
              <Plus className="w-4 h-4" /> Nueva Reserva
            </button>
          </div>
        )}
        <div className="relative w-full sm:max-w-md">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSearchOpen(true);
            }}
            onFocus={() => setSearchOpen(true)}
            onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
            placeholder="Buscar actividad pasada o frecuente..."
            className="w-full border border-gray-300 rounded-xl pl-9 pr-9 py-2.5 bg-gray-50 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => { setSearchQuery(''); setSearchOpen(false); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
              aria-label="Limpiar búsqueda"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          {searchOpen && searchQuery.trim().length >= 2 && (
            <ul className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-64 overflow-y-auto">
              {searchResults.length === 0 && (
                <li className="px-3 py-3 text-sm text-gray-400 italic">No hay coincidencias.</li>
              )}
              {searchResults.map((ev) => (
                <li key={`${ev.id}-${ev.start?.getTime?.() || 0}`}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => jumpToSearchResult(ev)}
                    className="w-full text-left px-3 py-2.5 hover:bg-indigo-50 border-b border-gray-100 last:border-0"
                  >
                    <p className="text-sm font-medium text-gray-800 truncate">{ev.title}</p>
                    <p className="text-xs text-gray-500">
                      {ev.start ? format(ev.start, "d MMM yyyy · HH:mm", { locale: es }) : ''}
                      {ev.resource?.notes ? ` · ${ev.resource.notes}` : ''}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="h-[55dvh] sm:h-[65dvh] min-h-[320px] overflow-x-auto scroll-touch -mx-1">
        <div className="min-w-[320px] h-full">
          <Calendar
            localizer={localizer}
            events={events}
            startAccessor="start"
            endAccessor="end"
            style={{ height: '100%', fontFamily: 'Inter, sans-serif' }}
            selectable={isAdmin}
            onSelectSlot={isAdmin ? handleSelectSlot : undefined}
            onSelectEvent={handleSelectEvent}
            eventPropGetter={eventStyleGetter}
            date={currentDate}
            onNavigate={(newDate) => setCurrentDate(newDate)}
            onRangeChange={handleCalendarRangeChange}
            view={currentView}
            onView={(newView) => setCurrentView(newView)}
            views={{
              month: true,
              week: true,
              day: true,
              agenda: AgendaGroupedView,
            }}
            culture="es"
            dayLayoutAlgorithm="no-overlap"
            messages={{
              next: "Sig",
              previous: "Ant",
              today: "Hoy",
              month: "Mes",
              week: "Semana",
              day: "Día",
              agenda: "Agenda",
              date: "Fecha",
              time: "Hora",
              event: "Evento",
              noEventsInRange: "No hay eventos en este rango."
            }}
          />
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full max-w-md p-5 sm:p-6 modal-sheet pb-[max(1.25rem,var(--safe-bottom))] sm:pb-6">
            <div className="flex justify-between items-center mb-4 sm:mb-6 border-b pb-3 sm:pb-4">
              <h3 className="text-lg font-bold text-gray-800">
                {editingId
                  ? (isOtherActivity(formData.status) ? "Editar actividad" : "Editar Reserva")
                  : (isOtherActivity(formData.status) ? "Otras actividades" : "Nueva Reserva")}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200">
                <X className="w-4 h-4 text-gray-600" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                {isOtherActivity(formData.status) ? (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Especie (opcional)</label>
                      <select
                        className="w-full border border-gray-300 rounded-lg p-2 bg-gray-50 text-gray-800 disabled:opacity-70 disabled:bg-gray-100"
                        value={selectedSpecies}
                        onChange={(e) => {
                          setSelectedSpecies(e.target.value);
                          setSelectedAnimalIds([]);
                          if (editingId) setFormData({ ...formData, animal_id: '' });
                        }}
                        disabled={!isAdmin}
                      >
                        <option value="">Sin especie definida</option>
                        {Object.entries(SPECIES_INFO).map(([id, info]) => (
                          <option key={id} value={id}>
                            {info.emoji} {info.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {selectedSpecies && (
                      !editingId ? (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Pacientes (opcional)</label>
                          <div className="border border-gray-200 rounded-lg p-3 max-h-40 overflow-y-auto bg-gray-50">
                            <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-200">
                              <input
                                type="checkbox"
                                id="select-all-other"
                                checked={
                                  selectableAnimals.filter(a => String(a.species_id) === selectedSpecies).length > 0 &&
                                  selectedAnimalIds.length === selectableAnimals.filter(a => String(a.species_id) === selectedSpecies).length
                                }
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    const ids = selectableAnimals
                                      .filter(a => String(a.species_id) === selectedSpecies)
                                      .map(a => a.id);
                                    setSelectedAnimalIds(ids);
                                  } else {
                                    setSelectedAnimalIds([]);
                                  }
                                }}
                              />
                              <label htmlFor="select-all-other" className="text-sm font-bold text-gray-800">Seleccionar todos</label>
                            </div>
                            {selectableAnimals
                              .filter(a => String(a.species_id) === selectedSpecies)
                              .map(a => (
                                <div key={a.id} className="flex items-center gap-2 mb-1.5 last:mb-0">
                                  <input
                                    type="checkbox"
                                    id={`animal-other-${a.id}`}
                                    checked={selectedAnimalIds.includes(a.id)}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setSelectedAnimalIds(prev => [...prev, a.id]);
                                      } else {
                                        setSelectedAnimalIds(prev => prev.filter(id => id !== a.id));
                                      }
                                    }}
                                  />
                                  <label htmlFor={`animal-other-${a.id}`} className="text-sm text-gray-700">
                                    {a.name}
                                  </label>
                                </div>
                              ))}
                            {selectableAnimals.filter(a => String(a.species_id) === selectedSpecies).length === 0 && (
                              <p className="text-xs text-gray-500 italic">No hay pacientes para esta especie.</p>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Paciente (opcional)</label>
                          <select
                            className="w-full border border-gray-300 rounded-lg p-2 bg-gray-50 text-gray-800 disabled:opacity-70 disabled:bg-gray-100"
                            value={formData.animal_id}
                            onChange={(e) => setFormData({ ...formData, animal_id: e.target.value })}
                            disabled={!isAdmin}
                          >
                            <option value="">Ningún paciente</option>
                            {selectableAnimals
                              .filter(a => String(a.species_id) === selectedSpecies)
                              .map(a => (
                                <option key={a.id} value={a.id}>{a.name}</option>
                              ))}
                          </select>
                        </div>
                      )
                    )}
                  </div>
                ) : !editingId && isServiceEvent(formData.status) ? (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Especie</label>
                      <select 
                        className="w-full border border-gray-300 rounded-lg p-2 bg-gray-50 text-gray-800 disabled:opacity-70 disabled:bg-gray-100"
                        value={selectedSpecies}
                        onChange={(e) => {
                          setSelectedSpecies(e.target.value);
                          setSelectedAnimalIds([]);
                        }}
                        disabled={!isAdmin}
                      >
                        <option value="">Todas las especies</option>
                        {Object.entries(SPECIES_INFO).map(([id, info]) => (
                          <option key={id} value={id}>
                            {info.emoji} {info.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    
                    <div className="border border-gray-200 rounded-lg p-3 max-h-40 overflow-y-auto bg-gray-50">
                      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-200">
                        <input 
                          type="checkbox" 
                          id="select-all"
                          checked={
                            selectableAnimals.filter(a => !selectedSpecies || String(a.species_id) === selectedSpecies).length > 0 &&
                            selectedAnimalIds.length === selectableAnimals.filter(a => !selectedSpecies || String(a.species_id) === selectedSpecies).length
                          }
                          onChange={(e) => {
                            if (e.target.checked) {
                              const ids = selectableAnimals
                                .filter(a => !selectedSpecies || String(a.species_id) === selectedSpecies)
                                .map(a => a.id);
                              setSelectedAnimalIds(ids);
                            } else {
                              setSelectedAnimalIds([]);
                            }
                          }}
                        />
                        <label htmlFor="select-all" className="text-sm font-bold text-gray-800">Seleccionar todos</label>
                      </div>
                      {selectableAnimals
                        .filter(a => !selectedSpecies || String(a.species_id) === selectedSpecies)
                        .map(a => (
                          <div key={a.id} className="flex items-center gap-2 mb-1.5 last:mb-0">
                            <input 
                              type="checkbox" 
                              id={`animal-${a.id}`}
                              checked={selectedAnimalIds.includes(a.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedAnimalIds(prev => [...prev, a.id]);
                                } else {
                                  setSelectedAnimalIds(prev => prev.filter(id => id !== a.id));
                                }
                              }}
                            />
                            <label htmlFor={`animal-${a.id}`} className="text-sm text-gray-700">
                              {a.name}
                            </label>
                          </div>
                        ))}
                    </div>
                  </div>
                ) : (
                  <>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{patientLabel}</label>
                    <select 
                      className="w-full border border-gray-300 rounded-lg p-2 bg-gray-50 text-gray-800 disabled:opacity-70 disabled:bg-gray-100"
                      value={formData.animal_id}
                      onChange={(e) => setFormData({...formData, animal_id: e.target.value})}
                      disabled={!isAdmin}
                    >
                      <option value="">Seleccione...</option>
                      {selectableAnimals.map(a => (
                        <option key={a.id} value={a.id}>
                          {a.name}{a.is_daycare ? ' (guard. externa)' : ''}
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ingreso</label>
                  <input 
                    type="datetime-local" 
                    className="w-full border border-gray-300 rounded-lg p-2.5 bg-gray-50 text-gray-800 disabled:opacity-70 disabled:bg-gray-100"
                    value={formData.start_date}
                    onChange={(e) => {
                      const start_date = e.target.value;
                      const next = { ...formData, start_date };
                      if (!editingId && formData.recurrence !== 'none') {
                        next.recurrence_until = defaultUntilDate(start_date, formData.recurrence);
                      }
                      setFormData(next);
                    }}
                    disabled={!isAdmin}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Salida</label>
                  <input 
                    type="datetime-local" 
                    className="w-full border border-gray-300 rounded-lg p-2.5 bg-gray-50 text-gray-800 disabled:opacity-70 disabled:bg-gray-100"
                    value={formData.end_date}
                    onChange={(e) => setFormData({...formData, end_date: e.target.value})}
                    disabled={!isAdmin}
                  />
                </div>
              </div>

              {!editingId && isAdmin && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Repetición</label>
                    <select
                      className="w-full border border-gray-300 rounded-lg p-2 bg-gray-50 text-gray-800"
                      value={formData.recurrence || 'none'}
                      onChange={(e) => {
                        const recurrence = e.target.value;
                        setFormData({
                          ...formData,
                          recurrence,
                          recurrence_until: defaultUntilDate(formData.start_date, recurrence),
                        });
                      }}
                    >
                      {RECURRENCE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  {formData.recurrence && formData.recurrence !== 'none' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Hasta</label>
                      <input
                        type="date"
                        className="w-full border border-gray-300 rounded-lg p-2.5 bg-gray-50 text-gray-800"
                        value={formData.recurrence_until || ''}
                        min={formData.start_date ? formData.start_date.slice(0, 10) : undefined}
                        onChange={(e) => setFormData({ ...formData, recurrence_until: e.target.value })}
                      />
                      <p className="text-[11px] text-gray-500 mt-1">
                        Se crearán {countRecurrencePreview(formData.start_date, formData.recurrence, formData.recurrence_until)} eventos.
                      </p>
                    </div>
                  )}
                </div>
              )}
              {editingId && formData.series_id && (
                <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                  🔁 Forma parte de una serie {RECURRENCE_OPTIONS.find((o) => o.value === formData.recurrence)?.label?.toLowerCase() || 'recurrente'}.
                  Editar cambia solo esta fecha.
                </p>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {statusLocked ? 'Tipo de evento' : 'Estado de la reserva'}
                </label>
                {statusLocked ? (
                  <div className="w-full border border-gray-200 rounded-lg p-2.5 bg-gray-100 text-gray-700 font-medium">
                    {SERVICE_STATUS_LABELS[statusMode] || formData.status}
                  </div>
                ) : (
                  <select
                    className="w-full border border-gray-300 rounded-lg p-2 bg-gray-50 text-gray-800 disabled:opacity-70 disabled:bg-gray-100"
                    value={formData.status}
                    onChange={(e) => handleStatusChange(e.target.value)}
                    disabled={!isAdmin}
                  >
                    {statusOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {isOtherActivity(formData.status) ? 'Descripción de la actividad *' : 'Notas (Opcional)'}
                </label>
                <textarea 
                  className="w-full border border-gray-300 rounded-lg p-2 bg-gray-50 text-gray-800 disabled:opacity-70 disabled:bg-gray-100"
                  rows="3"
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  placeholder={isOtherActivity(formData.status)
                    ? "Ej. Paseo en el parque, entrenamiento, visita familiar..."
                    : "Ej. Viene con su propia comida..."}
                  disabled={!isAdmin}
                  required={isOtherActivity(formData.status)}
                ></textarea>
                {isAdmin && isOtherActivity(formData.status) && frequentActivities.length > 0 && (
                  <div className="mt-2">
                    <p className="text-[11px] font-medium text-gray-500 mb-1.5">Frecuentes / anteriores</p>
                    <div className="flex flex-wrap gap-1.5">
                      {frequentActivities
                        .filter((item) => {
                          const q = formData.notes.trim().toLowerCase();
                          return !q || item.note.toLowerCase().includes(q);
                        })
                        .slice(0, 6)
                        .map((item) => (
                          <button
                            key={item.note}
                            type="button"
                            onClick={() => setFormData({ ...formData, notes: item.note })}
                            className={`text-xs px-2 py-1 rounded-full border transition ${
                              formData.notes.trim().toLowerCase() === item.note.toLowerCase()
                                ? 'bg-slate-600 text-white border-slate-600'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {item.note}
                            {item.count > 1 ? ` (${item.count})` : ''}
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </div>
              
              {!isServiceEvent(formData.status) && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fotos de pertenencias (Opcional)</label>
                <input 
                  type="file" 
                  multiple
                  accept="image/*"
                  className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                  onChange={(e) => setPhotosToUpload(Array.from(e.target.files))}
                  disabled={!isAdmin}
                />
                {photosToUpload.length > 0 && (
                  <p className="text-xs text-gray-500 mt-1">{photosToUpload.length} foto(s) seleccionada(s)</p>
                )}
                {formData.belongings_photos && (() => {
                  try {
                    const urls = typeof formData.belongings_photos === 'string' 
                      ? JSON.parse(formData.belongings_photos)
                      : formData.belongings_photos;
                    if (!Array.isArray(urls) || urls.length === 0) return null;
                    return (
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        {urls.map((url, i) => (
                          <div key={i} className="relative aspect-square">
                            <img 
                              src={mediaUrl(url)} 
                              alt="Pertenencia" 
                              className="w-full h-full object-cover rounded-lg border border-gray-200"
                            />
                          </div>
                        ))}
                      </div>
                    );
                  } catch (e) {
                    return null;
                  }
                })()}
              </div>
              )}
              
              {isAdmin && (
                <div className="flex gap-2 pt-4">
                  <button 
                    onClick={saveReservation}
                    className="pet-btn pet-btn--primary flex-1 py-2 font-medium"
                  >
                    <Save className="w-4 h-4" /> Guardar
                  </button>
                  {editingId && (
                    <button 
                      onClick={() => deleteReservation('one')}
                      className="pet-btn pet-btn--danger px-4 rounded-xl font-medium"
                      title="Borrar solo esta"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}
              {isAdmin && editingId && formData.series_id && (
                <button
                  type="button"
                  onClick={() => deleteReservation('following')}
                  className="w-full text-xs text-red-600 hover:text-red-700 font-medium py-1"
                >
                  Borrar esta y las siguientes de la serie
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
