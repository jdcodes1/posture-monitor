#!/bin/bash
set -e
cd "$(dirname "$0")/PostureWatch"

# Compile all Swift files into an app bundle
swiftc \
    -o PostureWatch_bin \
    -framework Cocoa \
    -framework AVFoundation \
    -framework Vision \
    -framework UserNotifications \
    -framework IOKit \
    PostureWatch/*.swift

# Create app bundle
APP_DIR="PostureWatch.app/Contents/MacOS"
mkdir -p "$APP_DIR"
mkdir -p "PostureWatch.app/Contents"
mv PostureWatch_bin "$APP_DIR/PostureWatch"
cp PostureWatch/Info.plist "PostureWatch.app/Contents/"

echo "Built: $(pwd)/PostureWatch.app"
echo "Run: open $(pwd)/PostureWatch.app"
