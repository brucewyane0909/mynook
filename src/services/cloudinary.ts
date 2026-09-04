/**
 * Cloudinary unsigned browser upload service for MYNOOK book covers
 * Cloud Name: cg8fmgjr
 * Upload Preset: mynook_covers
 * Endpoint: https://api.cloudinary.com/v1_1/cg8fmgjr/image/upload
 */

const CLOUDINARY_UPLOAD_URL = 'https://api.cloudinary.com/v1_1/cg8fmgjr/image/upload';
const UPLOAD_PRESET = 'mynook_covers';

/**
 * Uploads an image file directly to Cloudinary using an unsigned upload preset.
 * Returns the secure_url string to be saved directly to Firestore.
 */
export async function uploadCoverToCloudinary(file: File): Promise<string> {
  // Validate file type
  if (!file.type.startsWith('image/')) {
    throw new Error('Please select a valid image file (PNG, JPG, WebP, etc.)');
  }

  // Max 20MB
  if (file.size > 20 * 1024 * 1024) {
    throw new Error('Image size must be less than 20MB.');
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', UPLOAD_PRESET);

  const response = await fetch(CLOUDINARY_UPLOAD_URL, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = errorData?.error?.message || `Upload failed with status ${response.status}`;
    throw new Error(message);
  }

  const data = await response.json();
  const imageUrl: string = data.secure_url;

  if (!imageUrl) {
    throw new Error('Cloudinary did not return a secure image URL.');
  }

  return imageUrl;
}
