import sys
import os
import random
from datetime import datetime, timedelta

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from src.database.session import SessionLocal
from src.models.models import Animal, Species, User, Report, ReportEvent, EventType

db = SessionLocal()

try:
    print("Iniciando poblado de datos falsos (Seed)...")

    # 1. Obtener dependencias base
    admin_user = db.query(User).filter_by(role="admin").first()
    if not admin_user:
        raise Exception("No hay un usuario admin para crear los reportes.")
        
    species_list = db.query(Species).all()
    if not species_list:
        raise Exception("No hay especies cargadas.")
        
    # Obtener o crear tipos de eventos
    event_names = ["Comida", "Agua", "Caca", "Pis", "Medicacion", "Enfermedad"]
    event_types = {}
    for name in event_names:
        et = db.query(EventType).filter_by(name=name).first()
        if not et:
            et = EventType(name=name)
            db.add(et)
            db.commit()
            db.refresh(et)
        event_types[name] = et

    # 2. Crear Mascotas Falsas
    mascotas_data = [
        {"name": "Firulais", "species": "Perro", "sex": "M"},
        {"name": "Luna", "species": "Perro", "sex": "F"},
        {"name": "Milo", "species": "Gato", "sex": "M"},
        {"name": "Bella", "species": "Gato", "sex": "F"},
        {"name": "Paco", "species": "Loro", "sex": "M"},
        {"name": "Flash", "species": "Tortuga", "sex": "M"}
    ]
    
    animales_creados = []
    for m in mascotas_data:
        # Buscar especie ID
        sp = next((s for s in species_list if s.name.lower() == m["species"].lower()), species_list[0])
        animal = Animal(name=m["name"], species_id=sp.id, sex=m["sex"], is_active=True)
        db.add(animal)
        db.commit()
        db.refresh(animal)
        animales_creados.append(animal)
        
    print(f"Se crearon {len(animales_creados)} mascotas falsas.")

    # 3. Crear Reportes e Historias (10-15 días atrás)
    historias = [
        {"text": "Estuvo super bien todo el día, {animal} comió toda su ración y tomó bastante agua. Hizo pis normal.", "events": ["Comida", "Agua", "Pis"]},
        {"text": "{animal} hoy no quiso comer a la mañana. Tomó su medicación con salchicha. A la tarde hizo caca muy blanda.", "events": ["Comida", "Medicacion", "Caca"]},
        {"text": "Día tranquilo para {animal}. Jugó mucho. Tomó agua y defeco bien.", "events": ["Agua", "Caca"]},
        {"text": "{animal} parece tener dolor de panza. No comió ni tomó agua. Avisar al veterinario.", "events": ["Enfermedad"]},
        {"text": "Le dimos las gotitas en los ojos a {animal} (medicación). Luego comió su platito entero y orinó en el patio.", "events": ["Medicacion", "Comida", "Pis"]}
    ]

    reportes_creados = 0
    now = datetime.utcnow()
    
    for animal in animales_creados:
        # Crear 3 a 5 reportes por mascota
        num_reportes = random.randint(3, 5)
        for i in range(num_reportes):
            # Fecha aleatoria en los últimos 7 días
            dias_atras = random.randint(0, 7)
            horas_atras = random.randint(0, 23)
            min_atras = random.randint(0, 59)
            fecha_reporte = now - timedelta(days=dias_atras, hours=horas_atras, minutes=min_atras)
            
            # Elegir una historia aleatoria
            historia = random.choice(historias)
            transcript = historia["text"].format(animal=animal.name)
            
            # Insertar Reporte
            rep = Report(
                created_at=fecha_reporte,
                user_id=admin_user.id,
                animal_id=animal.id,
                audio_transcript=transcript
            )
            db.add(rep)
            db.commit()
            db.refresh(rep)
            reportes_creados += 1
            
            # Insertar Eventos asociados
            for ev_name in historia["events"]:
                et_id = event_types[ev_name].id
                # Agregarle un valor genérico o 'Sí' para métricas
                val = "Sí"
                if ev_name == "Caca" and "blanda" in transcript: val = "Blanda"
                if ev_name == "Comida" and "no quiso" in transcript: val = "No comió"
                
                rep_ev = ReportEvent(
                    report_id=rep.id,
                    event_type_id=et_id,
                    value=val,
                    severity=3
                )
                db.add(rep_ev)
            db.commit()

    print(f"¡Éxito! Se generaron {reportes_creados} reportes clínicos falsos distribuidos en los últimos 7 días.")

except Exception as e:
    db.rollback()
    print(f"Error al sembrar datos falsos: {e}")
finally:
    db.close()
