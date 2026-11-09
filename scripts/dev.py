"""Run the local demo stack; stop both child processes on Ctrl+C."""
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import time
import httpx

ROOT = Path(__file__).resolve().parent.parent
api_port = int(os.getenv('SIDEWORK_API_PORT', '8001'))
web_port = int(os.getenv('SIDEWORK_WEB_PORT', '3100'))
api_url = f'http://127.0.0.1:{api_port}'
env = os.environ | {'SIDEWORK_BACKEND_URL': api_url}
children = []

def cleanup():
    for child in reversed(children):
        if child.poll() is None:
            child.terminate()
    for child in reversed(children):
        try:
            child.wait(timeout=5)
        except subprocess.TimeoutExpired:
            child.kill()

def stop(*_):
    cleanup()
    raise SystemExit(0)

signal.signal(signal.SIGINT, stop)
signal.signal(signal.SIGTERM, stop)
try:
    for port in (api_port, web_port):
        with socket.socket() as probe:
            try:
                probe.bind(('127.0.0.1', port))
            except OSError as exc:
                raise RuntimeError(f'Port {port} is in use. Choose different SIDEWORK_API_PORT / SIDEWORK_WEB_PORT values.') from exc
    children.append(subprocess.Popen([sys.executable, '-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', str(api_port)], cwd=ROOT / 'backend', env=env))
    headers = {'X-API-Key': env['SIDEWORK_API_KEY']} if env.get('SIDEWORK_API_KEY') else {}
    for _ in range(100):
        if children[0].poll() is not None:
            raise RuntimeError('Backend failed to start. Check the port and log above.')
        try:
            if httpx.get(api_url + '/health', headers=headers).is_success:
                break
        except httpx.HTTPError:
            pass
        time.sleep(.1)
    else:
        raise RuntimeError('Backend readiness timed out')
    if env.get('SIDEWORK_SEED_DEMO', '1') == '1':
        subprocess.run([sys.executable, 'demo.py', '--url', api_url], cwd=ROOT / 'backend', env=env, check=True)
    children.append(subprocess.Popen(['bun', 'run', 'dev', '--host', '127.0.0.1', '--port', str(web_port), '--strictPort'], cwd=ROOT, env=env))
    print(f'\nSide Work website: http://127.0.0.1:{web_port}\nAPI: {api_url}/docs\nCtrl+C stops both servers.\n', flush=True)
    while all(c.poll() is None for c in children):
        time.sleep(.2)
finally:
    cleanup()
