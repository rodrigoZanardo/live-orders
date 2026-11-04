import { ApiProperty, ApiResponse } from '@nestjs/swagger';

/** The body of every error the API returns (see AppErrorFilter). `code` is what clients translate. */
export class ErrorResponse {
  @ApiProperty({ example: 400 }) statusCode!: number;
  @ApiProperty({ example: 'STATUS_MOVE_INVALID' }) code!: string;
  @ApiProperty({ example: 'An order cannot move from READY to CANCELLED.' }) message!: string;
  @ApiProperty({ type: Object, example: { from: 'READY', to: 'CANCELLED' } })
  params!: Record<string, string | number>;
}

/** One documented error response for a status code; the body is always ErrorResponse. */
export const ApiErrorResponse = (status: number, description: string) =>
  ApiResponse({ status, description, type: ErrorResponse });
