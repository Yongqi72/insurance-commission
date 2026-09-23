import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { resolveCorsAllowedOrigins } from './common/utils/resolve-cors-allowed-origins.util';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: resolveCorsAllowedOrigins() });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  Logger.log(
    `Application is running on: http://localhost:${port}`,
    'Bootstrap',
  );
}
bootstrap();
