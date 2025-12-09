import axios, { AxiosError } from "axios";

const TB_URL = process.env.TB_URL;

const tbApi = axios.create({
  baseURL: TB_URL,
  timeout: 10000,
});

interface TBDeviceResponse {
  id: {
    entityType: string;
    id: string;
  };
  name: string;
  type: string;
  label: string;
  deviceProfileId?: {
    entityType: string;
    id: string;
  };
  createdTime: number;
}

interface TBDeviceCredentials {
  id: {
    id: string;
  };
  deviceId: {
    entityType: string;
    id: string;
  };
  credentialsType: string;
  credentialsId: string;
}

interface TBDeviceProfile {
  id: {
    entityType: string;
    id: string;
  };
  name: string;
  type: string;
  default: boolean;
}

class ThingsBoardService {
  private token: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiry: number = 0;
  private defaultDeviceProfileId: string | null = null;

  async ensureAuthenticated() {
    if (this.token && this.tokenExpiry > Date.now()) {
      return this.token;
    }

    if (this.refreshToken) {
      try {
        await this.refresh();
        return this.token;
      } catch (error) {
        console.error("Token refresh failed, logging in again");
      }
    }

    await this.login();
    return this.token;
  }

  async login() {
    if (!TB_URL) {
      throw new Error("TB_URL not configured");
    }

    const response = await tbApi.post("/api/auth/login", {
      username: process.env.TB_USERNAME,
      password: process.env.TB_PASSWORD,
    });

    this.token = response.data.token;
    this.refreshToken = response.data.refreshToken;
    this.tokenExpiry = Date.now() + 55 * 60 * 1000;
  }

  async refresh() {
    const response = await tbApi.post("/api/auth/token", {
      refreshToken: this.refreshToken,
    });

    this.token = response.data.token;
    this.refreshToken = response.data.refreshToken;
    this.tokenExpiry = Date.now() + 55 * 60 * 1000;
  }

  async get<T = any>(endpoint: string): Promise<T> {
    await this.ensureAuthenticated();
    const response = await tbApi.get<T>(endpoint, {
      headers: { "X-Authorization": `Bearer ${this.token}` },
    });
    return response.data;
  }

  async post<T = any>(endpoint: string, data: any): Promise<T> {
    await this.ensureAuthenticated();
    try {
      const response = await tbApi.post<T>(endpoint, data, {
        headers: { "X-Authorization": `Bearer ${this.token}` },
      });
      return response.data;
    } catch (error) {
      if (error instanceof AxiosError) {
        console.error("ThingsBoard API Error:", {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          endpoint,
          requestData: data,
        });
        throw new Error(
          `ThingsBoard API Error: ${error.response?.data?.message || error.message}`
        );
      }
      throw error;
    }
  }

  async delete<T = any>(endpoint: string): Promise<T> {
    await this.ensureAuthenticated();
    const response = await tbApi.delete<T>(endpoint, {
      headers: { "X-Authorization": `Bearer ${this.token}` },
    });
    return response.data;
  }

  async getOrCreateDeviceProfile(
    profileName: string = "IoT Tambak Sensor"
  ): Promise<string> {
    if (this.defaultDeviceProfileId) {
      return this.defaultDeviceProfileId;
    }

    try {
      const profiles = await this.get<{ data: TBDeviceProfile[] }>(
        "/api/deviceProfiles?pageSize=100&page=0"
      );

      const existingProfile = profiles.data.find(
        (p) => p.name === profileName || p.default
      );

      if (existingProfile) {
        this.defaultDeviceProfileId = existingProfile.id.id;
        return this.defaultDeviceProfileId;
      }

      const newProfile = await this.post<TBDeviceProfile>(
        "/api/deviceProfile",
        {
          name: profileName,
          type: "DEFAULT",
          transportType: "DEFAULT",
          provisionType: "DISABLED",
          description: "Device profile for IoT Tambak monitoring system",
          profileData: {
            configuration: {
              type: "DEFAULT",
            },
            transportConfiguration: {
              type: "DEFAULT",
            },
          },
        }
      );

      this.defaultDeviceProfileId = newProfile.id.id;
      return this.defaultDeviceProfileId;
    } catch (error) {
      console.error("Failed to get/create device profile:", error);
      throw error;
    }
  }

  async createDevice(
    name: string,
    type: string = "default",
    label?: string
  ): Promise<TBDeviceResponse> {
    const deviceProfileId = await this.getOrCreateDeviceProfile();

    const deviceData = {
      name,
      type,
      label: label || name,
      deviceProfileId: {
        entityType: "DEVICE_PROFILE",
        id: deviceProfileId,
      },
    };

    console.log(
      "Creating device with data:",
      JSON.stringify(deviceData, null, 2)
    );

    return this.post<TBDeviceResponse>("/api/device", deviceData);
  }

  async getDeviceCredentials(deviceId: string): Promise<TBDeviceCredentials> {
    return this.get<TBDeviceCredentials>(`/api/device/${deviceId}/credentials`);
  }

  async getDeviceAccessToken(deviceId: string): Promise<string> {
    const credentials = await this.getDeviceCredentials(deviceId);
    return credentials.credentialsId;
  }

  async deleteDevice(deviceId: string): Promise<void> {
    await this.delete(`/api/device/${deviceId}`);
  }

  async findDeviceByName(deviceName: string): Promise<TBDeviceResponse | null> {
    try {
      const devices = await this.get<{ data: TBDeviceResponse[] }>(
        `/api/tenant/devices?pageSize=100&page=0&textSearch=${encodeURIComponent(deviceName)}`
      );

      return devices.data.find((d) => d.name === deviceName) || null;
    } catch (error) {
      console.error("Error finding device:", error);
      return null;
    }
  }

  async getDeviceTelemetry(deviceId: string, keys?: string[]) {
    const keysParam = keys ? `?keys=${keys.join(",")}` : "";
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
      keys: keys.join(","),
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
      status?: "ACTIVE" | "CLEARED" | "ACK";
      severity?: "CRITICAL" | "WARNING" | "MAJOR" | "MINOR";
      limit?: number;
    }
  ) {
    const params = new URLSearchParams();
    params.append("pageSize", (options?.limit || 10).toString());
    params.append("page", "0");
    if (options?.status) params.append("status", options.status);
    if (options?.severity) params.append("severity", options.severity);

    return this.get(`/api/alarm/DEVICE/${deviceId}?${params}`);
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

  async getTenantDevices(pageSize = 100, page = 0) {
    return this.get(`/api/tenant/devices?pageSize=${pageSize}&page=${page}`);
  }

  async getDeviceAttributes(deviceId: string, keys?: string[]) {
    const keysParam = keys ? `?keys=${keys.join(",")}` : "";
    return this.get(
      `/api/plugins/telemetry/DEVICE/${deviceId}/values/attributes${keysParam}`
    );
  }

  async saveDeviceAttributes(
    deviceId: string,
    attributes: Record<string, any>
  ) {
    return this.post(
      `/api/plugins/telemetry/DEVICE/${deviceId}/attributes/SERVER_SCOPE`,
      attributes
    );
  }

  calculateDailyAverage(telemetryData: Record<string, any[]>) {
    const averages: Record<string, number> = {};

    for (const [key, values] of Object.entries(telemetryData)) {
      if (Array.isArray(values) && values.length > 0) {
        const sum = values.reduce(
          (acc, item) => acc + parseFloat(item.value),
          0
        );
        averages[key] = parseFloat((sum / values.length).toFixed(2));
      } else {
        averages[key] = 0;
      }
    }

    return averages;
  }
}

export const thingsboardService = new ThingsBoardService();
