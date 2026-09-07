"""
Create a small private GitLab repository with sample Python source files.

Usage:
    python create-gitlab-private-repo.py

Required env vars:
    GITLAB_PAT        Personal Access Token with api + write_repository scopes
    GITLAB_NAMESPACE  Your GitLab username or group (e.g. "myusername")

Optional env vars:
    GITLAB_HOST       GitLab host (default: gitlab.com)
    REPO_NAME         Repo name to create (default: breeze-test-agent)

The script prints the clone URL and project ID when done — paste those
into the BREEZEAI-866 test env vars.
"""

import os
import sys
import json
import base64
import urllib.request
import urllib.error

# ---------------------------------------------------------------------------
# Config from env
# ---------------------------------------------------------------------------
PAT       = os.environ.get("GITLAB_PAT", "")
NAMESPACE = os.environ.get("GITLAB_NAMESPACE", "")
HOST      = os.environ.get("GITLAB_HOST", "gitlab.com")
REPO_NAME = os.environ.get("REPO_NAME", "breeze-test-agent")

if not PAT or not NAMESPACE:
    print("ERROR: Set GITLAB_PAT and GITLAB_NAMESPACE env vars before running.")
    sys.exit(1)

API = f"https://{HOST}/api/v4"
HEADERS = {
    "PRIVATE-TOKEN": PAT,
    "Content-Type": "application/json",
}


# ---------------------------------------------------------------------------
# GitLab API helpers
# ---------------------------------------------------------------------------
def api(method, path, body=None):
    url = f"{API}{path}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, headers=HEADERS, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code} {method} {path}: {e.read().decode()}")
        sys.exit(1)


def create_file(project_id, file_path, content, commit_msg, branch="main"):
    encoded = base64.b64encode(content.encode()).decode()
    api("POST", f"/projects/{project_id}/repository/files/{urllib.request.quote(file_path, safe='')}", {
        "branch": branch,
        "content": encoded,
        "encoding": "base64",
        "commit_message": commit_msg,
    })
    print(f"  + {file_path}")


