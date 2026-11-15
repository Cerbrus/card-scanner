import { TestBed } from '@angular/core/testing';
import { NavigationEnd, Router } from '@angular/router';
import { Subject } from 'rxjs';

import { UpdateService } from './update.service';

const LOADED = 'main-AAAAAAAA.js';
const NEWER = 'main-BBBBBBBB.js';

describe('UpdateService', () => {
    let routerEvents$: Subject<unknown>;
    let reload: ReturnType<typeof vi.fn>;
    let published: Array<string> | undefined;

    const settle = async (): Promise<void> => {
        for (let round = 0; round < 5; round++) {
            await Promise.resolve();
        }
    };
    const comeBack = async (): Promise<void> => {
        document.dispatchEvent(new Event('visibilitychange'));
        await settle();
    };

    beforeEach(() => {
        published = [NEWER, 'styles-CCCCCCCC.css'];
        routerEvents$ = new Subject<unknown>();
        reload = vi.fn();
        Object.defineProperty(document, 'location', { configurable: true, value: { origin: 'http://localhost', hash: '#/collection', reload } });
        sessionStorage.clear();
        document.head.innerHTML = `<script src="http://localhost/${LOADED}"></script>`;
        document.body.innerHTML = '';
        vi.stubGlobal('fetch', vi.fn(() => (published ? Promise.resolve({ ok: true, json: () => Promise.resolve(published) }) : Promise.reject(new Error('offline')))));

        TestBed.configureTestingModule({ providers: [{ provide: Router, useValue: { events: routerEvents$ } }] });
        TestBed.inject(UpdateService).start();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        Reflect.deleteProperty(document, 'location');
    });

    it('reloads when the app comes back and a newer version is published', async () => {
        await comeBack();

        expect(fetch).toHaveBeenCalledWith('app-files.json', { cache: 'no-store' });
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it('stays when the loaded files are still the published ones, or the list cannot be fetched', async () => {
        published = [LOADED, 'styles-CCCCCCCC.css'];
        await comeBack();
        published = undefined;
        await comeBack();

        expect(reload).not.toHaveBeenCalled();
    });

    it('waits while the owner is cropping a photo, and reloads on the next page change', async () => {
        document.body.innerHTML = '<app-crop-editor></app-crop-editor>';
        await comeBack();
        expect(reload).not.toHaveBeenCalled();

        document.body.innerHTML = '';
        routerEvents$.next(new NavigationEnd(1, '/collection', '/collection'));
        await settle();
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it('does not reload in a loop when the reload did not bring the new files', async () => {
        await comeBack();
        await comeBack();

        expect(reload).toHaveBeenCalledTimes(1);
    });
});
