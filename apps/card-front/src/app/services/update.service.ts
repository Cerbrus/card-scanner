import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { EMPTY, Observable, catchError, filter, from, fromEvent, interval, map, merge, switchMap, tap } from 'rxjs';

const FILE_LIST_URL = 'app-files.json';
const RELOADED_FOR_KEY = 'reloaded-for';
const VERSIONED_FILE = /-[A-Z0-9]{8}\.(?:js|css)$/;
const ENTRY_FILES = 'script[src], link[rel="stylesheet"][href]';
const BUSY_FIELD = 'input:not([type=file]):not([type=checkbox]), textarea, select';
const BUSY_PARTS = 'app-crop-editor, app-photo-viewer, dialog[open]';
const SCAN_ROUTE = '#/scan';
const CHECK_EVERY_MILLISECONDS = 60_000;

function reloadedFor(): string | null {
    try {
        return sessionStorage.getItem(RELOADED_FOR_KEY);
    } catch {
        return null;
    }
}

function rememberReload(signature: string): boolean {
    try {
        sessionStorage.setItem(RELOADED_FOR_KEY, signature);

        return true;
    } catch {
        return false;
    }
}

@Injectable({ providedIn: 'root' })
export class UpdateService {
    private readonly router = inject(Router);
    private readonly document = inject(DOCUMENT);
    private waitingFor?: string;
    private started = false;

    public start(): void {
        if (this.started) {
            return;
        }
        this.started = true;

        const visible = (): boolean => this.document.visibilityState === 'visible';
        const pageChanged = this.router.events.pipe(filter((event) => event instanceof NavigationEnd && this.waitingFor !== undefined));

        merge(fromEvent(this.document, 'visibilitychange').pipe(filter(visible)), interval(CHECK_EVERY_MILLISECONDS).pipe(filter(visible)), pageChanged)
            .pipe(
                switchMap(() => this.publishedFiles()),
                tap((published) => this.reloadWhenOutdated(published))
            )
            .subscribe();
    }

    private reloadWhenOutdated(published: Array<string>): void {
        const loaded = this.loadedFiles();
        if (!published.length || !loaded.length || loaded.every((file) => published.includes(file))) {
            this.waitingFor = undefined;
            return;
        }

        const signature = [...published].sort().join();
        if (reloadedFor() === signature) {
            console.warn('A newer version is published, but reloading did not load it.');
            return;
        }
        if (this.busy()) {
            this.waitingFor = signature;
            return;
        }

        if (rememberReload(signature)) {
            this.document.location.reload();
        }
    }

    private publishedFiles(): Observable<Array<string>> {
        return from(fetch(FILE_LIST_URL, { cache: 'no-store' }).then((response) => (response.ok ? response.json() : []))).pipe(
            map((files: unknown) => (Array.isArray(files) ? files.filter((file): file is string => typeof file === 'string') : [])),
            catchError(() => EMPTY)
        );
    }

    private loadedFiles(): Array<string> {
        const origin = this.document.location.origin;

        return Array.from(this.document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>(ENTRY_FILES))
            .map((element) => new URL(element instanceof HTMLScriptElement ? element.src : element.href, origin))
            .filter((url) => url.origin === origin && VERSIONED_FILE.test(url.pathname))
            .map((url) => url.pathname.split('/').pop() as string);
    }

    private busy(): boolean {
        return (
            this.document.activeElement?.matches(BUSY_FIELD) === true ||
            this.document.querySelector(BUSY_PARTS) !== null ||
            this.document.location.hash.startsWith(SCAN_ROUTE)
        );
    }
}
