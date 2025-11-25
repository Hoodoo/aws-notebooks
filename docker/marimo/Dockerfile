# syntax=docker/dockerfile:1.12
FROM ghcr.io/marimo-team/marimo:latest

WORKDIR /app
RUN mkdir -p /app/scratch && chown -R appuser:appuser /app/scratch
COPY --chown=appuser:appuser curated /app/curated

ENV PORT=8080
EXPOSE $PORT

ENV HOST=0.0.0.0

RUN uv pip install --no-cache-dir marimo[recommended,lsp,sql]
CMD marimo edit --no-token -p $PORT --host $HOST
