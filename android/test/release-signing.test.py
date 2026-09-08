"""Exercise the real signing script in an offline Gradle configuration fixture.

Set GRADLE_BIN to an installed Gradle executable and JAVA_HOME to its supported
JDK. This checks configuration and release gating, not Android compilation or
the validity of a production signing key. All fixture credentials are synthetic.
"""
import os
from pathlib import Path
import subprocess
import tempfile


script = Path(__file__).resolve().parents[1] / 'app' / 'release-signing.gradle'
gradle = os.environ['GRADLE_BIN']
keys = ['ANDROID_KEYSTORE_PATH', 'ANDROID_KEYSTORE_PASSWORD',
        'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD']

with tempfile.TemporaryDirectory(prefix='snake-signing-test-') as temporary:
    temp = Path(temporary)
    android = temp / 'checkout' / 'android'
    app = android / 'app'
    app.mkdir(parents=True)
    (android / 'settings.gradle').write_text("rootProject.name = 'signing-test'\ninclude ':app'\n")
    (app / 'release-signing.gradle').write_text(script.read_text())
    # Model only the Android signing DSL touched by the script, while using
    # real Gradle providers and the real resolved task graph.
    (app / 'build.gradle').write_text('''
class SigningConfig {
    String name
    File storeFile
    String storePassword
    String keyAlias
    String keyPassword
    SigningConfig(String name) { this.name = name }
    void storeFile(File value) { storeFile = value }
    void storePassword(String value) { storePassword = value }
    void keyAlias(String value) { keyAlias = value }
    void keyPassword(String value) { keyPassword = value }
}
def configs = objects.domainObjectContainer(SigningConfig)
ext.android = new Expando(signingConfigs: configs,
    buildTypes: new Expando(release: new Expando(signingConfig: null)))
apply from: 'release-signing.gradle'
tasks.register('assembleDebug') {
    doLast { assert android.buildTypes.release.signingConfig == null }
}
tasks.register('bundleRelease') {
    doLast {
        def config = android.buildTypes.release.signingConfig
        assert config != null
        assert config.storeFile.canonicalFile == new File(System.getenv('ANDROID_KEYSTORE_PATH')).canonicalFile
        assert config.storePassword == System.getenv('ANDROID_KEYSTORE_PASSWORD')
        assert config.keyAlias == System.getenv('ANDROID_KEY_ALIAS')
        assert config.keyPassword == System.getenv('ANDROID_KEY_PASSWORD')
    }
}
''')
    external_key = temp / 'synthetic.keystore'
    external_key.write_text('configuration fixture, not a real key')
    inside_key = app / 'forbidden.keystore'
    inside_key.write_text('must not be accepted')
    symlink_key = temp / 'key-link.keystore'
    symlink_key.symlink_to(inside_key)
    base_env = {k: v for k, v in os.environ.items() if k not in keys}
    base_env['GRADLE_USER_HOME'] = str(temp / 'gradle-home')
    valid = dict(zip(keys, [str(external_key), 'synthetic-store', 'synthetic-alias', 'synthetic-key']))

    cases = [
        ('debug without secrets', ':app:assembleDebug', {}, None),
        ('release without secrets', ':app:bundleRelease', {}, 'Release signing is not configured'),
        ('partial credentials', ':app:bundleRelease', {keys[0]: str(external_key)}, 'Set all four'),
        ('missing file', ':app:bundleRelease', {**valid, keys[0]: str(temp / 'missing')}, 'outside the repository'),
        ('relative file', ':app:bundleRelease', {**valid, keys[0]: 'forbidden.keystore'}, 'outside the repository'),
        ('in-repository file', ':app:bundleRelease', {**valid, keys[0]: str(inside_key)}, 'outside the repository'),
        ('symlink into repository', ':app:bundleRelease', {**valid, keys[0]: str(symlink_key)}, 'outside the repository'),
        ('external signing configuration', ':app:bundleRelease', valid, None),
        ('abbreviated release without secrets', ':app:bR', {}, 'Release signing is not configured'),
    ]
    for label, task, supplied, expected_error in cases:
        result = subprocess.run(
            [gradle, '--offline', '--no-daemon', '--console=plain', '-q', task],
            cwd=android, env={**base_env, **supplied}, text=True,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=90)
        if expected_error is None:
            assert result.returncode == 0, f'{label}: {result.stdout}'
        else:
            assert result.returncode != 0 and expected_error in result.stdout, f'{label}: {result.stdout}'
        print(f'PASS: {label}', flush=True)
