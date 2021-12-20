import loader, { ASUtil, ResultObject } from '@assemblyscript/loader';
import Bench from './bench';

declare type WasmExports = {
    Uint8Array_ID: number,
    decode(inbufPtr: number, channelCount: number, blockSize: number): number;
    decodeBlock(inbufPtr: number, blockCount: number, blockSize: number, outbufsPtr: number, outbufOffset: number): number;
}

let wasm: ResultObject & { exports: ASUtil & WasmExports }|null = null;

export async function init(): Promise<void> {
    if(wasm){
        return;
    }

    const asmReq = await fetch('./optimized.wasm');
    const asmBuffer = await asmReq.arrayBuffer();

    const bench = new Bench();

    wasm = await loader.instantiate<WasmExports>(asmBuffer, {
        index: {
            log: (strPtr: number) => console.log(__getString(strPtr)),
            tick: (strPtr: number) => bench.tick(__getString(strPtr)),
            tock: (strPtr: number) => bench.tock(__getString(strPtr)),
            tockPrint: (strPtr: number) => bench.tockPrint(__getString(strPtr)),
            tockAvg: (strPtr: number) => bench.tockAvg(__getString(strPtr)),
            tockCount: (strPtr: number, count: number) => bench.tockCount(__getString(strPtr), count),
        }
    });

    const __getString = wasm!.exports.__getString;
}

export async function decode(samples: Uint8Array, blockSize: number, outbufs: Float32Array[]): Promise<void> {
    if(!wasm){ await init(); }
    if(!wasm){ throw new Error('Wasm not initialized'); }

    const { __newArray, __getArray, __getArrayView, __collect, Uint8Array_ID, __newArrayBuffer } = wasm.exports;
    const { decode } = wasm.exports;

    const arrayPtr = __newArrayBuffer(samples.buffer);
    const resultPtr = decode(arrayPtr, outbufs.length, blockSize);

    __getArray(resultPtr).map((ptr, channel) => {
        const data = __getArrayView(ptr) as Float32Array;
        outbufs[channel].set(data);
    });
    __collect();
}
