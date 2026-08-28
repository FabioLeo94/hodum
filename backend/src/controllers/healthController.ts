import { Controller, Get, Route } from 'tsoa';

interface HealthStatus {
  status: 'ok';
  uptime: number;
  timestamp: string;
}

// Il path va scritto come stringa letterale: tsoa lo legge dall'AST prima
// dell'avvio, una costante importata non verrebbe risolta in generazione.
@Route('health')
export class HealthController extends Controller {
  @Get()
  public getHealth(): HealthStatus {
    return {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}
