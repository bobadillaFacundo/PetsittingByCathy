import { useState, useEffect } from 'react';
import { Plus, Trash2, Syringe, Camera, ScanLine } from 'lucide-react';
import { API_BASE, apiUrl } from '../../lib/api';
import { AR_TIMEZONE } from '../../lib/datetimeAr';

const SCAN_ERROR_MSG = 'Error. Intentá más tarde.';

/** Intervalo por defecto si el producto no coincide con reglas conocidas. */
const DEWORMING_NEXT_DAYS = {
  INTERNAL: 90,
  EXTERNAL: 30,
};

/** Externos de acción prolongada (~12 semanas). */
const EXTERNAL_LONG_ACTING = /bravecto|fluralaner|seresto/i;

/** Externos mensuales habituales. */
const EXTERNAL_MONTHLY = /nexgard|frontline|advantix|stronghold|revolution|simparica|fipro|biospot|ecto|credelio/i;

function todayArDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: AR_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function isValidIsoDate(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

/** Fecha de aplicación leída en la etiqueta, o hoy si no hay una válida. */
function resolveStartDateFromScan(item) {
  if (isValidIsoDate(item?.date)) return item.date;
  return todayArDate();
}

function addDaysToIsoDate(isoDate, days) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function resolveProductName(item, catalogs) {
  if (item?.product_name) return item.product_name;
  if (item?.product_id) {
    const found = [...catalogs.internal, ...catalogs.external]
      .find((p) => p.id === item.product_id);
    return found?.name || '';
  }
  return '';
}

function dewormingIntervalDays(productType, productName = '') {
  const name = productName.toLowerCase();
  if (productType === 'EXTERNAL') {
    if (EXTERNAL_LONG_ACTING.test(name)) return 90;
    if (EXTERNAL_MONTHLY.test(name)) return 30;
    return DEWORMING_NEXT_DAYS.EXTERNAL;
  }
  if (productType === 'INTERNAL') {
    return DEWORMING_NEXT_DAYS.INTERNAL;
  }
  return DEWORMING_NEXT_DAYS.INTERNAL;
}

function defaultNextDueDate(startDate, productType, productName = '') {
  const interval = dewormingIntervalDays(productType, productName);
  return addDaysToIsoDate(startDate, interval);
}

function buildFormFromScan(item, productType, catalogs) {
  const productName = resolveProductName(item, catalogs);
  const startDate = resolveStartDateFromScan(item);
  return {
    date: startDate,
    product_id: item.product_id ? String(item.product_id) : '',
    next_due_date: defaultNextDueDate(startDate, productType, productName),
  };
}

async function prepareScanFile(file) {
  if (!file) return null;
  const name = file.name || 'producto';
  const lower = name.toLowerCase();
  if (lower.endsWith('.pdf') || file.type === 'application/pdf') {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const maxSide = 2048;
    let { width, height } = bitmap;
    if (Math.max(width, height) > maxSide) {
      const ratio = maxSide / Math.max(width, height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((value) => (value ? resolve(value) : reject(new Error('No se pudo comprimir'))), 'image/jpeg', 0.88);
    });
    return new File([blob], name.replace(/\.[^.]+$/i, '.jpg'), { type: 'image/jpeg' });
  } catch (err) {
    console.warn('No se pudo convertir la imagen en el navegador, se envía el original:', err);
    return file;
  }
}

const emptyDewormingForm = () => ({ date: '', product_id: '', next_due_date: '' });

export default function DesparasitacionesTab({ animalId, token }) {
  const [internas, setInternas] = useState([]);
  const [externas, setExternas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [catalogs, setCatalogs] = useState({ internal: [], external: [] });
  const [scanning, setScanning] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [scanPreview, setScanPreview] = useState(null);

  const [newInterna, setNewInterna] = useState(emptyDewormingForm());
  const [newExterna, setNewExterna] = useState(emptyDewormingForm());

  const fetchData = async () => {
    try {
      const [resInt, resExt, resCat] = await Promise.all([
        fetch(`${API_BASE}/animals/${animalId}/internal_dewormings`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE}/animals/${animalId}/external_dewormings`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE}/animals/catalogs/products`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (resInt.ok) setInternas(await resInt.json());
      if (resExt.ok) setExternas(await resExt.json());
      if (resCat.ok) {
        const products = await resCat.json();
        setCatalogs({
          internal: products.filter((p) => p.type === 'INTERNAL'),
          external: products.filter((p) => p.type === 'EXTERNAL'),
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [animalId]);

  const resolveProductType = (item) => {
    if (item.product_type === 'INTERNAL' || item.product_type === 'EXTERNAL') {
      return item.product_type;
    }
    if (item.product_id) {
      const all = [...catalogs.internal, ...catalogs.external];
      const found = all.find((p) => p.id === item.product_id);
      if (found) return found.type;
    }
    return null;
  };

  const applyScanToForm = (item) => {
    const type = resolveProductType(item);
    const formData = type ? buildFormFromScan(item, type, catalogs) : {
      date: resolveStartDateFromScan(item),
      product_id: item.product_id ? String(item.product_id) : '',
      next_due_date: '',
    };

    if (type === 'INTERNAL') {
      setNewInterna(formData);
      return 'interna';
    }
    if (type === 'EXTERNAL') {
      setNewExterna(formData);
      return 'externa';
    }

    if (item.product_name) {
      alert(
        `Se detectó "${item.product_name}" pero no coincide con el catálogo. `
        + 'Seleccioná el producto manualmente en interna o externa.',
      );
    }
    return null;
  };

  const postScan = async (uploadFile) => {
    const formData = new FormData();
    formData.append('file', uploadFile);
    return fetch(apiUrl(`/animals/${animalId}/dewormings/scan`), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
  };

  const handleScan = async () => {
    if (!selectedFile) return alert('Seleccioná una foto o PDF del producto antiparasitario.');
    const uploadFile = await prepareScanFile(selectedFile);
    setScanning(true);
    try {
      let res = await postScan(uploadFile);
      if (res.status === 502) {
        await new Promise((r) => setTimeout(r, 3000));
        res = await postScan(uploadFile);
      }
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.warn('Escaneo falló', res.status, payload);
        alert(SCAN_ERROR_MSG);
        return;
      }

      setScanPreview(payload);
      const items = Array.isArray(payload.products) && payload.products.length
        ? payload.products
        : payload.product_name || payload.product_id ? [payload] : [];

      if (!items.length) {
        alert(payload.warning || 'No se detectó el producto en la imagen. Podés completar los datos a mano.');
        return;
      }

      const target = applyScanToForm(items[0]);
      const unmatched = items.filter((r) => r.product_name && !r.product_id);
      if (unmatched.length) {
        alert('Se detectó el producto pero no coincide con el catálogo. Revisá y seleccioná manualmente.');
      } else if (items.length > 1) {
        alert(`Se detectaron ${items.length} productos. Se cargó el primero${target ? ` (${target})` : ''}.`);
      } else if (target) {
        alert(`Producto detectado y cargado en desparasitación ${target}.`);
      }
    } catch (err) {
      console.error(err);
      alert(SCAN_ERROR_MSG);
    } finally {
      setScanning(false);
    }
  };

  const handleAdd = async (type, data, setter) => {
    if (!data.product_id) return alert('Debes seleccionar un producto.');
    const url = type === 'interna'
      ? `${API_BASE}/animals/${animalId}/internal_dewormings`
      : `${API_BASE}/animals/${animalId}/external_dewormings`;

    const payload = {
      product_id: Number(data.product_id),
      date: data.date || null,
      next_due_date: data.next_due_date || null,
    };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setter(emptyDewormingForm());
        setSelectedFile(null);
        setScanPreview(null);
        const fileInput = document.getElementById('dewormingFileInput');
        if (fileInput) fileInput.value = '';
        fetchData();
      } else {
        alert('Error al guardar la desparasitación');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (type, id, productName) => {
    if (!window.confirm(`¿Eliminar la desparasitación "${productName}"?`)) return;
    const url = type === 'interna'
      ? `${API_BASE}/animals/${animalId}/internal_dewormings/${id}`
      : `${API_BASE}/animals/${animalId}/external_dewormings/${id}`;
    try {
      const res = await fetch(url, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        fetchData();
      } else {
        alert('Error al eliminar la desparasitación');
      }
    } catch (err) {
      console.error(err);
      alert('Error de conexión al eliminar');
    }
  };

  if (loading) {
    return (
      <div className="modal-tab-content">
        <div className="modal-tab-loading">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="modal-tab-content">
      <div className="space-y-6 w-full">
        <div className="bg-white border border-dashed border-indigo-200 rounded-xl p-4 space-y-2">
          <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1">
            <Camera size={14} /> Foto o PDF del producto (identificación automática)
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="file"
              id="dewormingFileInput"
              accept="image/*,.pdf,.heic,.heif,application/pdf"
              onChange={(e) => {
                setSelectedFile(e.target.files?.[0] || null);
                setScanPreview(null);
              }}
              className="flex-1 text-sm file:mr-4 file:py-1.5 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 border border-gray-200 rounded-lg p-1 text-gray-900 w-full"
            />
            <button
              type="button"
              onClick={handleScan}
              disabled={!selectedFile || scanning}
              className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold flex items-center justify-center gap-1 shrink-0 disabled:opacity-60 w-full sm:w-auto"
            >
              <ScanLine size={16} /> {scanning ? 'Analizando...' : 'Escanear'}
            </button>
          </div>
          {selectedFile && (
            <p className="text-xs text-gray-500">
              Archivo: {selectedFile.name}
              {' '}(HEIC, PDF y otros formatos se convierten solos al escanear)
            </p>
          )}
          {scanPreview?.product_name && (
            <p className="text-xs text-indigo-700 font-medium">
              Detectado: {scanPreview.product_name}
              {scanPreview.product_type ? ` (${scanPreview.product_type === 'INTERNAL' ? 'interna' : 'externa'})` : ''}
            </p>
          )}
          {scanPreview?.warning && (
            <p className="text-xs text-amber-700 font-medium">{scanPreview.warning}</p>
          )}
          {scanPreview?.raw_text && !scanPreview?.count && (
            <pre className="text-xs text-gray-600 bg-gray-50 p-2 rounded max-h-32 overflow-auto whitespace-pre-wrap border border-gray-100">
              {scanPreview.raw_text}
            </pre>
          )}
        </div>

        {/* Internas */}
        <div>
          <h4 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Syringe size={18} className="text-indigo-600" /> Desparasitación Interna
          </h4>
          <div className="bg-gray-50 p-4 rounded-xl space-y-3 mb-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Fecha de inicio</label>
                <input type="date" value={newInterna.date} onChange={(e) => setNewInterna({ ...newInterna, date: e.target.value })} className="w-full text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-900" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Próxima Dosis</label>
                <input type="date" value={newInterna.next_due_date} onChange={(e) => setNewInterna({ ...newInterna, next_due_date: e.target.value })} className="w-full text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-900" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Producto</label>
              <div className="flex gap-2">
                <select value={newInterna.product_id} onChange={(e) => setNewInterna({ ...newInterna, product_id: e.target.value })} className="flex-1 text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-900 bg-white">
                  <option value="">Seleccione un producto...</option>
                  {catalogs.internal.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <button onClick={() => handleAdd('interna', newInterna, setNewInterna)} className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-1">
                  <Plus size={16} /> Añadir
                </button>
              </div>
            </div>
          </div>
          <ul className="space-y-2">
            {internas.length === 0 && <li className="text-sm text-gray-400 italic">No hay registros</li>}
            {internas.map((item) => (
              <li key={item.id} className="bg-white border border-gray-100 p-3 rounded-lg flex justify-between items-center shadow-sm gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-800 text-sm">{item.product?.name || 'Producto Desconocido'}</p>
                  <p className="text-xs text-gray-500">Realizado: {item.date}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {item.next_due_date && (
                    <div className="text-right">
                      <p className="text-xs font-medium text-indigo-600">Próxima:</p>
                      <p className="text-xs font-bold text-indigo-700">{item.next_due_date}</p>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete('interna', item.id, item.product?.name || 'esta desparasitación')}
                    className="text-red-600 bg-red-50 hover:bg-red-100 p-2 rounded-lg transition-colors"
                    title="Eliminar"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <hr className="border-gray-100" />

        {/* Externas */}
        <div>
          <h4 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Syringe size={18} className="text-emerald-600" /> Desparasitación Externa
          </h4>
          <div className="bg-gray-50 p-4 rounded-xl space-y-3 mb-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Fecha de inicio</label>
                <input type="date" value={newExterna.date} onChange={(e) => setNewExterna({ ...newExterna, date: e.target.value })} className="w-full text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-900" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Próxima Dosis</label>
                <input type="date" value={newExterna.next_due_date} onChange={(e) => setNewExterna({ ...newExterna, next_due_date: e.target.value })} className="w-full text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-900" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Producto</label>
              <div className="flex gap-2">
                <select value={newExterna.product_id} onChange={(e) => setNewExterna({ ...newExterna, product_id: e.target.value })} className="flex-1 text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-900 bg-white">
                  <option value="">Seleccione un producto...</option>
                  {catalogs.external.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <button onClick={() => handleAdd('externa', newExterna, setNewExterna)} className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-1">
                  <Plus size={16} /> Añadir
                </button>
              </div>
            </div>
          </div>
          <ul className="space-y-2">
            {externas.length === 0 && <li className="text-sm text-gray-400 italic">No hay registros</li>}
            {externas.map((item) => (
              <li key={item.id} className="bg-white border border-gray-100 p-3 rounded-lg flex justify-between items-center shadow-sm gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-800 text-sm">{item.product?.name || 'Producto Desconocido'}</p>
                  <p className="text-xs text-gray-500">Realizado: {item.date}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {item.next_due_date && (
                    <div className="text-right">
                      <p className="text-xs font-medium text-emerald-600">Próxima:</p>
                      <p className="text-xs font-bold text-emerald-700">{item.next_due_date}</p>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete('externa', item.id, item.product?.name || 'esta desparasitación')}
                    className="text-red-600 bg-red-50 hover:bg-red-100 p-2 rounded-lg transition-colors"
                    title="Eliminar"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
