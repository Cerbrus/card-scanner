import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot } from '@angular/router';
import { Observable } from 'rxjs';

import { AuthService, redirectOnUnauthorized, requireLogin } from './auth.service';
import { AuthState } from '../models';
import { SettingsService } from './settings/settings.service';

type GuardResult = boolean | { redirect: string };

const owner: AuthState = { enabled: true, authenticated: true, owner: true, email: 'owner@example.com' };
const guest: AuthState = { enabled: true, authenticated: true, owner: false, email: 'guest@example.com' };
const anonymous: AuthState = { enabled: true, authenticated: false, owner: false };

describe('login in the web app', () => {
    let server: HttpTestingController;
    let http: HttpClient;
    const navigate = vi.fn();

    const run = (state: AuthState | 'unreachable'): GuardResult => {
        let result: GuardResult = false;
        const outcome = TestBed.runInInjectionContext(() => requireLogin({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot)) as Observable<GuardResult>;
        outcome.subscribe((value) => (result = value));

        const request = server.match('/api/v1/auth/me')[0];
        if (state === 'unreachable') {
            request?.error(new ProgressEvent('error'));
        } else {
            request?.flush(state);
        }

        return result;
    };

    beforeEach(() => {
        navigate.mockClear();
        TestBed.configureTestingModule({
            providers: [
                provideHttpClient(withInterceptors([redirectOnUnauthorized])),
                provideHttpClientTesting(),
                { provide: SettingsService, useValue: { getApiUrl: (): string => '/api' } },
                { provide: Router, useValue: { parseUrl: (redirect: string): GuardResult => ({ redirect }), navigateByUrl: navigate } }
            ]
        });
        server = TestBed.inject(HttpTestingController);
        http = TestBed.inject(HttpClient);
    });

    afterEach(() => vi.restoreAllMocks());

    it('lets a logged-in account in and sends anyone else to the login page', () => {
        expect(run(guest)).toBe(true);

        TestBed.inject(AuthService).state.set(undefined);

        expect(run(anonymous)).toEqual({ redirect: '/login' });
    });

    it('asks the server once, remembers the answer and knows who the owner is', () => {
        run(owner);
        run(owner);

        server.expectNone('/api/v1/auth/me');
        expect(TestBed.inject(AuthService).owner()).toBe(true);

        TestBed.inject(AuthService).state.set(guest);

        expect(TestBed.inject(AuthService).owner()).toBe(false);
    });

    it('lets the app start when the login state cannot be fetched, without owner rights', () => {
        expect(run('unreachable')).toBe(true);
        expect(TestBed.inject(AuthService).owner()).toBe(false);
    });

    it('goes to the login page when the server says the login ran out', () => {
        run(owner);

        http.get('/api/v1/cards').subscribe({ error: () => undefined });
        server.expectOne('/api/v1/cards').flush('', { status: 401, statusText: 'Unauthorized' });

        expect(navigate).toHaveBeenCalledWith('/login');
        expect(TestBed.inject(AuthService).state()?.authenticated).toBe(false);
    });

    it('does not redirect for other failures, or when nobody was logged in', () => {
        run(owner);
        http.get('/api/v1/cards').subscribe({ error: () => undefined });
        server.expectOne('/api/v1/cards').flush('', { status: 500, statusText: 'Error' });

        TestBed.inject(AuthService).state.set(anonymous);
        http.get('/api/v1/cards').subscribe({ error: () => undefined });
        server.expectOne('/api/v1/cards').flush('', { status: 401, statusText: 'Unauthorized' });

        expect(navigate).not.toHaveBeenCalled();
    });

    it('reloads on the login page after logging out', () => {
        const reload = vi.spyOn(window.location, 'reload').mockImplementation(() => undefined);

        TestBed.inject(AuthService).logout().subscribe();
        server.expectOne('/api/v1/auth/logout').flush(null);

        expect(window.location.hash).toBe('#/login');
        expect(reload).toHaveBeenCalledTimes(1);
    });
});
