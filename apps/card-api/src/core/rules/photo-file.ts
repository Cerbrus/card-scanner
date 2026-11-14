const JPEG_START = [0xff, 0xd8, 0xff];

export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
export const MAX_THUMB_BYTES = 512 * 1024;

export function isJpeg(data: Buffer): boolean {
    return data.length > JPEG_START.length && JPEG_START.every((byte, index) => data[index] === byte);
}

export function photoFileName(ownedCardId: number, side: string, thumb: boolean): string {
    return `${ownedCardId}-${side}${thumb ? '-thumb' : ''}.jpg`;
}
