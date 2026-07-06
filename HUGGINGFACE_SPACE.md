# Hugging Face Space Deployment

MILLE ModelBlueprint is prepared as a Hugging Face Docker Space.

## Space Settings

Current Space:

- Repo: `WELLyes1/Millie`
- URL: https://huggingface.co/spaces/WELLyes1/Millie
- Direct app: https://wellyes1-millie.hf.space/
- SDK: Docker

The repository already includes:

- `README.md` Space YAML with `sdk: docker` and `app_port: 7860`
- `Dockerfile`
- `static-server.mjs` configured for `HOST` and `PORT`
- `.dockerignore` excluding generated artifacts

## Upload Command

After `HF_TOKEN` has write permission:

```powershell
& "C:\Users\ahmed\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" -c "import os, sys; sys.path.insert(0, r'tmp\hf_deps'); from huggingface_hub import HfApi; token=os.environ.get('HF_TOKEN') or os.environ.get('HUGGINGFACE_HUB_TOKEN'); api=HfApi(token=token); repo_id='WELLyes1/Millie'; info=api.upload_folder(repo_id=repo_id, repo_type='space', folder_path='.', path_in_repo='.', commit_message='Upload MILLE ModelBlueprint Docker Space', ignore_patterns=['.git/*','.agents/*','.codex/*','tmp/*','output/*','embeddings/*','node_modules/*','*.zip','*.pyc','__pycache__/*']); print(info)"
```

The current web upload used a three-file Docker package:

- `tmp/hf_web_upload/README.md`
- `tmp/hf_web_upload/Dockerfile`
- `tmp/hf_web_upload/app_bundle.tar.gz`

## Local Verification

```powershell
& "C:\Users\ahmed\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test tests\*.test.mjs
```

Expected: all tests pass.
