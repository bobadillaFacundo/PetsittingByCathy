import sys
import os
import uuid
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from qdrant_client import QdrantClient
from qdrant_client.models import PointStruct, VectorParams, Distance

# fastembed is required
try:
    from fastembed import TextEmbedding
except ImportError:
    print("Please install fastembed: pip install fastembed")
    sys.exit(1)

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from src.models.models import Report, AnimalObservation
from src.database.session import SQLALCHEMY_DATABASE_URL

QDRANT_URL = "http://100.82.178.56:6333"
COLLECTION_NAME = "veterinary_reports"

def migrate_to_qdrant():
    print("Connecting to PostgreSQL...")
    engine = create_engine(SQLALCHEMY_DATABASE_URL)
    Session = sessionmaker(bind=engine)
    db = Session()
    
    print(f"Connecting to Qdrant at {QDRANT_URL}...")
    client = QdrantClient(url=QDRANT_URL)
    
    print("Initializing embedding model (fastembed with Jina)...")
    # Utilizamos el modelo base de Jina. Si prefieres otro específico (ej. el multilenguaje),
    # puedes cambiarlo a "jinaai/jina-embeddings-v2-base-es" o similar soportado por fastembed.
    embedding_model = TextEmbedding(model_name="jinaai/jina-embeddings-v2-base-en")
    
    # Calcular el tamaño del vector dinámicamente con un texto de prueba
    dummy_vector = list(embedding_model.embed(["test"]))[0].tolist()
    VECTOR_SIZE = len(dummy_vector)
    print(f"Dimensiones del modelo Jina: {VECTOR_SIZE}")
    
    # Create collection if it doesn't exist
    if not client.collection_exists(collection_name=COLLECTION_NAME):
        client.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=VectorParams(size=VECTOR_SIZE, distance=Distance.COSINE),
        )
        print(f"Collection '{COLLECTION_NAME}' created.")
    else:
        print(f"Collection '{COLLECTION_NAME}' already exists.")
        
    points = []
    
    try:
        print("Fetching reports from DB...")
        reports = db.query(Report).all()
        for report in reports:
            if report.audio_transcript:
                text = f"Reporte: {report.audio_transcript}"
                # Generate embedding
                vector = list(embedding_model.embed([text]))[0].tolist()
                
                points.append(
                    PointStruct(
                        id=str(uuid.uuid4()),
                        vector=vector,
                        payload={
                            "type": "report",
                            "report_id": report.id,
                            "animal_id": report.animal_id,
                            "created_at": report.created_at.isoformat(),
                            "text": text
                        }
                    )
                )
                
        print("Fetching observations from DB...")
        observations = db.query(AnimalObservation).all()
        for obs in observations:
            if obs.observation:
                text = f"Observación: {obs.observation}"
                vector = list(embedding_model.embed([text]))[0].tolist()
                
                points.append(
                    PointStruct(
                        id=str(uuid.uuid4()),
                        vector=vector,
                        payload={
                            "type": "observation",
                            "observation_id": obs.id,
                            "animal_id": obs.animal_id,
                            "created_at": obs.created_at.isoformat(),
                            "text": text
                        }
                    )
                )
                
        if points:
            print(f"Inserting {len(points)} points into Qdrant...")
            client.upsert(
                collection_name=COLLECTION_NAME,
                points=points
            )
            print("Migration to Qdrant completed successfully!")
        else:
            print("No data found to migrate to Qdrant (tables are empty).")
    except Exception as e:
        print(f"Error during migration: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    migrate_to_qdrant()
