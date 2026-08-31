#!/bin/bash
cd "$(dirname "$0")" || exit 1
for round in $(seq 1 20); do
  echo "========== ROUND $round start $(date '+%H:%M:%S') =========="
  CONCURRENCY=4 CAPTCHA_BURST=5 node scrape.js
  ok=$(python3 -c "import json;print(len({json.loads(l)['user_id'] for l in open('progress.jsonl') if json.loads(l)['status']=='ok'}))" 2>/dev/null)
  echo "========== ROUND $round end $(date '+%H:%M:%S') unique_ok=$ok =========="
  if [ "$ok" -ge 769 ]; then
    echo "ALL_DONE"
    break
  fi
  echo "cooldown 480s..."
  sleep 480
done
echo "RUNNER_FINISHED ok=$ok"
