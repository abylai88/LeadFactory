import { IsEmail, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, Max, MaxLength, Min } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { LeadStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';

export class WorkspaceDto {
  @IsString() @IsNotEmpty() @MaxLength(120) @Transform(({value}) => typeof value === 'string' ? value.trim() : value) name: string;
}
export class CompanyDto {
  @IsString() @IsNotEmpty() @MaxLength(250) @Transform(({value}) => typeof value === 'string' ? value.trim() : value) name: string;
  @IsOptional() @IsUrl({ protocols: ['http','https'], require_protocol: true }) @MaxLength(2000) website?: string;
  @IsOptional() @IsString() @MaxLength(120) industry?: string;
  @IsOptional() @IsString() @MaxLength(120) city?: string;
  @IsOptional() @IsString() @MaxLength(120) country?: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
}
export class CompanyPatchDto extends PartialType(CompanyDto) {}
export class LeadDto {
  @IsOptional() @IsString() @MaxLength(120) firstName?: string;
  @IsOptional() @IsString() @MaxLength(120) lastName?: string;
  @IsOptional() @IsEmail() @MaxLength(320) email?: string;
  @IsOptional() @IsString() @MaxLength(80) phone?: string;
  @IsOptional() @IsString() @MaxLength(150) jobTitle?: string;
  @IsOptional() @IsUrl({ protocols: ['http','https'], require_protocol: true }) @MaxLength(2000) source?: string;
  @IsOptional() @IsEnum(LeadStatus) status?: LeadStatus;
}
export class SearchDto {
  @IsString() @IsNotEmpty() @MaxLength(100) @Transform(({value}) => typeof value === 'string' ? value.trim() : value) niche: string;
  @IsString() @IsNotEmpty() @MaxLength(150) @Transform(({value}) => typeof value === 'string' ? value.trim() : value) city: string;
  @IsOptional() @IsInt() @Min(1) @Max(50) limit: number = 20;
}
export class PageDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit: number = 50;
  @IsOptional() @IsString() @MaxLength(200) q?: string;
  @IsOptional() @IsEnum(LeadStatus) status?: LeadStatus;
}
