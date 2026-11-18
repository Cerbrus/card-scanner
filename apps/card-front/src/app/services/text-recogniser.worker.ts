/// <reference lib="webworker" />
import { InferenceSession, Tensor, env } from 'onnxruntime-web/wasm';

import { LinePixels, LineText, characterList, decodeLine, lineInput } from './text-lines';

export interface RecogniseRequest {
    id: number;
    files: string;
    line?: LinePixels;
}

export interface RecogniseAnswer {
    id: number;
    line?: LineText;
    failed?: boolean;
}

interface Model {
    session: InferenceSession;
    characters: Array<string>;
}

let model: Promise<Model> | undefined;

function load(files: string): Promise<Model> {
    env.wasm.wasmPaths = { wasm: `${files}ort-wasm-simd-threaded.wasm` };
    env.wasm.numThreads = 1;
    model ??= Promise.all([InferenceSession.create(`${files}latin-rec.onnx`, { executionProviders: ['wasm'] }), fetch(`${files}latin-dict.txt`).then((response) => response.text())]).then(
        ([session, dictionary]) => ({ session, characters: characterList(dictionary) })
    );
    model.catch(() => (model = undefined));

    return model;
}

async function recognise(files: string, line?: LinePixels): Promise<LineText | undefined> {
    const { session, characters } = await load(files);
    if (!line) {
        return undefined;
    }

    const input = new Tensor('float32', lineInput(line), [1, 3, line.height, line.width]);
    const output = (await session.run({ [session.inputNames[0]]: input }))[session.outputNames[0]];
    const [, steps, classes] = output.dims;

    return decodeLine(output.data as Float32Array, steps, classes, characters);
}

addEventListener('message', ({ data }: MessageEvent<RecogniseRequest>) => {
    recognise(data.files, data.line)
        .then((line) => postMessage({ id: data.id, line } satisfies RecogniseAnswer))
        .catch(() => postMessage({ id: data.id, failed: true } satisfies RecogniseAnswer));
});
