# ima-adpcm-decoder
> AudioContext Decoder for [ADPCM-Wavefiles](https://en.wikipedia.org/wiki/Adaptive_differential_pulse-code_modulation)

## Installation
```
npm install ima-adpcm-decoder
```

```
yarn add ima-adpcm-decoder
```

## Usage
```typescript
import { decodeImaAdpcm } from 'ima-adpcm-decoder';

const playAdpcm = async () => {
    const ctx = new AudioContext();

    const response = await fetch('./test.wav');
    const buffer = await response.arrayBuffer();
    const audioBuffer = decodeImaAdpcm(ctx, buffer);

    const src = ctx.createBufferSource();
    src.buffer = audioBuffer;
    src.connect(ctx.destination);
    src.start(0);
};
```

For streaming, the package also exposes the `decodeImaAdpcmBlock` function, which decodes a single block of ADPCM samples.

## Notes
As this uses the AudioContext directly, this currently only works in Browsers. A future implementation may use webasm to provide async decoding of ADPCM Buffers.

This code runs synchronously in the Browser, meaning it will block the event-loop until the decoding is finished. That may take some time depending on the size of your Wavefiles.

This package correctly handles multi-channel wavefiles.

## Do not use if...
* You need decoding of ADPCM files in nodejs
* You need async decoding
* You are not okay with the hefty dependency that is [wavefile](https://bundlephobia.com/result?p=wavefile@11.0.0)

## Dependencies (1)
* [wavefile](https://www.npmjs.com/package/wavefile) - used for parsing wavefiles

## Thanks
The code for decoding ADPCM-blocks is ported from [ADPCM-XQ](https://github.com/dbry/adpcm-xq/)

This code draws inspiration from [imaadpcm](https://github.com/rochars/imaadpcm/)

So thanks go to David Bryant and Rafael da Silva Rocha.
