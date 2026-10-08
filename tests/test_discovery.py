import socket
import httpx
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app import discovery, enrichment

client = TestClient(app)

def test_input_and_niches():
    assert len(client.get('/niches').json()) == 14
    assert client.post('/search', json={'niche':'software','city':'X','limit':99}).status_code == 422
    assert client.post('/search', json={'niche':'unlisted','city':'London'}).status_code == 400

def test_no_invented_contacts():
    assert discovery.contacts_from_tags({'name':'Fixture'}, 'https://example.org') == []
    assert discovery.normalized_website('javascript:alert(1)') is None
    assert discovery.normalized_website('example.org') == 'https://example.org'

def test_discovery_real_payload_shape_cache_and_dedup(monkeypatch):
    discovery._cache.clear()
    calls = []
    def respond(request):
        calls.append(request)
        if request.method == 'GET':
            return httpx.Response(200, json=[{'lat':'51.5','lon':'-0.1','boundingbox':['51.4','51.6','-0.2','0.0'],'display_name':'Fixture location','address':{'country':'Fixture country'}}])
        row = {'type':'node','id':123,'tags':{'name':'TEST FIXTURE ONLY','office':'it','website':'example.org','email':'public@example.org'}}
        return httpx.Response(200, json={'elements':[row,row]})
    real_client = httpx.Client
    monkeypatch.setattr(discovery.httpx, 'Client', lambda **kwargs: real_client(transport=httpx.MockTransport(respond), **kwargs))
    first = discovery.discover('software', 'Fixture city', 5)
    assert first == discovery.discover('software', 'Fixture city', 5)
    assert len(calls) == 2
    assert len(first['companies']) == 1
    assert first['companies'][0]['sourceUrl'] == 'https://www.openstreetmap.org/node/123'
    assert first['companies'][0]['contacts'][0]['email'] == 'public@example.org'
    discovery._cache.clear()

@pytest.mark.parametrize('url', ['http://127.0.0.1','http://10.0.0.1','http://169.254.169.254','http://[::1]','file:///etc/passwd','http://example.org:22','http://user:pass@example.org'])
def test_ssrf_rejected(url):
    with pytest.raises(ValueError):
        enrichment.public_target(url)

def test_mixed_dns_rejected(monkeypatch):
    monkeypatch.setattr(socket, 'getaddrinfo', lambda *args, **kwargs: [(socket.AF_INET,socket.SOCK_STREAM,6,'',('8.8.8.8',443)),(socket.AF_INET,socket.SOCK_STREAM,6,'',('127.0.0.1',443))])
    with pytest.raises(ValueError):
        enrichment.public_target('https://example.org')

def test_extract_provenance_and_no_script_contacts():
    html = '<html><head><meta name="description" content="Public description"></head><body><script>hidden@example.org</script><a href="mailto:hello@example.org?subject=Hi">Email</a><p>hello@example.org</p><a href="tel:+44123456789">Call</a><a href="/contact">Contact</a><a href="https://evil.example/contact">Other</a></body></html>'
    contacts, description, links = enrichment.extract(html, 'https://example.org')
    assert len(contacts) == 2
    assert all(c['source'] == 'https://example.org' for c in contacts)
    assert contacts[0]['email'] == 'hello@example.org'
    assert description == 'Public description'
    assert links == ['https://example.org/contact']

def test_robots_disallow_does_not_fetch_page(monkeypatch):
    calls = []
    monkeypatch.setattr(enrichment, 'public_target', lambda url: ('example.org',443,'8.8.8.8','https'))
    def fetch(url, *args, **kwargs):
        calls.append(url)
        return 'User-agent: *\nDisallow: /', url, 200, 'text/plain'
    monkeypatch.setattr(enrichment, 'fetch_page', fetch)
    result = enrichment.enrich('https://example.org')
    assert result['contacts'] == []
    assert len(calls) == 1
    assert result['warnings']

def test_provider_failure_is_not_empty_success(monkeypatch):
    def fail(*args):
        raise httpx.ConnectError('offline')
    monkeypatch.setattr('app.main.discover', fail)
    assert client.post('/search', json={'niche':'software','city':'London'}).status_code == 502
