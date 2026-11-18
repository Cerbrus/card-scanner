import { ScanStatus, cameraStatus } from './scan-status';

describe('the one line that says what the scanner waits for', () => {
    const reading: ScanStatus = { icon: 'hourglass_top', text: 'scan.read.busy' };
    const saving: ScanStatus = { icon: 'hourglass_top', text: 'scan.saving', urgent: true };

    it('says the camera is starting, then that it looks for a card', () => {
        expect(cameraStatus({ ready: false, capturing: false, sight: 'none' }).text).toBe('scan.status.starting');
        expect(cameraStatus({ ready: true, capturing: false, sight: 'none' }).text).toBe('scan.status.looking');
    });

    it('says what a card in view still needs: holding still, another side, or a press on the button', () => {
        expect(cameraStatus({ ready: true, capturing: false, sight: 'steadying' }).text).toBe('scan.status.steadying');
        expect(cameraStatus({ ready: true, capturing: false, sight: 'waiting' }).text).toBe('scan.status.waiting');
        expect(cameraStatus({ ready: true, capturing: false, sight: 'manual' }).text).toBe('scan.status.manual');
        expect(cameraStatus({ ready: true, capturing: true, sight: 'steadying' }).text).toBe('scan.status.taking');
    });

    it('shows what the page reads only while no card is in view', () => {
        expect(cameraStatus({ ready: true, capturing: false, sight: 'none', notice: reading })).toBe(reading);
        expect(cameraStatus({ ready: true, capturing: false, sight: 'steadying', notice: reading }).text).toBe('scan.status.steadying');
    });

    it('puts what the page is busy with above everything else', () => {
        expect(cameraStatus({ ready: false, capturing: false, sight: 'none', notice: saving })).toBe(saving);
        expect(cameraStatus({ ready: true, capturing: true, sight: 'waiting', notice: saving })).toBe(saving);
    });
});
