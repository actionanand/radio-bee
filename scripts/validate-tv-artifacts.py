"""Read-only APK/AAB validation. Never extracts archives or accesses signing secrets."""
import argparse, json, os, pathlib, re, struct, subprocess, zipfile

def check_native(archive):
    libraries = []
    with zipfile.ZipFile(archive) as z:
        for name in z.namelist():
            if not name.endswith('.so'):
                continue
            data = z.read(name)
            assert data[:4] == b'\x7fELF', f'Invalid native library: {name}'
            if data[4] == 2:
                assert data[5] == 1, 'Unsupported ELF byte order'
                offset = struct.unpack_from('<Q', data, 32)[0]
                size, count = struct.unpack_from('<HH', data, 54)
                for index in range(count):
                    start = offset + index * size
                    if struct.unpack_from('<I', data, start)[0] == 1:
                        assert struct.unpack_from('<Q', data, start + 48)[0] >= 16384, f'Not 16 KB compatible: {name}'
            libraries.append(name)
    for abi, required in [('armeabi-v7a', 'arm64-v8a'), ('x86', 'x86_64')]:
        if any('/' + abi + '/' in name for name in libraries):
            for name in libraries:
                if '/' + abi + '/' in name:
                    assert name.replace('/' + abi + '/', '/' + required + '/') in libraries, f'Missing {required} native counterpart: {name}'
    return libraries

def validate(apk, aab=None, unsigned=False, debug=False, version_file='tv-version.json'):
    version = json.loads(pathlib.Path(version_file).read_text())
    sdk = pathlib.Path(os.environ.get('ANDROID_HOME') or os.environ['ANDROID_SDK_ROOT'])
    tools = sdk / 'build-tools' / '36.0.0'
    def run(*args):
        return subprocess.check_output([str(a) for a in args], stderr=subprocess.STDOUT, text=True)
    badging = run(tools / 'aapt', 'dump', 'badging', apk)
    assert "package: name='com.actionanand.radiobee.app'" in badging, 'Wrong Play application ID'
    assert f"versionCode='{version['versionCode']}'" in badging and f"versionName='{version['versionName']}'" in badging, 'Stale version'
    assert "uses-feature: name='android.software.leanback'" in badging, 'TV-only filtering missing'
    assert "uses-feature-not-required: name='android.hardware.touchscreen'" in badging, 'Touchscreen must be optional'
    assert 'leanback-launchable-activity:' in badging, 'Missing TV launcher'
    assert 'launchable-activity:' not in badging.replace('leanback-launchable-activity:', ''), 'Must not expose a phone launcher'
    assert "targetSdkVersion:'36'" in badging, 'Unexpected target SDK'
    assert debug or 'application-debuggable' not in badging, 'Debug build cannot be a release'
    if not unsigned:
        run(tools / 'apksigner', 'verify', '--verbose', apk)
        run(tools / 'zipalign', '-c', '-P', '16', '4', apk)
    result = {'applicationId': 'com.actionanand.radiobee.app', 'version': version,
              'apk': str(apk), 'signed': not unsigned, 'debug': debug, 'nativeLibraries': check_native(apk)}
    if aab:
        with zipfile.ZipFile(aab) as z:
            assert 'base/manifest/AndroidManifest.xml' in z.namelist(), 'Not an app bundle'
            assert any(n.startswith('base/dex/') for n in z.namelist()), 'Missing bundle code'
        result['bundleNativeLibraries'] = check_native(aab)
        if not unsigned:
            assert 'jar verified.' in run('jarsigner', '-J-Duser.language=en', '-verify', '-verbose', '-certs', aab), 'Invalid AAB signature'
        result['aab'] = str(aab)
    return result

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--apk', required=True)
    parser.add_argument('--aab')
    parser.add_argument('--unsigned', action='store_true')
    parser.add_argument('--debug', action='store_true')
    parser.add_argument('--version-file', default='tv-version.json')
    args = parser.parse_args()
    print(json.dumps(validate(args.apk, args.aab, args.unsigned, args.debug, args.version_file), indent=2))