import { WaveFile } from 'wavefile';
import { uint8ToInt16, int16ToFloat, clamp, clampInt16 } from './math';
import loader, { ASUtil, ResultObject } from '@assemblyscript/loader';

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

const STEP_TABLE: number[] = [
    7, 8, 9, 10, 11, 12, 13, 14, 16, 17,
    19, 21, 23, 25, 28, 31, 34, 37, 41, 45,
    50, 55, 60, 66, 73, 80, 88, 97, 107, 118,
    130, 143, 157, 173, 190, 209, 230, 253, 279, 307,
    337, 371, 408, 449, 494, 544, 598, 658, 724, 796,
    876, 963, 1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066,
    2272, 2499, 2749, 3024, 3327, 3660, 4026, 4428, 4871, 5358,
    5894, 6484, 7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899,
    15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767
];

const INDEX_TABLE: number[] = [
    -1, -1, -1, -1, 2, 4, 6, 8,
    -1, -1, -1, -1, 2, 4, 6, 8,
];

declare type WasmExports = {
    Uint8Array_ID: number,
    decode(inbufPtr: number, channelCount: number, blockSize: number): number;
    decodeBlock(inbufPtr: number, blockCount: number, blockSize: number, outbufsPtr: number, outbufOffset: number): number;
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
    wasm: ResultObject & { exports: ASUtil & WasmExports };

    async initWasm(){
        const asmReq = await fetch('./untouched.wasm');
        const asmBuffer = await asmReq.arrayBuffer();

        let perf = 0;
        this.wasm = await loader.instantiate<WasmExports>(asmBuffer, {
            index: {
                log: (stringPtr: number) => console.log(__getString(stringPtr)),
                perfStart,
                perfEnd,
                perfReset,
                perfLog
            }
        });

        const { __getString } = this.wasm.exports;
    }

    /**
     * Decode a buffer containing an ADPCM wavefile into a usable AudioBuffer
     *
     * @param ctx {AudioContext}
     * @param buffer {ArrayBuffer} input ADPCM file buffer
     */
    decodeImaAdpcm(ctx: AudioContext, buffer: ArrayBuffer, preferJsDecoder: boolean = false): AudioBuffer {
        const wav = this.extractWav(buffer);

        // ima = 2sample/byte
        const targetAudioBuffer = ctx.createBuffer(wav.channelCount, wav.samples.length * 2 / wav.channelCount, wav.sampleRate);
        const targetData = getChannelBuffers(targetAudioBuffer);

        if(preferJsDecoder || !this.wasm){
            this.decodeImaAdpcmJs(wav.samples, wav.blockSize, targetData);
        } else {
            this.decodeImaAdpcmWasm(wav.samples, wav.blockSize, targetData);
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

    decodeImaAdpcmWasm(adpcmSamples: Uint8Array, blockSize: number, outbufs: Float32Array[]): void {
        if(!this.wasm){
            throw new Error('Wasm not initialized');
        }

        const { __retain, __release, __newArray, __getArray, __getArrayView } = this.wasm.exports;

        const start1 = performance.now();
        const arrayPtr = __retain(__newArray(this.wasm.exports.Uint8Array_ID, adpcmSamples));
        //console.log('js->native', performance.now() - start1);
        const start2 = performance.now();
        const resultPtr = this.wasm.exports.decode(arrayPtr, outbufs.length, blockSize);
        //console.log('decode', performance.now() - start2);

        const start3 = performance.now();
        __getArray(resultPtr).map((ptr, channel) => {
            const data = __getArrayView(ptr) as Float32Array;
            outbufs[channel].set(data);
        });
        __release(arrayPtr);
        //console.log('native->js', performance.now() - start3)
    }

    decodeImaAdpcmJs(adpcmSamples: Uint8Array, blockSize: number, outbufs: Float32Array[]): void {
        const imaBlocks = chunkArrayBufferView(adpcmSamples, blockSize);
        let outbufOffset = 0;
perfReset()
        imaBlocks.forEach((block, i) => {
            outbufOffset = decodeImaAdpcmBlock(block, outbufs, outbufOffset, i * blockSize);
        });
perfLog();
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
 * Decodes a block of ADPCM data into PCM samples.
 *
 * Based on ADPXM-XQ
 * https://github.com/dbry/adpcm-xq/blob/37359e6f612fef2e82a7904119415edaed2407e0/adpcm-lib.c#L334
 *
 * @param inbuf {Uint8Array} block data
 * @param outbufs {Float32Array[]} output buffer for decoded PCM samples
 * @param outbufOffset {number} offset at which to add samples
 */
export const decodeImaAdpcmBlock = (inbuf: Uint8Array, outbufs: Float32Array[], outbufOffset: number, chunkOffset: number): number => {
    const channels = outbufs.length;

    let inbufOffset = 0;
    let pcmData: number[] = new Array(channels).fill(0);
    let index: number[] = new Array(channels).fill(0);

    outbufs.forEach((_, ch) => {
        pcmData[ch] = uint8ToInt16(inbuf[inbufOffset], inbuf[inbufOffset + 1]);
        outbufs[ch][outbufOffset] = int16ToFloat(pcmData[ch]);
        index[ch] = inbuf[inbufOffset + 2];

        if(index[ch] < 0 || index[ch] > 88 || inbuf[inbufOffset + 3]){
            throw new Error('Something is wrong with your wav');
        }

        inbufOffset += 4;
    });
    outbufOffset++;

    let chunks = (inbuf.length - inbufOffset) / (channels * 4);

    while(chunks--){
        for (let ch = 0; ch < channels; ch++) {
            for (let i = 0; i < 4; i++) {
                perfStart()
                let step = STEP_TABLE[index[ch]];
                let delta = step >> 3;

                let data = inbuf[inbufOffset];
                if(data & 1){
                    delta += (step >> 2);
                }
                if(data & 2){
                    delta += (step >> 1);
                }
                if(data & 4){
                    delta += step;
                }
                if(data & 8){
                    delta = -delta;
                }
                pcmData[ch] += delta;
                index[ch] += INDEX_TABLE[data & 0x7];
                index[ch] = clamp(index[ch], 0, 88);
                pcmData[ch] = clampInt16(pcmData[ch]);
                outbufs[ch][outbufOffset + (i * 2)] = int16ToFloat(pcmData[ch]);

                // Sample 2
                step = STEP_TABLE[index[ch]];
                delta = step >> 3;

                if(data & 0x10){
                    delta += (step >> 2);
                }
                if(data & 0x20){
                    delta += (step >> 1);
                }
                if(data & 0x40){
                    delta += step;
                }
                if(data & 0x80){
                    delta = -delta;
                }

                pcmData[ch] += delta;
                index[ch] += INDEX_TABLE[(data >> 4) & 0x7];
                index[ch] = clamp(index[ch], 0, 88);
                pcmData[ch] = clampInt16(pcmData[ch]);
                outbufs[ch][outbufOffset + (i * 2 + 1)] = int16ToFloat(pcmData[ch]);
                perfEnd()

                inbufOffset++;
            }
        }

        outbufOffset += 8;
    }

    return outbufOffset;
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
        chunks.push(data.slice(index * chunkSize, index * chunkSize + chunkSize));
    }

    return chunks;
}
