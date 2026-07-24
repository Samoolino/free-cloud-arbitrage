import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SERVICE_WRAPPER = ROOT / "service_wrapper.py"


def resolve_python_executable() -> str:
    env_python = os.environ.get("PYTHON_EXE")
    if env_python:
        return env_python
    if getattr(sys, "executable", None):
        return sys.executable
    return "python3"


def build_command(extra_args: list[str] | None = None) -> list[str]:
    command = [resolve_python_executable(), str(SERVICE_WRAPPER)]
    if extra_args:
        command.extend(extra_args)
    return command


def main() -> None:
    command = build_command(sys.argv[1:])
    env = os.environ.copy()
    env.setdefault("PYTHONUNBUFFERED", "1")
    subprocess.run(command, cwd=str(ROOT), env=env, check=False)


if __name__ == "__main__":
    main()
