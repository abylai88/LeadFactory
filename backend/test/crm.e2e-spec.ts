import 'dotenv/config';
import { Test } from '@nestjs/testing';
import { BadGatewayException, INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { CrmService } from '../src/crm.service';
import { DatabaseFilter } from '../src/database.filter';

describe('CRM integration with PostgreSQL', () => {
  let app: INestApplication;
  let db: PrismaService;
  let crm: CrmService;
  let w: string, other: string, company: string, lead: string;
  const created: string[] = [];
  beforeAll(async () => {
    const module = await Test.createTestingModule({imports:[AppModule]}).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({whitelist:true, forbidNonWhitelisted:true, transform:true}));
    app.useGlobalFilters(new DatabaseFilter());
    await app.init(); db = app.get(PrismaService); crm = app.get(CrmService);
  });
  afterAll(async () => {
    if (db) await db.workspace.deleteMany({where:{id:{in:created}}});
    await app?.close();
  });
  it('connects to database and creates workspaces', async () => {
    await request(app.getHttpServer()).get('/api/health').expect(200);
    for (let i=0; i<2; i++) {
      const response = await request(app.getHttpServer()).post('/api/workspaces').send({name:'AUTOMATED TEST FIXTURE'}).expect(201);
      created.push(response.body.id);
    }
    [w, other] = created;
  });
  it('rejects empty names, unsafe URLs and arbitrary fields', async () => {
    await request(app.getHttpServer()).post('/api/workspaces').send({name:'   '}).expect(400);
    await request(app.getHttpServer()).post(`/api/workspaces/${w}/companies`).send({name:'Fixture', website:'javascript:alert(1)'}).expect(400);
    await request(app.getHttpServer()).post(`/api/workspaces/${w}/companies`).send({name:'Fixture', workspaceId:other}).expect(400);
  });
  it('creates, filters and edits company', async () => {
    const response = await request(app.getHttpServer()).post(`/api/workspaces/${w}/companies`).send({name:'TEST FIXTURE', website:'https://example.org'}).expect(201);
    company = response.body.id;
    expect(response.body.domain).toBe('example.org');
    await request(app.getHttpServer()).patch(`/api/workspaces/${w}/companies/${company}`).send({city:'Fixture city'}).expect(200);
    const list = await request(app.getHttpServer()).get(`/api/workspaces/${w}/companies?q=fixture&limit=1`).expect(200);
    expect(list.body.total).toBe(1);
    expect(list.body.items[0].city).toBe('Fixture city');
    await request(app.getHttpServer()).get(`/api/workspaces/${w}/companies?page=-1`).expect(400);
  });
  it('isolates company operations by workspace', async () => {
    await request(app.getHttpServer()).patch(`/api/workspaces/${other}/companies/${company}`).send({name:'Wrong'}).expect(404);
    await request(app.getHttpServer()).delete(`/api/workspaces/${other}/companies/${company}`).expect(404);
  });
  it('creates lead, rejects duplicates and changes status', async () => {
    const response = await request(app.getHttpServer()).post(`/api/workspaces/${w}/companies/${company}/leads`).send({email:'fixture@example.org'}).expect(201);
    lead = response.body.id;
    await request(app.getHttpServer()).post(`/api/workspaces/${w}/companies/${company}/leads`).send({email:'fixture@example.org'}).expect(409);
    await request(app.getHttpServer()).post(`/api/workspaces/${w}/companies/${company}/leads`).send({}).expect(400);
    await request(app.getHttpServer()).patch(`/api/workspaces/${w}/leads/${lead}`).send({status:'QUALIFIED'}).expect(200);
    const list = await request(app.getHttpServer()).get(`/api/workspaces/${w}/leads?status=QUALIFIED`).expect(200);
    expect(list.body.total).toBe(1);
  });
  it('isolates leads and rejects invalid status', async () => {
    await request(app.getHttpServer()).patch(`/api/workspaces/${other}/leads/${lead}`).send({status:'LOST'}).expect(404);
    await request(app.getHttpServer()).patch(`/api/workspaces/${w}/leads/${lead}`).send({status:'INVALID'}).expect(400);
    await request(app.getHttpServer()).patch(`/api/workspaces/${w}/leads/${lead}`).send({status:null}).expect(400);
  });
  it('imports provider results idempotently and preserves operator edits', async () => {
    const spy = jest.spyOn(crm, 'worker').mockResolvedValue({companies:[{name:'DISCOVERY TEST FIXTURE',sourceId:'test:123',sourceUrl:'https://example.org',contacts:[{email:'public@example.org',source:'https://example.org'}]}],location:'Fixture',attribution:'Test fixture'});
    try {
      await request(app.getHttpServer()).post(`/api/workspaces/${w}/search`).send({niche:'software',city:'Fixture'}).expect(201);
      const imported = await db.company.findFirstOrThrow({where:{workspaceId:w,sourceId:'test:123'}});
      await db.company.update({where:{id:imported.id},data:{name:'Operator edit'}});
      await request(app.getHttpServer()).post(`/api/workspaces/${w}/search`).send({niche:'software',city:'Fixture'}).expect(201);
      expect(await db.company.count({where:{workspaceId:w}})).toBe(2);
      expect(await db.lead.count({where:{companyId:imported.id}})).toBe(1);
      expect((await db.company.findUniqueOrThrow({where:{id:imported.id}})).name).toBe('Operator edit');
    } finally { spy.mockRestore(); }
  });
  it('records upstream failures without fake success', async () => {
    const spy = jest.spyOn(crm, 'worker').mockRejectedValue(new BadGatewayException('Fixture provider offline'));
    try {
      await request(app.getHttpServer()).post(`/api/workspaces/${w}/search`).send({niche:'software',city:'Failure fixture'}).expect(502);
      const row = await db.searchRun.findFirstOrThrow({where:{workspaceId:w,city:'Failure fixture'}});
      expect(row.status).toBe('FAILED'); expect(row.count).toBe(0);
    } finally {spy.mockRestore();}
  });
  it('rolls back a failed import transaction', async () => {
    const spy = jest.spyOn(crm, 'worker').mockResolvedValue({companies:[{name:'ROLLBACK FIXTURE',sourceId:'test:rollback',sourceUrl:'https://example.org',contacts:[]},{sourceId:'test:invalid',contacts:[]}]});
    try {
      await request(app.getHttpServer()).post(`/api/workspaces/${w}/search`).send({niche:'software',city:'Rollback fixture'}).expect(500);
      expect(await db.company.count({where:{workspaceId:w,sourceId:'test:rollback'}})).toBe(0);
    } finally {spy.mockRestore();}
  });
  it('cascades deleted company contacts', async () => {
    await request(app.getHttpServer()).delete(`/api/workspaces/${w}/companies/${company}`).expect(200);
    expect(await db.lead.count({where:{companyId:company}})).toBe(0);
  });
});
