import { Module, Injectable, OnModuleDestroy, Controller, Get, Post, Body, Param, Req, UseGuards, ForbiddenException, UnauthorizedException, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import * as bcrypt from 'bcryptjs';
import { IsEmail, IsString, MinLength, MaxLength, IsIn, IsInt, Min, Max, IsOptional, IsNumber } from 'class-validator';

type Role = 'admin' | 'inspector' | 'analyst' | 'operator';
type Principal = { sub: string; role: Role };
type RequestWithUser = { headers: { authorization?: string }; user: Principal };

@Injectable()
class Database implements OnModuleDestroy {
  readonly pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
  query(text: string, values: unknown[] = []) { return this.pool.query(text, values); }
  async transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally { client.release(); }
  }
  async onModuleDestroy() { await this.pool.end(); }
}
class LoginDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(1) password!: string;
}
class CreateStationDto {
  @IsString() @MinLength(2) @MaxLength(160) name!: string;
  @IsString() @MinLength(2) @MaxLength(100) district!: string;
  @IsOptional() @IsNumber() @Min(-90) @Max(90) latitude?: number;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) longitude?: number;
}
class ReportDto {
  @IsInt() @Min(1) stationId!: number;
  @IsIn(['petrol', 'diesel']) fuel!: 'petrol' | 'diesel';
  @IsInt() @Min(500) @Max(50000) price!: number;
  @IsOptional() @IsString() @MaxLength(200) location?: string;
}
class ReviewDto {
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

@Injectable()
class AuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService, private readonly db: Database) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithUser>();
    const token = /^Bearer (.+)$/.exec(req.headers.authorization || '')?.[1];
    if (!token) throw new UnauthorizedException();
    try {
      const claims = await this.jwt.verifyAsync<Principal>(token);
      if (!claims.sub || !claims.role) throw new Error('Invalid claims');
      const user = await this.db.query('SELECT id, role, active FROM app_users WHERE id=$1', [claims.sub]);
      if (!user.rowCount || !user.rows[0].active || user.rows[0].role !== claims.role) throw new Error('Account inactive');
      req.user = { sub: String(user.rows[0].id), role: user.rows[0].role };
      return true;
    } catch (_) { throw new UnauthorizedException(); }
  }
}

function requireRole(user: Principal, roles: Role[]) {
  if (!roles.includes(user.role)) throw new ForbiddenException('Insufficient privileges');
}

@Controller()
class HealthController {
  constructor(private readonly db: Database) {}
  @Get('health')
  async health() { await this.db.query('SELECT 1'); return { status: 'ok', service: 'mafuta-api' }; }
}

@Controller('auth')
class AuthController {
  constructor(private readonly db: Database, private readonly jwt: JwtService) {}
  @Post('login')
  async login(@Body() body: LoginDto) {
    const email = body.email.trim().toLowerCase();
    const result = await this.db.query('SELECT id, email, password_hash, role, active FROM app_users WHERE email=$1', [email]);
    // Equal-cost dummy comparison limits differences between unknown and known email responses.
    const dummy = '$2a$12$uJ0H1Jku3C.ZD7XQyZk9iuG1c0BKYK4o5U.c/DElQkMqyqArLQL/2';
    const candidate = result.rows[0];
    const matches = await bcrypt.compare(body.password, candidate?.password_hash || dummy);
    if (!candidate || !candidate.active || !matches) throw new UnauthorizedException('Invalid credentials');
    const accessToken = await this.jwt.signAsync({ sub: String(candidate.id), role: candidate.role });
    return { accessToken, tokenType: 'Bearer', expiresInSeconds: 7200, user: { id: String(candidate.id), email: candidate.email, role: candidate.role } };
  }
}

@Controller('stations')
class StationsController {
  constructor(private readonly db: Database) {}
  @Get()
  async list() {
    const result = await this.db.query(`
      SELECT s.id,s.name,s.district,s.latitude,s.longitude,
        MAX(CASE WHEN v.fuel_type='petrol' THEN v.price END)::int AS petrol,
        MAX(CASE WHEN v.fuel_type='diesel' THEN v.price END)::int AS diesel
      FROM stations s LEFT JOIN verified_prices v ON v.station_id=s.id
      WHERE s.active=TRUE
      GROUP BY s.id ORDER BY s.id LIMIT 1000`);
    return { data: result.rows, source: 'server_verified_only' };
  }
  @UseGuards(AuthGuard) @Post()
  async create(@Req() req: RequestWithUser, @Body() body: CreateStationDto) {
    requireRole(req.user, ['admin']);
    const result = await this.db.query(
      'INSERT INTO stations(name,district,latitude,longitude) VALUES($1,$2,$3,$4) RETURNING id,name,district,latitude,longitude',
      [body.name.trim(), body.district.trim(), body.latitude ?? null, body.longitude ?? null]
    );
    await this.db.query("INSERT INTO audit_events(actor_id,action,target_type,target_id) VALUES($1,'station.create','station',$2)",
      [req.user.sub, String(result.rows[0].id)]);
    return result.rows[0];
  }
}

