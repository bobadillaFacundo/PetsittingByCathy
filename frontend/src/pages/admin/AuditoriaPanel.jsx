import { useState, useEffect, useMemo, useRef } from 'react';
import { Send, RefreshCw, Activity, CheckCircle2, Filter, Mic, Square, Download, Database, Sun, CloudSun, AlertTriangle } from 'lucide-react';
import VoiceRecorder from '../../components/VoiceRecorder';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

export default function AuditoriaPanel() {
  const [reports, setReports] = useState([]);
  const [mascotas, setMascotas] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const [selectedAnimal, setSelectedAnimal] = useState('');
  const [filterAnimal, setFilterAnimal] = useState('Todas');
  const [filterSymptom, setFilterSymptom] = useState('Todos');
  const [filterDateStart, setFilterDateStart] = useState('');
  const [filterDateEnd, setFilterDateEnd] = useState('');
  const [filterColor, setFilterColor] = useState('Todos'); // Todos | green | yellow | red
  const [weatherData, setWeatherData] = useState(null);
  const [loadingWeather, setLoadingWeather] = useState(false);
  const [colorRules, setColorRules] = useState([]);

  const getEventColor = (e) => {
    const type = (e.type || '').toLowerCase();
    const value = (e.value || '').toLowerCase();

    if (['enfermedad', 'medicación', 'medicacion'].some(k => type.includes(k))) {
      return 'red';
    }
    if (['observacion', 'observación', 'nota'].some(k => type.includes(k))) {
      return 'yellow';
    }

    let exactRed = [];
    let partialRed = [];
    let exactYellow = [];
    let partialYellow = [];

    colorRules.forEach(r => {
      const keys = (r.keywords || '').split(',').map(k => k.trim().toLowerCase()).filter(k => k);
      if (r.color === 'red') {
        if (r.match_type === 'exact') exactRed.push(...keys);
        else partialRed.push(...keys);
      } else if (r.color === 'yellow') {
        if (r.match_type === 'exact') exactYellow.push(...keys);
        else partialYellow.push(...keys);
      }
    });

    if (exactRed.includes(value) || partialRed.some(v => value.includes(v))) return 'red';
    if (exactYellow.includes(value) || partialYellow.some(v => value.includes(v))) return 'yellow';
    return 'green';
  };

  const getReportColor = (report) => {
    const events = report.events || [];
    if (events.length === 0) return 'green';
    if (events.some(e => getEventColor(e) === 'red')) return 'red';
    if (events.some(e => getEventColor(e) === 'yellow')) return 'yellow';
    return 'green';
  };

  const getEventBadgeStyle = (e) => {
    const color = getEventColor(e);
    if (color === 'red') return 'bg-red-50 text-red-700 border-red-200';
    if (color === 'yellow') return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  };

  const fetchWeather = async () => {
    setLoadingWeather(true);
    try {
      const res = await fetch(`/api/dashboard/weather`, {
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
      });
      const d = await res.json();
      setWeatherData(d);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingWeather(false);
    }
  };

  const COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  const fetchReports = async () => {
    setIsLoading(true);
    try {
      const [reportsRes, animalsRes, rulesRes] = await Promise.all([
        fetch('/api/reports/all', {
          headers: {
            "Authorization": `Bearer ${localStorage.getItem("token")}`
          }
        }),
        fetch('/api/animals/', {
          headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
        }),
        fetch('/api/catalogs/color-rules', {
          headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
        })
      ]);

      if (reportsRes.ok) {
        const reportsData = await reportsRes.json();
        setReports(reportsData);
      } else {
        console.error("Error al obtener reportes", await reportsRes.text());
      }

      if (animalsRes.ok) {
        const animalsData = await animalsRes.json();
        setMascotas(animalsData);
      }
      
      if (rulesRes.ok) {
        const rulesData = await rulesRes.json();
        setColorRules(rulesData);
      }

    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const filteredReports = useMemo(() => {
    return reports.filter(r => {
      const matchAnimal = filterAnimal === 'Todas' || r.animal_name === filterAnimal;
      let matchSymptom = filterSymptom === 'Todos';
      if (!matchSymptom) {
        matchSymptom = r.events.some(e => {
          const type = e.type.toLowerCase();
          const isRoutine = ['comida', 'agua', 'pis', 'caca'].includes(type);
          const isAnomaly = getEventColor(e) !== 'green';
          if (!isRoutine || isAnomaly) {
            const chartName = isRoutine ? `Problema con ${e.type}` : e.type;
            return chartName === filterSymptom;
          }
          return false;
        });
      }

      let matchDate = true;
      const reportDate = r.created_at.split('T')[0];
      if (filterDateStart && filterDateEnd) {
        matchDate = reportDate >= filterDateStart && reportDate <= filterDateEnd;
      } else if (filterDateStart) {
        matchDate = reportDate === filterDateStart;
      } else if (filterDateEnd) {
        matchDate = reportDate <= filterDateEnd;
      }

      const matchColor = filterColor === 'Todos' || getReportColor(r) === filterColor;

      return matchAnimal && matchSymptom && matchDate && matchColor;
    });
  }, [reports, filterAnimal, filterSymptom, filterDateStart, filterDateEnd, filterColor, colorRules]);

  const recentReportsGlobal = useMemo(() => {
    const fortyEightHoursAgo = new Date();
    fortyEightHoursAgo.setHours(fortyEightHoursAgo.getHours() - 48);
    return reports.filter(r => new Date(r.created_at) >= fortyEightHoursAgo);
  }, [reports]);

  const recentReportsFiltered = useMemo(() => {
    return recentReportsGlobal.filter(r => filterAnimal === 'Todas' || r.animal_name === filterAnimal);
  }, [recentReportsGlobal, filterAnimal]);

  const groupedReports = useMemo(() => {
    const groups = {};
    filteredReports.forEach(r => {
      const d = new Date(r.created_at);
      const dateStr = d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase();
      if (!groups[dateStr]) groups[dateStr] = [];
      groups[dateStr].push(r);
    });
    return groups;
  }, [filteredReports]);

  const uniqueAnimals = useMemo(() => {
    return [...new Set(reports.map(r => r.animal_name))];
  }, [reports]);

  const chartDataMascotas = useMemo(() => {
    const counts = {};
    recentReportsGlobal.forEach(r => {
      let hasSymptom = filterSymptom === 'Todos';
      if (!hasSymptom) {
        hasSymptom = r.events.some(e => {
          const type = e.type.toLowerCase();
          const value = (e.value || "").toLowerCase();
          const isRoutine = ['comida', 'agua', 'pis', 'caca'].includes(type);
          const isAnomaly = getEventBadgeStyle(e) !== 'bg-emerald-50 text-emerald-700 border-emerald-100';
          if (!isRoutine || isAnomaly) {
            const chartName = isRoutine ? `Problema con ${e.type}` : e.type;
            return chartName === filterSymptom;
          }
          return false;
        });
      }
      if (hasSymptom) {
        const petName = r.animal_name.trim();
        counts[petName] = 1;
      }
    });
    return Object.keys(counts).map(name => ({ name, Reportes: counts[name] })).sort((a, b) => b.Reportes - a.Reportes);
  }, [recentReportsGlobal, filterSymptom]);

  const chartDataSintomas = useMemo(() => {
    const counts = {};
    recentReportsFiltered.forEach(r => {
      r.events.forEach(e => {
        const type = e.type.toLowerCase();
        const value = (e.value || "").toLowerCase();
        const isRoutine = ['comida', 'agua', 'pis', 'caca'].includes(type);
        const isAnomaly = getEventBadgeStyle(e) !== 'bg-emerald-50 text-emerald-700 border-emerald-100';
        if (!isRoutine || isAnomaly) {
          const chartName = isRoutine ? `Problema con ${e.type}` : e.type;
          if (!counts[chartName]) counts[chartName] = new Set();
          counts[chartName].add(r.animal_name.trim());
        }
      });
    });
    return Object.keys(counts).map(name => ({ name, value: counts[name].size })).sort((a, b) => b.value - a.value);
  }, [recentReportsFiltered]);


  return (
    <div className="space-y-6 md:space-y-8 animate-fade-in-up pb-24 md:pb-0">


      <div className="bg-gradient-to-br from-indigo-50 to-white rounded-3xl p-6 md:p-8 shadow-sm border border-indigo-100 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none"><Sun size={120} /></div>
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <div>
            <h2 className="text-2xl font-black text-indigo-900 flex items-center gap-3"><CloudSun className="text-indigo-500" /> El Clima de la Guardería</h2>
            <p className="text-indigo-600/80 font-medium mt-1">Resumen del estado general generado por Inteligencia Artificial</p>
          </div>
          <button onClick={fetchWeather} disabled={loadingWeather} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-md shadow-indigo-200 disabled:opacity-50">
            {loadingWeather ? <RefreshCw className="animate-spin" size={18} /> : <Sun size={18} />}
            {loadingWeather ? "Analizando..." : "Analizar Clima"}
          </button>
        </div>
        {loadingWeather ? (
          <div className="animate-pulse text-indigo-600 bg-white/60 p-4 rounded-xl border border-indigo-50 text-sm font-medium">La Inteligencia Artificial está leyendo los reportes...</div>
        ) : weatherData ? (
          <div className="space-y-4">
            <div className="bg-white/80 backdrop-blur p-5 rounded-2xl border border-indigo-50 text-gray-700 text-lg shadow-sm leading-relaxed">{weatherData.weather}</div>
            {weatherData.alerts?.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Alertas Activas</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {weatherData.alerts.map((a, i) => (
                    <div key={i} className={`flex items-start gap-3 p-4 rounded-2xl border ${a.severity === 'high' ? 'bg-red-50 border-red-100 text-red-800' : 'bg-amber-50 border-amber-100 text-amber-800'}`}>
                      <AlertTriangle className="shrink-0 mt-0.5" size={18} />
                      <div><span className="font-black block">{a.animal_name}</span><span className="text-sm opacity-90">{a.message}</span></div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-indigo-400 bg-white/40 p-4 rounded-xl border border-indigo-50 text-sm font-medium text-center">Presiona "Analizar Clima" para generar un resumen inteligente del día.</div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-bold text-gray-800 mb-4">Reportes por Mascota</h3>
          {chartDataMascotas.length > 0 ? (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartDataMascotas}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <RechartsTooltip cursor={{ fill: '#f3f4f6' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Bar
                    dataKey="Reportes"
                    radius={[4, 4, 0, 0]}
                    onClick={(data) => {
                      if (filterAnimal === data.name) {
                        setFilterAnimal('Todas');
                      } else {
                        setFilterAnimal(data.name);
                      }
                    }}
                    className="cursor-pointer transition-all"
                  >
                    {chartDataMascotas.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={filterAnimal === 'Todas' || filterAnimal === entry.name ? '#4f46e5' : '#c7d2fe'}
                        className="hover:opacity-80 transition-opacity"
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <div className="h-64 flex items-center justify-center text-gray-400">Sin datos</div>}
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-bold text-gray-800 mb-4">Distribución de Síntomas</h3>
          {chartDataSintomas.length > 0 ? (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartDataSintomas}
                    dataKey="value"
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    onClick={(data) => {
                      if (filterSymptom === data.name) {
                        setFilterSymptom('Todos');
                      } else {
                        setFilterSymptom(data.name);
                      }
                    }}
                    className="cursor-pointer transition-all"
                  >
                    {chartDataSintomas.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={filterSymptom === 'Todos' || filterSymptom === entry.name ? COLORS[i % COLORS.length] : '#f3f4f6'}
                        className="hover:opacity-80 transition-opacity"
                      />
                    ))}
                  </Pie>
                  <RechartsTooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : <div className="h-64 flex items-center justify-center text-gray-400">Sin datos</div>}
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gray-50/50">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-black text-gray-900">Historial de Auditoría</h2>
            {(filterAnimal !== 'Todas' || filterSymptom !== 'Todos' || filterColor !== 'Todos') && (
              <div className="flex gap-2 flex-wrap">
                {filterAnimal !== 'Todas' && (
                  <span className="bg-indigo-100 text-indigo-700 text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wide">
                    {filterAnimal}
                  </span>
                )}
                {filterSymptom !== 'Todos' && (
                  <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wide">
                    {filterSymptom}
                  </span>
                )}
                {filterColor !== 'Todos' && (
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wide ${
                    filterColor === 'red' ? 'bg-red-100 text-red-700' :
                    filterColor === 'yellow' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-emerald-100 text-emerald-700'
                  }`}>
                    {filterColor === 'red' ? 'Rojo' : filterColor === 'yellow' ? 'Amarillo' : 'Verde'}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 w-full md:w-auto">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Color:</span>
              {[
                { id: 'Todos', label: 'Todos', active: 'bg-gray-800 text-white border-gray-800', idle: 'bg-white text-gray-600 border-gray-200' },
                { id: 'green', label: 'Verde', active: 'bg-emerald-600 text-white border-emerald-600', idle: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
                { id: 'yellow', label: 'Amarillo', active: 'bg-yellow-400 text-yellow-950 border-yellow-400', idle: 'bg-yellow-50 text-yellow-800 border-yellow-200' },
                { id: 'red', label: 'Rojo', active: 'bg-red-600 text-white border-red-600', idle: 'bg-red-50 text-red-700 border-red-200' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setFilterColor(opt.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                    filterColor === opt.id ? opt.active : opt.idle
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full">
            <label className="flex flex-col gap-1 min-w-0 flex-1 sm:flex-initial">
              <span className="text-xs font-bold text-black sm:hidden">Desde</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-black hidden sm:inline shrink-0">Desde:</span>
                <input
                  type="date"
                  value={filterDateStart}
                  onChange={(e) => setFilterDateStart(e.target.value)}
                  className="audit-date-input w-full sm:w-auto min-w-0 px-3 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-black font-semibold text-base normal-case"
                />
              </div>
            </label>
            <label className="flex flex-col gap-1 min-w-0 flex-1 sm:flex-initial">
              <span className="text-xs font-bold text-black sm:hidden">Hasta</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-black hidden sm:inline shrink-0">Hasta:</span>
                <input
                  type="date"
                  value={filterDateEnd}
                  onChange={(e) => setFilterDateEnd(e.target.value)}
                  className="audit-date-input w-full sm:w-auto min-w-0 px-3 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-black font-semibold text-base normal-case"
                />
              </div>
            </label>
            <div className="flex items-center gap-2">
              {(filterDateStart || filterDateEnd || filterColor !== 'Todos') && (
                <button
                  onClick={() => { setFilterDateStart(''); setFilterDateEnd(''); setFilterColor('Todos'); }}
                  className="text-sm text-indigo-600 font-bold hover:underline px-2 py-2 whitespace-nowrap"
                >
                  Limpiar
                </button>
              )}
              <button
                onClick={fetchReports}
                className="text-gray-500 hover:text-indigo-600 p-2.5 rounded-xl border border-gray-200 bg-white shadow-sm"
                title="Refrescar Feed"
              >
                <RefreshCw size={16} />
              </button>
            </div>
            </div>
          </div>
        </div>
        <div className="p-4 md:p-6 space-y-8">
          {isLoading ? <div className="text-center py-12 text-gray-400">Cargando...</div> : Object.keys(groupedReports).length === 0 ? <div className="p-12 text-center text-gray-500 border-dashed border-2 border-gray-200 rounded-2xl">No hay reportes.</div> : (
            Object.entries(groupedReports).slice(0, (filterDateStart || filterDateEnd || filterColor !== 'Todos') ? undefined : 1).map(([dateStr, dayReports]) => (
              <div key={dateStr} className="space-y-4">
                <div className="sticky top-[140px] z-20 flex items-center gap-3 bg-gray-50/95 backdrop-blur-xl p-2.5 rounded-xl border border-gray-200 mb-4">
                  <div className="w-3 h-3 rounded-full bg-indigo-500"></div>
                  <h3 className="font-black text-indigo-900">{dateStr}</h3>
                  <div className="flex-1 h-px bg-gray-200"></div>
                </div>

                {/* Desktop view (table) */}
                <div className="hidden md:block overflow-x-auto border border-gray-100 rounded-xl">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500 text-sm border-b border-gray-100">
                        <th className="px-6 py-4 font-medium w-32">Hora</th>
                        <th className="px-6 py-4 font-medium w-48">Paciente</th>
                        <th className="px-6 py-4 font-medium">Reporte Original (Transcripción)</th>
                        <th className="px-6 py-4 font-medium w-64">Síntomas / Hallazgos</th>
                        <th className="px-6 py-4 font-medium w-32">Autor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {dayReports.map((r) => {
                        const reportColor = getReportColor(r);
                        const rowTint =
                          reportColor === 'red' ? 'bg-red-50/40' :
                          reportColor === 'yellow' ? 'bg-yellow-100' :
                          '';
                        return (
                        <tr key={r.id} className={`hover:bg-indigo-50/30 transition-colors ${rowTint}`}>
                          <td className="px-6 py-4 text-sm text-gray-500 font-bold whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                                reportColor === 'red' ? 'bg-red-500' :
                                reportColor === 'yellow' ? 'bg-yellow-400' :
                                'bg-emerald-500'
                              }`} />
                              {new Date(r.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </td>
                          <td className="px-6 py-4 font-black text-indigo-900">
                            {r.animal_name}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-700 max-w-xs truncate italic" title={r.transcript}>
                            "{r.transcript}"
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-wrap gap-1.5">
                              {r.events.map((e, idx) => {
                                const label = e.value && e.value.length > 40 ? `${e.value.slice(0, 40)}…` : (e.value || 'Sí');
                                return (
                                <span key={idx} className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold border ${getEventBadgeStyle(e)}`}>
                                  <CheckCircle2 size={12} /> {e.type}: {label}
                                </span>
                                );
                              })}
                              {r.events.length === 0 && <span className="text-xs text-gray-400 font-medium">Sin hallazgos</span>}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500 font-bold">
                            <div className="bg-gray-100 inline-block px-2 py-1 rounded-md">{r.user_name}</div>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile view (cards) */}
                <div className="md:hidden grid grid-cols-1 gap-4 pl-2 border-l-2 border-gray-100">
                  {dayReports.map((r) => {
                    const reportColor = getReportColor(r);
                    const cardBorder =
                      reportColor === 'red' ? 'border-red-200 bg-red-50/30' :
                      reportColor === 'yellow' ? 'border-yellow-300 bg-yellow-100' :
                      'border-gray-100 bg-white';
                    return (
                    <div key={r.id} className={`rounded-2xl p-5 shadow-sm border hover:shadow-md transition-all relative ${cardBorder}`}>
                      <div className="absolute top-6 -left-3 w-4 h-0.5 bg-gray-200"></div>
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-xl ${
                            reportColor === 'red' ? 'bg-red-100 text-red-600' :
                            reportColor === 'yellow' ? 'bg-yellow-200 text-yellow-700' :
                            'bg-indigo-50 text-indigo-600'
                          }`}>
                            <Database size={20} />
                          </div>
                          <div>
                            <h4 className="font-black text-gray-900 text-lg">{r.animal_name}</h4>
                            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                              {new Date(r.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                              {reportColor === 'yellow' && ' · Observación'}
                              {reportColor === 'red' && ' · Crítico'}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="bg-white/80 p-4 rounded-2xl mb-4 text-sm text-gray-700 italic border border-gray-100 relative">
                        "{r.transcript}"
                      </div>

                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {r.events.map((e, idx) => {
                          const label = e.value && e.value.length > 40 ? `${e.value.slice(0, 40)}…` : (e.value || 'Sí');
                          return (
                          <span key={idx} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border ${getEventBadgeStyle(e)}`}>
                            <CheckCircle2 size={12} /> {e.type}: {label}
                          </span>
                          );
                        })}
                        {r.events.length === 0 && <span className="text-xs font-medium text-gray-400">Sin hallazgos</span>}
                      </div>

                      <div className="flex justify-between items-center pt-3 border-t border-gray-50 mt-auto">
                        <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Autor</span>
                        <span className="text-xs font-bold text-gray-600 bg-gray-100 px-2.5 py-1 rounded-lg">{r.user_name}</span>
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
