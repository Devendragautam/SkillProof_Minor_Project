#!/bin/bash
cd "$(dirname "$0")"
while true; do
  bun index.ts >> /home/z/my-project/proctor-service.log 2>&1
  echo "[run.sh] proctor exited ($?) — restarting in 1s" >> /home/z/my-project/proctor-service.log
  sleep 1
done
