import os
import ssl
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))


def _configure_tls_ca_bundle() -> None:
    """Set CA bundle paths before importing services that may open HTTPS clients."""
    if os.environ.get("GRADIUM_INSECURE_SSL", "").lower() in {"1", "true", "yes"}:
        ssl._create_default_https_context = ssl._create_unverified_context
        return

    if os.environ.get("SSL_CERT_FILE"):
        return

    ca_file = None
    try:
        import certifi

        ca_file = certifi.where()
    except Exception:
        for candidate in (
            "/etc/ssl/cert.pem",
            "/private/etc/ssl/cert.pem",
            "/opt/homebrew/etc/openssl@3/cert.pem",
            "/usr/local/etc/openssl@3/cert.pem",
        ):
            if os.path.exists(candidate):
                ca_file = candidate
                break

    if not ca_file:
        return

    os.environ["SSL_CERT_FILE"] = ca_file
    os.environ.setdefault("REQUESTS_CA_BUNDLE", ca_file)

    original_create_default_context = ssl.create_default_context

    def create_default_context_with_ca(*args, **kwargs):
        if not args and "cafile" not in kwargs:
            kwargs["cafile"] = ca_file
        return original_create_default_context(*args, **kwargs)

    ssl.create_default_context = create_default_context_with_ca


_configure_tls_ca_bundle()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routers import tts, stt, pdf_clean

app = FastAPI(title="ClearScan Worker", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(tts.router, prefix="/tts", tags=["tts"])
app.include_router(stt.router, prefix="/stt", tags=["stt"])
app.include_router(pdf_clean.router, prefix="/pdf", tags=["pdf"])


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "ssl_cert_file": os.environ.get("SSL_CERT_FILE"),
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=3002)
