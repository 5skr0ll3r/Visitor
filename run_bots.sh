#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$SCRIPT_DIR/logs"
mkdir -p "$LOG_DIR"

# ── Config ────────────────────────────────────────────────────────────────────
MAX_PARALLEL=3          # max instances running at the same time
TARGET_PER_5MIN=5       # how many runs to aim for per 5 minutes
DELAY_BETWEEN=$((900 / TARGET_PER_5MIN))
DELAY_JITTER=20         # ± seconds of random jitter on the delay
# ─────────────────────────────────────────────────────────────────────────────

PIDS=()
TOTAL_LAUNCHED=0
TOTAL_COMPLETED=0
TOTAL_KILLED=0

cleanup() {
  echo ""
  echo "Caught CTRL+C stopping all running instances..."
  kill_all
  echo "Done. Launched: $TOTAL_LAUNCHED | Completed: $TOTAL_COMPLETED | Times Killed: $TOTAL_KILLED"
  exit 0
}

kill_all() {
  echo "Killing all hung processes..."
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null
      echo "   Killed PID $pid"
    fi
  done
}

trap cleanup SIGINT SIGTERM

# Remove finished PIDs from the tracking array
reap_finished() {
  local live=()
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      live+=("$pid")
    else
      wait "$pid" 2>/dev/null
      ((TOTAL_COMPLETED++))
    fi
  done
  PIDS=("${live[@]}")
}

launch_instance() {
  local timestamp
  timestamp=$(date +"%Y%m%d_%H%M%S")
  local logfile="$LOG_DIR/run_${timestamp}_$$.log"

  echo "[$(date '+%H:%M:%S')] Launching instance #$((TOTAL_LAUNCHED + 1)) -> $logfile"

  node "$SCRIPT_DIR/client.js" >> "$logfile" 2>&1 &
  local pid=$!
  PIDS+=("$pid")
  ((TOTAL_LAUNCHED++))
}

echo "═══════════════════════════════════════════"
echo "  Bot runner started — CTRL+C to stop"
echo "  Max parallel : $MAX_PARALLEL"
echo "  Target rate  : $TARGET_PER_5MIN runs / 5 min"
echo "  Base delay   : ${DELAY_BETWEEN}s ± ${DELAY_JITTER}s"
echo "  Logs         : $LOG_DIR"
echo "═══════════════════════════════════════════"
echo ""

count=0
timeout=3
while true; do
  reap_finished

  running=${#PIDS[@]}
  echo "[$(date '+%H:%M:%S')] Running: $running / $MAX_PARALLEL | Total launched: $TOTAL_LAUNCHED | Completed: $TOTAL_COMPLETED | Times Killed: $TOTAL_KILLED"
  if [ "$running" -lt "$MAX_PARALLEL" ] && [ "$count" -lt "$timeout" ]; then
    ((count++))
    slots=$((MAX_PARALLEL - running))
    to_launch=$((RANDOM % 2 + 1))
    to_launch=$((to_launch < slots ? to_launch : slots))
    for ((i = 0; i < to_launch; i++)); do
      launch_instance
      sleep $((RANDOM % 5 + 2))
    done
  elif [ "$running" -ge "$MAX_PARALLEL" ]; then
    ((count++))
    echo "Count: $count"
    if [ "$count" -ge "$timeout" ]; then   # use -ge not -eq
      kill_all
      (($TOTAL_KILLED++))
      count=0                               # always reset
    fi
    echo "[$(date '+%H:%M:%S')] Max parallel reached, waiting..."
  else
    # running < MAX_PARALLEL but count >= timeout → reset and allow launching
    count=0
  fi

  # Wait DELAY_BETWEEN +- DELAY_JITTER seconds before next check
  jitter=$((RANDOM % (DELAY_JITTER * 2 + 1) - DELAY_JITTER))
  sleep_time=$((DELAY_BETWEEN + jitter))
  [ "$sleep_time" -lt 10 ] && sleep_time=10  # never sleep less than 10s
  echo "[$(date '+%H:%M:%S')] Next check in ${sleep_time}s"
  echo ""
  sleep "$sleep_time"
done