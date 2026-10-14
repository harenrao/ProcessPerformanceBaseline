"""SQLite persistence. JSON payloads are stored as TEXT and decoded on read."""
from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Iterator, Optional

from .config import DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
  name TEXT NOT NULL, role TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL, filename TEXT, created_at TEXT, updated_at TEXT,
  columns TEXT, rows TEXT, mapping TEXT, metrics TEXT, settings TEXT,
  exclusions TEXT DEFAULT '{}', results TEXT
);
"""

JSON_FIELDS = {"metrics", "columns", "rows", "mapping", "settings", "exclusions", "results"}


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
