import QRCode from 'qrcode';

export async function generateQRCode(deviceId: string): Promise<string> {
  try {
    const qrDataUrl = await QRCode.toDataURL(deviceId, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      margin: 1,
      width: 300,
    });
    return qrDataUrl;
  } catch (error) {
    console.error('QR code generation error:', error);
    throw new Error('Failed to generate QR code');
  }
}

export async function generateQRCodeSVG(deviceId: string): Promise<string> {
  try {
    const qrSvg = await QRCode.toString(deviceId, {
      errorCorrectionLevel: 'H',
      type: 'svg',
      width: 300,
      margin: 1,
    });
    return qrSvg;
  } catch (error) {
    console.error('QR code generation error:', error);
    throw new Error('Failed to generate QR code');
  }
}
