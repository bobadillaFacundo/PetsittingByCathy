"""Tests de autenticación JWT."""

import pytest
from src.auth import get_password_hash, verify_password, create_access_token


@pytest.mark.unit
class TestPasswordHash:
    def test_hash_and_verify(self):
        hashed = get_password_hash("mi_clave_secreta")
        assert verify_password("mi_clave_secreta", hashed)
        assert not verify_password("otra_clave", hashed)


@pytest.mark.api
class TestAuthEndpoints:
    def test_login_success(self, client, seed):
        res = client.post("/auth/login", data={"username": "testadmin", "password": "testpass123"})
        assert res.status_code == 200
        data = res.json()
        assert "access_token" in data
        assert data["role"] == "admin"
        assert data["name"] == "testadmin"

    def test_login_wrong_password(self, client, seed):
        res = client.post("/auth/login", data={"username": "testadmin", "password": "wrong"})
        assert res.status_code == 401

    def test_login_unknown_user(self, client, seed):
        res = client.post("/auth/login", data={"username": "ghost", "password": "x"})
        assert res.status_code == 401

    def test_me_authenticated(self, client, auth_headers):
        res = client.get("/auth/me", headers=auth_headers)
        assert res.status_code == 200
        assert res.json()["name"] == "testadmin"

    def test_me_no_token(self, client, seed):
        res = client.get("/auth/me")
        assert res.status_code == 401

    def test_inactive_user(self, client, db, seed):
        seed["cuidador"].is_active = False
        db.commit()
        res = client.post("/auth/login", data={"username": "cuidador", "password": "userpass123"})
        assert res.status_code == 401
