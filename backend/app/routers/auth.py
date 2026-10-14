from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel

from .. import db
from ..security import current_user, hash_password, make_token, public_user, rate_limit, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/status")
def status():
    """Lets the sign-in screen show 'create your account' on a fresh install."""
    return {"has_users": db.one("SELECT id FROM users LIMIT 1") is not None}


@router.post("/login")
def login(request: Request, form: OAuth2PasswordRequestForm = Depends()):
    rate_limit(request, "login")
    u = db.one("SELECT * FROM users WHERE username = ?", form.username.strip().lower())
    if not u or not verify_password(form.password, u["password_hash"]):
        raise HTTPException(401, "Invalid username or password")
    return {"access_token": make_token(u["id"]), "token_type": "bearer", "user": public_user(u)}


class Register(BaseModel):
    name: str
    username: str
    password: str


@router.post("/register")
def register(request: Request, body: Register):
    rate_limit(request, "register")
    uname = body.username.strip().lower()
    if not body.name.strip() or not uname:
        raise HTTPException(400, "Name and username are required")
    if len(body.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    if db.one("SELECT id FROM users WHERE username = ?", uname):
        raise HTTPException(409, "That username is taken")
    uid = db.exec_("INSERT INTO users (username, password_hash, name, role) VALUES (?,?,?,?)",
                   uname, hash_password(body.password), body.name.strip(), "User")
    u = db.one("SELECT * FROM users WHERE id = ?", uid)
    return {"access_token": make_token(uid), "token_type": "bearer", "user": public_user(u)}


@router.get("/me")
def me(u: dict = Depends(current_user)):
    return u
