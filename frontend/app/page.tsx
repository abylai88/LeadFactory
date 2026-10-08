'use client';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';

type Workspace = {id: string; name: string};
type Company = {id: string; name: string; website?: string; city?: string; industry?: string; description?: string; sourceUrl?: string; enrichedAt?: string; _count: {leads: number}};
type Lead = {id: string; firstName?: string; lastName?: string; email?: string; phone?: string; source?: string; status: string; company: Company};
type Run = {id: string; niche: string; city: string; status: string; count: number; error?: string; createdAt: string};
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const statuses: Record<string, string> = {NEW: 'Новый', QUALIFIED: 'Квалифицирован', CONTACTED: 'Связались', CONVERTED: 'Клиент', LOST: 'Закрыт'};
const fallbackNiches = [{id:'software',label:'IT / разработка ПО'},{id:'accounting',label:'Бухгалтерия'},{id:'law',label:'Юридические услуги'},{id:'logistics',label:'Логистика'},{id:'construction',label:'Строительство'},{id:'manufacturing',label:'Производство'},{id:'wholesale',label:'Оптовая торговля'},{id:'marketing',label:'Маркетинг / реклама'},{id:'real_estate',label:'Недвижимость'},{id:'printing',label:'Полиграфия'},{id:'dentist',label:'Стоматологии'},{id:'restaurant',label:'Рестораны'},{id:'hotel',label:'Отели'},{id:'car_repair',label:'Автосервисы'}];
async function api(path: string, method = 'GET', body?: unknown) {
  const response = await fetch(API + path, {method, headers: {'Content-Type': 'application/json'}, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(160000)});
  const data = await response.json();
  if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join('; ') : data.message || 'Ошибка запроса');
  return data;
}
function safeUrl(value?: string) { try { const u = new URL(value || ''); return ['http:', 'https:'].includes(u.protocol) ? u.href : undefined; } catch { return undefined; } }
function Source({url, children}: {url?: string; children: React.ReactNode}) { const href = safeUrl(url); return href ? <a href={href} target="_blank" rel="noreferrer">{children} ↗</a> : <span className="muted">—</span>; }

