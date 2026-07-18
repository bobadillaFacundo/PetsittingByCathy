import { useEffect, useState, useCallback } from "react";

const SPECIES_INFO = {
  1: { name: "Perros", emoji: "🐶" },
  2: { name: "Gatos", emoji: "🐱" },
  3: { name: "Loros", emoji: "🦜" },
  4: { name: "Conejos", emoji: "🐰" },
  5: { name: "Tortugas", emoji: "🐢" },
  6: { name: "Erizos", emoji: "🦔" }
};

function getEventColor(val, evtType, colorRules) {
  const typeLower = evtType?.toLowerCase() || '';
  if (typeLower.includes('enfermedad') || typeLower.includes('medicación') || typeLower.includes('medicacion')) {
    return { colorClass: 'bg-red-50 text-red-700 border-red-200', dotColor: 'bg-red-400' };
  }
  if (typeLower.includes('observacion') || typeLower.includes('observación') || typeLower.includes('nota')) {
    return { colorClass: 'bg-yellow-100 text-yellow-800 border-yellow-300', dotColor: 'bg-yellow-400' };
  }

  const v = val?.toLowerCase() || '';
  let exactRed = [], partialRed = [], exactYellow = [], partialYellow = [];

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

  if (exactRed.includes(v) || partialRed.some(k => v.includes(k))) {
    return { colorClass: 'bg-red-50 text-red-700 border-red-200', dotColor: 'bg-red-400' };
  }
  if (exactYellow.includes(v) || partialYellow.some(k => v.includes(k))) {
    return { colorClass: 'bg-yellow-100 text-yellow-800 border-yellow-300', dotColor: 'bg-yellow-400' };
  }
  return { colorClass: 'bg-green-50 text-green-700 border-green-200', dotColor: 'bg-green-400' };
}

