import argparse
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
WORKER = ROOT / 'executor.py'


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Wrapper for the Free Cloud Arbitrage worker')
    parser.add_argument('--once', action='store_true', help='Run one worker cycle and exit')
    parser.add_argument('--dry-run', action='store_true', help='simulate orders (safe default)')
    parser.add_argument('--live', action='store_true', help='explicitly allow live orders when remote config permits')
    return parser.parse_args()


def resolve_python_executable() -> str:
    env_python = os.environ.get('PYTHON_EXE')
    if env_python:
        return env_python

    if getattr(sys, 'executable', None):
        return sys.executable

    if os.name == 'nt':
        return 'py'
    return 'python3'


def build_worker_command(extra_args: list[str] | None = None) -> list[str]:
    command = [resolve_python_executable(), '-u', str(WORKER)]
    if extra_args:
        command.extend(extra_args)
    return command


def main() -> None:
    args = parse_args()
    extra_args = []
    if args.once:
        extra_args.append('--once')
    if args.dry_run:
        extra_args.append('--dry-run')
    if args.live:
        extra_args.append('--live')
    cmd = build_worker_command(extra_args)
    while True:
        print(f'Starting worker: {cmd}')
        env = os.environ.copy()
        env.setdefault('PYTHONUNBUFFERED', '1')
        proc = subprocess.Popen(cmd, cwd=str(ROOT), stdout=sys.stdout, stderr=sys.stderr, env=env)
        exit_code = proc.wait()
        if args.once:
            raise SystemExit(exit_code)
        print(f'Worker exited with code {exit_code}. Restarting in 5 seconds...')
        if exit_code == 0:
            break
        time.sleep(5)


if __name__ == '__main__':
    main()
