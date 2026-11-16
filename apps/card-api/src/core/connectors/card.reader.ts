import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import { AppConfig } from '../../config/app.config';
import { CONDITIONS, CONFIDENCES, CardReading, FINISHES, LANGUAGES } from '../../data/entities/types';

const MAX_TOKENS = 16000;
const TIMEOUT_MILLISECONDS = 180000;
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

const ReadingSchema = z.object({
    isPokemonCard: z.boolean(),
    name: z.string().nullable(),
    number: z.string().nullable(),
    setName: z.string().nullable(),
    language: z.enum(LANGUAGES).nullable(),
    finish: z.enum(FINISHES),
    confidence: z.enum(CONFIDENCES),
    condition: z.enum(CONDITIONS).nullable(),
    conditionNotes: z.string()
});

const INSTRUCTIONS = `You are helping a collector catalogue Pokémon trading cards. You get two phone photos of one card: first the front, then the back. Your answer is matched against a card catalogue by software, and the collector confirms the match, so report what is printed on the card rather than what you expect it to be.

Fill in:
- isPokemonCard: false when the photos do not show a Pokémon trading card; then leave the other fields empty or at their plainest value.
- name: the card's name exactly as printed, in the language of the card.
- number: the collector number exactly as printed, usually at the bottom, such as "4/102", "025/165" or "SWSH123". null when the card has none or it cannot be read.
- setName: the English name of the set or expansion when you can tell it from the set symbol, the layout or the copyright line; null when you cannot tell.
- language: the language the card is printed in; null when it is not English, Dutch, German or French.
- finish: "holo" when the artwork itself is holographic foil, "reverse" when the area around the artwork is foil and the artwork is not, otherwise "normal". Foil is hard to see in a photo; choose "normal" when nothing shows it.
- confidence: how sure you are of name and number together.
- condition: the card's condition on Cardmarket's scale (mint, near_mint, excellent, good, light_played, played, poor), judged from both photos: whitening on edges and corners of the back, scratches on the surface and the foil, creases, bends, stains. null when the photos are too unclear to judge. A phone photo hides fine scratches, so do not grade higher than near_mint.
- conditionNotes: one or two short sentences naming the wear you saw and where, or what kept you from judging.`;

@Injectable()
export class CardReader {
    public readonly enabled: boolean;

    private readonly client?: Anthropic;

    constructor(private readonly config: AppConfig) {
        this.enabled = config.visionEnabled;
        this.client = this.enabled ? new Anthropic({ apiKey: config.anthropicApiKey, timeout: TIMEOUT_MILLISECONDS }) : undefined;
    }

    public async read(front: Buffer, back: Buffer): Promise<CardReading> {
        if (!this.client) {
            throw new Error('reading photos is switched off: ANTHROPIC_API_KEY is not set');
        }

        const message = await this.client.beta.messages.parse({
            model: this.config.visionModel,
            max_tokens: MAX_TOKENS,
            betas: [FALLBACK_BETA],
            fallbacks: 'default',
            system: INSTRUCTIONS,
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: 'Front of the card:' },
                        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: front.toString('base64') } },
                        { type: 'text', text: 'Back of the card:' },
                        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: back.toString('base64') } }
                    ]
                }
            ],
            output_config: { effort: 'medium', format: zodOutputFormat(ReadingSchema) }
        });

        if (message.stop_reason === 'refusal') {
            throw new Error(`the model declined to read the photos${message.stop_details?.explanation ? `: ${message.stop_details.explanation}` : ''}`);
        }
        if (!message.parsed_output) {
            throw new Error(`the model gave no usable answer (stop reason ${message.stop_reason})`);
        }

        return message.parsed_output as CardReading;
    }
}

export function describeReaderError(error: unknown): string {
    if (error instanceof Anthropic.AuthenticationError) {
        return 'the Anthropic API key was refused';
    }
    if (error instanceof Anthropic.RateLimitError) {
        return 'the Anthropic API is rate limiting, try again later';
    }
    if (error instanceof Anthropic.BadRequestError) {
        return `the Anthropic API refused the request: ${error.message}`;
    }
    if (error instanceof Anthropic.APIConnectionError) {
        return 'the Anthropic API could not be reached';
    }
    if (error instanceof Anthropic.APIError) {
        return `the Anthropic API answered ${error.status}: ${error.message}`;
    }

    return error instanceof Error ? error.message : String(error);
}
