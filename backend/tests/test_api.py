import os
import tempfile

os.environ["PPB_DB"] = os.path.join(tempfile.mkdtemp(), "test.db")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def login(c, user, pw):
    r = c.post("/api/auth/login", data={"username": user, "password": pw})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_login_rejects_bad_password(client):
    assert client.post("/api/auth/login", data={"username": "gt.admin", "password": "nope"}).status_code == 401


def test_client_sees_only_own_org(client):
    h = login(client, "acme.cto", "client-2026")
    ps = client.get("/api/projects", headers=h).json()
    assert [p["client"] for p in ps] == ["Acme Industries"]
    other = login(client, "gt.admin", "gt-admin")
    meridian = next(p for p in client.get("/api/projects", headers=other).json() if p["client"] == "Meridian Bank")
    assert client.get(f"/api/projects/{meridian['id']}", headers=h).status_code == 404
    assert client.post("/api/projects", json={"name": "x", "client": "y"}, headers=h).status_code == 403


def test_full_baseline_flow(client):
    diksha = login(client, "gt.diksha", "gt-2026")
    kalpana = login(client, "gt.kalpana", "gt-2026")
    p = client.post("/api/projects", json={"name": "Test PPB", "client": "Test Co", "use_sample": True}, headers=diksha).json()
    pid = p["id"]
    ds = client.get(f"/api/projects/{pid}/dataset", headers=diksha).json()
    assert ds["n_rows"] == 43
    # trailing-space headers must be recognised (the original tool silently dropped these)
    assert "UAT Defects" in ds["mapping"]["defect"]
    assert "Unit Test Review Efforts" in ds["mapping"]["effort"]

    b = client.post(f"/api/projects/{pid}/baselines", json={}, headers=diksha).json()
    names = [m["name"] for m in b["results"]["metrics"]]
    assert "UAT defect density" in names and "Defect removal efficiency" in names
    m = next(m for m in b["results"]["metrics"] if m["key"] == "dd_analysis_review_defects")
    # zero-defect rows are valid data and must be kept
    assert m["n_used"] == 43

    r = client.patch(f"/api/baselines/{b['id']}/exclusions", json={"metric": m["key"], "row": 0, "reason": "short"}, headers=diksha)
    assert r.status_code == 400
    r = client.patch(f"/api/baselines/{b['id']}/exclusions",
                     json={"metric": m["key"], "row": 0, "reason": "Data entry error confirmed with PM"}, headers=diksha).json()
    m2 = next(x for x in r["results"]["metrics"] if x["key"] == m["key"])
    assert m2["n_used"] == 42 and m2["n_excluded"] == 1

    client.post(f"/api/baselines/{b['id']}/submit", json={}, headers=diksha)
    assert client.patch(f"/api/baselines/{b['id']}/exclusions", json={"metric": m["key"], "row": 1}, headers=diksha).status_code == 409
    assert client.post(f"/api/baselines/{b['id']}/approve", json={}, headers=diksha).status_code == 403
    assert client.post(f"/api/baselines/{b['id']}/approve", json={}, headers=kalpana).json()["status"] == "approved"

    for fmt in ("xlsx", "docx", "pptx"):
        r = client.get(f"/api/baselines/{b['id']}/export/{fmt}", headers=diksha)
        assert r.status_code == 200 and len(r.content) > 5000

    b2 = client.post(f"/api/projects/{pid}/baselines", json={"carry_exclusions_from": b["id"]}, headers=diksha).json()
    assert "0" in b2["exclusions"][m["key"]]
    cmp = client.get(f"/api/baselines/{b['id']}/compare/{b2['id']}", headers=diksha).json()
    assert len(cmp["rows"]) == len(names)

    s = client.post(f"/api/projects/{pid}/stratify", json={"metric": "eff_total", "group": "ID prefix"}, headers=diksha).json()
    assert "tests" in s and len(s["groups"]) >= 2

    mod = client.post(f"/api/projects/{pid}/model",
                      json={"y": "SIT Defects", "xs": ["Initial Project Size", "Code Review Defects"]}, headers=diksha).json()
    assert mod["n"] > 10 and len(mod["coefficients"]) == 3
    pr = client.post(f"/api/projects/{pid}/model/predict",
                     json={"y": "SIT Defects", "xs": ["Initial Project Size", "Code Review Defects"], "values": [50, 3]},
                     headers=diksha).json()
    assert pr["pi"][0] < pr["yhat"] < pr["pi"][1]

    audit = client.get(f"/api/projects/{pid}/audit", headers=diksha).json()
    assert any(a["action"] == "Approved baseline" for a in audit)
