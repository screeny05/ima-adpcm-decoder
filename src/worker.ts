import loader, { ASUtil, ResultObject } from '@assemblyscript/loader';

let wasm;

onmessage = async ({ data }) => {
    const { eventType } = data;

    if(eventType === 'INITIALISE'){
        const asmRes = await fetch('./untouched.wasm');
        wasm = await loader.instantiateStreaming(asmRes, {
            index: {
                log: (stringPtr: number) => console.log(__getString(stringPtr)),
            },
            env: {
                memory: data.memory
            }
        });
        const { __getString } = wasm.exports;
        console.log(wasm.exports)
        self.postMessage({ eventType: 'INITIALISE_DONE', heapBase: wasm.exports.heapBase.value });
    }

    if(eventType === 'DECODE_BLOCK'){
        const heapOutOffset = wasm.exports.heapBase.value + data.sampleSize;
        wasm.exports.decodeBlock(data.blockCount, data.blockSize, data.outbufOffset, data.channelCount, heapOutOffset, data.outbufByteSize);
        self.postMessage({ eventType: 'DECODE_BLOCK_DONE', blockCount: data.blockCount });
    }
};
