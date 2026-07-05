import { useState, useEffect, useMemo, useRef } from 'react';
import { Send, RefreshCw, Activity, CheckCircle2, Filter, Mic, Square, Download, Database } from 'lucide-react';
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

  // Estados de Edición de IA
  const [analysisResult, setAnalysisResult] = useState(null);
  const [editableTranscript, setEditableTranscript] = useState('');
  const [editableData, setEditableData] = useState(null);

  // Filtro
  const [filterAnimal, setFilterAnimal] = useState('Todos');
  const [filterDate, setFilterDate] = useState(new Date().toLocaleDateString('en-CA')); // YYYY-MM-DD local

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
      const res = await fetch(`/api/animals/`, {
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
      const res = await fetch(`/api/reports/all?limit=50`, {
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
      const analyzeRes = await fetch(`/api/reports/analyze-text`, {
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

      // 2. Mostrar preview en lugar de auto-confirmar
      setEditableTranscript(analyzeData.transcript);
      setEditableData(analyzeData.extracted_data);
      setAnalysisResult(analyzeData);
      
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
      const audioBlob = new Blob(audioChunks.current); // Quitamos {type:'audio/webm'} para soportar Safari iOS
      const formData = new FormData();
      formData.append("audio_file", audioBlob, "reporte.webm");
      formData.append("animal_name", selectedAnimal);
      
      const analyzeRes = await fetch(`/api/reports/analyze-voice`, {
        method: "POST",
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData,
      });
      
      const analyzeData = await analyzeRes.json();
      if (!analyzeRes.ok) throw new Error("Error en análisis de voz");

      // Mostrar preview en lugar de auto-confirmar
      setEditableTranscript(analyzeData.transcript);
      setEditableData(analyzeData.extracted_data);
      setAnalysisResult(analyzeData);

    } catch (err) {
      alert("Hubo un error al procesar el audio: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Confirmar y Guardar (después de la edición)
  const confirmAndSave = async () => {
    setIsSubmitting(true);
    const payload = {
      user_id: 1, // hardcoded
      transcript: editableTranscript,
      extracted_data: editableData
    };

    try {
      const confirmRes = await fetch(`/api/reports/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (confirmRes.ok) {
        setAnalysisResult(null);
        setEditableData(null);
        setTextInput('');
        fetchReports(); // Recargar historial
      } else {
        throw new Error("Error al confirmar el reporte editado");
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtrado de reportes
  const filteredReports = useMemo(() => {
    return reports.filter(r => {
      const matchAnimal = filterAnimal === 'Todos' || r.animal_name === filterAnimal;
      const matchDate = filterDate === '' || r.created_at.startsWith(filterDate);
      return matchAnimal && matchDate;
    });
  }, [reports, filterAnimal, filterDate]);

  // Agrupado por día para el celular
  const groupedReports = useMemo(() => {
    const groups = {};
    filteredReports.forEach(r => {
      const date = new Date(r.created_at);
      const dateStr = date.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase();
      if (!groups[dateStr]) groups[dateStr] = [];
      groups[dateStr].push(r);
    });
    return groups;
  }, [filteredReports]);

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
          
          <div className="flex-1 flex flex-col sm:flex-row gap-3">
            <div className="flex-1 flex gap-2">
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={isRecording ? "Grabando... (habla ahora)" : "Escribe o dicta por voz..."}
                className="w-full px-4 py-4 sm:py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-gray-50 text-gray-900 text-base"
                disabled={isSubmitting || isRecording}
              />
              {isRecording ? (
                <button
                  type="button"
                  onClick={stopRecording}
                  className="bg-red-500 hover:bg-red-600 text-white px-6 sm:px-4 rounded-xl flex items-center justify-center transition-all shadow-md animate-pulse active:scale-95 shrink-0"
                  title="Detener y procesar audio"
                >
                  <Square size={24} fill="currentColor" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={startRecording}
                  disabled={isSubmitting || !selectedAnimal}
                  className="bg-indigo-100 hover:bg-indigo-200 disabled:opacity-50 text-indigo-700 px-6 sm:px-4 rounded-xl flex items-center justify-center transition-all active:scale-95 shadow-sm shrink-0"
                  title="Grabar audio con IA"
                >
                  <Mic size={24} strokeWidth={2.5} />
                </button>
              )}
            </div>
            
            <button
              type="submit"
              disabled={isSubmitting || !selectedAnimal || (!textInput.trim() && !isRecording)}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white px-6 py-4 sm:py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 shrink-0"
            >
              {isSubmitting ? (
                <RefreshCw className="animate-spin" size={24} />
              ) : (
                <><Send size={20} /> <span className="sm:hidden">Enviar Reporte</span><span className="hidden sm:inline">Enviar</span></>
              )}
            </button>
          </div>
        </form>
        <p className="text-xs text-gray-400 mt-3">
          Puedes escribir texto o usar el ícono del micrófono para dictarle a la Inteligencia Artificial (Whisper).
        </p>
      </div>

      {/* Filtro Global */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-white p-4 rounded-2xl shadow-sm border border-gray-200">
        <div className="flex items-center gap-2">
          <Filter className="text-gray-400" size={20} />
          <span className="text-sm font-bold text-gray-700">Filtros:</span>
        </div>
        <select
          value={filterAnimal}
          onChange={(e) => setFilterAnimal(e.target.value)}
          className="w-full sm:w-auto px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-gray-50 text-gray-900 font-medium"
        >
          <option value="Todos">Todas las Mascotas</option>
          {mascotas.map(m => (
            <option key={m.id} value={m.name}>{m.name}</option>
          ))}
        </select>
        
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <input 
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className="w-full sm:w-auto px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-gray-50 text-gray-900 font-medium uppercase text-sm"
          />
          {filterDate && (
            <button 
              onClick={() => setFilterDate('')} 
              className="text-sm text-indigo-600 font-bold hover:underline px-2"
            >
              Limpiar
            </button>
          )}
        </div>
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

      {/* Historial Feed */}
      <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-5 md:p-6 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gray-50/50">
          <div>
            <h2 className="text-xl font-black text-gray-900">Historial de Auditoría</h2>
            <p className="text-sm text-gray-500 mt-1">
              Mostrando reportes de: <span className="font-bold text-indigo-600">{filterAnimal}</span>
            </p>
          </div>
          <button 
            onClick={fetchReports}
            className="text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 p-2.5 rounded-xl transition-colors flex gap-2 items-center text-sm font-bold bg-white border border-gray-200 shadow-sm w-full sm:w-auto justify-center active:scale-95"
          >
            <RefreshCw size={16} /> Refrescar Feed
          </button>
        </div>

        <div className="p-4 md:p-6 md:hidden space-y-8">
          {isLoading ? (
            <div className="py-12 text-center text-gray-400 font-medium">
              <RefreshCw className="animate-spin mx-auto mb-3" size={24} />
              Cargando reportes...
            </div>
          ) : Object.keys(groupedReports).length === 0 ? (
            <div className="bg-gray-50 rounded-2xl p-12 text-center text-gray-500 border border-dashed border-gray-200">
              No hay reportes que coincidan con los filtros.
            </div>
          ) : (
            Object.entries(groupedReports).map(([dateStr, dayReports]) => (
              <div key={dateStr} className="space-y-4 relative">
                <div className="sticky top-[140px] z-20 flex items-center gap-3 bg-gray-50/95 backdrop-blur-xl p-2.5 rounded-xl border border-gray-200 shadow-sm mb-4">
                  <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 shadow-sm shadow-indigo-200"></div>
                  <h3 className="font-black text-gray-800 text-[13px]">{dateStr}</h3>
                  <div className="flex-1 h-px bg-gray-200"></div>
                  <span className="text-[10px] font-bold text-gray-500 bg-white border border-gray-200 px-2.5 py-1 rounded-lg uppercase tracking-wider">{dayReports.length} reportes</span>
                </div>
                
                <div className="grid grid-cols-1 gap-4 pl-2 border-l-2 border-gray-100">
                  {dayReports.map((r) => (
                    <div key={r.id} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-md hover:border-indigo-100 transition-all relative">
                      <div className="absolute top-6 -left-3 w-4 h-0.5 bg-gray-200"></div>
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-3">
                          <div className="bg-indigo-50 text-indigo-600 p-2 rounded-xl">
                            <Database size={20} />
                          </div>
                          <div>
                            <h4 className="font-black text-gray-900 text-lg">{r.animal_name}</h4>
                            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                              {new Date(r.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                      </div>
                      
                      <div className="bg-gray-50 p-4 rounded-2xl mb-4 text-sm text-gray-700 italic border border-gray-100 relative">
                        "{r.transcript}"
                      </div>

                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {r.events.map((e, idx) => (
                          <span key={idx} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                            <CheckCircle2 size={12} /> {e.type}: {e.value || 'Sí'}
                          </span>
                        ))}
                        {r.events.length === 0 && <span className="text-xs font-medium text-gray-400">Sin hallazgos</span>}
                      </div>
                      
                      <div className="flex justify-between items-center pt-3 border-t border-gray-50 mt-auto">
                        <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Autor</span>
                        <span className="text-xs font-bold text-gray-600 bg-gray-100 px-2.5 py-1 rounded-lg">{r.user_name}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="hidden md:block overflow-x-auto">
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
                    <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">
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
                    <td className="px-6 py-4 text-sm text-gray-500 font-medium">
                      {r.user_name}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Verificación / Edición */}
      {analysisResult && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 bg-indigo-50 border-b border-indigo-100 flex flex-col gap-2">
              <h3 className="text-xl font-bold text-indigo-900">Verificar Reporte</h3>
              <p className="text-sm text-indigo-700">Puedes corregir la transcripción y los tags (ej. Sí / No) antes de guardar.</p>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Texto interpretado del audio:</label>
                <textarea 
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white shadow-sm resize-y"
                  rows="3"
                  value={editableTranscript}
                  onChange={(e) => setEditableTranscript(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Tags Detectados:</label>
                {editableData && editableData.map((animalData, i) => (
                  <div key={i} className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                    <span className="font-black text-gray-900 block mb-3 text-lg">{animalData.animal}</span>
                    {animalData.inserts && animalData.inserts.length > 0 ? (
                      animalData.inserts.map((insert, j) => (
                        <div key={j} className="flex gap-2 items-center mb-2">
                          <input 
                            type="text"
                            value={insert.event_type}
                            onChange={(e) => {
                              const newData = [...editableData];
                              newData[i].inserts[j].event_type = e.target.value;
                              setEditableData(newData);
                            }}
                            className="flex-1 bg-white border border-gray-200 rounded-lg p-2 text-sm font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                          <span className="text-gray-400 font-bold">:</span>
                          <input 
                            type="text"
                            value={insert.event_value}
                            onChange={(e) => {
                              const newData = [...editableData];
                              newData[i].inserts[j].event_value = e.target.value;
                              setEditableData(newData);
                            }}
                            className="flex-1 bg-white border border-gray-200 rounded-lg p-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                          <button 
                            onClick={() => {
                              const newData = [...editableData];
                              newData[i].inserts.splice(j, 1);
                              setEditableData(newData);
                            }}
                            className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title="Eliminar este tag"
                          >
                            <Square size={16} />
                          </button>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-gray-400 italic">No se detectaron síntomas o acciones.</p>
                    )}
                    <button 
                      onClick={() => {
                        const newData = [...editableData];
                        if (!newData[i].inserts) newData[i].inserts = [];
                        newData[i].inserts.push({ event_type: "Nuevo Tag", event_value: "Sí" });
                        setEditableData(newData);
                      }}
                      className="mt-2 text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
                    >
                      + Agregar Tag Manualmente
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 border-t border-gray-100 flex justify-end gap-3 bg-gray-50">
              <button 
                onClick={() => setAnalysisResult(null)}
                className="px-6 py-2.5 rounded-xl font-bold text-gray-600 hover:bg-gray-200 transition-colors"
                disabled={isSubmitting}
              >
                Cancelar
              </button>
              <button 
                onClick={confirmAndSave}
                disabled={isSubmitting}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold flex items-center gap-2 transition-all shadow-sm active:scale-95"
              >
                {isSubmitting ? <RefreshCw className="animate-spin" size={20} /> : <CheckCircle2 size={20} />}
                Confirmar y Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
