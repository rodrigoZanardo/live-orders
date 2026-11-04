import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength } from 'class-validator';
import { ROLES, type Role } from '../domain/user';

export class LoginDto {
  @ApiProperty({ example: 'demo@example.com' })
  @IsString()
  @MaxLength(200)
  email!: string;

  @ApiProperty({ example: 'demo-orders-2026' })
  @IsString()
  @MaxLength(200)
  password!: string;
}

export class CreateUserDto extends LoginDto {
  @ApiProperty({ enum: ROLES })
  @IsIn(ROLES)
  role!: Role;
}

export class UserResponse {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ enum: ROLES }) role!: Role;
}

export class LoginResponse {
  @ApiProperty() token!: string;
  @ApiProperty({ type: UserResponse }) user!: UserResponse;
}
