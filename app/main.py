from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, ConfigDict
import httpx
import http.client
from app.discovery import NICHES, discover
from app.enrichment import enrich

app = FastAPI(title='LeadFactory Discovery', version='0.2.0')

@app.get('/health')
def health() -> dict[str, str]:
    return {'status': 'ok'}

class SearchInput(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    niche: str = Field(min_length=1, max_length=100)
    city: str = Field(min_length=2, max_length=150)
    limit: int = Field(default=20, ge=1, le=50)

class EnrichInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    url: str = Field(min_length=8, max_length=2000)

@app.get('/niches')
def niches():
    return [{'id': key, 'label': value[0]} for key, value in NICHES.items()]

@app.post('/search')
def search(data: SearchInput):
    try:
        return discover(data.niche, data.city, data.limit)
    except ValueError as error:
        raise HTTPException(400, str(error)) from error
    except (httpx.HTTPError, RuntimeError, KeyError) as error:
        raise HTTPException(502, 'OpenStreetMap provider unavailable or returned incomplete data; retry later') from error

@app.post('/enrich')
def enrichment(data: EnrichInput):
    try:
        return enrich(data.url)
    except ValueError as error:
        raise HTTPException(400, str(error)) from error
    except (OSError, http.client.HTTPException) as error:
        raise HTTPException(502, 'Website connection failed') from error
