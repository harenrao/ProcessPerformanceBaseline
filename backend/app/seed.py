"""Demo organisations, users and projects. Runs only when the users table is empty."""
from __future__ import annotations

from . import db, services
from .config import SAMPLE_DATA
from .engine.baseline import DEFAULT_SETTINGS
from .engine.ingest import infer_mapping, propose_metrics, read_table
from .security import hash_password

ORGS = ["Grant Thornton", "Meridian Bank", "Acme Industries", "Nordwind Logistics"]

USERS = [
    ("gt.admin", "gt-admin", "GT Admin", "Harender Singh", "Grant Thornton"),
    ("gt.kalpana", "gt-2026", "GT Director", "Kalpana Tikoo", "Grant Thornton"),
    ("gt.diksha", "gt-2026", "GT Consultant", "Diksha Gupta", "Grant Thornton"),
    ("meridian.cio", "client-2026", "Client", "Meridian Bank", "Meridian Bank"),
    ("acme.cto", "client-2026", "Client", "Acme Industries", "Acme Industries"),
    ("nordwind.it", "client-2026", "Client", "Nordwind Logistics", "Nordwind Logistics"),
]

PROJECTS = [
    ("Core Banking AD — PPB FY26", "Meridian Bank", "Application development baseline for the core banking "
     "change programme (CMMI-DEV ML5 appraisal).", "Development", "FP", "Apr 2025 – Mar 2026", True),
    ("ERP Enhancements Baseline", "Acme Industries", "Enhancement and maintenance requests across the SAP estate.",
     "Enhancement", "FP", "FY 2025-26", True),
    ("Logistics Platform PPB", "Nordwind Logistics", "Agile delivery baseline for the routing platform.",
     "Agile", "SP", "H1 2026", False),
]


def seed() -> None:
    if db.one("SELECT id FROM users LIMIT 1"):
        return
    org_ids = {n: db.exec_("INSERT INTO orgs (name) VALUES (?)", n) for n in ORGS}
    uid = {}
    for username, pw, role, name, org in USERS:
        uid[username] = db.exec_("INSERT INTO users (username, password_hash, name, role, org_id, email) VALUES (?,?,?,?,?,?)",
                                 username, hash_password(pw), name, role,
                                 None if role != "Client" else org_ids[org], f"{username}@example.com")
    diksha = {"id": uid["gt.diksha"], "name": "Diksha Gupta"}
    kalpana = {"id": uid["gt.kalpana"], "name": "Kalpana Tikoo"}

    raw = SAMPLE_DATA.read_bytes()
    for name, client, desc, life, unit, period, with_data in PROJECTS:
        pid = db.exec_("""INSERT INTO projects (name, client, org_id, description, lifecycle, size_unit, period,
                          metrics, models, created_at, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                       name, client, org_ids[client], desc, life, unit, period, [], [], db.now(), uid["gt.diksha"])
        db.audit(pid, diksha, "Created project", name)
        if not with_data:
            continue
        df = read_table(raw, SAMPLE_DATA.name)
        mapping = infer_mapping(df)
        metrics = propose_metrics(mapping, unit)
        rows = df.astype(object).where(df.notna(), None).to_dict("records")
        dsid = db.exec_("INSERT INTO datasets (project_id, filename, uploaded_at, uploaded_by, columns, rows, mapping) "
                        "VALUES (?,?,?,?,?,?,?)", pid, SAMPLE_DATA.name, db.now(), uid["gt.diksha"],
                        list(df.columns), rows, mapping)
        db.exec_("UPDATE projects SET metrics = ? WHERE id = ?", metrics, pid)
        db.audit(pid, diksha, "Uploaded dataset", f"{SAMPLE_DATA.name} · {len(df)} rows")

        versions = [("Initial baseline", "approved", {}), ("Refresh with justified exclusions", "draft", None)] \
            if client == "Meridian Bank" else [("Initial baseline", "draft", {})]
        for v, (label, status, excl) in enumerate(versions, 1):
            b = {"dataset_id": dsid, "metrics": metrics, "settings": dict(DEFAULT_SETTINGS), "exclusions": excl or {}}
            if excl is None:
                # Demonstrate a justified exclusion: the 1,440 FP programme is a different process.
                big = int(df["Initial Project Size"].idxmax())
                b["exclusions"] = {m["key"]: {str(big): "Programme-level record (1,440 FP) follows the large-programme "
                                              "process, not the CR process — Diksha Gupta, seed"} for m in metrics}
            b["results"] = services.run(b)
            bid = db.exec_("""INSERT INTO baselines (project_id, dataset_id, version, label, status, settings, metrics,
                              exclusions, results, created_at, created_by, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                           pid, dsid, v, label, "draft", b["settings"], metrics, b["exclusions"], b["results"],
                           db.now(), uid["gt.diksha"], db.now())
            db.audit(pid, diksha, "Ran baseline", f"v{v}")
            if status == "approved":
                db.exec_("UPDATE baselines SET status='approved', submitted_by=?, submitted_at=?, approved_by=?, "
                         "approved_at=?, review_note=? WHERE id=?", uid["gt.diksha"], db.now(), uid["gt.kalpana"],
                         db.now(), "Approved for QPM use in FY26 projects.", bid)
                db.audit(pid, diksha, "Submitted baseline for approval", f"v{v}")
                db.audit(pid, kalpana, "Approved baseline", f"v{v}")
