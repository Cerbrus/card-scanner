import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';

import { LinePixels, LineText } from './text-lines';
import type { RecogniseAnswer, RecogniseRequest } from './text-recogniser.worker';

interface Waiting {
    resolve: (line?: LineText) => void;
    reject: (error: Error) => void;
}

@Injectable({ providedIn: 'root' })
export class TextRecogniser {
    private readonly document = inject(DOCUMENT);
    private readonly waiting = new Map<number, Waiting>();
    private worker?: Worker;
    private lastId = 0;

    public prepare(): Promise<void> {
        return this.ask().then(() => undefined);
    }

    public async recognise(line: LinePixels): Promise<LineText> {
        return (await this.ask(line)) ?? { text: '', confidence: 0 };
    }

    public stop(): void {
        this.worker?.terminate();
        this.worker = undefined;
        this.waiting.forEach(({ reject }) => reject(new Error('stopped')));
        this.waiting.clear();
    }

    private ask(line?: LinePixels): Promise<LineText | undefined> {
        const id = ++this.lastId;
        const request: RecogniseRequest = { id, files: new URL('ocr/', this.document.baseURI).href, line };

        return new Promise((resolve, reject) => {
            this.waiting.set(id, { resolve, reject });
            this.start().postMessage(request, line ? [line.data.buffer] : []);
        });
    }

    private start(): Worker {
        if (!this.worker) {
            this.worker = new Worker(new URL('./text-recogniser.worker', import.meta.url), { type: 'module' });
            this.worker.addEventListener('message', ({ data }: MessageEvent<RecogniseAnswer>) => this.answered(data));
            this.worker.addEventListener('error', () => this.stop());
        }

        return this.worker;
    }

    private answered({ id, line, failed }: RecogniseAnswer): void {
        const waiting = this.waiting.get(id);
        this.waiting.delete(id);
        if (failed) {
            waiting?.reject(new Error('not read'));
        } else {
            waiting?.resolve(line);
        }
    }
}
