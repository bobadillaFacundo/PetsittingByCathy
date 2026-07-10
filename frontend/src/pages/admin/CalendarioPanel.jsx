import React, { useState, useEffect } from 'react';
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
      const res = await fetch(`/api/animals/`, {
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
      const res = await fetch(`/api/reservations/`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        // Mapear a formato que usa react-big-calendar
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

  const handleSelectSlot = ({ start, end }) => {
    if (!isAdmin) return;
    setFormData({
      animal_id: '',
      start_date: formatForInput(start),
      end_date: formatForInput(end),
      status: 'Pendiente',
      notes: ''
    });
    setEditingId(null);
    setIsModalOpen(true);
  };

  const handleSelectEvent = (event) => {
    const r = event.resource;
    setFormData({
      animal_id: r.animal_id,
      start_date: formatForInput(r.start_date),
      end_date: formatForInput(r.end_date),
      status: r.status,
      notes: r.notes || ''
    });
    setEditingId(r.id);
    setIsModalOpen(true);
  };

  const saveReservation = async () => {
    if (!isAdmin) return;
    if (!formData.animal_id || !formData.start_date || !formData.end_date) {
      alert("Por favor, completa paciente y fechas.");
      return;
    }

    // Convertir de local a UTC string asumiendo el input local
    const payload = {
      animal_id: parseInt(formData.animal_id),
      start_date: new Date(formData.start_date).toISOString(),
      end_date: new Date(formData.end_date).toISOString(),
      status: formData.status,
      notes: formData.notes
    };

    try {
      const url = editingId ? `/api/reservations/${editingId}` : `/api/reservations/`;
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
        alert("Error al guardar reserva");
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
      const res = await fetch(`/api/reservations/${editingId}`, {
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
    let backgroundColor = '#3b82f6'; // blue-500
    if (event.resource.status === 'Confirmada') backgroundColor = '#10b981'; // green-500
    if (event.resource.status === 'Ingresada') backgroundColor = '#8b5cf6'; // violet-500
    if (event.resource.status === 'Llevar Veterinaria') backgroundColor = '#f97316'; // orange-500
    if (event.resource.status === 'Viene Veterinaria') backgroundColor = '#eab308'; // yellow-500
    if (event.resource.status === 'Llevar a Bañar') backgroundColor = '#06b6d4'; // cyan-500
    if (event.resource.status === 'Cancelada') backgroundColor = '#ef4444'; // red-500
    if (event.resource.status === 'Finalizada') backgroundColor = '#9ca3af'; // gray-400
    
    return {
      style: {
        backgroundColor,
        borderRadius: '5px',
        opacity: 0.9,
        color: 'white',
        border: '0px',
        display: 'block',
        fontWeight: 'bold',
        fontSize: '0.8rem'
      }
    };
  };

  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentView, setCurrentView] = useState('month');

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <CalendarIcon className="w-6 h-6 text-indigo-500" />
            Calendario de Reservas
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            {isAdmin ? "Arrastra para crear o haz clic en un evento para editarlo." : "Haz clic en un evento para ver los detalles."}
          </p>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap justify-end gap-2">
            <button 
              onClick={() => {
                const now = new Date();
                const in1h = new Date(now); in1h.setHours(now.getHours() + 1);
                setFormData({ animal_id: '', start_date: formatForInput(now), end_date: formatForInput(in1h), status: 'Llevar Veterinaria', notes: ''});
                setEditingId(null);
                setIsModalOpen(true);
              }}
              className="bg-orange-500 text-white px-3 py-2 rounded-xl text-sm font-bold flex items-center gap-1 hover:bg-orange-600 transition"
            >
              <Plus className="w-4 h-4" /> Llevar Vet
            </button>
            <button 
              onClick={() => {
                const now = new Date();
                const in1h = new Date(now); in1h.setHours(now.getHours() + 1);
                setFormData({ animal_id: '', start_date: formatForInput(now), end_date: formatForInput(in1h), status: 'Viene Veterinaria', notes: ''});
                setEditingId(null);
                setIsModalOpen(true);
              }}
              className="bg-yellow-500 text-white px-3 py-2 rounded-xl text-sm font-bold flex items-center gap-1 hover:bg-yellow-600 transition"
            >
              <Plus className="w-4 h-4" /> Viene Vet
            </button>
            <button 
              onClick={() => {
                const now = new Date();
                const in1h = new Date(now); in1h.setHours(now.getHours() + 1);
                setFormData({ animal_id: '', start_date: formatForInput(now), end_date: formatForInput(in1h), status: 'Llevar a Bañar', notes: ''});
                setEditingId(null);
                setIsModalOpen(true);
              }}
              className="bg-cyan-500 text-white px-3 py-2 rounded-xl text-sm font-bold flex items-center gap-1 hover:bg-cyan-600 transition"
            >
              <Plus className="w-4 h-4" /> Bañar
            </button>
            <button 
              onClick={() => {
                const now = new Date();
                const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
                handleSelectSlot({ start: now, end: tomorrow });
              }}
              className="bg-indigo-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 hover:bg-indigo-700 transition"
            >
              <Plus className="w-4 h-4" /> Nueva Reserva
            </button>
          </div>
        )}
      </div>

      <div style={{ height: '70vh' }}>
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

      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 animate-fade-in-up">
            <div className="flex justify-between items-center mb-6 border-b pb-4">
              <h3 className="text-lg font-bold text-gray-800">
                {editingId ? "Editar Reserva" : "Nueva Reserva"}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200">
                <X className="w-4 h-4 text-gray-600" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Paciente</label>
                <select 
                  className="w-full border border-gray-300 rounded-lg p-2 bg-gray-50 text-gray-800 disabled:opacity-70 disabled:bg-gray-100"
                  value={formData.animal_id}
                  onChange={(e) => setFormData({...formData, animal_id: e.target.value})}
                  disabled={!isAdmin}
                >
                  <option value="">Seleccione...</option>
                  {animals.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ingreso</label>
                  <input 
                    type="datetime-local" 
                    className="w-full border border-gray-300 rounded-lg p-2 bg-gray-50 text-gray-800 disabled:opacity-70 disabled:bg-gray-100"
                    value={formData.start_date}
                    onChange={(e) => setFormData({...formData, start_date: e.target.value})}
                    disabled={!isAdmin}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Salida</label>
                  <input 
                    type="datetime-local" 
                    className="w-full border border-gray-300 rounded-lg p-2 bg-gray-50 text-gray-800 disabled:opacity-70 disabled:bg-gray-100"
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
                  onChange={(e) => setFormData({...formData, status: e.target.value})}
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
