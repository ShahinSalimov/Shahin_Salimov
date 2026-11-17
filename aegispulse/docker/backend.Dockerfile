# syntax=docker/dockerfile:1.7
# AegisPulse API + worker image (same image, different command).
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    # Trust X-Forwarded-For only from private networks (the dashboard / load balancer),
    # so clients that reach the API directly cannot spoof their IP for rate limiting.
    FORWARDED_ALLOW_IPS="127.0.0.1,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16"

WORKDIR /app

COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install -r /app/backend/requirements.txt

COPY agents /app/agents
COPY backend /app/backend
COPY alembic.ini /app/alembic.ini
COPY migrations /app/migrations

# Unprivileged runtime user.
RUN groupadd --system aegis \
    && useradd --system --gid aegis --home /app --shell /usr/sbin/nologin aegis \
    && chown -R aegis:aegis /app
USER aegis

EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4).status == 200 else 1)"

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--workers", "2"]
