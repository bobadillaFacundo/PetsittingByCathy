from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
from src.timezone_ar import force_process_timezone
from src.routes import animal_routes, report_routes, chat_routes, dashboard_routes, auth_routes, catalog_routes, user_routes, reservation_routes, calendar_routes

force_process_timezone()

app = FastAPI(title="Asistente Veterinario API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(animal_routes.router)
app.include_router(report_routes.router)
app.include_router(chat_routes.router)
app.include_router(dashboard_routes.router)
app.include_router(auth_routes.router)
app.include_router(catalog_routes.router)
app.include_router(user_routes.router)
app.include_router(reservation_routes.router)
app.include_router(calendar_routes.router)

uploads_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "uploads")
os.makedirs(uploads_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")

@app.get("/")
def read_root():
    return {"message": "Bienvenido a la API del Asistente Veterinario"}
