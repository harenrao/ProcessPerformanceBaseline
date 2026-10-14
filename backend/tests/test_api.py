import io
import os
import tempfile

os.environ["PPB_DB"] = os.path.join(tempfile.mkdtemp(), "test.db")

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.routers.runs import TEMPLATE_COLUMNS  # noqa: E402


def synthetic_xlsx(n=40, seed=7) -> bytes:
    """Data in the template layout. Some headers carry trailing spaces, as real files do."""
    rng = np.random.default_rng(seed)
    size = rng.lognormal(3.6, 0.5, n).round(2)
    df = pd.DataFrame({"Sr.No.": range(1, n + 1), "Requirement ID": [f"CR{i:04d}" for i in range(n)],
                       "Initial Project Size": size})
    for c in TEMPLATE_COLUMNS[3:15]:
        df[c] = (size * rng.lognormal(-2.5, 0.4, n)).round(2)
    for c in TEMPLATE_COLUMNS[15:]:
        df[c] = rng.poisson(size / 25)  # includes zeros
    df = df.rename(columns={"UAT Defects": "UAT Defects ", "UAT Efforts": "UAT Efforts "})
    buf = io.BytesIO()
    df.to_excel(buf, index=False)
    return buf.getvalue()


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def auth(client):
    assert client.get("/api/auth/status").json() == {"has_users": False}
    r = client.post("/api/auth/register", json={"name": "Asha Rao", "username": "asha", "password": "secret-123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_login_and_status(client, auth):
    assert client.get("/api/auth/status").json() == {"has_users": True}
    assert client.post("/api/auth/login", data={"username": "asha", "password": "nope"}).status_code == 401
    assert client.post("/api/auth/login", data={"username": "asha", "password": "secret-123"}).status_code == 200
    assert client.get("/api/runs").status_code == 401


def test_template(client, auth):
    r = client.get("/api/template", headers=auth)
    df = pd.read_excel(io.BytesIO(r.content))
    assert list(df.columns) == TEMPLATE_COLUMNS


def test_upload_run_exclude_export(client, auth):
    files = {"file": ("q1.xlsx", synthetic_xlsx(), "application/octet-stream")}
    ins = client.post("/api/inspect", files=files, headers=auth).json()
    assert ins["mapping"]["size"] == "Initial Project Size"
    assert "UAT Defects" in ins["mapping"]["defect"]  # trailing space handled

    run = client.post("/api/runs", files={"file": ("q1.xlsx", synthetic_xlsx(), "x")},
                      data={"name": "FY26 PPB"}, headers=auth).json()
    names = [m["name"] for m in run["results"]["metrics"]]
    assert "UAT defect density" in names and "Defect removal efficiency" in names
    m = next(m for m in run["results"]["metrics"] if m["key"] == "dd_uat_defects")
    assert m["n_total"] == 40  # zero-defect rows are data, not dropped
    assert {"lcl", "cl", "ucl"} <= m["baseline"].keys()

    # every metric runs the sequence: box-plot iterations end clean or at the 10% cap
    for x in run["results"]["metrics"]:
        its = x["box_iterations"]
        assert its and x["n_box_removed"] <= 4
        assert not its[-1]["removed"]
        assert {"p25", "p75", "normality_p"} <= x["stats"].keys()

    url = f"/api/runs/{run['id']}/overrides"
    assert client.patch(url, json={"metric": m["key"], "row": 0, "action": "exclude", "reason": "short"}, headers=auth).status_code == 400
    r = client.patch(url, json={"metric": m["key"], "row": 0, "action": "exclude", "reason": "Data entry error confirmed"}, headers=auth).json()
    m2 = next(x for x in r["results"]["metrics"] if x["key"] == m["key"])
    assert m2["n_manual_removed"] == 1

    # put a box-plot outlier back
    eff = next(x for x in r["results"]["metrics"] if x["n_box_removed"])
    row = next(p["row"] for p in eff["points"] if p["removed_by"] == "box")
    r = client.patch(url, json={"metric": eff["key"], "row": row, "action": "keep", "reason": "Verified with the team"}, headers=auth).json()
    eff2 = next(x for x in r["results"]["metrics"] if x["key"] == eff["key"])
    assert not next(p for p in eff2["points"] if p["row"] == row)["excluded"]

    for fmt in ("xlsx", "docx", "pptx"):
        e = client.get(f"/api/runs/{run['id']}/export/{fmt}?metrics=dd_uat_defects,eff_total", headers=auth)
        assert e.status_code == 200 and len(e.content) > 5000
    assert client.get(f"/api/runs/{run['id']}/export/pptx?metrics=nope", headers=auth).status_code == 400

    assert [x["name"] for x in client.get("/api/runs", headers=auth).json()] == ["FY26 PPB"]


def test_runs_are_private(client, auth):
    other = client.post("/api/auth/register", json={"name": "B", "username": "bob", "password": "secret-456"}).json()
    h = {"Authorization": f"Bearer {other['access_token']}"}
    assert client.get("/api/runs", headers=h).json() == []
    rid = client.get("/api/runs", headers=auth).json()[0]["id"]
    assert client.get(f"/api/runs/{rid}", headers=h).status_code == 404


def test_rejects_file_without_size(client, auth):
    df = pd.DataFrame({"Name": ["a", "b"], "Value": [1, 2]})
    buf = io.BytesIO()
    df.to_csv(buf, index=False)
    r = client.post("/api/runs", files={"file": ("x.csv", buf.getvalue(), "text/csv")}, headers=auth)
    assert r.status_code == 400
