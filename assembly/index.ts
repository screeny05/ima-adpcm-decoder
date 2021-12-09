export const Uint8Array_ID = idof<Uint8Array>();

declare function log(str: string): void;
declare function tick(str: string): void;
declare function tock(str: string): void;
declare function tockPrint(str: string): void;
declare function tockAvg(str: string): void;
declare function tockCount(str: string, count: number): void;

const STEP_TABLE: StaticArray<i32> = StaticArray.fromArray<i32>([
    7, 8, 9, 10, 11, 12, 13, 14, 16, 17,
    19, 21, 23, 25, 28, 31, 34, 37, 41, 45,
    50, 55, 60, 66, 73, 80, 88, 97, 107, 118,
    130, 143, 157, 173, 190, 209, 230, 253, 279, 307,
    337, 371, 408, 449, 494, 544, 598, 658, 724, 796,
    876, 963, 1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066,
    2272, 2499, 2749, 3024, 3327, 3660, 4026, 4428, 4871, 5358,
    5894, 6484, 7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899,
    15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767
]);

const INDEX_TABLE: StaticArray<i8> = StaticArray.fromArray<i8>([
    -1, -1, -1, -1, 2, 4, 6, 8,
    -1, -1, -1, -1, 2, 4, 6, 8,
]);

export function decode(inbuf: Uint8Array, channelCount: i32, blockSize: i32): StaticArray<f32>[] {
    const blockCount = <i32>Math.floor(inbuf.length / blockSize);
    let outbufOffset = 0;
    const outbufs: StaticArray<f32>[] = [];
    const pcmData: StaticArray<i32> = new StaticArray<i32>(channelCount);
    const index: StaticArray<i8> = new StaticArray<i8>(channelCount);

    for (let ch = 0; ch < channelCount; ch++) {
        outbufs.push(new StaticArray<f32>(inbuf.length * 2 / channelCount));
    }

    tick('block-asm');
    for (let i = 0; i < blockCount; i++) {
        pcmData.fill(0);
        index.fill(0);
        outbufOffset = decodeBlock(inbuf, i, blockSize, outbufs, outbufOffset, pcmData, index);
    }
    tockCount('block-asm', blockCount);
    tockAvg('block-asm');

    return outbufs;
}

export function decodeBlock(
    inbuf: Uint8Array,
    blockCount: i32,
    blockSize: i32,
    outbufs: StaticArray<f32>[],
    outbufOffset: i32,
    pcmData: StaticArray<i32>,
    index: StaticArray<i8>,
): i32 {
    const blockStart: i32 = blockCount * blockSize;
    const channelCount: i32 = outbufs.length;

    let inbufOffset: i32 = blockStart;

    for (let ch = 0; ch < outbufs.length; ch++) {
        const pcmValueLow = <i16>unchecked(inbuf[inbufOffset]);
        const pcmValueHigh = <i16>unchecked(inbuf[inbufOffset + 1]);
        const pcmValue: i16 = <i16>(pcmValueLow | (pcmValueHigh << 8));
        const indexValue: i8 = unchecked(inbuf[inbufOffset + 2]);
        unchecked(pcmData[ch] = pcmValue);
        unchecked(outbufs[ch][outbufOffset] = <i16><i32>pcmValue / <f32>i16.MAX_VALUE);
        unchecked(index[ch] = indexValue);

        if(indexValue < 0 || indexValue > 88 || unchecked(inbuf[inbufOffset + 3]) !== 0){
            throw new Error('Something is wrong with your wav');
        }
        inbufOffset += 4;
    }
    outbufOffset++;

    let chunks = (blockSize - inbufOffset + blockStart) / (channelCount * 4);

    while(chunks--){
        for (let ch = 0; ch < channelCount; ch++) {
            for (let i = 0; i < 4; i++) {
                // Sample 1
                let step: i32 = unchecked(STEP_TABLE[index[ch]]);
                let delta: i32 = step >> 3;

                let data: i8 = unchecked(inbuf[inbufOffset]);
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
                unchecked(pcmData[ch] += delta);
                unchecked(index[ch] += unchecked(INDEX_TABLE[data & 0x7]));
                unchecked(index[ch] = min(max(unchecked(index[ch]), 0), 88));
                unchecked(pcmData[ch] = min(max(unchecked(pcmData[ch]), i16.MIN_VALUE), i16.MAX_VALUE));
                unchecked(outbufs[ch][outbufOffset + (i * 2)] = <i16>unchecked(pcmData[ch]) / <f32>i16.MAX_VALUE);

                // Sample 2
                step = unchecked(STEP_TABLE[index[ch]]);
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

                unchecked(pcmData[ch] += delta);
                unchecked(index[ch] += unchecked(INDEX_TABLE[(data >> 4) & 0x7]));
                unchecked(index[ch] = min(max(unchecked(index[ch]), 0), 88));
                unchecked(pcmData[ch] = min(max(unchecked(pcmData[ch]), i16.MIN_VALUE), i16.MAX_VALUE));
                unchecked(outbufs[ch][outbufOffset + (i * 2 + 1)] = <i16>unchecked(pcmData[ch]) / <f32>i16.MAX_VALUE);

                inbufOffset++;
            }
        }

        outbufOffset += 8;
    }

    return outbufOffset;
}
