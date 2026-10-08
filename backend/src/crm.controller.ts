import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CrmService } from './crm.service';
import { CompanyDto, CompanyPatchDto, LeadDto, PageDto, SearchDto, WorkspaceDto } from './dto';

@Controller('api')
export class CrmController {
  constructor(private readonly crm: CrmService) {}
  @Get('health') health() { return this.crm.health(); }
  @Get('niches') niches() { return this.crm.worker('/niches'); }
  @Get('workspaces') workspaces() { return this.crm.workspaces(); }
  @Get('workspaces/:w') workspace(@Param('w') w: string) { return this.crm.getWorkspace(w); }
  @Delete('workspaces/:w') deleteWorkspace(@Param('w') w: string) { return this.crm.deleteWorkspace(w); }
  @Post('workspaces') createWorkspace(@Body() data: WorkspaceDto) { return this.crm.createWorkspace(data); }
  @Patch('workspaces/:w') renameWorkspace(@Param('w') w: string, @Body() data: WorkspaceDto) { return this.crm.renameWorkspace(w, data); }
  @Get('workspaces/:w/companies') companies(@Param('w') w: string, @Query() page: PageDto) { return this.crm.companies(w, page); }
  @Post('workspaces/:w/companies') createCompany(@Param('w') w: string, @Body() data: CompanyDto) { return this.crm.createCompany(w, data); }
  @Get('workspaces/:w/companies/:id') company(@Param('w') w: string, @Param('id') id: string) { return this.crm.company(w, id); }
  @Patch('workspaces/:w/companies/:id') updateCompany(@Param('w') w: string, @Param('id') id: string, @Body() data: CompanyPatchDto) { return this.crm.updateCompany(w, id, data); }
  @Delete('workspaces/:w/companies/:id') deleteCompany(@Param('w') w: string, @Param('id') id: string) { return this.crm.deleteCompany(w, id); }
  @Get('workspaces/:w/leads') leads(@Param('w') w: string, @Query() page: PageDto) { return this.crm.leads(w, page); }
  @Post('workspaces/:w/companies/:id/leads') createLead(@Param('w') w: string, @Param('id') id: string, @Body() data: LeadDto) { return this.crm.createLead(w, id, data); }
  @Patch('workspaces/:w/leads/:id') updateLead(@Param('w') w: string, @Param('id') id: string, @Body() data: LeadDto) { return this.crm.updateLead(w, id, data); }
  @Delete('workspaces/:w/leads/:id') deleteLead(@Param('w') w: string, @Param('id') id: string) { return this.crm.deleteLead(w, id); }
  @Post('workspaces/:w/search') search(@Param('w') w: string, @Body() data: SearchDto) { return this.crm.search(w, data); }
  @Get('workspaces/:w/searches') searches(@Param('w') w: string) { return this.crm.searches(w); }
  @Post('workspaces/:w/companies/:id/enrich') enrich(@Param('w') w: string, @Param('id') id: string) { return this.crm.enrich(w, id); }
}
