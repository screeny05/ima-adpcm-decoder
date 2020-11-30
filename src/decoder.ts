import { uint8ToInt16, int16ToFloat, clamp, clampInt16 } from './math';

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
export const decodeImaAdpcmBlock = (inbuf: Uint8Array, outbufs: Float32Array[], outbufOffset: number): number => {
    const channels = outbufs.length;

    let inbufOffset = 0;
    let pcmData = new Array<number>(channels).fill(0);
    let index = new Array<number>(channels).fill(0);

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

                inbufOffset++;
            }
        }

        outbufOffset += 8;
    }

    return outbufOffset;
};
