const fs = require('node:fs');
// Same Play identity: codes >= 1,000,000,000 are reserved exclusively for native TV.
const MOBILE_VERSION_MAX = 999999999;

function validateVersion(version) {
  if (
    !version ||
    !Number.isSafeInteger(version.versionCode) ||
    version.versionCode < 1 ||
    version.versionCode > MOBILE_VERSION_MAX
  )
    throw new Error('Mobile versionCode must be an integer from 1 to 999999999; higher codes are reserved for TV.');
  if (
    typeof version.versionName !== 'string' ||
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version.versionName) ||
    version.versionName.split('.').some(part => !Number.isSafeInteger(Number(part)))
  )
    throw new Error('versionName must use safe major.minor.patch integers without leading zeros.');
  return version;
}
function readVersion(root = process.cwd()) {
  return validateVersion(JSON.parse(fs.readFileSync(require('node:path').join(root, 'android-version.json'), 'utf8')));
}
function releaseName(version) {
  validateVersion(version);
  return `RadioBee-${version.versionName.replaceAll('.', '-')}-${version.versionCode}`;
}
module.exports = { validateVersion, readVersion, releaseName, MOBILE_VERSION_MAX };
