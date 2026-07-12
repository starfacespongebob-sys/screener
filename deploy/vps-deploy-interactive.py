#!/usr/bin/env python3
"""Upload and fresh-install remote-support on VPS with password prompt."""
import getpass
import os
import subprocess
import sys

import pexpect

HOST = os.environ.get("DEPLOY_HOST", "147.93.85.173")
USER = os.environ.get("DEPLOY_USER", "root")
REMOTE = f"{USER}@{HOST}"
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ARCHIVE = os.path.join(SCRIPT_DIR, "remote-support-full.tar.gz")
INSTALL_SH = os.path.join(SCRIPT_DIR, "vps-fresh-install.sh")
SSH_OPTS = "-o StrictHostKeyChecking=accept-new"


def run_local(cmd, **kwargs):
    print(f"\n==> {' '.join(cmd)}")
    subprocess.run(cmd, check=True, **kwargs)


def scp_upload(password: str) -> None:
    cmd = (
        f"scp {SSH_OPTS} {ARCHIVE} {INSTALL_SH} {REMOTE}:/tmp/"
    )
    child = pexpect.spawn(cmd, timeout=120, encoding="utf-8")
    child.logfile = sys.stdout

    idx = child.expect(
        [
            r"[Pp]assword:",
            r"Are you sure you want to continue connecting",
            pexpect.EOF,
        ],
        timeout=60,
    )
    if idx == 1:
        child.sendline("yes")
        child.expect(r"[Pp]assword:", timeout=60)
        child.sendline(password)
    elif idx == 0:
        child.sendline(password)
    else:
        if child.exitstatus not in (0, None):
            raise RuntimeError(f"scp failed (exit {child.exitstatus})")
        child.expect(pexpect.EOF, timeout=120)
        if child.exitstatus != 0:
            raise RuntimeError(f"scp failed (exit {child.exitstatus})")
        return

    child.expect(pexpect.EOF, timeout=300)
    code = child.exitstatus if child.exitstatus is not None else child.signalstatus
    if code not in (0, None):
        raise RuntimeError(f"scp failed (exit {code})")


def ssh_install(password: str) -> None:
    cmd = (
        f"ssh {SSH_OPTS} {REMOTE} "
        "'chmod +x /tmp/vps-fresh-install.sh && bash /tmp/vps-fresh-install.sh'"
    )
    child = pexpect.spawn(cmd, timeout=600, encoding="utf-8")
    child.logfile = sys.stdout

    idx = child.expect(
        [r"[Pp]assword:", r"Are you sure you want to continue connecting", pexpect.EOF],
        timeout=60,
    )
    if idx == 1:
        child.sendline("yes")
        child.expect(r"[Pp]assword:", timeout=60)
        child.sendline(password)
    elif idx == 0:
        child.sendline(password)
    else:
        if child.exitstatus not in (0, None):
            raise RuntimeError(f"ssh install failed (exit {child.exitstatus})")

    child.expect(pexpect.EOF, timeout=600)
    code = child.exitstatus if child.exitstatus is not None else child.signalstatus
    if code not in (0, None):
        raise RuntimeError(f"ssh install failed (exit {code})")


def main() -> int:
    if not os.path.isfile(ARCHIVE):
        print(f"Archive missing: {ARCHIVE}", file=sys.stderr)
        print("Run full-deploy.sh locally first or build the archive.", file=sys.stderr)
        return 1
    if not os.path.isfile(INSTALL_SH):
        print(f"Install script missing: {INSTALL_SH}", file=sys.stderr)
        return 1

    run_local(["bash", os.path.join(SCRIPT_DIR, "verify-public.sh")])

    password = os.environ.get("DEPLOY_PASSWORD")
    if not password:
        print(f"\nVPS target: {REMOTE}")
        password = getpass.getpass("Enter VPS root password (input hidden): ")
    if not password:
        print("No password provided.", file=sys.stderr)
        return 1

    print(f"\n==> Uploading to {REMOTE}...")
    scp_upload(password)

    print(f"\n==> Running fresh install on VPS (wipe + deploy)...")
    ssh_install(password)

    print("\n==> Deployment complete.")
    print("    https://remotesharing.space/viewer.html")
    print("    https://remotesharing.space/api/version")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (pexpect.TIMEOUT, RuntimeError) as exc:
        print(f"\nDEPLOY FAILED: {exc}", file=sys.stderr)
        raise SystemExit(1)