import { BadGatewayException, BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { CompanyDto, CompanyPatchDto, LeadDto, PageDto, SearchDto, WorkspaceDto } from './dto';
import { Prisma } from '@prisma/client';

type Contact = { email?: string; phone?: string; source: string };
type Discovery = { companies: Array<CompanyDto & {sourceId: string; sourceUrl: string; contacts: Contact[]}>; location: string; attribution: string };

@Injectable()
export class CrmService implements OnModuleInit {
  private searching = false;
  private enriching = new Set<string>();
  constructor(private readonly db: PrismaService) {}
  async onModuleInit() {
    // Single backend process: mark interrupted searches honestly after a restart.
    await this.db.searchRun.updateMany({ where: { status: 'RUNNING' }, data: { status: 'FAILED', error: 'Backend restarted before completion', finishedAt: new Date() } });
  }
  async health() { await this.db.$queryRaw`SELECT 1`; return { status: 'ok', database: 'ok' }; }
  async worker(path: string, body?: unknown): Promise<any> {
    try {
      const response = await fetch(`${process.env.CRAWLER_URL ?? 'http://127.0.0.1:8000'}${path}`, {
        method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(150000),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 400 || response.status === 422) throw new BadRequestException(typeof data.detail === 'string' ? data.detail : 'Invalid search or website');
        throw new BadGatewayException(typeof data.detail === 'string' ? data.detail : 'Data provider unavailable');
      }
      return data;
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof BadGatewayException) throw error;
      throw new BadGatewayException('Python search service unavailable or timed out');
    }
  }
  workspaces() { return this.db.workspace.findMany({ orderBy: { createdAt: 'asc' }, include: { _count: { select: { companies: true } } } }); }
  async createWorkspace(data: WorkspaceDto) {
    const owner = await this.db.user.upsert({ where: { email: 'local@leadfactory.local' }, create: { email: 'local@leadfactory.local', name: 'Local operator' }, update: {} });
    return this.db.workspace.create({ data: { name: data.name, ownerId: owner.id } });
  }
  renameWorkspace(id: string, data: WorkspaceDto) { return this.db.workspace.update({ where: { id }, data }); }
  async getWorkspace(id: string) { await this.workspace(id); return this.db.workspace.findUnique({ where: { id }, include: { _count: { select: { companies: true } } } }); }
  async deleteWorkspace(id: string) { await this.workspace(id); return this.db.workspace.delete({ where: { id } }); }
  async workspace(id: string) { if (!await this.db.workspace.findUnique({ where: { id } })) throw new NotFoundException('Workspace not found'); }
  async company(w: string, id: string) { const row = await this.db.company.findFirst({ where: { id, workspaceId: w } }); if (!row) throw new NotFoundException('Company not found'); return row; }
  domain(website?: string | null) { return website ? new URL(website).hostname.replace(/^www\./, '') : null; }
  async companies(w: string, p: PageDto) {
    await this.workspace(w);
    const where: Prisma.CompanyWhereInput = { workspaceId: w, ...(p.q ? { name: { contains: p.q, mode: 'insensitive' } } : {}) };
    const [items, total] = await this.db.$transaction([this.db.company.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (p.page - 1) * p.limit, take: p.limit, include: { _count: { select: { leads: true } } } }), this.db.company.count({ where })]);
    return { items, total, page: p.page, limit: p.limit };
  }
  async createCompany(w: string, data: CompanyDto) { await this.workspace(w); return this.db.company.create({ data: { ...data, workspaceId: w, domain: this.domain(data.website) } }); }
  async updateCompany(w: string, id: string, data: CompanyPatchDto) {
    await this.company(w, id);
    if (data.name === null) throw new BadRequestException('Name cannot be null');
    return this.db.company.update({ where: { id, workspaceId: w }, data: { ...data, ...(data.website !== undefined ? {domain: this.domain(data.website)} : {}) } });
  }
  async deleteCompany(w: string, id: string) { await this.company(w, id); return this.db.company.delete({ where: { id, workspaceId: w } }); }
  async leads(w: string, p: PageDto) {
    await this.workspace(w);
    const where: Prisma.LeadWhereInput = { company: { workspaceId: w }, ...(p.status ? {status: p.status} : {}), ...(p.q ? { OR: [{email: { contains: p.q, mode: 'insensitive' }}, {company: {name: {contains: p.q, mode: 'insensitive'}}}] } : {}) };
    const [items, total] = await this.db.$transaction([this.db.lead.findMany({ where, include: { company: true }, orderBy: { createdAt: 'desc' }, skip: (p.page - 1) * p.limit, take: p.limit }), this.db.lead.count({ where })]);
    return { items, total, page: p.page, limit: p.limit };
  }
  contactKey(data: {email?: string | null; phone?: string | null}) { return data.email ? `email:${data.email.toLowerCase().trim()}` : data.phone ? `phone:${data.phone.replace(/\D/g, '')}` : null; }
  async createLead(w: string, id: string, data: LeadDto) {
    await this.company(w, id);
    if (!data.email?.trim() && !data.phone?.trim() && !data.firstName?.trim() && !data.lastName?.trim()) throw new BadRequestException('Provide a name, email or phone');
    if (data.status === null) throw new BadRequestException('Status cannot be null');
    return this.db.lead.create({ data: { ...data, email: data.email?.toLowerCase(), companyId: id, contactKey: this.contactKey(data) } });
  }
  async updateLead(w: string, id: string, data: LeadDto) {
    const row = await this.db.lead.findFirst({ where: { id, company: { workspaceId: w } } });
    if (!row) throw new NotFoundException('Lead not found');
    if (data.status === null) throw new BadRequestException('Status cannot be null');
    const changes = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
    const merged = { ...row, ...changes };
    if (!merged.email?.trim() && !merged.phone?.trim() && !merged.firstName?.trim() && !merged.lastName?.trim()) throw new BadRequestException('Provide a name, email or phone');
    return this.db.lead.update({ where: { id }, data: { ...data, contactKey: this.contactKey(merged) } });
  }
  async deleteLead(w: string, id: string) {
    const row = await this.db.lead.findFirst({ where: { id, company: { workspaceId: w } } });
    if (!row) throw new NotFoundException('Lead not found');
    return this.db.lead.delete({ where: { id } });
  }
  async saveContacts(tx: Prisma.TransactionClient, companyId: string, contacts: Contact[]) {
    for (const contact of contacts) {
      const contactKey = this.contactKey(contact);
      if (!contactKey) continue;
      await tx.lead.upsert({ where: { companyId_contactKey: {companyId, contactKey} }, create: { companyId, contactKey, email: contact.email?.toLowerCase(), phone: contact.phone, source: contact.source }, update: {} });
    }
  }
  async search(w: string, data: SearchDto) {
    await this.workspace(w);
    if (this.searching) throw new ConflictException('A search is already running; retry after it finishes');
    this.searching = true;
    let runId: string | undefined;
    try {
      const run = await this.db.searchRun.create({ data: { workspaceId: w, niche: data.niche, city: data.city } }); runId = run.id;
      const result: Discovery = await this.worker('/search', data);
      if (!Array.isArray(result.companies)) throw new BadGatewayException('Invalid discovery response');
      await this.db.$transaction(async tx => {
        for (const c of result.companies.slice(0, data.limit)) {
          const {contacts, ...company} = c;
          // Do not overwrite operator edits on subsequent searches.
          const row = await tx.company.upsert({ where: { workspaceId_sourceId: { workspaceId: w, sourceId: company.sourceId } }, create: { ...company, workspaceId: w, domain: this.domain(company.website), foundAt: new Date() }, update: {} });
          await this.saveContacts(tx, row.id, contacts ?? []);
        }
        await tx.searchRun.update({ where: { id: run.id }, data: { status: 'COMPLETED', count: Math.min(result.companies.length, data.limit), finishedAt: new Date() } });
      }, { timeout: 30000 });
      return { runId, count: Math.min(result.companies.length, data.limit), location: result.location, attribution: result.attribution };
    } catch (error) {
      if (runId) await this.db.searchRun.update({ where: { id: runId }, data: { status: 'FAILED', error: error instanceof Error ? error.message.slice(0,500) : 'Search failed', finishedAt: new Date() } });
      throw error;
    } finally { this.searching = false; }
  }
  async searches(w: string) { await this.workspace(w); return this.db.searchRun.findMany({ where: { workspaceId: w }, orderBy: { createdAt: 'desc' }, take: 25 }); }
  async enrich(w: string, id: string) {
    const company = await this.company(w, id);
    if (!company.website) throw new BadRequestException('Company has no website');
    if (this.enriching.has(id)) throw new ConflictException('Enrichment already running');
    this.enriching.add(id);
    try {
      const result: {contacts: Contact[]; description?: string; pages: string[]; warnings: string[]} = await this.worker('/enrich', { url: company.website });
      await this.db.$transaction(async tx => {
        await this.saveContacts(tx, id, result.contacts);
        await tx.company.update({ where: { id }, data: { enrichedAt: new Date(), ...(!company.description && result.description ? { description: result.description } : {}) } });
      });
      return result;
    } finally { this.enriching.delete(id); }
  }
}
