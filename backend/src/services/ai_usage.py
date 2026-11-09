"""Registro de consumo NLP y consulta de saldo DeepSeek."""

from __future__ import annotations

import os
from datetime import timedelta
from typing import Any, Optional

import requests
from sqlalchemy import func
from sqlalchemy.orm import Session

from src.models.models import AiUsageLog
from src.timezone_ar import now_ar


DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "").strip()
_DEEPSEEK_BASE = (os.getenv("DEEPSEEK_BASE_URL") or "https://api.deepseek.com").rstrip("/")
if _DEEPSEEK_BASE.endswith("/chat/completions"):
    _DEEPSEEK_BASE = _DEEPSEEK_BASE[: -len("/chat/completions")].rstrip("/")


def extract_usage(payload: dict | None) -> dict[str, int]:
    usage = (payload or {}).get("usage") or {}
    prompt = int(usage.get("prompt_tokens") or usage.get("input_tokens") or 0)
    completion = int(usage.get("completion_tokens") or usage.get("output_tokens") or 0)
    total = int(usage.get("total_tokens") or (prompt + completion))
    return {
        "prompt_tokens": prompt,
        "completion_tokens": completion,
        "total_tokens": total,
    }


def log_ai_usage(
    *,
    provider: str,
    model: Optional[str],
    purpose: str,
    payload: dict | None = None,
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
    total_tokens: int = 0,
) -> None:
    """Persiste el uso. Nunca interrumpe el flujo NLP si falla."""
    try:
        if payload is not None:
            parsed = extract_usage(payload)
            prompt_tokens = parsed["prompt_tokens"]
            completion_tokens = parsed["completion_tokens"]
            total_tokens = parsed["total_tokens"]

        if total_tokens <= 0 and prompt_tokens <= 0 and completion_tokens <= 0:
            # Igual registramos la llamada (sirve para contar requests)
            total_tokens = 0

        from src.database.session import SessionLocal

        db = SessionLocal()
        try:
            db.add(
                AiUsageLog(
                    provider=(provider or "unknown").lower(),
                    model=model,
                    purpose=purpose or "nlp",
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens,
                    total_tokens=total_tokens or (prompt_tokens + completion_tokens),
                )
            )
            db.commit()
        finally:
            db.close()
    except Exception as e:
        print(f"[AI_USAGE] No se pudo registrar consumo: {e}")


def fetch_deepseek_balance() -> dict[str, Any]:
    if not DEEPSEEK_API_KEY:
        return {
            "configured": False,
            "error": "Falta DEEPSEEK_API_KEY en el entorno.",
            "is_available": False,
            "balances": [],
        }

    url = f"{_DEEPSEEK_BASE}/user/balance"
    try:
        res = requests.get(
            url,
            headers={
                "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
                "Accept": "application/json",
            },
            timeout=20,
        )
        res.raise_for_status()
        data = res.json() or {}
        balances = []
        for item in data.get("balance_infos") or []:
            if not isinstance(item, dict):
                continue
            balances.append(
                {
                    "currency": item.get("currency") or "USD",
                    "total_balance": item.get("total_balance"),
                    "granted_balance": item.get("granted_balance"),
                    "topped_up_balance": item.get("topped_up_balance"),
                }
            )
        return {
            "configured": True,
            "error": None,
            "is_available": bool(data.get("is_available")),
            "balances": balances,
            "raw_checked_at": now_ar().isoformat(timespec="seconds"),
        }
    except Exception as e:
        return {
            "configured": True,
            "error": str(e),
            "is_available": False,
            "balances": [],
        }


def _sum_rows(rows) -> dict[str, int]:
    calls = 0
    prompt = 0
    completion = 0
    total = 0
    for r in rows:
        calls += 1
        prompt += int(r.prompt_tokens or 0)
        completion += int(r.completion_tokens or 0)
        total += int(r.total_tokens or 0)
    return {
        "calls": calls,
        "prompt_tokens": prompt,
        "completion_tokens": completion,
        "total_tokens": total,
    }


def build_usage_report(db: Session, *, recent_limit: int = 40) -> dict[str, Any]:
    now = now_ar()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=7)
    month_start = today_start - timedelta(days=30)

    def period_stats(since):
        q = db.query(AiUsageLog)
        if since is not None:
            q = q.filter(AiUsageLog.created_at >= since)
        return _sum_rows(q.all())

    by_provider_rows = (
        db.query(
            AiUsageLog.provider,
            func.count(AiUsageLog.id),
            func.coalesce(func.sum(AiUsageLog.prompt_tokens), 0),
            func.coalesce(func.sum(AiUsageLog.completion_tokens), 0),
            func.coalesce(func.sum(AiUsageLog.total_tokens), 0),
        )
        .filter(AiUsageLog.created_at >= month_start)
        .group_by(AiUsageLog.provider)
        .all()
    )
    by_purpose_rows = (
        db.query(
            AiUsageLog.purpose,
            func.count(AiUsageLog.id),
            func.coalesce(func.sum(AiUsageLog.total_tokens), 0),
        )
        .filter(AiUsageLog.created_at >= month_start)
        .group_by(AiUsageLog.purpose)
        .order_by(func.coalesce(func.sum(AiUsageLog.total_tokens), 0).desc())
        .all()
    )

    recent = (
        db.query(AiUsageLog)
        .order_by(AiUsageLog.created_at.desc())
        .limit(recent_limit)
        .all()
    )

    return {
        "totals": {
            "today": period_stats(today_start),
            "week": period_stats(week_start),
            "month": period_stats(month_start),
            "all": period_stats(None),
        },
        "by_provider_month": [
            {
                "provider": p,
                "calls": int(c or 0),
                "prompt_tokens": int(pt or 0),
                "completion_tokens": int(ct or 0),
                "total_tokens": int(tt or 0),
            }
            for p, c, pt, ct, tt in by_provider_rows
        ],
        "by_purpose_month": [
            {
                "purpose": purpose or "nlp",
                "calls": int(c or 0),
                "total_tokens": int(tt or 0),
            }
            for purpose, c, tt in by_purpose_rows
        ],
        "recent": [
            {
                "id": r.id,
                "provider": r.provider,
                "model": r.model,
                "purpose": r.purpose,
                "prompt_tokens": r.prompt_tokens,
                "completion_tokens": r.completion_tokens,
                "total_tokens": r.total_tokens,
                "created_at": r.created_at.isoformat(timespec="seconds") if r.created_at else None,
            }
            for r in recent
        ],
        "deepseek_balance": fetch_deepseek_balance(),
    }
