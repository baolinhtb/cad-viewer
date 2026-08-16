#!/usr/bin/env bash
# Usage: ./run.sh <base-url> <email> <password>
#
# Bundles the shipped resolver, then runs the twenty sentences against the
# deployment's /api/ai/messages. Costs about 60 model calls.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../.." && pwd)"

"$repo"/node_modules/.pnpm/esbuild@*/node_modules/esbuild/bin/esbuild \
  "$repo/packages/cad-template-sdk/src/AcTpSemanticQuery.ts" \
  --bundle --format=esm --platform=node --log-level=error \
  --outfile="$here/semanticQuery.mjs"

node "$here/run.mjs" "$@"