@Controller('reports')
class ReportsController {
  constructor(private readonly db: Database) {}
  @Post()
  async submit(@Body() body: ReportDto) {
    const station = await this.db.query('SELECT 1 FROM stations WHERE id=$1 AND active=TRUE', [body.stationId]);
    if (!station.rowCount) throw new NotFoundException('Station does not exist in the verified directory');
    const result = await this.db.query(
      "INSERT INTO price_reports(station_id,fuel_type,reported_price,reported_location) VALUES($1,$2,$3,$4) RETURNING id,status,created_at",
      [body.stationId, body.fuel, body.price, body.location || null]
    );
    return { id: String(result.rows[0].id), status: 'pending', createdAt: result.rows[0].created_at, message: 'Submitted for independent verification; price is not published yet' };
  }
}

@Controller('admin/reports')
@UseGuards(AuthGuard)
class ModerationController {
  constructor(private readonly db: Database) {}
  @Get()
  async pending(@Req() req: RequestWithUser) {
    requireRole(req.user, ['admin','inspector','analyst']);
    const result = await this.db.query(
      `SELECT r.id,r.station_id,r.fuel_type,r.reported_price,r.reported_location,r.created_at,r.status,s.name AS station_name
       FROM price_reports r JOIN stations s ON s.id=r.station_id
       WHERE r.status='pending' ORDER BY r.created_at LIMIT 100`);
    return { data: result.rows };
  }
  @Post(':id/verify')
  async verify(@Req() req: RequestWithUser, @Param('id') id: string) {
    requireRole(req.user, ['admin', 'inspector']);
    if (!/^\d+$/.test(id)) throw new BadRequestException('Invalid report id');
    return this.db.transaction(async client => {
      const result = await client.query("SELECT * FROM price_reports WHERE id=$1 FOR UPDATE", [id]);
      if (!result.rowCount) throw new NotFoundException();
      const report = result.rows[0];
      if (report.status !== 'pending') throw new ConflictException('Report already reviewed');
      await client.query("UPDATE price_reports SET status='verified', reviewed_by=$2, reviewed_at=now() WHERE id=$1", [id, req.user.sub]);
      await client.query(`
        INSERT INTO verified_prices(station_id,fuel_type,price,source_report_id,verified_by)
        VALUES($1,$2,$3,$4,$5)
        ON CONFLICT (station_id,fuel_type) DO UPDATE SET price=EXCLUDED.price,
          source_report_id=EXCLUDED.source_report_id,verified_by=EXCLUDED.verified_by,verified_at=now()`,
        [report.station_id,report.fuel_type,report.reported_price,id,req.user.sub]);
      await client.query("INSERT INTO audit_events(actor_id,action,target_type,target_id) VALUES($1,'report.verify','price_report',$2)", [req.user.sub,id]);
      return { id, status: 'verified' };
    });
  }
  @Post(':id/reject')
  async reject(@Req() req: RequestWithUser, @Param('id') id: string, @Body() body: ReviewDto) {
    requireRole(req.user, ['admin', 'inspector']);
    if (!/^\d+$/.test(id)) throw new BadRequestException('Invalid report id');
    return this.db.transaction(async client => {
      const row = await client.query(
        "UPDATE price_reports SET status='rejected',review_reason=$2,reviewed_by=$3,reviewed_at=now() WHERE id=$1 AND status='pending' RETURNING id",
        [id,body.reason || null,req.user.sub]);
      if (!row.rowCount) throw new ConflictException('Report does not exist or is already reviewed');
      await client.query("INSERT INTO audit_events(actor_id,action,target_type,target_id) VALUES($1,'report.reject','price_report',$2)", [req.user.sub,id]);
      return { id, status: 'rejected' };
    });
  }
}

@Module({
  imports: [JwtModule.register({ secret: process.env.JWT_SECRET, signOptions: { expiresIn: '2h', algorithm: 'HS256' } })],
  controllers: [HealthController, AuthController, StationsController, ReportsController, ModerationController],
  providers: [Database, AuthGuard]
})
export class AppModule {}
