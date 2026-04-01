#!/bin/bash
# Double-click this file to launch VoucherVisionGO Editor
cd "$(dirname "$0")"
unset ELECTRON_RUN_AS_NODE
./node_modules/.bin/electron .
