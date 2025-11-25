import axios from 'axios';

const TB_URL = process.env.TB_URL;

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
    const response = await axios.post(`${TB_URL}/api/auth/login`, {
      username: process.env.TB_USERNAME,
      password: process.env.TB_PASSWORD,
    });

    this.token = response.data.token;
    this.refreshToken = response.data.refreshToken;
    this.tokenExpiry = Date.now() + 55 * 60 * 1000; // 55 minutes
  }

  async refresh() {
    const response = await axios.post(`${TB_URL}/api/auth/token`, {
      refreshToken: this.refreshToken,
    });

    this.token = response.data.token;
    this.refreshToken = response.data.refreshToken;
    this.tokenExpiry = Date.now() + 55 * 60 * 1000;
  }

  async get(endpoint: string) {
    await this.ensureAuthenticated();
    const response = await axios.get(`${TB_URL}${endpoint}`, {
      headers: { 'X-Authorization': `Bearer ${this.token}` },
    });
    return response.data;
  }

  async post(endpoint: string, data: any) {
    await this.ensureAuthenticated();
    const response = await axios.post(`${TB_URL}${endpoint}`, data, {
      headers: { 'X-Authorization': `Bearer ${this.token}` },
    });
    return response.data;
  }

  async getDeviceTelemetry(deviceId: string, keys?: string[]) {
    const keysParam = keys ? `?keys=${keys.join(',')}` : '';
    return this.get(`/api/plugins/telemetry/DEVICE/${deviceId}/values/timeseries${keysParam}`);
  }

  async sendRPCCommand(deviceId: string, method: string, params: any, timeout = 5000) {
    return this.post(`/api/plugins/rpc/twoway/${deviceId}`, {
      method,
      params,
      timeout,
    });
  }
}

export const thingsboardService = new ThingsBoardService();