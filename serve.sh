#!/bin/sh
# Start a tiny local web server so the browser is allowed to read the JSON word packs.
# Then open http://localhost:8000
cd "$(dirname "$0")" || exit 1
echo "Bookworms is running at http://localhost:8000  (press Control-C to stop)"
python3 -m http.server 8000
