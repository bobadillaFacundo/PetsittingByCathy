import { useEffect, useState } from "react";

const SPECIES_INFO = {
  1: { name: "Perros", emoji: "🐶" },
  2: { name: "Gatos", emoji: "🐱" },
  3: { name: "Loros", emoji: "🦜" },
  4: { name: "Conejos", emoji: "🐰" },
  5: { name: "Tortugas", emoji: "🐢" },
  6: { name: "Erizos", emoji: "🦔" }
};

export default function AnimalHistory({ animalId = 1 }) { // Hardcoded Theo for demo
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const [exportingPDF, setExportingPDF] = useState(false);

  useEffect(() => {
    // LLamada a la API real
    fetch(`/api/animals/${animalId}/history`, {
      headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
    })
      .then(res => res.json())
      .then(d => {
        setData(d);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, [animalId]);

  const downloadPDF = async (range) => {
    setExportingPDF(true);
    try {
      const res = await fetch(`/api/reports/export-pdf/${animalId}?range=${range}`, {
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
            <h2 className="text-3xl font-bold text-gray-900">{data.animal.name}</h2>
            <p className="text-gray-500 font-medium">Historial Clínico Cronológico</p>
          </div>
        </div>
        
        {isAdmin && (
          <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-100 flex flex-col items-center gap-2">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Exportar Historia con IA</span>
            {exportingPDF ? (
              <div className="text-sm font-medium text-indigo-600 animate-pulse py-1.5 px-4 bg-indigo-50 rounded-lg">Generando documento inteligente...</div>
            ) : (
              <div className="flex gap-2">
                <button onClick={() => downloadPDF('1month')} className="px-3 py-1.5 bg-gray-50 hover:bg-indigo-50 hover:text-indigo-700 text-gray-700 text-sm font-bold rounded-lg border transition">1 Mes</button>
                <button onClick={() => downloadPDF('3months')} className="px-3 py-1.5 bg-gray-50 hover:bg-indigo-50 hover:text-indigo-700 text-gray-700 text-sm font-bold rounded-lg border transition">3 Meses</button>
                <button onClick={() => downloadPDF('1year')} className="px-3 py-1.5 bg-gray-50 hover:bg-indigo-50 hover:text-indigo-700 text-gray-700 text-sm font-bold rounded-lg border transition">1 Año</button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="relative border-l-2 border-indigo-200 pl-6 ml-4 space-y-8 pb-4">
        {data.reports.map((report) => (
          <div key={report.id} className="relative group">
            <span className="absolute -left-[35px] top-1.5 w-4 h-4 rounded-full bg-indigo-500 border-4 border-white shadow-sm group-hover:scale-125 transition-transform"></span>
            
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md hover:border-indigo-100 transition-all">
              <div className="flex justify-between items-start mb-3">
                <span className="text-sm font-bold text-indigo-700 bg-indigo-50 px-3 py-1 rounded-lg">
                  {new Date(report.created_at).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute:'2-digit' })}
                </span>
                <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Por {report.user_name}</span>
              </div>
              
              <p className="text-gray-700 italic mb-4 bg-gray-50 p-3 rounded-lg border-l-4 border-indigo-200">
                "{report.transcript}"
              </p>
              
              <div className="flex flex-wrap gap-2 mt-2">
                {report.events.map((evt, idx) => {
                  // Determinamos color de pill según el evento o valor
                  const isNegative = evt.value?.toLowerCase() === 'no' || evt.value?.toLowerCase() === 'poco';
                  const colorClass = isNegative ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-green-50 text-green-700 border-green-200';
                  const dotColor = isNegative ? 'bg-amber-400' : 'bg-green-400';
                  
                  return (
                    <span key={idx} className={`inline-flex items-center gap-2 px-3 py-1 rounded-xl text-xs font-bold border shadow-sm ${colorClass}`}>
                      <span className={`w-2 h-2 rounded-full shadow-inner ${dotColor}`}></span>
                      {evt.type}: {evt.value || "Sí"}
                    </span>
                  )
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
