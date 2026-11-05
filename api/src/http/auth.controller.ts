import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  CreateUserUseCase,
  ListUsersUseCase,
  LoginUseCase,
  RegisterCustomerUseCase,
} from '../application/auth.use-cases';
import type { User } from '../domain/user';
import { ApiErrorResponse } from './api-error';
import { CreateUserDto, LoginDto, LoginResponse, RegisterDto, UserResponse } from './auth.dto';
import { Public, Roles } from './auth.guard';

const toResponse = (user: User): UserResponse => ({
  id: user.id,
  email: user.email,
  role: user.role,
});

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly login: LoginUseCase,
    private readonly register: RegisterCustomerUseCase,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Sign in; returns a token for the Authorization header' })
  @ApiResponse({ status: 200, type: LoginResponse })
  @ApiErrorResponse(400, 'Invalid input')
  @ApiErrorResponse(401, 'Wrong email or password')
  @ApiErrorResponse(429, 'Account locked after too many failed sign-ins')
  signIn(@Body() body: LoginDto): Promise<LoginResponse> {
    return this.login.execute(body.email, body.password);
  }

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Customer sign-up with a delivery address; returns a token like login' })
  @ApiResponse({ status: 201, type: LoginResponse })
  @ApiErrorResponse(
    400,
    'Invalid email, short password, email taken, invalid name, CEP or address, or invalid input',
  )
  signUp(@Body() body: RegisterDto): Promise<LoginResponse> {
    const { name, address, email, password } = body;
    return this.register.execute({
      email,
      password,
      profile: { name, address: { ...address, complement: address.complement ?? null } },
    });
  }
}

@ApiTags('users')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('users')
export class UsersController {
  constructor(
    private readonly createUser: CreateUserUseCase,
    private readonly listUsers: ListUsersUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List users by email (admin)' })
  @ApiResponse({ status: 200, type: [UserResponse] })
  @ApiErrorResponse(401, 'Missing or expired token')
  @ApiErrorResponse(403, 'Not an admin')
  async list(): Promise<UserResponse[]> {
    return (await this.listUsers.execute()).map(toResponse);
  }

  @Post()
  @ApiOperation({ summary: 'Create a user (admin)' })
  @ApiResponse({ status: 201, type: UserResponse })
  @ApiErrorResponse(400, 'Invalid email, short password, email taken or invalid input')
  @ApiErrorResponse(401, 'Missing or expired token')
  @ApiErrorResponse(403, 'Not an admin')
  async create(@Body() body: CreateUserDto): Promise<UserResponse> {
    return toResponse(await this.createUser.execute(body));
  }
}
