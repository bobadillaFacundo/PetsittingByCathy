"""Tests generales de la app."""

import pytest


@pytest.mark.api
def test_root(client):
    res = client.get("/")
    assert res.status_code == 200
    assert "Bienvenido" in res.json()["message"]
