# Publishing NEETIQ Prime to the Google Play Store

This project ships a Capacitor Android wrapper so you can build a signed
Android App Bundle (`.aab`) from the same TanStack Start codebase.

- App name: **NEETIQ Prime**
- Package id: `app.neetiq.prime`
- Web assets are built to `dist/` (`bun run build`)

Cash / wallet / bonus features have been removed. The app is education-only:
free daily DPPs, AI quizzes, flashcards, and free 1v1 subject battles with
XP-only rewards — no in-app purchases and no real-money contests.

## 1. Prerequisites (do this on your local machine)

- Node 20+ and Bun installed
- Android Studio installed (SDK Platform 34+ and command-line tools)
- Java 17 (bundled with recent Android Studio)
- A Google Play Console account

## 2. One-time Android project generation

Run once after cloning:

```bash
bun install
bun run build            # produces dist/
bunx cap add android     # generates the android/ folder
bunx cap sync android    # copies dist/ into android/app/src/main/assets
```

`android/` is gitignored by default — commit it if you want CI to build.

## 3. Icons & splash

Replace the icons in `android/app/src/main/res/mipmap-*/` using the images
already in `public/icons/`. Android Studio has an "Image Asset" wizard that
takes `public/icons/icon-512.png` and generates every density.

## 4. Update version before each release

- `android/app/build.gradle` → bump `versionCode` (integer) and `versionName`
- `package.json` → optional matching `version`

## 5. Generate a keystore (one time)

```bash
keytool -genkey -v -keystore neetiq-release.keystore \
  -alias neetiq -keyalg RSA -keysize 2048 -validity 10000
```

Store the keystore + passwords somewhere safe. Losing them means you can
never ship another update under this listing.

Reference it from `android/key.properties` (create the file):

```
storeFile=/absolute/path/to/neetiq-release.keystore
storePassword=•••
keyAlias=neetiq
keyPassword=•••
```

And wire it into `android/app/build.gradle` (see Capacitor docs — the block
lives inside `android { signingConfigs { release { … } } }`).

## 6. Build a signed AAB

```bash
bun run build
bunx cap sync android
cd android
./gradlew bundleRelease
```

Output: `android/app/build/outputs/bundle/release/app-release.aab`

## 7. Play Console upload

1. Play Console → Create app → NEETIQ Prime
2. App content: complete Privacy Policy URL (point to
   `https://<your-domain>/privacy`), Data safety, Ads = No,
   Content rating (Everyone / Educational)
3. Store listing: short + full description, screenshots (phone 1080×1920+),
   feature graphic 1024×500
4. Release → Production → Create new release → upload `app-release.aab`
5. Roll out for review

## 8. Common review notes

- Target API level: keep `compileSdkVersion` and `targetSdkVersion` at the
  latest required by Play (34+ as of 2025; 35+ from Aug 2026 for new apps).
- Content rating must match the education audience.
- Real-money gambling / paid contests are NOT present in this build — the
  previous rejection reason is removed.
- If Play flags "app functionality" for a WebView-only app, add at least
  one native capability (e.g. push, share) or provide a demo login.

## 9. Iterating

Every subsequent release:

```bash
bun run build && bunx cap sync android && cd android && ./gradlew bundleRelease
```

Then upload the new `.aab` to a new Play release track.
