import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import type { Worker as TextWorker } from 'tesseract.js';

import { CardText, LANGUAGE_REGION, NAME_LINES, NUMBER_CORNERS, NUMBER_REGION, NameReading, Region, TextWord, bestNumber, localThreshold, nameFromWords, readLanguage, readNumber } from './card-text';

const LINE_HEIGHT = 140;
const IDLE_MILLISECONDS = 180_000;
const SINGLE_LINE = '7';
const SPARSE_TEXT = '11';
const NUMBER_CHARACTERS = '0123456789/';
const LOCAL_WINDOW_SHARE = 0.5;
const LOCAL_DARKER = 0.15;

@Injectable({ providedIn: 'root' })
export class CardTextReader {
    private readonly document = inject(DOCUMENT);
    private worker?: Promise<TextWorker>;
    private idleTimer?: ReturnType<typeof setTimeout>;
    private queue: Promise<unknown> = Promise.resolve();

    public read(cardPhoto: Blob): Promise<CardText> {
        const reading = this.queue.then(() => this.readNow(cardPhoto));
        this.queue = reading.catch(() => undefined);

        return reading;
    }

    private async readNow(cardPhoto: Blob): Promise<CardText> {
        clearTimeout(this.idleTimer);
        try {
            const worker = await this.start();
            const card = await createImageBitmap(cardPhoto);
            try {
                const name = await this.readName(worker, card);
                const number = await this.readNumber(worker, card);
                await worker.setParameters({ tessedit_pageseg_mode: SPARSE_TEXT as never, tessedit_char_whitelist: '' });
                const language = readLanguage((await worker.recognize(this.strip(card, LANGUAGE_REGION))).data.text);

                return { name, number, language };
            } finally {
                card.close();
            }
        } finally {
            this.idleTimer = setTimeout(() => void this.stop(), IDLE_MILLISECONDS);
        }
    }

    private async readName(worker: TextWorker, card: ImageBitmap): Promise<string | undefined> {
        await worker.setParameters({ tessedit_pageseg_mode: SINGLE_LINE as never, tessedit_char_whitelist: '' });
        const readings: Array<NameReading> = [];
        for (const line of NAME_LINES) {
            const { data } = await worker.recognize(this.strip(card, line), {}, { text: true, blocks: true });
            const words = (data.blocks ?? []).flatMap((block) =>
                block.paragraphs.flatMap((paragraph) =>
                    paragraph.lines.flatMap((textLine) =>
                        textLine.words.map((word): TextWord => ({ text: word.text, left: word.bbox.x0, right: word.bbox.x1, top: word.bbox.y0, height: word.bbox.y1 - word.bbox.y0, confidence: word.confidence }))
                    )
                )
            );
            const reading = nameFromWords(words);
            if (reading) {
                readings.push(reading);
            }
        }

        return readings.sort((left, right) => right.confidence - left.confidence)[0]?.name;
    }

    private async readNumber(worker: TextWorker, card: ImageBitmap): Promise<string | undefined> {
        const readings: Array<string | undefined> = [];
        await worker.setParameters({ tessedit_pageseg_mode: SINGLE_LINE as never, tessedit_char_whitelist: NUMBER_CHARACTERS });
        for (const corner of NUMBER_CORNERS) {
            readings.push(readNumber((await worker.recognize(this.blackAndWhite(this.strip(card, corner)))).data.text));
        }

        await worker.setParameters({ tessedit_pageseg_mode: SPARSE_TEXT as never, tessedit_char_whitelist: '' });
        readings.push(readNumber((await worker.recognize(this.strip(card, NUMBER_REGION))).data.text));

        return bestNumber(readings);
    }

    private blackAndWhite(canvas: HTMLCanvasElement): HTMLCanvasElement {
        const context = canvas.getContext('2d') as CanvasRenderingContext2D;
        const image = context.getImageData(0, 0, canvas.width, canvas.height);
        localThreshold(image, Math.max(3, Math.round(canvas.height * LOCAL_WINDOW_SHARE)), LOCAL_DARKER);
        context.putImageData(image, 0, 0);

        return canvas;
    }

    private start(): Promise<TextWorker> {
        this.worker ??= import('tesseract.js').then((module) => {
            const { createWorker, OEM } = module.default ?? module;

            return createWorker('eng', OEM.LSTM_ONLY, {
                workerPath: this.address('ocr/worker.min.js'),
                corePath: this.address('ocr/core'),
                langPath: this.address('ocr/lang'),
                workerBlobURL: false,
                gzip: true
            });
        });
        this.worker.catch(() => (this.worker = undefined));

        return this.worker;
    }

    private async stop(): Promise<void> {
        const worker = this.worker;
        this.worker = undefined;
        await (await worker)?.terminate();
    }

    private strip(card: ImageBitmap, region: Region): HTMLCanvasElement {
        const width = card.width * region.width;
        const height = card.height * region.height;
        const scale = LINE_HEIGHT / height;
        const canvas = this.document.createElement('canvas');
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);
        const context = canvas.getContext('2d') as CanvasRenderingContext2D;
        context.filter = 'grayscale(1) contrast(1.4)';
        context.drawImage(card, card.width * region.left, card.height * region.top, width, height, 0, 0, canvas.width, canvas.height);

        return canvas;
    }

    private address(path: string): string {
        return new URL(path, this.document.baseURI).href;
    }
}
