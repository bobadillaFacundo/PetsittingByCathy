import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { es } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { Plus, X, Calendar as CalendarIcon, Save, Trash2 } from 'lucide-react';

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
]);

const isServiceEvent = (status) => SERVICE_STATUSES.has(status);

export default function CalendarioPanel() {
  const [events, setEvents] = useState([]);
  const [animals, setAnimals] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    animal_id: '',
    start_date: '',
    end_date: '',
    status: 'Pendiente',
    notes: ''
  });

  const token = localStorage.getItem('token');

  const role = localStorage.getItem('role');
  const isAdmin = role === 'admin';

  useEffect(() => {
    fetchAnimals();
    fetchReservations();
  }, []);

  const fetchAnimals = async () => {
    try {
      const res = await fetch(`https://petsittingbycathy.onrender.com/animals/`, {
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

  const fetchReservations = async () => {
    try {
      const res = await fetch(`https://petsittingbycathy.onrender.com/reservations/`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const calendarEvents = data.map(r => ({
          id: r.id,
          title: `${r.animal?.name || `Paciente #${r.animal_id}`} - ${r.status}`,
          start: new Date(r.start_date),
          end: new Date(r.end_date),
          resource: r
        }));
        setEvents(calendarEvents);
      }
    } catch (err) {
      console.error("Error fetching reservations:", err);
    }
  };

  const selectableAnimals = useMemo(() => {
    // Vet / baño: solo mascotas de guardería
    if (isServiceEvent(formData.status)) {
      return animals.filter(a => a.is_daycare === true);
    }
    // Nueva Reserva: solo mascotas externas
    return animals.filter(a => a.is_daycare === false);
  }, [animals, formData.status]);

  const openModal = (data, id = null) => {
    setFormData(data);
    setEditingId(id);
    setIsModalOpen(true);
  };

  const handleSelectSlot = ({ start, end }) => {
    if (!isAdmin) return;
    openModal({
      animal_id: '',
      start_date: formatForInput(start),
      end_date: formatForInput(end),
      status: 'Pendiente',
      notes: ''
    });
  };

  const handleSelectEvent = (event) => {
    const r = event.resource;
    openModal({
      animal_id: r.animal_id,
      start_date: formatForInput(r.start_date),
      end_date: formatForInput(r.end_date),
      status: r.status,
      notes: r.notes || ''
    }, r.id);
  };

  const handleStatusChange = (status) => {
    const next = { ...formData, status };
    if (formData.animal_id) {
      const selected = animals.find(a => String(a.id) === String(formData.animal_id));
      const ok = isServiceEvent(status)
        ? selected?.is_daycare === true
        : selected?.is_daycare === false;
      if (!ok) next.animal_id = '';
    }
    setFormData(next);
  };

  const saveReservation = async () => {
    if (!isAdmin) return;
    if (!formData.animal_id || !formData.start_date || !formData.end_date) {
      alert("Por favor, completa paciente y fechas.");
      return;
    }

    const selected = animals.find(a => String(a.id) === String(formData.animal_id));
    if (isServiceEvent(formData.status)) {
      if (!selected || selected.is_daycare !== true) {
        alert("Vet / Baño solo se puede asignar a mascotas de guardería.");
        return;
      }
    } else if (!selected || selected.is_daycare !== false) {
      alert("Las reservas solo se pueden asignar a mascotas externas.");
      return;
    }

    const payload = {
      animal_id: parseInt(formData.animal_id),
      start_date: new Date(formData.start_date).toISOString(),
      end_date: new Date(formData.end_date).toISOString(),
      status: formData.status,
      notes: formData.notes
    };

    try {
      const url = editingId ? `https://petsittingbycathy.onrender.com/reservations/${editingId}` : `https://petsittingbycathy.onrender.com/reservations/`;
      const method = editingId ? "PUT" : "POST";
      
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
        fetchReservations();
      } else {
        const errText = await res.text();
        alert(errText || "Error al guardar reserva");
      }
    } catch (err) {
      console.error(err);
      alert("Error de red");
    }
  };

  const deleteReservation = async () => {
    if (!isAdmin) return;
    if (!editingId || !window.confirm("¿Seguro que deseas cancelar/borrar esta reserva?")) return;
    
    try {
      const res = await fetch(`https://petsittingbycathy.onrender.com/reservations/${editingId}`, {
        method: "DELETE",
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (res.ok) {
        setIsModalOpen(false);
        fetchReservations();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const formatForInput = (d) => {
    const dateObj = new Date(d);
    const offset = dateObj.getTimezoneOffset() * 60000;
    return new Date(dateObj.getTime() - offset).toISOString().slice(0, 16);
  };

  const eventStyleGetter = (event) => {
    let backgroundColor = '#3b82f6';
    if (event.resource.status === 'Confirmada') backgroundColor = '#10b981';
    if (event.resource.status === 'Ingresada') backgroundColor = '#8b5cf6';
    if (event.resource.status === 'Llevar Veterinaria') backgroundColor = '#f97316';
    if (event.resource.status === 'Viene Veterinaria') backgroundColor = '#eab308';
    if (event.resource.status === 'Llevar a Bañar') backgroundColor = '#06b6d4';
    if (event.resource.status === 'Cancelada') backgroundColor = '#ef4444';
    if (event.resource.status === 'Finalizada') backgroundColor = '#9ca3af';
    
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
    ? 'Paciente de guardería'
    : 'Paciente (mascota externa)';

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3 sm:p-6">
      <div className="flex flex-col gap-4 mb-4 sm:mb-6">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-gray-800 flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-500 shrink-0" />
            Calendario de Reservas
          </h2>
          <p className="text-gray-500 text-xs sm:text-sm mt-1">
            {isAdmin
              ? "Nueva Reserva: externas. Vet/Baño: solo guardería."
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
              onClick={() => {
                const now = new Date();
                const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
                handleSelectSlot({ start: now, end: tomorrow });
              }}
              className="bg-indigo-600 text-white px-3 sm:px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 hover:bg-indigo-700 transition"
            >
              <Plus className="w-4 h-4" /> Nueva Reserva
            </button>
          </div>
        )}
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
            view={currentView}
            onView={(newView) => setCurrentView(newView)}
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
                {editingId ? "Editar Reserva" : "Nueva Reserva"}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200">
                <X className="w-4 h-4 text-gray-600" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
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
                      {a.name}{a.is_daycare ? ' (guardería)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ingreso</label>
                  <input 
                    type="datetime-local" 
                    className="w-full border border-gray-300 rounded-lg p-2.5 bg-gray-50 text-gray-800 disabled:opacity-70 disabled:bg-gray-100"
                    value={formData.start_date}
                    onChange={(e) => setFormData({...formData, start_date: e.target.value})}
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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Estado / Tipo de Evento</label>
                <select 
                  className="w-full border border-gray-300 rounded-lg p-2 bg-gray-50 text-gray-800 disabled:opacity-70 disabled:bg-gray-100"
                  value={formData.status}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  disabled={!isAdmin}
                >
                  <option value="Pendiente">Pendiente (Azul)</option>
                  <option value="Confirmada">Confirmada (Verde)</option>
                  <option value="Ingresada">Ingresada en Guardería (Violeta)</option>
                  <option value="Llevar Veterinaria">Llevar Veterinaria (Naranja)</option>
                  <option value="Viene Veterinaria">Viene Veterinaria (Amarillo)</option>
                  <option value="Llevar a Bañar">Llevar a Bañar (Celeste)</option>
                  <option value="Finalizada">Finalizada (Gris)</option>
                  <option value="Cancelada">Cancelada (Rojo)</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notas (Opcional)</label>
                <textarea 
                  className="w-full border border-gray-300 rounded-lg p-2 bg-gray-50 text-gray-800 disabled:opacity-70 disabled:bg-gray-100"
                  rows="3"
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  placeholder="Ej. Viene con su propia comida..."
                  disabled={!isAdmin}
                ></textarea>
              </div>
              
              {isAdmin && (
                <div className="flex gap-2 pt-4">
                  <button 
                    onClick={saveReservation}
                    className="flex-1 bg-indigo-600 text-white py-2 rounded-xl font-medium hover:bg-indigo-700 flex justify-center items-center gap-2"
                  >
                    <Save className="w-4 h-4" /> Guardar
                  </button>
                  {editingId && (
                    <button 
                      onClick={deleteReservation}
                      className="bg-red-50 text-red-600 px-4 rounded-xl font-medium hover:bg-red-100"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
