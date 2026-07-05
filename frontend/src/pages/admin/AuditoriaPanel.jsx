import { useState, useEffect, useMemo, useRef } from 'react';
import { Send, RefreshCw, Activity, CheckCircle2, Filter, Mic, Square, Download } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

export default function AuditoriaPanel() {
  const [reports, setReports] = useState([]);
  const [mascotas, setMascotas] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [selectedAnimal, setSelectedAnimal] = useState('');
  const [textInput, setTextInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  const mediaRecorder = useRef(null);
  const audioChunks = useRef([]);

  // Filtro
  const [filterAnimal, setFilterAnimal] = useState('Todos');

  const handleAnimalSelect = (e) => {
    const val = e.target.value;
    setSelectedAnimal(val);
    if (val) {
      setFilterAnimal(val);
    }
  };

  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');

  const COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

  useEffect(() => {
    fetchMascotas();
    fetchReports();
  }, []);

  const fetchMascotas = async () => {
    try {
      const res = await fetch('http://localhost:8000/animals/', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!res.ok) {
        if (res.status === 401) {
           window.location.href = '/login';
        }
        throw new Error("No se pudo cargar animales.");
      }
      const data = await res.json();
      setMascotas(Array.isArray(data) ? data.filter(m => m.is_active) : []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchReports = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('http://localhost:8000/reports/all?limit=50', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!res.ok) {
        if (res.status === 401) {
           window.location.href = '/login';
        }
        throw new Error("No se pudo cargar el historial.");
      }
      
      const data = await res.json();
      setReports(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    if (!selectedAnimal || !textInput.trim()) return;

    setIsSubmitting(true);
    try {
      // 1. Enviar texto para análisis de IA
      const analyzeRes = await fetch('http://localhost:8000/reports/analyze-text', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          animal_name: selectedAnimal,
          text: textInput
        })
      });
      
      const analyzeData = await analyzeRes.json();
      
      if (!analyzeRes.ok) {
        throw new Error("Error en análisis IA");
      }

      // 2. Auto-Confirmar para insertarlo directo a la BD
      const confirmRes = await fetch('http://localhost:8000/reports/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          user_id: 1, // hardcoded admin/system for now
          transcript: analyzeData.transcript,
          extracted_data: analyzeData.extracted_data
        })
      });

      if (confirmRes.ok) {
        setTextInput('');
        fetchReports(); // Recargar historial
      } else {
        throw new Error("Error al confirmar el reporte");
      }
      
    } catch (err) {
      alert("Hubo un error al procesar el reporte: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const startRecording = async () => {
    if (!selectedAnimal) {
      alert("Por favor selecciona una mascota primero.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder.current = new MediaRecorder(stream);
      audioChunks.current = [];

      mediaRecorder.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.current.push(event.data);
        }
      };

      mediaRecorder.current.onstop = handleAudioSubmit;
      
      mediaRecorder.current.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error micrófono:", err);
      alert("No se pudo acceder al micrófono.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current && isRecording) {
      mediaRecorder.current.stop();
      mediaRecorder.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
    }
  };

  const handleAudioSubmit = async () => {
    setIsSubmitting(true);
    try {
      const audioBlob = new Blob(audioChunks.current, { type: 'audio/webm' });
      const formData = new FormData();
      formData.append("audio_file", audioBlob, "reporte.webm");
      formData.append("animal_name", selectedAnimal);
      
      const analyzeRes = await fetch(`http://localhost:8000/reports/analyze-voice`, {
        method: "POST",
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData,
      });
      
      const analyzeData = await analyzeRes.json();
      if (!analyzeRes.ok) throw new Error("Error en análisis de voz");

      // Auto-Confirmar
      const confirmRes = await fetch('http://localhost:8000/reports/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          user_id: 1, 
          transcript: analyzeData.transcript,
          extracted_data: analyzeData.extracted_data
        })
      });

      if (confirmRes.ok) {
        fetchReports();
      } else {
        throw new Error("Error al confirmar el reporte de voz");
      }
    } catch (err) {
      alert("Hubo un error al procesar el audio: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtrado de reportes
  const filteredReports = useMemo(() => {
    if (filterAnimal === 'Todos') return reports;
    return reports.filter(r => r.animal_name === filterAnimal);
  }, [reports, filterAnimal]);

  // Procesamiento para Gráficos
  const chartDataMascotas = useMemo(() => {
    const counts = {};
    filteredReports.forEach(r => {
      counts[r.animal_name] = (counts[r.animal_name] || 0) + 1;
    });
    return Object.keys(counts).map(name => ({
      name,
      Reportes: counts[name]
    })).sort((a, b) => b.Reportes - a.Reportes);
  }, [filteredReports]);

  const chartDataSintomas = useMemo(() => {
    const counts = {};
    filteredReports.forEach(r => {
      r.events.forEach(e => {
        counts[e.type] = (counts[e.type] || 0) + 1;
      });
    });
    return Object.keys(counts).map(name => ({
      name,
      value: counts[name]
    })).sort((a, b) => b.value - a.value);
  }, [filteredReports]);

  return (
    <div className="space-y-6">
      {/* Smart Input Bar */}
      <div className="bg-white rounded-2xl shadow-sm border border-indigo-100 p-6 overflow-hidden relative">
        <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
        <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
          <Activity className="text-indigo-600" /> Nuevo Reporte Rápido
        </h3>
        
        <form onSubmit={handleManualSubmit} className="flex flex-col sm:flex-row gap-4">
          <select
            required
            value={selectedAnimal}
            onChange={handleAnimalSelect}
            className="sm:w-1/4 px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-gray-50 text-gray-900 font-medium"
          >
            <option value="">Seleccione Mascota...</option>
            {mascotas.map(m => (
              <option key={m.id} value={m.name}>{m.name}</option>
            ))}
          </select>
          
          <div className="flex-1 flex gap-2">
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder={isRecording ? "Grabando audio... (habla ahora)" : "Ej. Tomó toda su agua..."}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-gray-50 text-gray-900"
              disabled={isSubmitting || isRecording}
            />
            {isRecording ? (
              <button
                type="button"
                onClick={stopRecording}
                className="bg-red-500 hover:bg-red-600 text-white px-4 rounded-xl flex items-center justify-center transition-all shadow-sm animate-pulse"
                title="Detener y procesar audio"
              >
                <Square size={20} fill="currentColor" />
              </button>
            ) : (
              <button
                type="button"
                onClick={startRecording}
                disabled={isSubmitting || !selectedAnimal}
                className="bg-indigo-100 hover:bg-indigo-200 disabled:opacity-50 text-indigo-600 px-4 rounded-xl flex items-center justify-center transition-all"
                title="Grabar audio con IA"
              >
                <Mic size={20} />
              </button>
            )}
          </div>
          
          <button
            type="submit"
            disabled={isSubmitting || !selectedAnimal || (!textInput.trim() && !isRecording)}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-sm"
          >
            {isSubmitting ? (
              <RefreshCw className="animate-spin" size={20} />
            ) : (
              <><Send size={20} /> Enviar</>
            )}
          </button>
        </form>
        <p className="text-xs text-gray-400 mt-3">
          Puedes escribir texto o usar el ícono del micrófono para dictarle a la Inteligencia Artificial (Whisper).
        </p>
      </div>

      {/* Filtro Global */}
      <div className="flex items-center gap-3 bg-white p-4 rounded-2xl shadow-sm border border-gray-200">
        <Filter className="text-gray-400" size={20} />
        <span className="text-sm font-bold text-gray-700">Filtro de Análisis:</span>
        <select
          value={filterAnimal}
          onChange={(e) => setFilterAnimal(e.target.value)}
          className="px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-gray-50 text-gray-900 font-medium"
        >
          <option value="Todos">Todas las Mascotas</option>
          {mascotas.map(m => (
            <option key={m.id} value={m.name}>{m.name}</option>
          ))}
        </select>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-bold text-gray-800 mb-4">Reportes por Mascota</h3>
          {chartDataMascotas.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartDataMascotas} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <RechartsTooltip cursor={{ fill: '#f3f4f6' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Bar dataKey="Reportes" fill="#4f46e5" radius={[4, 4, 0, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-400">Sin datos</div>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-bold text-gray-800 mb-4">Distribución de Síntomas</h3>
          {chartDataSintomas.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartDataSintomas}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {chartDataSintomas.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-400">Sin datos</div>
          )}
        </div>
      </div>

      {/* Historial Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 rounded-t-2xl">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Historial de Auditoría</h2>
            <p className="text-sm text-gray-500 mt-1">
              Mostrando reportes de: <span className="font-bold">{filterAnimal}</span>
            </p>
          </div>
          <button 
            onClick={fetchReports}
            className="text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 p-2 rounded-lg transition-colors flex gap-2 items-center text-sm font-medium"
          >
            <RefreshCw size={16} /> Actualizar BD
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-sm border-b border-gray-100">
                <th className="px-6 py-4 font-medium">Fecha</th>
                <th className="px-6 py-4 font-medium">Paciente</th>
                <th className="px-6 py-4 font-medium">Reporte Original (Transcripción)</th>
                <th className="px-6 py-4 font-medium">Síntomas / IA</th>
                <th className="px-6 py-4 font-medium">Autor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr><td colSpan="5" className="text-center py-8 text-gray-400">Cargando reportes...</td></tr>
              ) : filteredReports.length === 0 ? (
                <tr><td colSpan="5" className="text-center py-8 text-gray-400">No hay reportes que coincidan con el filtro.</td></tr>
              ) : (
                filteredReports.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 font-bold text-indigo-900">
                      {r.animal_name}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700 max-w-xs truncate" title={r.transcript}>
                      "{r.transcript}"
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {r.events.map((e, idx) => (
                          <span key={idx} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
                            <CheckCircle2 size={12} /> {e.type}: {e.value || 'Sí'}
                          </span>
                        ))}
                        {r.events.length === 0 && <span className="text-xs text-gray-400">Sin hallazgos</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {r.user_name}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
