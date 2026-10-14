from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel

from .. import db
from ..security import (USER_ADMIN_ROLES, current_user, hash_password, make_token, public_user,
                        rate_limit, require_gt, verify_password)

router = APIRouter(prefix="/api", tags=["auth"])


@router.post("/auth/login")
def login(request: Request, form: OAuth2PasswordRequestForm = Depends()):
    rate_limit(request, "login")
    u = db.one("SELECT * FROM users WHERE username = ?", form.username.strip().lower())
    if not u or not verify_password(form.password, u["password_hash"]):
        raise HTTPException(401, "Invalid username or password")
    db.audit(None, u, "Signed in")
    return {"access_token": make_token(u["id"]), "token_type": "bearer", "user": public_user(u)}


@router.get("/auth/me")
def me(u: dict = Depends(current_user)):
    return u


@router.get("/orgs")
def orgs(_: dict = Depends(require_gt)):
    return db.all_("SELECT * FROM orgs ORDER BY name")


@router.get("/users")
def users(_: dict = Depends(require_gt)):
    return db.all_("""SELECT u.id, u.username, u.name, u.role, u.email, u.org_id, o.name AS org
                      FROM users u LEFT JOIN orgs o ON o.id = u.org_id ORDER BY u.role, u.name""")


class NewUser(BaseModel):
    username: str
    name: str
    role: str
    password: str
    email: Optional[str] = None
    org_id: Optional[int] = None


@router.post("/users")
def create_user(body: NewUser, u: dict = Depends(require_gt)):
    if u["role"] not in USER_ADMIN_ROLES:
        raise HTTPException(403, "Only admins and directors can add users")
    if body.role not in {"GT Admin", "GT Director", "GT Consultant", "Client"}:
        raise HTTPException(400, "Unknown role")
    if body.role == "Client" and not body.org_id:
        raise HTTPException(400, "Client users need an organisation")
    if len(body.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    uname = body.username.strip().lower()
    if db.one("SELECT id FROM users WHERE username = ?", uname):
        raise HTTPException(409, "Username already taken")
    uid = db.exec_("INSERT INTO users (username, password_hash, name, role, org_id, email) VALUES (?,?,?,?,?,?)",
                   uname, hash_password(body.password), body.name, body.role,
                   body.org_id if body.role == "Client" else None, body.email)
    db.audit(None, u, "Added user", f"{uname} ({body.role})")
    return {"id": uid}


@router.delete("/users/{user_id}")
def delete_user(user_id: int, u: dict = Depends(require_gt)):
    if u["role"] not in USER_ADMIN_ROLES:
        raise HTTPException(403, "Only admins and directors can remove users")
    if user_id == u["id"]:
        raise HTTPException(400, "You cannot remove yourself")
    target = db.one("SELECT username FROM users WHERE id = ?", user_id)
    if not target:
        raise HTTPException(404, "User not found")
    db.exec_("DELETE FROM users WHERE id = ?", user_id)
    db.audit(None, u, "Removed user", target["username"])
    return {"ok": True}
