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

    echo "Building macOS (arm64 - Apple Silicon)..."
    npm run dist -- --mac --arm64 2>&1 | grep -E "building|packaging|signing"
    echo ""

    echo "Building macOS (x64 - Intel)..."
    npm run dist -- --mac --x64 2>&1 | grep -E "building|packaging|signing"
    echo ""

    echo "Building Windows (x64 - Portable + NSIS Installer)..."
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
