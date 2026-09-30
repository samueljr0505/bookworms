#!/bin/sh
# Start a tiny local web server so the browser is allowed to read the JSON word packs.
# Usage:  ./serve.sh          (uses port 8000, or the next free one)
#         ./serve.sh 9000     (start looking from port 9000 instead)
cd "$(dirname "$0")" || exit 1

# ---- find Python -----------------------------------------------------------
if command -v python3 >/dev/null 2>&1; then
  PY=python3
elif command -v python >/dev/null 2>&1; then
  PY=python
else
  echo "Python is not installed, so this script cannot start a server."
  echo "On a Mac, install it with:  brew install python3"
  echo "Or download it from https://www.python.org/downloads/"
  exit 1
fi

# ---- find a free port ------------------------------------------------------
PORT=${1:-8000}
LIMIT=$((PORT + 20))
while [ "$PORT" -lt "$LIMIT" ]; do
  if command -v lsof >/dev/null 2>&1 && lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Port $PORT is already being used by something else, trying $((PORT + 1))..."
    PORT=$((PORT + 1))
  else
    break
  fi
done

echo
echo "  Bookworms is starting..."
echo "  Open this in your browser:   http://localhost:$PORT"
echo "  Press Control-C here to stop the server."
echo

# exec so Control-C reaches Python directly, and so a failure to start is visible
exec "$PY" -m http.server "$PORT"
