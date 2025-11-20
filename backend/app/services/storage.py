# app/services/storage.py
"""
Unified storage layer with local and cloud backends.
Set STORAGE_BACKEND env var to 'local' or 's3' to switch.
"""
import os
from pathlib import Path
from typing import Optional
import json

STORAGE_BACKEND = os.getenv("STORAGE_BACKEND", "local")  # 'local' or 's3'
S3_BUCKET = os.getenv("S3_BUCKET", "eduko-research-data")
AWS_REGION = os.getenv("AWS_REGION", "ap-southeast-1")


class StorageBackend:
    """Abstract storage interface"""
    
    def write_file(self, path: str, content: bytes) -> str:
        """Write file, return public URL or local path"""
        raise NotImplementedError
    
    def write_text(self, path: str, content: str) -> str:
        """Write text file"""
        return self.write_file(path, content.encode('utf-8'))
    
    def write_json(self, path: str, data: dict) -> str:
        """Write JSON file"""
        content = json.dumps(data, ensure_ascii=False, indent=2)
        return self.write_text(path, content)
    
    def append_jsonl(self, path: str, record: dict) -> str:
        """Append JSON line to file"""
        raise NotImplementedError
    
    def read_file(self, path: str) -> bytes:
        """Read file content"""
        raise NotImplementedError
    
    def read_text(self, path: str) -> str:
        """Read text file"""
        return self.read_file(path).decode('utf-8')
    
    def read_json(self, path: str) -> dict:
        """Read JSON file"""
        return json.loads(self.read_text(path))
    
    def exists(self, path: str) -> bool:
        """Check if file exists"""
        raise NotImplementedError
    
    def list_dir(self, path: str) -> list[str]:
        """List files in directory"""
        raise NotImplementedError


class LocalStorage(StorageBackend):
    """Local filesystem storage"""
    
    def __init__(self, base_dir: str = "data"):
        self.base_dir = Path(base_dir)
    
    def _full_path(self, path: str) -> Path:
        return self.base_dir / path
    
    def write_file(self, path: str, content: bytes) -> str:
        full_path = self._full_path(path)
        full_path.parent.mkdir(parents=True, exist_ok=True)
        with open(full_path, 'wb') as f:
            f.write(content)
        return str(full_path)
    
    def append_jsonl(self, path: str, record: dict) -> str:
        full_path = self._full_path(path)
        full_path.parent.mkdir(parents=True, exist_ok=True)
        line = json.dumps(record, ensure_ascii=False) + "\n"
        with open(full_path, 'a', encoding='utf-8') as f:
            f.write(line)
        return str(full_path)
    
    def read_file(self, path: str) -> bytes:
        full_path = self._full_path(path)
        with open(full_path, 'rb') as f:
            return f.read()
    
    def exists(self, path: str) -> bool:
        return self._full_path(path).exists()
    
    def list_dir(self, path: str) -> list[str]:
        full_path = self._full_path(path)
        if not full_path.exists():
            return []
        return [p.name for p in full_path.iterdir()]


class S3Storage(StorageBackend):
    """AWS S3 storage backend"""
    
    def __init__(self, bucket: str, region: str = "ap-southeast-1"):
        self.bucket = bucket
        self.region = region
        self._client = None
    
    @property
    def client(self):
        """Lazy load boto3 client"""
        if self._client is None:
            import boto3
            self._client = boto3.client('s3', region_name=self.region)
        return self._client
    
    def _s3_key(self, path: str) -> str:
        """Convert path to S3 key"""
        return path.replace('\\', '/')
    
    def write_file(self, path: str, content: bytes) -> str:
        key = self._s3_key(path)
        self.client.put_object(
            Bucket=self.bucket,
            Key=key,
            Body=content
        )
        return f"s3://{self.bucket}/{key}"
    
    def append_jsonl(self, path: str, record: dict) -> str:
        """Append to JSONL by reading, appending, writing back"""
        key = self._s3_key(path)
        
        # Read existing content
        try:
            existing = self.read_text(path)
        except:
            existing = ""
        
        # Append new line
        line = json.dumps(record, ensure_ascii=False) + "\n"
        new_content = existing + line
        
        # Write back
        return self.write_text(path, new_content)
    
    def read_file(self, path: str) -> bytes:
        key = self._s3_key(path)
        response = self.client.get_object(Bucket=self.bucket, Key=key)
        return response['Body'].read()
    
    def exists(self, path: str) -> bool:
        key = self._s3_key(path)
        try:
            self.client.head_object(Bucket=self.bucket, Key=key)
            return True
        except:
            return False
    
    def list_dir(self, path: str) -> list[str]:
        """List files with given prefix"""
        prefix = self._s3_key(path).rstrip('/') + '/'
        response = self.client.list_objects_v2(
            Bucket=self.bucket,
            Prefix=prefix,
            Delimiter='/'
        )
        
        files = []
        # Direct files
        if 'Contents' in response:
            for obj in response['Contents']:
                key = obj['Key']
                if key != prefix:  # Skip the prefix itself
                    files.append(key.split('/')[-1])
        
        # Subdirectories
        if 'CommonPrefixes' in response:
            for prefix_obj in response['CommonPrefixes']:
                subdir = prefix_obj['Prefix'].rstrip('/').split('/')[-1]
                files.append(subdir + '/')
        
        return files


# Global storage instance
_storage: Optional[StorageBackend] = None


def get_storage() -> StorageBackend:
    """Get storage backend singleton"""
    global _storage
    if _storage is None:
        if STORAGE_BACKEND == "s3":
            _storage = S3Storage(bucket=S3_BUCKET, region=AWS_REGION)
            print(f"✓ Storage: S3 bucket={S3_BUCKET}")
        else:
            _storage = LocalStorage(base_dir="data")
            print(f"✓ Storage: Local filesystem")
    return _storage


# Convenience exports
storage = get_storage()
write_file = storage.write_file
write_text = storage.write_text
write_json = storage.write_json
append_jsonl = storage.append_jsonl
read_file = storage.read_file
read_text = storage.read_text
read_json = storage.read_json
exists = storage.exists
list_dir = storage.list_dir