# ---------------------------------------------------------------------------
# Sample source files
# ---------------------------------------------------------------------------
FILES = {
    "README.md": """\
# breeze-test-agent

A minimal Python agent used for Breeze AI BREEZEAI-866 private-repo testing.

## Structure
- `config.py`  — environment-driven configuration
- `agent/`     — core agent logic
- `utils/`     — shared helpers
""",

    "requirements.txt": """\
requests>=2.28.0
websocket-client>=1.4.0
""",

    "config.py": """\
import os


class Config:
    @staticmethod
    def api_url():
        return os.environ.get("AGENT_API_URL", "http://localhost:8080")

    @staticmethod
    def api_key():
        return os.environ.get("AGENT_API_KEY", "")

    @staticmethod
    def worker_count():
        return int(os.environ.get("AGENT_WORKERS", "4"))

    @staticmethod
    def heartbeat_interval():
        return int(os.environ.get("AGENT_HEARTBEAT", "30"))

    @staticmethod
    def log_level():
        return os.environ.get("LOG_LEVEL", "INFO")

    @staticmethod
    def retry_limit():
        return int(os.environ.get("AGENT_RETRY_LIMIT", "3"))

    @staticmethod
    def timeout():
        return int(os.environ.get("AGENT_TIMEOUT", "60"))
""",

    "main.py": """\
import logging
import argparse
from config import Config
from agent.core import AgentRunner
from utils.helpers import setup_logging, banner


def parse_args():
    parser = argparse.ArgumentParser(description="Breeze test agent")
    parser.add_argument("--url", default=Config.api_url(), help="API base URL")
    parser.add_argument("--workers", type=int, default=Config.worker_count())
    parser.add_argument("--debug", action="store_true")
    return parser.parse_args()


def main():
    args = parse_args()
    level = "DEBUG" if args.debug else Config.log_level()
    setup_logging(level)
    banner("Breeze Test Agent")

    runner = AgentRunner(api_url=args.url, workers=args.workers)
    runner.start()


if __name__ == "__main__":
    main()
""",

    "agent/__init__.py": "",

    "agent/core.py": """\
import logging
import threading
from config import Config
from agent.handlers import EventHandler, PingHandler
from utils.helpers import retry

log = logging.getLogger(__name__)


class AgentRunner:
    def __init__(self, api_url=None, workers=None):
        self._api_url = api_url or Config.api_url()
        self._workers = workers or Config.worker_count()
        self._handlers = [PingHandler(), EventHandler()]
        self._threads = []
        self._running = False

    def start(self):
        log.info("Starting agent with %d workers at %s", self._workers, self._api_url)
        self._running = True
        for i in range(self._workers):
            t = threading.Thread(target=self._worker_loop, args=(i,), daemon=True)
            t.start()
            self._threads.append(t)
        self._wait()

    def stop(self):
        log.info("Stopping agent")
        self._running = False

    def _worker_loop(self, worker_id):
        log.debug("Worker %d started", worker_id)
        while self._running:
            try:
                self._poll(worker_id)
            except Exception as exc:
                log.warning("Worker %d error: %s", worker_id, exc)

    @retry(limit=Config.retry_limit())
    def _poll(self, worker_id):
        for handler in self._handlers:
            if handler.can_handle():
                handler.execute()

    def _wait(self):
        for t in self._threads:
            t.join()
""",

    "agent/handlers.py": """\
import logging
from config import Config
from utils.helpers import timestamp

log = logging.getLogger(__name__)


class BaseHandler:
    def can_handle(self):
        return False

    def execute(self):
        raise NotImplementedError

    def _log_result(self, result):
        log.debug("[%s] result=%s ts=%s", self.__class__.__name__, result, timestamp())


class PingHandler(BaseHandler):
    def can_handle(self):
        return True

    def execute(self):
        log.info("Ping OK")
        self._log_result("pong")
        return {"type": "pong", "ts": timestamp()}


class EventHandler(BaseHandler):
    def __init__(self):
        self._seen = set()

    def can_handle(self):
        return True

    def execute(self):
        event = self._fetch_next_event()
        if not event:
            return None
        return self._process(event)

    def _fetch_next_event(self):
        return None

    def _process(self, event):
        eid = event.get("id")
        if eid in self._seen:
            log.debug("Duplicate event %s — skipping", eid)
            return None
        self._seen.add(eid)
        log.info("Processing event %s", eid)
        self._log_result(eid)
        return event
""",

    "utils/__init__.py": "",

    "utils/helpers.py": """\
import logging
import functools
import time
import datetime


def setup_logging(level="INFO"):
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
    )


def banner(title):
    line = "=" * (len(title) + 4)
    print(f"\\n{line}\\n  {title}\\n{line}\\n")


def timestamp():
    return datetime.datetime.utcnow().isoformat() + "Z"


def retry(limit=3, delay=1.0, backoff=2.0):
    def decorator(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            wait = delay
            for attempt in range(1, limit + 1):
                try:
                    return fn(*args, **kwargs)
                except Exception as exc:
                    if attempt == limit:
                        raise
                    logging.warning("Attempt %d/%d failed: %s — retrying in %.1fs", attempt, limit, exc, wait)
                    time.sleep(wait)
                    wait *= backoff
        return wrapper
    return decorator


def is_str_set(value):
    return bool(value and str(value).strip())


def safe_get(d, *keys, default=None):
    for key in keys:
        if not isinstance(d, dict):
            return default
        d = d.get(key, default)
    return d


def chunks(lst, size):
    for i in range(0, len(lst), size):
        yield lst[i:i + size]
""",
}

# ---------------------------------------------------------------------------
# Main: create project and push files
# ---------------------------------------------------------------------------
print(f"\nCreating private GitLab project '{REPO_NAME}' under '{NAMESPACE}'...")

project = api("POST", "/projects", {
    "name": REPO_NAME,
    "namespace": NAMESPACE,
    "visibility": "private",
    "initialize_with_readme": False,
    "description": "Private test repo for BREEZEAI-866 GitLab support regression",
})

project_id = project["id"]
clone_url  = project["http_url_to_repo"]
print(f"Created: {clone_url}  (ID: {project_id})")

# Create the default branch with README first
print("\nPushing source files...")
first = True
for file_path, content in FILES.items():
    if first:
        # First commit initialises the default branch
        encoded = base64.b64encode(content.encode()).decode()
        api("POST", f"/projects/{project_id}/repository/commits", {
            "branch": "main",
            "commit_message": "Initial commit",
            "actions": [{
                "action": "create",
                "file_path": file_path,
                "content": encoded,
                "encoding": "base64",
            }],
        })
        print(f"  + {file_path}")
        first = False
    else:
        create_file(project_id, file_path, content, f"Add {file_path}")

print(f"""
Done!

Repo URL : {clone_url}
Project ID: {project_id}

Set these env vars before running the BREEZEAI-866 tests:

  $env:GITLAB_PAT              = "{PAT[:6]}..." (your current PAT)
  $env:GITLAB_PRIVATE_REPO_URL = "{clone_url}"
""")
