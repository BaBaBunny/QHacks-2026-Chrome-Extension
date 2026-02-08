import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))

from fastapi import FastAPI
from .routers import tts, stt

app = FastAPI(title="ClearScan Worker", version="0.1.0")

app.include_router(tts.router, prefix="/tts", tags=["tts"])
app.include_router(stt.router, prefix="/stt", tags=["stt"])


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=3002)
