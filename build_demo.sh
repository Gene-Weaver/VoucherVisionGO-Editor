#!/bin/bash

set -euo pipefail
cd "$(dirname "$0")"

python3 build_demo.py "$@"
