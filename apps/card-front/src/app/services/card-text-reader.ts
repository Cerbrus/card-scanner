import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';

import { CardText, LANGUAGE_REGION, NAME_LINES, NUMBER_LINES, NameReading, Region, bestName, nameSettled, readLanguage, readName, readNumber } from './card-text';
import { LINE_HEIGHT, LinePixels, MIN_LINE_WIDTH } from './text-lines';
import { TextRecogniser } from './text-recogniser';

const IDLE_MILLISECONDS = 180_000;

@Injectable({ providedIn: 'root' })
export class CardTextReader {
    private readonly document = inject(DOCUMENT);
    private readonly recogniser = inject(TextRecogniser);
    private idleTimer?: ReturnType<typeof setTimeout>;
    private queue: Promise<unknown> = Promise.resolve();

    public prepare(): void {
        this.rest();
        void this.recogniser.prepare().catch(() => undefined);
    }

    public read(cardPhoto: Blob): Promise<CardText> {
        const reading = this.queue.then(() => this.readNow(cardPhoto));
        this.queue = reading.catch(() => undefined);

        return reading;
    }

    private async readNow(cardPhoto: Blob): Promise<CardText> {
        clearTimeout(this.idleTimer);
        try {
            const card = await createImageBitmap(cardPhoto);
            try {
                const name = await this.readName(card);
                const number = await this.readNumber(card);
                const language = readLanguage((await this.recogniser.recognise(this.line(card, LANGUAGE_REGION))).text);

                return { name, number, language };
            } finally {
                card.close();
            }
        } finally {
            this.rest();
        }
    }

    private async readName(card: ImageBitmap): Promise<string | undefined> {
        const readings: Array<NameReading> = [];
        for (const region of NAME_LINES) {
            const { text, confidence } = await this.recogniser.recognise(this.line(card, region));
            const name = readName(text);
            if (name) {
                readings.push({ name, confidence });
            }
            if (name && nameSettled(readings)) {
                break;
            }
        }

        return bestName(readings);
    }

    private async readNumber(card: ImageBitmap): Promise<string | undefined> {
        for (const region of NUMBER_LINES) {
            const number = readNumber((await this.recogniser.recognise(this.line(card, region))).text);
            if (number) {
                return number;
            }
        }

        return undefined;
    }

    private rest(): void {
        clearTimeout(this.idleTimer);
        this.idleTimer = setTimeout(() => this.recogniser.stop(), IDLE_MILLISECONDS);
    }

    private line(card: ImageBitmap, region: Region): LinePixels {
        const width = card.width * region.width;
        const height = card.height * region.height;
        const canvas = this.document.createElement('canvas');
        canvas.width = Math.max(MIN_LINE_WIDTH, Math.round((width / height) * LINE_HEIGHT));
        canvas.height = LINE_HEIGHT;
        const context = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
        context.drawImage(card, card.width * region.left, card.height * region.top, width, height, 0, 0, canvas.width, canvas.height);
        const { data } = context.getImageData(0, 0, canvas.width, canvas.height);

        return { data, width: canvas.width, height: canvas.height };
    }
}