export default function Home() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspace, setWorkspace] = useState('');
  const [tab, setTab] = useState<'companies'|'leads'>('companies');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [niches, setNiches] = useState(fallbackNiches);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({companies:0, leads:0});
  const [editor, setEditor] = useState<Company|null|undefined>(undefined);
  const [leadCompany, setLeadCompany] = useState<Company|null>(null);
  const generation = useRef(0);
  useEffect(() => {
    api('/workspaces').then(data => {setWorkspaces(data); setWorkspace(data[0]?.id || '');}).catch(e => setError('Backend недоступен: ' + e.message)).finally(() => setLoading(false));
    api('/niches').then(setNiches).catch(() => {});
  }, []);
  const load = useCallback(async () => {
    if (!workspace) return;
    const version = ++generation.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({page: String(page), limit:'20', q:query, ...(tab === 'leads' && status ? {status} : {})});
      const [list, history, companyCount, leadCount] = await Promise.all([api(`/workspaces/${workspace}/${tab}?${params}`), api(`/workspaces/${workspace}/searches`), api(`/workspaces/${workspace}/companies?limit=1`), api(`/workspaces/${workspace}/leads?limit=1`)]);
      if (version !== generation.current) return;
      if (tab === 'companies') setCompanies(list.items); else setLeads(list.items);
      setTotal(list.total); setRuns(history); setCounts({companies:companyCount.total, leads:leadCount.total});
    } finally { if (version === generation.current) setLoading(false); }
  }, [workspace, tab, page, query, status]);
  useEffect(() => { const timer = setTimeout(() => {load().catch(e => setError(e.message));}, 250); return () => {clearTimeout(timer); generation.current++;}; }, [load]);
  async function action(label: string, fn: () => Promise<void>) {
    setBusy(label); setError(''); setMessage('');
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка операции'); }
    finally { try { await load(); } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка загрузки'); } setBusy(''); }
  }
  async function addWorkspace() {
    const name = prompt('Название рабочего пространства'); if (!name?.trim()) return;
    await action('Создание пространства', async () => { const row = await api('/workspaces', 'POST', {name:name.trim()}); setWorkspaces([...workspaces,row]); setWorkspace(row.id); setPage(1); });
  }
  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    await action('Ищем компании в OpenStreetMap…', async () => { const result = await api(`/workspaces/${workspace}/search`, 'POST', {niche:data.get('niche'), city:data.get('city'), limit:Number(data.get('limit'))}); setMessage(`Обработано ${result.count} компаний. ${result.location}. Повторные записи не добавляются.`); setPage(1); });
  }
  async function saveCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const body = Object.fromEntries([...data.entries()].filter(([,v]) => editor || v !== '').map(([k,v]) => [k,v === '' ? null : v]));
    await action('Сохранение компании', async () => { await api(`/workspaces/${workspace}/companies${editor ? '/'+editor.id : ''}`, editor ? 'PATCH' : 'POST', body); setEditor(undefined); });
  }
  async function saveLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const body = Object.fromEntries([...data.entries()].filter(([,v]) => v !== ''));
    await action('Сохранение лида', async () => { await api(`/workspaces/${workspace}/companies/${leadCompany?.id}/leads`, 'POST', body); setLeadCompany(null); });
  }
  return <div className="shell">
    <aside><div className="brand"><span className="brand-mark">L</span> LeadFactory<span className="version">MVP</span></div><div className="aside-label">РАБОЧЕЕ ПРОСТРАНСТВО</div><select aria-label="Рабочее пространство" value={workspace} disabled={!!busy} onChange={e => {setWorkspace(e.target.value);setPage(1);setQuery('');}}><option value="" disabled>Выберите пространство</option>{workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select><button className="subtle" disabled={!!busy} onClick={addWorkspace}>＋ Новое пространство</button><nav><button className={tab === 'companies' ? 'active' : ''} disabled={!!busy} onClick={() => {setTab('companies');setPage(1);setQuery('');}}>▦ Компании <span>{counts.companies}</span></button><button className={tab === 'leads' ? 'active' : ''} disabled={!!busy} onClick={() => {setTab('leads');setPage(1);setQuery('');}}>◉ Лиды <span>{counts.leads}</span></button></nav><div className="aside-note"><span className="dot"/> Локальное рабочее место<p>Открытые источники.<br/>Контакты с подтверждённым происхождением.</p></div></aside>
    <main><header><div className="eyebrow">ВАША БАЗА ДЛЯ РОСТА</div><h1>{tab === 'companies' ? 'Компании' : 'Лиды'}<span className="heading-dot">.</span></h1><p className="subtitle">Находите бизнес. Проверяйте источники. Развивайте отношения.</p></header>
      {error && <div className="alert error" role="alert">{error}</div>}{message && <div className="alert success" role="status">{message}</div>}{busy && <div className="alert progress" role="status"><span className="spinner"/>{busy} Это может занять до двух минут.</div>}
      {!workspace ? <section className="empty"><div className="empty-icon">▦</div><h2>{loading ? 'Подключение…' : 'Начните с рабочего пространства'}</h2><p>Создайте пространство для компаний и контактов вашего проекта.</p><button disabled={!!busy || loading} onClick={addWorkspace}>Создать пространство</button></section> : <>
      <section className="search-panel"><div className="section-heading"><div><span className="eyebrow">DISCOVERY</span><h2>Найдите следующего клиента</h2></div><span className="badge">Без платных API</span></div><form onSubmit={search} className="search-form"><label>Ниша<select name="niche" defaultValue="software">{niches.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}</select></label><label>Город и страна<input name="city" required minLength={2} maxLength={150} placeholder="Например, Алматы, Казахстан" /></label><label className="limit">Лимит<select name="limit" defaultValue="20"><option>10</option><option>20</option><option>50</option></select></label><button disabled={!!busy} type="submit">Найти компании ↗</button></form><p className="source-note">Данные: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors · ODbL</a>. Покрытие неполное; границы города или радиус 20 км. B2B-пригодность проверяется вручную.</p></section>
      <section className="records"><div className="toolbar"><div><h2>{tab === 'companies' ? 'Ваша база компаний' : 'Контакты и воронка'}</h2><span className="muted">{total} записей</span></div><div className="toolbar-actions"><input aria-label="Фильтр записей" placeholder={tab === 'companies' ? 'Поиск по названию' : 'Компания или email'} value={query} onChange={e => {setQuery(e.target.value);setPage(1);}}/>{tab === 'leads' && <select aria-label="Фильтр статуса" value={status} onChange={e => {setStatus(e.target.value);setPage(1);}}><option value="">Все статусы</option>{Object.entries(statuses).map(([s,l]) => <option key={s} value={s}>{l}</option>)}</select>}{tab === 'companies' && <button className="secondary" disabled={!!busy} onClick={() => setEditor(null)}>＋ Добавить</button>}<button className="secondary" disabled={!!busy} onClick={() => load().catch(e => setError(e.message))}>Обновить</button></div></div>
      {loading ? <div className="empty small">Загрузка…</div> : total === 0 ? <div className="empty"><div className="empty-icon">{tab === 'companies' ? '⌕' : '◉'}</div><h3>{tab === 'companies' ? 'Пока нет компаний' : 'Пока нет контактов'}</h3><p>{tab === 'companies' ? 'Запустите поиск по нише и городу или добавьте компанию вручную.' : 'Откройте список компаний и нажмите «Найти контакты» или «＋ Лид».'}</p></div> : <div className="table-wrap"><table><thead><tr>{(tab === 'companies' ? ['Компания','Город / ниша','Лиды','Источник','Действия'] : ['Контакт','Компания','Статус','Источник','']).map((t,i) => <th key={i}>{t}</th>)}</tr></thead><tbody>{tab === 'companies' ? companies.map(c => <tr key={c.id}><td><strong>{c.name}</strong><div className="cell-sub"><Source url={c.website}>{safeUrl(c.website) ? new URL(c.website!).hostname : 'Сайт'}</Source></div></td><td>{c.city || '—'}<div className="cell-sub">{c.industry || '—'}</div></td><td><span className="count">{c._count.leads}</span></td><td><Source url={c.sourceUrl}>OSM</Source></td><td><div className="row-actions"><button className="text-button" disabled={!!busy || !c.website} onClick={() => action('Поиск публичных контактов', async () => {const result = await api(`/workspaces/${workspace}/companies/${c.id}/enrich`, 'POST', {});setMessage(`Контактов обработано: ${result.contacts.length}; страниц: ${result.pages.length}. ${result.warnings.join(' ')}`);})}>Найти контакты</button><button className="text-button" disabled={!!busy} onClick={() => setLeadCompany(c)}>＋ Лид</button><button className="text-button" disabled={!!busy} onClick={() => setEditor(c)}>Править</button><button className="text-button danger" disabled={!!busy} onClick={() => {if (confirm(`Удалить «${c.name}» и все её лиды?`)) action('Удаление', async () => {await api(`/workspaces/${workspace}/companies/${c.id}`, 'DELETE');});}}>Удалить</button></div></td></tr>) : leads.map(l => <tr key={l.id}><td><strong>{[l.firstName,l.lastName].filter(Boolean).join(' ') || l.email || l.phone || 'Контакт компании'}</strong><div className="cell-sub">{l.email} {l.phone}</div></td><td>{l.company.name}</td><td><select className="status" aria-label={`Статус ${l.email || l.id}`} value={l.status} disabled={!!busy} onChange={e => action('Изменение статуса', async () => {await api(`/workspaces/${workspace}/leads/${l.id}`, 'PATCH', {status:e.target.value});})}>{Object.entries(statuses).map(([s,t]) => <option key={s} value={s}>{t}</option>)}</select></td><td><Source url={l.source}>Источник</Source></td><td><button className="text-button danger" disabled={!!busy} onClick={() => {if(confirm('Удалить лид?')) action('Удаление', async () => {await api(`/workspaces/${workspace}/leads/${l.id}`, 'DELETE');});}}>Удалить</button></td></tr>)}</tbody></table></div>}
      <div className="pagination"><span>Страница {page} из {Math.max(1,Math.ceil(total/20))}</span><div><button className="secondary" disabled={page === 1 || !!busy} onClick={() => setPage(page-1)}>←</button><button className="secondary" disabled={page*20 >= total || !!busy} onClick={() => setPage(page+1)}>→</button></div></div></section>
      <section className="history"><h2>Последние поиски</h2>{runs.length === 0 ? <p className="muted">История появится после первого поиска.</p> : runs.slice(0,5).map(r => <div className="history-row" key={r.id}><span className={`run-dot ${r.status.toLowerCase()}`}/><strong>{r.city}</strong><span>{niches.find(n => n.id === r.niche)?.label || r.niche}</span><span className="muted">{new Date(r.createdAt).toLocaleString('ru-RU')}</span><span title={r.error}>{r.status === 'COMPLETED' ? `${r.count} найдено` : r.status === 'RUNNING' ? 'Выполняется' : `Ошибка: ${r.error}`}</span></div>)}</section></>}
      <footer>LeadFactory · Локальный MVP <span>Публичные контакты не означают согласия на рассылку.</span></footer>
    </main>
    {editor !== undefined && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-label="Компания"><h2>{editor ? 'Редактировать компанию' : 'Новая компания'}</h2>{error && <div className="alert error" role="alert">{error}</div>}<form onSubmit={saveCompany}><label>Название<input name="name" required maxLength={250} defaultValue={editor?.name}/></label><label>Сайт<input name="website" type="url" placeholder="https://" defaultValue={editor?.website}/></label><label>Город<input name="city" maxLength={120} defaultValue={editor?.city}/></label><label>Ниша<input name="industry" maxLength={120} defaultValue={editor?.industry}/></label><div className="modal-actions"><button type="button" className="secondary" disabled={!!busy} onClick={() => setEditor(undefined)}>Отмена</button><button disabled={!!busy}>Сохранить</button></div></form></section></div>}
    {leadCompany && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-label="Новый лид"><h2>Лид · {leadCompany.name}</h2>{error && <div className="alert error" role="alert">{error}</div>}<form onSubmit={saveLead}><label>Имя<input name="firstName" maxLength={120}/></label><label>Email<input name="email" type="email"/></label><label>Телефон<input name="phone" maxLength={80}/></label><label>Ссылка на источник<input name="source" type="url"/></label><p className="muted">Укажите имя, email или телефон. Добавляйте только известные вам данные.</p><div className="modal-actions"><button type="button" className="secondary" disabled={!!busy} onClick={() => setLeadCompany(null)}>Отмена</button><button disabled={!!busy}>Сохранить</button></div></form></section></div>}
  </div>;
}

