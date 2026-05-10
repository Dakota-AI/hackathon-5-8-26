# TestFlight setup for Agents Cloud desktop/mobile

Status:

- [x] Local `asc` command available for App Store Connect workflows.
- [x] Desktop/mobile iOS bundle identifier normalized to `com.agentscloud.desktopmobile`.
- [x] Desktop/mobile display name set to `Agents Cloud`.
- [x] Draft TestFlight workflow added at `apps/desktop_mobile/.asc/workflow.json`.
- [x] Export options template added at `apps/desktop_mobile/.asc/export-options-app-store.plist.example`.
- [ ] App Store Connect API key/profile configured.
- [ ] App Store Connect app record ID added to the workflow.
- [ ] First signed archive exported and uploaded to TestFlight.

## Local CLI

From the repo root:

```bash
asc version
ASC_BYPASS_KEYCHAIN=1 asc auth status --output json --pretty
```

## Required Apple/App Store Connect inputs

To actually upload to TestFlight, we still need Apple-side values that are not in the repo:

1. App Store Connect API key:
   - key ID,
   - issuer ID,
   - downloaded `AuthKey_XXXX.p8` private key.
2. App Store Connect app record ID, not the bundle ID.
3. TestFlight beta group name or group ID.
4. Apple Developer Team ID. Current generated Xcode project has `F2PY472TDT`; confirm this is the correct team.
5. A valid Apple signing setup for bundle ID `com.agentscloud.desktopmobile`.

Do not commit `.p8` files or populated secret config.

## Authenticate asc

Recommended local/repo setup from the desktop/mobile app directory:

```bash
cd apps/desktop_mobile
asc auth login \
  --local \
  --bypass-keychain \
  --name "AgentsCloud" \
  --key-id "YOUR_KEY_ID" \
  --issuer-id "YOUR_ISSUER_ID" \
  --private-key /absolute/path/to/AuthKey_XXXX.p8

ASC_BYPASS_KEYCHAIN=1 asc auth status --validate --output table
```

## Configure export options

Create the real export-options file:

```bash
cd apps/desktop_mobile
cp .asc/export-options-app-store.plist.example .asc/export-options-app-store.plist
```

Then confirm:

```xml
<key>teamID</key>
<string>F2PY472TDT</string>
```

If the team ID is different, edit it locally before publishing.

## Configure the workflow

Edit `apps/desktop_mobile/.asc/workflow.json` and replace:

```json
"APP_ID": "SET_APP_STORE_CONNECT_APP_ID",
"TESTFLIGHT_GROUP": "Internal Testing"
```

You can also pass them at run time:

```bash
apps/desktop_mobile/scripts/testflight_publish.sh \
  VERSION:1.0.0 \
  APP_ID:1234567890 \
  TESTFLIGHT_GROUP:"Internal Testing"
```

## Publish to TestFlight

Dry-run/checks first:

```bash
cd apps/desktop_mobile
asc workflow validate --file .asc/workflow.json --pretty
asc workflow run --dry-run testflight_beta VERSION:1.0.0 APP_ID:1234567890
```

Real run:

```bash
apps/desktop_mobile/scripts/testflight_publish.sh \
  VERSION:1.0.0 \
  APP_ID:1234567890 \
  TESTFLIGHT_GROUP:"Internal Testing"
```

The workflow does:

1. `flutter pub get`.
2. `flutter build ios --release --config-only --build-name "$VERSION" --no-codesign`.
3. Resolves the next App Store Connect build number.
4. Archives `ios/Runner.xcworkspace` with scheme `Runner` for generic iOS.
5. Exports an IPA using automatic signing.
6. Uploads and attaches the build to the configured TestFlight group.

## Fast path remaining

The fastest next step is to create or identify the App Store Connect app for bundle ID `com.agentscloud.desktopmobile`, generate an API key, then run the dry-run command above. Once auth validates, the real upload path is ready.
