# Stage 1: compila CSS e icone. Node non arriva nell'immagine finale.
FROM node:22-alpine AS assets
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY assets ./assets
COPY app/templates ./app/templates
COPY app/static ./app/static
RUN npm run build

# Stage 2: runtime Python. Nessun segreto qui: tutto arriva a runtime come variabili d'ambiente.
FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /srv
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && useradd --system --uid 10001 --home-dir /srv rstudy
COPY app ./app
COPY wsgi.py ./
COPY migrations ./migrations
COPY --from=assets /src/app/static/dist ./app/static/dist
USER rstudy
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=2)"
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "2", "--access-logfile", "-", "wsgi:app"]
