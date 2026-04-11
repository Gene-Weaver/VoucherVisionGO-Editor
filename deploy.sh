#!/bin/bash
# Deploy VoucherVisionGO Editor — builds all targets + updates demo
# Usage: ./deploy.sh [--skip-builds] [--skip-release]

set -euo pipefail
cd "$(dirname "$0")"

# Auto-load code-signing secrets if present. Copy .env.signing.example to
# .env.signing and fill in the real values — it is gitignored.
if [ -f .env.signing ]; then
    # shellcheck disable=SC1091
    source .env.signing
fi

WEBPAGE_DIR="/Users/willwe/Dropbox/VoucherVisionGO/webpage"
SKIP_BUILDS=0
SKIP_RELEASE=0

for arg in "$@"; do
    case "$arg" in
        --skip-builds)
            SKIP_BUILDS=1
            ;;
        --skip-release)
            SKIP_RELEASE=1
            ;;
        *)
            echo "Unknown option: $arg"
            echo "Usage: ./deploy.sh [--skip-builds] [--skip-release]"
            exit 1
            ;;
    esac
done

echo "=== VoucherVisionGO Editor Deploy ==="
echo ""

# Read version once up-front so it's available to the build/notarize/release
# steps without having to query node multiple times.
VERSION=$(node -e "console.log(require('./package.json').version)")
TAG="v${VERSION}"
echo "Version: $VERSION  Tag: $TAG"
echo ""

# 1. Build demo
echo "Building demo..."
./build_demo.sh
echo ""

# 2. Copy demo to webpage
echo "Copying demo to webpage..."
cp build/demo.html "$WEBPAGE_DIR/editor-demo.html"
echo "  → $WEBPAGE_DIR/editor-demo.html"
echo ""

# 3. Build app (unless --skip-builds)
if [ "$SKIP_BUILDS" -ne 1 ]; then
    unset ELECTRON_RUN_AS_NODE

    echo "Building all platforms in parallel..."
    echo ""

    # Run all four builds in parallel, each logging to a temp file
    LOGDIR=$(mktemp -d)
    trap 'rm -rf "$LOGDIR"' EXIT

    (npm run dist -- --mac --arm64 > "$LOGDIR/mac-arm64.raw.log" 2>&1) &
    PID_MAC_ARM=$!

    (npm run dist -- --mac --x64 > "$LOGDIR/mac-x64.raw.log" 2>&1) &
    PID_MAC_X64=$!

    (npm run dist -- --win --x64 > "$LOGDIR/win-x64.raw.log" 2>&1) &
    PID_WIN=$!

    (npm run dist -- --linux --x64 > "$LOGDIR/linux-x64.raw.log" 2>&1) &
    PID_LINUX=$!

    # Wait for all and track failures
    FAILED=0
    for PID_NAME in "mac-arm64:$PID_MAC_ARM" "mac-x64:$PID_MAC_X64" "win-x64:$PID_WIN" "linux-x64:$PID_LINUX"; do
        NAME="${PID_NAME%%:*}"
        PID="${PID_NAME##*:}"
        echo "  [$NAME] Building..."
        if wait "$PID"; then
            echo "  ✓ $NAME completed"
        else
            STATUS=$?
            echo "  ✗ $NAME FAILED (exit $STATUS)"
            FAILED=1
        fi
        # Surface the meaningful per-build lines, including notarization status
        # so a silent notarize-skip can never hide again.
        FILTER='building|packaging|signing|artifact|executing|downloading|notariz|stapl|error|fail|⨯|✗'
        if grep -E -i "$FILTER" "$LOGDIR/$NAME.raw.log" >/dev/null 2>&1; then
            grep -E -i "$FILTER" "$LOGDIR/$NAME.raw.log" | sed "s/^/    [$NAME] /"
        else
            tail -n 20 "$LOGDIR/$NAME.raw.log" | sed "s/^/    [$NAME] /"
        fi
        echo ""
    done

    if [ "$FAILED" = "1" ]; then
        echo "ERROR: One or more builds failed. Aborting."
        exit 1
    fi

    # 3b. Notarize and staple macOS DMG containers.
    #
    # electron-builder's `notarize: true` option only notarizes the .app
    # inside the .dmg — it does NOT submit the DMG container itself, so the
    # DMG ends up with a notarized .app but no DMG-level ticket. This means
    # offline users (or users on older macOS) can hit Gatekeeper warnings
    # when mounting the DMG. We fix it here by submitting each finished DMG
    # to Apple separately, then stapling the returned ticket to the DMG.
    #
    # The .app inside is already notarized+stapled by electron-builder, so
    # this is a fast second pass — Apple usually re-uses the existing
    # ticket and responds in a minute or two.
    if [ -n "${APPLE_ID:-}" ] && [ -n "${APPLE_TEAM_ID:-}" ] && [ -n "${APPLE_APP_SPECIFIC_PASSWORD:-}" ]; then
        echo "Notarizing and stapling macOS DMG containers..."
        echo ""
        for arch in arm64 x64; do
            DMG="build/VoucherVisionGO-Editor-${VERSION}-${arch}.dmg"
            if [ ! -f "$DMG" ]; then
                echo "  ⚠ $DMG not found, skipping"
                continue
            fi
            echo "  [$arch] Submitting $(basename "$DMG") to Apple..."
            SUBMIT_OUT=$(xcrun notarytool submit "$DMG" \
                --apple-id "$APPLE_ID" \
                --team-id "$APPLE_TEAM_ID" \
                --password "$APPLE_APP_SPECIFIC_PASSWORD" \
                --wait \
                --output-format json 2>&1)
            STATUS=$(echo "$SUBMIT_OUT" | grep -o '"status":[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
            if [ "$STATUS" != "Accepted" ]; then
                echo "  ✗ [$arch] Notarization failed (status: $STATUS)"
                echo "$SUBMIT_OUT" | sed "s/^/    /"
                exit 1
            fi
            echo "  ✓ [$arch] Apple Accepted — stapling..."
            if xcrun stapler staple "$DMG" 2>&1 | sed "s/^/    /"; then
                # Verify the staple was actually applied
                if xcrun stapler validate "$DMG" >/dev/null 2>&1; then
                    echo "  ✓ [$arch] Stapled and validated $(basename "$DMG")"
                else
                    echo "  ✗ [$arch] Staple validation failed for $(basename "$DMG")"
                    exit 1
                fi
            else
                echo "  ✗ [$arch] Stapling failed for $(basename "$DMG")"
                exit 1
            fi
            echo ""
        done
    else
        echo "⚠ Skipping DMG notarization — Apple credentials not set."
        echo "  Set APPLE_ID, APPLE_TEAM_ID, APPLE_APP_SPECIFIC_PASSWORD in"
        echo "  .env.signing (see .env.signing.example for the template)."
        echo ""
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

# 5. Create GitHub release (unless --skip-release)
if [ "$SKIP_RELEASE" -ne 1 ] && [ "$SKIP_BUILDS" -ne 1 ]; then
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
