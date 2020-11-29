export const Uint8Array_ID = idof<Uint8Array>();

declare function log(str: string): void;
declare function perfStart(): void;
declare function perfEnd(): void;
declare function perfReset(): void;
declare function perfLog(): void;

const STEP_TABLE: i32[] = [
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

const INDEX_TABLE: i8[] = [
    -1, -1, -1, -1, 2, 4, 6, 8,
    -1, -1, -1, -1, 2, 4, 6, 8,
];

export function decode(inbuf: Uint8Array, channelCount: i32, blockSize: i32): Float32Array[] {
    const blockCount = <i32>Math.floor(inbuf.length / blockSize);
    let outbufOffset = 0;
    const outbufs: Float32Array[] = [];
    for (let ch = 0; ch < channelCount; ch++) {
        outbufs.push(new Float32Array(inbuf.length * 2 / channelCount));
    }
    for (let i = 0; i < blockCount; i++) {
        outbufOffset = decodeBlock(inbuf, i, blockSize, outbufs, outbufOffset);
    }
    perfLog();

    return outbufs;
}

export function decodeBlock(inbuf: Uint8Array, blockCount: i32, blockSize: i32, outbufs: Float32Array[], outbufOffset: i32): i32 {
    const blockStart: i32 = blockCount * blockSize;
    const channelCount: i32 = outbufs.length;
    const pcmData: i32[] = [0, 0];
    const index: i8[] = [0, 0];

    let inbufOffset: i32 = blockStart;

    for (let ch = 0; ch < outbufs.length; ch++) {
        pcmData[ch] = <i16>(<i16>inbuf[inbufOffset] | (<i16>inbuf[inbufOffset + 1] << 8));
        outbufs[ch][outbufOffset] = <i16>pcmData[ch] / <f32>i16.MAX_VALUE;
        index[ch] = inbuf[inbufOffset + 2];

        if(index[ch] < 0 || index[ch] > 88 || inbuf[inbufOffset + 3] !== 0){
            throw new Error('Something is wrong with your wav');
        }
        inbufOffset += 4;
    }
    outbufOffset++;

    let chunks = (blockSize - inbufOffset + blockStart) / (channelCount * 4);

    while(chunks--){
        for (let ch = 0; ch < channelCount; ch++) {
            for (let i = 0; i < 4; i++) {
                perfStart()
                let step: i32 = STEP_TABLE[index[ch]];
                let delta: i32 = step >> 3;

                let data: i8 = inbuf[inbufOffset];
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
                index[ch] = min(max(index[ch], 0), 88);
                pcmData[ch] = min(max(pcmData[ch], i16.MIN_VALUE), i16.MAX_VALUE);
                outbufs[ch][outbufOffset + (i * 2)] = <i16>pcmData[ch] / <f32>i16.MAX_VALUE;

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
                index[ch] = min(max(index[ch], 0), 88);
                pcmData[ch] = min(max(pcmData[ch], i16.MIN_VALUE), i16.MAX_VALUE);
                outbufs[ch][outbufOffset + (i * 2 + 1)] = <i16>pcmData[ch] / <f32>i16.MAX_VALUE;
                perfEnd()

                inbufOffset++;
            }
        }

        outbufOffset += 8;
    }

    return outbufOffset;
}
