import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { DeliveryAddressDto } from './order.dto';
import { ROLES, STAFF_ROLES, type Role } from '../domain/user';

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
  @ApiProperty({ enum: STAFF_ROLES })
  @IsIn(STAFF_ROLES)
  role!: Role;
}

export class CustomerAddressDto extends DeliveryAddressDto {
  @ApiPropertyOptional({ example: 'apto 12' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  complement?: string;
}

export class RegisterDto extends LoginDto {
  @ApiProperty({ example: 'Ana Souza' })
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiProperty({ type: CustomerAddressDto })
  @ValidateNested()
  @Type(() => CustomerAddressDto)
  address!: CustomerAddressDto;
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
