#!/bin/sh
set -e

echo "Applico le migration pendenti..."
node dist/db/migrate.js

exec "$@"
