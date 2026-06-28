import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
WORKER = ROOT / 'worker.py'
PYTHON = os.environ.get('PYTHON_EXE', 'py')


def main() -> None:
    cmd = [PYTHON, '-3', str(WORKER)]
    while True:
        print(f'Starting worker: {cmd}')
        proc = subprocess.Popen(cmd, cwd=str(ROOT), stdout=sys.stdout, stderr=sys.stderr)
        exit_code = proc.wait()
        print(f'Worker exited with code {exit_code}. Restarting in 5 seconds...')
        if exit_code == 0:
            break
        import time
        time.sleep(5)


if __name__ == '__main__':
    main()
