import {
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login.dto';

/**
 * V0 走骨架：单一管理员账号，账号名 + 密码 bcrypt 哈希写入环境变量种子配置
 * （BE-SEC-01：凭证禁止明文存储），非开放注册。密码校验通过后签发 JWT。
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(dto: LoginDto): Promise<{ accessToken: string }> {
    const adminUsername = this.configService.get<string>('ADMIN_USERNAME');
    const adminPasswordHash = this.configService.get<string>(
      'ADMIN_PASSWORD_HASH',
    );

    if (!adminUsername || !adminPasswordHash) {
      this.logger.error(
        '管理员账号未在环境变量中配置（ADMIN_USERNAME / ADMIN_PASSWORD_HASH）',
      );
      throw new InternalServerErrorException('管理员账号未配置');
    }

    if (dto.username !== adminUsername) {
      throw new UnauthorizedException('账号或密码错误');
    }

    const matched = await bcrypt.compare(dto.password, adminPasswordHash);
    if (!matched) {
      throw new UnauthorizedException('账号或密码错误');
    }

    const accessToken = await this.jwtService.signAsync({
      sub: adminUsername,
      username: adminUsername,
    });

    return { accessToken };
  }
}
