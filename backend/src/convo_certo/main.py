from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from convo_certo.routers import expression, score

app = FastAPI(
    title="ConvoCerto Backend",
    description="partitura-powered score analysis and expression modelling",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(score.router, prefix="/score", tags=["score"])
app.include_router(expression.router, prefix="/expression", tags=["expression"])


@app.get("/health")
async def health():
    return {"status": "ok"}
