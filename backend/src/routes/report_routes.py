from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Form
from sqlalchemy.orm import Session
from src.database.session import get_db
from src.services.audio_service import AudioService, NLPService
from src.services.report_helpers import (
    calculate_severity_from_inserts,
    create_critical_alerts_for_report,
)
from src.services.tag_helpers import (
    load_tag_sets, add_tag_variant, parse_csv_values,
    load_color_rules, color_rule_to_dict, set_color_keywords,
    set_tag_variants, tag_set_to_dict,
)
from src.models.models import Animal, Report, ReportEvent, EventType, User, DataDictionary, Attachment, TagSet
from sqlalchemy.orm import joinedload

router = APIRouter(prefix="/reports", tags=["Reports"])

from datetime import datetime, timedelta
from src.timezone_ar import now_ar, today_ar
from pydantic import BaseModel
from typing import List, Optional, Any
import os
import uuid

# Modelos Pydantic para el Endpoint /confirm
class ReportConfirmRequest(BaseModel):
    user_id: int
    transcript: str
    extracted_data: List[Any]

class TextAnalyzeRequest(BaseModel):
    animal_name: str
    text: str

class EditReportRequest(BaseModel):
    transcript: str

from src.auth import get_current_user

@router.post("/analyze-and-confirm-batch")
async def analyze_and_confirm_batch(
    animal_name: str = Form(...),
    audio_file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    # 1. Analizar el audio (reutilizando la lógica existente)
    analysis_result = await analyze_voice_report(animal_name, audio_file, db, current_user)
    
    # 2. Construir el payload para confirmar (auto-confirmación)
    confirm_request = ReportConfirmRequest(
        user_id=current_user.id,
        transcript=analysis_result["transcript"],
        extracted_data=analysis_result["extracted_data"]
    )
    
    # 3. Confirmar y guardar en BD
    return confirm_report(confirm_request, db, current_user)

@router.post("/recalculate-alerts")
def recalculate_alerts(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    # 1. Obtener reportes de las últimas 48 hs
    yesterday = now_ar() - timedelta(hours=48)
    recent_reports = db.query(Report).filter(Report.created_at >= yesterday).all()

    # 2. Borrar alertas críticas no resueltas de los últimos 2 días (para no duplicar)
    from src.models.models import CriticalAlert
    db.query(CriticalAlert).filter(
        CriticalAlert.created_at >= yesterday,
        CriticalAlert.is_resolved == False
    ).delete(synchronize_session=False)
    
    # 3. Regenerar alertas para cada reporte
    from src.services.report_helpers import create_critical_alerts_for_report
    for r in recent_reports:
        animal = db.query(Animal).filter(Animal.id == r.animal_id).first()
        if not animal: continue
        
        # Extraer los valores de los eventos de este reporte
        events = db.query(ReportEvent).filter(ReportEvent.report_id == r.id).all()
        event_values = [e.value for e in events if e.value]
        
        create_critical_alerts_for_report(db, animal, r.id, r.audio_transcript, event_values)
        
    db.commit()
    return {"status": "ok", "message": "Alertas recalculadas exitosamente."}

@router.post("/analyze-voice")
async def analyze_voice_report(
    animal_name: str = Form(...),
    audio_file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    # 1. Guardar Audio
    file_path = await AudioService.save_audio(audio_file)
    
    # 2. Transcribir (Whisper)
    transcript = AudioService.transcribe_audio(file_path)
    
    # 3. Extraer info NLP
    dictionaries = db.query(DataDictionary).all()
    tag_sets = load_tag_sets(db)
    nlp_result = NLPService.extract_events_from_transcript(transcript, dictionaries, animal_name, tag_sets)
    
    extracted_data = nlp_result.get("data", []) if isinstance(nlp_result, dict) else []
    cleaned_transcript = nlp_result.get("cleaned_text", transcript) if isinstance(nlp_result, dict) else transcript
    
    mapped_extracted_data = _map_nlp_to_extracted_data(nlp_result, animal_name, db)
    db.commit()
    
    return {
        "transcript": cleaned_transcript,
        "extracted_data": mapped_extracted_data
    }

@router.post("/analyze-text")
def analyze_text_report(
    req: TextAnalyzeRequest,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    transcript = req.text
    animal_name = req.animal_name

    dictionaries = db.query(DataDictionary).all()
    tag_sets = load_tag_sets(db)
    
    nlp_result = NLPService.extract_events_from_transcript(transcript, dictionaries, animal_name, tag_sets)
    
    cleaned_transcript = nlp_result.get("cleaned_text", transcript) if isinstance(nlp_result, dict) else transcript
    mapped_extracted_data = _map_nlp_to_extracted_data(nlp_result, animal_name, db)
    db.commit()
        
    return {
        "transcript": cleaned_transcript,
        "extracted_data": mapped_extracted_data
    }

@router.post("/confirm")
def confirm_report(
    request: ReportConfirmRequest,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
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
        
        # Auto-calculate immediate severity based on inserts
        calculated_severity = calculate_severity_from_inserts(animal_data.get("inserts", []))
                        
        # Update severity if provided by NLP or fallback to calculation
        severity_from_nlp = animal_data.get("severity")
        if severity_from_nlp in ["normal", "observation", "critical"]:
            animal.severity = severity_from_nlp
        else:
            animal.severity = calculated_severity
        
        # Crear Reporte general
        report = Report(
            user_id=current_user.id,
            animal_id=animal.id,
            audio_transcript=request.transcript
        )
        db.add(report)
        db.flush()
        
        event_values = []
        observation_ids = []
        # Procesar inserts según table_name
        for insert in animal_data.get("inserts", []):
            table_name = insert.get("table_name")
            fields = insert.get("fields", {})
            
            if table_name == "ReportEvent":
                event_type_name = fields.get("event_type_name")
                if not event_type_name: continue
                val = fields.get("value")
                # Campos rutinarios vacíos: no se guardan (opcionales)
                if val is None or str(val).strip() == "":
                    continue
                event_type = _get_or_create_event_type(db, event_type_name)
                event_values.append(str(val))
                _upsert_report_event(db, report.id, event_type.id, val)
                if (event_type_name or "").strip().lower() == "peso":
                    from src.services.weight_helpers import record_weight
                    record_weight(
                        db,
                        animal.id,
                        val,
                        source="reporte",
                        report_id=report.id,
                        recorded_at=report.created_at,
                    )
                
            elif table_name == "AnimalDiagnosis":
                diag_name = fields.get("diagnosis_name")
                if not diag_name: continue
                catalog = db.query(DiagnosisCatalog).filter(DiagnosisCatalog.name.ilike(f"%{diag_name}%")).first()
                if not catalog:
                    catalog = DiagnosisCatalog(name=diag_name)
                    db.add(catalog)
                    db.flush()
                animal_diag = AnimalDiagnosis(animal_id=animal.id, diagnosis_id=catalog.id, date_diagnosed=today_ar())
                db.add(animal_diag)
                
            elif table_name == "AnimalMedication":
                med_name = fields.get("medication_name")
                if not med_name: continue
                catalog = db.query(MedicationCatalog).filter(MedicationCatalog.name.ilike(f"%{med_name}%")).first()
                if not catalog:
                    catalog = MedicationCatalog(name=med_name)
                    db.add(catalog)
                    db.flush()
                dosage = fields.get("dosage") or "No especificada"
                animal_med = AnimalMedication(animal_id=animal.id, medication_id=catalog.id, dosage=dosage, frequency="Según indicación")
                db.add(animal_med)
                
            elif table_name == "AnimalObservation":
                text = fields.get("observation")
                if not text: continue
                animal_obs = AnimalObservation(
                    animal_id=animal.id,
                    observation=text,
                    report_id=report.id,
                    user_id=current_user.id,
                )
                db.add(animal_obs)
                db.flush()
                observation_ids.append(animal_obs.id)

        # Crear alertas críticas si se detectan palabras clave rojas
        create_critical_alerts_for_report(
            db, animal, report.id, request.transcript, event_values
        )
                
        db.commit()
        saved_reports.append({
            "animal": animal_name,
            "report_id": report.id,
            "animal_id": animal.id,
            "severity_assigned": animal.severity,
            "observation_ids": observation_ids,
        })
        
    return {"status": "success", "message": "Reportes guardados correctamente", "saved_reports": saved_reports}

def _get_or_create_event_type(db, event_type_name: str) -> EventType:
    event_type = db.query(EventType).filter(EventType.name.ilike(f"%{event_type_name}%")).first()
    if not event_type:
        event_type = EventType(name=event_type_name)
        db.add(event_type)
        db.flush()
    return event_type


def _upsert_report_event(db, report_id: int, event_type_id: int, value: str) -> None:
    existing = db.query(ReportEvent).filter(
        ReportEvent.report_id == report_id,
        ReportEvent.event_type_id == event_type_id,
    ).first()
    if existing:
        existing.value = value
    else:
        db.add(ReportEvent(report_id=report_id, event_type_id=event_type_id, value=value))
        db.flush()


def _map_nlp_to_extracted_data(nlp_result, animal_name, db):
    """Mapea resultado NLP al formato legacy del frontend."""
    extracted_data = nlp_result.get("data", []) if isinstance(nlp_result, dict) else []
    if isinstance(extracted_data, dict):
        extracted_data = [extracted_data]
        
    mapped_extracted_data = []
    for animal_d in extracted_data:
        mapped_inserts = []
        for item in animal_d.get("inserts", []):
            std_set = item.get("standard_set")
            spk_var = item.get("spoken_variant", "").lower().strip()
            val = item.get("value")
            if not std_set:
                continue
            tag_record = db.query(TagSet).options(joinedload(TagSet.variants_rel)).filter(
                TagSet.name.ilike(std_set)
            ).first()
            if tag_record and spk_var:
                add_tag_variant(db, tag_record, spk_var)
            if std_set.lower() in ["enfermedad", "diagnóstico", "diagnostico"]:
                mapped_inserts.append({
                    "table_name": "AnimalDiagnosis",
                    "fields": {"diagnosis_name": val, "spoken_variant": spk_var}
                })
            elif std_set.lower() in ["medicacion", "medicación", "remedio"]:
                mapped_inserts.append({
                    "table_name": "AnimalMedication",
                    "fields": {"medication_name": val, "spoken_variant": spk_var, "dosage": "No especificada"}
                })
            else:
                mapped_inserts.append({
                    "table_name": "ReportEvent",
                    "fields": {"event_type_name": std_set, "value": val, "spoken_variant": spk_var}
                })
        mapped_extracted_data.append({
            "animal": animal_d.get("animal", animal_d.get("animal_name", animal_name)),
            "inserts": mapped_inserts,
            "severity": animal_d.get("severity"),
        })
    return mapped_extracted_data

def _apply_inserts_to_report(db, report, animal, inserts):
    """Aplica inserts a un reporte existente (solo ReportEvents)."""
    from src.models.models import DiagnosisCatalog, MedicationCatalog, AnimalDiagnosis, AnimalMedication, AnimalObservation
    event_values = []
    for insert in inserts:
        table_name = insert.get("table_name")
        fields = insert.get("fields", {})
        if table_name == "ReportEvent":
            event_type_name = fields.get("event_type_name")
            if not event_type_name:
                continue
            event_type = _get_or_create_event_type(db, event_type_name)
            val = fields.get("value")
            if val:
                event_values.append(str(val))
            _upsert_report_event(db, report.id, event_type.id, val)
            if val and (event_type_name or "").strip().lower() == "peso":
                from src.services.weight_helpers import record_weight
                record_weight(
                    db,
                    animal.id,
                    val,
                    source="reporte",
                    report_id=report.id,
                    recorded_at=report.created_at,
                )
        elif table_name == "AnimalDiagnosis":
            diag_name = fields.get("diagnosis_name")
            if not diag_name:
                continue
            catalog = db.query(DiagnosisCatalog).filter(DiagnosisCatalog.name.ilike(f"%{diag_name}%")).first()
            if not catalog:
                catalog = DiagnosisCatalog(name=diag_name)
                db.add(catalog)
                db.flush()
            db.add(AnimalDiagnosis(animal_id=animal.id, diagnosis_id=catalog.id, date_diagnosed=today_ar()))
        elif table_name == "AnimalMedication":
            med_name = fields.get("medication_name")
            if not med_name:
                continue
            catalog = db.query(MedicationCatalog).filter(MedicationCatalog.name.ilike(f"%{med_name}%")).first()
            if not catalog:
                catalog = MedicationCatalog(name=med_name)
                db.add(catalog)
                db.flush()
            db.add(AnimalMedication(
                animal_id=animal.id, medication_id=catalog.id,
                dosage=fields.get("dosage") or "No especificada", frequency="Según indicación"
            ))
        elif table_name == "AnimalObservation":
            text = fields.get("observation")
            if text:
                db.add(AnimalObservation(
                    animal_id=animal.id,
                    observation=text,
                    report_id=report.id,
                ))
    return event_values

@router.put("/{report_id}/edit")
def edit_report_transcript(
    report_id: int,
    request: EditReportRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Edita la transcripción de un reporte y recalcula eventos/colores."""
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")

    animal = db.query(Animal).filter(Animal.id == report.animal_id).first()
    if not animal:
        raise HTTPException(status_code=404, detail="Animal no encontrado")

    report.audio_transcript = request.transcript

    # Eliminar eventos anteriores del reporte
    db.query(ReportEvent).filter(ReportEvent.report_id == report_id).delete()

    # Re-analizar con NLP
    dictionaries = db.query(DataDictionary).all()
    from src.models.models import TagSet
    tag_sets = load_tag_sets(db)
    nlp_result = NLPService.extract_events_from_transcript(
        request.transcript, dictionaries, animal.name, tag_sets
    )
    mapped_data = _map_nlp_to_extracted_data(nlp_result, animal.name, db)
    db.commit()

    inserts = mapped_data[0].get("inserts", []) if mapped_data else []
    event_values = _apply_inserts_to_report(db, report, animal, inserts)

    # Recalcular severidad
    severity = calculate_severity_from_inserts(inserts)
    nlp_severity = mapped_data[0].get("severity") if mapped_data else None
    animal.severity = nlp_severity if nlp_severity in ["normal", "observation", "critical"] else severity

    # Crear alertas críticas si aplica
    create_critical_alerts_for_report(db, animal, report.id, request.transcript, event_values)

    db.commit()

    from src.dtos.animal_dto import EventDTO
    events = db.query(ReportEvent).filter(ReportEvent.report_id == report_id).all()
    event_dtos = []
    for e in events:
        etype = db.query(EventType).filter(EventType.id == e.event_type_id).first()
        event_dtos.append({"type": etype.name if etype else "Desconocido", "value": e.value})

    return {
        "status": "success",
        "report_id": report.id,
        "transcript": report.audio_transcript,
        "events": event_dtos,
        "severity": animal.severity,
    }


@router.delete("/{report_id}", status_code=204)
def delete_report_physically(
    report_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Borra el reporte de la BD (físico), con eventos, adjuntos y alertas asociadas."""
    from src.models.models import ReportMedication, CriticalAlert, AnimalObservation
    from src.services.storage_service import delete_by_url
    from sqlalchemy import or_

    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")

    obs_ids = [
        o.id for o in db.query(AnimalObservation).filter(AnimalObservation.report_id == report_id).all()
    ]
    att_filters = [Attachment.report_id == report_id]
    if obs_ids:
        att_filters.append(Attachment.observation_id.in_(obs_ids))
    attachments = db.query(Attachment).filter(or_(*att_filters)).all()
    for att in attachments:
        delete_by_url(att.file_url)
        db.delete(att)

    db.query(ReportEvent).filter(ReportEvent.report_id == report_id).delete(synchronize_session=False)
    db.query(ReportMedication).filter(ReportMedication.report_id == report_id).delete(synchronize_session=False)
    db.query(CriticalAlert).filter(CriticalAlert.report_id == report_id).delete(synchronize_session=False)

    db.delete(report)
    db.commit()
    return None


@router.post("/{report_id}/attach-photo")
async def attach_photo_to_report(
    report_id: int,
    photo: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Adjunta una foto o video a un reporte (compatibilidad)."""
    return await _attach_media_to_report(report_id, [photo], None, db)


@router.post("/{report_id}/attach-media")
async def attach_media_to_report(
    report_id: int,
    files: List[UploadFile] = File(...),
    observation_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Adjunta una o varias fotos/videos a un reporte (opcionalmente a una observación)."""
    return await _attach_media_to_report(report_id, files, observation_id, db)


async def _attach_media_to_report(
    report_id: int,
    files: List[UploadFile],
    observation_id: Optional[int],
    db: Session,
):
    from src.models.models import AnimalObservation
    from src.services.storage_service import upload_bytes
    from src.services.media_helpers import detect_media_type

    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")
    if not files:
        raise HTTPException(status_code=400, detail="Debes seleccionar al menos un archivo")

    obs = None
    if observation_id is not None:
        obs = db.query(AnimalObservation).filter(
            AnimalObservation.id == observation_id,
            AnimalObservation.animal_id == report.animal_id,
        ).first()
        if not obs:
            raise HTTPException(status_code=404, detail="Observación no encontrada")

    created = []
    errors = []
    for file in files:
        try:
            content = await file.read()
            if not content:
                errors.append(f"{file.filename or 'archivo'}: vacío")
                continue
            file_type, folder = detect_media_type(file.filename, file.content_type)
            file_url = upload_bytes(
                content,
                folder=folder,
                original_filename=file.filename or f"media{folder}",
                content_type=file.content_type,
            )
            attachment = Attachment(
                animal_id=report.animal_id,
                report_id=report_id,
                observation_id=observation_id if obs else None,
                file_type=file_type,
                file_url=file_url,
            )
            db.add(attachment)
            db.flush()
            created.append({
                "id": attachment.id,
                "file_url": file_url,
                "file_type": file_type,
                "report_id": report_id,
                "animal_id": report.animal_id,
                "observation_id": observation_id,
            })
        except ValueError as e:
            errors.append(f"{file.filename or 'archivo'}: {e}")
        except Exception as e:
            errors.append(f"{file.filename or 'archivo'}: {e}")

    if not created:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"No se pudo subir ningún archivo. {'; '.join(errors)}")

    db.commit()
    return {
        "uploaded": created,
        "count": len(created),
        "errors": errors,
    }

@router.get("/all")
def get_all_reports(limit: int = 100, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    from src.dtos.animal_dto import ReportHistoryDTO, EventDTO
    from sqlalchemy.orm import joinedload
    
    reports = db.query(Report).options(
        joinedload(Report.user),
        joinedload(Report.animal),
        joinedload(Report.events).joinedload(ReportEvent.event_type)
    ).order_by(Report.created_at.desc()).limit(limit).all()
    
    history = []
    for r in reports:
        event_dtos = []
        for e in r.events:
            event_dtos.append(EventDTO(type=e.event_type.name if e.event_type else "Desconocido", value=e.value))
            
        history.append({
            "id": r.id,
            "created_at": r.created_at,
            "transcript": r.audio_transcript,
            "user_name": r.user.name if r.user else "Desconocido",
            "animal_name": r.animal.name if r.animal else "Desconocido",
            "events": event_dtos
        })
        
    return history

from fastapi.responses import FileResponse
from fpdf import FPDF
import tempfile
from pathlib import Path

# Estados de estadía (ingreso real o confirmada en guardería)
DAYCARE_CHECKIN_STATUSES = {"Ingresada", "Finalizada", "Confirmada"}
# Para el análisis IA solo miramos la última semana (más rápido y relevante)
STAY_REPORT_LOOKBACK_DAYS = 7

# Logos de marca por especie (carpeta /logos en la raíz del repo)
SPECIES_BRAND_LOGOS = {
    1: "perro.jpg",
    2: "gato.jpg",
    3: "loro.jpg",
    4: "conejo.jpg",
    5: "tortuga.jpg",
}


def _pdf_safe(text: str) -> str:
    """Helvetica solo soporta latin-1; evita crash por flechas/emojis."""
    if not text:
        return ""
    replacements = {
        "→": "->",
        "←": "<-",
        "—": "-",
        "–": "-",
        "“": '"',
        "”": '"',
        "‘": "'",
        "’": "'",
        "…": "...",
        "•": "-",
    }
    out = str(text)
    for src, dst in replacements.items():
        out = out.replace(src, dst)
    return out.encode("latin-1", "replace").decode("latin-1")


def _logos_dir() -> Path:
    here = Path(__file__).resolve()
    candidates = [
        here.parents[3] / "logos",  # repo/logos
        here.parents[2] / "logos",  # backend/logos
        Path.cwd() / "logos",
        Path.cwd().parent / "logos",
    ]
    for path in candidates:
        if path.is_dir():
            return path
    return candidates[0]


def _resolve_species_logo(species_id: int | None) -> str | None:
    if not species_id:
        return None
    filename = SPECIES_BRAND_LOGOS.get(int(species_id))
    if not filename:
        return None
    logo_path = _logos_dir() / filename
    return str(logo_path) if logo_path.is_file() else None


def _build_branded_pdf(
    *,
    title: str,
    subtitle: str,
    body: str,
    species_id: int | None = None,
) -> str:
    """PDF con logo de marca según especie y texto seguro para Helvetica."""
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()

    logo = _resolve_species_logo(species_id)
    top_y = 12
    if logo:
        try:
            pdf.image(logo, x=(210 - 32) / 2, y=top_y, w=32)
            top_y = 48
        except Exception as e:
            print(f"[PDF] No se pudo insertar logo {logo}: {e}")
            top_y = 12

    pdf.set_y(top_y)
    pdf.set_font("Helvetica", "B", 16)
    pdf.multi_cell(0, 9, text=_pdf_safe(title), align="C")
    pdf.set_font("Helvetica", size=10)
    pdf.multi_cell(0, 6, text=_pdf_safe(subtitle), align="C")
    pdf.ln(6)
    pdf.set_font("Helvetica", size=11)
    pdf.multi_cell(0, 7, text=_pdf_safe(body))

    fd, path = tempfile.mkstemp(suffix=".pdf")
    os.close(fd)
    pdf.output(path)
    return path


def _find_last_daycare_checkin(db: Session, animal_id: int):
    """Última reserva de estadía de la mascota en guardería."""
    from src.models.models import Reservation

    # Preferir la que sigue Ingresada; si no, la más reciente Confirmada/Finalizada
    current = (
        db.query(Reservation)
        .filter(
            Reservation.animal_id == animal_id,
            Reservation.status == "Ingresada",
        )
        .order_by(Reservation.start_date.desc())
        .first()
    )
    if current:
        return current

    return (
        db.query(Reservation)
        .filter(
            Reservation.animal_id == animal_id,
            Reservation.status.in_(list(DAYCARE_CHECKIN_STATUSES)),
        )
        .order_by(Reservation.start_date.desc())
        .first()
    )


def _stay_analysis_window(reservation) -> tuple:
    """
    Ventana de análisis: desde el ingreso (inicio del día) hasta ahora,
    acotada a los últimos STAY_REPORT_LOOKBACK_DAYS días.
    """
    period_end_dt = now_ar()
    lookback_start = period_end_dt - timedelta(days=STAY_REPORT_LOOKBACK_DAYS)

    if reservation and reservation.start_date:
        # Inicio del día del ingreso: evita cortar reportes por la hora exacta de la reserva
        checkin_day_start = reservation.start_date.replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        # Si la reserva empieza en el futuro, usar solo lookback
        if checkin_day_start > period_end_dt:
            period_start_dt = lookback_start
        else:
            period_start_dt = max(checkin_day_start, lookback_start)
    else:
        period_start_dt = lookback_start

    return period_start_dt, period_end_dt


def _build_daycare_stay_context(db: Session, animal: Animal, reservation) -> dict:
    """Arma el contexto de la estadía (última semana dentro del ingreso)."""
    from src.models.models import (
        AnimalMedication,
        AnimalObservation,
        AnimalCareProfile,
    )

    period_start_dt, period_end_dt = _stay_analysis_window(reservation)
    period_start = period_start_dt.strftime("%Y-%m-%d %H:%M")
    period_end = period_end_dt.strftime("%Y-%m-%d %H:%M")

    reports = (
        db.query(Report)
        .options(joinedload(Report.events).joinedload(ReportEvent.event_type))
        .filter(
            Report.animal_id == animal.id,
            Report.created_at >= period_start_dt,
            Report.created_at <= period_end_dt,
        )
        .order_by(Report.created_at.asc())
        .all()
    )

    # Si no hay datos en la ventana corta, ampliar a 30 días del animal
    used_fallback = False
    if not reports:
        used_fallback = True
        fallback_start = period_end_dt - timedelta(days=30)
        period_start_dt = fallback_start
        period_start = period_start_dt.strftime("%Y-%m-%d %H:%M")
        reports = (
            db.query(Report)
            .options(joinedload(Report.events).joinedload(ReportEvent.event_type))
            .filter(
                Report.animal_id == animal.id,
                Report.created_at >= fallback_start,
                Report.created_at <= period_end_dt,
            )
            .order_by(Report.created_at.asc())
            .all()
        )

    event_lines = []
    transcript_lines = []
    for r in reports:
        dt = r.created_at.strftime("%Y-%m-%d %H:%M") if r.created_at else "?"
        if r.audio_transcript:
            transcript_lines.append(f"[{dt}] {r.audio_transcript}")
        for ev in r.events or []:
            etype = ev.event_type.name if ev.event_type else "Evento"
            event_lines.append(f"[{dt}] {etype}: {ev.value}")

    meds = (
        db.query(AnimalMedication)
        .options(joinedload(AnimalMedication.medication), joinedload(AnimalMedication.schedules))
        .filter(
            AnimalMedication.animal_id == animal.id,
            AnimalMedication.is_current == True,  # noqa: E712
        )
        .all()
    )
    med_lines = []
    for m in meds:
        name = m.medication.name if m.medication else "Medicamento"
        times = ", ".join(
            sorted(
                {
                    s.scheduled_time.strftime("%H:%M")
                    for s in (m.schedules or [])
                    if s.scheduled_time
                }
            )
        )
        forever = "tratamiento continuo" if m.is_forever else (
            f"{m.duration_days} días" if m.duration_days else "duración no indicada"
        )
        med_lines.append(
            f"- {name} | dosis: {m.dosage} | frec.: {m.frequency}"
            f"{f' | horarios: {times}' if times else ''} | {forever}"
        )

    observations = (
        db.query(AnimalObservation)
        .filter(
            AnimalObservation.animal_id == animal.id,
            AnimalObservation.created_at >= period_start_dt,
            AnimalObservation.created_at <= period_end_dt,
        )
        .order_by(AnimalObservation.created_at.asc())
        .all()
    )
    obs_lines = []
    for o in observations:
        dt = o.created_at.strftime("%Y-%m-%d %H:%M") if o.created_at else "?"
        obs_lines.append(f"[{dt}] {o.observation}")

    profile = (
        db.query(AnimalCareProfile)
        .filter(AnimalCareProfile.animal_id == animal.id)
        .first()
    )
    profile_bits = []
    if profile:
        if profile.dog_sociability:
            profile_bits.append(f"Sociabilidad con perros: {profile.dog_sociability}")
        if profile.plays_with_dogs:
            profile_bits.append("Juega con otros perros: sí")
        if profile.aversive_to_dogs:
            profile_bits.append("Aversión a perros: sí")
        if profile.needs_isolation:
            profile_bits.append("Requiere aislamiento: sí")
        if profile.needs_medication:
            profile_bits.append("Requiere medicación: sí")
        if profile.intake_medication:
            profile_bits.append(f"Medicación en ingreso: {profile.intake_medication}")
        if profile.special_diet_details:
            profile_bits.append(f"Dieta especial: {profile.special_diet_details}")
        if profile.food_brand or profile.food_amount:
            profile_bits.append(
                f"Comida habitual: {profile.food_brand or ''} {profile.food_amount or ''}".strip()
            )
        if profile.care_notes:
            profile_bits.append(f"Notas de cuidado: {profile.care_notes}")
        if profile.familiar_with_animals:
            profile_bits.append(f"Familiaridad con animales: {profile.familiar_with_animals}")

    reservation_status = reservation.status if reservation else "Sin reserva (última semana)"
    reservation_id = reservation.id if reservation else None
    note = ""
    if used_fallback and reports:
        note = (
            "Nota: se ampliaron los datos a los últimos 30 días porque "
            "no había reportes en la última semana del ingreso."
        )

    return {
        "period_start": period_start,
        "period_end": period_end,
        "reservation_status": reservation_status,
        "reservation_id": reservation_id,
        "reports_count": len(reports),
        "events_text": "\n".join(event_lines) if event_lines else "Sin eventos registrados.",
        "transcripts_text": "\n".join(transcript_lines) if transcript_lines else "Sin transcripciones.",
        "medications_text": "\n".join(med_lines) if med_lines else "Sin medicación activa registrada.",
        "observations_text": "\n".join(obs_lines) if obs_lines else "Sin observaciones adicionales.",
        "profile_text": "\n".join(profile_bits) if profile_bits else "Sin ficha de ingreso adicional.",
        "has_active_medication": bool(med_lines),
        "fallback_note": note,
    }


class StayReportPdfRequest(BaseModel):
    report: str
    period_start: str
    period_end: str


def _render_stay_report_pdf(
    animal_name: str,
    period_start: str,
    period_end: str,
    report_text: str,
    species_id: int | None = None,
) -> str:
    return _build_branded_pdf(
        title=f"Reporte de Estadia: {animal_name}",
        subtitle=(
            f"Periodo: {period_start} -> {period_end} | "
            f"Generado: {today_ar().strftime('%Y-%m-%d')}"
        ),
        body=report_text or "",
        species_id=species_id,
    )


@router.post("/daycare-stay-report/{animal_id}/pdf")
def daycare_stay_report_pdf_from_text(
    animal_id: int,
    payload: StayReportPdfRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Arma el PDF con el texto ya generado (sin volver a llamar a la IA)."""
    animal = db.query(Animal).filter(Animal.id == animal_id).first()
    if not animal:
        raise HTTPException(status_code=404, detail="Animal no encontrado")
    if not (payload.report or "").strip():
        raise HTTPException(status_code=400, detail="El reporte está vacío")

    try:
        path = _render_stay_report_pdf(
            animal.name,
            payload.period_start,
            payload.period_end,
            payload.report,
            species_id=animal.species_id,
        )
    except Exception as e:
        print(f"[PDF] Error generando PDF de estadía: {e}")
        raise HTTPException(status_code=500, detail=f"No se pudo generar el PDF: {e}") from e

    safe_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in animal.name)
    return FileResponse(
        path,
        media_type="application/pdf",
        filename=f"reporte_estadia_{safe_name}.pdf",
    )


@router.get("/daycare-stay-report/{animal_id}")
def generate_daycare_stay_report(
    animal_id: int,
    format: str = "json",
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Genera el reporte de estadía de una mascota desde su último ingreso
    hasta la fecha actual (comida, pis, caca, convivencia, medicación si aplica).
    format=json → vista previa; format=pdf → descarga PDF.
    """
    animal = db.query(Animal).filter(Animal.id == animal_id).first()
    if not animal:
        raise HTTPException(status_code=404, detail="Animal no encontrado")

    reservation = _find_last_daycare_checkin(db, animal_id)
    # Si no hay reserva, igual generamos con la última semana de reportes del animal
    context = _build_daycare_stay_context(db, animal, reservation)
    if context["reports_count"] == 0:
        raise HTTPException(
            status_code=400,
            detail=(
                "No hay reportes de la última semana para esta mascota. "
                "Registrá un reporte diario o verificá que la mascota tenga historial reciente."
            ),
        )

    report_text = NLPService.generate_daycare_stay_report(animal.name, context)
    if context.get("fallback_note"):
        report_text = f"{context['fallback_note']}\n\n{report_text}"

    if (format or "json").lower() == "pdf":
        try:
            path = _render_stay_report_pdf(
                animal.name,
                context["period_start"],
                context["period_end"],
                report_text,
                species_id=animal.species_id,
            )
        except Exception as e:
            print(f"[PDF] Error generando PDF de estadía: {e}")
            raise HTTPException(status_code=500, detail=f"No se pudo generar el PDF: {e}") from e
        safe_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in animal.name)
        return FileResponse(
            path,
            media_type="application/pdf",
            filename=f"reporte_estadia_{safe_name}.pdf",
        )

    return {
        "animal_id": animal.id,
        "animal_name": animal.name,
        "species_id": animal.species_id,
        "period_start": context["period_start"],
        "period_end": context["period_end"],
        "reservation_id": context["reservation_id"],
        "reservation_status": context["reservation_status"],
        "reports_count": context["reports_count"],
        "has_active_medication": context["has_active_medication"],
        "report": report_text,
    }


@router.get("/export-pdf/{animal_id}")
def export_pdf(
    animal_id: int,
    range: str = "1month",
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    from datetime import datetime, timedelta
    
    animal = db.query(Animal).filter(Animal.id == animal_id).first()
    if not animal:
        raise HTTPException(status_code=404, detail="Animal no encontrado")
        
    days = 30
    if range == "3months": days = 90
    if range == "6months": days = 180
    if range == "9months": days = 270
    if range == "1year": days = 365
    
    threshold_date = now_ar() - timedelta(days=days)
    
    reports = db.query(Report).filter(Report.animal_id == animal_id, Report.created_at >= threshold_date).order_by(Report.created_at.asc()).all()
    
    reports_data = []
    for r in reports:
        dt = r.created_at.strftime("%Y-%m-%d %H:%M")
        reports_data.append(f"[{dt}] {r.audio_transcript}")
        
    if not reports_data:
        reports_data.append("No hay reportes en este período.")

    from src.models.models import LabResult
    from sqlalchemy.orm import joinedload
    import pypdf

    labs = db.query(LabResult).options(joinedload(LabResult.laboratory)).filter(
        LabResult.animal_id == animal_id, 
        LabResult.date >= threshold_date.date()
    ).all()

    lab_results_data = []
    from src.services.storage_service import resolve_local_path_or_download
    for lab in labs:
        doc_url = lab.document_url
        if not doc_url: continue

        file_path = resolve_local_path_or_download(doc_url)
        extracted_text = ""
        if file_path and file_path.lower().endswith(".pdf"):
            try:
                reader = pypdf.PdfReader(file_path)
                text_pages = [page.extract_text() for page in reader.pages if page.extract_text()]
                extracted_text = "\n".join(text_pages)
            except Exception as e:
                extracted_text = f"[Error leyendo PDF: {e}]"
            finally:
                # Limpiar temporales descargados de Supabase
                if doc_url.startswith("http") and file_path and os.path.exists(file_path):
                    try:
                        os.remove(file_path)
                    except Exception:
                        pass
                
        if extracted_text:
            lab_results_data.append(f"Estudio: {lab.laboratory.name if lab.laboratory else 'Laboratorio'} - Fecha: {lab.date}\nContenido PDF:\n{extracted_text}\n---")
        
    history_text = NLPService.generate_clinical_history(animal.name, reports_data, lab_results_data)

    try:
        path = _build_branded_pdf(
            title=f"Historia Clinica: {animal.name}",
            subtitle=(
                f"Generado el {today_ar().strftime('%Y-%m-%d')} - "
                f"Periodo evaluado: ultimos {days} dias"
            ),
            body=history_text or "",
            species_id=animal.species_id,
        )
    except Exception as e:
        print(f"[PDF] Error generando historia clínica: {e}")
        raise HTTPException(status_code=500, detail=f"No se pudo generar el PDF: {e}") from e

    safe_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in (animal.name or "animal"))
    return FileResponse(
        path,
        media_type="application/pdf",
        filename=f"historia_{safe_name}.pdf",
    )
