#!/usr/bin/env bash
set -euo pipefail

# Task merges can change dependencies, database schema, or TypeScript sources.
# Keep this safe to run repeatedly and avoid any interactive prompts.
npm ci --no-audit --no-fund
npm run db:push
npm run check