import * as ImagePicker from 'expo-image-picker';
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

export interface ApplianceScanResult {
  applianceType: string;
  wattsDetected: number | null;
  confidence: 'high' | 'low';
  source: 'label' | 'estimate';
}

export interface BillScanResult {
  gridFeeVariableOrePerKwh: number | null;
  retailerMarkupOrePerKwh: number | null;
  confidence: 'high' | 'low';
}

export interface PickedImage {
  base64: string;
  mimeType: string;
}

const scanAppliancePhotoCallable = httpsCallable<{ imageBase64: string; mimeType: string }, ApplianceScanResult>(
  functions,
  'scanAppliancePhoto',
);

export async function scanAppliancePhoto(imageBase64: string, mimeType: string): Promise<ApplianceScanResult> {
  const result = await scanAppliancePhotoCallable({ imageBase64, mimeType });
  return result.data;
}

const scanElectricityBillCallable = httpsCallable<{ fileBase64: string; mimeType: string }, BillScanResult>(
  functions,
  'scanElectricityBill',
);

export async function scanElectricityBill(fileBase64: string, mimeType: string): Promise<BillScanResult> {
  const result = await scanElectricityBillCallable({ fileBase64, mimeType });
  return result.data;
}

/**
 * Launches the camera or photo library and returns the picked image as
 * base64 — never written to disk by this app, held only in memory until
 * handed to the scan callable. Returns null if permission was denied or
 * the user canceled, so callers can just check for null rather than
 * threading through separate "denied" vs. "canceled" states.
 */
export async function pickImage(source: 'camera' | 'library'): Promise<PickedImage | null> {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (!permission.granted) {
    return null;
  }

  const options: ImagePicker.ImagePickerOptions = { base64: true, quality: 0.6, mediaTypes: 'images' };
  const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);

  if (result.canceled || !result.assets[0]?.base64) {
    return null;
  }

  return { base64: result.assets[0].base64, mimeType: result.assets[0].mimeType ?? 'image/jpeg' };
}
