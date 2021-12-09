import { WaveFile } from 'wavefile';
import loader, { ASUtil, ResultObject } from '@assemblyscript/loader';
import { decodeBlock } from './decoder';
import { decode } from './asm-facade';
import Bench from './bench';

const WAV_FORMAT_IMA = 17;

interface WavFmtSubchunk {
    chunkId: 'fmt ';
    chunkSize: number;
    audioFormat: number;
    bitsPerSample: number;
    blockAlign: number;
    byteRate: number;
    cbSize: number;
    dwChannelMask: number;
    numChannels: number;
    sampleRate: number;
    validBitsPerSample: number;
}

interface WavDataSubchunk {
    chunkId: 'data';
    chunkSize: number;
    samples: Uint8Array;
}

interface WavData {
    channelCount: number;
    samples: Uint8Array;
    blockSize: number;
    sampleRate: number
}

let perf = 0;
let perfCount = 0;
let perfAccum = 0;
const perfStart = () => {perf = performance.now();perfCount++;};
const perfEnd = () => perfAccum += performance.now() - perf;
const perfReset = () => {perf=0;perfCount=0;perfAccum=0;};
const perfLog = () => console.log('p', perfAccum/perfCount);

export class AdpcmDecoder {
    workers: Worker[];

    /**
     * Decode a buffer containing an ADPCM wavefile into a usable AudioBuffer
     *
     * @param ctx {AudioContext}
     * @param buffer {ArrayBuffer} input ADPCM file buffer
     */
    async decodeImaAdpcm(ctx: AudioContext, buffer: ArrayBuffer, decoder: 'js' | 'js-worker' | 'wasm' = 'js'): Promise<AudioBuffer> {
        const wav = this.extractWav(buffer);

        // ima = 2sample/byte
        const targetAudioBuffer = ctx.createBuffer(wav.channelCount, wav.samples.length * 2 / wav.channelCount, wav.sampleRate);
        const targetData = getChannelBuffers(targetAudioBuffer);

        if(decoder === 'js'){
            await this.decodeImaAdpcmJs(wav.samples, wav.blockSize, targetData);
        } else if (decoder === 'js-worker'){
            await this.decodeImaAdpcmJsWorker(wav.samples, wav.blockSize, targetData);
        } else {
            await this.decodeImaAdpcmWasm(wav.samples, wav.blockSize, targetData);
        }

        return targetAudioBuffer;
    }

    extractWav(buffer: ArrayBuffer): WavData {
        const wav = new WaveFile(new Uint8Array(buffer));

        const fmt = wav.fmt as WavFmtSubchunk;
        const data = wav.data as WavDataSubchunk;

        if(fmt.audioFormat !== WAV_FORMAT_IMA){
            throw new TypeError('Given wav buffer is not of format IMA ADPCM');
        }

        return {
            channelCount: fmt.numChannels,
            samples: data.samples,
            blockSize: fmt.blockAlign,
            sampleRate: fmt.sampleRate
        };
    }

    async decodeImaAdpcmWasm(adpcmSamples: Uint8Array, blockSize: number, outbufs: Float32Array[]): Promise<void> {
        await decode(adpcmSamples, blockSize, outbufs);
    }

    async decodeImaAdpcmJsWorker(adpcmSamples: Uint8Array, blockSize: number, outbufs: Float32Array[]): Promise<void> {
        const workerCount = Math.min(4, navigator.hardwareConcurrency);
        const workers = new Array(workerCount).fill(0).map(() => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }));

        const sharedBuffer = new SharedArrayBuffer(adpcmSamples.length);
        const sharedSamples = new Uint8Array(sharedBuffer);
        sharedSamples.set(adpcmSamples);

        const sharedChannels = outbufs.map(channel => {
            const sharedBuffer = new SharedArrayBuffer(channel.byteLength);
            return new Float32Array(sharedBuffer);
        });

        const channelCount = outbufs.length;
        const chunksPerBlock = (blockSize - channelCount * 4) / (channelCount * 4);
        const outbufOffset = (1 + (8 * chunksPerBlock));

        const decodeBlock = async (worker: Worker, startIndex: number, endIndex: number) => new Promise<void>(resolve => {
            worker.postMessage({
                eventType: 'DECODE_BLOCKS',
                startIndex,
                endIndex,
                outbufOffset,
                blockSize,
                adpcmSamples: sharedSamples,
                outbufs: sharedChannels,
            });

            const listener = ({ data }) => {
                if(data.eventType === 'DECODE_BLOCKS_DONE' && data.startIndex === startIndex){
                    worker.removeEventListener('message', listener);
                    resolve()
                }
            };
            worker.addEventListener('message', listener);
        });

        const queue: Promise<void>[] = [];

        const blockCount = Math.floor(adpcmSamples.length / blockSize);
        const blocksPerWorker = Math.ceil(blockCount / workers.length);

        const start = performance.now();
        workers.forEach((worker, i) => {
            queue.push(decodeBlock(worker, blocksPerWorker * i, Math.min(blocksPerWorker * i + blocksPerWorker, blockCount)));
        });

        await Promise.all(queue);
        console.log(performance.now() - start);

        // Copy channel data
        outbufs.forEach((outbuf, ch) => outbuf.set(sharedChannels[ch]));
    }

    decodeImaAdpcmJs(adpcmSamples: Uint8Array, blockSize: number, outbufs: Float32Array[]): void {
        const imaBlocks = chunkArrayBufferView(adpcmSamples, blockSize);
        let outbufOffset = 0;
        const bench = new Bench();
        bench.tick('block-js');
        imaBlocks.forEach((block, i) => {
            outbufOffset = decodeBlock(block, outbufs, outbufOffset);
        });
        bench.tockCount('block-js', imaBlocks.length);
        bench.tockAvg('block-js');
    }
}

/**
 * Extract PCM buffers from AudioBuffer
 *
 * @param buffer
 */
const getChannelBuffers = (buffer: AudioBuffer): Float32Array[] => {
    const buffers: Float32Array[] = [];
    for (let i = 0; i < buffer.numberOfChannels; i++) {
        buffers.push(buffer.getChannelData(i));
    }
    return buffers;
};

/**
 * Used to extract ADPCM blocks into multiple Uint8Arrays without copying
 *
 * @param data {Uint8Array}
 * @param chunkSize {number}
 */
const chunkArrayBufferView = (data: Uint8Array, chunkSize: number): Uint8Array[] => {
    const chunks: Uint8Array[] = [];

    const chunksCount = Math.ceil(data.length / chunkSize);
    for (let index = 0; index < chunksCount; index++) {
        chunks.push(data.subarray(index * chunkSize, index * chunkSize + chunkSize));
    }

    return chunks;
}
