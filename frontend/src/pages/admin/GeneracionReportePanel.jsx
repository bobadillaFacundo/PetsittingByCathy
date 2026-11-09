import { useEffect, useState } from 'react';
import { ClipboardList, Download, Loader2, Sparkles } from 'lucide-react';
import { API_BASE, apiUrl } from '../../lib/api';

export default function GeneracionReportePanel() {
  const [animals, setAnimals] = useState([]);
  const [selectedAnimalId, setSelectedAnimalId] = useState('');
  const [loadingAnimals, setLoadingAnimals] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const token = localStorage.getItem('token');

  useEffect(() => {
    fetchAnimals();
  }, []);

  const fetchAnimals = async () => {
    try {
      setLoadingAnimals(true);
      // Estadías de guardería = mascotas internas (is_daycare=false)
      const res = await fetch(apiUrl('/animals?is_daycare=false'), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('No se pudieron cargar las mascotas');
      const data = await res.json();
      setAnimals((data || []).filter((a) => a.is_active));
    } catch (err) {
      console.error(err);
      setError('No se pudieron cargar las mascotas de guardería.');
    } finally {
      setLoadingAnimals(false);
    }
  };

  const generateReport = async () => {
    if (!selectedAnimalId) return;
    setGenerating(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch(
        `${API_BASE}/reports/daycare-stay-report/${selectedAnimalId}?format=json`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || 'No se pudo generar el reporte');
      }
      setResult(data);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Error al generar el reporte');
    } finally {
      setGenerating(false);
    }
  };

  const downloadPdf = async () => {
    if (!selectedAnimalId) return;
    setDownloadingPdf(true);
    setError('');
    try {
      const res = await fetch(
        `${API_BASE}/reports/daycare-stay-report/${selectedAnimalId}?format=pdf`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'No se pudo descargar el PDF');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      const name = result?.animal_name || selectedAnimalId;
      a.href = url;
      a.download = `reporte_estadia_${name}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch (err) {
      console.error(err);
      setError(err.message || 'Error al descargar el PDF');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const selectedAnimal = animals.find((a) => String(a.id) === String(selectedAnimalId));

  return (
    <div className="pet-panel p-6 animate-fade-in-up">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          <ClipboardList className="text-indigo-600" size={22} />
          Generación de Reporte de Estadía
        </h2>
        <p className="text-gray-500 text-sm mt-1">
          Resume la última semana desde el ingreso: comida, pis, caca, convivencia y medicación si corresponde.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end mb-6">
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">
            Mascota en guardería
          </label>
          <select
            className="pet-select w-full text-base"
            value={selectedAnimalId}
            onChange={(e) => {
              setSelectedAnimalId(e.target.value);
              setResult(null);
              setError('');
            }}
            disabled={loadingAnimals || generating}
          >
            <option value="">-- Elegí una mascota --</option>
            {animals.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={generateReport}
          disabled={!selectedAnimalId || generating || loadingAnimals}
          className="pet-btn pet-btn--primary flex items-center justify-center gap-2 px-5 py-3 disabled:opacity-50"
        >
          {generating ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Generando…
            </>
          ) : (
            <>
              <Sparkles size={18} />
              Generar reporte
            </>
          )}
        </button>
      </div>

      {selectedAnimal && !result && !error && (
        <p className="text-sm text-gray-500 mb-4">
          Se tomará la última reserva de ingreso de <strong>{selectedAnimal.name}</strong> hasta la fecha actual.
        </p>
      )}

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {result && (
        <div className="border-t border-gray-200 pt-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-gray-900">{result.animal_name}</h3>
              <p className="text-sm text-gray-500">
                Período: {result.period_start} → {result.period_end}
                {' · '}
                Estado: {result.reservation_status}
                {' · '}
                {result.reports_count} reporte{result.reports_count === 1 ? '' : 's'}
                {result.has_active_medication ? ' · Con medicación activa' : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={downloadPdf}
              disabled={downloadingPdf}
              className="pet-btn pet-btn--ghost flex items-center justify-center gap-2 px-4 py-2"
            >
              {downloadingPdf ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  PDF…
                </>
              ) : (
                <>
                  <Download size={16} />
                  Descargar PDF
                </>
              )}
            </button>
          </div>

          <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-gray-800">
              {result.report}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
