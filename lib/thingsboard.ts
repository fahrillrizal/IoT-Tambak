import axios from 'axios';

const TB_URL = process.env.TB_URL;

// Use a dedicated axios instance with baseURL + timeout so network failures fail fast in prod.
const tbApi = axios.create({
  baseURL: TB_URL,
  timeout: 8000,
});

class ThingsBoardService {
  private token: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiry: number = 0;

  async ensureAuthenticated() {
    if (this.token && this.tokenExpiry > Date.now()) {
      return this.token;
    }

    if (this.refreshToken) {
      try {
        await this.refresh();
        return this.token;
      } catch (error) {
        console.error('Token refresh failed, logging in again');
      }
    }

    await this.login();
    return this.token;
  }

  async login() {
    if (!TB_URL) {
      throw new Error('TB_URL not configured');
    }

    const response = await tbApi.post(`/api/auth/login`, {
      username: process.env.TB_USERNAME,
      password: process.env.TB_PASSWORD,
    });

    this.token = response.data.token;
    this.refreshToken = response.data.refreshToken;
    this.tokenExpiry = Date.now() + 55 * 60 * 1000;
  }

  async refresh() {
    const response = await tbApi.post(`/api/auth/token`, {
      refreshToken: this.refreshToken,
    });

    this.token = response.data.token;
    this.refreshToken = response.data.refreshToken;
    this.tokenExpiry = Date.now() + 55 * 60 * 1000;
  }

  async get<T = any>(endpoint: string): Promise<T> {
    await this.ensureAuthenticated();
    const response = await tbApi.get<T>(endpoint, {
      headers: { 'X-Authorization': `Bearer ${this.token}` },
    });
    return response.data;
  }

  async post<T = any>(endpoint: string, data: any): Promise<T> {
    await this.ensureAuthenticated();
    const response = await tbApi.post<T>(endpoint, data, {
      headers: { 'X-Authorization': `Bearer ${this.token}` },
    });
    return response.data;
  }

  async getDeviceTelemetry(deviceId: string, keys?: string[]) {
    const keysParam = keys ? `?keys=${keys.join(',')}` : '';
    return this.get(
      `/api/plugins/telemetry/DEVICE/${deviceId}/values/timeseries${keysParam}`
    );
  }

  async getTelemetryHistory(
    deviceId: string,
    keys: string[],
    startTs: number,
    endTs: number,
    limit = 100
  ) {
    const params = new URLSearchParams({
      keys: keys.join(','),
      startTs: startTs.toString(),
      endTs: endTs.toString(),
      limit: limit.toString(),
    });
    return this.get(
      `/api/plugins/telemetry/DEVICE/${deviceId}/values/timeseries?${params}`
    );
  }

  async getDeviceAlarms(
    deviceId: string,
    options?: {
      status?: 'ACTIVE' | 'CLEARED' | 'ACK';
      severity?: 'CRITICAL' | 'WARNING' | 'MAJOR' | 'MINOR';
      limit?: number;
    }
  ) {
    const params = new URLSearchParams();
    params.append('pageSize', (options?.limit || 10).toString());
    params.append('page', '0');
    if (options?.status) params.append('status', options.status);
    if (options?.severity) params.append('severity', options.severity);

    return this.get(
      `/api/alarm/DEVICE/${deviceId}?${params}`
    );
  }

  async acknowledgeAlarm(alarmId: string) {
    return this.post(`/api/alarm/${alarmId}/ack`, {});
  }

  async clearAlarm(alarmId: string) {
    return this.post(`/api/alarm/${alarmId}/clear`, {});
  }

  async sendRPCCommand(
    deviceId: string,
    method: string,
    params: any,
    timeout = 5000
  ) {
    return this.post(`/api/plugins/rpc/twoway/${deviceId}`, {
      method,
      params,
      timeout,
    });
  }

  async getDeviceInfo(deviceId: string) {
    return this.get(`/api/device/${deviceId}`);
  }

  async getDeviceCredentials(deviceId: string) {
    return this.get(`/api/device/${deviceId}/credentials`);
  }

  async getTenantDevices(pageSize = 100, page = 0) {
    return this.get(
      `/api/tenant/devices?pageSize=${pageSize}&page=${page}`
    );
  }

  async getDeviceAttributes(deviceId: string, keys?: string[]) {
    const keysParam = keys ? `?keys=${keys.join(',')}` : '';
    return this.get(
      `/api/plugins/telemetry/DEVICE/${deviceId}/values/attributes${keysParam}`
    );
  }

  // Helper: Hitung rata-rata dari array telemetry
  calculateDailyAverage(telemetryData: Record<string, any[]>) {
    const averages: Record<string, number> = {};
    
    for (const [key, values] of Object.entries(telemetryData)) {
      if (Array.isArray(values) && values.length > 0) {
        const sum = values.reduce((acc, item) => acc + parseFloat(item.value), 0);
        averages[key] = parseFloat((sum / values.length).toFixed(2));
      } else {
        averages[key] = 0;
      }
    }
    
    return averages;
  }
}

export const thingsboardService = new ThingsBoardService();