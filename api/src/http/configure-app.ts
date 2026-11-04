import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppError } from '../domain/errors';

/** HTTP setup shared by main.ts and the HTTP tests: CORS, validation in the AppError format, Swagger at /docs. */
export function configureApp(app: INestApplication): void {
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) =>
        new AppError('INVALID_INPUT', {
          details: errors.flatMap((error) => Object.values(error.constraints ?? {})).join('; '),
        }),
    }),
  );
  const doc = new DocumentBuilder()
    .setTitle('Live Orders API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, doc));
}
