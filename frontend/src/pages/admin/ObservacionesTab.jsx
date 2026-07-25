import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Camera, Video, ImagePlus } from 'lucide-react';
import { API_BASE, mediaUrl } from '../../lib/api';

function MediaPreview({ att }) {
  const src = mediaUrl(att.file_url);
  if (att.file_type === 'video') {
    return (
      <video
        src={src}
        controls
        className="w-full h-24 object-cover rounded-lg border border-gray-200 bg-black"
      />
    );
  }
  return (
    <img
      src={src}
      alt="Adjunto"
      className="w-full h-24 object-cover rounded-lg border border-gray-200"
    />
  );
}

export default function ObservacionesTab({ animalId, token }) {
  const [observations, setObservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [text, setText] = useState('');
  const [pendingFiles, setPendingFiles] = useState([]);
  const galleryRef = useRef(null);
  const cameraPhotoRef = useRef(null);
  const cameraVideoRef = useRef(null);

  const fetchObservations = async () => {
    try {
      const res = await fetch(`${API_BASE}/animals/${animalId}/observations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setObservations(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchObservations();
  }, [animalId]);

  const addFiles = (fileList) => {
    const valid = Array.from(fileList || []).filter(
      (f) => f.type.startsWith('image/') || f.type.startsWith('video/')
    );
    if (valid.length > 0) {
      setPendingFiles((prev) => [...prev, ...valid]);
    }
  };

  const removePending = (index) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCreate = async () => {
    const trimmed = text.trim();
    if (!trimmed && pendingFiles.length === 0) {
      return alert('Escribí una observación o adjuntá al menos una foto/video.');
    }

    setUploading(true);
    try {
      const res = await fetch(`${API_BASE}/animals/${animalId}/observations`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ observation: trimmed || '(sin texto)' }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Error al crear observación');
      }
      const created = await res.json();

      if (pendingFiles.length > 0) {
        const formData = new FormData();
        pendingFiles.forEach((f) => formData.append('files', f));
        const mediaRes = await fetch(
          `${API_BASE}/animals/${animalId}/observations/${created.id}/media`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
          }
        );
        if (!mediaRes.ok) {
          const err = await mediaRes.json().catch(() => ({}));
          alert(err.detail || 'Observación creada, pero falló la subida de archivos.');
        }
      }

      setText('');
      setPendingFiles([]);
      fetchObservations();
    } catch (err) {
      console.error(err);
      alert(err.message || 'Error al guardar');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar esta observación y sus archivos?')) return;
    try {
      const res = await fetch(`${API_BASE}/animals/${animalId}/observations/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) fetchObservations();
      else alert('Error al eliminar');
    } catch (err) {
      console.error(err);
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
      <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl space-y-3">
        <h4 className="font-bold text-amber-900 text-sm">Nueva observación u otro</h4>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="Escribí la observación..."
          className="w-full text-sm px-3 py-2 rounded-lg border border-amber-200 text-gray-900 resize-y"
        />

        <input
          ref={galleryRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
        <input
          ref={cameraPhotoRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
        <input
          ref={cameraVideoRef}
          type="file"
          accept="video/*"
          capture="environment"
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => cameraPhotoRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-amber-200 rounded-lg text-xs font-bold text-amber-800 hover:bg-amber-100"
          >
            <Camera size={14} /> Foto cámara
          </button>
          <button
            type="button"
            onClick={() => cameraVideoRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-amber-200 rounded-lg text-xs font-bold text-amber-800 hover:bg-amber-100"
          >
            <Video size={14} /> Video cámara
          </button>
          <button
            type="button"
            onClick={() => galleryRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-amber-200 rounded-lg text-xs font-bold text-amber-800 hover:bg-amber-100"
          >
            <ImagePlus size={14} /> Galería
          </button>
        </div>

        {pendingFiles.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {pendingFiles.map((file, idx) => (
              <div key={`${file.name}-${idx}`} className="relative w-20">
                {file.type.startsWith('video/') ? (
                  <video
                    src={URL.createObjectURL(file)}
                    className="w-20 h-20 object-cover rounded-lg border border-amber-200"
                  />
                ) : (
                  <img
                    src={URL.createObjectURL(file)}
                    alt=""
                    className="w-20 h-20 object-cover rounded-lg border border-amber-200"
                  />
                )}
                <button
                  type="button"
                  onClick={() => removePending(idx)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs font-bold"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={handleCreate}
          disabled={uploading}
          className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1 disabled:opacity-60"
        >
          <Plus size={16} /> {uploading ? 'Guardando...' : 'Guardar observación'}
        </button>
      </div>

      <ul className="space-y-4">
        {observations.length === 0 && (
          <li className="text-sm text-gray-400 italic text-center py-4">
            No hay observaciones registradas.
          </li>
        )}
        {observations.map((obs) => (
          <li
            key={obs.id}
            className="bg-white border border-gray-200 p-4 rounded-xl space-y-3 hover:shadow-md transition-shadow"
          >
            <div className="flex justify-between items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900 whitespace-pre-wrap">{obs.observation}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {obs.created_at ? new Date(obs.created_at).toLocaleString('es-AR') : ''}
                  {obs.user_name ? ` · ${obs.user_name}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(obs.id)}
                className="text-red-600 bg-red-50 hover:bg-red-100 p-2 rounded-lg shrink-0"
                title="Eliminar"
              >
                <Trash2 size={16} />
              </button>
            </div>
            {obs.attachments?.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {obs.attachments.map((att) => (
                  <a
                    key={att.id}
                    href={mediaUrl(att.file_url)}
                    target="_blank"
                    rel="noreferrer"
                    className="block"
                  >
                    <MediaPreview att={att} />
                  </a>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
    </div>
  );
}
