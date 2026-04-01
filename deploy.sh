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
    unset ELECTRON_RUN_AS_NODE

    echo "Building all platforms in parallel..."
    echo ""

    # Run all four builds in parallel, each logging to a temp file
    LOGDIR=$(mktemp -d)
    trap "rm -rf $LOGDIR" EXIT

    (echo "[mac-arm64] Building..." && npm run dist -- --mac --arm64 2>&1 | grep -E "building|packaging|signing" | sed 's/^/  [mac-arm64] /' && echo "[mac-arm64] Done.") > "$LOGDIR/mac-arm64.log" 2>&1 &
    PID_MAC_ARM=$!

    (echo "[mac-x64] Building..." && npm run dist -- --mac --x64 2>&1 | grep -E "building|packaging|signing" | sed 's/^/  [mac-x64] /' && echo "[mac-x64] Done.") > "$LOGDIR/mac-x64.log" 2>&1 &
    PID_MAC_X64=$!

    (echo "[win-x64] Building..." && npm run dist -- --win --x64 2>&1 | grep -E "building|packaging" | sed 's/^/  [win-x64] /' && echo "[win-x64] Done.") > "$LOGDIR/win-x64.log" 2>&1 &
    PID_WIN=$!

    (echo "[linux-x64] Building..." && npm run dist -- --linux --x64 2>&1 | grep -E "building|packaging" | sed 's/^/  [linux-x64] /' && echo "[linux-x64] Done.") > "$LOGDIR/linux-x64.log" 2>&1 &
    PID_LINUX=$!

    # Wait for all and track failures
    FAILED=0
    for PID_NAME in "mac-arm64:$PID_MAC_ARM" "mac-x64:$PID_MAC_X64" "win-x64:$PID_WIN" "linux-x64:$PID_LINUX"; do
        NAME="${PID_NAME%%:*}"
        PID="${PID_NAME##*:}"
        if wait "$PID"; then
            echo "  ✓ $NAME completed"
        else
            echo "  ✗ $NAME FAILED (exit $?)"
            FAILED=1
        fi
        cat "$LOGDIR/$NAME.log"
        echo ""
    done

    if [ "$FAILED" = "1" ]; then
        echo "ERROR: One or more builds failed. Aborting."
        exit 1
    fi
else
    echo "Skipping app builds (--skip-builds)"
    echo ""
fi

# 4. Summary
echo "=== Build outputs ==="
ls -lhS build/*.dmg build/*.zip build/*.exe build/*.AppImage build/latest*.yml 2>/dev/null
echo ""
echo "=== Demo ==="
ls -lh "$WEBPAGE_DIR/editor-demo.html"
echo ""
# 5. Read version from package.json
VERSION=$(node -e "console.log(require('./package.json').version)")
TAG="v${VERSION}"
echo "Version: $VERSION  Tag: $TAG"
echo ""

# 6. Create GitHub release (unless --skip-release)
if [ "$1" != "--skip-release" ] && [ "$1" != "--skip-builds" ]; then
    echo "Creating GitHub release $TAG..."

    # Delete existing release/tag if re-deploying same version
    gh release delete "$TAG" --repo Gene-Weaver/VoucherVisionGO-Editor --yes 2>/dev/null || true
    git tag -d "$TAG" 2>/dev/null || true
    git push origin ":refs/tags/$TAG" 2>/dev/null || true

    gh release create "$TAG" \
      "build/VoucherVisionGO-Editor-${VERSION}-arm64.dmg#macOS (Apple Silicon)" \
      "build/VoucherVisionGO-Editor-${VERSION}-x64.dmg#macOS (Intel)" \
      "build/VoucherVisionGO-Editor-${VERSION}-arm64.zip" \
      "build/VoucherVisionGO-Editor-${VERSION}-x64.zip" \
      "build/VoucherVisionGO-Editor-${VERSION}-x64.exe#Windows Portable (64-bit)" \
      "build/VoucherVisionGO-Editor-Setup-${VERSION}-x64.exe#Windows Installer (64-bit, auto-update)" \
      "build/VoucherVisionGO-Editor-${VERSION}-x86_64.AppImage#Linux (64-bit)" \
      "build/latest-mac.yml" \
      "build/latest.yml" \
      "build/latest-linux.yml" \
      --repo Gene-Weaver/VoucherVisionGO-Editor \
      --title "VoucherVisionGO Editor $TAG" \
      --notes "See [README](https://github.com/Gene-Weaver/VoucherVisionGO-Editor#readme) for details and installation instructions."

    echo ""
    echo "Release created: https://github.com/Gene-Weaver/VoucherVisionGO-Editor/releases/tag/$TAG"
else
    echo "Skipping GitHub release"
    echo ""
    echo "To release manually:"
    echo "  gh release create $TAG \\"
    echo "    \"build/VoucherVisionGO-Editor-${VERSION}-arm64.dmg\" \\"
    echo "    \"build/VoucherVisionGO-Editor-${VERSION}-x64.dmg\" \\"
    echo "    \"build/VoucherVisionGO-Editor-${VERSION}-arm64.zip\" \\"
    echo "    \"build/VoucherVisionGO-Editor-${VERSION}-x64.zip\" \\"
    echo "    \"build/VoucherVisionGO-Editor-${VERSION}-x64.exe\" \\"
    echo "    \"build/VoucherVisionGO-Editor-Setup-${VERSION}-x64.exe\" \\"
    echo "    \"build/VoucherVisionGO-Editor-${VERSION}-x86_64.AppImage\" \\"
    echo "    \"build/latest-mac.yml\" \"build/latest.yml\" \"build/latest-linux.yml\" \\"
    echo "    --repo Gene-Weaver/VoucherVisionGO-Editor \\"
    echo "    --title \"VoucherVisionGO Editor $TAG\""
fi
