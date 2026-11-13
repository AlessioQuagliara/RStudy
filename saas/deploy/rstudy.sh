#!/usr/bin/env bash
# Gestione di RStudy in produzione su questo server.
# Uso: ./deploy/rstudy.sh {update|start|stop|restart|rebuild|status|logs [servizio]}
set -euo pipefail

cd "$(dirname "$0")/.."   # cartella saas/

COMPOSE=(docker compose -f compose.prod.yaml)
[[ -f compose.server.yaml ]] && COMPOSE+=(-f compose.server.yaml)
COMPOSE+=(--env-file .env.prod)

case "${1:-}" in
  pull)     git pull --ff-only ;;
  update)   # importa le modifiche da git, ricostruisce e riavvia
            git pull --ff-only
            "${COMPOSE[@]}" up -d --build --remove-orphans
            docker image prune -f >/dev/null ;;
  start)    "${COMPOSE[@]}" up -d ;;
  stop)     "${COMPOSE[@]}" stop ;;
  restart)  "${COMPOSE[@]}" restart web worker ;;
  rebuild)  # ricostruisce l'immagine da zero (senza cache) e ricrea i container
            "${COMPOSE[@]}" build --no-cache
            "${COMPOSE[@]}" up -d --force-recreate --remove-orphans
            docker image prune -f >/dev/null ;;
  status)   "${COMPOSE[@]}" ps ;;
  logs)     "${COMPOSE[@]}" logs -f --tail 100 "${@:2}" ;;
  *)        echo "Uso: $0 {pull|update|start|stop|restart|rebuild|status|logs [web|worker|db]}"; exit 1 ;;
esac
