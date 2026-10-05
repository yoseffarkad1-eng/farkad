#!/usr/bin/env bash
# Deploy only the already-reviewed Farkad v143 reminder backend.
# Run in the owner's Google Cloud Shell. No account passwords are collected.
set -euo pipefail
umask 077
project='farkad-schedule'
candidate='844b5d7e65cf2d16ede074c40be0efaa0b8b07d6'
expected_tree='844e02db736dca3c39f8a56acd0f88de57a65e44'
owner='yosef.farkad1@gmail.com'
command -v gcloud >/dev/null
command -v git >/dev/null
command -v npm >/dev/null
active_account="$(gcloud auth list --filter=status:ACTIVE --format='value(account)')"
if [[ "$active_account" != "$owner" ]]; then
  printf 'STOP: Open Cloud Shell with %s. No deployment was made.\n' "$owner" >&2
  exit 1
fi
[[ "$(gcloud projects describe "$project" --format='value(projectId)')" == "$project" ]]
task_dir="$(mktemp -d -t farkad-reminders-XXXXXXXX)"
secret_file="$task_dir/vapid-private.json"
trap 'rm -f -- "$secret_file"' EXIT
git init -q "$task_dir/source"
cd "$task_dir/source"
git remote add origin https://github.com/yoseffarkad1-eng/farkad.git
git fetch --depth=1 origin "$candidate"
git checkout --detach FETCH_HEAD
[[ "$(git rev-parse HEAD)" == "$candidate" ]]
[[ "$(git rev-parse 'HEAD^{tree}')" == "$expected_tree" ]]
npm ci --prefix functions --ignore-scripts --no-audit --no-fund
gcloud services enable secretmanager.googleapis.com --project="$project" --quiet
gcloud secrets list --project="$project" --format=json > "$task_dir/secret-metadata.json"
secret_exists="$(python3 - "$task_dir/secret-metadata.json" <<'PY'
import json,sys
items=json.load(open(sys.argv[1]))
print('yes' if any(x['name'].rsplit('/',1)[-1]=='FARKAD_WEB_PUSH' for x in items) else 'no')
PY
)"
if [[ "$secret_exists" == yes ]]; then
  versions="$(gcloud secrets versions list FARKAD_WEB_PUSH --project="$project" --filter=state:ENABLED --format='value(name)' --limit=1)"
  [[ -n "$versions" ]] || { echo 'STOP: Existing push secret has no enabled version; it was not replaced.' >&2; exit 1; }
  echo 'Reusing the existing push secret without reading or rotating it.'
else
  (cd functions && node --input-type=module - "$secret_file" <<'JS'
import fs from 'node:fs';
import webpush from 'web-push';
fs.writeFileSync(process.argv[2], JSON.stringify(webpush.generateVAPIDKeys()), {mode:0o600,flag:'wx'});
JS
  )
  gcloud secrets create FARKAD_WEB_PUSH --project="$project" --replication-policy=automatic --data-file="$secret_file" --quiet
  rm -f -- "$secret_file"
fi
# Pinned CLI; Node 22 is used regardless of Cloud Shell's default Node version.
npm exec --yes --package=node@22.23.3 --package=firebase-tools@13.35.1 -- firebase deploy --only functions:reminders --project="$project" --non-interactive
gcloud functions describe reminderDevice --gen2 --region=europe-west1 --project="$project" --format='value(state)'
gcloud functions describe scheduledReminders --gen2 --region=europe-west1 --project="$project" --format='value(state)'
gcloud scheduler jobs list --location=europe-west1 --project="$project" --filter='name:scheduledReminders' --format='table(name,schedule,timeZone,state)'
printf '\nFARKAD_REMINDERS_BACKEND_DEPLOYED\nThe app and phone permissions still need to be activated.\n'