export default function AnimalHistory({ animalId = 1 }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exportingPDF, setExportingPDF] = useState(false);
  const [colorRules, setColorRules] = useState([]);
  const [editingReport, setEditingReport] = useState(null);
  const [editTranscript, setEditTranscript] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [expandedPhoto, setExpandedPhoto] = useState(null);

  const fetchHistory = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch(`https://petsittingbycathy.onrender.com/animals/${animalId}/history`, { headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` } }),
      fetch('https://petsittingbycathy.onrender.com/catalogs/color-rules', { headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` } })
    ])
    .then(async ([histRes, rulesRes]) => {
      if (histRes.ok) setData(await histRes.json());
      if (rulesRes.ok) setColorRules(await rulesRes.json());
      setLoading(false);
    })
    .catch(err => {
      console.error(err);
      setLoading(false);
    });
  }, [animalId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const downloadPDF = async (range) => {
    setExportingPDF(true);
    try {
      const res = await fetch(`https://petsittingbycathy.onrender.com/reports/export-pdf/${animalId}?range=${range}`, {
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
      });
      if (!res.ok) throw new Error("Error generating PDF");
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `historia_clinica_${data.animal.name}_${range}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("Hubo un error generando el PDF. Asegúrate de tener reportes registrados.");
    } finally {
      setExportingPDF(false);
    }
  };

  const startEdit = (report) => {
    setEditingReport(report.id);
    setEditTranscript(report.transcript || "");
  };

  const saveEdit = async () => {
    if (!editingReport) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`https://petsittingbycathy.onrender.com/reports/${editingReport}/edit`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({ transcript: editTranscript }),
      });
      if (!res.ok) throw new Error("Error al guardar");
      setEditingReport(null);
      setEditTranscript("");
      fetchHistory();
    } catch (err) {
      console.error(err);
      alert("Error al guardar la edición. Intenta de nuevo.");
    } finally {
      setSavingEdit(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500 animate-pulse font-medium">Cargando historial clínico...</div>;
  if (!data || !data.animal) return <div className="p-8 text-center text-red-500 font-medium">No se encontró historial para este animal.</div>;

  const role = localStorage.getItem('role');
  const isAdmin = role === 'admin';

  return (
    <div className="max-w-3xl mx-auto p-6 mt-8 bg-white/50 rounded-3xl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 pb-6 border-b border-gray-200">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center text-3xl shadow-inner">
            {SPECIES_INFO[data.animal.species_id]?.emoji || "🐾"}
          </div>
          <div>
            <h2 className="text-3xl font-bold text-gray-900 flex items-center gap-2 flex-wrap">
              {data.animal.name}
              {data.animal.is_rescue && (
                <span className="text-xs font-bold uppercase tracking-wide bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full">Rescate</span>
              )}
            </h2>
            <p className="text-gray-500 font-medium">Historial Clínico Cronológico</p>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-gray-600">
              {data.animal.coat_color && <span>Pelaje: <strong>{data.animal.coat_color}</strong></span>}
              {data.animal.is_rescue ? (
                (data.animal.age_estimate_min != null || data.animal.age_estimate_max != null) && (
                  <span>
                    Edad est.: <strong>
                      {data.animal.age_estimate_min ?? '?'}–{data.animal.age_estimate_max ?? '?'} años
                    </strong>
                  </span>
                )
              ) : (
                data.animal.age_years != null && (
                  <span>Edad: <strong>{data.animal.age_years} años</strong></span>
                )
              )}
              {data.animal.is_simil_breed && <span className="font-bold text-indigo-700">SÍMIL raza</span>}
            </div>
            {(data.animal.is_blind || data.animal.is_deaf || data.animal.no_smell || data.animal.has_neurological || data.animal.has_involuntary_movements) && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {data.animal.is_blind && <span className="text-xs font-bold bg-rose-50 text-rose-700 px-2 py-0.5 rounded-full border border-rose-100">Ciego</span>}
                {data.animal.is_deaf && <span className="text-xs font-bold bg-rose-50 text-rose-700 px-2 py-0.5 rounded-full border border-rose-100">Sordo</span>}
                {data.animal.no_smell && <span className="text-xs font-bold bg-rose-50 text-rose-700 px-2 py-0.5 rounded-full border border-rose-100">Sin olfato</span>}
                {data.animal.has_neurological && <span className="text-xs font-bold bg-rose-50 text-rose-700 px-2 py-0.5 rounded-full border border-rose-100">Neurológico</span>}
                {data.animal.has_involuntary_movements && <span className="text-xs font-bold bg-rose-50 text-rose-700 px-2 py-0.5 rounded-full border border-rose-100">Mov. involuntarios</span>}
              </div>
            )}
          </div>
        </div>
        
        {isAdmin && (
          <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-100 flex flex-col items-center gap-2">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Exportar Historia con IA</span>
            {exportingPDF ? (
              <div className="text-sm font-medium text-indigo-600 animate-pulse py-1.5 px-4 bg-indigo-50 rounded-lg">Generando documento inteligente...</div>
            ) : (
              <div className="flex gap-2 flex-wrap justify-center">
                <button onClick={() => downloadPDF('1month')} className="px-3 py-1.5 bg-gray-50 hover:bg-indigo-50 hover:text-indigo-700 text-gray-700 text-sm font-bold rounded-lg border transition">1 Mes</button>
                <button onClick={() => downloadPDF('3months')} className="px-3 py-1.5 bg-gray-50 hover:bg-indigo-50 hover:text-indigo-700 text-gray-700 text-sm font-bold rounded-lg border transition">3 Meses</button>
                <button onClick={() => downloadPDF('6months')} className="px-3 py-1.5 bg-gray-50 hover:bg-indigo-50 hover:text-indigo-700 text-gray-700 text-sm font-bold rounded-lg border transition">6 Meses</button>
                <button onClick={() => downloadPDF('9months')} className="px-3 py-1.5 bg-gray-50 hover:bg-indigo-50 hover:text-indigo-700 text-gray-700 text-sm font-bold rounded-lg border transition">9 Meses</button>
                <button onClick={() => downloadPDF('1year')} className="px-3 py-1.5 bg-gray-50 hover:bg-indigo-50 hover:text-indigo-700 text-gray-700 text-sm font-bold rounded-lg border transition">1 Año</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* MEDICACIONES ACTIVAS */}
      {data.active_medications && data.active_medications.length > 0 && (
        <div className="mb-6 bg-purple-50 border border-purple-200 p-4 rounded-2xl">
          <h3 className="text-sm font-bold text-purple-800 uppercase tracking-wide mb-3 flex items-center gap-2">
            💊 Medicación Activa
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data.active_medications.map((med) => (
              <div key={med.id} className="bg-white p-3 rounded-xl border border-purple-100 shadow-sm">
                <div className="font-bold text-purple-900 text-sm">{med.medication_name}</div>
                <div className="text-xs text-gray-600 mt-1">
                  <span className="font-semibold text-gray-700">Dosis:</span> {med.dosage} · 
                  <span className="font-semibold text-gray-700 ml-1">Frec.:</span> {med.frequency}
                </div>
                {(med.amount_per_day || med.duration_days || med.is_forever) && (
                  <div className="text-xs text-gray-500 mt-0.5">
                    {med.amount_per_day && <><span className="font-semibold">Cant/día:</span> {med.amount_per_day} · </>}
                    <span className="font-semibold">Duración:</span> {med.is_forever ? 'Crónico (por siempre)' : `${med.duration_days} días`}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="relative border-l-2 border-indigo-200 pl-6 ml-4 space-y-8 pb-4">
        {data.reports.map((report) => (
          <div key={report.id} className="relative group">
            <span className="absolute -left-[35px] top-1.5 w-4 h-4 rounded-full bg-indigo-500 border-4 border-white shadow-sm group-hover:scale-125 transition-transform"></span>
            
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md hover:border-indigo-100 transition-all">
              <div className="flex justify-between items-start mb-3">
                <span className="text-sm font-bold text-indigo-700 bg-indigo-50 px-3 py-1 rounded-lg">
                  {new Date(report.created_at).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute:'2-digit' })}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => startEdit(report)}
                    className="text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg border border-indigo-200 transition"
                  >
                    ✏️ Editar
                  </button>
                  <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Por {report.user_name}</span>
                </div>
              </div>
              
              {editingReport === report.id ? (
                <div className="mb-4">
                  <textarea
                    className="w-full bg-white border border-indigo-200 rounded-lg p-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
                    rows="4"
                    value={editTranscript}
                    onChange={(e) => setEditTranscript(e.target.value)}
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={saveEdit}
                      disabled={savingEdit}
                      className="px-4 py-1.5 bg-green-600 text-white text-sm font-bold rounded-lg hover:bg-green-700 transition disabled:opacity-50"
                    >
                      {savingEdit ? "Guardando..." : "Guardar y Recalcular"}
                    </button>
                    <button
                      onClick={() => { setEditingReport(null); setEditTranscript(""); }}
                      className="px-4 py-1.5 bg-gray-100 text-gray-700 text-sm font-bold rounded-lg hover:bg-gray-200 transition"
                    >
                      Cancelar
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Al guardar, la IA re-analiza el texto y recalcula los colores automáticamente.</p>
                </div>
              ) : (
                <p className="text-gray-700 italic mb-4 bg-gray-50 p-3 rounded-lg border-l-4 border-indigo-200">
                  "{report.transcript}"
                </p>
              )}

              {/* Fotos adjuntas */}
              {report.attachments && report.attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {report.attachments.map((att) => (
                    <button
                      key={att.id}
                      onClick={() => setExpandedPhoto(att.file_url)}
                      className="block"
                    >
                      <img
                        src={att.file_url}
                        alt="Adjunto del reporte"
                        className="w-24 h-24 object-cover rounded-lg border border-gray-200 shadow-sm hover:shadow-md hover:scale-105 transition-all"
                      />
                    </button>
                  ))}
                </div>
              )}
              
              <div className="flex flex-wrap gap-2 mt-2">
                {report.events.map((evt, idx) => {
                  const { colorClass, dotColor } = getEventColor(evt.value, evt.type, colorRules);
                  return (
                    <span key={idx} className={`inline-flex items-center gap-2 px-3 py-1 rounded-xl text-xs font-bold border shadow-sm ${colorClass}`}>
                      <span className={`w-2 h-2 rounded-full shadow-inner ${dotColor}`}></span>
                      {evt.type}: {evt.value || "Sí"}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal foto ampliada */}
      {expandedPhoto && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setExpandedPhoto(null)}
        >
          <img
            src={expandedPhoto}
            alt="Foto ampliada"
            className="max-w-full max-h-[90vh] rounded-xl shadow-2xl"
          />
        </div>
      )}
    </div>
  );
}
