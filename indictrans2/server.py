"""
IndicTrans2 translation server for ClassCaption (AI4Bharat, open source, runs on your own machine).

    pip install -r requirements.txt
    python server.py                      # http://localhost:7860
    # then in ClassCaption's .env.local:  INDICTRANS2_URL=http://localhost:7860

POST /translate  {"texts": ["..."], "src": "en", "tgt": ["hi", "ta"]}
  -> {"translations": {"hi": ["..."], "ta": ["..."]}, "ms": 412}
GET  /health     -> {"ok": true, "device": "cpu", "loaded": ["en-indic"]}

Uses the distilled 200M models by default (fast enough on a laptop CPU). Set INDICTRANS2_SIZE=1B on a GPU.
Indic -> Indic goes through English (two hops), so only two models are ever loaded.
"""
import os
import re
import threading
import time

import torch
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

try:
    from IndicTransToolkit.processor import IndicProcessor
except ImportError:
    try:  # older IndicTransToolkit releases
        from IndicTransToolkit import IndicProcessor
    except ImportError:
        IndicProcessor = None  # not installed (it needs a C++ compiler on Windows): use SimpleProcessor below

# ClassCaption's ISO 639-1 codes -> IndicTrans2 (FLORES) codes.
CODES = {
    "en": "eng_Latn", "hi": "hin_Deva", "mr": "mar_Deva", "bn": "ben_Beng", "ta": "tam_Taml",
    "te": "tel_Telu", "gu": "guj_Gujr", "kn": "kan_Knda", "ml": "mal_Mlym", "pa": "pan_Guru",
    "or": "ory_Orya", "ur": "urd_Arab", "as": "asm_Beng", "ne": "npi_Deva", "sa": "san_Deva",
}

SIZE = os.environ.get("INDICTRANS2_SIZE", "dist-200M")  # or "1B"
MODELS = {
    "en-indic": f"ai4bharat/indictrans2-en-indic-{SIZE}",
    "indic-en": f"ai4bharat/indictrans2-indic-en-{SIZE}",
}
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
BEAMS = int(os.environ.get("INDICTRANS2_BEAMS", "1"))  # 1 = fastest; 4-5 = a little better, slower
API_KEY = os.environ.get("INDICTRANS2_API_KEY", "")

class SimpleProcessor:
    """Minimal stand-in for IndicTransToolkit: the language tags the model expects, plus light cleanup.
    The toolkit also protects URLs/numbers and normalises Indic punctuation, so it is a little better when available."""

    def preprocess_batch(self, sents, src_lang, tgt_lang):
        return [f"{src_lang} {tgt_lang} " + re.sub(r"\s+", " ", s).strip() for s in sents]

    def postprocess_batch(self, sents, lang):
        out = []
        for s in sents:
            s = re.sub(r"\s+", " ", s).strip()
            s = re.sub(r"\s+([,.!?;:।)])", r"\1", s)  # no space before punctuation
            out.append(s)
        return out


processor = IndicProcessor(inference=True) if IndicProcessor else SimpleProcessor()
loaded: dict = {}
lock = threading.Lock()


def model(direction: str):
    with lock:
        if direction not in loaded:
            name = MODELS[direction]
            tok = AutoTokenizer.from_pretrained(name, trust_remote_code=True)
            m = AutoModelForSeq2SeqLM.from_pretrained(
                name, trust_remote_code=True, torch_dtype=torch.float16 if DEVICE == "cuda" else torch.float32
            ).to(DEVICE)
            m.eval()
            loaded[direction] = (tok, m)
        return loaded[direction]


def run(texts: list, src: str, tgt: str) -> list:
    """One hop with one model. src/tgt are FLORES codes; one of them is eng_Latn."""
    tok, m = model("en-indic" if src == "eng_Latn" else "indic-en")
    batch = processor.preprocess_batch(texts, src_lang=src, tgt_lang=tgt)
    inputs = tok(batch, truncation=True, padding="longest", return_tensors="pt", return_attention_mask=True).to(DEVICE)
    with torch.inference_mode():
        out = m.generate(**inputs, use_cache=True, min_length=0, max_length=256, num_beams=BEAMS, num_return_sequences=1)
    decoded = tok.batch_decode(out, skip_special_tokens=True, clean_up_tokenization_spaces=True)
    return processor.postprocess_batch(decoded, lang=tgt)


def translate(texts: list, src: str, tgt: str) -> list:
    if src == tgt:
        return list(texts)
    s, t = CODES[src], CODES[tgt]
    if s != "eng_Latn" and t != "eng_Latn":
        return run(run(texts, s, "eng_Latn"), "eng_Latn", t)
    return run(texts, s, t)


class Req(BaseModel):
    texts: list[str]
    src: str = "en"
    tgt: list[str]


app = FastAPI(title="ClassCaption IndicTrans2")


@app.get("/health")
def health():
    return {
        "ok": True,
        "device": DEVICE,
        "size": SIZE,
        "loaded": sorted(loaded),
        "processor": "IndicTransToolkit" if IndicProcessor else "simple",
        "languages": sorted(CODES),
    }


@app.post("/translate")
def translate_route(req: Req, authorization: str = Header(default="")):
    if API_KEY and authorization != f"Bearer {API_KEY}":
        raise HTTPException(401, "bad key")
    bad = [c for c in [req.src, *req.tgt] if c not in CODES]
    if bad:
        raise HTTPException(400, f"unsupported language: {', '.join(bad)}")
    if len(req.texts) > 64:
        raise HTTPException(400, "at most 64 texts per request")
    t0 = time.time()
    # Blank lines stay blank (the model would invent text for them).
    keep = [i for i, x in enumerate(req.texts) if x.strip()]
    result = {}
    for tgt in dict.fromkeys(req.tgt):
        out = [""] * len(req.texts)
        if keep:
            for i, text in zip(keep, translate([req.texts[i] for i in keep], req.src, tgt)):
                out[i] = text
        result[tgt] = out
    return {"translations": result, "ms": round((time.time() - t0) * 1000)}


if __name__ == "__main__":
    import uvicorn

    if os.environ.get("INDICTRANS2_PRELOAD", "1") == "1":
        model("en-indic")  # first caption isn't slow
    uvicorn.run(app, host=os.environ.get("HOST", "0.0.0.0"), port=int(os.environ.get("PORT", "7860")))
