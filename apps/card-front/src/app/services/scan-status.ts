export interface ScanStatus {
    icon: string;
    text: string;
    params?: Record<string, string>;
    urgent?: boolean;
}

export type Sight = 'none' | 'steadying' | 'waiting' | 'manual';

export interface CameraState {
    ready: boolean;
    capturing: boolean;
    sight: Sight;
    notice?: ScanStatus;
}

const SEEN: Record<Exclude<Sight, 'none'>, ScanStatus> = {
    steadying: { icon: 'back_hand', text: 'scan.status.steadying' },
    waiting: { icon: 'flip', text: 'scan.status.waiting' },
    manual: { icon: 'touch_app', text: 'scan.status.manual' }
};

export function cameraStatus({ ready, capturing, sight, notice }: CameraState): ScanStatus {
    if (notice?.urgent) {
        return notice;
    }
    if (!ready) {
        return { icon: 'videocam', text: 'scan.status.starting' };
    }
    if (capturing) {
        return { icon: 'photo_camera', text: 'scan.status.taking' };
    }

    return sight === 'none' ? (notice ?? { icon: 'search', text: 'scan.status.looking' }) : SEEN[sight];
}
