#!/usr/bin/env bash
# Valida o seu módulo: mescla schemas (serializado entre agentes), gera o client
# do Prisma e roda o tsc mostrando só os erros dos módulos informados.
# Uso: bash scripts/edu-check.sh <modulo> [<modulo>...]     ex.: bash scripts/edu-check.sh admissoes
cd "$(dirname "$0")/.."
export DATABASE_URL="${DATABASE_URL:-postgresql://u:p@localhost:5432/db}"
flock /tmp/edu-prisma.lock bash -c 'node scripts/merge-edu-schema.js && npx prisma generate >/dev/null 2>&1 && echo "prisma client gerado"'
pat=$(printf "src/modules/%s/|" "$@" | sed 's/|$//')
echo "--- tsc (filtrado: $*) ---"
npx tsc --noEmit 2>&1 | grep -E "$pat|src/modules/edu.routes|src/modules/core" || echo "OK: sem erros de tipo nos módulos informados"
