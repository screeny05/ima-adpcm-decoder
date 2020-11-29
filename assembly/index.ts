export const Uint8Array_ID = idof<Uint8Array>();

// Declare heap with space for locals
export const heapBase = __heap_base + 0x1000;

const ERR_SANITY_CHECK = 'Something is wrong with your wav';

// Used for debugging
declare function log(str: string): void;

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

export function decode(channelCount: i32, blockSize: i32, sampleSize: i32): usize {
    const blockCount = floor(sampleSize / blockSize);
    const heapOutOffset = heapBase + sampleSize;
    const outbufByteSize = sampleSize * 2 / channelCount * 4;
    const chunksPerBlock = (blockSize - channelCount * 4) / (channelCount * 4);

    // This can be reworked once threading lands in wasm
    for (let i = 0; i < blockCount; i++) {
        const outbufOffset = (1 + (8 * chunksPerBlock)) * i;
        decodeBlock(i, blockSize, outbufOffset, channelCount, heapOutOffset, outbufByteSize);
    }
    return heapOutOffset;
}

@inline
function storeOutbuf(heapOutOffset: usize, outbufByteSize: i32, channel: i32, offset: i32, value: f32): void {
    store<f32>(heapOutOffset + (outbufByteSize * channel) + (offset * 4), value);
}

@inline
function loadInbuf(offset: usize): u8 {
    return atomic.load<u8>(heapBase + offset);
}

export function decodeBlock(blockCount: i32, blockSize: i32, outbufOffset: i32, channelCount: i32, heapOutOffset: usize, outbufByteSize: i32): void {
    const blockStart: i32 = blockCount * blockSize;
    const pcmData: i32[] = [0, 0];
    const index: i8[] = [0, 0];

    let inbufOffset: i32 = blockStart;

    for (let ch = 0; ch < channelCount; ch++) {
        pcmData[ch] = <i16>(<i16>loadInbuf(inbufOffset) | <i16>loadInbuf(inbufOffset + 1) << 8);
        storeOutbuf(heapOutOffset, outbufByteSize, ch, outbufOffset, <i16>pcmData[ch] / <f32>i16.MAX_VALUE);
        index[ch] = loadInbuf(inbufOffset + 2);

        if(index[ch] < 0 || index[ch] > 88 || loadInbuf(inbufOffset + 3) !== 0){
            throw new Error(ERR_SANITY_CHECK);
        }
        inbufOffset += 4;
    }
    outbufOffset++;

    let chunks = (blockSize - inbufOffset + blockStart) / (channelCount * 4);

    while(chunks--){
        for (let ch = 0; ch < channelCount; ch++) {
            for (let i = 0; i < 4; i++) {
                let step: i32 = STEP_TABLE[index[ch]];
                let delta: i32 = step >> 3;

                let data: i8 = loadInbuf(inbufOffset);
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
                storeOutbuf(heapOutOffset, outbufByteSize, ch, outbufOffset + (i * 2), <i16>pcmData[ch] / <f32>i16.MAX_VALUE);

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
                storeOutbuf(heapOutOffset, outbufByteSize, ch, outbufOffset + (i * 2 + 1), <i16>pcmData[ch] / <f32>i16.MAX_VALUE);

                inbufOffset++;
            }
        }

        outbufOffset += 8;
    }
}
