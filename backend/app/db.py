"""SQLite persistence. JSON payloads are stored as TEXT and decoded on read."""
from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Iterator, Optional

from .config import DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS orgs (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
  name TEXT NOT NULL, role TEXT NOT NULL, org_id INTEGER REFERENCES orgs(id), email TEXT
);
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, client TEXT NOT NULL, org_id INTEGER REFERENCES orgs(id),
  description TEXT, lifecycle TEXT, size_unit TEXT DEFAULT 'FP', period TEXT,
  metrics TEXT DEFAULT '[]', models TEXT DEFAULT '[]',
  created_at TEXT, created_by INTEGER
);
CREATE TABLE IF NOT EXISTS datasets (
  id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  filename TEXT, uploaded_at TEXT, uploaded_by INTEGER,
  columns TEXT, rows TEXT, mapping TEXT
);
CREATE TABLE IF NOT EXISTS baselines (
  id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  dataset_id INTEGER REFERENCES datasets(id), version INTEGER, label TEXT,
  status TEXT DEFAULT 'draft', settings TEXT, metrics TEXT, exclusions TEXT DEFAULT '{}', results TEXT,
  created_at TEXT, created_by INTEGER, updated_at TEXT,
  submitted_by INTEGER, submitted_at TEXT, approved_by INTEGER, approved_at TEXT, review_note TEXT
);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY, project_id INTEGER, user_id INTEGER, user_name TEXT,
  action TEXT, detail TEXT, at TEXT
);
"""

JSON_FIELDS = {"metrics", "models", "columns", "rows", "mapping", "settings", "exclusions", "results"}


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connect() -> sqlite3.Connection:
    con = sqlite3.connect(DB_PATH, check_same_thread=False)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    return con


@contextmanager
def tx() -> Iterator[sqlite3.Connection]:
    con = connect()
    try:
        yield con
        con.commit()
    finally:
        con.close()


def init() -> None:
    with tx() as con:
        con.executescript(SCHEMA)


def row(r: Optional[sqlite3.Row]) -> Optional[dict]:
    if r is None:
        return None
    d = dict(r)
    for k in JSON_FIELDS & d.keys():
        if isinstance(d[k], str):
            d[k] = json.loads(d[k])
    return d


def one(sql: str, *args: Any) -> Optional[dict]:
    with tx() as con:
        return row(con.execute(sql, args).fetchone())


def all_(sql: str, *args: Any) -> list[dict]:
    with tx() as con:
        return [row(r) for r in con.execute(sql, args).fetchall()]


def exec_(sql: str, *args: Any) -> int:
    args = tuple(json.dumps(a) if isinstance(a, (dict, list)) else a for a in args)
    with tx() as con:
        cur = con.execute(sql, args)
        return cur.lastrowid


def audit(project_id: Optional[int], user: dict, action: str, detail: str = "") -> None:
    exec_("INSERT INTO audit (project_id, user_id, user_name, action, detail, at) VALUES (?,?,?,?,?,?)",
          project_id, user["id"], user["name"], action, detail, now())
