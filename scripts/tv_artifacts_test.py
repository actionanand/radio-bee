"""Exercise native artifact checks with controlled ELF headers, without signing secrets."""
import importlib.util
import io
import pathlib
import struct
import unittest
import zipfile

spec = importlib.util.spec_from_file_location('tv_artifacts', pathlib.Path(__file__).with_name('validate-tv-artifacts.py'))
artifacts = importlib.util.module_from_spec(spec)
spec.loader.exec_module(artifacts)

def elf(alignment=16384, bits=64):
    data = bytearray(120)
    data[:6] = b'\x7fELF' + bytes([2 if bits == 64 else 1, 1])
    if bits == 64:
        struct.pack_into('<Q', data, 32, 64)
        struct.pack_into('<HH', data, 54, 56, 1)
        struct.pack_into('<I', data, 64, 1)
        struct.pack_into('<Q', data, 112, alignment)
    return bytes(data)

def archive(files):
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, 'w') as output:
        for name, value in files.items():
            output.writestr(name, value)
    stream.seek(0)
    return stream

class NativeArtifactsTest(unittest.TestCase):
    def test_aligned_library_and_corresponding_64_bit_build(self):
        names = artifacts.check_native(archive({'lib/armeabi-v7a/player.so': elf(bits=32), 'lib/arm64-v8a/player.so': elf()}))
        self.assertEqual(2, len(names))

    def test_4k_library_is_rejected(self):
        with self.assertRaisesRegex(AssertionError, '16 KB'):
            artifacts.check_native(archive({'lib/arm64-v8a/player.so': elf(4096)}))

    def test_different_64_bit_library_does_not_satisfy_counterpart(self):
        with self.assertRaisesRegex(AssertionError, 'counterpart'):
            artifacts.check_native(archive({'lib/x86/player.so': elf(bits=32), 'lib/x86_64/other.so': elf()}))

    def test_invalid_shared_library_is_rejected(self):
        with self.assertRaisesRegex(AssertionError, 'Invalid native'):
            artifacts.check_native(archive({'lib/arm64-v8a/player.so': b'not an ELF library'}))

    def test_no_native_libraries_is_valid(self):
        self.assertEqual([], artifacts.check_native(archive({'classes.dex': b'test'})))

if __name__ == '__main__':
    unittest.main()