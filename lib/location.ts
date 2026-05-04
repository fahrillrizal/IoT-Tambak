import axios from 'axios';

const BASE_URL = 'https://www.emsifa.com/api-wilayah-indonesia/api';

export interface Province {
  id: string;
  name: string;
}

export interface City {
  id: string;
  id_provinsi: string;
  name: string;
}

/**
 * Fetch all provinces from emsifa API
 */
export async function getProvinces(): Promise<Province[]> {
  try {
    const response = await axios.get<Province[]>(`${BASE_URL}/provinces.json`);
    return response.data;
  } catch (error) {
    console.error('Error fetching provinces:', error);
    throw new Error('Failed to fetch provinces');
  }
}

/**
 * Fetch cities/regencies by province ID
 */
export async function getCitiesByProvince(provinceId: string): Promise<City[]> {
  try {
    const response = await axios.get<City[]>(`${BASE_URL}/regencies/${provinceId}.json`);
    return response.data;
  } catch (error) {
    console.error('Error fetching cities:', error);
    throw new Error('Failed to fetch cities/regencies');
  }
}

/**
 * Get province name by ID
 */
export async function getProvinceName(provinceId: string): Promise<string | null> {
  try {
    const provinces = await getProvinces();
    const province = provinces.find(p => p.id === provinceId);
    return province?.name || null;
  } catch (error) {
    console.error('Error fetching province name:', error);
    return null;
  }
}

/**
 * Get city name by ID
 */
export async function getCityName(provinceId: string, cityId: string): Promise<string | null> {
  try {
    const cities = await getCitiesByProvince(provinceId);
    const city = cities.find(c => c.id === cityId);
    return city?.name || null;
  } catch (error) {
    console.error('Error fetching city name:', error);
    return null;
  }
}
