import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

@Catch(Prisma.PrismaClientKnownRequestError)
export class DatabaseFilter implements ExceptionFilter {
  catch(error: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const status = error.code === 'P2025' ? 404 : ['P2002', 'P2003'].includes(error.code) ? 409 : 500;
    host.switchToHttp().getResponse<Response>().status(status).json({ statusCode: status,
      message: status === 404 ? 'Record not found' : status === 409 ? 'Record conflicts with existing data' : 'Database operation failed' });
  }
}
