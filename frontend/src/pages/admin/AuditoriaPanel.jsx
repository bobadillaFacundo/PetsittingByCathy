import { useState, useEffect, useMemo, useRef } from 'react';
import { Send, RefreshCw, Activity, CheckCircle2, Filter, Mic, Square, Download, Database } from 'lucide-react';
import VoiceRecorder from '../../components/VoiceRecorder';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

export default function AuditoriaPanel() {
  const [reports, setReports] = useState([]);
  const [mascotas, setMascotas] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [selectedAnimal, setSelectedAnimal] = useState('');

  // Filtro
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
      <VoiceRecorder onSave={fetchReports} />

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
    </div>
  );
}
