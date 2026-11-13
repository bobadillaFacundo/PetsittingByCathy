import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Send, RefreshCw, Activity, CheckCircle2, Mic, Square, Download, Database, Sun, CloudSun, AlertTriangle, X, Trash2 } from 'lucide-react';
import VoiceRecorder from '../../components/VoiceRecorder';
import {
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
  Line,
} from 'recharts';
import { API_BASE, apiUrl, mediaUrl } from '../../lib/api';
import {
  resolveEventColor,
  getEventBadgeClasses,
  formatEventDisplayValue,
} from '../../lib/eventColors';

export default function AuditoriaPanel() {
  const [reports, setReports] = useState([]);
  const [mascotas, setMascotas] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const [filterAnimal, setFilterAnimal] = useState('Todas');
  const [filterSymptom, setFilterSymptom] = useState('Todos');
  const [filterDateStart, setFilterDateStart] = useState('');
  const [filterDateEnd, setFilterDateEnd] = useState('');
  const [filterColor, setFilterColor] = useState('Todos'); // Todos | green | yellow | red
  const [chartGranularity, setChartGranularity] = useState('semana'); // semana | mes
  const [weatherData, setWeatherData] = useState(null);
  const [loadingWeather, setLoadingWeather] = useState(false);
  const [colorRules, setColorRules] = useState([]);
  const [transcriptModal, setTranscriptModal] = useState(null); // { animal_name, transcript, created_at, user_name }

  const getAnimalWeightKg = (animalName) => {
    const m = mascotas.find((a) => a.name?.toLowerCase() === animalName?.toLowerCase());
    return m?.weight_kg ?? null;
  };

  const getEventColor = (e, report) => resolveEventColor(e, {
    colorRules,
    report,
    reports,
    animalWeightKg: getAnimalWeightKg(report?.animal_name),
  });

  const getReportColor = (report) => {
    const events = report.events || [];
    if (events.length === 0) return 'green';
    if (events.some((e) => getEventColor(e, report) === 'red')) return 'red';
    if (events.some((e) => getEventColor(e, report) === 'yellow')) return 'yellow';
    return 'green';
  };

  const getEventBadgeStyle = (e, report) => getEventBadgeClasses(getEventColor(e, report));

  const fetchWeather = async () => {
    setLoadingWeather(true);
    try {
      const res = await fetch(`${API_BASE}/dashboard/weather`, {
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

  const getSymptomChartName = (e, report) => {
    const type = (e.type || '').toLowerCase().trim();
    if (!type || type === 'peso') return null;
    const isRoutine = ['comida', 'agua', 'pis', 'caca'].includes(type);
    const isAnomaly = getEventColor(e, report) !== 'green';
    // Rutina solo si es anómala; el resto de tipos (enfermedad, observación, etc.) siempre
    if (isRoutine && !isAnomaly) return null;
    if (isRoutine) return `Problema con ${e.type}`;
    return e.type || type;
  };

  const reportHasSymptom = (report, symptomName) => {
    if (symptomName === 'Todos') return true;
    return (report.events || []).some((e) => getSymptomChartName(e, report) === symptomName);
  };

  const clearSymptomFilter = () => setFilterSymptom('Todos');

  const handleFilterAnimalChange = (value) => {
    setFilterAnimal(value);
    clearSymptomFilter();
  };

  const handleFilterColorChange = (value) => {
    setFilterColor(value);
    clearSymptomFilter();
  };

  const handleFilterDateStartChange = (value) => {
    setFilterDateStart(value);
    clearSymptomFilter();
  };

  const handleFilterDateEndChange = (value) => {
    setFilterDateEnd(value);
    clearSymptomFilter();
  };

  const fetchReports = async () => {
    setIsLoading(true);
    try {
      const [reportsRes, animalsRes, rulesRes] = await Promise.all([
        fetch(`${API_BASE}/reports/all?limit=300`, {
          headers: {
            "Authorization": `Bearer ${localStorage.getItem("token")}`
          }
        }),
        fetch(apiUrl('/animals'), {
          headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
        }),
        fetch(`${API_BASE}/catalogs/color-rules`, {
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

  useEffect(() => {
    if (!transcriptModal) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key === 'Escape') setTranscriptModal(null);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [transcriptModal]);

  const openTranscript = (r) => {
    if (!r?.transcript) return;
    setTranscriptModal({
      animal_name: r.animal_name,
      transcript: r.transcript,
      created_at: r.created_at,
      user_name: r.user_name,
    });
  };

  const deleteReport = async (r) => {
    const when = new Date(r.created_at).toLocaleString('es-AR');
    if (!window.confirm(`¿Eliminar definitivamente el reporte de ${r.animal_name} (${when})?\n\nSe borra de la base de datos. No se puede deshacer.`)) return;
    try {
      const res = await fetch(`${API_BASE}/reports/${r.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (!res.ok) throw new Error('Error al eliminar');
      setReports((prev) => prev.filter((x) => x.id !== r.id));
    } catch (err) {
      console.error(err);
      alert('No se pudo eliminar el reporte.');
    }
  };

  const filteredReports = useMemo(() => {
    return reports.filter(r => {
      const matchAnimal = filterAnimal === 'Todas' || r.animal_name === filterAnimal;
      let matchSymptom = filterSymptom === 'Todos';
      if (!matchSymptom) {
        matchSymptom = reportHasSymptom(r, filterSymptom);
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

  /** Avance temporal: reportes por semana/mes con semáforo (normal / atención / alerta). */
  const evolutionChart = useMemo(() => {
    const base =
      filterAnimal === 'Todas'
        ? reports
        : reports.filter((r) => r.animal_name === filterAnimal);

    const startOfWeekMon = (d) => {
      const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const day = (x.getDay() + 6) % 7; // lunes = 0
      x.setDate(x.getDate() - day);
      return x;
    };

    const bucketKey = (d) => {
      if (chartGranularity === 'mes') {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        return `${y}-${m}`;
      }
      const sow = startOfWeekMon(d);
      const y = sow.getFullYear();
      const m = String(sow.getMonth() + 1).padStart(2, '0');
      const day = String(sow.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    const bucketLabel = (key) => {
      if (chartGranularity === 'mes') {
        const [y, m] = key.split('-').map(Number);
        return new Date(y, m - 1, 1)
          .toLocaleDateString('es-AR', { month: 'short', year: '2-digit' })
          .replace('.', '');
      }
      const [y, m, d] = key.split('-').map(Number);
      const start = new Date(y, m - 1, d);
      const end = new Date(y, m - 1, d + 6);
      const a = start.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }).replace('.', '');
      const b = end.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }).replace('.', '');
      return `${a}–${b}`;
    };

    const buckets = new Map();
    base.forEach((r) => {
      const dt = new Date(r.created_at);
      if (Number.isNaN(dt.getTime())) return;
      const key = bucketKey(dt);
      if (!buckets.has(key)) {
        buckets.set(key, {
          key,
          label: bucketLabel(key),
          reportes: 0,
          normal: 0,
          atencion: 0,
          alerta: 0,
        });
      }
      const row = buckets.get(key);
      row.reportes += 1;
      const color = getReportColor(r);
      if (color === 'red') row.alerta += 1;
      else if (color === 'yellow') row.atencion += 1;
      else row.normal += 1;
    });

    const sorted = [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key));
    const limit = chartGranularity === 'mes' ? 6 : 8;
    const slice = sorted.slice(-limit).map((row) => ({
      ...row,
      bienestar: row.reportes
        ? Math.round((row.normal / row.reportes) * 100)
        : 0,
    }));

    let trend = 'sin_datos';
    if (slice.length >= 2) {
      const prev = slice[slice.length - 2].bienestar;
      const last = slice[slice.length - 1].bienestar;
      const diff = last - prev;
      if (diff >= 8) trend = 'mejorando';
      else if (diff <= -8) trend = 'empeorando';
      else trend = 'estable';
    } else if (slice.length === 1) {
      trend = 'estable';
    }

    const last = slice[slice.length - 1] || null;
    return {
      data: slice,
      totalReports: base.length,
      periods: slice.length,
      trend,
      lastBienestar: last?.bienestar ?? null,
      lastLabel: last?.label ?? null,
    };
  }, [reports, filterAnimal, chartGranularity, colorRules, mascotas]);

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

      {/* Evolución del animal — pensado para celular */}
      <div className="rounded-3xl border border-teal-900/10 bg-gradient-to-b from-teal-950 via-teal-900 to-teal-800 text-teal-50 shadow-lg overflow-hidden">
        <div className="p-4 sm:p-6 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-teal-200/80">
                Pulso de evolución
              </p>
              <h3 className="text-xl sm:text-2xl font-black tracking-tight mt-1 truncate">
                {filterAnimal === 'Todas' ? 'Toda la guardería' : filterAnimal}
              </h3>
              <p className="text-sm text-teal-100/75 mt-1">
                Cómo viene el animal {chartGranularity === 'semana' ? 'semana a semana' : 'mes a mes'}:
                reportes normales, con atención y con alerta.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${
                evolutionChart.trend === 'mejorando'
                  ? 'bg-emerald-400/20 text-emerald-200 ring-1 ring-emerald-300/30'
                  : evolutionChart.trend === 'empeorando'
                    ? 'bg-rose-400/20 text-rose-200 ring-1 ring-rose-300/30'
                    : evolutionChart.trend === 'estable'
                      ? 'bg-amber-300/15 text-amber-100 ring-1 ring-amber-200/25'
                      : 'bg-white/10 text-teal-100'
              }`}>
                <Activity size={14} />
                {evolutionChart.trend === 'mejorando' && 'Mejorando'}
                {evolutionChart.trend === 'empeorando' && 'Empeorando'}
                {evolutionChart.trend === 'estable' && 'Estable'}
                {evolutionChart.trend === 'sin_datos' && 'Sin datos'}
              </span>
              {evolutionChart.lastBienestar != null && (
                <span className="inline-flex items-center rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white ring-1 ring-white/15">
                  Bienestar {evolutionChart.lastBienestar}%
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
            <label className="block min-w-0">
              <span className="sr-only">Mascota</span>
              <select
                value={filterAnimal}
                onChange={(e) => handleFilterAnimalChange(e.target.value)}
                className="w-full rounded-2xl border-0 bg-white/10 px-4 py-3 text-sm font-semibold text-white outline-none ring-1 ring-white/15 focus:ring-2 focus:ring-teal-300/50"
              >
                <option value="Todas" className="text-gray-900">Todas las mascotas</option>
                {uniqueAnimals.map((name) => (
                  <option key={name} value={name} className="text-gray-900">{name}</option>
                ))}
              </select>
            </label>
            <div className="inline-flex rounded-2xl bg-black/20 p-1 ring-1 ring-white/10 self-start">
              <button
                type="button"
                onClick={() => setChartGranularity('semana')}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold transition ${
                  chartGranularity === 'semana'
                    ? 'bg-teal-300 text-teal-950 shadow'
                    : 'text-teal-100/80 hover:bg-white/5'
                }`}
              >
                Semana
              </button>
              <button
                type="button"
                onClick={() => setChartGranularity('mes')}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold transition ${
                  chartGranularity === 'mes'
                    ? 'bg-teal-300 text-teal-950 shadow'
                    : 'text-teal-100/80 hover:bg-white/5'
                }`}
              >
                Mes
              </button>
            </div>
          </div>

          {/* Chips rápidos de mascotas (móvil) */}
          {uniqueAnimals.length > 0 && (
            <div className="chip-scroll scroll-touch -mx-1 px-1">
              <div className="chip-scroll-track">
                <button
                  type="button"
                  onClick={() => handleFilterAnimalChange('Todas')}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold whitespace-nowrap ${
                    filterAnimal === 'Todas'
                      ? 'bg-teal-300 text-teal-950'
                      : 'bg-white/10 text-teal-50 ring-1 ring-white/15'
                  }`}
                >
                  Todas
                </button>
                {uniqueAnimals.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => handleFilterAnimalChange(name)}
                    className={`rounded-full px-3 py-1.5 text-xs font-bold whitespace-nowrap ${
                      filterAnimal === name
                        ? 'bg-teal-300 text-teal-950'
                        : 'bg-white/10 text-teal-50 ring-1 ring-white/15'
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {evolutionChart.data.length > 0 ? (
            <>
              <div className="w-full rounded-2xl bg-black/20 p-2 sm:p-3 ring-1 ring-white/10" style={{ height: 260, minHeight: 260 }}>
                <ResponsiveContainer width="100%" height={240} minHeight={240}>
                  <ComposedChart data={evolutionChart.data} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.08)" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: 'rgba(204,251,241,0.75)' }}
                      axisLine={false}
                      tickLine={false}
                      interval={0}
                      angle={-18}
                      textAnchor="end"
                      height={48}
                    />
                    <YAxis
                      yAxisId="left"
                      allowDecimals={false}
                      tick={{ fontSize: 10, fill: 'rgba(204,251,241,0.65)' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      domain={[0, 100]}
                      tick={{ fontSize: 10, fill: 'rgba(204,251,241,0.55)' }}
                      axisLine={false}
                      tickLine={false}
                      width={32}
                    />
                    <RechartsTooltip
                      cursor={{ fill: 'rgba(255,255,255,0.06)' }}
                      contentStyle={{
                        borderRadius: 14,
                        border: 'none',
                        background: '#042f2e',
                        color: '#ecfdf5',
                        boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
                        fontSize: 12,
                      }}
                      formatter={(value, name) => {
                        if (name === 'bienestar') return [`${value}%`, 'Bienestar'];
                        if (name === 'normal') return [value, 'Normal'];
                        if (name === 'atencion') return [value, 'Atención'];
                        if (name === 'alerta') return [value, 'Alerta'];
                        return [value, name];
                      }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 11, color: '#ccfbf1', paddingTop: 4 }}
                      formatter={(value) =>
                        ({ normal: 'Normal', atencion: 'Atención', alerta: 'Alerta', bienestar: 'Bienestar %' }[value] || value)
                      }
                    />
                    <Bar yAxisId="left" dataKey="normal" stackId="sem" fill="#34d399" radius={[0, 0, 0, 0]} maxBarSize={28} />
                    <Bar yAxisId="left" dataKey="atencion" stackId="sem" fill="#fbbf24" maxBarSize={28} />
                    <Bar yAxisId="left" dataKey="alerta" stackId="sem" fill="#fb7185" radius={[4, 4, 0, 0]} maxBarSize={28} />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="bienestar"
                      stroke="#5eead4"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: '#99f6e4', strokeWidth: 0 }}
                      activeDot={{ r: 5 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* Tarjetas de períodos — lectura rápida en el celu */}
              <div className="chip-scroll scroll-touch -mx-1 px-1">
                <div className="chip-scroll-track gap-2">
                  {evolutionChart.data.map((row) => (
                    <div
                      key={row.key}
                      className="min-w-[7.5rem] rounded-2xl bg-white/8 ring-1 ring-white/10 px-3 py-2.5"
                    >
                      <p className="text-[10px] font-bold uppercase tracking-wide text-teal-200/70 truncate">
                        {row.label}
                      </p>
                      <p className="text-lg font-black text-white mt-0.5">{row.bienestar}%</p>
                      <p className="text-[11px] text-teal-100/70 mt-1">
                        {row.reportes} rep. · {row.alerta > 0 ? `${row.alerta} alerta` : 'sin alerta'}
                      </p>
                      <div className="mt-2 h-1.5 rounded-full bg-black/30 overflow-hidden flex">
                        <span className="h-full bg-emerald-400" style={{ width: `${row.reportes ? (row.normal / row.reportes) * 100 : 0}%` }} />
                        <span className="h-full bg-amber-400" style={{ width: `${row.reportes ? (row.atencion / row.reportes) * 100 : 0}%` }} />
                        <span className="h-full bg-rose-400" style={{ width: `${row.reportes ? (row.alerta / row.reportes) * 100 : 0}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-2xl bg-black/20 ring-1 ring-white/10 px-4 py-10 text-center">
              <p className="font-bold text-teal-50">Todavía no hay evolución para graficar</p>
              <p className="text-sm text-teal-100/70 mt-1">
                Elegí una mascota con reportes o esperá a que haya más historia.
              </p>
            </div>
          )}

          <p className="text-[11px] text-teal-100/55">
            {evolutionChart.totalReports} reporte{evolutionChart.totalReports !== 1 ? 's' : ''} en total
            {filterAnimal !== 'Todas' ? ` de ${filterAnimal}` : ''}
            {evolutionChart.periods > 0
              ? ` · mostrando ${evolutionChart.periods} ${chartGranularity === 'semana' ? 'semanas' : 'meses'}`
              : ''}
            . El % de bienestar es la proporción de reportes “normales” en cada período.
          </p>
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
                  onClick={() => handleFilterColorChange(opt.id)}
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
                  onChange={(e) => handleFilterDateStartChange(e.target.value)}
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
                  onChange={(e) => handleFilterDateEndChange(e.target.value)}
                  className="audit-date-input w-full sm:w-auto min-w-0 px-3 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-black font-semibold text-base normal-case"
                />
              </div>
            </label>
            <div className="flex items-center gap-2">
              {(filterDateStart || filterDateEnd || filterColor !== 'Todos') && (
                <button
                  onClick={() => {
                    setFilterDateStart('');
                    setFilterDateEnd('');
                    setFilterColor('Todos');
                    clearSymptomFilter();
                  }}
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
                        <th className="px-4 py-4 font-medium w-20 text-center">Acciones</th>
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
                          <td className="px-6 py-4 text-sm text-gray-700 max-w-xs">
                            <button
                              type="button"
                              onClick={() => openTranscript(r)}
                              className="w-full text-left italic text-gray-700 hover:text-indigo-700 hover:underline underline-offset-2 line-clamp-2 cursor-pointer"
                              title="Ver transcripción completa"
                            >
                              "{r.transcript || 'Sin transcripción'}"
                            </button>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-wrap gap-1.5">
                              {r.events.map((e, idx) => {
                                const label = formatEventDisplayValue(e.type, e.value);
                                return (
                                <span key={idx} className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold border ${getEventBadgeStyle(e, r)}`}>
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
                          <td className="px-4 py-4 text-center">
                            <button
                              type="button"
                              onClick={() => deleteReport(r)}
                              className="inline-flex items-center justify-center p-2 rounded-lg text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 transition-colors"
                              title="Eliminar reporte definitivamente"
                            >
                              <Trash2 size={16} />
                            </button>
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

                      <button
                        type="button"
                        onClick={() => openTranscript(r)}
                        className="w-full text-left bg-white/80 p-4 rounded-2xl mb-4 text-sm text-gray-700 italic border border-gray-100 hover:border-indigo-200 hover:bg-indigo-50/40 transition-colors"
                      >
                        <span className="line-clamp-3">"{r.transcript || 'Sin transcripción'}"</span>
                        {r.transcript && (
                          <span className="mt-2 block text-[11px] font-bold not-italic text-indigo-600 uppercase tracking-wide">
                            Tocá para ver completo
                          </span>
                        )}
                      </button>

                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {r.events.map((e, idx) => {
                          const label = formatEventDisplayValue(e.type, e.value);
                          return (
                          <span key={idx} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border ${getEventBadgeStyle(e, r)}`}>
                            <CheckCircle2 size={12} /> {e.type}: {label}
                          </span>
                          );
                        })}
                        {r.events.length === 0 && <span className="text-xs font-medium text-gray-400">Sin hallazgos</span>}
                      </div>

                      <div className="flex justify-between items-center pt-3 border-t border-gray-50 mt-auto">
                        <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Autor</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-gray-600 bg-gray-100 px-2.5 py-1 rounded-lg">{r.user_name}</span>
                          <button
                            type="button"
                            onClick={() => deleteReport(r)}
                            className="inline-flex items-center justify-center p-2 rounded-lg text-red-600 bg-red-50 hover:bg-red-100 border border-red-200"
                            title="Eliminar reporte definitivamente"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
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

      {transcriptModal && createPortal(
        <div
          className="modal-overlay fixed inset-0 z-[100] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto"
          onClick={() => setTranscriptModal(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="transcript-modal-title"
        >
          <div
            className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-xl max-h-[90dvh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 p-4 sm:p-5 border-b border-gray-100 shrink-0">
              <div className="min-w-0">
                <h3 id="transcript-modal-title" className="text-lg font-black text-gray-900 truncate">
                  {transcriptModal.animal_name}
                </h3>
                <p className="text-xs font-bold text-gray-500 mt-1 uppercase tracking-wide">
                  Reporte original ·{' '}
                  {transcriptModal.created_at
                    ? new Date(transcriptModal.created_at).toLocaleString('es-ES', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '—'}
                  {transcriptModal.user_name ? ` · ${transcriptModal.user_name}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTranscriptModal(null)}
                className="p-2 rounded-xl text-gray-500 hover:bg-gray-100 hover:text-gray-800 shrink-0"
                aria-label="Cerrar"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-4 sm:p-6 overflow-y-auto scroll-touch flex-1">
              <p className="text-base text-gray-800 leading-relaxed whitespace-pre-wrap">
                {transcriptModal.transcript}
              </p>
            </div>
            <div className="p-4 border-t border-gray-100 shrink-0">
              <button
                type="button"
                onClick={() => setTranscriptModal(null)}
                className="w-full py-3 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
