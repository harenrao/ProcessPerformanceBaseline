from __future__ import annotations

import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordBearer

from . import db
from .config import ACCESS_TOKEN_TTL_HOURS, SECRET_KEY

oauth2 = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()


def verify_password(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode(), h.encode())
    except ValueError:
        return False


def make_token(user_id: int) -> str:
    exp = datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_TTL_HOURS)
    return jwt.encode({"sub": str(user_id), "exp": exp}, SECRET_KEY, algorithm="HS256")


def public_user(u: dict) -> dict:
    return {k: u.get(k) for k in ("id", "username", "name", "role")}


def current_user(token: str = Depends(oauth2)) -> dict:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(401, "Session expired. Sign in again.")
    u = db.one("SELECT * FROM users WHERE id = ?", int(payload["sub"]))
    if not u:
        raise HTTPException(401, "Unknown user")
    return public_user(u)


_attempts: dict[str, deque] = defaultdict(deque)


def rate_limit(request: Request, key: str, limit: int = 10, window: int = 300) -> None:
    k = f"{request.client.host if request.client else '-'}:{key}"
    q = _attempts[k]
    t = time.time()
    while q and q[0] < t - window:
        q.popleft()
    if len(q) >= limit:
        raise HTTPException(429, "Too many attempts. Try again in a few minutes.")
    q.append(t)
