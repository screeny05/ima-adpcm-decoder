import { decodeImaAdpcmBlock } from "./decoder"

onmessage = ({ data }) => {
    if(data.eventType === 'DECODE_BLOCKS'){
        for (let index = data.startIndex; index < data.endIndex; index++) {
            const samples: Uint8Array = data.adpcmSamples;
            const block = samples.subarray(index * data.blockSize, index * data.blockSize + data.blockSize);
            decodeImaAdpcmBlock(block, data.outbufs, data.outbufOffset * index);
        }

        self.postMessage({ eventType: 'DECODE_BLOCKS_DONE', startIndex: data.startIndex });
    }
}
