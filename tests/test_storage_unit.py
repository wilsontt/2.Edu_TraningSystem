"""
SMB 儲存抽象層單元測試（mock 版，無需 smbprotocol／真實 NAS）。

執行：於專案根目錄
  PYTHONPATH=backend backend/.venv/bin/python3 tests/test_storage_unit.py
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from app.services import storage  # noqa: E402


class _Stat:
    def __init__(self, size, mtime):
        self.st_size = size
        self.st_mtime = mtime


class _Entry:
    def __init__(self, name, data):
        self.name = name
        self._data = data

    def is_file(self):
        return True

    def stat(self):
        return _Stat(len(self._data), 0.0)


class _Handle:
    def __init__(self, store, path, mode):
        self.store, self.path, self.mode = store, path, mode
        self._buf = b""

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        if "w" in self.mode:
            self.store[self.path] = self._buf
        return False

    def write(self, data):
        self._buf += bytes(data)

    def read(self):
        return self.store.get(self.path, b"")


class FakeSmb:
    """模擬 smbclient 模組（僅實作儲存層用到的函式）。"""

    def __init__(self):
        self.store = {}

    def register_session(self, *a, **k):
        pass

    def delete_session(self, *a, **k):
        pass

    def makedirs(self, path, exist_ok=False):
        pass

    def open_file(self, path, mode="rb"):
        if "r" in mode and path not in self.store:
            raise FileNotFoundError(path)
        return _Handle(self.store, path, mode)

    def remove(self, path):
        if path not in self.store:
            raise FileNotFoundError(path)
        del self.store[path]

    def scandir(self, path):
        for key, data in self.store.items():
            parent, _, name = key.rpartition("\\")
            if parent == path:
                yield _Entry(name, data)


def main():
    creds = storage.SmbCredentials("SVR", "Share", "u", "p", "materials")
    st = storage.SmbStorage(creds)
    st._client = FakeSmb()  # 注入 fake，繞過真實連線

    # save / open
    n = st.save("2026/8/exams/a.txt", b"hello")
    assert n == 5, n
    assert st.open("2026/8/exams/a.txt") == b"hello"

    # list（僅列直接子檔）
    st.save("2026/8/exams/b.txt", b"world!")
    listing = st.list("2026/8/exams")
    names = sorted(it["filename"] for it in listing)
    assert names == ["a.txt", "b.txt"], names
    assert {it["filename"]: it["size"] for it in listing}["b.txt"] == 6

    # 不存在的目錄 → 空清單
    assert st.list("2099/1/exams") == []

    # delete
    st.delete("2026/8/exams/a.txt")
    assert sorted(it["filename"] for it in st.list("2026/8/exams")) == ["b.txt"]

    # 讀取不存在 → StorageError
    try:
        st.open("x/y.txt")
        raise AssertionError("expected StorageError")
    except storage.StorageError:
        pass

    # 設定不完整 → StorageUnavailable
    try:
        storage.SmbStorage(storage.SmbCredentials("", "", "", ""))
        raise AssertionError("expected StorageUnavailable")
    except storage.StorageUnavailable:
        pass

    print("storage unit tests passed")


if __name__ == "__main__":
    main()
