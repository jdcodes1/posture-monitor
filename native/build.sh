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
    -framework CoreVideo \
    PostureWatch/*.swift

# Create app bundle
APP_DIR="PostureWatch.app/Contents/MacOS"
mkdir -p "$APP_DIR"
mkdir -p "PostureWatch.app/Contents"
mv PostureWatch_bin "$APP_DIR/PostureWatch"
cp PostureWatch/Info.plist "PostureWatch.app/Contents/"

# Create entitlements
cat > /tmp/PostureWatch.entitlements << 'ENTITLEMENTS'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.device.camera</key>
    <true/>
    <key>com.apple.security.cs.disable-library-validation</key>
    <true/>
</dict>
</plist>
ENTITLEMENTS

# Ad-hoc sign the app with camera entitlement
codesign --force --sign - --entitlements /tmp/PostureWatch.entitlements --deep "PostureWatch.app"

echo "Built and signed: $(pwd)/PostureWatch.app"
echo "Run: open $(pwd)/PostureWatch.app"
