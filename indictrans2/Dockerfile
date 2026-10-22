# CPU image for the IndicTrans2 server. Models (~1 GB for dist-200M) download on first start;
# mount a volume at /root/.cache/huggingface to keep them.
FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends build-essential && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY server.py .
EXPOSE 7860
CMD ["python", "server.py"]
