import os, shutil, signal, subprocess, time, sys
floor = 600 * 1024 * 1024
if shutil.disk_usage('/private/tmp').free < floor + 300 * 1024 * 1024:
    sys.exit('Not enough free disk space to start safely.')
args = ['xcodebuild', '-workspace', 'appcopyai/ios/ProtectedVideo.xcworkspace', '-scheme', 'ProtectedVideo', '-configuration', 'Debug', '-sdk', 'iphonesimulator', '-destination', 'id=0D95465C-660C-4363-93A1-924CB1CA4697', '-derivedDataPath', '/Users/shekharchouhan/Library/Developer/Xcode/DerivedData/ProtectedVideo-ewymnfzhycplgscxkxtyqgwcozxo', '-jobs', '1', 'CODE_SIGNING_ALLOWED=NO', 'ONLY_ACTIVE_ARCH=YES', 'ARCHS=arm64', 'COMPILER_INDEX_STORE_ENABLE=NO']
with open('/private/tmp/skillomate-guest-simulator-debug-build.log', 'w') as log:
    proc = subprocess.Popen(args, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    try:
        while proc.poll() is None:
            if shutil.disk_usage('/private/tmp').free < floor:
                os.killpg(proc.pid, signal.SIGINT)
                try: proc.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    os.killpg(proc.pid, signal.SIGKILL); proc.wait()
                sys.exit('Build stopped automatically to preserve at least 600 MB of free space.')
            time.sleep(0.2)
    finally:
        if proc.poll() is None:
            os.killpg(proc.pid, signal.SIGTERM)
    sys.exit(proc.returncode)
