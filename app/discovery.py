"""Cached discovery from real OpenStreetMap records; never generates contacts."""
import os
import re
import threading
import time
from urllib.parse import urlsplit
import httpx

NICHES = {
    'software': ('IT / разработка ПО', [('office', 'it'), ('office', 'software')]),
    'accounting': ('Бухгалтерия', [('office', 'accountant'), ('office', 'tax_advisor')]),
    'law': ('Юридические услуги', [('office', 'lawyer')]),
    'logistics': ('Логистика', [('office', 'logistics'), ('office', 'transport')]),
    'construction': ('Строительство', [('office', 'construction_company'), ('craft', 'builder')]),
    'manufacturing': ('Производство', [('man_made', 'works')]),
    'wholesale': ('Оптовая торговля', [('shop', 'wholesale')]),
    'marketing': ('Маркетинг / реклама', [('office', 'advertising_agency')]),
    'real_estate': ('Недвижимость', [('office', 'estate_agent')]),
    'printing': ('Полиграфия', [('craft', 'printer'), ('shop', 'copyshop')]),
    'dentist': ('Стоматологии', [('amenity', 'dentist')]),
    'restaurant': ('Рестораны', [('amenity', 'restaurant')]),
    'hotel': ('Отели', [('tourism', 'hotel')]),
    'car_repair': ('Автосервисы', [('shop', 'car_repair')]),
}
ALIASES = {label.casefold(): key for key, (label, _) in NICHES.items()}
ALIASES.update({'it': 'software', 'юристы': 'law', 'опт': 'wholesale', 'маркетинг': 'marketing'})
AGENT = os.getenv('CRAWLER_USER_AGENT', 'LeadFactoryLocalMVP/0.1 (manual local business research)')
_lock = threading.Lock()
_cache = {}
_last_geocode = 0.0

def normalized_website(raw):
    if not raw:
        return None
    raw = raw.strip().split(';')[0].strip()
    if '://' not in raw:
        raw = 'https://' + raw
    try:
        parsed = urlsplit(raw)
        if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password or parsed.port not in (None, 80, 443):
            return None
    except ValueError:
        return None
    return raw[:2000]

def contacts_from_tags(tags, source):
    contacts = []
    for value in (tags.get('contact:email') or tags.get('email') or '').split(';'):
        value = value.strip().lower()
        if re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', value) and len(value) <= 320:
            contacts.append({'email': value, 'source': source})
    for value in (tags.get('contact:phone') or tags.get('phone') or '').split(';'):
        value = value.strip()
        if 6 <= len(re.sub(r'\D', '', value)) <= 18:
            contacts.append({'phone': value[:80], 'source': source})
    return contacts

def discover(niche, city, limit):
    global _last_geocode
    key = ALIASES.get(niche.casefold(), niche.casefold())
    if key not in NICHES:
        raise ValueError('Unknown niche. Choose a value from /niches.')
    cache_key = (key, city.casefold().strip(), limit)
    with _lock:
        cached = _cache.get(cache_key)
        if cached and time.monotonic() - cached[0] < 86400:
            return cached[1]
        with httpx.Client(headers={'User-Agent': AGENT}, timeout=65, follow_redirects=False) as client:
            time.sleep(max(0, 1.1 - (time.monotonic() - _last_geocode)))
            _last_geocode = time.monotonic()
            response = client.get(os.getenv('NOMINATIM_URL', 'https://nominatim.openstreetmap.org/search'), params={'q': city, 'format': 'jsonv2', 'limit': 1, 'addressdetails': 1})
            response.raise_for_status()
            locations = response.json()
            if not locations:
                raise ValueError('City not found. Add country to the city name.')
            location = locations[0]
            lat, lon = float(location['lat']), float(location['lon'])
            south, north, west, east = map(float, location['boundingbox'])
            area = f'({south},{west},{north},{east})' if north-south < 0.5 and east-west < 0.7 else f'(around:20000,{lat},{lon})'
            selectors = ''.join(f'nwr["{tag}"="{value}"]["name"]{area};' for tag, value in NICHES[key][1])
            query = f'[out:json][timeout:45][maxsize:16777216];({selectors});out tags 250;'
            response = client.post(os.getenv('OVERPASS_URL', 'https://overpass-api.de/api/interpreter'), data={'data': query})
            response.raise_for_status()
            payload = response.json()
            if payload.get('remark'):
                raise RuntimeError('OpenStreetMap query incomplete; retry later')
        companies, seen = [], set()
        for element in payload.get('elements', []):
            tags = element.get('tags', {})
            if not tags.get('name'):
                continue
            source_id = f"osm:{element['type']}:{element['id']}"
            if source_id in seen:
                continue
            seen.add(source_id)
            source = f"https://www.openstreetmap.org/{element['type']}/{element['id']}"
            company = {'name': tags['name'][:250], 'city': tags.get('addr:city', city)[:120], 'industry': NICHES[key][0], 'country': location.get('address', {}).get('country'), 'sourceId': source_id, 'sourceUrl': source, 'contacts': contacts_from_tags(tags, source)}
            website = normalized_website(tags.get('contact:website') or tags.get('website'))
            if website:
                company['website'] = website
            companies.append(company)
            if len(companies) >= limit:
                break
        result = {'companies': companies, 'location': location['display_name'], 'attribution': '© OpenStreetMap contributors · ODbL 1.0'}
        if len(_cache) >= 200:
            _cache.pop(next(iter(_cache)))
        _cache[cache_key] = (time.monotonic(), result)
        return result
