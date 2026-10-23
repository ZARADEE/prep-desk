import os
import sqlite3
import sys
import tempfile
from contextlib import closing
from pathlib import Path
import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class MobileAccessGateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.token = "mobile-test-token-7e63"
        cls.environment = patch.dict(
            os.environ,
            {
                "PAPER_HELPER_MOBILE_TOKEN": cls.token,
                "PAPER_HELPER_SYNC_TOKEN": cls.token,
            },
        )
        cls.environment.start()
        from app.main import mobile_access_gate
        from app.sync import router

        cls.web_directory = tempfile.TemporaryDirectory()
        cls.addClassCleanup(cls.web_directory.cleanup)
        Path(cls.web_directory.name, "index.html").write_text("<!doctype html><title>Mobile app</title>", encoding="utf-8")
        cls.app = FastAPI()
        cls.app.middleware("http")(mobile_access_gate)
        cls.app.include_router(router)
        cls.app.mount("/", StaticFiles(directory=cls.web_directory.name, html=True))

    @classmethod
    def tearDownClass(cls):
        cls.environment.stop()

    def setUp(self):
        self.database_directory = tempfile.TemporaryDirectory()
        self.database_path = Path(self.database_directory.name) / "shared-mobile.sqlite3"
        self.database_patch = patch("app.db.DB_PATH", self.database_path)
        self.database_patch.start()
        with closing(sqlite3.connect(self.database_path)) as connection:
            connection.execute(
                """CREATE TABLE sync_state (
                    state_key TEXT PRIMARY KEY,
                    value_json TEXT NOT NULL,
                    revision INTEGER NOT NULL DEFAULT 1,
                    device_id TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )"""
            )
        self.client = TestClient(self.app, raise_server_exceptions=False)

    def tearDown(self):
        self.client.close()
        self.database_patch.stop()
        self.database_directory.cleanup()

    def test_remote_api_requires_scan_grant(self):
        response = self.client.get("/api/not-found")
        self.assertEqual(response.status_code, 401)

    def test_qr_link_sets_http_only_cookie_and_redirects_without_token(self):
        response = self.client.get(
            "/?access_token=" + self.token,
            follow_redirects=False,
        )
        self.assertEqual(response.status_code, 303)
        self.assertEqual(response.headers["location"], "/")
        cookie = response.headers["set-cookie"].lower()
        self.assertIn("httponly", cookie)
        self.assertIn("samesite=strict", cookie)
        self.assertIn("cache-control", response.headers)
        self.assertIn("no-referrer", response.headers.get("referrer-policy", ""))
        self.assertNotIn(self.token, response.headers["location"])

    def test_authorized_browser_can_load_app_and_reach_api(self):
        self.client.get("/?access_token=" + self.token, follow_redirects=False)
        page = self.client.get("/")
        self.assertEqual(page.status_code, 200)
        self.assertIn("text/html", page.headers.get("content-type", ""))
        response = self.client.get("/api/not-found")
        self.assertEqual(response.status_code, 404)

    def test_phone_and_desktop_sync_state_share_the_project_database(self):
        self.client.get("/?access_token=" + self.token, follow_redirects=False)
        pushed = self.client.post(
            "/api/sync/state",
            json={"device_id": "phone-a", "changes": {"target": {"school": "示例大学", "major": "计算机"}}},
        )
        self.assertEqual(pushed.status_code, 200, pushed.text)

        desktop_view = self.client.get("/api/sync/state?device_id=desktop&keys=target")
        self.assertEqual(desktop_view.status_code, 200, desktop_view.text)
        self.assertEqual(
            desktop_view.json()["state"]["target"]["value"],
            {"school": "示例大学", "major": "计算机"},
        )

    def test_wrong_qr_token_is_rejected(self):
        response = self.client.get("/?access_token=wrong", follow_redirects=False)
        self.assertEqual(response.status_code, 403)


if __name__ == "__main__":
    unittest.main()
