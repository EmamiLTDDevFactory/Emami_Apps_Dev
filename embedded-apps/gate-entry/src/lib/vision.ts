/**
 * Vehicle number from a photo. The photo goes to the Emami Apps server on 172.17.2.21 (the SAP Agent server,
 * reached through the existing audit-capa-api host), which holds the Anthropic key and asks Claude to read the
 * plate twice; the browser never sees the key. Signed with the hub session token, like the other hub servers.
 */
const HUB_TOKEN_KEY = 'emami_apps_session_token';

function apiBase(): string {
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:4130';
  return `https://audit-capa-api.emamiapps.in${host.includes('dev') ? '/dev-api/sap-agent' : '/api/sap-agent'}`;
}

export interface PlateReading {
  plate: string;
  confidence: 'high' | 'medium' | 'low';
  valid: boolean;
  candidates: string[];
  source: string;
  notes: string;
  agreed: boolean;
}

/** Claude reads images up to ~1568 px on the long edge; larger only costs upload time. EXIF rotation is applied. */
export async function shrinkPhoto(file: File, maxEdge = 1568): Promise<{ data: string; preview: string }> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
  } catch {
    throw new Error('This photo format cannot be read here. Take the photo again or use a JPEG/PNG.');
  }
  const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close?.();
  const url = canvas.toDataURL('image/jpeg', 0.9);
  return { data: url.split(',', 2)[1], preview: url };
}

export async function readVehicleNumber(base64Jpeg: string): Promise<PlateReading> {
  let token = '';
  try {
    token = localStorage.getItem(HUB_TOKEN_KEY) || '';
  } catch {
    /* ignore */
  }
  let res: Response;
  try {
    res = await fetch(`${apiBase()}/api/vision/vehicle-number`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ image: base64Jpeg, mediaType: 'image/jpeg' }),
    });
  } catch {
    throw new Error('The photo reader cannot be reached. Type the vehicle number instead.');
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error((body && typeof body.detail === 'string' && body.detail) || `Photo reader failed (${res.status})`);
  return body as PlateReading;
}
