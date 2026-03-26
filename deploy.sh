#!/bin/bash
# Deploy VoucherVisionGO Editor — builds all targets + updates demo
# Usage: ./deploy.sh [--skip-builds]

set -e
cd "$(dirname "$0")"

WEBPAGE_DIR="/Users/willwe/Dropbox/VoucherVisionGO/webpage"

echo "=== VoucherVisionGO Editor Deploy ==="
echo ""

# 1. Build demo
echo "Building demo..."
python3 build_demo.py
echo ""

# 2. Copy demo to webpage
echo "Copying demo to webpage..."
cp build/demo.html "$WEBPAGE_DIR/editor-demo.html"
echo "  → $WEBPAGE_DIR/editor-demo.html"
echo ""

# 3. Build app (unless --skip-builds)
if [ "$1" != "--skip-builds" ]; then
    echo "Building macOS (arm64)..."
    unset ELECTRON_RUN_AS_NODE
    npm run dist -- --mac --arm64 2>&1 | grep -E "building|packaging|signing"
    echo ""

    echo "Building Windows (x64)..."
    npm run dist -- --win --x64 2>&1 | grep -E "building|packaging"
    echo ""

    echo "Building Linux (x64)..."
    npm run dist -- --linux --x64 2>&1 | grep -E "building|packaging"
    echo ""
else
    echo "Skipping app builds (--skip-builds)"
    echo ""
fi

# 4. Summary
echo "=== Build outputs ==="
ls -lhS build/*.dmg build/*.exe build/*.AppImage 2>/dev/null
echo ""
echo "=== Demo ==="
ls -lh "$WEBPAGE_DIR/editor-demo.html"
echo ""
echo "Done! To create a GitHub release:"
echo "  gh release create v1.0.0 \\"
echo "    \"build/VoucherVisionGO Editor-1.0.0-arm64.dmg\" \\"
echo "    \"build/VoucherVisionGO Editor 1.0.0.exe\" \\"
echo "    \"build/VoucherVisionGO Editor-1.0.0.AppImage\" \\"
echo "    --title \"VoucherVisionGO Editor v1.0.0\" \\"
echo "    --notes \"Initial release\""
