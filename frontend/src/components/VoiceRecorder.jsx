import { useState, useRef } from "react";

export default function VoiceRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  
  const mediaRecorder = useRef(null);
  const audioChunks = useRef([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder.current = new MediaRecorder(stream);
      audioChunks.current = [];

      mediaRecorder.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.current.push(event.data);
        }
      };

      mediaRecorder.current.onstop = sendAudioForAnalysis;
      
      mediaRecorder.current.start();
      setIsRecording(true);
      setAnalysisResult(null);
      setSaveSuccess(false);
    } catch (err) {
      console.error("Error accediendo al micrófono:", err);
      alert("No se pudo acceder al micrófono.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current && isRecording) {
      mediaRecorder.current.stop();
      setIsRecording(false);
      setIsProcessing(true);
    }
  };

  const sendAudioForAnalysis = async () => {
    const audioBlob = new Blob(audioChunks.current, { type: 'audio/webm' });
    const formData = new FormData();
    formData.append("audio_file", audioBlob, "reporte.webm");
    
    try {
      const response = await fetch(`http://localhost:8000/reports/analyze-voice`, {
        method: "POST",
        body: formData,
      });
      
      const data = await response.json();
      if (data.error) {
        alert(data.error);
        return;
      }
      setAnalysisResult(data);
    } catch (error) {
      console.error("Error analizando el audio:", error);
      alert("Hubo un error procesando el reporte.");
    } finally {
      setIsProcessing(false);
    }
  };

  const confirmAndSave = async () => {
    setIsProcessing(true);
    const payload = {
      user_id: 1, // Hardcodeado por ahora
      transcript: analysisResult.transcript,
      extracted_data: analysisResult.extracted_data
    };

    try {
      const response = await fetch(`http://localhost:8000/reports/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      
      if (response.ok) {
        setAnalysisResult(null);
        setSaveSuccess(true);
      } else {
        alert("Error al confirmar el guardado.");
      }
    } catch (error) {
      console.error("Error guardando:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-8 flex flex-col items-center relative">
      <h2 className="text-xl font-semibold mb-4 text-gray-800">Reporte Diario Dinámico</h2>
      
      <button 
        onMouseDown={startRecording}
        onMouseUp={stopRecording}
        onTouchStart={startRecording}
        onTouchEnd={stopRecording}
        className={`w-32 h-32 rounded-full flex flex-col items-center justify-center transition-all duration-300 shadow-lg ${
          isRecording 
            ? 'bg-red-500 hover:bg-red-600 scale-110 shadow-red-200' 
            : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'
        }`}
      >
        <span className="text-4xl mb-2">🎙️</span>
        <span className="text-white font-medium text-sm">
          {isRecording ? "Grabando..." : "Mantener"}
        </span>
      </button>

      {isProcessing && (
        <p className="mt-4 text-indigo-600 font-medium animate-pulse">
          Procesando...
        </p>
      )}

      {saveSuccess && (
        <div className="mt-6 p-4 bg-green-50 rounded-lg w-full max-w-md border border-green-100 text-center text-green-700 font-medium">
          ✅ ¡Reporte guardado con éxito!
        </div>
      )}

      {/* Modal de Confirmación */}
      {analysisResult && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 bg-indigo-50 border-b border-indigo-100">
              <h3 className="text-xl font-bold text-indigo-900">Verificar Datos Extraídos</h3>
              <p className="text-sm text-indigo-700 mt-2 italic">"{analysisResult.transcript}"</p>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              {analysisResult.extracted_data.map((animalData, i) => (
                <div key={i} className="mb-6 last:mb-0">
                  <h4 className="font-bold text-lg text-gray-800 border-b pb-2 mb-3">🐾 Paciente: {animalData.animal}</h4>
                  
                  {animalData.inserts?.length > 0 ? (
                    <div className="space-y-3">
                      {animalData.inserts.map((insert, j) => (
                        <div key={j} className="bg-gray-50 border border-gray-200 p-3 rounded-lg text-sm">
                          <span className="font-bold text-indigo-600 uppercase text-xs tracking-wide">
                            Tabla destino: {insert.table_name}
                          </span>
                          <ul className="mt-2 space-y-1">
                            {Object.entries(insert.fields || {}).map(([key, val]) => (
                              <li key={key} className="flex gap-2">
                                <span className="font-medium text-gray-600">{key}:</span>
                                <span className="text-gray-900">{String(val)}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 italic text-sm">No se extrajeron registros para este paciente.</p>
                  )}
                </div>
              ))}
            </div>

            <div className="p-4 border-t border-gray-100 flex justify-end gap-3 bg-gray-50">
              <button 
                onClick={() => setAnalysisResult(null)}
                className="px-5 py-2 rounded-xl text-gray-600 hover:bg-gray-200 font-medium transition"
              >
                Cancelar
              </button>
              <button 
                onClick={confirmAndSave}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-md transition"
              >
                Confirmar e Insertar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
