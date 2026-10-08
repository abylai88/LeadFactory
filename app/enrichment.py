"""Robots-aware crawler with Parsel. Validated DNS is pinned to each connection."""
import http.client
import ipaddress
import re
import socket
import ssl
import threading
import time
from urllib.parse import unquote, urljoin, urlsplit
from urllib.robotparser import RobotFileParser
from parsel import Selector
from app.discovery import AGENT

MAX_BYTES = 1_000_000
_crawl_lock = threading.Lock()

def public_target(url):
    parsed = urlsplit(url)
    if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError('Only public HTTP/HTTPS websites are allowed')
    port = parsed.port or (443 if parsed.scheme == 'https' else 80)
    if port not in (80, 443):
        raise ValueError('Only ports 80 and 443 are allowed')
    host = parsed.hostname.encode('idna').decode('ascii')
    addresses = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(row[4][0]).is_global for row in addresses):
        raise ValueError('Private, loopback and reserved addresses are blocked')
    return host, port, addresses[0][4][0], parsed.scheme

def fetch_page(url, redirects=0, allowed=None):
    if redirects > 3:
        raise ValueError('Too many redirects')
    if allowed and not allowed(url):
        raise ValueError('robots.txt disallows redirect destination')
    host, port, ip, scheme = public_target(url)
    parsed = urlsplit(url)
    connection = http.client.HTTPConnection(host, port, timeout=8)
    sock = socket.create_connection((ip, port), timeout=8)
    if scheme == 'https':
        try:
            sock = ssl.create_default_context().wrap_socket(sock, server_hostname=host)
        except Exception:
            sock.close()
            raise
    connection.sock = sock
    try:
        connection.request('GET', (parsed.path or '/') + ('?' + parsed.query if parsed.query else ''), headers={'User-Agent': AGENT, 'Accept': 'text/html,text/plain', 'Accept-Encoding': 'identity'})
        response = connection.getresponse()
        if response.status in (301, 302, 303, 307, 308):
            target = urljoin(url, response.getheader('Location') or '')
            if urlsplit(target).netloc != parsed.netloc:
                raise ValueError('Cross-host redirect skipped; use the final website URL')
            return fetch_page(target, redirects + 1, allowed)
        raw = response.read(MAX_BYTES + 1)
        if len(raw) > MAX_BYTES:
            raise ValueError('Page exceeds 1 MB limit')
        return raw.decode('utf-8', errors='replace'), url, response.status, response.getheader('Content-Type', '')
    finally:
        connection.close()

def extract(html, url):
    selector = Selector(text=html)
    contacts, seen = [], set()
    links = selector.css('a::attr(href)').getall()
    visible = ' '.join(selector.xpath('//body//text()[not(ancestor::script) and not(ancestor::style)]').getall())
    emails = re.findall(r'\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b', visible)
    emails += [unquote(link[7:].split('?')[0]) for link in links if link.lower().startswith('mailto:')]
    for email in emails:
        email = email.lower().strip()
        if re.fullmatch(r'[^\s@,;]+@[^\s@]+\.[^\s@]+', email) and email not in seen and len(email) <= 320:
            contacts.append({'email': email, 'source': url})
            seen.add(email)
    for link in links:
        if link.lower().startswith('tel:'):
            phone = unquote(link[4:]).strip()
            if 6 <= len(re.sub(r'\D', '', phone)) <= 18 and phone not in seen:
                contacts.append({'phone': phone[:80], 'source': url})
                seen.add(phone)
    description = selector.css('meta[name="description"]::attr(content)').get()
    contact_pages = [urljoin(url, link) for link in links if re.search(r'contact|kontakt|контакт|about|impressum', link, re.I) and urlsplit(urljoin(url, link)).netloc == urlsplit(url).netloc]
    return contacts[:30], description[:4000] if description else None, list(dict.fromkeys(contact_pages))[:2]

def enrich(url):
    with _crawl_lock:
        public_target(url)
        parsed = urlsplit(url)
        origin = f'{parsed.scheme}://{parsed.netloc}'
        robot = RobotFileParser()
        robots, _, status, _ = fetch_page(origin + '/robots.txt')
        if status == 404:
            robot.parse([])
        elif status == 200:
            robot.parse(robots.splitlines())
        else:
            raise ValueError('Robots policy unavailable or access denied')
        delay = max(1, robot.crawl_delay(AGENT) or 1)
        if delay > 10:
            raise ValueError('Site requests a crawl delay above the MVP limit')
        contacts, pages, warnings, queue = [], [], [], [url]
        description = None
        started = time.monotonic()
        for index in range(3):
            if not queue or time.monotonic() - started > 45:
                break
            target = queue.pop(0)
            if not robot.can_fetch(AGENT, target):
                warnings.append('robots.txt disallows ' + target)
                continue
            time.sleep(delay)
            try:
                html, final, status, content_type = fetch_page(target, allowed=lambda target: robot.can_fetch(AGENT, target))
                if status != 200 or 'text/html' not in content_type:
                    warnings.append(f'Skipped HTTP {status} or non-HTML: {target}')
                    continue
                found, desc, links = extract(html, final)
                contacts.extend(found)
                pages.append(final)
                description = description or desc
                if index == 0:
                    queue.extend(link for link in links if link not in pages)
            except (OSError, ValueError, http.client.HTTPException) as error:
                warnings.append(str(error)[:200])
        unique = {(c.get('email') or re.sub(r'\D', '', c.get('phone', ''))): c for c in contacts}
        return {'contacts': list(unique.values()), 'description': description, 'pages': pages, 'warnings': warnings}

