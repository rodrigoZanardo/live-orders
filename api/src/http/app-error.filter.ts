import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { AppError, type ErrorKind } from '../domain/errors';

const STATUS: Record<ErrorKind, HttpStatus> = {
  rule: HttpStatus.BAD_REQUEST,
  not_found: HttpStatus.NOT_FOUND,
  unauthorized: HttpStatus.UNAUTHORIZED,
  forbidden: HttpStatus.FORBIDDEN,
  conflict: HttpStatus.CONFLICT,
  too_many: HttpStatus.TOO_MANY_REQUESTS,
};

type JsonResponse = { status(code: number): { json(body: unknown): void } };

/** Global: turns any AppError into `{ statusCode, code, message, params }`. Other errors keep Nest's default handling. */
@Catch(AppError)
export class AppErrorFilter implements ExceptionFilter {
  catch(error: AppError, host: ArgumentsHost): void {
    const statusCode = STATUS[error.kind];
    host
      .switchToHttp()
      .getResponse<JsonResponse>()
      .status(statusCode)
      .json({ statusCode, code: error.code, message: error.message, params: error.params });
  }
}
