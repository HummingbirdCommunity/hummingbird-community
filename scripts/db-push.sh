#!/usr/bin/env bash
#
# Apply Supabase migrations to a specific environment.
#
#   scripts/db-push.sh staging   # -> project cywuejplvgajgtmevxrv (preview/local)
#   scripts/db-push.sh prod      # -> project mggqxpaxtewwyiyqmsrw (production)
#
# Reads the target's DB password from .env.local:
#   STAGING_DB_PASSWORD=...   (staging)
#   PROD_DB_PASSWORD=...       (prod — keep this commented out unless deploying)
#
set -euo pipefail

TARGET="${1:-}"

# Load .env.local (KEY=VALUE lines; commented lines are ignored).
if [ -f .env.local ]; then
	set -a
	# shellcheck disable=SC1091
	. ./.env.local
	set +a
fi

case "$TARGET" in
	staging)
		REF="cywuejplvgajgtmevxrv"
		PW="${STAGING_DB_PASSWORD:-}"
		;;
	prod | production)
		REF="mggqxpaxtewwyiyqmsrw"
		PW="${PROD_DB_PASSWORD:-}"
		;;
	*)
		echo "usage: scripts/db-push.sh <staging|prod>" >&2
		exit 1
		;;
esac

if [ -z "$PW" ]; then
	echo "Missing DB password for '$TARGET'. Set the matching *_DB_PASSWORD in .env.local." >&2
	exit 1
fi

DB_URL="postgresql://postgres:${PW}@db.${REF}.supabase.co:5432/postgres"
echo "Pushing migrations to '$TARGET' (project ${REF})..."
exec npx supabase db push --db-url "$DB_URL"
