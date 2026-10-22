const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repositoryRoot = path.resolve(__dirname, '..', '..');
const mobileApps = [
  { directory: 'appcopyai', signingPrefix: 'SKILLOMATE_RELEASE' },
  { directory: 'razorpay-app', signingPrefix: 'SKILLOMATE_DIRECT_RELEASE' },
];

function read(relativePath) {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');
}

for (const { directory: app, signingPrefix } of mobileApps) {
  test(`${app} disables backups, cleartext traffic, overlays, and unverified deep links`, () => {
    const mainManifest = read(`${app}/android/app/src/main/AndroidManifest.xml`);
    const debugManifest = read(`${app}/android/app/src/debug/AndroidManifest.xml`);
    const appConfig = JSON.parse(read(`${app}/app.json`));
    const backupRules = read(`${app}/android/app/src/main/res/xml/backup_rules.xml`);
    const extractionRules = read(`${app}/android/app/src/main/res/xml/data_extraction_rules.xml`);
    const applicationManifest = mainManifest.match(/<application[\s\S]*<\/application>/)?.[0] || '';
    const iosInfoPlist = read(`${app}/ios/ProtectedVideo/Info.plist`);

    assert.match(mainManifest, /android:allowBackup="false"/);
    assert.match(mainManifest, /android:fullBackupContent="@xml\/backup_rules"/);
    assert.match(mainManifest, /android:dataExtractionRules="@xml\/data_extraction_rules"/);
    assert.match(mainManifest, /android:usesCleartextTraffic="false"/);
    assert.doesNotMatch(applicationManifest, /android\.intent\.action\.VIEW/);
    assert.equal(Object.hasOwn(appConfig.expo, 'scheme'), false);
    assert.notEqual(appConfig.expo.ios?.infoPlist?.NSAppTransportSecurity?.NSAllowsLocalNetworking, true);

    assert.match(debugManifest, /SYSTEM_ALERT_WINDOW" tools:node="remove"/);
    assert.doesNotMatch(debugManifest, /usesCleartextTraffic="true"/);
    assert.match(backupRules, /<exclude domain="sharedpref" path="\."\/>/);
    assert.match(extractionRules, /<cloud-backup>[\s\S]*<exclude domain="sharedpref" path="\."\/>/);
    assert.match(extractionRules, /<device-transfer>[\s\S]*<exclude domain="sharedpref" path="\."\/>/);
    assert.doesNotMatch(iosInfoPlist, /CFBundleURLTypes|CFBundleURLSchemes/);
    assert.doesNotMatch(iosInfoPlist, /NSAllowsLocalNetworking[\s\S]{0,40}<true\/>/);
  });

  test(`${app} isolates debug builds and requires private release signing`, () => {
    const gradle = read(`${app}/android/app/build.gradle`);
    const ignore = read(`${app}/.gitignore`);

    assert.match(gradle, /applicationIdSuffix '\.debug'/);
    assert.match(gradle, new RegExp(`${signingPrefix}_STORE_FILE`));
    assert.match(gradle, /Release signing is not configured/);
    assert.doesNotMatch(gradle, /storePassword\s+['"]android['"]/);
    assert.doesNotMatch(gradle, /keyAlias\s+['"]androiddebugkey['"]/);
    assert.match(ignore, /\*\.keystore/);
    assert.match(ignore, /android\/keystore\.properties/);
    assert.equal(fs.existsSync(path.join(repositoryRoot, app, 'android/app/debug.keystore')), false);
  });
}
