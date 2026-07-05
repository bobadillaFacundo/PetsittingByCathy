from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session
from src.database.session import get_db
from src.services.audio_service import AudioService, NLPService
from src.models.models import Animal, Report, ReportEvent, EventType, User

router = APIRouter(prefix="/reports", tags=["Reports"])

from datetime import datetime
from pydantic import BaseModel
from typing import List, Optional, Any

# Modelos Pydantic para el Endpoint /confirm
class ReportConfirmRequest(BaseModel):
    user_id: int
    transcript: str
    extracted_data: List[Any]

@router.post("/analyze-voice")
async def analyze_voice_report(
    audio_file: UploadFile = File(...)
):
    # 1. Guardar Audio
    file_path = await AudioService.save_audio(audio_file)
    
    # 2. Transcribir (Whisper)
    transcript = AudioService.transcribe_audio(file_path)
    
    # 3. Extraer info NLP
    extracted_data = NLPService.extract_events_from_transcript(transcript)
    
    return {
        "message": "Análisis completado. Por favor, confirme los datos.",
        "transcript": transcript,
        "extracted_data": extracted_data
    }

@router.post("/confirm")
def confirm_voice_report(
    request: ReportConfirmRequest,
    db: Session = Depends(get_db)
):
    from src.models.models import DiagnosisCatalog, MedicationCatalog, AnimalDiagnosis, AnimalMedication, AnimalObservation
    saved_reports = []
    
    # Guardar en Base de Datos
    for animal_data in request.extracted_data:
        animal_name = animal_data.get("animal")
        if not animal_name: continue
        
        # Buscar animal en BD
        animal = db.query(Animal).filter(Animal.name.ilike(f"%{animal_name}%")).first()
        if not animal:
            continue
        
        # Crear Reporte general
        report = Report(
            user_id=request.user_id,
            animal_id=animal.id,
            audio_transcript=request.transcript
        )
        db.add(report)
        db.flush()
        
        # 1. Eventos rutinarios
        for event in animal_data.get("events", []):
            event_type_name = event.get("type")
            event_type = db.query(EventType).filter(EventType.name.ilike(f"%{event_type_name}%")).first()
            if not event_type:
                event_type = EventType(name=event_type_name)
                db.add(event_type)
                db.flush()
            report_event = ReportEvent(report_id=report.id, event_type_id=event_type.id, value=event.get("value"))
            db.add(report_event)
            
        # 2. Diagnósticos
        for diag in animal_data.get("diagnoses", []):
            diag_name = diag.get("name")
            catalog = db.query(DiagnosisCatalog).filter(DiagnosisCatalog.name.ilike(f"%{diag_name}%")).first()
            if not catalog:
                catalog = DiagnosisCatalog(name=diag_name)
                db.add(catalog)
                db.flush()
            animal_diag = AnimalDiagnosis(animal_id=animal.id, diagnosis_id=catalog.id, date_diagnosed=datetime.utcnow())
            db.add(animal_diag)
            
        # 3. Medicaciones
        for med in animal_data.get("medications", []):
            med_name = med.get("name")
            catalog = db.query(MedicationCatalog).filter(MedicationCatalog.name.ilike(f"%{med_name}%")).first()
            if not catalog:
                catalog = MedicationCatalog(name=med_name)
                db.add(catalog)
                db.flush()
            dosage = med.get("dosage") or "No especificada"
            animal_med = AnimalMedication(animal_id=animal.id, medication_id=catalog.id, dosage=dosage, frequency="Según indicación")
            db.add(animal_med)
            
        # 4. Observaciones
        for obs in animal_data.get("observations", []):
            text = obs.get("text")
            animal_obs = AnimalObservation(animal_id=animal.id, observation=text)
            db.add(animal_obs)
                
        db.commit()
        saved_reports.append({"animal": animal_name, "report_id": report.id})
        
    return {
        "message": "Reportes guardados correctamente en la base de datos.",
        "saved_reports": saved_reports
    }

