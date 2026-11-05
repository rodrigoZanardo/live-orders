import { Controller, Headers, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { LiveTickets } from '../application/live-tickets';
import { STAFF_ROLES } from '../domain/user';
import { ApiErrorResponse } from './api-error';
import { Roles } from './auth.guard';

@ApiTags('live')
@ApiBearerAuth()
@Roles(...STAFF_ROLES)
@Controller('live')
export class LiveController {
  constructor(private readonly tickets: LiveTickets) {}

  @Post('ticket')
  @ApiOperation({
    summary: 'Single-use ticket (30 s) to open the WebSocket at /live?ticket=<ticket>',
  })
  @ApiResponse({ status: 201, schema: { example: { ticket: 'q1w2e3...' } } })
  @ApiErrorResponse(401, 'Missing or expired token')
  @ApiErrorResponse(403, 'Customers cannot follow the board')
  async ticket(@Headers('authorization') authorization: string): Promise<{ ticket: string }> {
    // the AuthGuard already checked that this is "Bearer <valid token>"
    const token = authorization.split(' ')[1] ?? '';
    return { ticket: await this.tickets.issue(token) };
  }
}
