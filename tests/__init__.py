"""Test package bootstrap.

The engine resolves its data directory at import time, so the tests sandbox
``$OPENFLOW_HOME`` into a throwaway directory *before* importing anything from
``engine``. ``python -m unittest discover`` imports this package first, which
guarantees the ordering.
"""

import os
import shutil
import tempfile

TEST_HOME = tempfile.mkdtemp(prefix="openflow-tests-")
os.environ.setdefault("OPENFLOW_HOME", TEST_HOME)
os.environ["OPENFLOW_HOST"] = "127.0.0.1"
os.environ["OPENFLOW_PORT"] = "0"


def tearDownModule():  # noqa: N802 - unittest hook
    shutil.rmtree(TEST_HOME, ignore_errors=True)
