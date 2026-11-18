export interface LineText {
    text: string;
    confidence: number;
}

export interface LinePixels {
    data: Uint8ClampedArray;
    width: number;
    height: number;
}

export const LINE_HEIGHT = 48;
export const MIN_LINE_WIDTH = 16;

const BLANK = 0;
const CHANNELS = 3;

export function characterList(dictionary: string): Array<string> {
    const lines = dictionary.replace(/\r/g, '').split('\n');
    if (lines.at(-1) === '') {
        lines.pop();
    }

    return ['', ...lines, ' '];
}

export function lineInput({ data, width, height }: LinePixels): Float32Array {
    const size = width * height;
    const input = new Float32Array(CHANNELS * size);
    for (let index = 0; index < size; index++) {
        for (let channel = 0; channel < CHANNELS; channel++) {
            input[channel * size + index] = data[index * 4 + (CHANNELS - 1 - channel)] / 127.5 - 1;
        }
    }

    return input;
}

export function decodeLine(scores: ArrayLike<number>, steps: number, classes: number, characters: Array<string>): LineText {
    let text = '';
    let previous = BLANK;
    let total = 0;
    let count = 0;
    for (let step = 0; step < steps; step++) {
        let best = BLANK;
        for (let index = 1; index < classes; index++) {
            if (scores[step * classes + index] > scores[step * classes + best]) {
                best = index;
            }
        }
        if (best !== BLANK && best !== previous) {
            text += characters[best] ?? '';
            total += scores[step * classes + best];
            count++;
        }
        previous = best;
    }

    return { text, confidence: count ? total / count : 0 };
}
