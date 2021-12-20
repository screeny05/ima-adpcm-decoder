import 'regenerator-runtime/runtime';
import { init } from '../asm-facade';
import { AdpcmDecoder } from '..';

const bufferToCanvas = (el: HTMLCanvasElement, buffer: Float32Array): void => {
    const size = Math.ceil(Math.sqrt(buffer.length));
    const ctx = el.getContext('2d')!;
    el.width=size;
    el.height=size;

    buffer.forEach((v, i) => {
        const shade = v * 255;
        ctx.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
        ctx.fillRect(i % size, Math.floor(i / size), 1, 1);
    });
};

const decodeTest = async (ctx: AudioContext, wavBuffer: ArrayBuffer, decoder: AdpcmDecoder, decoderType: string) => {
    const start = performance.now();
    const buffer = await decoder.decodeImaAdpcm(ctx, wavBuffer, decoderType);
    console.log(decoderType, performance.now() - start);
    return buffer;
}

(async () => {
    const ctx = new AudioContext();

    const wavReq = await fetch('./WATER.WAV');
    const wavBuffer = await wavReq.arrayBuffer();

    const decoder = new AdpcmDecoder();

    let audioBufferJs: any = null;
    const iterations = 1;
    const start = performance.now();

    await init();

    const audioBufferWasm = await decodeTest(ctx, wavBuffer, decoder, 'wasm');
    audioBufferJs = await decodeTest(ctx, wavBuffer, decoder, 'js');
    const audioBufferJsWorker = await decodeTest(ctx, wavBuffer, decoder, 'js-worker');
    //for (let index = 0; index < iterations; index++) {
    //    audioBufferJs = await decodeTest(ctx, wavBuffer, decoder, 'js');
    //}
    //console.log('avg', (performance.now() - start) / iterations)
    //const audioBufferJsWorker = await decodeTest(ctx, wavBuffer, decoder, 'js-worker');

    //const wasmData = new Float32Array(audioBufferWasm.getChannelData(0));
    //const jsData = new Float32Array((await audioBufferJs).getChannelData(0));

    /*let diffCount = 0;
    wasmData.forEach((val, i) => {
        const diff = Math.abs(val - jsData[i]);
        const threshold = 0.00000000001;
        if(diff > threshold){
            diffCount++;
            //console.log('diff in', i, diff, '=>', val, jsData[i])
        }
    });

    console.log('total diffs', diffCount, `${Math.round(diffCount / jsData.length * 100)}%`);*/

    //bufferToCanvas(a, wasmData);
    //bufferToCanvas(c, jsData);

    const src = ctx.createBufferSource();
    src.buffer = audioBufferWasm;
    src.connect(ctx.destination);
    src.start(0);

    b.addEventListener('click', () => {src.start(); src.stop();});
})();
