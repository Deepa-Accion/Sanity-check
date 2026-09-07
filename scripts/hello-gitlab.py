"""
Simple script that:
  1. Prints Hello
  2. Creates a private GitLab repo under xxxx-group2321031
     and pushes a few sample Python files into it.

Usage:
    set GITLAB_PAT=glpat-xxxxxxxxxxxxxxxxxxxx
    python hello-gitlab.py
"""

import os
import sys
import json
import base64
import urllib.request
import urllib.error

# ── Config ────────────────────────────────────────────────────────────────────
PAT       = os.environ.get("GITLAB_PAT", "")
NAMESPACE = "xxxx-group2321031"          # your GitLab group
REPO_NAME = "breeze-866-test"
API_BASE  = "https://gitlab.com/api/v4"

if not PAT:
    print("ERROR: Set GITLAB_PAT env var first.")
    sys.exit(1)

HEADERS = {"PRIVATE-TOKEN": PAT, "Content-Type": "application/json"}

# ── Step 1: Hello ─────────────────────────────────────────────────────────────
print("Hello!")

# ── Helpers ───────────────────────────────────────────────────────────────────
def call(method, path, body=None):
    url  = API_BASE + path
    data = json.dumps(body).encode() if body else None
    req  = urllib.request.Request(url, data=data, headers=HEADERS, method=method)
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        print(f"API error {e.code}: {e.read().decode()}")
        sys.exit(1)

def b64(text):
    return base64.b64encode(text.encode()).decode()

# ── Step 2: Create the repo ───────────────────────────────────────────────────
print(f"\nCreating repo '{REPO_NAME}' under '{NAMESPACE}'...")
project = call("POST", "/projects", {
    "name":                  REPO_NAME,
    "namespace":             NAMESPACE,
    "visibility":            "private",
    "initialize_with_readme": False,
    "description":           "BREEZEAI-866 private repo test",
})
pid       = project["id"]
clone_url = project["http_url_to_repo"]
print(f"Created: {clone_url}")

# ── Step 3: Push sample files in one commit ───────────────────────────────────
files = {
    "README.md": "# breeze-866-test\nPrivate GitLab repo for BREEZEAI-866 testing.\n",

    "hello.py": """\
def hello(name="World"):
    print(f"Hello, {name}!")

if __name__ == "__main__":
    hello()
""",

    "config.py": """\
import os

API_URL  = os.environ.get("API_URL",  "http://localhost:8080")
API_KEY  = os.environ.get("API_KEY",  "")
TIMEOUT  = int(os.environ.get("TIMEOUT", "30"))
RETRIES  = int(os.environ.get("RETRIES", "3"))
""",

    "utils.py": """\
import datetime

def timestamp():
    return datetime.datetime.utcnow().isoformat() + "Z"

def is_set(value):
    return bool(value and str(value).strip())

def safe_get(d, key, default=None):
    return d.get(key, default) if isinstance(d, dict) else default
""",
}

actions = [{"action": "create", "file_path": k, "content": b64(v), "encoding": "base64"}
           for k, v in files.items()]

call("POST", f"/projects/{pid}/repository/commits", {
    "branch":         "main",
    "commit_message": "Initial commit — sample Python files",
    "actions":        actions,
})

print(f"\nPushed {len(files)} files:")
for f in files:
    print(f"  + {f}")

print(f"""
Done!
  Clone URL : {clone_url}
  Project ID: {pid}

Set these before running BREEZEAI-866 tests:
  $env:GITLAB_PAT              = "your-pat"
  $env:GITLAB_PRIVATE_REPO_URL = "{clone_url}"
""")
