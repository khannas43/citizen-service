FROM python:3.11-slim-bookworm

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download embedding model at build time (bakes into image)
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2')"

# Pre-download the speech models (English `base`, Gujarati `medium`) so a restart never re-downloads ~1.7 GB.
# Keep this in step with WHISPER_MODEL / WHISPER_MODEL_GU in app/config.py and k8s.yaml.
RUN python -c "from faster_whisper import download_model; [download_model(m) for m in ('base', 'medium')]"

COPY app/ ./app/
COPY models/ ./models/
COPY models_trained/ ./models_trained/
COPY data/ ./data/
COPY scripts/ ./scripts/

ENV PYTHONPATH=/app
ENV PORT=8089

EXPOSE 8089

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8089"]
