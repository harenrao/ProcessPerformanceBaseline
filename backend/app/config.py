import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = os.environ.get("PPB_DB", str(BASE_DIR / "ppb.db"))
SECRET_KEY = os.environ.get("PPB_SECRET_KEY", "dev-only-secret-change-me-in-production-0000")
ACCESS_TOKEN_TTL_HOURS = int(os.environ.get("ACCESS_TOKEN_TTL_HOURS", "12"))
MAX_UPLOAD_MB = int(os.environ.get("PPB_MAX_UPLOAD_MB", "16"))
FRONTEND_DIST = BASE_DIR.parent / "frontend" / "dist"
CORS_ORIGINS = [o for o in os.environ.get("PPB_CORS_ORIGINS", "http://localhost:5173").split(",") if o]
